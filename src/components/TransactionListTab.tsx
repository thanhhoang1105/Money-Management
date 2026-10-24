// src/components/TransactionListTab.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Transaction } from '../types';
import { createTransaction } from '../services/transactionService';
import { TransactionHistoryView } from './TransactionHistoryView';
import { CustomSelect } from './ui/CustomSelect';
import {
  formatVND,
  formatMonthDisplay,
  getCurrentMonth,
  getPreviousMonth,
  getCurrentDate,
  getCurrentTime
} from '../utils/formatters';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Wallet as WalletIcon,
  UserCheck,
  HandCoins,
  Plus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  X
} from 'lucide-react';

interface TransactionListTabProps {
  onEditTransaction: (tx: Transaction) => void;
  onOpenQuickAdd: () => void;
}

export const TransactionListTab: React.FC<TransactionListTabProps> = ({
  onEditTransaction,
  onOpenQuickAdd: _onOpenQuickAdd
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [duplicateFeedback, setDuplicateFeedback] = useState<string>('');

  // Trạng thái cho bảng Theo dõi Vay / Nợ ngay trên màn hình Tổng quan
  const [isAddingDebtQuick, setIsAddingDebtQuick] = useState<boolean>(false);
  const [debtContactInput, setDebtContactInput] = useState<string>('');
  const [debtTypeInput, setDebtTypeInput] = useState<
    'LEND' | 'BORROW' | 'COLLECT_DEBT' | 'PAY_DEBT'
  >('LEND');
  const [debtAmountInput, setDebtAmountInput] = useState<string>('');
  const [debtWalletIdInput, setDebtWalletIdInput] = useState<string>('');
  const [debtNoteInput, setDebtNoteInput] = useState<string>('');

  const [settleDebtInline, setSettleDebtInline] = useState<{
    contactName: string;
    mode: 'COLLECT_DEBT' | 'PAY_DEBT';
  } | null>(null);
  const [settleAmountInput, setSettleAmountInput] = useState<string>('');
  const [settleWalletIdInput, setSettleWalletIdInput] = useState<string>('');
  const [expandedDebtContact, setExpandedDebtContact] = useState<string | null>(null);
  const [showSettledDebts, setShowSettledDebts] = useState<boolean>(false);

  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const savedContactsSetting = useLiveQuery(() => db.settings.get('saved_debt_contacts'));

  // Toàn bộ giao dịch Vay / Nợ xuyên suốt các tháng để tính chính xác Ai đang nợ mình & Đang nợ ai
  const allDebtTransactions =
    useLiveQuery(async () => {
      return await db.transactions
        .filter(
          (tx) =>
            tx.type === 'LEND' ||
            tx.type === 'BORROW' ||
            tx.type === 'COLLECT_DEBT' ||
            tx.type === 'PAY_DEBT'
        )
        .reverse()
        .sortBy('date');
    }, []) || [];

  const allMonthTransactions =
    useLiveQuery(async () => {
      return await db.transactions
        .filter((tx) => tx.date.startsWith(selectedMonth))
        .reverse()
        .sortBy('date');
    }, [selectedMonth]) || [];


  const totalBalance = useMemo(() => {
    return wallets
      .filter((w) => !w.isExcludedFromTotal)
      .reduce((sum, w) => sum + w.balance, 0);
  }, [wallets]);

  // Tổng hợp Sổ Vay / Nợ ngay trên Tổng quan: Ai đang nợ mình (Cần thu) & Đang nợ ai (Phải trả)
  const debtOverview = useMemo(() => {
    const map = new Map<
      string,
      {
        contactName: string;
        lent: number;
        collected: number;
        borrowed: number;
        paid: number;
        txs: Transaction[];
      }
    >();

    const savedNames = Array.isArray(savedContactsSetting?.value)
      ? (savedContactsSetting.value as string[])
      : [];
    savedNames.forEach((n) => {
      const clean = n.trim();
      if (clean) {
        map.set(clean.toLowerCase(), {
          contactName: clean,
          lent: 0,
          collected: 0,
          borrowed: 0,
          paid: 0,
          txs: []
        });
      }
    });

    allDebtTransactions.forEach((tx) => {
      const name =
        tx.contactName?.trim() || (tx.note?.trim() ? tx.note.trim() : 'Chưa ghi tên');
      const key = name.toLowerCase();
      const entry = map.get(key) || {
        contactName: name,
        lent: 0,
        collected: 0,
        borrowed: 0,
        paid: 0,
        txs: []
      };
      entry.txs.push(tx);
      if (tx.type === 'LEND') entry.lent += tx.amount;
      if (tx.type === 'COLLECT_DEBT') entry.collected += tx.amount;
      if (tx.type === 'BORROW') entry.borrowed += tx.amount;
      if (tx.type === 'PAY_DEBT') entry.paid += tx.amount;
      map.set(key, entry);
    });

    let totalReceivable = 0;
    let totalPayable = 0;

    const allContacts = Array.from(map.values())
      .filter(
        (c) =>
          c.txs.length > 0 ||
          savedNames.some((s) => s.toLowerCase() === c.contactName.toLowerCase())
      )
      .map((c) => {
        const receivable = Math.max(0, c.lent - c.collected);
        const payable = Math.max(0, c.borrowed - c.paid);
        totalReceivable += receivable;
        totalPayable += payable;
        return {
          ...c,
          receivable,
          payable
        };
      });

    // Danh sách người đang nợ mình (receivable > 0)
    const whoOwesMe = allContacts.filter((c) => c.receivable > 0);
    // Danh sách người mình đang nợ (payable > 0)
    const whoIOwe = allContacts.filter((c) => c.payable > 0);
    // Danh sách đã tất toán (receivable === 0 && payable === 0)
    const settledList = allContacts.filter((c) => c.receivable === 0 && c.payable === 0);

    return {
      allContacts,
      whoOwesMe,
      whoIOwe,
      settledList,
      totalReceivable,
      totalPayable
    };
  }, [allDebtTransactions, savedContactsSetting?.value]);

  // Tính tổng Thu & Chi thuần của tháng đang chọn
  const { monthIncome, monthExpense } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    allMonthTransactions.forEach((tx) => {
      if (tx.excludeFromReport) return;
      if (tx.type === 'INCOME') inc += tx.amount;
      if (tx.type === 'EXPENSE') exp += tx.amount;
      if (tx.type === 'TRANSFER' && tx.transferFee && tx.transferFee > 0) {
        exp += tx.transferFee;
      }
    });
    return { monthIncome: inc, monthExpense: exp };
  }, [allMonthTransactions]);

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

  // Ghi nhanh khoản Vay / Nợ mới ngay trên Tổng quan
  const handleQuickCreateDebt = async () => {
    const person = debtContactInput.trim();
    if (!person) {
      alert('Vui lòng nhập tên người vay / chủ nợ');
      return;
    }
    const amount = Number(debtAmountInput.replace(/\D/g, ''));
    if (!amount || amount <= 0) {
      alert('Vui lòng nhập số tiền lớn hơn 0');
      return;
    }
    const walletId = debtWalletIdInput || wallets[0]?.id;
    if (!walletId) {
      alert('Chưa có ví tiền để ghi nhận');
      return;
    }

    const targetNameMap: Record<string, string> = {
      LEND: 'cho vay',
      BORROW: 'đi vay',
      COLLECT_DEBT: 'thu nợ',
      PAY_DEBT: 'trả nợ'
    };
    const debtCat = categories.find(
      (c) => c.type === 'DEBT' && c.name.trim().toLowerCase() === targetNameMap[debtTypeInput]
    );

    const today = getCurrentDate();
    await createTransaction({
      walletId,
      categoryId: debtCat?.id,
      type: debtTypeInput,
      amount,
      contactName: person,
      date: today,
      time: getCurrentTime(),
      note: debtNoteInput.trim() || `${debtCat?.name || 'Vay nợ'} - ${person}`
    });

    const currentSaved = Array.isArray(savedContactsSetting?.value)
      ? (savedContactsSetting.value as string[])
      : [];
    if (!currentSaved.some((s) => s.toLowerCase() === person.toLowerCase())) {
      await db.settings.put({
        key: 'saved_debt_contacts',
        value: [person, ...currentSaved]
      });
    }

    setIsAddingDebtQuick(false);
    setDebtContactInput('');
    setDebtAmountInput('');
    setDebtNoteInput('');
    setDuplicateFeedback(`Đã ghi nhận khoản vay/nợ của "${person}" (${formatVND(amount)})!`);
    setTimeout(() => setDuplicateFeedback(''), 3000);
  };

  // Thu nợ / Trả nợ trực tiếp 1 chạm ngay trên Tổng quan
  const handleConfirmSettleDebt = async () => {
    if (!settleDebtInline) return;
    const amount = Number(settleAmountInput.replace(/\D/g, ''));
    if (!amount || amount <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ lớn hơn 0');
      return;
    }
    const walletId = settleWalletIdInput || wallets[0]?.id;
    if (!walletId) return;

    const targetCatName = settleDebtInline.mode === 'COLLECT_DEBT' ? 'thu nợ' : 'trả nợ';
    const debtCat = categories.find(
      (c) => c.type === 'DEBT' && c.name.trim().toLowerCase() === targetCatName
    );

    await createTransaction({
      walletId,
      categoryId: debtCat?.id,
      type: settleDebtInline.mode,
      amount,
      contactName: settleDebtInline.contactName,
      date: getCurrentDate(),
      time: getCurrentTime(),
      note:
        settleDebtInline.mode === 'COLLECT_DEBT'
          ? `Thu nợ từ ${settleDebtInline.contactName}`
          : `Trả nợ cho ${settleDebtInline.contactName}`
    });

    const doneName = settleDebtInline.contactName;
    const doneMode = settleDebtInline.mode;
    setSettleDebtInline(null);
    setDuplicateFeedback(
      doneMode === 'COLLECT_DEBT'
        ? `Đã thu nợ ${formatVND(amount)} từ "${doneName}"!`
        : `Đã trả nợ ${formatVND(amount)} cho "${doneName}"!`
    );
    setTimeout(() => setDuplicateFeedback(''), 3000);
  };

  if (isHistoryOpen) {
    return (
      <TransactionHistoryView
        onClose={() => setIsHistoryOpen(false)}
        onEditTransaction={onEditTransaction}
        initialMonth={selectedMonth}
      />
    );
  }

  return (
    <div className="pb-28">
      {duplicateFeedback && (
        <div className="mx-4 mt-3 p-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold text-center animate-fade-in">
          {duplicateFeedback}
        </div>
      )}

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
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-[10px] bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <ArrowDownLeft size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400 truncate">Thu thuần tháng này</div>
              <div className="text-[13px] font-bold text-income truncate">
                +{formatVND(monthIncome)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-[10px] bg-rose-500/15 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <ArrowUpRight size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400 truncate">Chi thuần tháng này</div>
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

      {/* 3. Thẻ Lối Tắt Lịch Sử Ghi Chép */}
      <div className="mx-4 my-3 p-4 rounded-3xl bg-slate-900/90 border border-white/10 shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 shrink-0">
            <History size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100 truncate">
                Lịch sử ghi chép
              </span>
              <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/35 shadow-sm shrink-0">
                {allMonthTransactions.length} GD
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5 truncate">
              {formatMonthDisplay(selectedMonth)} • Xem toàn bộ, tìm kiếm & bộ lọc
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsHistoryOpen(true)}
          className="touch-btn py-2 px-3.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 ml-2"
        >
          <span>Xem tất cả</span>
          <ChevronRight size={15} />
        </button>
      </div>

      {/* 5. KHU VỰC THEO DÕI VAY & NỢ TRỰC QUAN Ở DƯỚI CÙNG MÀN HÌNH TỔNG QUAN (AI ĐANG NỢ MÌNH / ĐANG NỢ AI) */}
      <div className="mx-4 mt-4 rounded-3xl p-4 bg-slate-900/90 border border-white/10 shadow-lg flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
              <HandCoins size={17} />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-slate-100 uppercase tracking-wide m-0">
                Theo dõi Vay & Nợ
              </h3>
              <p className="text-[11px] text-slate-400 m-0">
                Nhìn nhanh ai đang nợ mình & mình đang nợ ai
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDebtWalletIdInput(wallets[0]?.id || '');
              setIsAddingDebtQuick(!isAddingDebtQuick);
            }}
            className="touch-btn py-1.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center gap-1 cursor-pointer border-none shrink-0"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>Ghi vay/nợ</span>
          </button>
        </div>

        {/* Form phẳng Ghi nhanh Vay / Nợ ngay trên Tổng quan */}
        {isAddingDebtQuick && (
          <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-amber-500/35 flex flex-col gap-2.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400">
                + Ghi khoản Cho vay / Đi vay / Thu / Trả nợ
              </span>
              <button
                type="button"
                onClick={() => setIsAddingDebtQuick(false)}
                className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer p-0.5"
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: 'LEND', label: '🤝 Cho vay' },
                { id: 'BORROW', label: '🧾 Đi vay' },
                { id: 'COLLECT_DEBT', label: '🐷 Thu nợ' },
                { id: 'PAY_DEBT', label: '💳 Trả nợ' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDebtTypeInput(t.id as any)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                    debtTypeInput === t.id
                      ? 'bg-amber-500 text-slate-950 border-amber-300'
                      : 'bg-slate-800 border-white/5 text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={debtContactInput}
                onChange={(e) => setDebtContactInput(e.target.value)}
                placeholder="Tên người vay / chủ nợ (VD: Anh Nam)..."
                className="input-ios text-xs py-2"
              />
              <input
                type="text"
                inputMode="numeric"
                value={debtAmountInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setDebtAmountInput(
                    val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : ''
                  );
                }}
                placeholder="Số tiền (VNĐ)..."
                className="input-ios text-xs py-2 font-extrabold text-amber-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CustomSelect
                value={debtWalletIdInput || (wallets[0]?.id ?? '')}
                onChange={setDebtWalletIdInput}
                options={wallets.map((w) => ({
                  value: w.id,
                  label: `${w.name} (${formatVND(w.balance)})`
                }))}
                triggerClassName="text-xs py-2 bg-slate-800"
              />
              <input
                type="text"
                value={debtNoteInput}
                onChange={(e) => setDebtNoteInput(e.target.value)}
                placeholder="Ghi chú (tùy chọn)..."
                className="input-ios text-xs py-2"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingDebtQuick(false)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold border-none cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleQuickCreateDebt}
                className="px-4 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold border-none cursor-pointer"
              >
                Lưu khoản vay/nợ
              </button>
            </div>
          </div>
        )}

        {/* 2 Cột Trực Quan: AI ĐANG NỢ MÌNH vs MÌNH ĐANG NỢ AI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* CỘT 1: AI ĐANG NỢ MÌNH (CẦN THU VỀ) */}
          <div className="p-3.5 rounded-2xl bg-amber-500/8 border border-amber-500/25 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wide">
                🤝 Ai đang nợ mình ({debtOverview.whoOwesMe.length})
              </span>
              <span className="font-heading text-sm font-black text-amber-400">
                {formatVND(debtOverview.totalReceivable)}
              </span>
            </div>

            {debtOverview.whoOwesMe.length === 0 ? (
              <div className="text-xs text-slate-500 py-1.5">
                Hiện không có ai đang nợ bạn.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {debtOverview.whoOwesMe.map((person) => {
                  const isExpanded = expandedDebtContact === `recv_${person.contactName}`;
                  return (
                    <div
                      key={person.contactName}
                      className="p-2.5 rounded-xl bg-slate-950/70 border border-white/6 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDebtContact(
                              isExpanded ? null : `recv_${person.contactName}`
                            )
                          }
                          className="text-left bg-transparent border-none p-0 cursor-pointer min-w-0 flex-1"
                        >
                          <div className="text-xs font-bold text-slate-100 truncate flex items-center gap-1">
                            <UserCheck size={13} className="text-amber-400 shrink-0" />
                            <span className="truncate">{person.contactName}</span>
                          </div>
                          <div className="text-[11px] text-amber-400 font-extrabold mt-0.5">
                            Nợ bạn: {formatVND(person.receivable)}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSettleDebtInline({
                              contactName: person.contactName,
                              mode: 'COLLECT_DEBT'
                            });
                            setSettleAmountInput(
                              new Intl.NumberFormat('vi-VN').format(person.receivable)
                            );
                            setSettleWalletIdInput(wallets[0]?.id || '');
                          }}
                          className="touch-btn py-1.5 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold cursor-pointer shrink-0"
                        >
                          + Thu nợ
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="pt-2 border-t border-white/6 flex flex-col gap-1.5 text-[11px] text-slate-400">
                          <div className="flex justify-between">
                            <span>Đã cho vay: {formatVND(person.lent)}</span>
                            <span>Đã thu: {formatVND(person.collected)}</span>
                          </div>
                          {person.txs.slice(0, 4).map((t) => (
                            <div
                              key={t.id}
                              onClick={() => onEditTransaction(t)}
                              className="flex justify-between items-center py-1 px-2 rounded bg-slate-900/90 hover:bg-slate-800 cursor-pointer"
                            >
                              <span className="truncate text-slate-300">
                                {t.date} • {t.note || 'Giao dịch vay/nợ'}
                              </span>
                              <span className="font-bold text-amber-300 shrink-0 ml-2">
                                {formatVND(t.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CỘT 2: MÌNH ĐANG NỢ AI (PHẢI TRẢ) */}
          <div className="p-3.5 rounded-2xl bg-purple-500/8 border border-purple-500/25 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wide">
                🧾 Đang nợ ai ({debtOverview.whoIOwe.length})
              </span>
              <span className="font-heading text-sm font-black text-purple-400">
                {formatVND(debtOverview.totalPayable)}
              </span>
            </div>

            {debtOverview.whoIOwe.length === 0 ? (
              <div className="text-xs text-slate-500 py-1.5">
                Hiện bạn không nợ ai.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {debtOverview.whoIOwe.map((person) => {
                  const isExpanded = expandedDebtContact === `pay_${person.contactName}`;
                  return (
                    <div
                      key={person.contactName}
                      className="p-2.5 rounded-xl bg-slate-950/70 border border-white/6 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDebtContact(
                              isExpanded ? null : `pay_${person.contactName}`
                            )
                          }
                          className="text-left bg-transparent border-none p-0 cursor-pointer min-w-0 flex-1"
                        >
                          <div className="text-xs font-bold text-slate-100 truncate flex items-center gap-1">
                            <UserCheck size={13} className="text-purple-400 shrink-0" />
                            <span className="truncate">{person.contactName}</span>
                          </div>
                          <div className="text-[11px] text-purple-400 font-extrabold mt-0.5">
                            Còn nợ: {formatVND(person.payable)}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSettleDebtInline({
                              contactName: person.contactName,
                              mode: 'PAY_DEBT'
                            });
                            setSettleAmountInput(
                              new Intl.NumberFormat('vi-VN').format(person.payable)
                            );
                            setSettleWalletIdInput(wallets[0]?.id || '');
                          }}
                          className="touch-btn py-1.5 px-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-[11px] font-bold cursor-pointer shrink-0"
                        >
                          - Trả nợ
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="pt-2 border-t border-white/6 flex flex-col gap-1.5 text-[11px] text-slate-400">
                          <div className="flex justify-between">
                            <span>Đã vay: {formatVND(person.borrowed)}</span>
                            <span>Đã trả: {formatVND(person.paid)}</span>
                          </div>
                          {person.txs.slice(0, 4).map((t) => (
                            <div
                              key={t.id}
                              onClick={() => onEditTransaction(t)}
                              className="flex justify-between items-center py-1 px-2 rounded bg-slate-900/90 hover:bg-slate-800 cursor-pointer"
                            >
                              <span className="truncate text-slate-300">
                                {t.date} • {t.note || 'Giao dịch vay/nợ'}
                              </span>
                              <span className="font-bold text-purple-300 shrink-0 ml-2">
                                {formatVND(t.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Khung xác nhận Thu nợ / Trả nợ nhanh ngay trên Tổng quan */}
        {settleDebtInline && (
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/40 flex flex-col gap-2.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400">
                {settleDebtInline.mode === 'COLLECT_DEBT'
                  ? `🐷 Thu nợ từ "${settleDebtInline.contactName}"`
                  : `💳 Trả nợ cho "${settleDebtInline.contactName}"`}
              </span>
              <button
                type="button"
                onClick={() => setSettleDebtInline(null)}
                className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={settleAmountInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setSettleAmountInput(
                    val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : ''
                  );
                }}
                placeholder="Số tiền..."
                className="input-ios text-xs py-2 font-extrabold text-emerald-400"
              />
              <CustomSelect
                value={settleWalletIdInput || (wallets[0]?.id ?? '')}
                onChange={setSettleWalletIdInput}
                options={wallets.map((w) => ({
                  value: w.id,
                  label: `${w.name} (${formatVND(w.balance)})`
                }))}
                triggerClassName="text-xs py-2 bg-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettleDebtInline(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold border-none cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmSettleDebt}
                className="px-4 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold border-none cursor-pointer"
              >
                Xác nhận
              </button>
            </div>
          </div>
        )}

        {/* Nút xem các người nợ đã tất toán xong (nếu có) */}
        {debtOverview.settledList.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowSettledDebts(!showSettledDebts)}
              className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer"
            >
              <CheckCircle2 size={12} className="text-emerald-400" />
              <span>
                Đã tất toán xong ({debtOverview.settledList.length} người)
              </span>
              {showSettledDebts ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {showSettledDebts && (
              <div className="mt-2 flex flex-wrap gap-1.5 animate-fade-in">
                {debtOverview.settledList.map((s) => (
                  <span
                    key={s.contactName}
                    onClick={() => setIsHistoryOpen(true)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800/80 border border-white/6 text-slate-300 cursor-pointer hover:border-emerald-500/40 flex items-center gap-1"
                    title="Bấm để xem lịch sử ghi chép"
                  >
                    <CheckCircle2 size={11} className="text-emerald-400" />
                    <span>{s.contactName}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
