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
    <div style={{ paddingBottom: 90 }}>
      {/* 1. Header Card: Tổng số dư & Dòng tiền tháng */}
      <div
        className="glass-panel"
        style={{
          margin: '12px 16px',
          borderRadius: 24,
          padding: '20px 18px',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Tổng tài sản khả dụng
            </span>
            <div
              className="font-heading"
              style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', marginTop: 2 }}
            >
              {formatVND(totalBalance)}
            </div>
          </div>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10B981'
            }}
          >
            <WalletIcon size={24} />
          </div>
        </div>

        {/* Khung Thu / Chi tháng */}
        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between'
          }}
        >
          {/* Thu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10B981'
              }}
            >
              <ArrowDownLeft size={18} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Thu tháng này</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#10B981' }}>
                +{formatVND(monthIncome)}
              </div>
            </div>
          </div>

          {/* Chi */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: 'rgba(244, 63, 94, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F43F5E'
              }}
            >
              <ArrowUpRight size={18} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Chi tháng này</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F43F5E' }}>
                -{formatVND(monthExpense)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Bộ Chuyển Tháng */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 20px 12px'
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={16} color="#38bdf8" />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
            {formatMonthDisplay(selectedMonth)}
          </span>
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

      {/* 3. Danh Sách Giao Dịch Gom Nhóm Theo Ngày */}
      {sortedDates.length === 0 ? (
        <div
          style={{
            padding: '50px 20px',
            textAlign: 'center',
            color: '#64748b'
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>📝</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8' }}>
            Chưa có giao dịch nào trong {formatMonthDisplay(selectedMonth)}
          </div>
          <p style={{ fontSize: 13, marginTop: 4, marginBottom: 14 }}>
            Bấm nút bên dưới để ghi nhanh khoản chi đầu tiên!
          </p>
          <button
            type="button"
            onClick={onOpenQuickAdd}
            className="touch-btn"
            style={{
              backgroundColor: '#10B981',
              color: '#ffffff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 14,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            + Ghi khoản chi mới
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 16px' }}>
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
                className="glass-panel"
                style={{
                  borderRadius: 20,
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.06)'
                }}
              >
                {/* Header Ngày */}
                <div
                  style={{
                    padding: '10px 16px',
                    backgroundColor: 'rgba(30, 41, 59, 0.5)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)'
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                    {formatFriendlyDate(dateStr)}
                  </span>
                  <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', gap: 10 }}>
                    {dayIncome > 0 && (
                      <span style={{ color: '#10B981' }}>+{formatVND(dayIncome)}</span>
                    )}
                    {dayExpense > 0 && (
                      <span style={{ color: '#F43F5E' }}>-{formatVND(dayExpense)}</span>
                    )}
                  </div>
                </div>

                {/* Danh sách các giao dịch trong ngày */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {dayTxs.map((tx, idx) => {
                    const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
                    const wallet = walletMap.get(tx.walletId);
                    const toWallet = tx.toWalletId ? walletMap.get(tx.toWalletId) : undefined;

                    return (
                      <div
                        key={tx.id}
                        onClick={() => setSelectedTxForAction(tx)}
                        className="touch-btn"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          cursor: 'pointer',
                          borderBottom:
                            idx < dayTxs.length - 1
                              ? '1px solid rgba(255, 255, 255, 0.04)'
                              : 'none'
                        }}
                      >
                        {/* Cột Trái: Icon & Tên Danh mục / Ghi chú */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>
                              {tx.type === 'TRANSFER'
                                ? `Chuyển ví`
                                : cat?.name || 'Chưa phân loại'}
                            </div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                              {tx.note ? (
                                <span style={{ color: '#cbd5e1' }}>{tx.note} • </span>
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
                        <div style={{ textAlign: 'right' }}>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 700,
                              color:
                                tx.type === 'EXPENSE'
                                  ? '#F43F5E'
                                  : tx.type === 'INCOME'
                                  ? '#10B981'
                                  : '#38BDF8'
                            }}
                          >
                            {tx.type === 'EXPENSE'
                              ? `-${formatVND(tx.amount)}`
                              : tx.type === 'INCOME'
                              ? `+${formatVND(tx.amount)}`
                              : formatVND(tx.amount)}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
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
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(6px)',
            zIndex: 120,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            maxWidth: 480,
            margin: '0 auto'
          }}
          onClick={() => setSelectedTxForAction(null)}
        >
          <div
            className="glass-panel animate-slide-up"
            style={{
              backgroundColor: '#0f172a',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: '20px 20px max(24px, env(safe-area-inset-bottom, 0px))',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                Tùy chọn giao dịch
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
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
              className="touch-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '14px',
                borderRadius: 14,
                backgroundColor: '#1e293b',
                color: '#38BDF8',
                border: 'none',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Edit3 size={18} />
              <span>Chỉnh sửa giao dịch</span>
            </button>

            {/* Nút Xóa (Kèm Hoàn tác số dư) */}
            <button
              type="button"
              onClick={() => handleDelete(selectedTxForAction.id)}
              className="touch-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '14px',
                borderRadius: 14,
                backgroundColor: 'rgba(244, 63, 94, 0.12)',
                color: '#F43F5E',
                border: '1px solid rgba(244, 63, 94, 0.2)',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Trash2 size={18} />
              <span>Xóa giao dịch (Hoàn tác số dư)</span>
            </button>

            {/* Nút Hủy */}
            <button
              type="button"
              onClick={() => setSelectedTxForAction(null)}
              className="touch-btn"
              style={{
                padding: '12px',
                borderRadius: 14,
                backgroundColor: 'transparent',
                color: '#94a3b8',
                border: 'none',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
