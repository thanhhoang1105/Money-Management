// src/components/TransactionListTab.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Transaction, Category, Wallet, EventTrip } from '../types';
import {
  createTransaction,
  deleteTransaction,
  SYSTEM_ADJUSTMENT_CATEGORY_ID
} from '../services/transactionService';
import { CategoryIcon } from './CategoryIcon';
import { BankLogo, detectBankBrand } from './BankLogo';
import {
  formatVND,
  formatFriendlyDate,
  formatMonthDisplay,
  getCurrentMonth,
  getPreviousMonth,
  getCurrentDate,
  getCurrentTime
} from '../utils/formatters';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Edit3,
  Copy,
  Calendar,
  Wallet as WalletIcon,
  Search,
  X,
  Filter,
  UserCheck,
  Plane,
  EyeOff,
  HandCoins,
  Plus,
  CheckCircle2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface TransactionListTabProps {
  onEditTransaction: (tx: Transaction) => void;
  onOpenQuickAdd: () => void;
}

type TypeFilterOption =
  | 'ALL'
  | 'EXPENSE'
  | 'INCOME'
  | 'TRANSFER'
  | 'LEND'
  | 'BORROW'
  | 'COLLECT_DEBT'
  | 'PAY_DEBT'
  | 'ADJUST';

export const TransactionListTab: React.FC<TransactionListTabProps> = ({
  onEditTransaction,
  onOpenQuickAdd
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<TypeFilterOption>('ALL');
  const [walletFilter, setWalletFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Trạng thái mở rộng phẳng (Inline) thay cho Popup
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(false);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [duplicateFeedback, setDuplicateFeedback] = useState<string>('');

  // Trạng thái cho bảng Theo dõi Vay / Nợ ngay trên màn hình Tổng quan
  const [isAddingDebtQuick, setIsAddingDebtQuick] = useState<boolean>(false);
  const [debtContactInput, setDebtContactInput] = useState<string>('');
  const [debtTypeInput, setDebtTypeInput] = useState<
    'LEND' | 'BORROW' | 'COLLECT_DEBT' | 'PAY_DEBT'
  >('LEND');
  const [debtAmountInput, setDebtAmountInput] = useState<string>('');
  const [debtWalletIdInput, setDebtWalletIdInput] = useState<string>('');
  const [debtNoteInput, setDebtNoteInput] = useState<string>('');

  const [settleDebtInline, setSettleDebtInline] = useState<{
    contactName: string;
    mode: 'COLLECT_DEBT' | 'PAY_DEBT';
  } | null>(null);
  const [settleAmountInput, setSettleAmountInput] = useState<string>('');
  const [settleWalletIdInput, setSettleWalletIdInput] = useState<string>('');
  const [expandedDebtContact, setExpandedDebtContact] = useState<string | null>(null);
  const [showSettledDebts, setShowSettledDebts] = useState<boolean>(false);

  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const events = useLiveQuery(() => db.events.toArray()) || [];
  const savedContactsSetting = useLiveQuery(() => db.settings.get('saved_debt_contacts'));

  // Toàn bộ giao dịch Vay / Nợ xuyên suốt các tháng để tính chính xác Ai đang nợ mình & Đang nợ ai
  const allDebtTransactions =
    useLiveQuery(async () => {
      return await db.transactions
        .filter(
          (tx) =>
            tx.type === 'LEND' ||
            tx.type === 'BORROW' ||
            tx.type === 'COLLECT_DEBT' ||
            tx.type === 'PAY_DEBT'
        )
        .reverse()
        .sortBy('date');
    }, []) || [];

  const allMonthTransactions =
    useLiveQuery(async () => {
      return await db.transactions
        .filter((tx) => tx.date.startsWith(selectedMonth))
        .reverse()
        .sortBy('date');
    }, [selectedMonth]) || [];

  const categoryMap = useMemo(() => {
    return new Map<string, Category>(categories.map((c) => [c.id, c]));
  }, [categories]);

  const walletMap = useMemo(() => {
    return new Map<string, Wallet>(wallets.map((w) => [w.id, w]));
  }, [wallets]);

  const eventMap = useMemo(() => {
    return new Map<string, EventTrip>(events.map((ev) => [ev.id, ev]));
  }, [events]);

  const totalBalance = useMemo(() => {
    return wallets
      .filter((w) => !w.isExcludedFromTotal)
      .reduce((sum, w) => sum + w.balance, 0);
  }, [wallets]);

  // Tổng hợp Sổ Vay / Nợ ngay trên Tổng quan: Ai đang nợ mình (Cần thu) & Đang nợ ai (Phải trả)
  const debtOverview = useMemo(() => {
    const map = new Map<
      string,
      {
        contactName: string;
        lent: number;
        collected: number;
        borrowed: number;
        paid: number;
        txs: Transaction[];
      }
    >();

    const savedNames = Array.isArray(savedContactsSetting?.value)
      ? (savedContactsSetting.value as string[])
      : [];
    savedNames.forEach((n) => {
      const clean = n.trim();
      if (clean) {
        map.set(clean.toLowerCase(), {
          contactName: clean,
          lent: 0,
          collected: 0,
          borrowed: 0,
          paid: 0,
          txs: []
        });
      }
    });

    allDebtTransactions.forEach((tx) => {
      const name =
        tx.contactName?.trim() || (tx.note?.trim() ? tx.note.trim() : 'Chưa ghi tên');
      const key = name.toLowerCase();
      const entry = map.get(key) || {
        contactName: name,
        lent: 0,
        collected: 0,
        borrowed: 0,
        paid: 0,
        txs: []
      };
      entry.txs.push(tx);
      if (tx.type === 'LEND') entry.lent += tx.amount;
      if (tx.type === 'COLLECT_DEBT') entry.collected += tx.amount;
      if (tx.type === 'BORROW') entry.borrowed += tx.amount;
      if (tx.type === 'PAY_DEBT') entry.paid += tx.amount;
      map.set(key, entry);
    });

    let totalReceivable = 0;
    let totalPayable = 0;

    const allContacts = Array.from(map.values())
      .filter(
        (c) =>
          c.txs.length > 0 ||
          savedNames.some((s) => s.toLowerCase() === c.contactName.toLowerCase())
      )
      .map((c) => {
        const receivable = Math.max(0, c.lent - c.collected);
        const payable = Math.max(0, c.borrowed - c.paid);
        totalReceivable += receivable;
        totalPayable += payable;
        return {
          ...c,
          receivable,
          payable
        };
      });

    // Danh sách người đang nợ mình (receivable > 0)
    const whoOwesMe = allContacts.filter((c) => c.receivable > 0);
    // Danh sách người mình đang nợ (payable > 0)
    const whoIOwe = allContacts.filter((c) => c.payable > 0);
    // Danh sách đã tất toán (receivable === 0 && payable === 0)
    const settledList = allContacts.filter((c) => c.receivable === 0 && c.payable === 0);

    return {
      allContacts,
      whoOwesMe,
      whoIOwe,
      settledList,
      totalReceivable,
      totalPayable
    };
  }, [allDebtTransactions, savedContactsSetting?.value]);

  // Tính tổng Thu & Chi thuần của tháng đang chọn
  const { monthIncome, monthExpense } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    allMonthTransactions.forEach((tx) => {
      if (tx.excludeFromReport) return;
      if (tx.type === 'INCOME') inc += tx.amount;
      if (tx.type === 'EXPENSE') exp += tx.amount;
      if (tx.type === 'TRANSFER' && tx.transferFee && tx.transferFee > 0) {
        exp += tx.transferFee;
      }
    });
    return { monthIncome: inc, monthExpense: exp };
  }, [allMonthTransactions]);

  // LOGIC LỌC ĐA NĂNG
  const filteredTransactions = useMemo(() => {
    return allMonthTransactions.filter((tx) => {
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) {
        return false;
      }

      if (walletFilter !== 'ALL') {
        if (tx.type === 'TRANSFER') {
          if (tx.walletId !== walletFilter && tx.toWalletId !== walletFilter) {
            return false;
          }
        } else if (tx.walletId !== walletFilter) {
          return false;
        }
      }

      if (categoryFilter !== 'ALL') {
        if (tx.categoryId !== categoryFilter) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
        const wallet = walletMap.get(tx.walletId);
        const toWallet = tx.toWalletId ? walletMap.get(tx.toWalletId) : undefined;

        const noteMatch = tx.note?.toLowerCase().includes(q) || false;
        const contactMatch = tx.contactName?.toLowerCase().includes(q) || false;
        const catMatch = cat?.name.toLowerCase().includes(q) || false;
        const walletMatch = wallet?.name.toLowerCase().includes(q) || false;
        const toWalletMatch = toWallet?.name.toLowerCase().includes(q) || false;
        const amountMatch = tx.amount.toString().includes(q);

        if (
          !noteMatch &&
          !contactMatch &&
          !catMatch &&
          !walletMatch &&
          !toWalletMatch &&
          !amountMatch
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    allMonthTransactions,
    typeFilter,
    walletFilter,
    categoryFilter,
    searchQuery,
    categoryMap,
    walletMap
  ]);

  const isFiltered =
    typeFilter !== 'ALL' ||
    walletFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    searchQuery.trim().length > 0;

  const advancedFilterCount =
    (walletFilter !== 'ALL' ? 1 : 0) + (categoryFilter !== 'ALL' ? 1 : 0);

  const { filteredIncome, filteredExpense } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    filteredTransactions.forEach((tx) => {
      if (tx.excludeFromReport) return;
      if (tx.type === 'INCOME') inc += tx.amount;
      if (tx.type === 'EXPENSE') exp += tx.amount;
      if (tx.type === 'TRANSFER' && tx.transferFee && tx.transferFee > 0) {
        exp += tx.transferFee;
      }
    });
    return { filteredIncome: inc, filteredExpense: exp };
  }, [filteredTransactions]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setTypeFilter('ALL');
    setWalletFilter('ALL');
    setCategoryFilter('ALL');
  };

  const handlePrevMonth = () => {
    setSelectedMonth((prev) => getPreviousMonth(prev));
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-');
    let y = parseInt(year, 10);
    let m = parseInt(month, 10) + 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  };

  const groupedTransactions = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    filteredTransactions.forEach((tx) => {
      if (!groups[tx.date]) {
        groups[tx.date] = [];
      }
      groups[tx.date].push(tx);
    });
    return groups;
  }, [filteredTransactions]);

  const sortedDates = useMemo(() => {
    return Object.keys(groupedTransactions).sort((a, b) => b.localeCompare(a));
  }, [groupedTransactions]);

  const handleDelete = async (id: string) => {
    if (
      window.confirm(
        'Bạn có chắc muốn xóa giao dịch này? Số dư ví sẽ được tự động hoàn tác chính xác.'
      )
    ) {
      await deleteTransaction(id);
      setExpandedTxId(null);
    }
  };

  const handleDuplicate = async (tx: Transaction) => {
    try {
      const today = getCurrentDate();
      await createTransaction({
        walletId: tx.walletId,
        toWalletId: tx.toWalletId,
        categoryId: tx.categoryId,
        type: tx.type,
        amount: tx.amount,
        transferFee: tx.transferFee,
        contactName: tx.contactName,
        eventId: tx.eventId,
        excludeFromReport: tx.excludeFromReport,
        date: today,
        time: getCurrentTime(),
        note: tx.note
      });
      setExpandedTxId(null);
      setSelectedMonth(today.slice(0, 7));
      setDuplicateFeedback(`Đã nhân bản giao dịch ${formatVND(tx.amount)} sang hôm nay!`);
      setTimeout(() => setDuplicateFeedback(''), 2800);
    } catch (err: any) {
      alert(err?.message || 'Lỗi khi nhân bản giao dịch');
    }
  };

  // Ghi nhanh khoản Vay / Nợ mới ngay trên Tổng quan
  const handleQuickCreateDebt = async () => {
    const person = debtContactInput.trim();
    if (!person) {
      alert('Vui lòng nhập tên người vay / chủ nợ');
      return;
    }
    const amount = Number(debtAmountInput.replace(/\D/g, ''));
    if (!amount || amount <= 0) {
      alert('Vui lòng nhập số tiền lớn hơn 0');
      return;
    }
    const walletId = debtWalletIdInput || wallets[0]?.id;
    if (!walletId) {
      alert('Chưa có ví tiền để ghi nhận');
      return;
    }

    const targetNameMap: Record<string, string> = {
      LEND: 'cho vay',
      BORROW: 'đi vay',
      COLLECT_DEBT: 'thu nợ',
      PAY_DEBT: 'trả nợ'
    };
    const debtCat = categories.find(
      (c) => c.type === 'DEBT' && c.name.trim().toLowerCase() === targetNameMap[debtTypeInput]
    );

    const today = getCurrentDate();
    await createTransaction({
      walletId,
      categoryId: debtCat?.id,
      type: debtTypeInput,
      amount,
      contactName: person,
      date: today,
      time: getCurrentTime(),
      note: debtNoteInput.trim() || `${debtCat?.name || 'Vay nợ'} - ${person}`
    });

    const currentSaved = Array.isArray(savedContactsSetting?.value)
      ? (savedContactsSetting.value as string[])
      : [];
    if (!currentSaved.some((s) => s.toLowerCase() === person.toLowerCase())) {
      await db.settings.put({
        key: 'saved_debt_contacts',
        value: [person, ...currentSaved]
      });
    }

    setIsAddingDebtQuick(false);
    setDebtContactInput('');
    setDebtAmountInput('');
    setDebtNoteInput('');
    setDuplicateFeedback(`Đã ghi nhận khoản vay/nợ của "${person}" (${formatVND(amount)})!`);
    setTimeout(() => setDuplicateFeedback(''), 3000);
  };

  // Thu nợ / Trả nợ trực tiếp 1 chạm ngay trên Tổng quan
  const handleConfirmSettleDebt = async () => {
    if (!settleDebtInline) return;
    const amount = Number(settleAmountInput.replace(/\D/g, ''));
    if (!amount || amount <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ lớn hơn 0');
      return;
    }
    const walletId = settleWalletIdInput || wallets[0]?.id;
    if (!walletId) return;

    const targetCatName = settleDebtInline.mode === 'COLLECT_DEBT' ? 'thu nợ' : 'trả nợ';
    const debtCat = categories.find(
      (c) => c.type === 'DEBT' && c.name.trim().toLowerCase() === targetCatName
    );

    await createTransaction({
      walletId,
      categoryId: debtCat?.id,
      type: settleDebtInline.mode,
      amount,
      contactName: settleDebtInline.contactName,
      date: getCurrentDate(),
      time: getCurrentTime(),
      note:
        settleDebtInline.mode === 'COLLECT_DEBT'
          ? `Thu nợ từ ${settleDebtInline.contactName}`
          : `Trả nợ cho ${settleDebtInline.contactName}`
    });

    const doneName = settleDebtInline.contactName;
    const doneMode = settleDebtInline.mode;
    setSettleDebtInline(null);
    setDuplicateFeedback(
      doneMode === 'COLLECT_DEBT'
        ? `Đã thu nợ ${formatVND(amount)} từ "${doneName}"!`
        : `Đã trả nợ ${formatVND(amount)} cho "${doneName}"!`
    );
    setTimeout(() => setDuplicateFeedback(''), 3000);
  };

  return (
    <div className="pb-28">
      {duplicateFeedback && (
        <div className="mx-4 mt-3 p-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold text-center animate-fade-in">
          {duplicateFeedback}
        </div>
      )}

      {/* 1. Header Card: Tổng số dư & Dòng tiền tháng */}
      <div className="mx-4 my-3 rounded-3xl p-5 bg-gradient-to-br from-slate-800/95 to-slate-900/98 border border-white/10 shadow-xl backdrop-blur-md">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Tổng tài sản khả dụng
            </span>
            <div className="font-heading text-3xl font-extrabold text-slate-100 mt-1">
              {formatVND(totalBalance)}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <WalletIcon size={24} />
          </div>
        </div>

        {/* Khung Thu / Chi tháng */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-3.5 border-t border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-[10px] bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <ArrowDownLeft size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400 truncate">Thu thuần tháng này</div>
              <div className="text-[13px] font-bold text-income truncate">
                +{formatVND(monthIncome)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-[10px] bg-rose-500/15 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <ArrowUpRight size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400 truncate">Chi thuần tháng này</div>
              <div className="text-[13px] font-bold text-expense truncate">
                -{formatVND(monthExpense)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Bộ Chuyển Tháng */}
      <div className="flex items-center justify-between mx-4 px-1 py-1">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 border border-white/8 text-slate-400 flex items-center justify-center cursor-pointer hover:text-white"
          title="Tháng trước"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800/50 border border-white/6">
          <Calendar size={16} className="text-sky-400" />
          <span className="text-[15px] font-bold text-slate-100">
            {formatMonthDisplay(selectedMonth)}
          </span>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 border border-white/8 text-slate-400 flex items-center justify-center cursor-pointer hover:text-white"
          title="Tháng sau"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 3. THANH TÌM KIẾM & BỘ LỌC PHẲNG (INLINE) */}
      <div className="mx-4 mt-2.5 mb-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={17}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm ghi chú, người vay/nợ, danh mục, số tiền..."
              className="input-ios pl-10 pr-9 py-2 rounded-xl bg-slate-850 border border-white/10 text-sm placeholder:text-slate-500 focus:border-sky-500/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white bg-transparent border-none p-1 cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
            className={`touch-btn relative h-10 px-3 rounded-xl border flex items-center gap-1.5 cursor-pointer text-xs font-semibold ${
              isFilterPanelOpen || advancedFilterCount > 0
                ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                : 'bg-slate-800/80 text-slate-300 border-white/10 hover:text-white'
            }`}
            title="Lọc theo ví và danh mục"
          >
            <Filter size={16} />
            <span>Lọc</span>
            {advancedFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-sky-500 text-slate-950 text-[10px] font-black flex items-center justify-center">
                {advancedFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Khung lọc phẳng (Inline) theo Ví & Hạng mục - không dùng Popup */}
        {isFilterPanelOpen && (
          <div className="p-3.5 rounded-2xl bg-slate-900 border border-sky-500/30 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                Lọc theo Tài khoản / Ví
              </label>
              <select
                value={walletFilter}
                onChange={(e) => setWalletFilter(e.target.value)}
                className="input-ios text-xs py-2"
              >
                <option value="ALL">Tất cả ví ({wallets.length})</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatVND(w.balance)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                Lọc theo Hạng mục
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input-ios text-xs py-2"
              >
                <option value="ALL">Tất cả hạng mục</option>
                <optgroup label="Khoản Chi">
                  {categories
                    .filter((c) => c.type === 'EXPENSE')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Khoản Thu">
                  {categories
                    .filter((c) => c.type === 'INCOME')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Vay / Nợ">
                  {categories
                    .filter((c) => c.type === 'DEBT')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>
          </div>
        )}

        {/* Chips Chọn Nhanh Loại Giao Dịch */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            type="button"
            onClick={() => setTypeFilter('ALL')}
            className={`touch-btn px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
              typeFilter === 'ALL'
                ? 'bg-slate-100 text-slate-900 font-bold'
                : 'bg-slate-800/70 text-slate-400 border border-white/5 hover:text-slate-200'
            }`}
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('EXPENSE')}
            className={`touch-btn px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1 ${
              typeFilter === 'EXPENSE'
                ? 'bg-rose-500 text-white font-bold shadow-md shadow-rose-500/25'
                : 'bg-slate-800/70 text-slate-400 border border-white/5 hover:text-rose-400'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Chi tiêu
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('INCOME')}
            className={`touch-btn px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1 ${
              typeFilter === 'INCOME'
                ? 'bg-emerald-500 text-white font-bold shadow-md shadow-emerald-500/25'
                : 'bg-slate-800/70 text-slate-400 border border-white/5 hover:text-emerald-400'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Thu nhập
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('TRANSFER')}
            className={`touch-btn px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1 ${
              typeFilter === 'TRANSFER'
                ? 'bg-sky-500 text-white font-bold shadow-md shadow-sky-500/25'
                : 'bg-slate-800/70 text-slate-400 border border-white/5 hover:text-sky-400'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            Chuyển ví
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('LEND')}
            className={`touch-btn px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1 ${
              typeFilter === 'LEND'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/25'
                : 'bg-slate-800/70 text-slate-400 border border-white/5 hover:text-amber-400'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Cho vay
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('BORROW')}
            className={`touch-btn px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1 ${
              typeFilter === 'BORROW'
                ? 'bg-purple-500 text-white font-bold shadow-md shadow-purple-500/25'
                : 'bg-slate-800/70 text-slate-400 border border-white/5 hover:text-purple-400'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            Đi vay
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('COLLECT_DEBT')}
            className={`touch-btn px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1 ${
              typeFilter === 'COLLECT_DEBT'
                ? 'bg-teal-500 text-slate-950 font-bold shadow-md shadow-teal-500/25'
                : 'bg-slate-800/70 text-slate-400 border border-white/5 hover:text-teal-400'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            Thu nợ
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('PAY_DEBT')}
            className={`touch-btn px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1 ${
              typeFilter === 'PAY_DEBT'
                ? 'bg-orange-500 text-white font-bold shadow-md shadow-orange-500/25'
                : 'bg-slate-800/70 text-slate-400 border border-white/5 hover:text-orange-400'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            Trả nợ
          </button>
        </div>

        {isFiltered && (
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/60 border border-sky-500/20 text-xs animate-fade-in">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="font-semibold text-sky-400">
                Tìm thấy {filteredTransactions.length} GD
              </span>
              <span>•</span>
              <span className="text-income font-medium">+{formatVND(filteredIncome)}</span>
              <span>•</span>
              <span className="text-expense font-medium">-{formatVND(filteredExpense)}</span>
            </div>

            <button
              type="button"
              onClick={handleResetFilters}
              className="touch-btn text-[11px] text-slate-400 hover:text-white flex items-center gap-1 bg-transparent border-none cursor-pointer underline"
            >
              <span>Đặt lại</span>
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* 4. Danh Sách Giao Dịch Gom Nhóm Theo Ngày (Mở rộng thao tác Sửa / Nhân bản / Xóa trực tiếp trên dòng) */}
      {allMonthTransactions.length === 0 ? (
        <div className="py-12 px-5 text-center text-slate-500">
          <div className="text-4xl mb-2.5">📝</div>
          <div className="text-[15px] font-semibold text-slate-400">
            Chưa có giao dịch nào trong {formatMonthDisplay(selectedMonth)}
          </div>
          <p className="text-xs text-slate-500 mt-1 mb-3.5">
            Bấm nút bên dưới để ghi nhanh khoản chi đầu tiên!
          </p>
          <button
            type="button"
            onClick={onOpenQuickAdd}
            className="touch-btn bg-emerald-500 text-slate-950 border-none py-2.5 px-5 rounded-2xl text-sm font-extrabold cursor-pointer shadow-lg shadow-emerald-500/30"
          >
            + Ghi giao dịch mới
          </button>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="py-12 px-5 text-center text-slate-500 animate-fade-in">
          <div className="text-4xl mb-2.5">🔍</div>
          <div className="text-[15px] font-semibold text-slate-300">
            Không tìm thấy giao dịch nào phù hợp
          </div>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            Thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt các tiêu chí lọc.
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="touch-btn bg-slate-800 text-sky-400 border border-sky-400/30 py-2 px-4 rounded-xl text-xs font-semibold cursor-pointer"
          >
            Xóa tất cả bộ lọc
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 px-4">
          {sortedDates.map((dateStr) => {
            const dayTxs = groupedTransactions[dateStr] || [];
            let dayIncome = 0;
            let dayExpense = 0;
            dayTxs.forEach((t) => {
              if (t.excludeFromReport) return;
              if (t.type === 'INCOME') dayIncome += t.amount;
              if (t.type === 'EXPENSE') dayExpense += t.amount;
              if (t.type === 'TRANSFER' && t.transferFee && t.transferFee > 0) {
                dayExpense += t.transferFee;
              }
            });

            return (
              <div
                key={dateStr}
                className="rounded-2xl overflow-hidden border border-white/6 bg-slate-900/60 shadow-sm"
              >
                {/* Header Ngày */}
                <div className="py-2.5 px-4 bg-slate-800/60 flex justify-between items-center border-b border-white/5">
                  <span className="text-[13px] font-bold text-slate-200">
                    {formatFriendlyDate(dateStr)}
                  </span>
                  <div className="text-xs font-semibold flex items-center gap-2.5">
                    {dayIncome > 0 && (
                      <span className="text-income">+{formatVND(dayIncome)}</span>
                    )}
                    {dayExpense > 0 && (
                      <span className="text-expense">-{formatVND(dayExpense)}</span>
                    )}
                  </div>
                </div>

                {/* Danh sách các giao dịch trong ngày */}
                <div className="flex flex-col divide-y divide-white/4">
                  {dayTxs.map((tx) => {
                    const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
                    const wallet = walletMap.get(tx.walletId);
                    const toWallet = tx.toWalletId ? walletMap.get(tx.toWalletId) : undefined;
                    const event = tx.eventId ? eventMap.get(tx.eventId) : undefined;
                    const isSystemAdj = tx.categoryId === SYSTEM_ADJUSTMENT_CATEGORY_ID;
                    const isExpanded = expandedTxId === tx.id;
                    const walletBrand = wallet ? detectBankBrand(wallet.icon, wallet.name) : null;

                    return (
                      <div key={tx.id} className="flex flex-col">
                        <div
                          onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                          className={`touch-btn flex items-center justify-between py-3 px-4 cursor-pointer transition-colors ${
                            isExpanded ? 'bg-slate-800/70' : 'hover:bg-white/3'
                          }`}
                        >
                          {/* Cột Trái: Icon & Tên Danh mục / Ghi chú */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="cat-badge shrink-0"
                              style={{
                                backgroundColor:
                                  tx.type === 'TRANSFER'
                                    ? '#3B82F6'
                                    : cat?.color || '#6B7280'
                              }}
                            >
                              <CategoryIcon
                                name={
                                  tx.type === 'TRANSFER'
                                    ? 'ArrowRightLeft'
                                    : cat?.icon || 'CircleDot'
                                }
                                size={20}
                                color="#ffffff"
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold text-slate-100 truncate">
                                  {tx.type === 'TRANSFER'
                                    ? 'Chuyển ví'
                                    : tx.type === 'LEND'
                                    ? 'Cho vay'
                                    : tx.type === 'BORROW'
                                    ? 'Đi vay'
                                    : tx.type === 'COLLECT_DEBT'
                                    ? 'Thu nợ'
                                    : tx.type === 'PAY_DEBT'
                                    ? 'Trả nợ'
                                    : tx.type === 'ADJUST'
                                    ? 'Điều chỉnh số dư'
                                    : cat?.name || 'Chưa phân loại'}
                                </span>
                                {tx.contactName && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold flex items-center gap-0.5">
                                    <UserCheck size={10} />
                                    {tx.contactName}
                                  </span>
                                )}
                                {event && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-medium flex items-center gap-0.5">
                                    <Plane size={10} />
                                    {event.name}
                                  </span>
                                )}
                                {tx.excludeFromReport && (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-300 font-medium flex items-center gap-0.5"
                                    title="Không tính vào báo cáo Thu/Chi"
                                  >
                                    <EyeOff size={10} />
                                    Chi hộ
                                  </span>
                                )}
                                {isSystemAdj && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-medium">
                                    Hệ thống
                                  </span>
                                )}
                              </div>

                              <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 truncate">
                                {tx.note ? (
                                  <span className="text-slate-200 truncate">{tx.note} •</span>
                                ) : null}
                                <span className="inline-flex items-center gap-1 truncate">
                                  {walletBrand && <BankLogo brand={walletBrand} size={15} />}
                                  <span>
                                    {tx.type === 'TRANSFER'
                                      ? `${wallet?.name || 'Ví gửi'} ➔ ${
                                          toWallet?.name || 'Ví nhận'
                                        }${
                                          tx.transferFee
                                            ? ` (Phí: ${formatVND(tx.transferFee)})`
                                            : ''
                                        }`
                                      : wallet?.name || 'Ví'}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Cột Phải: Số tiền & Giờ */}
                          <div className="text-right shrink-0 ml-3">
                            <div
                              className={`text-[15px] font-bold ${
                                tx.type === 'EXPENSE' || tx.type === 'PAY_DEBT'
                                  ? 'text-expense'
                                  : tx.type === 'INCOME' || tx.type === 'COLLECT_DEBT'
                                  ? 'text-income'
                                  : tx.type === 'LEND'
                                  ? 'text-amber-400'
                                  : tx.type === 'BORROW'
                                  ? 'text-purple-400'
                                  : tx.type === 'TRANSFER'
                                  ? 'text-sky-400'
                                  : 'text-slate-300'
                              }`}
                            >
                              {tx.type === 'EXPENSE' ||
                              tx.type === 'LEND' ||
                              tx.type === 'PAY_DEBT'
                                ? `-${formatVND(tx.amount)}`
                                : tx.type === 'INCOME' ||
                                  tx.type === 'BORROW' ||
                                  tx.type === 'COLLECT_DEBT'
                                ? `+${formatVND(tx.amount)}`
                                : formatVND(tx.amount)}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{tx.time}</div>
                          </div>
                        </div>

                        {/* Thanh hành động phẳng (Inline) khi bấm vào giao dịch - Sửa / Nhân bản / Xóa */}
                        {isExpanded && (
                          <div className="px-4 py-2.5 bg-slate-950/80 border-t border-white/6 flex items-center justify-between gap-2 animate-fade-in">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedTxId(null);
                                  onEditTransaction(tx);
                                }}
                                className="touch-btn py-1.5 px-3 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-sky-500/25"
                              >
                                <Edit3 size={14} />
                                <span>Sửa giao dịch</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDuplicate(tx)}
                                className="touch-btn py-1.5 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-emerald-500/25"
                              >
                                <Copy size={14} />
                                <span>Nhân bản (Hôm nay)</span>
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDelete(tx.id)}
                              className="touch-btn py-1.5 px-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-rose-500/25"
                            >
                              <Trash2 size={14} />
                              <span>Xóa</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. KHU VỰC THEO DÕI VAY & NỢ TRỰC QUAN Ở DƯỚI CÙNG MÀN HÌNH TỔNG QUAN (AI ĐANG NỢ MÌNH / ĐANG NỢ AI) */}
      <div className="mx-4 mt-4 rounded-3xl p-4 bg-slate-900/90 border border-white/10 shadow-lg flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
              <HandCoins size={17} />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-slate-100 uppercase tracking-wide m-0">
                Theo dõi Vay & Nợ
              </h3>
              <p className="text-[11px] text-slate-400 m-0">
                Nhìn nhanh ai đang nợ mình & mình đang nợ ai
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDebtWalletIdInput(wallets[0]?.id || '');
              setIsAddingDebtQuick(!isAddingDebtQuick);
            }}
            className="touch-btn py-1.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center gap-1 cursor-pointer border-none shrink-0"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>Ghi vay/nợ</span>
          </button>
        </div>

        {/* Form phẳng Ghi nhanh Vay / Nợ ngay trên Tổng quan */}
        {isAddingDebtQuick && (
          <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-amber-500/35 flex flex-col gap-2.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400">
                + Ghi khoản Cho vay / Đi vay / Thu / Trả nợ
              </span>
              <button
                type="button"
                onClick={() => setIsAddingDebtQuick(false)}
                className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer p-0.5"
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: 'LEND', label: '🤝 Cho vay' },
                { id: 'BORROW', label: '🧾 Đi vay' },
                { id: 'COLLECT_DEBT', label: '🐷 Thu nợ' },
                { id: 'PAY_DEBT', label: '💳 Trả nợ' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDebtTypeInput(t.id as any)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                    debtTypeInput === t.id
                      ? 'bg-amber-500 text-slate-950 border-amber-300'
                      : 'bg-slate-800 border-white/5 text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={debtContactInput}
                onChange={(e) => setDebtContactInput(e.target.value)}
                placeholder="Tên người vay / chủ nợ (VD: Anh Nam)..."
                className="input-ios text-xs py-2"
              />
              <input
                type="text"
                inputMode="numeric"
                value={debtAmountInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setDebtAmountInput(
                    val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : ''
                  );
                }}
                placeholder="Số tiền (VNĐ)..."
                className="input-ios text-xs py-2 font-extrabold text-amber-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={debtWalletIdInput}
                onChange={(e) => setDebtWalletIdInput(e.target.value)}
                className="input-ios text-xs py-2"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatVND(w.balance)})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={debtNoteInput}
                onChange={(e) => setDebtNoteInput(e.target.value)}
                placeholder="Ghi chú (tùy chọn)..."
                className="input-ios text-xs py-2"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingDebtQuick(false)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold border-none cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleQuickCreateDebt}
                className="px-4 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold border-none cursor-pointer"
              >
                Lưu khoản vay/nợ
              </button>
            </div>
          </div>
        )}

        {/* 2 Cột Trực Quan: AI ĐANG NỢ MÌNH vs MÌNH ĐANG NỢ AI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* CỘT 1: AI ĐANG NỢ MÌNH (CẦN THU VỀ) */}
          <div className="p-3.5 rounded-2xl bg-amber-500/8 border border-amber-500/25 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wide">
                🤝 Ai đang nợ mình ({debtOverview.whoOwesMe.length})
              </span>
              <span className="font-heading text-sm font-black text-amber-400">
                {formatVND(debtOverview.totalReceivable)}
              </span>
            </div>

            {debtOverview.whoOwesMe.length === 0 ? (
              <div className="text-xs text-slate-500 py-1.5">
                Hiện không có ai đang nợ bạn.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {debtOverview.whoOwesMe.map((person) => {
                  const isExpanded = expandedDebtContact === `recv_${person.contactName}`;
                  return (
                    <div
                      key={person.contactName}
                      className="p-2.5 rounded-xl bg-slate-950/70 border border-white/6 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDebtContact(
                              isExpanded ? null : `recv_${person.contactName}`
                            )
                          }
                          className="text-left bg-transparent border-none p-0 cursor-pointer min-w-0 flex-1"
                        >
                          <div className="text-xs font-bold text-slate-100 truncate flex items-center gap-1">
                            <UserCheck size={13} className="text-amber-400 shrink-0" />
                            <span className="truncate">{person.contactName}</span>
                          </div>
                          <div className="text-[11px] text-amber-400 font-extrabold mt-0.5">
                            Nợ bạn: {formatVND(person.receivable)}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSettleDebtInline({
                              contactName: person.contactName,
                              mode: 'COLLECT_DEBT'
                            });
                            setSettleAmountInput(
                              new Intl.NumberFormat('vi-VN').format(person.receivable)
                            );
                            setSettleWalletIdInput(wallets[0]?.id || '');
                          }}
                          className="touch-btn py-1.5 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold cursor-pointer shrink-0"
                        >
                          + Thu nợ
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="pt-2 border-t border-white/6 flex flex-col gap-1.5 text-[11px] text-slate-400">
                          <div className="flex justify-between">
                            <span>Đã cho vay: {formatVND(person.lent)}</span>
                            <span>Đã thu: {formatVND(person.collected)}</span>
                          </div>
                          {person.txs.slice(0, 4).map((t) => (
                            <div
                              key={t.id}
                              onClick={() => onEditTransaction(t)}
                              className="flex justify-between items-center py-1 px-2 rounded bg-slate-900/90 hover:bg-slate-800 cursor-pointer"
                            >
                              <span className="truncate text-slate-300">
                                {t.date} • {t.note || 'Giao dịch vay/nợ'}
                              </span>
                              <span className="font-bold text-amber-300 shrink-0 ml-2">
                                {formatVND(t.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CỘT 2: MÌNH ĐANG NỢ AI (PHẢI TRẢ) */}
          <div className="p-3.5 rounded-2xl bg-purple-500/8 border border-purple-500/25 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wide">
                🧾 Đang nợ ai ({debtOverview.whoIOwe.length})
              </span>
              <span className="font-heading text-sm font-black text-purple-400">
                {formatVND(debtOverview.totalPayable)}
              </span>
            </div>

            {debtOverview.whoIOwe.length === 0 ? (
              <div className="text-xs text-slate-500 py-1.5">
                Hiện bạn không nợ ai.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {debtOverview.whoIOwe.map((person) => {
                  const isExpanded = expandedDebtContact === `pay_${person.contactName}`;
                  return (
                    <div
                      key={person.contactName}
                      className="p-2.5 rounded-xl bg-slate-950/70 border border-white/6 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDebtContact(
                              isExpanded ? null : `pay_${person.contactName}`
                            )
                          }
                          className="text-left bg-transparent border-none p-0 cursor-pointer min-w-0 flex-1"
                        >
                          <div className="text-xs font-bold text-slate-100 truncate flex items-center gap-1">
                            <UserCheck size={13} className="text-purple-400 shrink-0" />
                            <span className="truncate">{person.contactName}</span>
                          </div>
                          <div className="text-[11px] text-purple-400 font-extrabold mt-0.5">
                            Còn nợ: {formatVND(person.payable)}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSettleDebtInline({
                              contactName: person.contactName,
                              mode: 'PAY_DEBT'
                            });
                            setSettleAmountInput(
                              new Intl.NumberFormat('vi-VN').format(person.payable)
                            );
                            setSettleWalletIdInput(wallets[0]?.id || '');
                          }}
                          className="touch-btn py-1.5 px-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-[11px] font-bold cursor-pointer shrink-0"
                        >
                          - Trả nợ
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="pt-2 border-t border-white/6 flex flex-col gap-1.5 text-[11px] text-slate-400">
                          <div className="flex justify-between">
                            <span>Đã vay: {formatVND(person.borrowed)}</span>
                            <span>Đã trả: {formatVND(person.paid)}</span>
                          </div>
                          {person.txs.slice(0, 4).map((t) => (
                            <div
                              key={t.id}
                              onClick={() => onEditTransaction(t)}
                              className="flex justify-between items-center py-1 px-2 rounded bg-slate-900/90 hover:bg-slate-800 cursor-pointer"
                            >
                              <span className="truncate text-slate-300">
                                {t.date} • {t.note || 'Giao dịch vay/nợ'}
                              </span>
                              <span className="font-bold text-purple-300 shrink-0 ml-2">
                                {formatVND(t.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Khung xác nhận Thu nợ / Trả nợ nhanh ngay trên Tổng quan */}
        {settleDebtInline && (
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/40 flex flex-col gap-2.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400">
                {settleDebtInline.mode === 'COLLECT_DEBT'
                  ? `🐷 Thu nợ từ "${settleDebtInline.contactName}"`
                  : `💳 Trả nợ cho "${settleDebtInline.contactName}"`}
              </span>
              <button
                type="button"
                onClick={() => setSettleDebtInline(null)}
                className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={settleAmountInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setSettleAmountInput(
                    val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : ''
                  );
                }}
                placeholder="Số tiền..."
                className="input-ios text-xs py-2 font-extrabold text-emerald-400"
              />
              <select
                value={settleWalletIdInput}
                onChange={(e) => setSettleWalletIdInput(e.target.value)}
                className="input-ios text-xs py-2"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatVND(w.balance)})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettleDebtInline(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold border-none cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmSettleDebt}
                className="px-4 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold border-none cursor-pointer"
              >
                Xác nhận
              </button>
            </div>
          </div>
        )}

        {/* Nút xem các người nợ đã tất toán xong (nếu có) */}
        {debtOverview.settledList.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowSettledDebts(!showSettledDebts)}
              className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer"
            >
              <CheckCircle2 size={12} className="text-emerald-400" />
              <span>
                Đã tất toán xong ({debtOverview.settledList.length} người)
              </span>
              {showSettledDebts ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {showSettledDebts && (
              <div className="mt-2 flex flex-wrap gap-1.5 animate-fade-in">
                {debtOverview.settledList.map((s) => (
                  <span
                    key={s.contactName}
                    onClick={() => setSearchQuery(s.contactName)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800/80 border border-white/6 text-slate-300 cursor-pointer hover:border-emerald-500/40 flex items-center gap-1"
                    title="Bấm để lọc giao dịch của người này"
                  >
                    <CheckCircle2 size={11} className="text-emerald-400" />
                    <span>{s.contactName}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
