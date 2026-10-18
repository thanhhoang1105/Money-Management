// src/components/TransactionListTab.tsx
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Transaction, Category, Wallet } from '../types';
import { deleteTransaction } from '../services/transactionService';
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
  Wallet as WalletIcon
} from 'lucide-react';

interface TransactionListTabProps {
  onEditTransaction: (tx: Transaction) => void;
  onOpenQuickAdd: () => void;
}

export const TransactionListTab: React.FC<TransactionListTabProps> = ({
  onEditTransaction,
  onOpenQuickAdd
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [selectedTxForAction, setSelectedTxForAction] = useState<Transaction | null>(null);

  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];

  // Lấy các giao dịch trong tháng được chọn
  const transactions = useLiveQuery(async () => {
    return await db.transactions
      .filter((tx) => tx.date.startsWith(selectedMonth))
      .reverse()
      .sortBy('date');
  }, [selectedMonth]) || [];

  // Tạo map tra cứu nhanh danh mục và ví
  const categoryMap = new Map<string, Category>(categories.map((c) => [c.id, c]));
  const walletMap = new Map<string, Wallet>(wallets.map((w) => [w.id, w]));

  // Tính tổng tài sản khả dụng
  const totalBalance = wallets
    .filter((w) => !w.isExcludedFromTotal)
    .reduce((sum, w) => sum + w.balance, 0);

  // Tính tổng Thu & Chi trong tháng đang chọn
  let monthIncome = 0;
  let monthExpense = 0;
  transactions.forEach((tx) => {
    if (tx.type === 'INCOME') monthIncome += tx.amount;
    if (tx.type === 'EXPENSE') monthExpense += tx.amount;
  });

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

  // Gom nhóm giao dịch theo ngày
  const groupedTransactions: Record<string, Transaction[]> = {};
  transactions.forEach((tx) => {
    if (!groupedTransactions[tx.date]) {
      groupedTransactions[tx.date] = [];
    }
    groupedTransactions[tx.date].push(tx);
  });

  const sortedDates = Object.keys(groupedTransactions).sort((a, b) => b.localeCompare(a));

  // Xóa giao dịch
  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc muốn xóa giao dịch này? Số dư ví sẽ được tự động hoàn tác.')) {
      await deleteTransaction(id);
      setSelectedTxForAction(null);
    }
  };

  return (
    <div className="pb-24">
      {/* 1. Header Card: Tổng số dư & Dòng tiền tháng */}
      <div className="glass-panel mx-4 my-3 rounded-[24px] p-5 bg-gradient-to-br from-slate-800/90 to-slate-900/95 shadow-xl">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">
              Tổng tài sản khả dụng
            </span>
            <div className="font-heading text-[26px] font-extrabold text-slate-100 mt-0.5">
              {formatVND(totalBalance)}
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 flex items-center justify-center text-emerald-400">
            <WalletIcon size={24} />
          </div>
        </div>

        {/* Khung Thu / Chi tháng */}
        <div className="mt-4 pt-3.5 border-t border-white/8 flex justify-between items-center">
          {/* Thu */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[10px] bg-emerald-500/15 flex items-center justify-center text-emerald-400">
              <ArrowDownLeft size={18} />
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Thu tháng này</div>
              <div className="text-[13px] font-bold text-income">
                +{formatVND(monthIncome)}
              </div>
            </div>
          </div>

          {/* Chi */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[10px] bg-rose-500/15 flex items-center justify-center text-rose-400">
              <ArrowUpRight size={18} />
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Chi tháng này</div>
              <div className="text-[13px] font-bold text-expense">
                -{formatVND(monthExpense)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Bộ Chuyển Tháng */}
      <div className="flex items-center justify-between px-5 py-2">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="touch-btn w-9 h-9 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center cursor-pointer border-none hover:text-white"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex items-center gap-1.5">
          <Calendar size={16} className="text-sky-400" />
          <span className="text-[15px] font-bold text-slate-100">
            {formatMonthDisplay(selectedMonth)}
          </span>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          className="touch-btn w-9 h-9 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center cursor-pointer border-none hover:text-white"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 3. Danh Sách Giao Dịch Gom Nhóm Theo Ngày */}
      {sortedDates.length === 0 ? (
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
      ) : (
        <div className="flex flex-col gap-3.5 px-4">
          {sortedDates.map((dateStr) => {
            const dayTxs = groupedTransactions[dateStr];
            let dayIncome = 0;
            let dayExpense = 0;
            dayTxs.forEach((t) => {
              if (t.type === 'INCOME') dayIncome += t.amount;
              if (t.type === 'EXPENSE') dayExpense += t.amount;
            });

            return (
              <div
                key={dateStr}
                className="glass-panel rounded-[20px] overflow-hidden border border-white/6"
              >
                {/* Header Ngày */}
                <div className="py-2.5 px-4 bg-slate-800/50 flex justify-between items-center border-b border-white/4">
                  <span className="text-[13px] font-bold text-slate-100">
                    {formatFriendlyDate(dateStr)}
                  </span>
                  <div className="text-xs font-semibold flex gap-2.5">
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

                    return (
                      <div
                        key={tx.id}
                        onClick={() => setSelectedTxForAction(tx)}
                        className="touch-btn flex items-center justify-between py-3 px-4 cursor-pointer border-b border-white/4 last:border-none hover:bg-white/2"
                      >
                        {/* Cột Trái: Icon & Tên Danh mục / Ghi chú */}
                        <div className="flex items-center gap-3">
                          <div
                            className="cat-badge"
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
                          <div>
                            <div className="text-sm font-semibold text-slate-100">
                              {tx.type === 'TRANSFER'
                                ? `Chuyển ví`
                                : cat?.name || 'Chưa phân loại'}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {tx.note ? (
                                <span className="text-slate-300">{tx.note} • </span>
                              ) : null}
                              <span>
                                {tx.type === 'TRANSFER'
                                  ? `${wallet?.name} ➔ ${toWallet?.name}`
                                  : wallet?.name}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Cột Phải: Số tiền */}
                        <div className="text-right">
                          <div
                            className={`text-[15px] font-bold ${
                              tx.type === 'EXPENSE'
                                ? 'text-expense'
                                : tx.type === 'INCOME'
                                ? 'text-income'
                                : 'text-transfer'
                            }`}
                          >
                            {tx.type === 'EXPENSE'
                              ? `-${formatVND(tx.amount)}`
                              : tx.type === 'INCOME'
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

      {/* Modal Action Sheet khi Chạm vào 1 giao dịch */}
      {selectedTxForAction && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex flex-col justify-end max-w-[480px] mx-auto"
          onClick={() => setSelectedTxForAction(null)}
        >
          <div
            className="glass-panel animate-slide-up bg-slate-900 rounded-t-[28px] p-5 pb-[max(24px,env(safe-area-inset-bottom,0px))] flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-1.5">
              <div className="text-base font-bold text-slate-100">
                Tùy chọn giao dịch
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {formatVND(selectedTxForAction.amount)} • {selectedTxForAction.date}
              </div>
            </div>

            {/* Nút Sửa */}
            <button
              type="button"
              onClick={() => {
                const tx = selectedTxForAction;
                setSelectedTxForAction(null);
                onEditTransaction(tx);
              }}
              className="touch-btn flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-slate-800 text-sky-400 border-none text-[15px] font-semibold cursor-pointer"
            >
              <Edit3 size={18} />
              <span>Chỉnh sửa giao dịch</span>
            </button>

            {/* Nút Xóa (Kèm Hoàn tác số dư) */}
            <button
              type="button"
              onClick={() => handleDelete(selectedTxForAction.id)}
              className="touch-btn flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-rose-500/12 text-rose-400 border border-rose-500/20 text-[15px] font-semibold cursor-pointer"
            >
              <Trash2 size={18} />
              <span>Xóa giao dịch (Hoàn tác số dư)</span>
            </button>

            {/* Nút Hủy */}
            <button
              type="button"
              onClick={() => setSelectedTxForAction(null)}
              className="touch-btn p-3 rounded-2xl bg-transparent text-slate-400 border-none text-sm font-medium cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
