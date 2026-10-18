// src/components/AnalyticsTab.tsx
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Category, Transaction } from '../types';
import { CategoryIcon } from './CategoryIcon';
import {
  formatVND,
  formatMonthDisplay,
  getCurrentMonth,
  getPreviousMonth,
  formatFriendlyDate
} from '../utils/formatters';
import {
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  X
} from 'lucide-react';

interface AnalyticsTabProps {
  onEditTransaction?: (tx: Transaction) => void;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ onEditTransaction }) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [drillDownCategory, setDrillDownCategory] = useState<Category | null>(null);

  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const categoryMap = new Map<string, Category>(categories.map((c) => [c.id, c]));

  const prevMonth = getPreviousMonth(selectedMonth);

  // Lấy toàn bộ giao dịch của tháng hiện tại và tháng trước để so sánh MoM
  const thisMonthTxs = useLiveQuery(
    () => db.transactions.filter((tx) => tx.date.startsWith(selectedMonth)).toArray(),
    [selectedMonth]
  ) || [];

  const prevMonthTxs = useLiveQuery(
    () => db.transactions.filter((tx) => tx.date.startsWith(prevMonth)).toArray(),
    [prevMonth]
  ) || [];

  // Tính toán số liệu tháng hiện tại
  let thisIncome = 0;
  let thisExpense = 0;
  const thisCatExpenseMap: Record<string, number> = {};

  thisMonthTxs.forEach((tx) => {
    if (tx.type === 'INCOME') thisIncome += tx.amount;
    if (tx.type === 'EXPENSE') {
      thisExpense += tx.amount;
      if (tx.categoryId) {
        thisCatExpenseMap[tx.categoryId] = (thisCatExpenseMap[tx.categoryId] || 0) + tx.amount;
      }
    }
  });

  // Tính toán số liệu tháng trước để so sánh MoM
  let prevExpense = 0;
  const prevCatExpenseMap: Record<string, number> = {};

  prevMonthTxs.forEach((tx) => {
    if (tx.type === 'EXPENSE') {
      prevExpense += tx.amount;
      if (tx.categoryId) {
        prevCatExpenseMap[tx.categoryId] = (prevCatExpenseMap[tx.categoryId] || 0) + tx.amount;
      }
    }
  });

  // Tính % thay đổi tổng chi tiêu so với tháng trước
  const expenseDiff = thisExpense - prevExpense;
  const expenseMoMPercent =
    prevExpense > 0 ? (expenseDiff / prevExpense) * 100 : thisExpense > 0 ? 100 : 0;

  // Sắp xếp danh mục theo chi tiêu từ cao xuống thấp
  const sortedCategories = Object.entries(thisCatExpenseMap)
    .map(([catId, amount]) => {
      const cat = categoryMap.get(catId);
      const prevCatAmount = prevCatExpenseMap[catId] || 0;
      const catDiff = amount - prevCatAmount;
      const catMoMPercent =
        prevCatAmount > 0 ? (catDiff / prevCatAmount) * 100 : amount > 0 ? 100 : 0;
      const percentage = thisExpense > 0 ? (amount / thisExpense) * 100 : 0;

      return {
        catId,
        category: cat,
        amount,
        prevAmount: prevCatAmount,
        diff: catDiff,
        momPercent: catMoMPercent,
        percentage
      };
    })
    .filter((item) => item.category !== undefined)
    .sort((a, b) => b.amount - a.amount);

  // Điều hướng tháng
  const handlePrevMonth = () => setSelectedMonth((m) => getPreviousMonth(m));
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

  // Tính toán các cung góc cho Donut Chart SVG
  let cumulativeAngle = 0;
  const donutSegments = sortedCategories.map((item) => {
    const angle = (item.percentage / 100) * 360;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    return {
      ...item,
      startAngle,
      angle
    };
  });

  // Các giao dịch thuộc danh mục đang Drill-down
  const drillDownTxs = drillDownCategory
    ? thisMonthTxs
        .filter((tx) => tx.type === 'EXPENSE' && tx.categoryId === drillDownCategory.id)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  return (
    <div className="pb-24">
      {/* 1. Header chọn tháng */}
      <div className="px-5 pt-4 pb-2.5 flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center touch-btn cursor-pointer"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="text-center">
          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
            Báo cáo chi tiêu
          </div>
          <div className="text-base font-bold text-slate-100">
            {formatMonthDisplay(selectedMonth)}
          </div>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center touch-btn cursor-pointer"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 2. Tổng quan MoM (Month-over-Month) Badge */}
      <div className="glass-panel mx-4 my-2 rounded-3xl p-5 bg-gradient-to-br from-slate-800/80 to-slate-900/90 border border-white/10 shadow-lg">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs text-slate-400 font-medium">Tổng chi tiêu tháng</span>
            <div className="font-heading text-3xl font-extrabold text-rose-500 mt-0.5 tracking-tight">
              {formatVND(thisExpense)}
            </div>
          </div>

          {/* Badge so sánh MoM với tháng trước */}
          {prevExpense > 0 && (
            <div
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border ${
                expenseDiff > 0
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              }`}
            >
              {expenseDiff > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>
                {expenseDiff > 0 ? `+${expenseMoMPercent.toFixed(1)}%` : `${expenseMoMPercent.toFixed(1)}%`}
              </span>
            </div>
          )}
        </div>

        <div className="text-xs text-slate-400 mt-2">
          {prevExpense > 0 ? (
            expenseDiff > 0 ? (
              <span>
                Tăng <b className="text-rose-400">{formatVND(expenseDiff)}</b> so với tháng trước ({formatVND(prevExpense)})
              </span>
            ) : (
              <span>
                Tiết kiệm được <b className="text-emerald-400">{formatVND(Math.abs(expenseDiff))}</b> so với tháng trước ({formatVND(prevExpense)})
              </span>
            )
          ) : (
            <span className="text-slate-500">Tháng trước chưa có dữ liệu chi tiêu</span>
          )}
        </div>
      </div>

      {/* 3. Interactive SVG Donut Chart */}
      {sortedCategories.length > 0 ? (
        <div className="glass-panel mx-4 my-3 rounded-3xl p-5 text-center border border-white/10">
          <div className="text-sm font-bold text-slate-100 mb-3">
            Cơ cấu chi tiêu (Chạm vào để xem chi tiết)
          </div>

          {/* Biểu đồ Donut SVG */}
          <div className="relative w-48 h-48 mx-auto">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              {donutSegments.map((item) => {
                const strokeDasharray = `${(item.percentage * 251.2) / 100} 251.2`;
                const strokeDashoffset = -((item.startAngle * 251.2) / 360);
                return (
                  <circle
                    key={item.catId}
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={item.category?.color || '#64748b'}
                    strokeWidth="16"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="cursor-pointer transition-all hover:opacity-80"
                    onClick={() => setDrillDownCategory(item.category || null)}
                  />
                );
              })}
            </svg>

            {/* Tâm biểu đồ Donut */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[11px] text-slate-400 font-medium">Khoản chi lớn nhất</span>
              <span
                className="text-sm font-extrabold max-w-[120px] truncate"
                style={{ color: sortedCategories[0]?.category?.color || '#38BDF8' }}
              >
                {sortedCategories[0]?.category?.name}
              </span>
              <span className="text-xs font-bold text-slate-100">
                {sortedCategories[0]?.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-10 px-5 text-center text-slate-500 text-sm">
          Chưa có khoản chi nào để vẽ biểu đồ
        </div>
      )}

      {/* 4. Danh sách Hạng Mục Phân Tích Kèm So Sánh MoM (Bấm vào để Drill-down) */}
      <div className="px-4 mt-2">
        <div className="text-sm font-bold text-slate-100 mb-2.5 px-1">
          Chi tiết từng danh mục (Chạm để xem lịch sử)
        </div>

        <div className="flex flex-col gap-2.5">
          {sortedCategories.map((item) => (
            <div
              key={item.catId}
              onClick={() => setDrillDownCategory(item.category || null)}
              className="glass-panel touch-btn rounded-2xl p-3.5 sm:p-4 cursor-pointer border border-white/5 hover:border-white/15 transition-all"
            >
              <div className="flex justify-between items-center">
                {/* Trái: Icon + Tên */}
                <div className="flex items-center gap-3">
                  <div
                    className="cat-badge"
                    style={{ backgroundColor: item.category?.color || '#3b82f6' }}
                  >
                    <CategoryIcon
                      name={item.category?.icon || 'CircleDot'}
                      size={20}
                      color="#ffffff"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-100">
                      {item.category?.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {item.percentage.toFixed(1)}% tổng chi
                    </div>
                  </div>
                </div>

                {/* Phải: Số tiền + Badge MoM */}
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-100">
                    {formatVND(item.amount)}
                  </div>
                  {/* MoM % Badge cho từng danh mục */}
                  <div className="mt-0.5">
                    {item.prevAmount > 0 ? (
                      <span
                        className={`text-[11px] font-semibold ${
                          item.diff > 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {item.diff > 0 ? `▲ +${item.momPercent.toFixed(0)}%` : `▼ ${item.momPercent.toFixed(0)}%`}{' '}
                        <span className="text-slate-500 font-normal">vs tháng trước</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500 font-medium">Mới phát sinh</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Thanh Progress Bar tỷ lệ % */}
              <div className="w-full h-1.5 rounded-full bg-slate-800 mt-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: item.category?.color || '#3b82f6'
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. MODAL DRILL-DOWN CHI TIẾT GIAO DỊCH CỦA DANH MỤC */}
      {drillDownCategory && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex flex-col justify-end max-w-[480px] mx-auto"
          onClick={() => setDrillDownCategory(null)}
        >
          <div
            className="glass-panel animate-slide-up bg-slate-900 rounded-t-[28px] border-t border-x border-white/10 max-h-[85vh] flex flex-col pb-[max(20px,env(safe-area-inset-bottom,0px))]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Drill-down */}
            <div className="px-5 pt-4.5 pb-3.5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="cat-badge"
                  style={{ backgroundColor: drillDownCategory.color }}
                >
                  <CategoryIcon name={drillDownCategory.icon} size={22} color="#ffffff" />
                </div>
                <div>
                  <div className="text-base font-bold text-slate-100">
                    {drillDownCategory.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatMonthDisplay(selectedMonth)} • {drillDownTxs.length} giao dịch
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrillDownCategory(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center touch-btn cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Danh sách giao dịch chi tiết */}
            <div className="p-4 overflow-y-auto flex flex-col gap-2">
              {drillDownTxs.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Không có giao dịch nào
                </div>
              ) : (
                drillDownTxs.map((tx) => (
                  <div
                    key={tx.id}
                    onClick={() => {
                      if (onEditTransaction) {
                        setDrillDownCategory(null);
                        onEditTransaction(tx);
                      }
                    }}
                    className="touch-btn flex items-center justify-between p-3 bg-slate-800/80 rounded-xl border border-white/5 cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-100">
                        {tx.note || drillDownCategory.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {formatFriendlyDate(tx.date)} • {tx.time}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-rose-500">
                      -{formatVND(tx.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
