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
    <div className="pb-24">
      {/* 1. Header Chọn Tháng */}
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
            Hạn mức chi tiêu
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

      {/* 2. NÚT SAO CHÉP HẠN MỨC TỪ THÁNG TRƯỚC (Nổi bật) */}
      {prevMonthBudgets.length > 0 && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={handleCopyFromPrevMonth}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-sky-500/10 border border-dashed border-sky-400/40 text-sky-400 text-xs font-semibold cursor-pointer touch-btn hover:bg-sky-500/15 transition-colors"
          >
            <Copy size={16} />
            <span>Sao chép {prevMonthBudgets.length} hạn mức từ {formatMonthDisplay(prevMonth)}</span>
          </button>
        </div>
      )}

      {/* 3. Danh sách Hạn mức */}
      <div className="px-4 flex flex-col gap-3.5">
        {currentBudgets.length === 0 ? (
          <div className="text-center py-12 px-5 text-slate-400">
            <div className="text-5xl mb-3">🎯</div>
            <div className="text-base font-bold text-slate-100">
              Chưa có hạn mức nào cho {formatMonthDisplay(selectedMonth)}
            </div>
            <p className="text-xs text-slate-400 mt-1 mb-4.5">
              Đặt hạn mức chi tiêu để kiểm soát ngân sách và tránh tiêu hoang!
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategoryId(expenseCategories[0]?.id || '');
                setIsModalOpen(true);
              }}
              className="touch-btn bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 px-5 rounded-xl font-semibold text-sm cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              + Thiết lập hạn mức mới
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 tracking-wider">
                ĐANG THEO DÕI ({currentBudgets.length} MỤC)
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryId(expenseCategories[0]?.id || '');
                  setIsModalOpen(true);
                }}
                className="touch-btn text-sky-400 text-xs font-semibold flex items-center gap-1 cursor-pointer hover:underline"
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

              const statusColorClass = isOver
                ? 'bg-rose-500'
                : isWarning
                ? 'bg-amber-500'
                : 'bg-emerald-500';

              const statusBadgeClass = isOver
                ? 'bg-rose-500/20 text-rose-400'
                : isWarning
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-emerald-500/20 text-emerald-400';

              return (
                <div
                  key={b.id}
                  className={`glass-panel rounded-2xl p-4 border transition-colors ${
                    isOver ? 'border-rose-500/30' : 'border-white/5'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div
                        className="cat-badge"
                        style={{ backgroundColor: cat?.color || '#3b82f6' }}
                      >
                        <CategoryIcon name={cat?.icon || 'Target'} size={20} color="#ffffff" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-100">
                          {cat?.name || 'Tổng chi tiêu tháng'}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Đã chi: <b className="text-slate-200">{formatVND(spent)}</b> / {formatVND(b.amount)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusBadgeClass}`}>
                        {percent}%
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteBudget(b.id)}
                        className="touch-btn text-slate-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Thanh Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-slate-800 mt-3.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${statusColorClass}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* Footer thông số */}
                  <div className="mt-2.5 flex justify-between items-center text-xs">
                    {isOver ? (
                      <span className="text-rose-400 font-semibold flex items-center gap-1">
                        <AlertTriangle size={14} /> Vượt hạn mức {formatVND(Math.abs(remaining))}!
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        Còn lại: <b className="text-slate-100">{formatVND(remaining)}</b>
                      </span>
                    )}

                    {!isOver && isCurrentActiveMonth && (
                      <span className="text-slate-500">
                        Chi tiêu an toàn: <b className="text-sky-400">{formatVND(dailySafe)}/ngày</b>
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
          className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex flex-col justify-end max-w-[480px] mx-auto"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="glass-panel animate-slide-up bg-slate-900 rounded-t-[28px] border-t border-x border-white/10 p-5 pb-[max(24px,env(safe-area-inset-bottom,0px))] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <div className="text-base font-bold text-slate-100">
                Thiết lập hạn mức {formatMonthDisplay(selectedMonth)}
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center touch-btn cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                Chọn danh mục áp dụng
              </label>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="input-ios"
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
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">
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
                className="input-ios text-emerald-400 font-bold text-xl py-3.5"
              />
            </div>

            {errorMsg && <div className="text-rose-500 text-xs font-medium">{errorMsg}</div>}

            <button
              type="button"
              onClick={handleSaveBudget}
              className="touch-btn bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-xl text-base font-bold cursor-pointer mt-1.5 shadow-lg shadow-emerald-500/25"
            >
              Lưu hạn mức
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
