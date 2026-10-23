// src/components/BudgetsTab.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Category, Budget } from '../types';
import { CategoryIcon } from './CategoryIcon';
import {
  formatVND,
  formatMonthDisplay,
  getCurrentMonth,
  getPreviousMonth
} from '../utils/formatters';
import { generateUUID } from '../utils/uuid';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Copy,
  AlertTriangle,
  Trash2,
  Edit3,
  X,
  Calendar,
  ShieldCheck,
  Check
} from 'lucide-react';

interface BudgetsTabProps {
  onBack?: () => void;
}

export const BudgetsTab: React.FC<BudgetsTabProps> = ({ onBack }) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const prevMonth = useMemo(() => getPreviousMonth(selectedMonth), [selectedMonth]);

  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const expenseCategories = useMemo(() => {
    return categories.filter((c) => c.type === 'EXPENSE');
  }, [categories]);

  const parentExpenseCategories = useMemo(() => {
    return expenseCategories.filter((c) => !c.parentId);
  }, [expenseCategories]);

  const childExpenseCategories = useMemo(() => {
    return expenseCategories.filter((c) => !!c.parentId);
  }, [expenseCategories]);

  const categoryMap = useMemo(() => {
    return new Map<string, Category>(categories.map((c) => [c.id, c]));
  }, [categories]);

  const currentBudgets =
    useLiveQuery(
      () => db.budgets.filter((b) => b.month === selectedMonth).toArray(),
      [selectedMonth]
    ) || [];

  const prevMonthBudgets =
    useLiveQuery(
      () => db.budgets.filter((b) => b.month === prevMonth).toArray(),
      [prevMonth]
    ) || [];

  const monthTransactions =
    useLiveQuery(
      () =>
        db.transactions
          .filter((tx) => tx.date.startsWith(selectedMonth) && tx.type === 'EXPENSE')
          .toArray(),
      [selectedMonth]
    ) || [];

  // Tính tổng chi tiêu thực tế theo từng danh mục con, danh mục cha và toàn tháng
  const { spentByCatMap, totalMonthSpent } = useMemo(() => {
    const catMap: Record<string, number> = {};
    let total = 0;
    monthTransactions.forEach((tx) => {
      if (tx.excludeFromReport) return;
      total += tx.amount;
      if (tx.categoryId) {
        catMap[tx.categoryId] = (catMap[tx.categoryId] || 0) + tx.amount;
        // Cộng dồn lên cả Hạng mục Cha (nếu có) để hỗ trợ hạn mức theo Nhóm Cha (Must have / Nice to have / Wasted)
        const cat = categoryMap.get(tx.categoryId);
        if (cat?.parentId) {
          catMap[cat.parentId] = (catMap[cat.parentId] || 0) + tx.amount;
        }
      }
    });
    return { spentByCatMap: catMap, totalMonthSpent: total };
  }, [monthTransactions, categoryMap]);

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

  const { remainingDays, isCurrentActiveMonth } = useMemo(() => {
    const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
    const totalDaysInMonth = new Date(yearNum, monthNum, 0).getDate();
    const today = new Date();
    const isActiveMonth = today.getFullYear() === yearNum && today.getMonth() + 1 === monthNum;
    const currentDay = isActiveMonth ? today.getDate() : 1;
    const daysLeft = Math.max(1, totalDaysInMonth - currentDay + 1);
    return { remainingDays: daysLeft, isCurrentActiveMonth: isActiveMonth };
  }, [selectedMonth]);

  const { totalBudgetAmount, totalBudgetSpent, totalRemaining, totalPercent, isTotalOver } =
    useMemo(() => {
      let bAmount = 0;
      let bSpent = 0;

      currentBudgets.forEach((b) => {
        bAmount += b.amount;
        const spent = b.categoryId ? spentByCatMap[b.categoryId] || 0 : totalMonthSpent;
        bSpent += spent;
      });

      const remaining = bAmount - bSpent;
      const percent = bAmount > 0 ? Math.min(100, Math.round((bSpent / bAmount) * 100)) : 0;
      const isOver = bSpent >= bAmount && bAmount > 0;

      return {
        totalBudgetAmount: bAmount,
        totalBudgetSpent: bSpent,
        totalRemaining: remaining,
        totalPercent: percent,
        isTotalOver: isOver
      };
    }, [currentBudgets, spentByCatMap, totalMonthSpent]);

  const totalDailySafe = useMemo(() => {
    return Math.max(0, Math.round(totalRemaining / remainingDays));
  }, [totalRemaining, remainingDays]);

  const showToast = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice(null), 4000);
  };

  const handleCopyFromPrevMonth = async () => {
    if (prevMonthBudgets.length === 0) return;

    if (
      window.confirm(
        `Bạn có muốn sao chép toàn bộ ${prevMonthBudgets.length} hạn mức từ ${formatMonthDisplay(
          prevMonth
        )} sang ${formatMonthDisplay(selectedMonth)}?`
      )
    ) {
      const now = new Date().toISOString();
      let copiedCount = 0;

      await db.transaction('rw', db.budgets, async () => {
        for (const pb of prevMonthBudgets) {
          const exists = await db.budgets
            .filter((b) => b.month === selectedMonth && b.categoryId === pb.categoryId)
            .first();

          if (!exists) {
            await db.budgets.add({
              id: generateUUID(),
              categoryId: pb.categoryId,
              amount: pb.amount,
              month: selectedMonth,
              createdAt: now
            });
            copiedCount++;
          }
        }
      });

      if (copiedCount > 0) {
        showToast(
          `Đã sao chép thành công ${copiedCount} hạn mức từ ${formatMonthDisplay(prevMonth)}!`
        );
      } else {
        showToast('Các hạn mức của tháng trước đã có sẵn trong tháng này.');
      }
    }
  };

  const handleOpenAddModal = () => {
    setEditingBudget(null);
    setSelectedCategoryId(parentExpenseCategories[0]?.id || expenseCategories[0]?.id || '');
    setAmountStr('');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (b: Budget) => {
    setEditingBudget(b);
    setSelectedCategoryId(b.categoryId || '');
    setAmountStr(new Intl.NumberFormat('vi-VN').format(b.amount));
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSaveBudget = async () => {
    const amount = Number(amountStr.replace(/[^0-9]/g, ''));
    if (!amount || amount <= 0) {
      setErrorMsg('Vui lòng nhập số tiền hạn mức lớn hơn 0đ');
      return;
    }

    const now = new Date().toISOString();

    if (editingBudget) {
      await db.budgets.update(editingBudget.id, {
        categoryId: selectedCategoryId || undefined,
        amount
      });
      showToast('Đã cập nhật hạn mức chi tiêu thành công!');
    } else {
      const existing = await db.budgets
        .filter((b) => b.month === selectedMonth && b.categoryId === (selectedCategoryId || undefined))
        .first();

      if (existing) {
        await db.budgets.update(existing.id, { amount });
        showToast('Đã cập nhật số tiền hạn mức mới cho danh mục!');
      } else {
        await db.budgets.add({
          id: generateUUID(),
          categoryId: selectedCategoryId || undefined,
          amount,
          month: selectedMonth,
          createdAt: now
        });
        showToast('Đã thiết lập hạn mức chi tiêu mới!');
      }
    }

    setIsModalOpen(false);
    setAmountStr('');
    setErrorMsg('');
    setEditingBudget(null);
  };

  const handleDeleteBudget = async (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc muốn xóa hạn mức "${name}"?`)) {
      await db.budgets.delete(id);
      showToast(`Đã xóa hạn mức "${name}" thành công!`);
    }
  };

  const handleQuickAddAmount = (addValue: number) => {
    const current = Number(amountStr.replace(/[^0-9]/g, '')) || 0;
    const newVal = current + addValue;
    setAmountStr(new Intl.NumberFormat('vi-VN').format(newVal));
  };

  if (isModalOpen) {
    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4 animate-fade-in">
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="touch-btn text-sky-400 font-bold text-xs flex items-center gap-1 cursor-pointer bg-transparent border-none p-1"
          >
            ← Quay lại danh sách hạn mức
          </button>
          <span className="text-xs font-extrabold text-slate-100 uppercase tracking-wider">
            {editingBudget ? 'Chỉnh sửa hạn mức' : 'Thiết lập hạn mức mới'}
          </span>
          <div className="w-12" />
        </div>

        <div className="bg-slate-900/90 rounded-3xl border border-white/10 p-5 flex flex-col gap-4 shadow-xl">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Chọn danh mục hoặc nhóm áp dụng
            </label>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="input-ios"
            >
              <option value="">🎯 Hạn mức chung cho toàn bộ chi tiêu tháng</option>
              {parentExpenseCategories.length > 0 && (
                <optgroup label="Nhóm Cha 50/30/20 (Tự động cộng gộp các mục con)">
                  {parentExpenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      📁 {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Hạng mục chi tiết">
                {childExpenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    • {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
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
              className="input-ios text-emerald-400 font-extrabold text-2xl py-3 tracking-tight"
              autoFocus
            />

            <div className="grid grid-cols-4 gap-2 mt-2">
              {[
                { label: '+500K', val: 500000 },
                { label: '+1 Tr', val: 1000000 },
                { label: '+2 Tr', val: 2000000 },
                { label: '+5 Tr', val: 5000000 }
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleQuickAddAmount(item.val)}
                  className="touch-btn py-1.5 rounded-xl bg-slate-800/80 border border-white/6 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="touch-btn py-3.5 px-5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm border-none cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSaveBudget}
              className="touch-btn flex-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 py-3.5 rounded-2xl text-sm font-black cursor-pointer shadow-lg shadow-emerald-500/25 border-none"
            >
              {editingBudget ? 'Cập nhật hạn mức' : 'Lưu hạn mức chi tiêu'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28">
      {onBack && (
        <div className="px-4 pt-3 pb-1 flex items-center justify-between border-b border-white/8 mb-2">
          <button
            type="button"
            onClick={onBack}
            className="text-sky-400 font-semibold text-xs flex items-center gap-1 cursor-pointer bg-transparent border-none p-1"
          >
            ← Quay lại mục Khác
          </button>
          <span className="text-xs font-bold text-slate-100 uppercase">Hạn mức chi tiêu</span>
          <div className="w-12" />
        </div>
      )}

      {/* 1. Header Chọn Tháng */}
      <div className="flex items-center justify-between mx-4 pt-3 pb-1">
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

      {statusNotice && (
        <div className="mx-4 my-2 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <Check size={16} strokeWidth={3} />
            <span>{statusNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="bg-transparent border-none text-emerald-400 cursor-pointer p-0.5"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. Thẻ Hero Tổng Quan Ngân Sách Tháng */}
      {currentBudgets.length > 0 && (
        <div className="mx-4 my-2.5 rounded-3xl p-5 bg-gradient-to-br from-slate-800/95 to-slate-900/98 border border-white/10 shadow-xl backdrop-blur-md">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                Tổng ngân sách đang theo dõi
              </span>
              <div className="font-heading text-3xl font-black text-white mt-1 tracking-tight">
                {formatVND(totalBudgetAmount)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Đã tiêu: <b className="text-slate-200">{formatVND(totalBudgetSpent)}</b> ({totalPercent}%)
              </div>
            </div>

            <div
              className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 shrink-0 ${
                isTotalOver
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  : totalPercent >= 70
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              }`}
            >
              {isTotalOver ? (
                <>
                  <AlertTriangle size={14} />
                  <span>Vượt mức!</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={14} />
                  <span>{totalPercent}%</span>
                </>
              )}
            </div>
          </div>

          <div className="w-full h-2.5 rounded-full bg-slate-800 mt-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isTotalOver
                  ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                  : totalPercent >= 70
                  ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                  : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
              }`}
              style={{ width: `${Math.min(100, totalPercent)}%` }}
            />
          </div>

          <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400">Còn lại được chi: </span>
              <b className={totalRemaining >= 0 ? 'text-slate-100' : 'text-rose-400'}>
                {formatVND(totalRemaining)}
              </b>
            </div>

            {totalRemaining > 0 && isCurrentActiveMonth && (
              <div className="text-right">
                <span className="text-slate-400">An toàn: </span>
                <b className="text-sky-400 font-bold">{formatVND(totalDailySafe)}/ngày</b>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. NÚT SAO CHÉP HẠN MỨC TỪ THÁNG TRƯỚC */}
      {prevMonthBudgets.length > 0 && currentBudgets.length < prevMonthBudgets.length && (
        <div className="mx-4 my-2">
          <button
            type="button"
            onClick={handleCopyFromPrevMonth}
            className="touch-btn w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-sky-500/10 border border-dashed border-sky-400/40 text-sky-400 text-xs font-semibold cursor-pointer hover:bg-sky-500/15 transition-colors"
          >
            <Copy size={16} />
            <span>
              Sao chép {prevMonthBudgets.length} hạn mức từ {formatMonthDisplay(prevMonth)}
            </span>
          </button>
        </div>
      )}

      {/* 4. DANH SÁCH CÁC HẠN MỨC */}
      <div className="px-4 mt-2 flex flex-col gap-3">
        {currentBudgets.length === 0 ? (
          <div className="text-center py-12 px-5 text-slate-400">
            <div className="text-5xl mb-3">🎯</div>
            <div className="text-base font-bold text-slate-100">
              Chưa có hạn mức nào trong {formatMonthDisplay(selectedMonth)}
            </div>
            <p className="text-xs text-slate-400 mt-1 mb-4 leading-relaxed">
              Thiết lập hạn mức chi tiêu theo Nhóm 50/30/20 hoặc từng hạng mục để kiểm soát dòng tiền!
            </p>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="touch-btn bg-emerald-500 hover:bg-emerald-600 text-white py-3 px-6 rounded-2xl font-bold text-sm cursor-pointer shadow-lg shadow-emerald-500/25"
            >
              + Thiết lập hạn mức đầu tiên
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Đang giám sát ({currentBudgets.length} hạn mức)
              </span>
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="touch-btn text-sky-400 text-xs font-bold flex items-center gap-1 cursor-pointer hover:underline"
              >
                <Plus size={16} /> Thêm hạn mức
              </button>
            </div>

            {currentBudgets.map((b) => {
              const cat = b.categoryId ? categoryMap.get(b.categoryId) : undefined;
              const isParentCat = cat && !cat.parentId;
              const spent = b.categoryId ? spentByCatMap[b.categoryId] || 0 : totalMonthSpent;
              const remaining = b.amount - spent;
              const percent = Math.min(100, Math.round((spent / b.amount) * 100));
              const isOver = spent >= b.amount;
              const isWarning = percent >= 70 && !isOver;

              const dailySafe = Math.max(0, Math.round(remaining / remainingDays));
              const budgetName = cat?.name || 'Tổng chi tiêu toàn tháng';

              const statusColorClass = isOver
                ? 'bg-rose-500'
                : isWarning
                ? 'bg-amber-500'
                : 'bg-emerald-500';

              const statusBadgeClass = isOver
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : isWarning
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';

              return (
                <div
                  key={b.id}
                  className={`rounded-2xl p-4 bg-slate-900/80 border transition-all ${
                    isOver ? 'border-rose-500/30 shadow-md shadow-rose-500/10' : 'border-white/8'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="cat-badge shrink-0"
                        style={{ backgroundColor: cat?.color || '#3b82f6' }}
                      >
                        <CategoryIcon name={cat?.icon || 'Target'} size={20} color="#ffffff" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-slate-100 truncate">
                            {budgetName}
                          </span>
                          {isParentCat && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-semibold shrink-0">
                              Nhóm Cha
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Đã chi: <b className="text-slate-200">{formatVND(spent)}</b> / {formatVND(b.amount)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusBadgeClass}`}>
                        {percent}%
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(b)}
                        className="touch-btn text-slate-400 hover:text-sky-400 p-1.5 rounded-lg bg-slate-800/80 border border-white/5 cursor-pointer transition-colors"
                        title="Chỉnh sửa hạn mức"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBudget(b.id, budgetName)}
                        className="touch-btn text-slate-400 hover:text-rose-400 p-1.5 rounded-lg bg-slate-800/80 border border-white/5 cursor-pointer transition-colors"
                        title="Xóa hạn mức"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="w-full h-2 rounded-full bg-slate-800 mt-3.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${statusColorClass}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

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
                      <span className="text-slate-400 text-right">
                        An toàn: <b className="text-sky-400">{formatVND(dailySafe)}/ngày</b>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
