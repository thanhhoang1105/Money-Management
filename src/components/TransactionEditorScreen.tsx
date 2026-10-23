// src/components/TransactionEditorScreen.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Transaction, TransactionType, Category, Wallet, EventTrip } from '../types';
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  adjustWalletBalance
} from '../services/transactionService';
import { CategoryIcon } from './CategoryIcon';
import { CategoryManagerScreen } from './CategoryManagerScreen';
import { NumpadBottomSheet } from './NumpadBottomSheet';
import { DatePicker } from './ui/DatePicker';
import { WalletSelect } from './ui/WalletSelect';
import { formatVND, getCurrentDate, getCurrentTime } from '../utils/formatters';
import {
  ArrowLeft,
  Check,
  Trash2,
  Plus,
  ArrowRightLeft,
  SlidersHorizontal,
  HandCoins,
  Receipt,
  PiggyBank,
  CreditCard,
  FolderTree,
  ChevronRight,
  Calculator,
  X,
  Star,
  UserCheck,
  Plane,
  EyeOff,
  PlusCircle
} from 'lucide-react';

const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_WALLETS: Wallet[] = [];
const EMPTY_TRANSACTIONS: Transaction[] = [];
const EMPTY_EVENTS: EventTrip[] = [];

interface TransactionEditorScreenProps {
  isOpen: boolean;
  onClose: () => void;
  editingTransaction?: Transaction | null;
}

/**
 * Tính toán an toàn giá trị biểu thức toán học (+, -, *, /).
 */
function evaluateExpression(rawExpr: string): number {
  if (!rawExpr || rawExpr === '0') return 0;
  const cleaned = rawExpr.replace(/[+\-*/]+$/, '').trim();
  if (!cleaned) return 0;

  const sanitized = cleaned.replace(/[^0-9+\-*/.]/g, '');
  if (!sanitized) return 0;

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${sanitized})`)();
    if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
      return 0;
    }
    const rounded = Math.round(result);
    if (rounded < 0) return 0;
    if (rounded > 999_999_999_999) return 999_999_999_999;
    return rounded;
  } catch {
    return 0;
  }
}

/**
 * Tách chuỗi note thành mảng các tag riêng biệt dựa trên dấu phẩy
 */
function getNoteTags(noteText: string): string[] {
  return noteText
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

const DEFAULT_CONTACT_SUGGESTIONS = [
  'Bạn bè',
  'Đồng nghiệp',
  'Anh/Chị/Em',
  'Bố mẹ',
  'Đối tác',
  'Khách hàng',
  'Ngân hàng'
];

const QUICK_TRANSFER_FEES = [0, 1100, 3300, 5500, 11000];

function isDebtTransactionType(t: TransactionType): boolean {
  return t === 'LEND' || t === 'BORROW' || t === 'COLLECT_DEBT' || t === 'PAY_DEBT';
}

export const TransactionEditorScreen: React.FC<TransactionEditorScreenProps> = ({
  isOpen,
  onClose,
  editingTransaction
}) => {
  const rawCategories = useLiveQuery(() => db.categories.toArray());
  const rawWallets = useLiveQuery(() => db.wallets.toArray());
  const lastWalletSetting = useLiveQuery(() => db.settings.get('last_used_wallet_id'));
  const rawTransactions = useLiveQuery(() => db.transactions.toArray());
  const rawEvents = useLiveQuery(() => db.events.toArray());

  const categories = rawCategories ?? EMPTY_CATEGORIES;
  const wallets = rawWallets ?? EMPTY_WALLETS;
  const transactions = rawTransactions ?? EMPTY_TRANSACTIONS;
  const events = rawEvents ?? EMPTY_EVENTS;
  const activeEvents = useMemo(() => events.filter((ev) => !ev.isCompleted), [events]);

  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amountStr, setAmountStr] = useState<string>('0');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [toWalletId, setToWalletId] = useState<string>('');
  const [transferFeeStr, setTransferFeeStr] = useState<string>('0');
  const [contactName, setContactName] = useState<string>('');
  const [eventId, setEventId] = useState<string>('');
  const [excludeFromReport, setExcludeFromReport] = useState<boolean>(false);
  const [date, setDate] = useState<string>(getCurrentDate());
  const [note, setNote] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string>('');

  // Trạng thái hiển thị Popup Numpad đẩy từ dưới lên
  const [isNumpadOpen, setIsNumpadOpen] = useState(false);

  // Mở màn hình Chọn & Quản lý Hạng mục
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  // Quick tag thêm mới tại chỗ
  const [isAddingTag, setIsAddingTag] = useState<boolean>(false);
  const [newTagInput, setNewTagInput] = useState<string>('');

  const prevIsOpenRef = useRef(false);

  // Danh sách tên người vay / chủ nợ đã từng giao dịch trong lịch sử
  const existingContacts = useMemo(() => {
    const names = new Set<string>();
    for (const tx of transactions) {
      if (tx.contactName?.trim()) {
        names.add(tx.contactName.trim());
      }
    }
    DEFAULT_CONTACT_SUGGESTIONS.forEach((c) => names.add(c));
    return Array.from(names);
  }, [transactions]);

  // Thống kê số lần sử dụng của mỗi hạng mục trong lịch sử giao dịch
  const categoryUsageCountMap = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.categoryId) {
        counts[tx.categoryId] = (counts[tx.categoryId] || 0) + 1;
      }
    }
    return counts;
  }, [transactions]);

  // Lọc và sắp xếp các hạng mục hay dùng cho thanh chọn nhanh
  const frequentCategories = useMemo(() => {
    const available = categories.filter((c) => {
      if (type === 'EXPENSE') return c.type === 'EXPENSE' && !!c.parentId;
      if (type === 'INCOME') return c.type === 'INCOME';
      if (isDebtTransactionType(type)) return c.type === 'DEBT';
      return false;
    });

    return available.sort((a, b) => {
      const aStar = a.isStarred ? 1 : 0;
      const bStar = b.isStarred ? 1 : 0;
      if (aStar !== bStar) return bStar - aStar;

      const aCount = categoryUsageCountMap[a.id] || 0;
      const bCount = categoryUsageCountMap[b.id] || 0;
      if (aCount !== bCount) return bCount - aCount;

      return a.name.localeCompare(b.name, 'vi');
    });
  }, [categories, type, categoryUsageCountMap]);

  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (!isOpen) return;

    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmountStr(editingTransaction.amount.toString());
      setSelectedCategoryId(editingTransaction.categoryId || '');
      setSelectedWalletId(editingTransaction.walletId);
      setToWalletId(editingTransaction.toWalletId || '');
      setTransferFeeStr((editingTransaction.transferFee || 0).toString());
      setContactName(editingTransaction.contactName || '');
      setEventId(editingTransaction.eventId || '');
      setExcludeFromReport(!!editingTransaction.excludeFromReport);
      setDate(editingTransaction.date);
      setNote(editingTransaction.note || '');
      setErrorMsg('');
      setToastMsg('');
      setIsAddingTag(false);
      setNewTagInput('');
      setIsNumpadOpen(false);
    } else if (justOpened) {
      setType('EXPENSE');
      setAmountStr('0');
      setSelectedCategoryId('');
      setTransferFeeStr('0');
      setContactName('');
      setEventId('');
      setExcludeFromReport(false);
      setDate(getCurrentDate());
      setNote('');
      setErrorMsg('');
      setToastMsg('');
      setIsAddingTag(false);
      setNewTagInput('');
      setIsNumpadOpen(true);

      if (wallets.length > 0) {
        const lastId = lastWalletSetting?.value;
        const foundLast = lastId ? wallets.find((w) => w.id === lastId) : null;
        if (foundLast) {
          setSelectedWalletId(foundLast.id);
        } else {
          const cashWallet = wallets.find((w) =>
            w.name.toLowerCase().includes('tiền mặt')
          );
          setSelectedWalletId(cashWallet ? cashWallet.id : wallets[0].id);
        }
      }
    }
  }, [isOpen, editingTransaction, lastWalletSetting?.value, wallets]);

  // Fallback ví nếu chưa kịp load
  useEffect(() => {
    if (isOpen && !editingTransaction && !selectedWalletId && wallets.length > 0) {
      const lastId = lastWalletSetting?.value;
      const foundLast = lastId ? wallets.find((w) => w.id === lastId) : null;
      if (foundLast) {
        setSelectedWalletId(foundLast.id);
      } else {
        setSelectedWalletId(wallets[0].id);
      }
    }
  }, [isOpen, editingTransaction, selectedWalletId, wallets, lastWalletSetting?.value]);

  // Tự động chọn hạng mục nợ tương ứng khi đổi sang tab Cho vay / Đi vay / Thu nợ / Trả nợ
  useEffect(() => {
    if (!isOpen || !isDebtTransactionType(type)) return;
    const targetNameMap: Record<string, string> = {
      LEND: 'cho vay',
      BORROW: 'đi vay',
      COLLECT_DEBT: 'thu nợ',
      PAY_DEBT: 'trả nợ'
    };
    const expectedName = targetNameMap[type];
    if (!expectedName) return;

    const matchingCat = categories.find(
      (c) => c.type === 'DEBT' && c.name.trim().toLowerCase() === expectedName
    );
    if (matchingCat) {
      setSelectedCategoryId(matchingCat.id);
    }
  }, [type, isOpen, categories]);

  // Khi chuyển sang tab ADJUST (Điều chỉnh), tự động điền số dư hiện tại của ví
  useEffect(() => {
    if (type === 'ADJUST' && !editingTransaction && selectedWalletId) {
      const currentWallet = wallets.find((w) => w.id === selectedWalletId);
      if (currentWallet && amountStr === '0') {
        setAmountStr(currentWallet.balance.toString());
      }
    }
  }, [type, selectedWalletId, wallets, editingTransaction, amountStr]);

  const currentWallet = wallets.find((w) => w.id === selectedWalletId);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const parentOfSelected = selectedCategory?.parentId
    ? categories.find((c) => c.id === selectedCategory.parentId)
    : null;

  const currentComputedAmount = evaluateExpression(amountStr);
  const hasOperator = /[+\-*/]/.test(amountStr);
  const activeTags = getNoteTags(note);

  const adjustDiff = currentWallet ? currentComputedAmount - currentWallet.balance : 0;

  const handleKeyPress = (key: string) => {
    setErrorMsg('');

    if (key === 'C' || key === 'CLEAR') {
      setAmountStr('0');
      return;
    }

    if (key === 'BACKSPACE') {
      if (amountStr.length <= 1) {
        setAmountStr('0');
      } else {
        const nextStr = amountStr.slice(0, -1);
        setAmountStr(nextStr === '' ? '0' : nextStr);
      }
      return;
    }

    if (key === '000') {
      if (amountStr === '0') return;
      if (/[+\-*/]$/.test(amountStr)) return;
      if (/[+\-*/]0$/.test(amountStr)) return;
      if (amountStr.length >= 24) return;
      setAmountStr((prev) => prev + '000');
      return;
    }

    if (['+', '-', '×', '÷', '*', '/'].includes(key)) {
      const op = key === '×' ? '*' : key === '÷' ? '/' : key;
      if (amountStr === '0') return;
      if (/[+\-*/]$/.test(amountStr)) {
        setAmountStr((prev) => prev.slice(0, -1) + op);
        return;
      }
      if (amountStr.length >= 26) return;
      setAmountStr((prev) => prev + op);
      return;
    }

    if (amountStr === '0') {
      if (key === '0') return;
      setAmountStr(key);
      return;
    }

    if (/[+\-*/]0$/.test(amountStr)) {
      if (key === '0') return;
      setAmountStr((prev) => prev.slice(0, -1) + key);
      return;
    }

    if (amountStr.length >= 28) return;
    setAmountStr((prev) => prev + key);
  };

  const handleToggleTag = (tag: string) => {
    const current = getNoteTags(note);
    if (current.includes(tag)) {
      setNote(current.filter((t) => t !== tag).join(', '));
    } else {
      setNote([...current, tag].join(', '));
    }
  };

  const handleSaveNewTag = async () => {
    const trimmed = newTagInput.trim();
    if (!trimmed || !selectedCategory) {
      setIsAddingTag(false);
      setNewTagInput('');
      return;
    }

    try {
      const currentQuickTags = selectedCategory.quickTags || [];
      if (!currentQuickTags.includes(trimmed)) {
        await db.categories.update(selectedCategory.id, {
          quickTags: [...currentQuickTags, trimmed]
        });
      }
      const current = getNoteTags(note);
      if (!current.includes(trimmed)) {
        setNote([...current, trimmed].join(', '));
      }
      setNewTagInput('');
      setIsAddingTag(false);
    } catch (err: any) {
      console.error('Lỗi thêm quick tag:', err);
      setIsAddingTag(false);
    }
  };

  // Lưu giao dịch (hỗ trợ cả "Lưu" và "Lưu & Ghi tiếp")
  const handleSave = async (keepOpenForNext = false) => {
    setErrorMsg('');
    const finalAmount = evaluateExpression(amountStr);

    if (type !== 'ADJUST' && (finalAmount <= 0 || isNaN(finalAmount))) {
      setErrorMsg('Vui lòng nhập số tiền hợp lệ lớn hơn 0');
      return;
    }

    if (!selectedWalletId) {
      setErrorMsg('Vui lòng chọn tài khoản / ví');
      return;
    }

    if (type === 'TRANSFER') {
      if (!toWalletId) {
        setErrorMsg('Vui lòng chọn ví nhận');
        return;
      }
      if (selectedWalletId === toWalletId) {
        setErrorMsg('Ví gửi và ví nhận không được trùng nhau');
        return;
      }
    } else if (type === 'ADJUST') {
      try {
        await adjustWalletBalance({
          walletId: selectedWalletId,
          newBalance: finalAmount,
          autoCreateAdjustmentTx: true,
          date,
          time: getCurrentTime()
        });
        onClose();
        return;
      } catch (err: any) {
        setErrorMsg(err?.message || 'Có lỗi khi điều chỉnh số dư');
        return;
      }
    } else if (type === 'EXPENSE' || type === 'INCOME') {
      if (!selectedCategoryId) {
        setErrorMsg(`Vui lòng chọn hạng mục cho khoản ${type === 'EXPENSE' ? 'chi tiêu' : 'thu nhập'}`);
        return;
      }
    }

    const parsedTransferFee =
      type === 'TRANSFER' ? Math.max(0, parseInt(transferFeeStr.replace(/\D/g, ''), 10) || 0) : undefined;
    const trimmedContact = isDebtTransactionType(type) ? contactName.trim() || undefined : undefined;
    const chosenEventId =
      type === 'EXPENSE' || type === 'INCOME' ? eventId || undefined : undefined;
    const chosenExclude =
      type === 'EXPENSE' || type === 'INCOME' ? excludeFromReport : false;

    try {
      if (editingTransaction && !keepOpenForNext) {
        await updateTransaction(editingTransaction.id, {
          walletId: selectedWalletId,
          toWalletId: type === 'TRANSFER' ? toWalletId : undefined,
          categoryId: type === 'TRANSFER' ? undefined : selectedCategoryId || undefined,
          type,
          amount: finalAmount,
          transferFee: parsedTransferFee && parsedTransferFee > 0 ? parsedTransferFee : undefined,
          contactName: trimmedContact,
          eventId: chosenEventId,
          excludeFromReport: chosenExclude,
          date,
          time: editingTransaction.time || getCurrentTime(),
          note: note.trim()
        });
        onClose();
      } else {
        await createTransaction({
          walletId: selectedWalletId,
          toWalletId: type === 'TRANSFER' ? toWalletId : undefined,
          categoryId: type === 'TRANSFER' ? undefined : selectedCategoryId || undefined,
          type,
          amount: finalAmount,
          transferFee: parsedTransferFee && parsedTransferFee > 0 ? parsedTransferFee : undefined,
          contactName: trimmedContact,
          eventId: chosenEventId,
          excludeFromReport: chosenExclude,
          date,
          time: getCurrentTime(),
          note: note.trim()
        });

        if (keepOpenForNext) {
          // Reset để ghi tiếp khoản tiếp theo cực nhanh
          setAmountStr('0');
          setNote('');
          setTransferFeeStr('0');
          setExcludeFromReport(false);
          setIsNumpadOpen(true);
          setToastMsg(`Đã lưu ${formatVND(finalAmount)}! Mời nhập khoản tiếp theo...`);
          setTimeout(() => setToastMsg(''), 2500);
        } else {
          onClose();
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi xảy ra khi lưu giao dịch');
    }
  };

  const handleDelete = async () => {
    if (!editingTransaction) return;
    if (window.confirm('Bạn có chắc chắn muốn xóa giao dịch này? Số dư ví sẽ được tự động hoàn tác.')) {
      try {
        await deleteTransaction(editingTransaction.id);
        onClose();
      } catch (err: any) {
        setErrorMsg(err?.message || 'Lỗi khi xóa giao dịch');
      }
    }
  };

  // Hỗ trợ bàn phím máy tính (Physical Keyboard) khi thao tác trên PC Desktop
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave(false);
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (['+', '-', '*', '/'].includes(e.key)) {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleKeyPress('BACKSPACE');
      } else if (e.key === 'c' || e.key === 'C') {
        handleKeyPress('C');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    amountStr,
    selectedCategoryId,
    selectedWalletId,
    toWalletId,
    transferFeeStr,
    contactName,
    eventId,
    excludeFromReport,
    date,
    note,
    type
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-md flex flex-col md:items-center md:justify-center p-0 md:p-6 overflow-y-auto">
      <div className="w-full md:max-w-xl bg-slate-900 border-0 md:border md:border-white/12 md:rounded-3xl shadow-2xl flex flex-col min-h-full md:min-h-0 md:max-h-[92vh] overflow-hidden animate-fade-in font-body text-slate-100">
        {/* 1. Header Bar */}
        <header className="sticky top-0 z-40 safe-padding-top px-4 py-3 bg-slate-900/95 backdrop-blur-md border-b border-white/8 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="touch-btn flex items-center gap-1 text-sky-400 font-semibold text-sm cursor-pointer border-none bg-transparent py-1 px-1 -ml-1 hover:text-sky-300"
          >
            <ArrowLeft size={19} />
            <span>Quay lại</span>
          </button>

          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            {editingTransaction ? 'Chỉnh sửa giao dịch' : 'Ghi giao dịch'}
          </h2>

          <div className="flex items-center gap-1">
            {editingTransaction && (
              <button
                type="button"
                onClick={handleDelete}
                className="touch-btn text-rose-400 p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 cursor-pointer border-none mr-1"
                title="Xóa giao dịch"
              >
                <Trash2 size={17} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="hidden md:flex text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              title="Đóng (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* 2. Nội dung cuộn chính */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-24">
          {toastMsg && (
            <div className="mx-4 mt-3 p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs text-center font-bold animate-fade-in">
              {toastMsg}
            </div>
          )}

          {/* THỨ TỰ 1: CHỌN LOẠI GIAO DỊCH (HỖ TRỢ ĐẦY ĐỦ CHUẨN MISA: CHI, THU, CHUYỂN VÍ, ĐIỀU CHỈNH & 4 NGHIỆP VỤ SỔ NỢ) */}
          <div className="px-4 pt-3.5 pb-2 flex flex-col gap-1.5">
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setType('EXPENSE')}
                className={`touch-btn py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
                  type === 'EXPENSE'
                    ? 'bg-rose-500/25 border-rose-500 text-rose-300 shadow-md shadow-rose-500/20 ring-1 ring-rose-400'
                    : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                <span>Chi tiền</span>
              </button>

              <button
                type="button"
                onClick={() => setType('INCOME')}
                className={`touch-btn py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
                  type === 'INCOME'
                    ? 'bg-emerald-500/25 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400'
                    : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span>Thu tiền</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType('TRANSFER');
                  if (!toWalletId || toWalletId === selectedWalletId) {
                    const alt = wallets.find((w) => w.id !== selectedWalletId);
                    if (alt) setToWalletId(alt.id);
                  }
                }}
                className={`touch-btn py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
                  type === 'TRANSFER'
                    ? 'bg-sky-500/25 border-sky-500 text-sky-300 shadow-md shadow-sky-500/20 ring-1 ring-sky-400'
                    : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <ArrowRightLeft size={13} className="text-sky-400 shrink-0" />
                <span>Chuyển ví</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType('ADJUST');
                  if (currentWallet && amountStr === '0') {
                    setAmountStr(currentWallet.balance.toString());
                  }
                }}
                className={`touch-btn py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
                  type === 'ADJUST'
                    ? 'bg-slate-700/80 border-slate-400 text-slate-200 shadow-md ring-1 ring-slate-300'
                    : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <SlidersHorizontal size={13} className="text-slate-300 shrink-0" />
                <span>Điều chỉnh</span>
              </button>
            </div>

            {/* Hàng 2: 4 Nghiệp vụ Sổ Nợ (Cho vay, Đi vay, Thu nợ, Trả nợ) */}
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setType('LEND')}
                className={`touch-btn py-1.5 px-2 rounded-xl border flex items-center justify-center gap-1 text-[11px] font-bold cursor-pointer transition-all ${
                  type === 'LEND'
                    ? 'bg-amber-500/25 border-amber-500 text-amber-300 shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
                    : 'bg-slate-800/60 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <HandCoins size={13} className="text-amber-400 shrink-0" />
                <span>Cho vay</span>
              </button>

              <button
                type="button"
                onClick={() => setType('BORROW')}
                className={`touch-btn py-1.5 px-2 rounded-xl border flex items-center justify-center gap-1 text-[11px] font-bold cursor-pointer transition-all ${
                  type === 'BORROW'
                    ? 'bg-purple-500/25 border-purple-500 text-purple-300 shadow-md shadow-purple-500/20 ring-1 ring-purple-400'
                    : 'bg-slate-800/60 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Receipt size={13} className="text-purple-400 shrink-0" />
                <span>Đi vay</span>
              </button>

              <button
                type="button"
                onClick={() => setType('COLLECT_DEBT')}
                className={`touch-btn py-1.5 px-2 rounded-xl border flex items-center justify-center gap-1 text-[11px] font-bold cursor-pointer transition-all ${
                  type === 'COLLECT_DEBT'
                    ? 'bg-teal-500/25 border-teal-500 text-teal-300 shadow-md shadow-teal-500/20 ring-1 ring-teal-400'
                    : 'bg-slate-800/60 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <PiggyBank size={13} className="text-teal-400 shrink-0" />
                <span>Thu nợ</span>
              </button>

              <button
                type="button"
                onClick={() => setType('PAY_DEBT')}
                className={`touch-btn py-1.5 px-2 rounded-xl border flex items-center justify-center gap-1 text-[11px] font-bold cursor-pointer transition-all ${
                  type === 'PAY_DEBT'
                    ? 'bg-orange-500/25 border-orange-500 text-orange-300 shadow-md shadow-orange-500/20 ring-1 ring-orange-400'
                    : 'bg-slate-800/60 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <CreditCard size={13} className="text-orange-400 shrink-0" />
                <span>Trả nợ</span>
              </button>
            </div>
          </div>

          {/* THỨ TỰ 2: SỐ TIỀN & BIỂU THỨC TOÁN HỌC */}
          <div
            onClick={() => setIsNumpadOpen(true)}
            className="px-5 py-3 mx-4 rounded-2xl bg-slate-900/90 border border-white/8 text-center shadow-lg cursor-pointer hover:border-sky-400/40 active:scale-98 transition-all relative group"
          >
            <div className="absolute top-2.5 right-3 text-slate-500 group-hover:text-sky-400 flex items-center gap-1 text-[11px] font-semibold transition-colors">
              <Calculator size={14} />
              <span>Đổi số tiền</span>
            </div>

            <div
              className={`text-xs font-medium min-h-[20px] mb-1 ${
                hasOperator ? 'text-sky-400 tracking-wider font-mono' : 'text-slate-400'
              }`}
            >
              {hasOperator
                ? amountStr
                    .replace(/\*/g, ' × ')
                    .replace(/\//g, ' ÷ ')
                    .replace(/\+/g, ' + ')
                    .replace(/-/g, ' - ')
                : type === 'EXPENSE'
                ? 'Số tiền chi'
                : type === 'INCOME'
                ? 'Số tiền thu'
                : type === 'LEND'
                ? 'Số tiền cho vay'
                : type === 'BORROW'
                ? 'Số tiền đi vay'
                : type === 'COLLECT_DEBT'
                ? 'Số tiền thu nợ'
                : type === 'PAY_DEBT'
                ? 'Số tiền trả nợ'
                : type === 'TRANSFER'
                ? 'Số tiền chuyển'
                : 'Số dư thực tế mới'}
            </div>

            <div
              className={`font-heading text-4xl font-black tracking-tight leading-none ${
                type === 'EXPENSE' || type === 'PAY_DEBT'
                  ? 'text-rose-400'
                  : type === 'INCOME' || type === 'COLLECT_DEBT'
                  ? 'text-emerald-400'
                  : type === 'LEND'
                  ? 'text-amber-400'
                  : type === 'BORROW'
                  ? 'text-purple-400'
                  : type === 'TRANSFER'
                  ? 'text-sky-400'
                  : 'text-slate-200'
              }`}
            >
              {formatVND(currentComputedAmount)}
            </div>

            {type === 'ADJUST' && currentWallet && (
              <div className="mt-2 text-xs flex items-center justify-center gap-1.5 font-medium">
                <span className="text-slate-400">Hiện tại: {formatVND(currentWallet.balance)}</span>
                <span>•</span>
                <span
                  className={
                    adjustDiff > 0
                      ? 'text-emerald-400 font-bold'
                      : adjustDiff < 0
                      ? 'text-rose-400 font-bold'
                      : 'text-slate-400'
                  }
                >
                  Chênh lệch: {adjustDiff > 0 ? `+${formatVND(adjustDiff)}` : formatVND(adjustDiff)}
                </span>
              </div>
            )}

            <div className="mt-2 text-[11px] text-sky-400/80 font-medium flex items-center justify-center gap-1">
              <span>Chạm vào đây để mở bàn phím tính toán</span>
            </div>
          </div>

          {errorMsg && (
            <div className="mx-4 mt-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs text-center font-medium">
              {errorMsg}
            </div>
          )}

          {/* THỨ TỰ 3: CHỌN HẠNG MỤC */}
          {type !== 'TRANSFER' && type !== 'ADJUST' && (
            <div className="px-4 pt-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Hạng mục
                </label>

                <button
                  type="button"
                  onClick={() => setIsCategoryManagerOpen(true)}
                  className="touch-btn text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer bg-sky-500/10 px-2.5 py-1 rounded-xl border border-sky-400/20"
                >
                  <FolderTree size={14} />
                  <span>Tất cả</span>
                  <ChevronRight size={14} />
                </button>
              </div>

              <div
                onClick={() => setIsCategoryManagerOpen(true)}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  selectedCategory
                    ? 'bg-slate-900 border-white/10 shadow-md'
                    : 'bg-slate-900/60 border-dashed border-white/15 hover:border-sky-400/50'
                }`}
              >
                {selectedCategory ? (
                  <div className="flex items-center gap-3 truncate">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                      style={{ backgroundColor: selectedCategory.color }}
                    >
                      <CategoryIcon name={selectedCategory.icon || 'Tag'} size={18} color="#ffffff" />
                    </div>
                    <div className="truncate text-left">
                      {parentOfSelected && (
                        <div className="text-[10px] text-slate-400 font-medium truncate">
                          {parentOfSelected.name}
                        </div>
                      )}
                      <div className="text-sm font-bold text-white truncate">
                        {selectedCategory.name}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 text-slate-500 text-xs py-0.5">
                    <div className="w-8 h-8 rounded-xl bg-slate-800 border border-white/5 flex items-center justify-center text-slate-400">
                      <Plus size={16} />
                    </div>
                    <span>Chạm để chọn hạng mục (hoặc chọn nhanh bên dưới)...</span>
                  </div>
                )}

                {selectedCategory && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCategoryId('');
                    }}
                    className="touch-btn p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 border-none cursor-pointer"
                    title="Bỏ chọn"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Danh mục hay dùng & gắn sao */}
              {frequentCategories.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-0.5">
                  <div className="flex items-center justify-between px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1 text-amber-400/90">
                      <Star size={11} className="text-amber-400 fill-amber-400" />
                      <span>Hay dùng & Gắn sao</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal lowercase">
                      vuốt ngang xem thêm
                    </span>
                  </div>

                  <div className="grid grid-rows-2 grid-flow-col auto-cols-max gap-1.5 overflow-x-auto pb-1 scrollbar-none max-h-[76px]">
                    {frequentCategories.map((cat) => {
                      const isSelected = cat.id === selectedCategoryId;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategoryId(cat.id)}
                          className={`touch-btn h-8 px-2.5 rounded-xl border flex items-center gap-1.5 text-xs whitespace-nowrap cursor-pointer transition-all ${
                            isSelected
                              ? 'border-sky-400 bg-sky-500/20 text-sky-200 font-bold ring-1 ring-sky-400 shadow-sm'
                              : 'border-white/6 bg-slate-900/90 text-slate-300 hover:text-white hover:border-white/20'
                          }`}
                        >
                          {cat.isStarred ? (
                            <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />
                          ) : (
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                          )}
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick tags của danh mục đã chọn */}
              {selectedCategory && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    <span>Gợi ý ghi chú ({selectedCategory.name})</span>
                    {activeTags.length > 0 && (
                      <span className="text-sky-400 lowercase font-normal">
                        đã chọn {activeTags.length} tag
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto items-center pb-1 scrollbar-none">
                    {(selectedCategory.quickTags || []).map((tag) => {
                      const isActive = activeTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleTag(tag)}
                          className={`touch-btn px-3 py-1 rounded-full text-xs whitespace-nowrap cursor-pointer flex items-center gap-1 transition-all ${
                            isActive
                              ? 'bg-sky-500 text-white border border-sky-400 font-bold'
                              : 'bg-slate-800 text-slate-400 border border-white/8 hover:text-slate-200'
                          }`}
                        >
                          {isActive && <Check size={12} strokeWidth={3} />}
                          <span>{tag}</span>
                        </button>
                      );
                    })}

                    {isAddingTag ? (
                      <div className="flex items-center gap-1 shrink-0 bg-slate-800 rounded-full px-2 py-0.5 border border-sky-400">
                        <input
                          type="text"
                          value={newTagInput}
                          onChange={(e) => setNewTagInput(e.target.value)}
                          placeholder="Tag mới..."
                          className="bg-transparent border-none text-white text-xs outline-none w-20 py-0.5"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveNewTag();
                            if (e.key === 'Escape') setIsAddingTag(false);
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleSaveNewTag}
                          className="text-sky-400 p-1 hover:text-sky-300"
                        >
                          <Check size={13} strokeWidth={3} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsAddingTag(true)}
                        className="touch-btn px-2.5 py-1 rounded-full text-xs whitespace-nowrap bg-slate-800/80 hover:bg-slate-800 text-slate-400 border border-dashed border-white/20 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={12} />
                        <span>Thêm</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* THỨ TỰ 4: FORMS VÍ TIỀN, PHÍ CHUYỂN KHOẢN, NGƯỜI VAY/CHỦ NỢ, SỰ KIỆN & GHI CHÚ */}
          <div className="px-4 pt-3 flex flex-col gap-2.5">
            {type === 'TRANSFER' ? (
              <div className="flex flex-col gap-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <WalletSelect
                    wallets={wallets}
                    selectedWalletId={selectedWalletId}
                    onSelect={setSelectedWalletId}
                    label="Từ ví (Gửi)"
                    excludeWalletId={toWalletId}
                  />

                  <WalletSelect
                    wallets={wallets}
                    selectedWalletId={toWalletId}
                    onSelect={setToWalletId}
                    label="Đến ví (Nhận)"
                    excludeWalletId={selectedWalletId}
                  />
                </div>

                {/* Phí chuyển khoản (Chuẩn MISA FR-T-09) */}
                <div className="p-3 rounded-2xl bg-slate-900 border border-white/8 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Phí chuyển khoản (Nếu có)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={transferFeeStr === '0' ? '' : transferFeeStr}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setTransferFeeStr(val || '0');
                      }}
                      placeholder="0 ₫ (Miễn phí)"
                      className="input-ios w-36 text-right py-1 px-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs font-bold text-sky-300"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                    {QUICK_TRANSFER_FEES.map((fee) => {
                      const active = parseInt(transferFeeStr || '0', 10) === fee;
                      return (
                        <button
                          key={fee}
                          type="button"
                          onClick={() => setTransferFeeStr(fee.toString())}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer border transition-all whitespace-nowrap ${
                            active
                              ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                              : 'bg-slate-800/70 border-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          {fee === 0 ? 'Miễn phí' : formatVND(fee)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <DatePicker value={date} onChange={setDate} label="Ngày chuyển tiền" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <WalletSelect
                  wallets={wallets}
                  selectedWalletId={selectedWalletId}
                  onSelect={setSelectedWalletId}
                  label={type === 'ADJUST' ? 'Ví cần chỉnh' : 'Tài khoản / Ví'}
                />

                <DatePicker value={date} onChange={setDate} label="Ngày ghi chép" />
              </div>
            )}

            {/* Ô Nhập Người Vay / Chủ Nợ khi thuộc nhóm Vay Nợ (Chuẩn MISA Sổ Nợ) */}
            {isDebtTransactionType(type) && (
              <div className="p-3 rounded-2xl bg-slate-900 border border-amber-500/25 flex flex-col gap-2">
                <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck size={14} />
                  <span>
                    {type === 'LEND' || type === 'COLLECT_DEBT'
                      ? 'Người vay tiền (Con nợ)'
                      : 'Người cho vay (Chủ nợ)'}
                  </span>
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Nhập tên người giao dịch (VD: Anh Nam, Chị Lan...)"
                  className="input-ios w-full bg-slate-800/90 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
                {existingContacts.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                    {existingContacts.map((person) => {
                      const isSelected = contactName.trim().toLowerCase() === person.toLowerCase();
                      return (
                        <button
                          key={person}
                          type="button"
                          onClick={() => setContactName(person)}
                          className={`touch-btn px-2.5 py-1 rounded-full text-xs whitespace-nowrap cursor-pointer flex items-center gap-1 transition-all ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 font-bold border border-amber-300'
                              : 'bg-slate-800 text-slate-300 border border-white/8 hover:text-white'
                          }`}
                        >
                          {isSelected && <Check size={11} strokeWidth={3} />}
                          <span>{person}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Ô Ghi chú chi tiết */}
            {type !== 'ADJUST' && (
              <div>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    isDebtTransactionType(type)
                      ? 'Ghi chú lý do vay/trả, hạn trả...'
                      : type === 'TRANSFER'
                      ? 'Ghi chú chuyển tiền...'
                      : 'Ghi chú chi tiết giao dịch (tùy chọn)...'
                  }
                  className="input-ios w-full bg-slate-900 border border-white/8 rounded-2xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-500"
                />
              </div>
            )}

            {/* Tùy chọn Nâng cao cho Khoản Thu/Chi: Gắn Sự kiện / Chuyến đi & Không tính vào báo cáo */}
            {(type === 'EXPENSE' || type === 'INCOME') && (
              <div className="flex flex-col gap-2 pt-0.5">
                {activeEvents.length > 0 && (
                  <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-900 border border-white/8">
                    <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                      <Plane size={14} className="text-sky-400" />
                      <span>Sự kiện / Chuyến đi</span>
                    </span>
                    <select
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value)}
                      className="input-ios py-1 px-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-slate-200 max-w-[200px]"
                    >
                      <option value="">-- Không gắn sự kiện --</option>
                      {activeEvents.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <label className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-900/70 border border-white/6 cursor-pointer hover:border-white/15">
                  <div className="flex items-center gap-2">
                    <EyeOff size={15} className="text-slate-400" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200">
                        Không tính vào báo cáo Thu/Chi
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Dùng cho khoản chi hộ, ứng trước hoặc thu hộ người khác
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={excludeFromReport}
                    onChange={(e) => setExcludeFromReport(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                  />
                </label>
              </div>
            )}
          </div>

          {/* NÚT LƯU GIAO DỊCH, LƯU & GHI TIẾP (CHUẨN MISA) & NÚT MỞ BÀN PHÍM */}
          <div className="px-4 pt-3 pb-8 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              {!editingTransaction && type !== 'ADJUST' && (
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  className="touch-btn h-13 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-sky-400/30 text-sky-300 font-bold flex items-center justify-center gap-1.5 text-xs cursor-pointer shrink-0 transition-all"
                  title="Lưu khoản này và giữ màn hình để nhập tiếp khoản khác ngay lập tức"
                >
                  <PlusCircle size={17} />
                  <span>Lưu & Ghi tiếp</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleSave(false)}
                className={`flex-1 touch-btn touch-bounce h-13 rounded-2xl text-white font-bold flex items-center justify-center gap-2 text-sm shadow-xl cursor-pointer border-none transition-transform active:scale-98 ${
                  type === 'EXPENSE' || type === 'PAY_DEBT'
                    ? 'bg-gradient-to-r from-rose-500 to-rose-600 shadow-rose-500/30'
                    : type === 'INCOME' || type === 'COLLECT_DEBT'
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-500/30'
                    : type === 'LEND'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 shadow-amber-500/30'
                    : type === 'BORROW'
                    ? 'bg-gradient-to-r from-purple-500 to-purple-600 shadow-purple-500/30'
                    : type === 'TRANSFER'
                    ? 'bg-gradient-to-r from-sky-500 to-sky-600 shadow-sky-500/30'
                    : 'bg-gradient-to-r from-slate-600 to-slate-700 shadow-slate-500/30'
                }`}
              >
                <Check size={20} strokeWidth={2.8} />
                <span>
                  {editingTransaction
                    ? 'LƯU THAY ĐỔI'
                    : type === 'ADJUST'
                    ? 'XÁC NHẬN ĐIỀU CHỈNH'
                    : 'LƯU GIAO DỊCH'}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsNumpadOpen(true)}
              className="w-full touch-btn py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-white/6 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Calculator size={15} className="text-sky-400" />
              <span>Mở bàn phím tính toán số tiền</span>
            </button>
          </div>
        </div>

        {/* 5. POPUP BÀN PHÍM NUMPAD ĐẨY TỪ DƯỚI LÊN */}
        <NumpadBottomSheet
          isOpen={isNumpadOpen}
          onClose={() => setIsNumpadOpen(false)}
          type={type}
          amountStr={amountStr}
          computedAmount={currentComputedAmount}
          hasOperator={hasOperator}
          onKeyPress={handleKeyPress}
          onConfirmAndSave={
            selectedCategoryId || type === 'TRANSFER' || type === 'ADJUST'
              ? () => handleSave(false)
              : undefined
          }
          currentWalletBalance={currentWallet?.balance}
          adjustDiff={adjustDiff}
        />

        {/* 6. MÀN HÌNH CHỌN & QUẢN LÝ HẠNG MỤC PHÂN CẤP */}
        <CategoryManagerScreen
          isOpen={isCategoryManagerOpen}
          onClose={() => setIsCategoryManagerOpen(false)}
          onSelectCategory={(cat) => {
            setSelectedCategoryId(cat.id);
            if (cat.type === 'EXPENSE') setType('EXPENSE');
            if (cat.type === 'INCOME') setType('INCOME');
            if (cat.type === 'DEBT') {
              const lower = cat.name.trim().toLowerCase();
              if (lower === 'đi vay') setType('BORROW');
              else if (lower === 'thu nợ') setType('COLLECT_DEBT');
              else if (lower === 'trả nợ') setType('PAY_DEBT');
              else setType('LEND');
            }
          }}
          initialTab={
            type === 'INCOME'
              ? 'INCOME'
              : isDebtTransactionType(type)
              ? 'DEBT'
              : 'EXPENSE'
          }
        />
      </div>
    </div>
  );
};

export default TransactionEditorScreen;
