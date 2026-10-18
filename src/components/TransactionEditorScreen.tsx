// src/components/TransactionEditorScreen.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Transaction, TransactionType, Category, Wallet } from '../types';
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  adjustWalletBalance
} from '../services/transactionService';

const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_WALLETS: Wallet[] = [];
const EMPTY_TRANSACTIONS: Transaction[] = [];
import { CategoryIcon } from './CategoryIcon';
import { CategoryManagerScreen } from './CategoryManagerScreen';
import { NumpadBottomSheet } from './NumpadBottomSheet';
import { formatVND, getCurrentDate, getCurrentTime } from '../utils/formatters';
import {
  ArrowLeft,
  Calendar,
  Wallet as WalletIcon,
  Check,
  Trash2,
  Plus,
  ArrowRightLeft,
  SlidersHorizontal,
  HandCoins,
  Receipt,
  FolderTree,
  ChevronRight,
  Calculator,
  X,
  Star
} from 'lucide-react';

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

/**
 * Định dạng ngày YYYY-MM-DD sang tiếng Việt gọn đẹp: "Hôm nay, 18/10" hoặc "18/10/2026"
 */
function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const today = getCurrentDate();
  const [y, m, d] = dateStr.split('-');
  if (dateStr === today) {
    return `Hôm nay, ${d}/${m}`;
  }
  return `${d}/${m}/${y}`;
}

const DEFAULT_LEND_BORROW_TAGS = ['Bạn bè', 'Đồng nghiệp', 'Gia đình', 'Người thân', 'Đối tác', 'Khách hàng', 'Ngân hàng'];

export const TransactionEditorScreen: React.FC<TransactionEditorScreenProps> = ({
  isOpen,
  onClose,
  editingTransaction
}) => {
  const rawCategories = useLiveQuery(() => db.categories.toArray());
  const rawWallets = useLiveQuery(() => db.wallets.toArray());
  const lastWalletSetting = useLiveQuery(() => db.settings.get('last_used_wallet_id'));
  const rawTransactions = useLiveQuery(() => db.transactions.toArray());

  const categories = rawCategories ?? EMPTY_CATEGORIES;
  const wallets = rawWallets ?? EMPTY_WALLETS;
  const transactions = rawTransactions ?? EMPTY_TRANSACTIONS;

  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amountStr, setAmountStr] = useState<string>('0');
  // MẶC ĐỊNH ĐỂ TRỐNG HẠNG MỤC THEO YÊU CẦU NGƯỜI DÙNG
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [toWalletId, setToWalletId] = useState<string>('');
  const [date, setDate] = useState<string>(getCurrentDate());
  const [note, setNote] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Trạng thái hiển thị Popup Numpad đẩy từ dưới lên
  const [isNumpadOpen, setIsNumpadOpen] = useState(false);

  // Mở màn hình Chọn & Quản lý Hạng mục
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  // Quick tag thêm mới tại chỗ
  const [isAddingTag, setIsAddingTag] = useState<boolean>(false);
  const [newTagInput, setNewTagInput] = useState<string>('');

  const prevIsOpenRef = useRef(false);

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

  // Lọc và sắp xếp các hạng mục hay dùng cho thanh chọn nhanh (Tối đa 2 dòng):
  // 1. Ưu tiên hạng mục được gắn sao (isStarred)
  // 2. Tiếp theo ưu tiên theo tần suất sử dụng thực tế trong lịch sử giao dịch (usageCount)
  // 3. Sắp xếp chữ cái tiếng Việt
  const frequentCategories = useMemo(() => {
    const available = categories.filter((c) => {
      if (type === 'EXPENSE') return c.type === 'EXPENSE' && !!c.parentId;
      if (type === 'INCOME') return c.type === 'INCOME';
      if (type === 'LEND' || type === 'BORROW') return c.type === 'DEBT';
      return false;
    });

    return available.sort((a, b) => {
      const aStar = a.isStarred ? 1 : 0;
      const bStar = b.isStarred ? 1 : 0;
      if (aStar !== bStar) return bStar - aStar; // Mục có sao ưu tiên đứng trước

      const aCount = categoryUsageCountMap[a.id] || 0;
      const bCount = categoryUsageCountMap[b.id] || 0;
      if (aCount !== bCount) return bCount - aCount; // Dùng nhiều ưu tiên đứng trước

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
      setDate(editingTransaction.date);
      setNote(editingTransaction.note || '');
      setErrorMsg('');
      setIsAddingTag(false);
      setNewTagInput('');
      setIsNumpadOpen(false);
    } else if (justOpened) {
      setType('EXPENSE');
      setAmountStr('0');
      // MẶC ĐỊNH ĐỂ TRỐNG HẠNG MỤC KHI TẠO MỚI
      setSelectedCategoryId('');
      setDate(getCurrentDate());
      setNote('');
      setErrorMsg('');
      setIsAddingTag(false);
      setNewTagInput('');
      // Tự động mở Popup Numpad đẩy từ dưới lên để nhập số tiền ngay
      setIsNumpadOpen(true);

      // Gán ví mặc định
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
  const targetWallet = wallets.find((w) => w.id === toWalletId);

  // Tìm danh mục đang được chọn
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const parentOfSelected = selectedCategory?.parentId
    ? categories.find((c) => c.id === selectedCategory.parentId)
    : null;

  // Tính số tiền thực tế real-time
  const currentComputedAmount = evaluateExpression(amountStr);
  const hasOperator = /[+\-*/]/.test(amountStr);
  const activeTags = getNoteTags(note);

  // Tính chênh lệch nếu là ADJUST
  const adjustDiff = currentWallet ? currentComputedAmount - currentWallet.balance : 0;

  // Xử lý bàn phím Numpad
  const handleKeyPress = (key: string) => {
    setErrorMsg('');

    if (key === 'C') {
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

    if (['+', '-', '×', '÷'].includes(key)) {
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

  // Lưu giao dịch
  const handleSave = async () => {
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

    try {
      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, {
          walletId: selectedWalletId,
          toWalletId: type === 'TRANSFER' ? toWalletId : undefined,
          categoryId: type === 'TRANSFER' ? undefined : selectedCategoryId || undefined,
          type,
          amount: finalAmount,
          date,
          time: editingTransaction.time || getCurrentTime(),
          note: note.trim()
        });
      } else {
        await createTransaction({
          walletId: selectedWalletId,
          toWalletId: type === 'TRANSFER' ? toWalletId : undefined,
          categoryId: type === 'TRANSFER' ? undefined : selectedCategoryId || undefined,
          type,
          amount: finalAmount,
          date,
          time: getCurrentTime(),
          note: note.trim()
        });
      }

      onClose();
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 bg-[#090d16] flex flex-col text-slate-100 overflow-hidden font-body animate-fade-in max-w-[480px] mx-auto">
      {/* 1. Header Bar chuẩn iOS */}
      <header className="sticky top-0 z-40 safe-padding-top px-4 py-3 bg-slate-900/95 backdrop-blur-md border-b border-white/8 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="touch-btn flex items-center gap-1 text-sky-400 font-semibold text-sm cursor-pointer border-none bg-transparent py-1 px-1 -ml-1"
        >
          <ArrowLeft size={19} />
          <span>Quay lại</span>
        </button>

        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
          {editingTransaction ? 'Chỉnh sửa giao dịch' : 'Ghi giao dịch'}
        </h2>

        {editingTransaction ? (
          <button
            type="button"
            onClick={handleDelete}
            className="touch-btn text-rose-400 p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 cursor-pointer border-none"
            title="Xóa giao dịch"
          >
            <Trash2 size={17} />
          </button>
        ) : (
          <div className="w-8" />
        )}
      </header>

      {/* 2. Nội dung cuộn chính (pb-24 để cuộn thoải mái trên thanh BottomNav) */}
      <div className="flex-1 overflow-y-auto overscroll-contain pb-24">
        {/* THỨ TỰ 1: CHỌN 1 TRONG 6 LOẠI GIAO DỊCH */}
        <div className="px-4 pt-3.5 pb-2">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setType('EXPENSE')}
              className={`touch-btn py-2 px-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
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
              className={`touch-btn py-2 px-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
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
              onClick={() => setType('LEND')}
              className={`touch-btn py-2 px-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
                type === 'LEND'
                  ? 'bg-amber-500/25 border-amber-500 text-amber-300 shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
                  : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <HandCoins size={14} className="text-amber-400 shrink-0" />
              <span>Cho vay</span>
            </button>

            <button
              type="button"
              onClick={() => setType('BORROW')}
              className={`touch-btn py-2 px-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
                type === 'BORROW'
                  ? 'bg-purple-500/25 border-purple-500 text-purple-300 shadow-md shadow-purple-500/20 ring-1 ring-purple-400'
                  : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <Receipt size={14} className="text-purple-400 shrink-0" />
              <span>Đi vay</span>
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
              className={`touch-btn py-2 px-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
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
              className={`touch-btn py-2 px-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
                type === 'ADJUST'
                  ? 'bg-slate-700/80 border-slate-400 text-slate-200 shadow-md ring-1 ring-slate-300'
                  : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <SlidersHorizontal size={13} className="text-slate-300 shrink-0" />
              <span>Điều chỉnh</span>
            </button>
          </div>
        </div>

        {/* THỨ TỰ 2: SỐ TIỀN & BIỂU THỨC TOÁN HỌC (CHẠM ĐỂ MỞ BÀN PHÍM POPUP) */}
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
              : type === 'TRANSFER'
              ? 'Số tiền chuyển'
              : 'Số dư thực tế mới'}
          </div>

          <div
            className={`font-heading text-4xl font-black tracking-tight leading-none ${
              type === 'EXPENSE'
                ? 'text-rose-400'
                : type === 'INCOME'
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

        {/* THỨ TỰ 3: CHỌN HẠNG MỤC (MẶC ĐỊNH ĐỂ TRỐNG, CÓ NÚT "TẤT CẢ" BÊN PHẢI) */}
        {type !== 'TRANSFER' && type !== 'ADJUST' && (
          <div className="px-4 pt-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Hạng mục
              </label>

              {/* NÚT TẤT CẢ DẪN ĐẾN MÀN HÌNH CHỌN & QUẢN LÝ HẠNG MỤC */}
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

            {/* Ô Hiển thị Hạng mục đang chọn hoặc Khung trống mời chọn */}
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

            {/* Danh mục hay dùng & gắn sao (Tối đa 2 dòng, vuốt ngang nếu nhiều) */}
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

                  {/* Nút Thêm tag mới tại chỗ */}
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

        {/* THỨ TỰ 4: FORMS VÍ TIỀN & THẺ NGÀY THÁNG & GHI CHÚ */}
        <div className="px-4 pt-3 flex flex-col gap-2.5">
          {type === 'TRANSFER' ? (
            /* Layout Chuyển Ví */
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="relative p-3 rounded-2xl bg-slate-900 border border-white/8 flex flex-col justify-between">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Từ ví (Gửi)
                  </div>
                  <div className="text-xs font-bold text-white truncate">
                    {currentWallet?.name || 'Chọn ví'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Số dư: {currentWallet ? formatVND(currentWallet.balance) : '0 ₫'}
                  </div>
                  <select
                    value={selectedWalletId}
                    onChange={(e) => setSelectedWalletId(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-base"
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({formatVND(w.balance)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="relative p-3 rounded-2xl bg-slate-900 border border-white/8 flex flex-col justify-between">
                  <div className="text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-1">
                    Đến ví (Nhận)
                  </div>
                  <div className="text-xs font-bold text-white truncate">
                    {targetWallet?.name || 'Chọn ví nhận'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Số dư: {targetWallet ? formatVND(targetWallet.balance) : '0 ₫'}
                  </div>
                  <select
                    value={toWalletId}
                    onChange={(e) => setToWalletId(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-base"
                  >
                    <option value="">-- Chọn ví nhận --</option>
                    {wallets
                      .filter((w) => w.id !== selectedWalletId)
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({formatVND(w.balance)})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Thẻ ngày */}
              <div className="relative p-3 rounded-2xl bg-slate-900 border border-white/8 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
                    <Calendar size={17} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Ngày chuyển tiền
                    </div>
                    <div className="text-xs font-bold text-white mt-0.5">
                      {formatDisplayDate(date)}
                    </div>
                  </div>
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-base"
                />
              </div>
            </div>
          ) : (
            /* Layout Chuẩn: Ví tiền & Ngày tháng */
            <div className="grid grid-cols-2 gap-2">
              <div className="relative p-3 rounded-2xl bg-slate-900 border border-white/8 flex items-center justify-between">
                <div className="truncate">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {type === 'ADJUST' ? 'Ví cần chỉnh' : 'Tài khoản / Ví'}
                  </div>
                  <div className="text-xs font-bold text-white truncate mt-0.5">
                    {currentWallet?.name || 'Chọn ví'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {currentWallet ? formatVND(currentWallet.balance) : '0 ₫'}
                  </div>
                </div>
                <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 ml-1.5">
                  <WalletIcon size={14} />
                </div>
                <select
                  value={selectedWalletId}
                  onChange={(e) => setSelectedWalletId(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-base"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatVND(w.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative p-3 rounded-2xl bg-slate-900 border border-white/8 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Ngày ghi chép
                  </div>
                  <div className="text-xs font-bold text-white mt-0.5">
                    {formatDisplayDate(date)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Chạm để đổi ngày
                  </div>
                </div>
                <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0 ml-1.5">
                  <Calendar size={14} />
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-base"
                />
              </div>
            </div>
          )}

          {/* Gợi ý vay nợ nếu là LEND / BORROW và chưa chọn mục */}
          {(type === 'LEND' || type === 'BORROW') && !selectedCategoryId && (
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                {type === 'LEND' ? 'Gợi ý người vay' : 'Gợi ý người cho vay'}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {DEFAULT_LEND_BORROW_TAGS.map((tag) => {
                  const isActive = activeTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleTag(tag)}
                      className={`touch-btn px-3 py-1 rounded-full text-xs whitespace-nowrap cursor-pointer flex items-center gap-1 transition-all ${
                        isActive
                          ? 'bg-amber-500 text-slate-900 font-bold border border-amber-300'
                          : 'bg-slate-800 text-slate-300 border border-white/8 hover:text-white'
                      }`}
                    >
                      {isActive && <Check size={12} strokeWidth={3} />}
                      <span>{tag}</span>
                    </button>
                  );
                })}
              </div>
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
                  type === 'LEND'
                    ? 'Nhập tên người vay, lý do, hạn trả...'
                    : type === 'BORROW'
                    ? 'Nhập tên người cho vay, lãi suất, hạn trả...'
                    : type === 'TRANSFER'
                    ? 'Ghi chú chuyển tiền...'
                    : 'Ghi chú chi tiết giao dịch (tùy chọn)...'
                }
                className="input-ios w-full bg-slate-900 border border-white/8 rounded-2xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-500"
              />
            </div>
          )}
        </div>

        {/* NÚT LƯU GIAO DỊCH & NÚT MỞ BÀN PHÍM */}
        <div className="px-4 pt-3 pb-8 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleSave}
            className={`w-full touch-btn touch-bounce h-13 rounded-2xl text-white font-bold flex items-center justify-center gap-2 text-sm shadow-xl cursor-pointer border-none transition-transform active:scale-98 ${
              type === 'EXPENSE'
                ? 'bg-gradient-to-r from-rose-500 to-rose-600 shadow-rose-500/30'
                : type === 'INCOME'
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

      {/* 5. POPUP BÀN PHÍM NUMPAD ĐẨY TỪ DƯỚI LÊN (NỔI TRÊN CÙNG Z-[71]) */}
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
            ? handleSave
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
          // Đồng bộ type tương ứng nếu cần
          if (cat.type === 'EXPENSE') setType('EXPENSE');
          if (cat.type === 'INCOME') setType('INCOME');
          if (cat.type === 'DEBT') {
            if (cat.name === 'Đi vay') setType('BORROW');
            else setType('LEND');
          }
        }}
        initialTab={
          type === 'INCOME'
            ? 'INCOME'
            : type === 'LEND' || type === 'BORROW'
            ? 'DEBT'
            : 'EXPENSE'
        }
      />
    </div>
  );
};

export default TransactionEditorScreen;
