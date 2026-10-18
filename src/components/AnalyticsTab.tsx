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
    <div style={{ paddingBottom: 90 }}>
      {/* 1. Header chọn tháng */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px 10px'
        }}
      >
        <button
          type="button"
          onClick={handlePrevMonth}
          className="touch-btn"
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: '#1e293b',
            border: 'none',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <ChevronLeft size={20} />
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>
            Báo cáo chi tiêu
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
            {formatMonthDisplay(selectedMonth)}
          </div>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          className="touch-btn"
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: '#1e293b',
            border: 'none',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 2. Tổng quan MoM (Month-over-Month) Badge */}
      <div
        className="glass-panel"
        style={{
          margin: '8px 16px',
          borderRadius: 24,
          padding: '20px 18px',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Tổng chi tiêu tháng</span>
            <div
              className="font-heading"
              style={{ fontSize: 28, fontWeight: 800, color: '#F43F5E', marginTop: 2 }}
            >
              {formatVND(thisExpense)}
            </div>
          </div>

          {/* Badge so sánh MoM với tháng trước */}
          {prevExpense > 0 && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                backgroundColor:
                  expenseDiff > 0 ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: expenseDiff > 0 ? '#F43F5E' : '#10B981',
                border: `1px solid ${expenseDiff > 0 ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)'}`
              }}
            >
              {expenseDiff > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>
                {expenseDiff > 0 ? `+${expenseMoMPercent.toFixed(1)}%` : `${expenseMoMPercent.toFixed(1)}%`}
              </span>
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
          {prevExpense > 0 ? (
            expenseDiff > 0 ? (
              <span>
                Tăng <b>{formatVND(expenseDiff)}</b> so với tháng trước ({formatVND(prevExpense)})
              </span>
            ) : (
              <span>
                Tiết kiệm được <b>{formatVND(Math.abs(expenseDiff))}</b> so với tháng trước ({formatVND(prevExpense)})
              </span>
            )
          ) : (
            <span>Tháng trước chưa có dữ liệu chi tiêu</span>
          )}
        </div>
      </div>

      {/* 3. Interactive SVG Donut Chart */}
      {sortedCategories.length > 0 ? (
        <div
          className="glass-panel"
          style={{
            margin: '12px 16px',
            borderRadius: 24,
            padding: '20px',
            textAlign: 'center',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginBottom: 12 }}>
            Cơ cấu chi tiêu (Chạm vào để xem chi tiết)
          </div>

          {/* Biểu đồ Donut SVG */}
          <div style={{ position: 'relative', width: 200, height: 200, margin: '0 auto' }}>
            <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ transform: 'rotate(-90deg)' }}>
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
                    style={{
                      cursor: 'pointer',
                      transition: 'stroke-width 0.2s ease, opacity 0.2s ease'
                    }}
                    onClick={() => setDrillDownCategory(item.category || null)}
                  />
                );
              })}
            </svg>

            {/* Tâm biểu đồ Donut */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none'
              }}
            >
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Khoản chi lớn nhất</span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: sortedCategories[0]?.category?.color || '#38BDF8',
                  maxWidth: 120,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {sortedCategories[0]?.category?.name}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>
                {sortedCategories[0]?.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
          Chưa có khoản chi nào để vẽ biểu đồ
        </div>
      )}

      {/* 4. Danh sách Hạng Mục Phân Tích Kèm So Sánh MoM (Bấm vào để Drill-down) */}
      <div style={{ padding: '0 16px' }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#f8fafc',
            marginBottom: 10,
            paddingLeft: 4
          }}
        >
          Chi tiết từng danh mục (Chạm để xem lịch sử)
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sortedCategories.map((item) => (
            <div
              key={item.catId}
              onClick={() => setDrillDownCategory(item.category || null)}
              className="glass-panel touch-btn"
              style={{
                borderRadius: 18,
                padding: '14px 16px',
                cursor: 'pointer',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* Trái: Icon + Tên */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                      {item.category?.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      {item.percentage.toFixed(1)}% tổng chi
                    </div>
                  </div>
                </div>

                {/* Phải: Số tiền + Badge MoM */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                    {formatVND(item.amount)}
                  </div>
                  {/* MoM % Badge cho từng danh mục */}
                  <div style={{ marginTop: 2 }}>
                    {item.prevAmount > 0 ? (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: item.diff > 0 ? '#F43F5E' : '#10B981'
                        }}
                      >
                        {item.diff > 0 ? `▲ +${item.momPercent.toFixed(0)}%` : `▼ ${item.momPercent.toFixed(0)}%`}{' '}
                        <span style={{ color: '#64748b' }}>vs tháng trước</span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#64748b' }}>Mới phát sinh</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Thanh Progress Bar tỷ lệ % */}
              <div
                style={{
                  width: '100%',
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: '#1e293b',
                  marginTop: 12,
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    width: `${item.percentage}%`,
                    height: '100%',
                    backgroundColor: item.category?.color || '#3b82f6',
                    borderRadius: 999
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
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(10px)',
            zIndex: 130,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            maxWidth: 480,
            margin: '0 auto'
          }}
          onClick={() => setDrillDownCategory(null)}
        >
          <div
            className="glass-panel animate-slide-up"
            style={{
              backgroundColor: '#0f172a',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              paddingBottom: 'max(20px, env(safe-area-inset-bottom, 0px))'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Drill-down */}
            <div
              style={{
                padding: '18px 20px 14px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  className="cat-badge"
                  style={{ backgroundColor: drillDownCategory.color }}
                >
                  <CategoryIcon name={drillDownCategory.icon} size={22} color="#ffffff" />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
                    {drillDownCategory.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    {formatMonthDisplay(selectedMonth)} • {drillDownTxs.length} giao dịch
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrillDownCategory(null)}
                className="touch-btn"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#1e293b',
                  border: 'none',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Danh sách giao dịch chi tiết */}
            <div
              style={{
                padding: '12px 16px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}
            >
              {drillDownTxs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b' }}>
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
                    className="touch-btn"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      backgroundColor: '#1e293b',
                      borderRadius: 14,
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>
                        {tx.note || drillDownCategory.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {formatFriendlyDate(tx.date)} • {tx.time}
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#F43F5E' }}>
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
