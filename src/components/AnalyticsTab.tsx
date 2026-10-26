// src/components/AnalyticsTab.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Category, Transaction, Wallet } from '../types';
import { CategoryIcon } from './CategoryIcon';
import {
  formatVND,
  formatMonthDisplay,
  getCurrentMonth,
  getPreviousMonth,
  formatFriendlyDate,
  getLastNMonths
} from '../utils/formatters';
import { exportTransactionsToExcel } from '../services/backupService';
import { CustomSelect } from './ui/CustomSelect';
import { Toast } from './ui/Toast';
import {
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  PieChart,
  BarChart3,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  FileSpreadsheet,
  RotateCw,
  Layers,
  ListTree,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';

interface AnalyticsTabProps {
  onEditTransaction?: (tx: Transaction) => void;
  resetSignal?: number;
}

type ReportType = 'EXPENSE' | 'INCOME';
type ExpenseGroupingMode = 'DETAIL' | 'PARENT';
type ReportDimension = 'CATEGORY' | 'DAILY';

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ onEditTransaction, resetSignal }) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [reportType, setReportType] = useState<ReportType>('EXPENSE');
  const [groupingMode, setGroupingMode] = useState<ExpenseGroupingMode>('DETAIL');
  const [drillDownCategory, setDrillDownCategory] = useState<Category | null>(null);
  const [drillDownDateFilter, setDrillDownDateFilter] = useState<string>('ALL');
  const [reportDimension, setReportDimension] = useState<ReportDimension>('CATEGORY');
  const [expandedDailyDates, setExpandedDailyDates] = useState<Set<string>>(() => new Set());
  const [mainDailyFilter, setMainDailyFilter] = useState<string>('ALL');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportToast, setExportToast] = useState<string | null>(null);

  // Lắng nghe tín hiệu từ menu điều hướng để trở về báo cáo tổng quan chính
  const prevResetSignalRef = React.useRef(resetSignal);
  React.useEffect(() => {
    if (
      resetSignal !== undefined &&
      resetSignal > 0 &&
      resetSignal !== prevResetSignalRef.current
    ) {
      prevResetSignalRef.current = resetSignal;
      setDrillDownCategory(null);
      setDrillDownDateFilter('ALL');
      setMainDailyFilter('ALL');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [resetSignal]);

  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];

  const categoryMap = useMemo(() => {
    return new Map<string, Category>(categories.map((c) => [c.id, c]));
  }, [categories]);

  const walletMap = useMemo(() => {
    return new Map<string, Wallet>(wallets.map((w) => [w.id, w]));
  }, [wallets]);

  const prevMonth = useMemo(() => getPreviousMonth(selectedMonth), [selectedMonth]);

  const thisMonthTxs =
    useLiveQuery(
      () => db.transactions.filter((tx) => tx.date.startsWith(selectedMonth)).toArray(),
      [selectedMonth]
    ) || [];

  const prevMonthTxs =
    useLiveQuery(
      () => db.transactions.filter((tx) => tx.date.startsWith(prevMonth)).toArray(),
      [prevMonth]
    ) || [];

  const last6Months = useMemo(() => getLastNMonths(selectedMonth, 6), [selectedMonth]);
  const minMonth = last6Months[0];

  const multiMonthTxs =
    useLiveQuery(
      () =>
        db.transactions
          .filter((tx) => tx.date >= `${minMonth}-01` && tx.date <= `${selectedMonth}-31`)
          .toArray(),
      [selectedMonth, minMonth]
    ) || [];

  // Tính toán số liệu tháng hiện tại (Chuẩn MISA: Chỉ tính Thu/Chi thuần, loại trừ Vay nợ & excludeFromReport)
  const {
    thisIncome,
    thisExpense,
    thisNet,
    thisCatExpenseMap,
    thisParentExpenseMap,
    thisCatIncomeMap
  } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    const catExpMap: Record<string, number> = {};
    const parentExpMap: Record<string, number> = {};
    const catIncMap: Record<string, number> = {};

    thisMonthTxs.forEach((tx) => {
      if (tx.excludeFromReport) return;

      if (tx.type === 'INCOME') {
        inc += tx.amount;
        if (tx.categoryId) {
          catIncMap[tx.categoryId] = (catIncMap[tx.categoryId] || 0) + tx.amount;
        }
      } else if (tx.type === 'EXPENSE') {
        exp += tx.amount;
        if (tx.categoryId) {
          catExpMap[tx.categoryId] = (catExpMap[tx.categoryId] || 0) + tx.amount;
          const cat = categoryMap.get(tx.categoryId);
          const groupKey = cat?.parentId || tx.categoryId;
          parentExpMap[groupKey] = (parentExpMap[groupKey] || 0) + tx.amount;
        }
      } else if (tx.type === 'TRANSFER' && tx.transferFee && tx.transferFee > 0) {
        exp += tx.transferFee;
      }
    });

    return {
      thisIncome: inc,
      thisExpense: exp,
      thisNet: inc - exp,
      thisCatExpenseMap: catExpMap,
      thisParentExpenseMap: parentExpMap,
      thisCatIncomeMap: catIncMap
    };
  }, [thisMonthTxs, categoryMap]);

  // Tính toán số liệu tháng trước để so sánh MoM
  const {
    prevIncome,
    prevExpense,
    prevCatExpenseMap,
    prevParentExpenseMap,
    prevCatIncomeMap
  } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    const catExpMap: Record<string, number> = {};
    const parentExpMap: Record<string, number> = {};
    const catIncMap: Record<string, number> = {};

    prevMonthTxs.forEach((tx) => {
      if (tx.excludeFromReport) return;

      if (tx.type === 'INCOME') {
        inc += tx.amount;
        if (tx.categoryId) {
          catIncMap[tx.categoryId] = (catIncMap[tx.categoryId] || 0) + tx.amount;
        }
      } else if (tx.type === 'EXPENSE') {
        exp += tx.amount;
        if (tx.categoryId) {
          catExpMap[tx.categoryId] = (catExpMap[tx.categoryId] || 0) + tx.amount;
          const cat = categoryMap.get(tx.categoryId);
          const groupKey = cat?.parentId || tx.categoryId;
          parentExpMap[groupKey] = (parentExpMap[groupKey] || 0) + tx.amount;
        }
      } else if (tx.type === 'TRANSFER' && tx.transferFee && tx.transferFee > 0) {
        exp += tx.transferFee;
      }
    });

    return {
      prevIncome: inc,
      prevExpense: exp,
      prevCatExpenseMap: catExpMap,
      prevParentExpenseMap: parentExpMap,
      prevCatIncomeMap: catIncMap
    };
  }, [prevMonthTxs, categoryMap]);

  const expenseDiff = thisExpense - prevExpense;
  const expenseMoMPercent =
    prevExpense > 0 ? (expenseDiff / prevExpense) * 100 : thisExpense > 0 ? 100 : 0;

  const incomeDiff = thisIncome - prevIncome;
  const incomeMoMPercent =
    prevIncome > 0 ? (incomeDiff / prevIncome) * 100 : thisIncome > 0 ? 100 : 0;

  // Dữ liệu biểu đồ cột xu hướng 6 tháng gần nhất
  const trendData = useMemo(() => {
    return last6Months.map((mStr) => {
      let income = 0;
      let expense = 0;
      multiMonthTxs.forEach((tx) => {
        if (tx.excludeFromReport) return;
        if (tx.date.startsWith(mStr)) {
          if (tx.type === 'INCOME') income += tx.amount;
          if (tx.type === 'EXPENSE') expense += tx.amount;
          if (tx.type === 'TRANSFER' && tx.transferFee && tx.transferFee > 0) {
            expense += tx.transferFee;
          }
        }
      });
      const net = income - expense;
      const monthNum = parseInt(mStr.split('-')[1], 10);
      return {
        monthStr: mStr,
        label: `T${monthNum}`,
        income,
        expense,
        net
      };
    });
  }, [last6Months, multiMonthTxs]);

  const maxTrendValue = useMemo(() => {
    let max = 0;
    trendData.forEach((d) => {
      if (d.income > max) max = d.income;
      if (d.expense > max) max = d.expense;
    });
    return max > 0 ? max : 1;
  }, [trendData]);

  // Danh mục phân loại theo chế độ chọn (EXPENSE: Chi tiết / Nhóm Cha 50-30-20; hoặc INCOME)
  const activeCatMap =
    reportType === 'EXPENSE'
      ? groupingMode === 'PARENT'
        ? thisParentExpenseMap
        : thisCatExpenseMap
      : thisCatIncomeMap;
  const prevActiveCatMap =
    reportType === 'EXPENSE'
      ? groupingMode === 'PARENT'
        ? prevParentExpenseMap
        : prevCatExpenseMap
      : prevCatIncomeMap;
  const activeTotal = reportType === 'EXPENSE' ? thisExpense : thisIncome;

  const sortedCategories = useMemo(() => {
    return Object.entries(activeCatMap)
      .map(([catId, amount]) => {
        const cat = categoryMap.get(catId);
        const prevCatAmount = prevActiveCatMap[catId] || 0;
        const catDiff = amount - prevCatAmount;
        const catMoMPercent =
          prevCatAmount > 0 ? (catDiff / prevCatAmount) * 100 : amount > 0 ? 100 : 0;
        const percentage = activeTotal > 0 ? (amount / activeTotal) * 100 : 0;

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
  }, [activeCatMap, prevActiveCatMap, activeTotal, categoryMap]);

  const donutSegments = useMemo(() => {
    const segments: Array<(typeof sortedCategories)[0] & { startAngle: number; angle: number }> = [];
    let currentAngle = 0;
    for (const item of sortedCategories) {
      const angle = (item.percentage / 100) * 360;
      segments.push({
        ...item,
        startAngle: currentAngle,
        angle
      });
      currentAngle += angle;
    }
    return segments;
  }, [sortedCategories]);

  // Các giao dịch thuộc danh mục đang Drill-down (Hỗ trợ cả Hạng mục Cha và Hạng mục Con)
  const drillDownTxs = useMemo(() => {
    if (!drillDownCategory) return [];
    return thisMonthTxs
      .filter((tx) => {
        if (tx.excludeFromReport) return false;
        if (tx.type !== reportType) return false;
        if (tx.categoryId === drillDownCategory.id) return true;
        // Nếu drillDownCategory là Nhóm Cha, lấy cả các giao dịch thuộc hạng mục con của nó
        const txCat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
        return txCat?.parentId === drillDownCategory.id;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [drillDownCategory, thisMonthTxs, reportType, categoryMap]);

  const drillDownTotal = useMemo(() => {
    return drillDownTxs.reduce((sum, tx) => sum + tx.amount, 0);
  }, [drillDownTxs]);

  // Danh sách các ngày riêng biệt có giao dịch trong danh mục đang xem
  const distinctDrillDownDates = useMemo(() => {
    const dates = Array.from(new Set(drillDownTxs.map((tx) => tx.date)));
    return dates.sort((a, b) => b.localeCompare(a));
  }, [drillDownTxs]);

  // Lọc giao dịch drill-down theo ngày (nếu người dùng chọn 1 ngày cụ thể)
  const filteredDrillDownTxs = useMemo(() => {
    if (drillDownDateFilter === 'ALL') return drillDownTxs;
    return drillDownTxs.filter((tx) => tx.date === drillDownDateFilter);
  }, [drillDownTxs, drillDownDateFilter]);

  // Nhóm các giao dịch drill-down theo từng ngày (sắp xếp giờ mới nhất lên trên)
  const groupedDrillDownTxs = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of filteredDrillDownTxs) {
      const list = map.get(tx.date) || [];
      list.push(tx);
      map.set(tx.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const timeA = a.time || '00:00';
        const timeB = b.time || '00:00';
        if (timeA !== timeB) return timeB.localeCompare(timeA);
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
    }
    return map;
  }, [filteredDrillDownTxs]);

  // Bảng kê tổng thu, chi và ròng theo từng ngày trong tháng cho chế độ Xem Theo Ngày
  const dailyCashflowBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        income: number;
        expense: number;
        net: number;
        txCount: number;
        txs: Transaction[];
      }
    >();

    thisMonthTxs.forEach((tx) => {
      if (tx.excludeFromReport) return;
      const entry = map.get(tx.date) || {
        date: tx.date,
        income: 0,
        expense: 0,
        net: 0,
        txCount: 0,
        txs: []
      };

      if (tx.type === 'INCOME') {
        entry.income += tx.amount;
        entry.net += tx.amount;
      } else if (tx.type === 'EXPENSE') {
        entry.expense += tx.amount;
        entry.net -= tx.amount;
      } else if (tx.type === 'TRANSFER' && tx.transferFee && tx.transferFee > 0) {
        entry.expense += tx.transferFee;
        entry.net -= tx.transferFee;
      }

      entry.txCount += 1;
      entry.txs.push(tx);
      map.set(tx.date, entry);
    });

    const list = Array.from(map.values());
    list.sort((a, b) => b.date.localeCompare(a.date));

    list.forEach((day) => {
      day.txs.sort((a, b) => {
        const timeA = a.time || '00:00';
        const timeB = b.time || '00:00';
        if (timeA !== timeB) return timeB.localeCompare(timeA);
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
    });

    return list;
  }, [thisMonthTxs]);

  // Toggle mở rộng / thu gọn 1 ngày trong chế độ Theo Ngày
  const toggleDailyExpand = (dateStr: string) => {
    setExpandedDailyDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

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

  const handleExportMonth = async () => {
    if (thisMonthTxs.length === 0) {
      alert(`Tháng ${formatMonthDisplay(selectedMonth)} chưa có giao dịch nào để xuất.`);
      return;
    }
    setIsExporting(true);
    try {
      const res = await exportTransactionsToExcel({ month: selectedMonth });
      setExportToast(`Đã xuất ${res.transactionCount} giao dịch tháng ${selectedMonth}!`);
      setTimeout(() => setExportToast(null), 3000);
    } catch (err: any) {
      alert(err?.message || 'Có lỗi khi xuất file Excel');
    } finally {
      setIsExporting(false);
    }
  };

  if (drillDownCategory) {
    const activeFilteredTotal = filteredDrillDownTxs.reduce((sum, tx) => sum + tx.amount, 0);

    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4 animate-fade-in">
        {/* Header điều hướng */}
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <button
            type="button"
            onClick={() => {
              setDrillDownCategory(null);
              setDrillDownDateFilter('ALL');
            }}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-xs font-extrabold text-slate-100 uppercase tracking-wider text-center flex-1 truncate mx-2">
            Chi tiết: {drillDownCategory.name}
          </span>
          <div className="w-9" />
        </div>

        {/* THẺ TỔNG Ở ĐẦU TRANG (GIỮ NGUYÊN TỔNG CẢ THÁNG NHƯ YÊU CẦU) */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="cat-badge shrink-0"
              style={{ backgroundColor: drillDownCategory.color }}
            >
              <CategoryIcon name={drillDownCategory.icon} size={22} color="#ffffff" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold text-slate-100 truncate">
                {drillDownCategory.name}
              </div>
              <div className="text-xs text-slate-400">
                {formatMonthDisplay(selectedMonth)} • {drillDownTxs.length} giao dịch
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div
              className={`text-lg font-extrabold ${
                reportType === 'EXPENSE' ? 'text-expense' : 'text-income'
              }`}
            >
              {reportType === 'EXPENSE'
                ? `-${formatVND(drillDownTotal)}`
                : `+${formatVND(drillDownTotal)}`}
            </div>
            <div className="text-xs text-slate-400">
              {activeTotal > 0 ? ((drillDownTotal / activeTotal) * 100).toFixed(1) : 0}% tháng
            </div>
          </div>
        </div>

        {/* BỘ LỌC THEO NGÀY CHO DANH MỤC NÀY */}
        {distinctDrillDownDates.length > 1 && (
          <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-slate-900/80 border border-white/8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <Calendar size={14} className="text-sky-400 shrink-0" />
                <span>Lọc theo ngày ({distinctDrillDownDates.length} ngày phát sinh)</span>
              </div>
              {drillDownDateFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setDrillDownDateFilter('ALL')}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold cursor-pointer flex items-center gap-1 bg-transparent border-none p-0"
                >
                  <X size={12} />
                  <span>Xem tất cả ngày</span>
                </button>
              )}
            </div>

            {/* Dropdown Lọc Ngày */}
            <CustomSelect
              value={drillDownDateFilter}
              onChange={setDrillDownDateFilter}
              options={[
                {
                  value: 'ALL',
                  label: `Toàn bộ các ngày (${drillDownTxs.length} giao dịch • ${formatVND(drillDownTotal)})`
                },
                ...distinctDrillDownDates.map((d) => {
                  const dayTxs = drillDownTxs.filter((t) => t.date === d);
                  const daySum = dayTxs.reduce((s, t) => s + t.amount, 0);
                  return {
                    value: d,
                    label: `${formatFriendlyDate(d)} (${dayTxs.length} GD • ${formatVND(daySum)})`
                  };
                })
              ]}
              triggerClassName="text-xs py-2 bg-slate-800"
            />

            {/* Chips chọn nhanh các ngày gần nhất */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
              <button
                type="button"
                onClick={() => setDrillDownDateFilter('ALL')}
                className={`touch-btn px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  drillDownDateFilter === 'ALL'
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white border border-white/6'
                }`}
              >
                Tất cả ngày
              </button>
              {distinctDrillDownDates.slice(0, 4).map((d) => {
                const dayTxs = drillDownTxs.filter((t) => t.date === d);
                const daySum = dayTxs.reduce((s, t) => s + t.amount, 0);
                const isSelected = drillDownDateFilter === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDrillDownDateFilter(d)}
                    className={`touch-btn px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-sky-500 text-slate-950 font-bold'
                        : 'bg-slate-800/80 text-slate-300 hover:text-white border border-white/6'
                    }`}
                  >
                    {formatFriendlyDate(d)} ({formatVND(daySum)})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* THÔNG BÁO KHI ĐANG LỌC 1 NGÀY CỤ THỂ */}
        {drillDownDateFilter !== 'ALL' && (
          <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-400/25 flex items-center justify-between text-xs">
            <span className="text-slate-300">
              Đang xem ngày <strong className="text-white">{formatFriendlyDate(drillDownDateFilter)}</strong>:{' '}
              <strong className={reportType === 'EXPENSE' ? 'text-expense' : 'text-income'}>
                {reportType === 'EXPENSE' ? '-' : '+'}{formatVND(activeFilteredTotal)}
              </strong>{' '}
              ({filteredDrillDownTxs.length} GD)
            </span>
            <button
              type="button"
              onClick={() => setDrillDownDateFilter('ALL')}
              className="text-[11px] text-sky-400 hover:text-sky-300 font-bold cursor-pointer underline bg-transparent border-none p-0"
            >
              Xem tất cả
            </button>
          </div>
        )}

        {/* DANH SÁCH GIAO DỊCH PHÂN LOẠI RÕ RÀNG THEO TỪNG NGÀY */}
        <div className="flex flex-col gap-4">
          {filteredDrillDownTxs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              Không có giao dịch nào phù hợp với bộ lọc ngày đã chọn
            </div>
          ) : (
            Array.from(groupedDrillDownTxs.entries()).map(([dateStr, txs]) => {
              const daySubTotal = txs.reduce((sum, tx) => sum + tx.amount, 0);

              return (
                <div key={dateStr} className="flex flex-col gap-2">
                  {/* Tiêu đề Ngày kèm Tổng Tiền Trong Ngày */}
                  <div className="flex items-center justify-between px-2 pt-1 pb-0.5 border-b border-white/6">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar size={13} className="text-sky-400 shrink-0" />
                      <span className="text-xs font-extrabold text-slate-200">
                        {formatFriendlyDate(dateStr)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/6 text-slate-400 font-medium shrink-0">
                        {txs.length} GD
                      </span>
                    </div>

                    <div
                      className={`text-xs font-bold shrink-0 ${
                        reportType === 'EXPENSE' ? 'text-expense' : 'text-income'
                      }`}
                    >
                      {reportType === 'EXPENSE'
                        ? `-${formatVND(daySubTotal)}`
                        : `+${formatVND(daySubTotal)}`}
                    </div>
                  </div>

                  {/* Các giao dịch trong ngày */}
                  <div className="flex flex-col gap-2">
                    {txs.map((tx) => {
                      const wallet = walletMap.get(tx.walletId);
                      const txCat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
                      return (
                        <div
                          key={tx.id}
                          onClick={() => {
                            if (onEditTransaction) {
                              setDrillDownCategory(null);
                              setDrillDownDateFilter('ALL');
                              onEditTransaction(tx);
                            }
                          }}
                          className="touch-btn flex items-center justify-between p-3.5 bg-slate-900/80 rounded-2xl border border-white/8 cursor-pointer hover:bg-slate-800 transition-colors"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="text-xs font-bold text-slate-100 truncate">
                              {tx.note || txCat?.name || drillDownCategory.name}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span>lúc {tx.time || '00:00'}</span>
                              <span>•</span>
                              <span className="text-slate-300 font-medium">
                                {wallet?.name || 'Ví'}
                              </span>
                              {txCat && txCat.id !== drillDownCategory.id && (
                                <>
                                  <span>•</span>
                                  <span className="text-sky-400 font-medium">{txCat.name}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div
                            className={`text-sm font-bold shrink-0 ml-1 ${
                              reportType === 'EXPENSE' ? 'text-expense' : 'text-income'
                            }`}
                          >
                            {reportType === 'EXPENSE'
                              ? `-${formatVND(tx.amount)}`
                              : `+${formatVND(tx.amount)}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28">
      {/* 1. Header Chọn Tháng & Nút Xuất Excel Tháng */}
      <div className="flex items-center justify-between mx-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 border border-white/8 text-slate-400 flex items-center justify-center cursor-pointer hover:text-white"
            title="Tháng trước"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/50 border border-white/6">
            <Calendar size={15} className="text-sky-400" />
            <span className="text-[14px] font-bold text-slate-100">
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

        <button
          type="button"
          onClick={handleExportMonth}
          disabled={isExporting}
          className="touch-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-xs font-semibold hover:bg-emerald-500/25 cursor-pointer transition-colors"
          title={`Xuất báo cáo Excel tháng ${selectedMonth}`}
        >
          {isExporting ? (
            <RotateCw size={14} className="animate-spin" />
          ) : (
            <FileSpreadsheet size={14} />
          )}
          <span>Xuất Excel</span>
        </button>
      </div>

      {exportToast && (
        <Toast
          message={exportToast}
          type="success"
          onClose={() => setExportToast(null)}
        />
      )}

      {/* 2. Thẻ Tổng Quan Dòng Tiền & MoM */}
      <div className="mx-4 my-2.5 rounded-3xl p-5 bg-gradient-to-br from-slate-800/95 to-slate-900/98 border border-white/10 shadow-xl backdrop-blur-md">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              Dòng tiền ròng tháng này
            </span>
            <div
              className={`font-heading text-3xl font-black mt-1 tracking-tight ${
                thisNet >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {thisNet >= 0 ? `+${formatVND(thisNet)}` : formatVND(thisNet)}
            </div>
          </div>

          <div
            className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${
              thisNet >= 0
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                : 'bg-rose-500/15 text-rose-400 border-rose-500/25'
            }`}
          >
            {thisNet >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>{thisNet >= 0 ? 'Thặng dư' : 'Thâm hụt'}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4 pt-3.5 border-t border-white/10">
          <div className="p-3 rounded-2xl bg-slate-800/60 border border-white/5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <ArrowDownLeft size={14} className="text-emerald-400" />
              <span>Tổng thu thuần</span>
            </div>
            <div className="text-base font-extrabold text-income mt-1">
              +{formatVND(thisIncome)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {prevIncome > 0 ? (
                <span className={incomeDiff >= 0 ? 'text-emerald-400' : 'text-slate-400'}>
                  {incomeDiff >= 0 ? `▲ +${incomeMoMPercent.toFixed(0)}%` : `▼ ${incomeMoMPercent.toFixed(0)}%`}{' '}
                  <span className="text-slate-500">vs T trước</span>
                </span>
              ) : (
                <span className="text-slate-500">Tháng trước: 0đ</span>
              )}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-800/60 border border-white/5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <ArrowUpRight size={14} className="text-rose-400" />
              <span>Tổng chi thuần</span>
            </div>
            <div className="text-base font-extrabold text-expense mt-1">
              -{formatVND(thisExpense)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {prevExpense > 0 ? (
                <span className={expenseDiff > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                  {expenseDiff > 0 ? `▲ +${expenseMoMPercent.toFixed(0)}%` : `▼ ${expenseMoMPercent.toFixed(0)}%`}{' '}
                  <span className="text-slate-500">vs T trước</span>
                </span>
              ) : (
                <span className="text-slate-500">Tháng trước: 0đ</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. BIỂU ĐỒ CỘT XU HƯỚNG 6 THÁNG GẦN NHẤT */}
      <div className="mx-4 my-3 rounded-3xl p-4 bg-slate-900/80 border border-white/10 shadow-lg">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <BarChart3 size={17} className="text-sky-400" />
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Xu hướng dòng tiền 6 tháng
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Thu
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Chi
            </span>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-2 pt-2 pb-1 border-b border-white/6 items-end h-28">
          {trendData.map((d) => {
            const isSelected = d.monthStr === selectedMonth;
            const incomeHeight = d.income > 0 ? Math.max(6, Math.round((d.income / maxTrendValue) * 80)) : 0;
            const expenseHeight = d.expense > 0 ? Math.max(6, Math.round((d.expense / maxTrendValue) * 80)) : 0;

            return (
              <div
                key={d.monthStr}
                onClick={() => setSelectedMonth(d.monthStr)}
                className={`touch-btn flex flex-col items-center justify-end h-full cursor-pointer p-1 rounded-xl transition-all ${
                  isSelected ? 'bg-white/8 border border-white/15' : 'hover:bg-white/4'
                }`}
                title={`${formatMonthDisplay(d.monthStr)}: Thu ${formatVND(d.income)}, Chi ${formatVND(d.expense)}`}
              >
                <div className="flex items-end gap-1 h-[80px] w-full justify-center">
                  <div
                    className="w-2.5 rounded-t-sm bg-emerald-500 transition-all duration-300"
                    style={{ height: `${incomeHeight}px` }}
                  />
                  <div
                    className="w-2.5 rounded-t-sm bg-rose-500 transition-all duration-300"
                    style={{ height: `${expenseHeight}px` }}
                  />
                </div>

                <span
                  className={`text-[11px] font-bold mt-1.5 ${
                    isSelected ? 'text-sky-400' : 'text-slate-400'
                  }`}
                >
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-slate-500 text-center mt-2">
          Chạm vào cột tháng bất kỳ để xem phân tích chi tiết của tháng đó
        </div>
      </div>

      {/* 4. CHUYỂN ĐỔI CHẾ ĐỘ XEM: THEO DANH MỤC VS THEO TỪNG NGÀY TRONG THÁNG */}
      <div className="mx-4 mt-4 mb-2.5 grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-900 border border-white/8 shadow-inner">
        <button
          type="button"
          onClick={() => setReportDimension('CATEGORY')}
          className={`touch-btn h-10 px-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            reportDimension === 'CATEGORY'
              ? 'bg-sky-500 text-slate-950 font-black shadow-md shadow-sky-500/25'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PieChart size={14} className="shrink-0" />
          <span>Theo Danh mục</span>
        </button>

        <button
          type="button"
          onClick={() => setReportDimension('DAILY')}
          className={`touch-btn h-10 px-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            reportDimension === 'DAILY'
              ? 'bg-sky-500 text-slate-950 font-black shadow-md shadow-sky-500/25'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar size={14} className="shrink-0" />
          <span>Theo Từng ngày ({dailyCashflowBreakdown.length})</span>
        </button>
      </div>

      {reportDimension === 'DAILY' ? (
        <div className="px-4 mt-1 flex flex-col gap-3">
          {/* Bộ lọc ngày trên toàn tháng */}
          {dailyCashflowBreakdown.length > 1 && (
            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/8 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                  <Calendar size={14} className="text-sky-400 shrink-0" />
                  <span>Lọc xem theo ngày ({dailyCashflowBreakdown.length} ngày phát sinh)</span>
                </div>
                {mainDailyFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setMainDailyFilter('ALL')}
                    className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold cursor-pointer flex items-center gap-1 bg-transparent border-none p-0"
                  >
                    <X size={12} />
                    <span>Xem tất cả</span>
                  </button>
                )}
              </div>

              <CustomSelect
                value={mainDailyFilter}
                onChange={setMainDailyFilter}
                options={[
                  {
                    value: 'ALL',
                    label: `Tất cả các ngày trong tháng (${dailyCashflowBreakdown.length} ngày)`
                  },
                  ...dailyCashflowBreakdown.map((day) => ({
                    value: day.date,
                    label: `${formatFriendlyDate(day.date)} (Thu: +${formatVND(day.income)} | Chi: -${formatVND(day.expense)})`
                  }))
                ]}
                triggerClassName="text-xs py-2 bg-slate-800"
              />

              {/* Chips chọn nhanh */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
                <button
                  type="button"
                  onClick={() => setMainDailyFilter('ALL')}
                  className={`touch-btn px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    mainDailyFilter === 'ALL'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-slate-800/80 text-slate-400 hover:text-white border border-white/6'
                  }`}
                >
                  Tất cả ngày
                </button>
                {dailyCashflowBreakdown.slice(0, 5).map((d) => {
                  const isSelected = mainDailyFilter === d.date;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => setMainDailyFilter(d.date)}
                      className={`touch-btn px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-sky-500 text-slate-950 font-bold'
                          : 'bg-slate-800/80 text-slate-300 hover:text-white border border-white/6'
                      }`}
                    >
                      {formatFriendlyDate(d.date)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Danh sách các ngày */}
          {dailyCashflowBreakdown.length === 0 ? (
            <div className="p-8 rounded-3xl bg-slate-900/40 border border-white/5 text-center text-slate-500 text-xs">
              Chưa có giao dịch nào trong tháng này để phân tích theo ngày
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {dailyCashflowBreakdown
                .filter((d) => mainDailyFilter === 'ALL' || d.date === mainDailyFilter)
                .map((day) => {
                  const isExpanded = expandedDailyDates.has(day.date) || mainDailyFilter !== 'ALL';

                  return (
                    <div
                      key={day.date}
                      className="rounded-2xl bg-slate-900/80 border border-white/8 overflow-hidden transition-all shadow-sm"
                    >
                      {/* Tiêu đề ngày bấm để mở rộng / thu gọn */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleDailyExpand(day.date)}
                        className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-400 flex items-center justify-center shrink-0">
                            <Calendar size={15} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-100 truncate">
                              {formatFriendlyDate(day.date)}
                            </div>
                            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                              <span>{day.txCount} giao dịch</span>
                              <span>•</span>
                              <span
                                className={`font-semibold ${
                                  day.net >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                Ròng: {day.net >= 0 ? `+${formatVND(day.net)}` : formatVND(day.net)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <div className="text-right">
                            {day.income > 0 && (
                              <div className="text-xs font-bold text-income">
                                +{formatVND(day.income)}
                              </div>
                            )}
                            {day.expense > 0 && (
                              <div className="text-xs font-bold text-expense">
                                -{formatVND(day.expense)}
                              </div>
                            )}
                          </div>
                          <div className="text-slate-400">
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>
                      </div>

                      {/* Danh sách giao dịch chi tiết của ngày khi mở rộng */}
                      {isExpanded && (
                        <div className="p-3 pt-0 border-t border-white/6 flex flex-col gap-1.5 mt-1">
                          {day.txs.map((tx) => {
                            const wallet = walletMap.get(tx.walletId);
                            const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
                            const isIncome = tx.type === 'INCOME';
                            const isExpense = tx.type === 'EXPENSE';

                            return (
                              <div
                                key={tx.id}
                                onClick={() => {
                                  if (onEditTransaction) {
                                    onEditTransaction(tx);
                                  }
                                }}
                                className="touch-btn flex items-center justify-between p-2.5 bg-slate-800/60 rounded-xl border border-white/5 cursor-pointer hover:bg-slate-800 transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                                    style={{
                                      backgroundColor: cat?.color ? `${cat.color}25` : '#64748b25',
                                      color: cat?.color || '#94a3b8'
                                    }}
                                  >
                                    <CategoryIcon
                                      name={cat?.icon || 'CircleDot'}
                                      size={13}
                                      color={cat?.color || '#94a3b8'}
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-slate-100 truncate">
                                      {tx.note || cat?.name || 'Giao dịch'}
                                    </div>
                                    <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                                      <span>lúc {tx.time || '00:00'}</span>
                                      <span>•</span>
                                      <span className="text-slate-300">{wallet?.name || 'Ví'}</span>
                                      {cat && (
                                        <>
                                          <span>•</span>
                                          <span className="text-slate-300">{cat.name}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div
                                  className={`text-xs font-bold shrink-0 ml-2 ${
                                    isIncome
                                      ? 'text-income'
                                      : isExpense
                                      ? 'text-expense'
                                      : 'text-sky-400'
                                  }`}
                                >
                                  {isIncome ? `+${formatVND(tx.amount)}` : isExpense ? `-${formatVND(tx.amount)}` : formatVND(tx.amount)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 4. CHUYỂN ĐỔI CHẾ ĐỘ PHÂN TÍCH: CHI TIÊU VS THU NHẬP */}
      <div className="mx-4 mt-4 mb-2 grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-900 border border-white/8">
        <button
          type="button"
          onClick={() => setReportType('EXPENSE')}
          className={`touch-btn h-10 px-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            reportType === 'EXPENSE'
              ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PieChart size={14} className="shrink-0" />
          <span className="truncate">Chi tiêu ({sortedCategories.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setReportType('INCOME')}
          className={`touch-btn h-10 px-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            reportType === 'INCOME'
              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PieChart size={14} className="shrink-0" />
          <span className="truncate">Thu nhập</span>
        </button>
      </div>

      {/* NÚT CHUYỂN CHẾ ĐỘ GOM NHÓM CHI TIÊU: HẠNG MỤC CHI TIẾT VS NHÓM CHA (50/30/20) */}
      {reportType === 'EXPENSE' && (
        <div className="mx-4 mb-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setGroupingMode('DETAIL')}
            className={`touch-btn h-10 px-3 rounded-xl border text-xs font-bold whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              groupingMode === 'DETAIL'
                ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                : 'bg-slate-900/70 border-white/6 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListTree size={14} className="shrink-0" />
            <span className="truncate">Theo Hạng mục con</span>
          </button>

          <button
            type="button"
            onClick={() => setGroupingMode('PARENT')}
            className={`touch-btn h-10 px-3 rounded-xl border text-xs font-bold whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              groupingMode === 'PARENT'
                ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                : 'bg-slate-900/70 border-white/6 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers size={14} className="shrink-0" />
            <span className="truncate">Theo Nhóm Cha</span>
          </button>
        </div>
      )}

      {/* 5. INTERACTIVE DONUT CHART */}
      {sortedCategories.length > 0 ? (
        <div className="mx-4 my-2.5 rounded-3xl p-5 bg-slate-900/80 border border-white/10 shadow-lg text-center">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
            {reportType === 'EXPENSE'
              ? groupingMode === 'PARENT'
                ? 'Tỷ trọng theo Nhóm Cha (Must have / Nice to have / Wasted)'
                : 'Tỷ trọng các hạng mục chi tiêu chi tiết'
              : 'Tỷ trọng các nguồn thu nhập'}
          </div>

          <div className="relative w-48 h-48 mx-auto">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              {donutSegments.map((item) => {
                const strokeDasharray = `${(item.percentage * 251.327) / 100} 251.327`;
                const strokeDashoffset = -((item.startAngle * 251.327) / 360);
                return (
                  <circle
                    key={item.catId}
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={item.category?.color || '#64748b'}
                    strokeWidth="15"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="butt"
                    className="cursor-pointer transition-all hover:opacity-80"
                    onClick={() => setDrillDownCategory(item.category || null)}
                  />
                );
              })}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4">
              <span className="text-[10px] text-slate-400 font-medium">Chiếm lớn nhất</span>
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
          <div className="text-[11px] text-slate-500 mt-3">
            Chạm vào danh mục bên dưới để xem toàn bộ giao dịch chi tiết
          </div>
        </div>
      ) : (
        <div className="mx-4 my-4 p-8 rounded-3xl bg-slate-900/40 border border-white/5 text-center text-slate-500 text-xs">
          Chưa có dữ liệu {reportType === 'EXPENSE' ? 'chi tiêu' : 'thu nhập'} trong tháng này để vẽ biểu đồ
        </div>
      )}

      {/* 6. DANH SÁCH DANH MỤC PHÂN TÍCH KÈM SO SÁNH MOM & DRILL-DOWN */}
      <div className="px-4 mt-3">
        <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 px-1">
          Bảng kê tỷ trọng & Biến động tháng (MoM)
        </div>

        <div className="flex flex-col gap-2.5">
          {sortedCategories.map((item) => (
            <div
              key={item.catId}
              onClick={() => setDrillDownCategory(item.category || null)}
              className="touch-btn rounded-2xl p-3.5 bg-slate-900/70 border border-white/6 hover:border-white/15 cursor-pointer transition-all"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="cat-badge shrink-0"
                    style={{ backgroundColor: item.category?.color || '#3b82f6' }}
                  >
                    <CategoryIcon
                      name={item.category?.icon || 'CircleDot'}
                      size={20}
                      color="#ffffff"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-100 truncate">
                      {item.category?.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {item.percentage.toFixed(1)}% tổng {reportType === 'EXPENSE' ? 'chi' : 'thu'}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-3">
                  <div
                    className={`text-sm font-bold ${
                      reportType === 'EXPENSE' ? 'text-expense' : 'text-income'
                    }`}
                  >
                    {reportType === 'EXPENSE'
                      ? `-${formatVND(item.amount)}`
                      : `+${formatVND(item.amount)}`}
                  </div>

                  <div className="mt-0.5">
                    {item.prevAmount > 0 ? (
                      <span
                        className={`text-[11px] font-semibold ${
                          reportType === 'EXPENSE'
                            ? item.diff > 0
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                            : item.diff >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {item.diff >= 0 ? `▲ +${item.momPercent.toFixed(0)}%` : `▼ ${item.momPercent.toFixed(0)}%`}{' '}
                        <span className="text-slate-500 font-normal">vs T trước</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500 font-medium">Mới phát sinh</span>
                    )}
                  </div>
                </div>
              </div>

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
    </>
  )}
</div>
  );
};
