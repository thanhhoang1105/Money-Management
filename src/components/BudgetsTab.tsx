// src/components/BudgetsTab.tsx
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Category } from '../types';
import { CategoryIcon } from './CategoryIcon';
import {
  formatVND,
  formatMonthDisplay,
  getCurrentMonth,
  getPreviousMonth
} from '../utils/formatters';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Copy,
  AlertTriangle,
  Trash2,
  X
} from 'lucide-react';

export const BudgetsTab: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const prevMonth = getPreviousMonth(selectedMonth);

  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');
  const categoryMap = new Map<string, Category>(categories.map((c) => [c.id, c]));

  // Hạn mức của tháng đang chọn
  const currentBudgets = useLiveQuery(
    () => db.budgets.filter((b) => b.month === selectedMonth).toArray(),
    [selectedMonth]
  ) || [];

  // Hạn mức của tháng trước (để kiểm tra xem có thể sao chép không)
  const prevMonthBudgets = useLiveQuery(
    () => db.budgets.filter((b) => b.month === prevMonth).toArray(),
    [prevMonth]
  ) || [];

  // Toàn bộ giao dịch chi tiêu trong tháng đang chọn
  const monthTransactions = useLiveQuery(
    () =>
      db.transactions
        .filter((tx) => tx.date.startsWith(selectedMonth) && tx.type === 'EXPENSE')
        .toArray(),
    [selectedMonth]
  ) || [];

  // Tính tổng chi tiêu thực tế theo từng danh mục trong tháng
  const spentByCatMap: Record<string, number> = {};
  let totalSpent = 0;
  monthTransactions.forEach((tx) => {
    totalSpent += tx.amount;
    if (tx.categoryId) {
      spentByCatMap[tx.categoryId] = (spentByCatMap[tx.categoryId] || 0) + tx.amount;
    }
  });

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

  // Tính số ngày còn lại trong tháng
  const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
  const totalDaysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const today = new Date();
  const isCurrentActiveMonth =
    today.getFullYear() === yearNum && today.getMonth() + 1 === monthNum;
  const currentDay = isCurrentActiveMonth ? today.getDate() : 1;
  const remainingDays = Math.max(1, totalDaysInMonth - currentDay + 1);

  // Tính năng: SAO CHÉP HẠN MỨC TỪ THÁNG TRƯỚC
  const handleCopyFromPrevMonth = async () => {
    if (prevMonthBudgets.length === 0) {
      alert(`Tháng ${formatMonthDisplay(prevMonth)} chưa có hạn mức nào để sao chép.`);
      return;
    }

    if (
      window.confirm(
        `Bạn có muốn sao chép ${prevMonthBudgets.length} hạn mức từ ${formatMonthDisplay(
          prevMonth
        )} sang ${formatMonthDisplay(selectedMonth)}?`
      )
    ) {
      const now = new Date().toISOString();
      await db.transaction('rw', db.budgets, async () => {
        for (const pb of prevMonthBudgets) {
          // Kiểm tra xem đã có hạn mức danh mục này trong tháng chưa
          const exists = await db.budgets
            .filter((b) => b.month === selectedMonth && b.categoryId === pb.categoryId)
            .first();

          if (!exists) {
            await db.budgets.add({
              id: crypto.randomUUID(),
              categoryId: pb.categoryId,
              amount: pb.amount,
              month: selectedMonth,
              createdAt: now
            });
          }
        }
      });
    }
  };

  // Thêm hoặc Cập nhật Hạn Mức
  const handleSaveBudget = async () => {
    const amount = Number(amountStr.replace(/[^0-9]/g, ''));
    if (!amount || amount <= 0) {
      setErrorMsg('Vui lòng nhập số tiền hạn mức hợp lệ');
      return;
    }

    const now = new Date().toISOString();

    // Kiểm tra xem danh mục này đã có hạn mức chưa
    const existing = await db.budgets
      .filter((b) => b.month === selectedMonth && b.categoryId === (selectedCategoryId || undefined))
      .first();

    if (existing) {
      await db.budgets.update(existing.id, { amount });
    } else {
      await db.budgets.add({
        id: crypto.randomUUID(),
        categoryId: selectedCategoryId || undefined,
        amount,
        month: selectedMonth,
        createdAt: now
      });
    }

    setIsModalOpen(false);
    setAmountStr('');
    setErrorMsg('');
  };

  // Xóa hạn mức
  const handleDeleteBudget = async (id: string) => {
    if (window.confirm('Bạn có chắc muốn xóa hạn mức này?')) {
      await db.budgets.delete(id);
    }
  };

  return (
    <div style={{ paddingBottom: 90 }}>
      {/* 1. Header Chọn Tháng */}
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
            Hạn mức chi tiêu
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

      {/* 2. NÚT SAO CHÉP HẠN MỨC TỪ THÁNG TRƯỚC (Nổi bật) */}
      {prevMonthBudgets.length > 0 && (
        <div style={{ padding: '0 16px 12px' }}>
          <button
            type="button"
            onClick={handleCopyFromPrevMonth}
            className="touch-btn"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 16px',
              borderRadius: 16,
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px dashed rgba(56, 189, 248, 0.4)',
              color: '#38BDF8',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Copy size={16} />
            <span>Sao chép {prevMonthBudgets.length} hạn mức từ {formatMonthDisplay(prevMonth)}</span>
          </button>
        </div>
      )}

      {/* 3. Danh sách Hạn mức */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {currentBudgets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🎯</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
              Chưa có hạn mức nào cho {formatMonthDisplay(selectedMonth)}
            </div>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, marginBottom: 18 }}>
              Đặt hạn mức chi tiêu để kiểm soát ngân sách và tránh tiêu hoang!
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategoryId(expenseCategories[0]?.id || '');
                setIsModalOpen(true);
              }}
              className="touch-btn"
              style={{
                backgroundColor: '#10B981',
                color: '#ffffff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 14,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              + Thiết lập hạn mức mới
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
                Đang theo dõi ({currentBudgets.length} mục)
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryId(expenseCategories[0]?.id || '');
                  setIsModalOpen(true);
                }}
                className="touch-btn"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38BDF8',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} /> Thêm hạn mức
              </button>
            </div>

            {currentBudgets.map((b) => {
              const cat = b.categoryId ? categoryMap.get(b.categoryId) : undefined;
              const spent = b.categoryId ? spentByCatMap[b.categoryId] || 0 : totalSpent;
              const remaining = b.amount - spent;
              const percent = Math.min(100, Math.round((spent / b.amount) * 100));
              const isOver = spent >= b.amount;
              const isWarning = percent >= 70 && !isOver;

              const dailySafe = Math.max(0, Math.round(remaining / remainingDays));

              // Màu sắc theo trạng thái
              const statusColor = isOver ? '#F43F5E' : isWarning ? '#F59E0B' : '#10B981';

              return (
                <div
                  key={b.id}
                  className="glass-panel"
                  style={{
                    borderRadius: 20,
                    padding: '16px 18px',
                    border: `1px solid ${isOver ? 'rgba(244,63,94,0.3)' : 'rgba(255,255,255,0.06)'}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        className="cat-badge"
                        style={{ backgroundColor: cat?.color || '#3b82f6' }}
                      >
                        <CategoryIcon name={cat?.icon || 'Target'} size={20} color="#ffffff" />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                          {cat?.name || 'Tổng chi tiêu tháng'}
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                          Đã chi: <b>{formatVND(spent)}</b> / {formatVND(b.amount)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          backgroundColor: `${statusColor}22`,
                          color: statusColor
                        }}
                      >
                        {percent}%
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteBudget(b.id)}
                        className="touch-btn"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: 4
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Thanh Progress Bar */}
                  <div
                    style={{
                      width: '100%',
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: '#1e293b',
                      marginTop: 14,
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        width: `${percent}%`,
                        height: '100%',
                        backgroundColor: statusColor,
                        borderRadius: 999,
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>

                  {/* Footer thông số */}
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 12
                    }}
                  >
                    {isOver ? (
                      <span style={{ color: '#F43F5E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertTriangle size={14} /> Vượt hạn mức {formatVND(Math.abs(remaining))}!
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>
                        Còn lại: <b style={{ color: '#f8fafc' }}>{formatVND(remaining)}</b>
                      </span>
                    )}

                    {!isOver && isCurrentActiveMonth && (
                      <span style={{ color: '#64748b' }}>
                        Chi tiêu an toàn: <b style={{ color: '#38bdf8' }}>{formatVND(dailySafe)}/ngày</b>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* 4. MODAL THÊM HẠN MỨC */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            zIndex: 130,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            maxWidth: 480,
            margin: '0 auto'
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="glass-panel animate-slide-up"
            style={{
              backgroundColor: '#0f172a',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: '20px 20px max(24px, env(safe-area-inset-bottom, 0px))',
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#f8fafc' }}>
                Thiết lập hạn mức {formatMonthDisplay(selectedMonth)}
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
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

            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                Chọn danh mục áp dụng
              </label>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 14,
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 14,
                  outline: 'none'
                }}
              >
                <option value="">🎯 Hạn mức chung cho toàn bộ chi tiêu</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                Số tiền hạn mức (VNĐ)
              </label>
              <input
                type="text"
                placeholder="Ví dụ: 3.500.000"
                value={amountStr}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setAmountStr(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                }}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 14,
                  backgroundColor: '#1e293b',
                  color: '#10B981',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 20,
                  fontWeight: 700,
                  outline: 'none'
                }}
              />
            </div>

            {errorMsg && <div style={{ color: '#F43F5E', fontSize: 12 }}>{errorMsg}</div>}

            <button
              type="button"
              onClick={handleSaveBudget}
              className="touch-btn"
              style={{
                backgroundColor: '#10B981',
                color: '#ffffff',
                border: 'none',
                padding: '14px',
                borderRadius: 14,
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: 6
              }}
            >
              Lưu hạn mức
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
