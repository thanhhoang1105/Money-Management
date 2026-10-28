// src/components/AnalyticsTab.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Category, Transaction, Wallet } from '../types';
import { CategoryIcon, ICON_MAP } from './CategoryIcon';
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
  X,
  CircleDot
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
  const [trendChartMode, setTrendChartMode] = useState<'CASHFLOW' | 'NET_WORTH'>('CASHFLOW');

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

  const postMinMonthTxs =
    useLiveQuery(
      () => db.transactions.where('date').aboveOrEqual(`${minMonth}-01`).toArray(),
      [minMonth]
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
        const key = tx.categoryId || 'system_uncategorized';
        catIncMap[key] = (catIncMap[key] || 0) + tx.amount;
      } else if (tx.type === 'EXPENSE') {
        exp += tx.amount;
        const key = tx.categoryId || 'system_uncategorized';
        catExpMap[key] = (catExpMap[key] || 0) + tx.amount;
        const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
        const groupKey = cat?.parentId || key;
        parentExpMap[groupKey] = (parentExpMap[groupKey] || 0) + tx.amount;
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
        const key = tx.categoryId || 'system_uncategorized';
        catIncMap[key] = (catIncMap[key] || 0) + tx.amount;
      } else if (tx.type === 'EXPENSE') {
        exp += tx.amount;
        const key = tx.categoryId || 'system_uncategorized';
        catExpMap[key] = (catExpMap[key] || 0) + tx.amount;
        const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
        const groupKey = cat?.parentId || key;
        parentExpMap[groupKey] = (parentExpMap[groupKey] || 0) + tx.amount;
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

  // Danh sách ID các ví được tính vào Tổng tài sản
  const includedWalletIds = useMemo(() => {
    return new Set(wallets.filter((w) => !w.isExcludedFromTotal).map((w) => w.id));
  }, [wallets]);

  // Tổng tài sản thực tế hiện tại
  const currentIncludedNetWorth = useMemo(() => {
    return wallets
      .filter((w) => !w.isExcludedFromTotal)
      .reduce((sum, w) => sum + w.balance, 0);
  }, [wallets]);

  // Tính toán Tài sản ròng tại cuối mỗi tháng trong 6 tháng (Rollback từ số dư hiện tại)
  const netWorthTrendData = useMemo(() => {
    return last6Months.map((mStr) => {
      const monthEndStr = `${mStr}-31`;
      let futureDelta = 0;

      for (const tx of postMinMonthTxs) {
        if (tx.date > monthEndStr) {
          const isFromInc = includedWalletIds.has(tx.walletId);
          const isToInc = tx.toWalletId ? includedWalletIds.has(tx.toWalletId) : false;

          if (tx.type === 'TRANSFER') {
            if (isFromInc && isToInc) {
              if (tx.transferFee && tx.transferFee > 0) {
                futureDelta -= tx.transferFee;
              }
            } else if (isFromInc && !isToInc) {
              futureDelta -= tx.amount + (tx.transferFee || 0);
            } else if (!isFromInc && isToInc) {
              futureDelta += tx.amount;
            }
          } else if (isFromInc) {
            if (
              tx.type === 'INCOME' ||
              tx.type === 'BORROW' ||
              tx.type === 'COLLECT_DEBT'
            ) {
              futureDelta += tx.amount;
            } else if (
              tx.type === 'EXPENSE' ||
              tx.type === 'LEND' ||
              tx.type === 'PAY_DEBT'
            ) {
              futureDelta -= tx.amount;
            }
          }
        }
      }

      let createdAfterInitial = 0;
      for (const w of wallets) {
        if (!w.isExcludedFromTotal && w.createdAt && w.createdAt.slice(0, 7) > mStr) {
          createdAfterInitial += w.initialBalance || 0;
        }
      }

      const netWorth = currentIncludedNetWorth - futureDelta - createdAfterInitial;
      const monthNum = parseInt(mStr.split('-')[1], 10);

      return {
        monthStr: mStr,
        label: `T${monthNum}`,
        netWorth
      };
    });
  }, [last6Months, postMinMonthTxs, includedWalletIds, currentIncludedNetWorth, wallets]);

  // Toạ độ & đường cong SVG Bezier mượt mà cho biểu đồ Tài sản ròng
  const netWorthChartLayout = useMemo(() => {
    if (netWorthTrendData.length === 0) return null;

    const values = netWorthTrendData.map((d) => d.netWorth);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal;
    const padding = Math.max(range * 0.15, 100000);
    const effMin = minVal - padding;
    const effMax = maxVal + padding;
    const effRange = Math.max(effMax - effMin, 1);

    const svgWidth = 600;
    const svgHeight = 120;
    const count = netWorthTrendData.length;

    // Toạ độ mỗi điểm nằm chính xác tại tâm của cột tháng: ((i + 0.5) / count) * svgWidth
    const points = netWorthTrendData.map((d, i) => {
      const x = ((i + 0.5) / count) * svgWidth;
      const normalized = (d.netWorth - effMin) / effRange;
      const y = Math.round(100 - normalized * 75);
      return {
        ...d,
        x,
        y
      };
    });

    const firstPt = points[0];
    const lastPt = points[points.length - 1];

    // Tạo đường cong Bezier trải đều từ cạnh trái đến cạnh phải
    let curveCommands = '';
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(i - 1, 0)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(i + 2, points.length - 1)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      curveCommands += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    // Đường line chính nối từ mép trái qua các điểm đến mép phải
    const linePath = `M 0 ${firstPt.y.toFixed(1)} L ${firstPt.x.toFixed(1)} ${firstPt.y.toFixed(1)}${curveCommands} L ${svgWidth} ${lastPt.y.toFixed(1)}`;

    // Vùng fill diện tích phủ xuống đáy biểu đồ
    const areaPath = `${linePath} L ${svgWidth} ${svgHeight} L 0 ${svgHeight} Z`;

    const startNW = values[0];
    const endNW = values[values.length - 1];
    const totalGrowth = endNW - startNW;
    const totalGrowthPercent =
      startNW > 0
        ? (totalGrowth / startNW) * 100
        : startNW < 0
        ? (totalGrowth / Math.abs(startNW)) * 100
        : endNW > 0
        ? 100
        : 0;

    return {
      points,
      linePath,
      areaPath,
      minVal,
      maxVal,
      startNW,
      endNW,
      totalGrowth,
      totalGrowthPercent
    };
  }, [netWorthTrendData]);

  const selectedNetWorthItem = useMemo(() => {
    return netWorthTrendData.find((d) => d.monthStr === selectedMonth);
  }, [netWorthTrendData, selectedMonth]);

  const selectedNetWorthMoM = useMemo(() => {
    const idx = netWorthTrendData.findIndex((d) => d.monthStr === selectedMonth);
    if (idx <= 0) return null;
    const prev = netWorthTrendData[idx - 1];
    const curr = netWorthTrendData[idx];
    const diff = curr.netWorth - prev.netWorth;
    const percent =
      prev.netWorth !== 0
        ? (diff / Math.abs(prev.netWorth)) * 100
        : curr.netWorth > 0
        ? 100
        : 0;
    return { diff, percent, isPrevZero: prev.netWorth === 0 };
  }, [netWorthTrendData, selectedMonth]);

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
    // Tổng số tiền thực tế của các danh mục hiển thị
    const totalClassified = Object.values(activeCatMap).reduce((s, v) => s + v, 0);
    const effTotal = totalClassified > 0 ? totalClassified : activeTotal;

    return Object.entries(activeCatMap)
      .map(([catId, amount]) => {
        let cat = categoryMap.get(catId);
        if (!cat) {
          cat = {
            id: catId,
            name:
              catId === 'system_uncategorized'
                ? 'Chưa phân loại'
                : catId.startsWith('parent_')
                ? 'Khác'
                : 'Chưa phân loại',
            type: reportType === 'EXPENSE' ? 'EXPENSE' : 'INCOME',
            color: '#64748B',
            icon: 'HelpCircle',
            isDefault: false,
            createdAt: '',
            updatedAt: ''
          };
        }
        const prevCatAmount = prevActiveCatMap[catId] || 0;
        const catDiff = amount - prevCatAmount;
        const catMoMPercent =
          prevCatAmount > 0 ? (catDiff / prevCatAmount) * 100 : amount > 0 ? 100 : 0;
        // Luôn tính % trên tổng thực tế của các mục để tổng các lát cắt luôn đạt đủ 100%
        const percentage = effTotal > 0 ? (amount / effTotal) * 100 : 0;

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
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [activeCatMap, prevActiveCatMap, activeTotal, categoryMap, reportType]);

  const pieChartData = useMemo(() => {
    if (sortedCategories.length === 0) {
      return { slices: [], isSingleFull: false };
    }

    const cx = 195;
    const cy = 125;
    const R_out = 66;
    const R_in = 40;

    if (sortedCategories.length === 1) {
      const single = sortedCategories[0];
      const pctText = '100%';
      const badgeW = 52;
      const badgeH = 20;
      const badgeX = 298;
      const endX = badgeX - 5;
      const endY = cy;
      const badgeY = endY - badgeH / 2;

      return {
        slices: [
          {
            ...single,
            startAngle: 0,
            endAngle: 360,
            midAngle: 90,
            angle: 360,
            pathD: '',
            isSingle: true,
            isRight: true,
            startX: cx + R_out + 1,
            startY: cy,
            elbowX: 274,
            elbowY: cy,
            endX,
            endY,
            badgeX,
            badgeY,
            badgeW,
            badgeH,
            iconX: badgeX + 6,
            iconY: badgeY + 4.5,
            textX: badgeX + 20,
            textY: badgeY + 10,
            nameX: badgeX + 2,
            nameY: badgeY + badgeH + 11,
            textAnchor: 'start' as const,
            pctText,
            showLeader: true
          }
        ],
        isSingleFull: true
      };
    }

    let currentAngle = 0;
    const rawSlices = sortedCategories.map((item, idx) => {
      const angle = (item.percentage / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      const midAngle = startAngle + angle / 2;
      currentAngle += angle;

      const rad1 = ((startAngle - 90) * Math.PI) / 180;
      const rad2 = ((endAngle - 90) * Math.PI) / 180;

      const x_out1 = cx + R_out * Math.cos(rad1);
      const y_out1 = cy + R_out * Math.sin(rad1);
      const x_out2 = cx + R_out * Math.cos(rad2);
      const y_out2 = cy + R_out * Math.sin(rad2);

      const x_in1 = cx + R_in * Math.cos(rad1);
      const y_in1 = cy + R_in * Math.sin(rad1);
      const x_in2 = cx + R_in * Math.cos(rad2);
      const y_in2 = cy + R_in * Math.sin(rad2);

      const largeArc = angle > 180 ? 1 : 0;
      // Đường vẽ lát cắt Donut (Annular sector path)
      const pathD = `M ${x_out1.toFixed(2)} ${y_out1.toFixed(2)} A ${R_out} ${R_out} 0 ${largeArc} 1 ${x_out2.toFixed(2)} ${y_out2.toFixed(2)} L ${x_in2.toFixed(2)} ${y_in2.toFixed(2)} A ${R_in} ${R_in} 0 ${largeArc} 0 ${x_in1.toFixed(2)} ${y_in1.toFixed(2)} Z`;

      const midRad = ((midAngle - 90) * Math.PI) / 180;
      const isRight = Math.cos(midRad) >= 0;

      const startX = cx + (R_out + 1) * Math.cos(midRad);
      const startY = cy + (R_out + 1) * Math.sin(midRad);

      const elbowR = R_out + 16;
      const elbowX = cx + elbowR * Math.cos(midRad);
      const elbowY = cy + elbowR * Math.sin(midRad);

      const pctText =
        item.percentage < 1
          ? `${item.percentage.toFixed(1)}%`
          : `${Math.round(item.percentage)}%`;

      // Hiển thị nhãn cho tất cả các danh mục có chi tiêu (tối đa 10 danh mục lớn nhất, tỷ trọng >= 0.5%)
      const showLeader = idx < 10 && item.percentage >= 0.5;

      return {
        ...item,
        startAngle,
        endAngle,
        midAngle,
        angle,
        pathD,
        isSingle: false,
        isRight,
        startX,
        startY,
        elbowX,
        elbowY,
        endY: elbowY,
        endX: elbowX,
        badgeX: 0,
        badgeY: 0,
        badgeW: 48,
        badgeH: 20,
        iconX: 0,
        iconY: 0,
        textX: 0,
        textY: 0,
        nameX: 0,
        nameY: 0,
        textAnchor: 'start' as const,
        pctText,
        showLeader
      };
    });

    // Bước 1: Gán hướng mặc định dựa trên midAngle (0° là 12h, 90° là 3h, 180° là 6h, 270° là 9h)
    rawSlices.forEach((s) => {
      s.isRight = s.midAngle >= 0 && s.midAngle < 180;
    });

    // Bước 2: Cân bằng thông minh: Nếu bên Trái quá đông mà bên Phải còn trống
    // Lát cắt nằm sát đỉnh (midAngle >= 348° hoặc startX >= cx - 8) chuyển sang bên Phải
    const rightCount = rawSlices.filter((s) => s.isRight && s.showLeader).length;
    const leftCount = rawSlices.filter((s) => !s.isRight && s.showLeader).length;

    if (leftCount > rightCount) {
      const topCand = rawSlices.find(
        (s) => !s.isRight && s.showLeader && (s.midAngle >= 348 || s.startX >= cx - 8)
      );
      if (topCand) {
        topCand.isRight = true;
      }
    }

    // Chống đè nhãn (Y-collision avoidance) cho nhãn bên phải và nhãn bên trái
    ['right', 'left'].forEach((side) => {
      const isRight = side === 'right';
      const list = rawSlices
        .filter((s) => s.isRight === isRight && s.showLeader)
        .sort((a, b) => b.percentage - a.percentage); // Ưu tiên các danh mục lớn

      // Hiển thị tối đa 6 nhãn mỗi bên (tổng cộng tối đa 12 nhãn)
      const visibleList = list.slice(0, 6);
      const hiddenList = list.slice(6);
      hiddenList.forEach((s) => {
        s.showLeader = false;
      });

      visibleList.sort((a, b) => a.elbowY - b.elbowY);

      const minGap = visibleList.length >= 6 ? 32 : visibleList.length >= 5 ? 35 : 38;
      // Pass 1: từ trên xuống dưới
      for (let i = 1; i < visibleList.length; i++) {
        if (visibleList[i].endY - visibleList[i - 1].endY < minGap) {
          visibleList[i].endY = visibleList[i - 1].endY + minGap;
        }
      }

      // Pass 2: chống tràn mép dưới (dành chỗ cho tên danh mục ở dòng 2)
      const maxY = 222;
      if (visibleList.length > 0 && visibleList[visibleList.length - 1].endY > maxY) {
        visibleList[visibleList.length - 1].endY = maxY;
        for (let i = visibleList.length - 2; i >= 0; i--) {
          if (visibleList[i + 1].endY - visibleList[i].endY < minGap) {
            visibleList[i].endY = visibleList[i + 1].endY - minGap;
          }
        }
      }

      // Pass 3: chống tràn mép trên
      const minY = 26;
      if (visibleList.length > 0 && visibleList[0].endY < minY) {
        visibleList[0].endY = minY;
        for (let i = 1; i < visibleList.length; i++) {
          if (visibleList[i].endY - visibleList[i - 1].endY < minGap) {
            visibleList[i].endY = visibleList[i - 1].endY + minGap;
          }
        }
      }

      visibleList.forEach((s) => {
        const badgeW = Math.max(46, 22 + s.pctText.length * 7);
        const badgeH = 20;

        if (isRight) {
          s.badgeX = 298;
          s.badgeW = badgeW;
          s.badgeH = badgeH;
          s.endX = s.badgeX - 5;
          s.elbowX = Math.min(s.endX - 8, Math.max(s.startX + 12, 274));
          s.badgeY = s.endY - badgeH / 2;
          s.iconX = s.badgeX + 6;
          s.iconY = s.badgeY + 4.5;
          s.textX = s.badgeX + 20;
          s.textY = s.badgeY + 10;
          s.nameX = s.badgeX + 2;
          s.nameY = s.badgeY + badgeH + 11;
        } else {
          s.badgeX = 18;
          s.badgeW = badgeW;
          s.badgeH = badgeH;
          s.endX = s.badgeX + badgeW + 5;
          s.elbowX = Math.max(s.endX + 8, Math.min(s.startX - 12, 114));
          s.badgeY = s.endY - badgeH / 2;
          s.iconX = s.badgeX + 6;
          s.iconY = s.badgeY + 4.5;
          s.textX = s.badgeX + 20;
          s.textY = s.badgeY + 10;
          s.nameX = s.badgeX + 2;
          s.nameY = s.badgeY + badgeH + 11;
        }
      });
    });

    return {
      slices: rawSlices,
      isSingleFull: false
    };
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

      {/* 3. BIỂU ĐỒ XU HƯỚNG 6 THÁNG: DÒNG TIỀN (THU/CHI) HOẶC TÀI SẢN RÒNG (NET WORTH) */}
      <div className="mx-4 my-3 rounded-3xl p-4 bg-slate-900/80 border border-white/10 shadow-lg">
        {/* Header khối biểu đồ & Pill switch chuyển đổi */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3 px-1">
          <div className="flex items-center gap-2">
            {trendChartMode === 'CASHFLOW' ? (
              <BarChart3 size={17} className="text-sky-400" />
            ) : (
              <TrendingUp size={17} className="text-emerald-400" />
            )}
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              {trendChartMode === 'CASHFLOW' ? 'Xu hướng dòng tiền 6 tháng' : 'Biến động tài sản ròng (Net Worth)'}
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            {/* Pill Switch */}
            <div className="flex p-0.5 rounded-xl bg-slate-800/90 border border-white/8 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setTrendChartMode('CASHFLOW')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition-all flex items-center gap-1 border-none ${
                  trendChartMode === 'CASHFLOW'
                    ? 'bg-sky-500 text-slate-950 font-black shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 bg-transparent'
                }`}
              >
                <BarChart3 size={12} />
                <span>Dòng tiền</span>
              </button>
              <button
                type="button"
                onClick={() => setTrendChartMode('NET_WORTH')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition-all flex items-center gap-1 border-none ${
                  trendChartMode === 'NET_WORTH'
                    ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 bg-transparent'
                }`}
              >
                <TrendingUp size={12} />
                <span>Tài sản ròng</span>
              </button>
            </div>

            {/* Chú thích màu khi ở mode Dòng tiền */}
            {trendChartMode === 'CASHFLOW' && (
              <div className="hidden xs:flex items-center gap-2 text-[10px] text-slate-400 shrink-0">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Thu
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Chi
                </span>
              </div>
            )}
          </div>
        </div>

        {/* CHẾ ĐỘ 1: BIỂU ĐỒ CỘT DÒNG TIỀN (THU VS CHI) */}
        {trendChartMode === 'CASHFLOW' && (
          <>
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
          </>
        )}

        {/* CHẾ ĐỘ 2: BIỂU ĐỒ ĐƯỜNG DIỆN TÍCH TÀI SẢN RÒNG (NET WORTH AREA/LINE CHART) */}
        {trendChartMode === 'NET_WORTH' && netWorthChartLayout && (
          <div className="flex flex-col gap-2 pt-1 animate-fade-in">
            {/* Header tóm tắt tổng thể kỳ 6 tháng */}
            <div className="flex items-center justify-between pb-1 px-1">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">
                  Tăng trưởng tài sản 6 tháng
                </span>
                <div
                  className={`text-sm font-extrabold flex items-center gap-1.5 ${
                    netWorthChartLayout.totalGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  <span>
                    {netWorthChartLayout.totalGrowth >= 0 ? '▲ +' : '▼ '}
                    {formatVND(Math.abs(netWorthChartLayout.totalGrowth))}
                  </span>
                  {netWorthChartLayout.startNW !== 0 ? (
                    <span className="text-[11px] font-normal text-slate-400">
                      ({netWorthChartLayout.totalGrowthPercent >= 0 ? '+' : ''}
                      {netWorthChartLayout.totalGrowthPercent.toFixed(1)}%)
                    </span>
                  ) : netWorthChartLayout.endNW > 0 ? (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 font-semibold">
                      Kỳ đầu ghi chép
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">
                  Khoảng giá trị
                </span>
                <span className="text-[11px] text-slate-300 font-medium">
                  {formatVND(netWorthChartLayout.minVal)} ~ {formatVND(netWorthChartLayout.maxVal)}
                </span>
              </div>
            </div>

            {/* Khung đồ thị Vector mượt mà, căn chỉnh hoàn hảo trên cả Mobile & Desktop */}
            <div className="relative w-full h-32 sm:h-36 pt-2 select-none">
              {/* 1. Lưới cột bấm chọn tương ứng 6 tháng */}
              <div className="grid grid-cols-6 absolute inset-0 z-0">
                {netWorthTrendData.map((d) => {
                  const isSelected = d.monthStr === selectedMonth;
                  return (
                    <div
                      key={d.monthStr}
                      onClick={() => setSelectedMonth(d.monthStr)}
                      className={`h-full cursor-pointer transition-colors rounded-xl ${
                        isSelected ? 'bg-white/4' : 'hover:bg-white/2'
                      }`}
                      title={`${d.label}: ${formatVND(d.netWorth)}`}
                    />
                  );
                })}
              </div>

              {/* 2. Đồ thị SVG đường cong mượt mà & diện tích bóng đổ */}
              <svg
                viewBox="0 0 600 120"
                className="w-full h-full overflow-visible relative z-10 pointer-events-none"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Đường lưới tham chiếu ngang */}
                <line x1="0" y1="25" x2="600" y2="25" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                <line x1="0" y1="65" x2="600" y2="65" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                <line x1="0" y1="105" x2="600" y2="105" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />

                {/* Vùng bóng đổ mờ Area */}
                <path d={netWorthChartLayout.areaPath} fill="url(#netWorthGrad)" />

                {/* Đường biểu diễn chính Stroke Line với độ dày đồng nhất */}
                <path
                  d={netWorthChartLayout.linePath}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {/* 3. Điểm dữ liệu dạng HTML Overlay (luôn tròn 100%, không bị méo hạt gạo hay văng ra) */}
              <div className="absolute inset-0 pointer-events-none z-20">
                {netWorthChartLayout.points.map((pt, idx) => {
                  const isSelected = pt.monthStr === selectedMonth;
                  const leftPercent = ((idx + 0.5) / 6) * 100;
                  const topPercent = (pt.y / 120) * 100;

                  return (
                    <div
                      key={pt.monthStr}
                      style={{
                        left: `${leftPercent}%`,
                        top: `${topPercent}%`
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer"
                      onClick={() => setSelectedMonth(pt.monthStr)}
                      title={`${pt.label}: ${formatVND(pt.netWorth)}`}
                    >
                      {/* Vùng chạm rộng 32x32px */}
                      <div className="w-8 h-8 flex items-center justify-center">
                        {isSelected ? (
                          <div className="relative flex items-center justify-center">
                            {/* Vòng lan tỏa (ping ring) - chuẩn tâm 100%, không bị văng */}
                            <span className="absolute w-5 h-5 rounded-full bg-emerald-400 opacity-60 animate-ping" />
                            {/* Điểm chính */}
                            <span className="relative w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white shadow-lg shadow-emerald-500/50" />
                          </div>
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 border border-slate-900 hover:scale-150 hover:bg-emerald-400 transition-all duration-150" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Các nhãn tháng tương ứng bên dưới */}
            <div className="grid grid-cols-6 gap-1 border-b border-white/6 pb-2 text-center">
              {netWorthTrendData.map((d) => {
                const isSelected = d.monthStr === selectedMonth;
                return (
                  <button
                    key={d.monthStr}
                    type="button"
                    onClick={() => setSelectedMonth(d.monthStr)}
                    className={`py-1 rounded-xl text-[11px] font-bold cursor-pointer transition-colors border-none ${
                      isSelected
                        ? 'bg-emerald-500/25 text-emerald-300 font-extrabold shadow-sm'
                        : 'text-slate-400 hover:text-white bg-transparent'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>

            {/* Thẻ kiểm tra chi tiết tháng đang chọn */}
            <div className="mt-1 p-2.5 rounded-2xl bg-slate-800/70 border border-white/8 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-slate-400 font-medium truncate">
                  Tài sản cuối {formatMonthDisplay(selectedMonth)}:
                </span>
                <span className="font-extrabold text-slate-100 font-heading shrink-0">
                  {formatVND(selectedNetWorthItem?.netWorth || 0)}
                </span>
              </div>

              {selectedNetWorthMoM && (
                <div
                  className={`text-[11px] font-bold shrink-0 ml-2 flex items-center gap-0.5 ${
                    selectedNetWorthMoM.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                  title={`So với tháng liền trước: ${formatVND(selectedNetWorthMoM.diff)}`}
                >
                  <span>{selectedNetWorthMoM.diff >= 0 ? '▲ +' : '▼ '}</span>
                  <span>{formatVND(Math.abs(selectedNetWorthMoM.diff))}</span>
                  {!selectedNetWorthMoM.isPrevZero && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({selectedNetWorthMoM.percent >= 0 ? '+' : ''}{selectedNetWorthMoM.percent.toFixed(1)}%)
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="text-[10px] text-slate-500 text-center">
              Chạm vào mốc tháng để xem tài sản ròng và phân tích dòng tiền của tháng đó
            </div>
          </div>
        )}
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

      {/* 5. INTERACTIVE PIE CHART WITH CALLOUT LEADER LINES (HÌNH 3) */}
      {sortedCategories.length > 0 ? (
        <div className="mx-4 my-2.5 rounded-3xl p-4 sm:p-5 bg-slate-900/80 border border-white/10 shadow-lg text-center">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
            {reportType === 'EXPENSE'
              ? groupingMode === 'PARENT'
                ? 'Tỷ trọng theo Nhóm Cha (Must have / Nice to have / Wasted)'
                : 'Tỷ trọng các hạng mục chi tiêu chi tiết'
              : 'Tỷ trọng các nguồn thu nhập'}
          </div>

          <div className="text-[11px] text-slate-400 mb-2">
            Tổng {reportType === 'EXPENSE' ? 'chi' : 'thu'}:{' '}
            <span
              className={`font-extrabold ${
                reportType === 'EXPENSE' ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {new Intl.NumberFormat('vi-VN').format(activeTotal)} ₫
            </span>
          </div>

          <div className="relative w-full max-w-sm sm:max-w-md mx-auto aspect-[39/25]">
            <svg viewBox="0 0 390 250" className="w-full h-full overflow-visible">
              {/* Biểu đồ Donut (Vành khuyên rỗng ở giữa) */}
              {pieChartData.isSingleFull ? (
                <circle
                  cx="195"
                  cy="125"
                  r="53"
                  fill="none"
                  stroke={pieChartData.slices[0]?.category?.color || '#38bdf8'}
                  strokeWidth="26"
                  className="cursor-pointer transition-all hover:opacity-90 hover:brightness-105"
                  onClick={() => setDrillDownCategory(pieChartData.slices[0]?.category || null)}
                />
              ) : (
                /* Các lát cắt Donut với khoảng cách tách lát sắc nét (stroke) */
                pieChartData.slices.map((slice) => (
                  <path
                    key={slice.catId}
                    d={slice.pathD}
                    fill={slice.category?.color || '#64748b'}
                    stroke="#090d16"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    className="cursor-pointer transition-all hover:opacity-90 hover:brightness-110"
                    onClick={() => setDrillDownCategory(slice.category || null)}
                  />
                ))
              )}

              {/* Đường gióng nét đứt & Nhãn Pill Badge kèm Icon, %, Tên danh mục */}
              {pieChartData.slices.map((slice) => {
                if (!slice.showLeader) return null;
                const color = slice.category?.color || '#38bdf8';
                const catName = slice.category?.name || 'Khác';
                const truncatedName = catName.length > 17 ? `${catName.slice(0, 16)}…` : catName;
                const IconComp = (slice.category?.icon && ICON_MAP[slice.category.icon]) || CircleDot;

                return (
                  <g
                    key={`callout-${slice.catId}`}
                    className="cursor-pointer transition-all hover:opacity-85"
                    onClick={() => setDrillDownCategory(slice.category || null)}
                  >
                    {/* 1. Điểm neo nhỏ trên viền donut */}
                    <circle cx={slice.startX} cy={slice.startY} r="1.8" fill={color} />

                    {/* 2. Đường gióng nét đứt gập góc ngang (Dashed leader line) */}
                    <polyline
                      points={`${slice.startX.toFixed(1)},${slice.startY.toFixed(1)} ${slice.elbowX.toFixed(1)},${slice.endY.toFixed(1)} ${slice.endX.toFixed(1)},${slice.endY.toFixed(1)}`}
                      fill="none"
                      stroke={color}
                      strokeWidth="1.2"
                      strokeDasharray="3.5 2.5"
                      strokeOpacity="0.65"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* 3. Khung Pill Badge bo góc tròn */}
                    <rect
                      x={slice.badgeX}
                      y={slice.badgeY}
                      width={slice.badgeW}
                      height={slice.badgeH}
                      rx="10"
                      ry="10"
                      fill={color}
                      fillOpacity="0.18"
                      stroke={color}
                      strokeWidth="0.8"
                      strokeOpacity="0.4"
                    />

                    {/* 4. Icon danh mục bên trong Pill Badge */}
                    <g transform={`translate(${slice.iconX}, ${slice.iconY})`}>
                      <IconComp size={11} color={color} strokeWidth={2.4} />
                    </g>

                    {/* 5. Tỷ lệ phần trăm bên trong Pill Badge */}
                    <text
                      x={slice.textX}
                      y={slice.textY}
                      fill={color}
                      fontSize="10"
                      fontWeight="800"
                      textAnchor="start"
                      className="select-none font-mono"
                      dominantBaseline="central"
                    >
                      {slice.pctText}
                    </text>

                    {/* 6. Tên danh mục bên dưới Pill Badge (Dòng 2) */}
                    <text
                      x={slice.nameX}
                      y={slice.nameY}
                      fill="#cbd5e1"
                      fontSize="9.5"
                      fontWeight="600"
                      textAnchor="start"
                      className="select-none tracking-tight"
                    >
                      {truncatedName}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="text-[11px] text-slate-500 mt-2">
            Chạm vào lát cắt hoặc nhãn để xem toàn bộ giao dịch chi tiết
          </div>
        </div>
      ) : (
        <div className="mx-4 my-4 p-8 rounded-3xl bg-slate-900/40 border border-white/5 text-center text-slate-500 text-xs">
          Chưa có dữ liệu {reportType === 'EXPENSE' ? 'chi tiêu' : 'thu nhập'} trong tháng này để vẽ biểu đồ
        </div>
      )}

      {/* 6. DANH SÁCH DANH MỤC PHÂN TÍCH KÈM SO SÁNH MOM & DRILL-DOWN */}
      {sortedCategories.length > 0 && (
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
      )}
    </>
  )}
</div>
  );
};
