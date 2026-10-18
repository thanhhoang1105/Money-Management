// src/components/TransactionListTab.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Transaction, Category, Wallet } from '../types';
import { deleteTransaction, SYSTEM_ADJUSTMENT_CATEGORY_ID } from '../services/transactionService';
import { CategoryIcon } from './CategoryIcon';
import {
  formatVND,
  formatFriendlyDate,
  formatMonthDisplay,
  getCurrentMonth,
  getPreviousMonth
} from '../utils/formatters';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Edit3,
  Calendar,
  Wallet as WalletIcon,
  Search,
  X,
  Filter,
  Clock,
  Tag,
  SlidersHorizontal
} from 'lucide-react';

interface TransactionListTabProps {
  onEditTransaction: (tx: Transaction) => void;
  onOpenQuickAdd: () => void;
}

type TypeFilterOption = 'ALL' | 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'LEND' | 'BORROW' | 'ADJUST';

export const TransactionListTab: React.FC<TransactionListTabProps> = ({
  onEditTransaction,
  onOpenQuickAdd
}) => {
  // 1. Quản lý trạng thái Tháng & Bộ lọc (Phase P4)
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<TypeFilterOption>('ALL');
  const [walletFilter, setWalletFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState<boolean>(false);
  const [selectedTxForDetail, setSelectedTxForDetail] = useState<Transaction | null>(null);

  // 2. Tải dữ liệu phản ứng thời gian thực từ IndexedDB
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];

  // Lấy toàn bộ giao dịch trong tháng được chọn
  const allMonthTransactions = useLiveQuery(async () => {
    return await db.transactions
      .filter((tx) => tx.date.startsWith(selectedMonth))
      .reverse()
      .sortBy('date');
  }, [selectedMonth]) || [];

  // Tạo map tra cứu nhanh danh mục và ví
  const categoryMap = useMemo(() => {
    return new Map<string, Category>(categories.map((c) => [c.id, c]));
  }, [categories]);

  const walletMap = useMemo(() => {
    return new Map<string, Wallet>(wallets.map((w) => [w.id, w]));
  }, [wallets]);

  // Tính tổng tài sản khả dụng (Ví không loại trừ)
  const totalBalance = useMemo(() => {
    return wallets
      .filter((w) => !w.isExcludedFromTotal)
      .reduce((sum, w) => sum + w.balance, 0);
  }, [wallets]);

  // Tính tổng Thu & Chi nguyên bản của tháng đang chọn (không phụ thuộc vào bộ lọc tìm kiếm)
  const { monthIncome, monthExpense } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    allMonthTransactions.forEach((tx) => {
      if (tx.type === 'INCOME' || tx.type === 'BORROW') inc += tx.amount;
      if (tx.type === 'EXPENSE' || tx.type === 'LEND') exp += tx.amount;
    });
    return { monthIncome: inc, monthExpense: exp };
  }, [allMonthTransactions]);

  // 3. LOGIC LỌC ĐA NĂNG (MULTI-FILTER & SEARCH - P4)
  const filteredTransactions = useMemo(() => {
    return allMonthTransactions.filter((tx) => {
      // Lọc theo Loại
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) {
        return false;
      }

      // Lọc theo Ví
      if (walletFilter !== 'ALL') {
        if (tx.type === 'TRANSFER') {
          if (tx.walletId !== walletFilter && tx.toWalletId !== walletFilter) {
            return false;
          }
        } else if (tx.walletId !== walletFilter) {
          return false;
        }
      }

      // Lọc theo Danh mục
      if (categoryFilter !== 'ALL') {
        if (tx.categoryId !== categoryFilter) {
          return false;
        }
      }

      // Tìm kiếm từ khóa (Ghi chú, Tên danh mục, Tên ví, Số tiền)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
        const wallet = walletMap.get(tx.walletId);
        const toWallet = tx.toWalletId ? walletMap.get(tx.toWalletId) : undefined;

        const noteMatch = tx.note?.toLowerCase().includes(q) || false;
        const catMatch = cat?.name.toLowerCase().includes(q) || false;
        const walletMatch = wallet?.name.toLowerCase().includes(q) || false;
        const toWalletMatch = toWallet?.name.toLowerCase().includes(q) || false;
        const amountMatch = tx.amount.toString().includes(q);

        if (!noteMatch && !catMatch && !walletMatch && !toWalletMatch && !amountMatch) {
          return false;
        }
      }

      return true;
    });
  }, [allMonthTransactions, typeFilter, walletFilter, categoryFilter, searchQuery, categoryMap, walletMap]);

  // Kiểm tra xem có bộ lọc nào đang được kích hoạt hay không
  const isFiltered =
    typeFilter !== 'ALL' ||
    walletFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    searchQuery.trim().length > 0;

  const advancedFilterCount =
    (walletFilter !== 'ALL' ? 1 : 0) + (categoryFilter !== 'ALL' ? 1 : 0);

  // Thống kê kết quả dòng tiền đang lọc
  const { filteredIncome, filteredExpense } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    filteredTransactions.forEach((tx) => {
      if (tx.type === 'INCOME') inc += tx.amount;
      if (tx.type === 'EXPENSE') exp += tx.amount;
    });
    return { filteredIncome: inc, filteredExpense: exp };
  }, [filteredTransactions]);

  // Đặt lại toàn bộ bộ lọc
  const handleResetFilters = () => {
    setSearchQuery('');
    setTypeFilter('ALL');
    setWalletFilter('ALL');
    setCategoryFilter('ALL');
  };

  // Chuyển tháng trước / sau
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

  // Gom nhóm giao dịch theo ngày (dựa trên kết quả đã lọc)
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

  // Xóa giao dịch kèm Hoàn tác số dư (Atomic Balance Revert)
  const handleDelete = async (id: string) => {
    if (
      window.confirm(
        'Bạn có chắc muốn xóa giao dịch này? Số dư ví sẽ được tự động hoàn tác chính xác.'
      )
    ) {
      await deleteTransaction(id);
      setSelectedTxForDetail(null);
    }
  };

  return (
    <div className="pb-28">
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
          {/* Thu */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-[10px] bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <ArrowDownLeft size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400 truncate">Thu tháng này</div>
              <div className="text-[13px] font-bold text-income truncate">
                +{formatVND(monthIncome)}
              </div>
            </div>
          </div>

          {/* Chi */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-[10px] bg-rose-500/15 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <ArrowUpRight size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400 truncate">Chi tháng này</div>
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

      {/* 3. P4 FEATURE: THANH TÌM KIẾM & BỘ LỌC ĐA NĂNG */}
      <div className="mx-4 mt-2.5 mb-3 flex flex-col gap-2">
        {/* Ô Tìm Kiếm + Nút Lọc Nâng Cao */}
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
              placeholder="Tìm ghi chú, danh mục, số tiền..."
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

          {/* Nút mở Sheet Lọc Chi Tiết (Ví & Danh Mục) */}
          <button
            type="button"
            onClick={() => setIsFilterSheetOpen(true)}
            className={`touch-btn relative h-10 px-3 rounded-xl border flex items-center gap-1.5 cursor-pointer text-xs font-semibold ${
              advancedFilterCount > 0
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
        </div>

        {/* Thanh Tóm Tắt Khi Có Bộ Lọc Hoặc Tìm Kiếm Đang Bật */}
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

      {/* 4. Danh Sách Giao Dịch Gom Nhóm Theo Ngày */}
      {allMonthTransactions.length === 0 ? (
        // Trường hợp cả tháng chưa có giao dịch nào
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
            className="touch-btn bg-emerald-500 text-white border-none py-2.5 px-5 rounded-2xl text-sm font-semibold cursor-pointer shadow-lg shadow-emerald-500/30"
          >
            + Ghi khoản chi mới
          </button>
        </div>
      ) : filteredTransactions.length === 0 ? (
        // Trường hợp có giao dịch nhưng không khớp bộ lọc tìm kiếm
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
              if (t.type === 'INCOME') dayIncome += t.amount;
              if (t.type === 'EXPENSE') dayExpense += t.amount;
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
                <div className="flex flex-col">
                  {dayTxs.map((tx) => {
                    const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
                    const wallet = walletMap.get(tx.walletId);
                    const toWallet = tx.toWalletId ? walletMap.get(tx.toWalletId) : undefined;
                    const isSystemAdj = tx.categoryId === SYSTEM_ADJUSTMENT_CATEGORY_ID;

                    return (
                      <div
                        key={tx.id}
                        onClick={() => setSelectedTxForDetail(tx)}
                        className="touch-btn flex items-center justify-between py-3 px-4 cursor-pointer border-b border-white/4 last:border-none hover:bg-white/3 transition-colors"
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
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-slate-100 truncate">
                                {tx.type === 'TRANSFER'
                                  ? 'Chuyển ví'
                                  : tx.type === 'LEND'
                                  ? 'Cho vay'
                                  : tx.type === 'BORROW'
                                  ? 'Đi vay'
                                  : tx.type === 'ADJUST'
                                  ? 'Điều chỉnh số dư'
                                  : cat?.name || 'Chưa phân loại'}
                              </span>
                              {isSystemAdj && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-medium">
                                  Hệ thống
                                </span>
                              )}
                              {tx.type === 'LEND' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                                  Cho vay
                                </span>
                              )}
                              {tx.type === 'BORROW' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">
                                  Đi vay
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-slate-400 mt-0.5 truncate">
                              {tx.note ? (
                                <span className="text-slate-200">{tx.note} • </span>
                              ) : null}
                              <span>
                                {tx.type === 'TRANSFER'
                                  ? `${wallet?.name || 'Ví gửi'} ➔ ${toWallet?.name || 'Ví nhận'}`
                                  : wallet?.name || 'Ví'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Cột Phải: Số tiền & Giờ */}
                        <div className="text-right shrink-0 ml-3">
                          <div
                            className={`text-[15px] font-bold ${
                              tx.type === 'EXPENSE'
                                ? 'text-expense'
                                : tx.type === 'INCOME'
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
                            {tx.type === 'EXPENSE' || tx.type === 'LEND'
                              ? `-${formatVND(tx.amount)}`
                              : tx.type === 'INCOME' || tx.type === 'BORROW'
                              ? `+${formatVND(tx.amount)}`
                              : formatVND(tx.amount)}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {tx.time}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. P4 MODAL: BẢNG LỌC NÂNG CAO (VÍ & DANH MỤC) */}
      {isFilterSheetOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex flex-col justify-end items-center"
          onClick={() => setIsFilterSheetOpen(false)}
        >
          <div
            className="w-full max-w-[480px] bg-slate-900 rounded-t-[28px] p-5 pb-[max(24px,env(safe-area-inset-bottom,0px))] border-t border-white/10 flex flex-col gap-4 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Sheet */}
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-sky-400" />
                <span className="text-base font-bold text-slate-100">
                  Bộ lọc nâng cao
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center border-none cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Mục 1: Lọc theo Ví */}
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Lọc theo tài khoản / Ví
              </label>
              <select
                value={walletFilter}
                onChange={(e) => setWalletFilter(e.target.value)}
                className="input-ios"
              >
                <option value="ALL">Tất cả ví ({wallets.length})</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatVND(w.balance)})
                  </option>
                ))}
              </select>
            </div>

            {/* Mục 2: Lọc theo Danh mục */}
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Lọc theo danh mục
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input-ios"
              >
                <option value="ALL">Tất cả danh mục ({categories.length})</option>
                <optgroup label="Khoản Chi (EXPENSE)">
                  {categories
                    .filter((c) => c.type === 'EXPENSE')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Khoản Thu (INCOME)">
                  {categories
                    .filter((c) => c.type === 'INCOME')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>

            {/* Nút hành động */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setWalletFilter('ALL');
                  setCategoryFilter('ALL');
                }}
                className="touch-btn flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm border-none cursor-pointer hover:bg-slate-700"
              >
                Đặt lại
              </button>
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(false)}
                className="touch-btn flex-1 py-3 rounded-xl bg-sky-500 text-slate-950 font-bold text-sm border-none cursor-pointer shadow-lg shadow-sky-500/25"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. P4 MODAL: CHI TIẾT GIAO DỊCH & ACTION SHEET HOÀN CHỈNH */}
      {selectedTxForDetail && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex flex-col justify-end items-center"
          onClick={() => setSelectedTxForDetail(null)}
        >
          <div
            className="w-full max-w-[480px] bg-slate-900 rounded-t-[28px] p-5 pb-[max(24px,env(safe-area-inset-bottom,0px))] border-t border-white/10 flex flex-col gap-4 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Thanh kéo nhỏ (Handle bar) */}
            <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto -mt-1 mb-1" />

            {/* Khung số tiền nổi bật */}
            <div className="text-center py-2">
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-2 ${
                  selectedTxForDetail.type === 'EXPENSE'
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                    : selectedTxForDetail.type === 'INCOME'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                    : selectedTxForDetail.type === 'LEND'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                    : selectedTxForDetail.type === 'BORROW'
                    ? 'bg-purple-500/15 text-purple-400 border border-purple-500/25'
                    : selectedTxForDetail.type === 'TRANSFER'
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
                    : 'bg-slate-700/50 text-slate-300 border border-slate-500/25'
                }`}
              >
                {selectedTxForDetail.type === 'EXPENSE'
                  ? 'Khoản chi tiêu'
                  : selectedTxForDetail.type === 'INCOME'
                  ? 'Khoản thu nhập'
                  : selectedTxForDetail.type === 'LEND'
                  ? 'Khoản cho vay'
                  : selectedTxForDetail.type === 'BORROW'
                  ? 'Khoản đi vay'
                  : selectedTxForDetail.type === 'TRANSFER'
                  ? 'Chuyển ví nội bộ'
                  : 'Điều chỉnh số dư'}
              </div>

              <div
                className={`font-heading text-3xl font-black ${
                  selectedTxForDetail.type === 'EXPENSE'
                    ? 'text-expense'
                    : selectedTxForDetail.type === 'INCOME'
                    ? 'text-income'
                    : selectedTxForDetail.type === 'LEND'
                    ? 'text-amber-400'
                    : selectedTxForDetail.type === 'BORROW'
                    ? 'text-purple-400'
                    : selectedTxForDetail.type === 'TRANSFER'
                    ? 'text-sky-400'
                    : 'text-slate-300'
                }`}
              >
                {selectedTxForDetail.type === 'EXPENSE' || selectedTxForDetail.type === 'LEND'
                  ? `-${formatVND(selectedTxForDetail.amount)}`
                  : selectedTxForDetail.type === 'INCOME' || selectedTxForDetail.type === 'BORROW'
                  ? `+${formatVND(selectedTxForDetail.amount)}`
                  : formatVND(selectedTxForDetail.amount)}
              </div>
            </div>

            {/* Thông tin chi tiết */}
            <div className="rounded-2xl bg-slate-800/60 border border-white/6 p-3.5 flex flex-col gap-3 text-xs">
              {/* Danh mục */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Tag size={14} className="text-slate-400" />
                  Danh mục
                </span>
                <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                  {selectedTxForDetail.type === 'TRANSFER'
                    ? 'Chuyển ví nội bộ'
                    : categoryMap.get(selectedTxForDetail.categoryId || '')?.name ||
                      (selectedTxForDetail.categoryId === SYSTEM_ADJUSTMENT_CATEGORY_ID
                        ? 'Điều chỉnh số dư'
                        : 'Chưa phân loại')}
                </span>
              </div>

              {/* Tài khoản / Ví */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <WalletIcon size={14} className="text-slate-400" />
                  {selectedTxForDetail.type === 'TRANSFER' ? 'Tuyến chuyển' : 'Tài khoản / Ví'}
                </span>
                <span className="font-semibold text-slate-100">
                  {selectedTxForDetail.type === 'TRANSFER'
                    ? `${walletMap.get(selectedTxForDetail.walletId)?.name || 'Ví gửi'} ➔ ${
                        walletMap.get(selectedTxForDetail.toWalletId || '')?.name || 'Ví nhận'
                      }`
                    : walletMap.get(selectedTxForDetail.walletId)?.name || 'Chưa rõ'}
                </span>
              </div>

              {/* Ngày giờ */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock size={14} className="text-slate-400" />
                  Thời gian
                </span>
                <span className="font-semibold text-slate-100">
                  {selectedTxForDetail.date} lúc {selectedTxForDetail.time}
                </span>
              </div>

              {/* Ghi chú */}
              {selectedTxForDetail.note && (
                <div className="pt-2 border-t border-white/6">
                  <span className="text-slate-400 block mb-1">Ghi chú:</span>
                  <div className="text-slate-100 bg-slate-900/60 p-2.5 rounded-xl text-xs leading-relaxed border border-white/4">
                    {selectedTxForDetail.note}
                  </div>
                </div>
              )}
            </div>

            {/* Các nút hành động */}
            <div className="flex flex-col gap-2 pt-1">
              {/* Nút Sửa */}
              <button
                type="button"
                onClick={() => {
                  const tx = selectedTxForDetail;
                  setSelectedTxForDetail(null);
                  onEditTransaction(tx);
                }}
                className="touch-btn flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-sky-500/15 border border-sky-500/25 text-sky-400 text-sm font-bold cursor-pointer hover:bg-sky-500/20"
              >
                <Edit3 size={17} />
                <span>Chỉnh sửa giao dịch</span>
              </button>

              {/* Nút Xóa (Kèm Hoàn tác số dư) */}
              <button
                type="button"
                onClick={() => handleDelete(selectedTxForDetail.id)}
                className="touch-btn flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-rose-500/12 border border-rose-500/20 text-rose-400 text-sm font-semibold cursor-pointer hover:bg-rose-500/20"
              >
                <Trash2 size={17} />
                <span>Xóa giao dịch (Hoàn tác số dư)</span>
              </button>

              {/* Nút Đóng */}
              <button
                type="button"
                onClick={() => setSelectedTxForDetail(null)}
                className="touch-btn p-3 rounded-2xl bg-transparent text-slate-400 border-none text-sm font-medium cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
