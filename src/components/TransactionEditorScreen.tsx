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
import { TransactionHistoryView } from './TransactionHistoryView';
import { NumpadBottomSheet } from './NumpadBottomSheet';
import { DatePicker } from './ui/DatePicker';
import { WalletSelect } from './ui/WalletSelect';
import { CustomSelect } from './ui/CustomSelect';
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
  ChevronDown,
  ChevronUp,
  Calculator,
  X,
  Star,
  UserCheck,
  Plane,
  EyeOff,
  PlusCircle,
  Edit2,
  History
} from 'lucide-react';

const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_WALLETS: Wallet[] = [];
const EMPTY_TRANSACTIONS: Transaction[] = [];
const EMPTY_EVENTS: EventTrip[] = [];

interface TransactionEditorScreenProps {
  isOpen: boolean;
  onClose: () => void;
  editingTransaction?: Transaction | null;
  onSelectTransactionToEdit?: (tx: Transaction) => void;
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
  'Khách hàng'
];

const QUICK_TRANSFER_FEES = [0, 1100, 3300, 5500, 11000];

function isDebtTransactionType(t: TransactionType): boolean {
  return t === 'LEND' || t === 'BORROW' || t === 'COLLECT_DEBT' || t === 'PAY_DEBT';
}

export const TransactionEditorScreen: React.FC<TransactionEditorScreenProps> = ({
  isOpen,
  onClose,
  editingTransaction,
  onSelectTransactionToEdit
}) => {
  const rawCategories = useLiveQuery(() => db.categories.toArray());
  const rawWallets = useLiveQuery(() => db.wallets.toArray());
  const lastWalletSetting = useLiveQuery(() => db.settings.get('last_used_wallet_id'));
  const savedContactsSetting = useLiveQuery(() => db.settings.get('saved_debt_contacts'));
  const hiddenContactsSetting = useLiveQuery(() => db.settings.get('hidden_debt_contacts'));
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

  // Trạng thái hiển thị Popup Numpad đẩy từ dưới lên (CHỈ DÙNG TRÊN ĐIỆN THOẠI < 768px)
  const [isNumpadOpen, setIsNumpadOpen] = useState(false);

  // Mở màn hình Lịch sử ghi chép (dạng màn hình phẳng)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingFromHistory, setEditingFromHistory] = useState(false);

  const handleCloseOrReturnToHistory = () => {
    if (editingFromHistory) {
      setEditingFromHistory(false);
      if (onSelectTransactionToEdit) {
        onSelectTransactionToEdit(null as any);
      }
      setIsHistoryOpen(true);
      return;
    }
    onClose();
  };

  // Mở màn hình Chọn & Quản lý Hạng mục (dạng màn hình phẳng)
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  // Mở/đóng Dropdown các nghiệp vụ khác (Chuyển ví, Vay nợ, Điều chỉnh số dư)
  const [isOtherTypesDropdownOpen, setIsOtherTypesDropdownOpen] = useState(false);

  // Quick tag thêm mới tại chỗ
  const [isAddingTag, setIsAddingTag] = useState<boolean>(false);
  const [newTagInput, setNewTagInput] = useState<string>('');

  // Quản lý Người vay / Chủ nợ (Thêm, Sửa, Xóa trực tiếp)
  const [isManagingContacts, setIsManagingContacts] = useState<boolean>(false);
  const [editingContactOldName, setEditingContactOldName] = useState<string | null>(null);
  const [editingContactNewName, setEditingContactNewName] = useState<string>('');
  const [newContactInput, setNewContactInput] = useState<string>('');

  const prevIsOpenRef = useRef(false);
  const desktopAmountInputRef = useRef<HTMLInputElement>(null);

  // Danh sách tên người vay / chủ nợ (kết hợp lịch sử giao dịch + danh bạ lưu trữ)
  const existingContacts = useMemo(() => {
    const hiddenSet = new Set<string>(
      Array.isArray(hiddenContactsSetting?.value)
        ? (hiddenContactsSetting.value as string[]).map((s) => s.toLowerCase())
        : []
    );
    const names = new Set<string>();
    const customList = Array.isArray(savedContactsSetting?.value)
      ? (savedContactsSetting.value as string[])
      : DEFAULT_CONTACT_SUGGESTIONS;

    customList.forEach((c) => {
      if (c.trim() && !hiddenSet.has(c.trim().toLowerCase())) {
        names.add(c.trim());
      }
    });

    for (const tx of transactions) {
      if (tx.contactName?.trim() && !hiddenSet.has(tx.contactName.trim().toLowerCase())) {
        names.add(tx.contactName.trim());
      }
    }
    return Array.from(names);
  }, [transactions, savedContactsSetting?.value, hiddenContactsSetting?.value]);

  // Thêm người nợ mới vào danh sách gợi ý
  const handleAddContactPerson = async () => {
    const trimmed = newContactInput.trim();
    if (!trimmed) return;
    const currentList = Array.isArray(savedContactsSetting?.value)
      ? (savedContactsSetting.value as string[])
      : [...DEFAULT_CONTACT_SUGGESTIONS];
    if (!currentList.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      await db.settings.put({
        key: 'saved_debt_contacts',
        value: [trimmed, ...currentList]
      });
    }
    const hiddenList = Array.isArray(hiddenContactsSetting?.value)
      ? (hiddenContactsSetting.value as string[])
      : [];
    if (hiddenList.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      await db.settings.put({
        key: 'hidden_debt_contacts',
        value: hiddenList.filter((c) => c.toLowerCase() !== trimmed.toLowerCase())
      });
    }
    setContactName(trimmed);
    setNewContactInput('');
  };

  // Đổi tên người nợ (cập nhật cả trong danh bạ và các giao dịch nợ đã ghi)
  const handleSaveRenameContact = async (oldName: string) => {
    const newName = editingContactNewName.trim();
    if (!newName || newName === oldName) {
      setEditingContactOldName(null);
      return;
    }
    const currentList = Array.isArray(savedContactsSetting?.value)
      ? (savedContactsSetting.value as string[])
      : [...DEFAULT_CONTACT_SUGGESTIONS];
    const updatedList = currentList.map((c) =>
      c.toLowerCase() === oldName.toLowerCase() ? newName : c
    );
    if (!updatedList.some((c) => c.toLowerCase() === newName.toLowerCase())) {
      updatedList.unshift(newName);
    }
    await db.settings.put({ key: 'saved_debt_contacts', value: updatedList });

    // Cập nhật tên người nợ trong các giao dịch liên quan
    const matchingTxs = transactions.filter(
      (t) => t.contactName?.trim().toLowerCase() === oldName.toLowerCase()
    );
    if (matchingTxs.length > 0) {
      const now = new Date().toISOString();
      await db.transaction('rw', db.transactions, async () => {
        for (const tx of matchingTxs) {
          await db.transactions.update(tx.id, {
            contactName: newName,
            updatedAt: now
          });
        }
      });
    }

    if (contactName.trim().toLowerCase() === oldName.toLowerCase()) {
      setContactName(newName);
    }
    setEditingContactOldName(null);
    setEditingContactNewName('');
  };

  // Xóa người nợ khỏi danh sách gợi ý
  const handleDeleteContactPerson = async (personName: string) => {
    const currentList = Array.isArray(savedContactsSetting?.value)
      ? (savedContactsSetting.value as string[])
      : [...DEFAULT_CONTACT_SUGGESTIONS];
    await db.settings.put({
      key: 'saved_debt_contacts',
      value: currentList.filter((c) => c.toLowerCase() !== personName.toLowerCase())
    });

    const hiddenList = Array.isArray(hiddenContactsSetting?.value)
      ? (hiddenContactsSetting.value as string[])
      : [];
    if (!hiddenList.some((c) => c.toLowerCase() === personName.toLowerCase())) {
      await db.settings.put({
        key: 'hidden_debt_contacts',
        value: [...hiddenList, personName]
      });
    }

    if (contactName.trim().toLowerCase() === personName.toLowerCase()) {
      setContactName('');
    }
  };

  // Thống kê số lần sử dụng của mỗi hạng mục
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
      if (c.id === 'system_adjustment') return false;
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
      // Bàn phím numpad lúc mới vào không tự mở, chỉ khi user bấm vào số tiền để điền thì mới mở lên
      setIsNumpadOpen(false);

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
        handleCloseOrReturnToHistory();
        return;
      } catch (err: any) {
        setErrorMsg(err?.message || 'Có lỗi khi điều chỉnh số dư');
        return;
      }
    } else if (type === 'EXPENSE') {
      if (!selectedCategoryId || !selectedCategory || !selectedCategory.parentId) {
        setErrorMsg(
          'Vui lòng chọn (hoặc thêm mới) một hạng mục con thuộc Must have, Nice to have hoặc Wasted'
        );
        return;
      }
    } else if (type === 'INCOME') {
      if (!selectedCategoryId || !selectedCategory) {
        setErrorMsg('Vui lòng chọn hạng mục cho khoản thu nhập');
        return;
      }
    }

    const parsedTransferFee =
      type === 'TRANSFER'
        ? Math.max(0, parseInt(transferFeeStr.replace(/\D/g, ''), 10) || 0)
        : undefined;
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
        handleCloseOrReturnToHistory();
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
          setAmountStr('0');
          setNote('');
          setTransferFeeStr('0');
          setExcludeFromReport(false);
          setIsNumpadOpen(false);
          setToastMsg(`Đã lưu ${formatVND(finalAmount)}! Mời nhập khoản tiếp theo...`);
          setTimeout(() => setToastMsg(''), 2500);
        } else {
          handleCloseOrReturnToHistory();
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi xảy ra khi lưu giao dịch');
    }
  };

  const handleDelete = async () => {
    if (!editingTransaction) return;
    if (
      window.confirm(
        'Bạn có chắc chắn muốn xóa giao dịch này? Số dư ví sẽ được tự động hoàn tác.'
      )
    ) {
      try {
        await deleteTransaction(editingTransaction.id);
        handleCloseOrReturnToHistory();
      } catch (err: any) {
        setErrorMsg(err?.message || 'Lỗi khi xóa giao dịch');
      }
    }
  };

  if (!isOpen) return null;

  // Nếu đang mở màn hình Lịch sử ghi chép -> hiển thị dạng phẳng toàn màn hình
  if (isHistoryOpen) {
    return (
      <TransactionHistoryView
        onClose={() => setIsHistoryOpen(false)}
        onEditTransaction={(tx) => {
          setIsHistoryOpen(false);
          setEditingFromHistory(true);
          if (onSelectTransactionToEdit) {
            onSelectTransactionToEdit(tx);
          }
        }}
      />
    );
  }

  // Nếu đang mở màn hình Chọn & Quản lý Hạng mục -> hiển thị thẳng trên màn hình phẳng (không bật Popup)
  if (isCategoryManagerOpen) {
    return (
      <CategoryManagerScreen
        isOpen={true}
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
          type === 'INCOME' ? 'INCOME' : isDebtTransactionType(type) ? 'DEBT' : 'EXPENSE'
        }
      />
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto pb-28 animate-fade-in font-body text-slate-100">
      {/* 1. Header Bar phẳng cân đối */}
      <div className="px-4 py-3 bg-slate-900/95 border-b border-white/8 flex items-center justify-between gap-2">
        {/* Nút quay lại chỉ hiện icon kèm border */}
        <div className="w-20 shrink-0 flex items-center justify-start">
          <button
            type="button"
            onClick={handleCloseOrReturnToHistory}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
        </div>

        {/* Tiêu đề chính giữa cân đối */}
        <div className="flex-1 text-center min-w-0">
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider truncate m-0">
            {editingTransaction ? 'Chỉnh sửa giao dịch' : 'Ghi giao dịch'}
          </h2>
        </div>

        {/* Cột phải cân xứng: Icon Lịch sử ghi chép đối xứng nút Quay lại (kèm nút xóa nếu đang sửa) */}
        <div className="w-20 shrink-0 flex items-center justify-end gap-1.5">
          {editingTransaction && (
            <button
              type="button"
              onClick={handleDelete}
              className="touch-btn w-9 h-9 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 flex items-center justify-center cursor-pointer transition-colors"
              title="Xóa giao dịch"
            >
              <Trash2 size={17} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-sky-400 hover:text-sky-300 flex items-center justify-center cursor-pointer transition-colors"
            title="Lịch sử ghi chép"
          >
            <History size={18} />
          </button>
        </div>
      </div>

      {/* 2. Nội dung phẳng chính */}
      <div className="flex flex-col">
        {toastMsg && (
          <div className="mx-4 mt-3 p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs text-center font-bold animate-fade-in">
            {toastMsg}
          </div>
        )}

        {/* THỨ TỰ 1: CHỌN LOẠI GIAO DỊCH (2 nút chính + Dropdown Nghiệp vụ khác chống tràn trên Mobile) */}
        <div className="px-4 pt-3.5 pb-2 flex flex-col gap-2">
          {/* Hàng 1: 2 nút chính Chi tiền & Thu tiền (mỗi nút 50% chiều ngang, cao bằng nhau tuyệt đối) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setType('EXPENSE');
                setIsOtherTypesDropdownOpen(false);
              }}
              className={`touch-btn h-11 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-extrabold whitespace-nowrap cursor-pointer transition-all ${
                type === 'EXPENSE'
                  ? 'bg-rose-500/25 border-rose-500 text-rose-300 shadow-md shadow-rose-500/20 ring-1 ring-rose-400'
                  : 'bg-slate-800/80 border-white/8 text-slate-300 hover:text-white'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              <span>Chi tiền</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setType('INCOME');
                setIsOtherTypesDropdownOpen(false);
              }}
              className={`touch-btn h-11 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-extrabold whitespace-nowrap cursor-pointer transition-all ${
                type === 'INCOME'
                  ? 'bg-emerald-500/25 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400'
                  : 'bg-slate-800/80 border-white/8 text-slate-300 hover:text-white'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Thu tiền</span>
            </button>
          </div>

          {/* Hàng 2: Thanh Dropdown chọn các nghiệp vụ khác (Chuyển ví, Sổ nợ, Điều chỉnh) - bấm để mở bên dưới */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/90 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsOtherTypesDropdownOpen(!isOtherTypesDropdownOpen)}
              className={`w-full h-11 px-3.5 flex items-center justify-between gap-2 text-left cursor-pointer border-none transition-colors ${
                type !== 'EXPENSE' && type !== 'INCOME'
                  ? 'bg-sky-500/15 text-sky-300'
                  : 'bg-transparent text-slate-300 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <ArrowRightLeft size={14} className="text-sky-400 shrink-0" />
                <span className="text-xs font-bold truncate">
                  {type === 'TRANSFER'
                    ? 'Đang chọn: Chuyển tiền giữa các ví'
                    : type === 'ADJUST'
                    ? 'Đang chọn: Điều chỉnh số dư thực tế'
                    : type === 'LEND'
                    ? 'Đang chọn: Cho vay (Sổ nợ)'
                    : type === 'BORROW'
                    ? 'Đang chọn: Đi vay (Sổ nợ)'
                    : type === 'COLLECT_DEBT'
                    ? 'Đang chọn: Thu nợ (Sổ nợ)'
                    : type === 'PAY_DEBT'
                    ? 'Đang chọn: Trả nợ (Sổ nợ)'
                    : 'Nghiệp vụ khác: Chuyển ví • Vay nợ • Điều chỉnh'}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0 text-[11px] font-semibold text-sky-400">
                <span>{isOtherTypesDropdownOpen ? 'Thu gọn' : 'Mở chọn'}</span>
                {isOtherTypesDropdownOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </div>
            </button>

            {/* Danh sách xổ xuống bên dưới khi bấm vào Dropdown */}
            {isOtherTypesDropdownOpen && (
              <div className="p-2.5 border-t border-white/8 grid grid-cols-2 gap-2 bg-slate-950/60">
                <button
                  type="button"
                  onClick={() => {
                    setType('TRANSFER');
                    if (!toWalletId || toWalletId === selectedWalletId) {
                      const alt = wallets.find((w) => w.id !== selectedWalletId);
                      if (alt) setToWalletId(alt.id);
                    }
                    setIsOtherTypesDropdownOpen(false);
                  }}
                  className={`touch-btn h-11 px-3 rounded-xl border flex items-center gap-2 text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    type === 'TRANSFER'
                      ? 'bg-sky-500/25 border-sky-400 text-sky-300 ring-1 ring-sky-400'
                      : 'bg-slate-800/80 border-white/6 text-slate-300 hover:text-white'
                  }`}
                >
                  <ArrowRightLeft size={14} className="text-sky-400 shrink-0" />
                  <span className="truncate">Chuyển ví</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setType('ADJUST');
                    if (currentWallet && amountStr === '0') {
                      setAmountStr(currentWallet.balance.toString());
                    }
                    setIsOtherTypesDropdownOpen(false);
                  }}
                  className={`touch-btn h-11 px-3 rounded-xl border flex items-center gap-2 text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    type === 'ADJUST'
                      ? 'bg-slate-700 border-slate-400 text-white ring-1 ring-slate-300'
                      : 'bg-slate-800/80 border-white/6 text-slate-300 hover:text-white'
                  }`}
                >
                  <SlidersHorizontal size={14} className="text-slate-300 shrink-0" />
                  <span className="truncate">Điều chỉnh số dư</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setType('LEND');
                    setIsOtherTypesDropdownOpen(false);
                  }}
                  className={`touch-btn h-11 px-3 rounded-xl border flex items-center gap-2 text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    type === 'LEND'
                      ? 'bg-amber-500/25 border-amber-500 text-amber-300 ring-1 ring-amber-400'
                      : 'bg-slate-800/80 border-white/6 text-slate-300 hover:text-white'
                  }`}
                >
                  <HandCoins size={14} className="text-amber-400 shrink-0" />
                  <span className="truncate">Cho vay</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setType('BORROW');
                    setIsOtherTypesDropdownOpen(false);
                  }}
                  className={`touch-btn h-11 px-3 rounded-xl border flex items-center gap-2 text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    type === 'BORROW'
                      ? 'bg-purple-500/25 border-purple-500 text-purple-300 ring-1 ring-purple-400'
                      : 'bg-slate-800/80 border-white/6 text-slate-300 hover:text-white'
                  }`}
                >
                  <Receipt size={14} className="text-purple-400 shrink-0" />
                  <span className="truncate">Đi vay</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setType('COLLECT_DEBT');
                    setIsOtherTypesDropdownOpen(false);
                  }}
                  className={`touch-btn h-11 px-3 rounded-xl border flex items-center gap-2 text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    type === 'COLLECT_DEBT'
                      ? 'bg-teal-500/25 border-teal-500 text-teal-300 ring-1 ring-teal-400'
                      : 'bg-slate-800/80 border-white/6 text-slate-300 hover:text-white'
                  }`}
                >
                  <PiggyBank size={14} className="text-teal-400 shrink-0" />
                  <span className="truncate">Thu nợ</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setType('PAY_DEBT');
                    setIsOtherTypesDropdownOpen(false);
                  }}
                  className={`touch-btn h-11 px-3 rounded-xl border flex items-center gap-2 text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    type === 'PAY_DEBT'
                      ? 'bg-orange-500/25 border-orange-500 text-orange-300 ring-1 ring-orange-400'
                      : 'bg-slate-800/80 border-white/6 text-slate-300 hover:text-white'
                  }`}
                >
                  <CreditCard size={14} className="text-orange-400 shrink-0" />
                  <span className="truncate">Trả nợ</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* THỨ TỰ 2: KHUNG SỐ TIỀN
            - Trên Điện thoại (md:hidden): chạm để mở Popup bàn phím số NumpadBottomSheet.
            - Trên Web PC (hidden md:flex): ô nhập trực tiếp bằng bàn phím máy tính, KHÔNG mở Popup bàn phím số.
        */}
        {/* 2A. Giao diện nhập tiền trên Điện thoại (< md) */}
        <div
          onClick={() => setIsNumpadOpen(true)}
          className="md:hidden px-5 py-3 mx-4 rounded-2xl bg-slate-900/90 border border-white/8 text-center shadow-lg cursor-pointer hover:border-sky-400/40 active:scale-98 transition-all relative group"
        >
          <div className="absolute top-2.5 right-3 text-slate-500 group-hover:text-sky-400 flex items-center gap-1 text-[11px] font-semibold transition-colors">
            <Calculator size={14} />
            <span>Bàn phím số</span>
          </div>

          <div
            className={`text-xs font-medium min-h-[20px] mb-1 ${
              hasOperator ? 'text-sky-400 tracking-wider' : 'text-slate-400'
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
            <span>Chạm vào đây để mở bàn phím số</span>
          </div>
        </div>

        {/* 2B. Giao diện nhập tiền phẳng trực tiếp trên Web PC (hidden md:flex) - BỎ HOÀN TOÀN BÀN PHÍM POPUP */}
        <div className="hidden md:flex flex-col gap-2 px-5 py-4 mx-4 rounded-2xl bg-slate-900/95 border border-white/10 shadow-lg">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {type === 'EXPENSE'
                ? 'Nhập số tiền chi (VNĐ hoặc phép tính + - * /)'
                : type === 'INCOME'
                ? 'Nhập số tiền thu (VNĐ hoặc phép tính + - * /)'
                : type === 'LEND'
                ? 'Nhập số tiền cho vay (VNĐ)'
                : type === 'BORROW'
                ? 'Nhập số tiền đi vay (VNĐ)'
                : type === 'COLLECT_DEBT'
                ? 'Nhập số tiền thu nợ (VNĐ)'
                : type === 'PAY_DEBT'
                ? 'Nhập số tiền trả nợ (VNĐ)'
                : type === 'TRANSFER'
                ? 'Nhập số tiền chuyển ví (VNĐ)'
                : 'Nhập số dư thực tế mới (VNĐ)'}
            </label>
            <span className="text-xs font-extrabold text-sky-400">
              Thành tiền: {formatVND(currentComputedAmount)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={desktopAmountInputRef}
              type="text"
              value={
                hasOperator
                  ? amountStr
                  : amountStr === '0'
                  ? ''
                  : new Intl.NumberFormat('vi-VN').format(Number(amountStr) || 0)
              }
              onChange={(e) => {
                setErrorMsg('');
                const raw = e.target.value;
                if (/[+\-*/]/.test(raw)) {
                  const cleaned = raw.replace(/[^0-9+\-*/]/g, '');
                  setAmountStr(cleaned || '0');
                } else {
                  const digits = raw.replace(/\D/g, '');
                  setAmountStr(digits || '0');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave(false);
                }
              }}
              placeholder="Gõ số tiền trực tiếp từ bàn phím PC (VD: 50.000 hoặc 35000+15000)..."
              className={`input-ios flex-1 bg-slate-800/90 border border-white/15 focus:border-sky-400 rounded-xl px-4 py-3 font-heading text-2xl font-black tracking-tight outline-none ${
                type === 'EXPENSE' || type === 'PAY_DEBT'
                  ? 'text-rose-400'
                  : type === 'INCOME' || type === 'COLLECT_DEBT'
                  ? 'text-emerald-400'
                  : type === 'LEND'
                  ? 'text-amber-400'
                  : type === 'BORROW'
                  ? 'text-purple-400'
                  : 'text-sky-400'
              }`}
              autoFocus
            />

            <button
              type="button"
              onClick={() => handleKeyPress('000')}
              className="px-3.5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-sky-400 font-extrabold text-sm cursor-pointer shrink-0"
              title="Thêm 3 số 0 (.000)"
            >
              +000
            </button>

            <button
              type="button"
              onClick={() => setAmountStr('0')}
              className="px-3.5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-400 hover:text-rose-400 font-bold text-sm cursor-pointer shrink-0"
              title="Xóa số tiền"
            >
              Xóa
            </button>
          </div>

          {type === 'ADJUST' && currentWallet && (
            <div className="text-xs flex items-center gap-2 font-medium pt-1">
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
        </div>

        {errorMsg && (
          <div className="mx-4 mt-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs text-center font-medium">
            {errorMsg}
          </div>
        )}

        {/* THỨ TỰ 3: CHỌN & QUẢN LÝ HẠNG MỤC */}
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
                <span>Tất cả / Thêm Sửa Xóa</span>
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
                <div className="flex items-center gap-2.5 text-slate-400 text-xs py-0.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-800 border border-white/5 flex items-center justify-center text-slate-400">
                    <Plus size={16} />
                  </div>
                  <span>Chạm để chọn hoặc thêm/sửa/xóa hạng mục...</span>
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
                    <span>Chọn nhanh hạng mục</span>
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

        {/* THỨ TỰ 4: FORMS VÍ TIỀN, NGƯỜI VAY/CHỦ NỢ (CÓ THÊM/SỬA/XÓA), NGÀY & GHI CHÚ */}
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

          {/* Ô Nhập & Quản lý Người Vay / Chủ Nợ (Thêm / Sửa / Xóa trực tiếp) */}
          {isDebtTransactionType(type) && (
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-amber-500/25 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck size={14} />
                  <span>
                    {type === 'LEND' || type === 'COLLECT_DEBT'
                      ? 'Người vay tiền (Con nợ)'
                      : 'Người cho vay (Chủ nợ)'}
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => setIsManagingContacts(!isManagingContacts)}
                  className="text-[11px] font-bold text-sky-400 hover:text-sky-300 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-400/20 cursor-pointer"
                >
                  {isManagingContacts ? 'Đóng quản lý' : 'Thêm / Sửa / Xóa người nợ'}
                </button>
              </div>

              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Nhập tên người giao dịch (VD: Anh Nam, Chị Lan...)"
                className="input-ios w-full bg-slate-800/90 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />

              {/* Chế độ chọn nhanh người nợ */}
              {!isManagingContacts && existingContacts.length > 0 && (
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

              {/* Chế độ Quản lý phẳng: Thêm / Sửa tên / Xóa người nợ */}
              {isManagingContacts && (
                <div className="p-3 rounded-xl bg-slate-800/70 border border-white/8 flex flex-col gap-2.5 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newContactInput}
                      onChange={(e) => setNewContactInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddContactPerson();
                        }
                      }}
                      placeholder="Thêm người vay / chủ nợ mới..."
                      className="input-ios flex-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddContactPerson}
                      className="px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs border-none cursor-pointer shrink-0"
                    >
                      + Thêm
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
                    {existingContacts.map((person) => {
                      const isRenaming = editingContactOldName === person;
                      return (
                        <div
                          key={person}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-900/90 border border-white/5"
                        >
                          {isRenaming ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <input
                                type="text"
                                value={editingContactNewName}
                                onChange={(e) => setEditingContactNewName(e.target.value)}
                                className="input-ios flex-1 bg-slate-800 border border-sky-400 rounded-lg px-2.5 py-1 text-xs text-white"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveRenameContact(person)}
                                className="px-2.5 py-1 rounded-lg bg-sky-500 text-slate-950 font-bold text-xs border-none cursor-pointer"
                              >
                                Lưu
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingContactOldName(null)}
                                className="px-2 py-1 rounded-lg bg-slate-800 text-slate-400 text-xs border-none cursor-pointer"
                              >
                                Hủy
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setContactName(person)}
                                className="text-xs font-semibold text-slate-200 hover:text-amber-300 bg-transparent border-none cursor-pointer text-left flex-1 truncate"
                              >
                                {person}
                              </button>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingContactOldName(person);
                                    setEditingContactNewName(person);
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-sky-400 border-none cursor-pointer"
                                  title="Sửa tên người nợ"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteContactPerson(person)}
                                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 border-none cursor-pointer"
                                  title="Xóa khỏi danh sách"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
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

          {/* Tùy chọn nâng cao cho Khoản Thu/Chi */}
          {(type === 'EXPENSE' || type === 'INCOME') && (
            <div className="flex flex-col gap-2 pt-0.5">
              {activeEvents.length > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-900 border border-white/8">
                  <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                    <Plane size={14} className="text-sky-400" />
                    <span>Sự kiện / Chuyến đi</span>
                  </span>
                  <CustomSelect
                    value={eventId}
                    onChange={setEventId}
                    options={[
                      { value: '', label: '-- Không gắn sự kiện --' },
                      ...activeEvents.map((ev) => ({
                        value: ev.id,
                        label: ev.name
                      }))
                    ]}
                    className="max-w-[200px]"
                    triggerClassName="py-1 px-2.5 text-xs rounded-xl bg-slate-800 border-white/10"
                  />
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

        {/* NÚT LƯU GIAO DỊCH & LƯU GHI TIẾP */}
        <div className="px-4 pt-4 pb-8 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            {!editingTransaction && type !== 'ADJUST' && (
              <button
                type="button"
                onClick={() => handleSave(true)}
                className="touch-btn h-13 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-sky-400/30 text-sky-300 font-bold flex items-center justify-center gap-1.5 text-xs cursor-pointer shrink-0 transition-all"
                title="Lưu khoản này và giữ màn hình để nhập tiếp khoản khác"
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

          {/* Nút mở bàn phím số CHỈ HIỂN THỊ TRÊN ĐIỆN THOẠI (< md) */}
          <button
            type="button"
            onClick={() => setIsNumpadOpen(true)}
            className="md:hidden w-full touch-btn py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-white/6 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Calculator size={15} className="text-sky-400" />
            <span>Mở bàn phím tính toán số tiền</span>
          </button>
        </div>
      </div>

      {/* 5. POPUP BÀN PHÍM NUMPAD CHỈ HIỂN THỊ TRÊN ĐIỆN THOẠI (Render qua Portal gắn vào document.body) */}
      <NumpadBottomSheet
        isOpen={isNumpadOpen}
        onClose={() => {
          if (hasOperator) {
            handleKeyPress('=');
          }
          setIsNumpadOpen(false);
        }}
        type={type}
        amountStr={amountStr}
        computedAmount={currentComputedAmount}
        hasOperator={hasOperator}
        onKeyPress={handleKeyPress}
        currentWalletBalance={currentWallet?.balance}
        adjustDiff={adjustDiff}
      />
    </div>
  );
};

export default TransactionEditorScreen;
