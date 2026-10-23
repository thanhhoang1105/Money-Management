// src/components/MoreTab.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { BudgetsTab } from './BudgetsTab';
import {
  exportTransactionsToExcel,
  exportFullBackupJSON,
  downloadOrShareFile,
  restoreBackupData
} from '../services/backupService';
import {
  createTransaction,
  computeNextRunDate,
  processDueRecurringTransactions
} from '../services/transactionService';
import { formatVND, getCurrentDate, getCurrentTime, formatFriendlyDate } from '../utils/formatters';
import { generateUUID } from '../utils/uuid';
import { CategoryManagerScreen } from './CategoryManagerScreen';
import type {
  AppStartupTab,
  RecurringFrequency
} from '../types';
import {
  Target,
  Tags,
  Repeat,
  Plane,
  HandCoins,
  Moon,
  Smartphone,
  Cloud,
  Download,
  Upload,
  FileSpreadsheet,
  ChevronRight,
  ShieldCheck,
  Check,
  Sparkles,
  Plus,
  Trash2,
  X,
  UserCheck,
  Calendar,
  Play,
  CheckCircle2
} from 'lucide-react';

interface MoreTabProps {
  onOpenSettings: () => void;
  defaultInitialTab: AppStartupTab;
  onChangeDefaultTab: (tab: AppStartupTab) => void;
}

type SubViewType = 'MAIN' | 'BUDGETS' | 'CATEGORIES' | 'DEBTS' | 'RECURRING' | 'EVENTS';

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  DAILY: 'Hàng ngày',
  WEEKLY: 'Hàng tuần',
  MONTHLY: 'Hàng tháng',
  YEARLY: 'Hàng năm'
};

export const MoreTab: React.FC<MoreTabProps> = ({
  onOpenSettings,
  defaultInitialTab,
  onChangeDefaultTab
}) => {
  const [subView, setSubView] = useState<SubViewType>('MAIN');
  const [notice, setNotice] = useState<string | null>(null);

  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const budgetsCount = useLiveQuery(() => db.budgets.count()) || 0;
  const recurringList = useLiveQuery(() => db.recurringTransactions.toArray()) || [];
  const eventsList = useLiveQuery(() => db.events.toArray()) || [];

  // States cho Modal tạo Ghi chép định kỳ
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [recType, setRecType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [recAmountStr, setRecAmountStr] = useState('');
  const [recCategoryId, setRecCategoryId] = useState('');
  const [recWalletId, setRecWalletId] = useState('');
  const [recFrequency, setRecFrequency] = useState<RecurringFrequency>('MONTHLY');
  const [recStartDate, setRecStartDate] = useState(getCurrentDate());
  const [recNote, setRecNote] = useState('');

  // States cho Modal tạo Sự kiện / Chuyến đi
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [evName, setEvName] = useState('');
  const [evBudgetStr, setEvBudgetStr] = useState('');
  const [evStartDate, setEvStartDate] = useState(getCurrentDate());

  // States cho Modal Thu nợ / Trả nợ 1 chạm trong Sổ Nợ
  const [settleContactModal, setSettleContactModal] = useState<{
    contactName: string;
    mode: 'COLLECT_DEBT' | 'PAY_DEBT';
    remainingAmount: number;
  } | null>(null);
  const [settleAmountStr, setSettleAmountStr] = useState('');
  const [settleWalletId, setSettleWalletId] = useState('');

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  // Thống kê Sổ Nợ theo từng Người vay / Chủ nợ
  const debtSummaryByContact = useMemo(() => {
    const map = new Map<
      string,
      {
        contactName: string;
        lent: number;
        collected: number;
        borrowed: number;
        paid: number;
        txCount: number;
      }
    >();

    transactions.forEach((tx) => {
      if (
        tx.type !== 'LEND' &&
        tx.type !== 'BORROW' &&
        tx.type !== 'COLLECT_DEBT' &&
        tx.type !== 'PAY_DEBT'
      ) {
        return;
      }
      const name = tx.contactName?.trim() || (tx.note?.trim() ? tx.note.trim() : 'Chưa ghi tên');
      const key = name.toLowerCase();
      const entry = map.get(key) || {
        contactName: name,
        lent: 0,
        collected: 0,
        borrowed: 0,
        paid: 0,
        txCount: 0
      };
      entry.txCount += 1;
      if (tx.type === 'LEND') entry.lent += tx.amount;
      if (tx.type === 'COLLECT_DEBT') entry.collected += tx.amount;
      if (tx.type === 'BORROW') entry.borrowed += tx.amount;
      if (tx.type === 'PAY_DEBT') entry.paid += tx.amount;
      map.set(key, entry);
    });

    let totalReceivable = 0;
    let totalPayable = 0;

    const contacts = Array.from(map.values()).map((c) => {
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

    return {
      contacts,
      totalReceivable,
      totalPayable
    };
  }, [transactions]);

  // Sao lưu JSON
  const handleBackupJSON = async () => {
    try {
      const jsonStr = await exportFullBackupJSON();
      const fileName = `SoThuChi_Backup_${getCurrentDate().replace(/-/g, '')}.json`;
      await downloadOrShareFile(jsonStr, fileName, 'application/json');
      showToast('Đã xuất file sao lưu JSON thành công!');
    } catch (err: any) {
      alert('Lỗi sao lưu JSON: ' + (err?.message || 'Thất bại'));
    }
  };

  // Khôi phục JSON
  const handleRestoreJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      !window.confirm(
        'CẢNH BÁO: Ghi đè toàn bộ dữ liệu bằng file sao lưu. Bạn có chắc chắn muốn khôi phục?'
      )
    ) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const res = await restoreBackupData(content);
        showToast(
          `Khôi phục thành công ${res.counts.transactions} giao dịch và ${res.counts.wallets} ví!`
        );
      } catch (err: any) {
        alert('Lỗi đọc file: ' + (err?.message || 'Không hợp lệ'));
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Xuất Excel
  const handleExportExcel = async () => {
    try {
      const res = await exportTransactionsToExcel();
      showToast(`Đã xuất báo cáo Excel thành công (${res.transactionCount} giao dịch)!`);
    } catch (err: any) {
      alert('Lỗi xuất Excel: ' + (err?.message || 'Thất bại'));
    }
  };

  // SUBVIEW 1: HẠN MỨC CHI TIÊU
  if (subView === 'BUDGETS') {
    return (
      <div className="flex flex-col min-h-full">
        <BudgetsTab onBack={() => setSubView('MAIN')} />
      </div>
    );
  }

  // SUBVIEW 2: HẠNG MỤC THU/CHI
  if (subView === 'CATEGORIES') {
    return <CategoryManagerScreen isOpen={true} onClose={() => setSubView('MAIN')} />;
  }

  // SUBVIEW 3: SỔ NỢ (QUẢN LÝ VAY & CHO VAY CHUẨN MISA)
  if (subView === 'DEBTS') {
    const handleConfirmSettle = async () => {
      if (!settleContactModal) return;
      const amount = Number(settleAmountStr.replace(/\D/g, ''));
      if (!amount || amount <= 0) {
        alert('Vui lòng nhập số tiền hợp lệ lớn hơn 0');
        return;
      }
      const walletId = settleWalletId || wallets[0]?.id;
      if (!walletId) {
        alert('Chưa có ví tiền để ghi nhận');
        return;
      }

      const targetCatName = settleContactModal.mode === 'COLLECT_DEBT' ? 'thu nợ' : 'trả nợ';
      const debtCat = categories.find(
        (c) => c.type === 'DEBT' && c.name.trim().toLowerCase() === targetCatName
      );

      await createTransaction({
        walletId,
        categoryId: debtCat?.id,
        type: settleContactModal.mode,
        amount,
        contactName: settleContactModal.contactName,
        date: getCurrentDate(),
        time: getCurrentTime(),
        note:
          settleContactModal.mode === 'COLLECT_DEBT'
            ? `Thu nợ từ ${settleContactModal.contactName}`
            : `Trả nợ cho ${settleContactModal.contactName}`
      });

      setSettleContactModal(null);
      showToast('Đã ghi nhận giao dịch thu/trả nợ và cập nhật số dư ví!');
    };

    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-white/8 pb-2.5">
          <button
            type="button"
            onClick={() => setSubView('MAIN')}
            className="text-sky-400 font-semibold text-xs flex items-center gap-1 cursor-pointer bg-transparent border-none p-1"
          >
            ← Quay lại mục Khác
          </button>
          <span className="text-xs font-bold text-slate-100 uppercase">
            Sổ Nợ (Theo dõi Vay & Cho vay)
          </span>
          <div className="w-12" />
        </div>

        {notice && (
          <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <Check size={16} />
            <span>{notice}</span>
          </div>
        )}

        {/* Tổng quan Cần Thu & Phải Trả */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25">
            <div className="text-[11px] font-bold text-amber-300 uppercase">Cần thu về (Cho vay)</div>
            <div className="font-heading text-xl font-black text-amber-400 mt-1">
              {formatVND(debtSummaryByContact.totalReceivable)}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/25">
            <div className="text-[11px] font-bold text-purple-300 uppercase">Phải trả (Đi vay)</div>
            <div className="font-heading text-xl font-black text-purple-400 mt-1">
              {formatVND(debtSummaryByContact.totalPayable)}
            </div>
          </div>
        </div>

        {/* Danh sách từng người */}
        {debtSummaryByContact.contacts.length === 0 ? (
          <div className="py-12 px-5 text-center text-slate-400 bg-slate-900/50 rounded-3xl border border-white/6">
            <HandCoins size={36} className="mx-auto mb-2 text-amber-400/70" />
            <div className="text-sm font-bold text-slate-200">Chưa có khoản vay nợ nào</div>
            <p className="text-xs text-slate-400 mt-1">
              Khi ghi giao dịch <b>Cho vay / Đi vay / Thu nợ / Trả nợ</b> và nhập tên người giao dịch, hệ thống sẽ tự động tổng hợp công nợ tại đây.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {debtSummaryByContact.contacts.map((item) => (
              <div
                key={item.contactName}
                className="p-4 rounded-2xl bg-slate-900/80 border border-white/8 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold">
                      <UserCheck size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-100">{item.contactName}</div>
                      <div className="text-[11px] text-slate-400">{item.txCount} giao dịch</div>
                    </div>
                  </div>

                  {item.receivable === 0 && item.payable === 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                      <CheckCircle2 size={13} /> Đã tất toán
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-800/50 p-3 rounded-xl border border-white/5">
                  <div>
                    <div className="text-slate-400">Đã cho vay: {formatVND(item.lent)}</div>
                    <div className="text-slate-400">Đã thu nợ: {formatVND(item.collected)}</div>
                    <div className="font-bold text-amber-400 mt-1">
                      Còn phải thu: {formatVND(item.receivable)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Đã đi vay: {formatVND(item.borrowed)}</div>
                    <div className="text-slate-400">Đã trả nợ: {formatVND(item.paid)}</div>
                    <div className="font-bold text-purple-400 mt-1">
                      Còn phải trả: {formatVND(item.payable)}
                    </div>
                  </div>
                </div>

                {(item.receivable > 0 || item.payable > 0) && (
                  <div className="flex items-center gap-2">
                    {item.receivable > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSettleContactModal({
                            contactName: item.contactName,
                            mode: 'COLLECT_DEBT',
                            remainingAmount: item.receivable
                          });
                          setSettleAmountStr(
                            new Intl.NumberFormat('vi-VN').format(item.receivable)
                          );
                          setSettleWalletId(wallets[0]?.id || '');
                        }}
                        className="touch-btn flex-1 py-2 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold cursor-pointer hover:bg-emerald-500/25"
                      >
                        + Thu nợ ngay ({formatVND(item.receivable)})
                      </button>
                    )}

                    {item.payable > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSettleContactModal({
                            contactName: item.contactName,
                            mode: 'PAY_DEBT',
                            remainingAmount: item.payable
                          });
                          setSettleAmountStr(
                            new Intl.NumberFormat('vi-VN').format(item.payable)
                          );
                          setSettleWalletId(wallets[0]?.id || '');
                        }}
                        className="touch-btn flex-1 py-2 px-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold cursor-pointer hover:bg-rose-500/25"
                      >
                        - Trả nợ ngay ({formatVND(item.payable)})
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Modal Thu nợ / Trả nợ nhanh */}
        {settleContactModal && (
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-md z-[120] flex items-center justify-center p-4"
            onClick={() => setSettleContactModal(null)}
          >
            <div
              className="w-full max-w-md bg-slate-900 rounded-3xl border border-white/12 p-5 flex flex-col gap-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/8 pb-3">
                <span className="text-sm font-bold text-slate-100">
                  {settleContactModal.mode === 'COLLECT_DEBT'
                    ? `Thu nợ từ ${settleContactModal.contactName}`
                    : `Trả nợ cho ${settleContactModal.contactName}`}
                </span>
                <button
                  type="button"
                  onClick={() => setSettleContactModal(null)}
                  className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center border-none cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                  Số tiền {settleContactModal.mode === 'COLLECT_DEBT' ? 'thu về' : 'trả nợ'} (VNĐ)
                </label>
                <input
                  type="text"
                  value={settleAmountStr}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setSettleAmountStr(
                      val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : ''
                    );
                  }}
                  className="input-ios text-xl font-extrabold text-emerald-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                  Tài khoản / Ví nhận hoặc chi
                </label>
                <select
                  value={settleWalletId}
                  onChange={(e) => setSettleWalletId(e.target.value)}
                  className="input-ios"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatVND(w.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleConfirmSettle}
                className="touch-btn py-3 rounded-2xl bg-emerald-500 text-slate-950 font-black text-sm cursor-pointer border-none"
              >
                Xác nhận ghi giao dịch
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // SUBVIEW 4: GHI CHÉP ĐỊNH KỲ (RECURRING TRANSACTIONS)
  if (subView === 'RECURRING') {
    const handleCreateRecurring = async () => {
      const amount = Number(recAmountStr.replace(/\D/g, ''));
      if (!amount || amount <= 0) {
        alert('Vui lòng nhập số tiền hợp lệ');
        return;
      }
      const walletId = recWalletId || wallets[0]?.id;
      if (!walletId) {
        alert('Vui lòng chọn ví');
        return;
      }
      const now = new Date().toISOString();
      await db.recurringTransactions.add({
        id: generateUUID(),
        walletId,
        categoryId: recCategoryId || undefined,
        type: recType,
        amount,
        note: recNote.trim() || undefined,
        frequency: recFrequency,
        startDate: recStartDate,
        nextRunDate: recStartDate,
        isActive: true,
        createdAt: now,
        updatedAt: now
      });
      setIsRecurringModalOpen(false);
      setRecAmountStr('');
      setRecNote('');
      const count = await processDueRecurringTransactions();
      if (count > 0) {
        showToast(`Đã tạo mẫu định kỳ và tự động ghi ${count} giao dịch đến hạn!`);
      } else {
        showToast('Đã lưu mẫu ghi chép định kỳ!');
      }
    };

    const handleRunNow = async (rId: string) => {
      const item = await db.recurringTransactions.get(rId);
      if (!item) return;
      const today = getCurrentDate();
      await createTransaction({
        walletId: item.walletId,
        toWalletId: item.toWalletId,
        categoryId: item.categoryId,
        type: item.type,
        amount: item.amount,
        date: today,
        time: getCurrentTime(),
        note: item.note ? `[Định kỳ] ${item.note}` : '[Ghi chép định kỳ]',
        recurringId: item.id
      });
      await db.recurringTransactions.update(item.id, {
        lastRunDate: today,
        nextRunDate: computeNextRunDate(today, item.frequency),
        updatedAt: new Date().toISOString()
      });
      showToast(`Đã ghi ngay giao dịch định kỳ ${formatVND(item.amount)}!`);
    };

    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-white/8 pb-2.5">
          <button
            type="button"
            onClick={() => setSubView('MAIN')}
            className="text-sky-400 font-semibold text-xs flex items-center gap-1 cursor-pointer bg-transparent border-none p-1"
          >
            ← Quay lại mục Khác
          </button>
          <span className="text-xs font-bold text-slate-100 uppercase">Ghi chép định kỳ</span>
          <button
            type="button"
            onClick={() => {
              setRecWalletId(wallets[0]?.id || '');
              setRecCategoryId(
                categories.find((c) => c.type === 'EXPENSE' && !!c.parentId)?.id || ''
              );
              setIsRecurringModalOpen(true);
            }}
            className="text-xs font-bold text-emerald-400 flex items-center gap-1 cursor-pointer bg-emerald-500/15 px-2.5 py-1 rounded-xl border border-emerald-500/30"
          >
            <Plus size={14} /> Thêm
          </button>
        </div>

        {notice && (
          <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <Check size={16} />
            <span>{notice}</span>
          </div>
        )}

        {recurringList.length === 0 ? (
          <div className="py-12 px-5 text-center text-slate-400 bg-slate-900/50 rounded-3xl border border-white/6">
            <Repeat size={36} className="mx-auto mb-2 text-sky-400/70" />
            <div className="text-sm font-bold text-slate-200">Chưa có mẫu ghi chép định kỳ</div>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Tự động ghi tiền thuê nhà, tiền điện, Internet, Netflix hoặc lương hàng tháng đúng hạn mỗi khi mở ứng dụng.
            </p>
            <button
              type="button"
              onClick={() => {
                setRecWalletId(wallets[0]?.id || '');
                setRecCategoryId(
                  categories.find((c) => c.type === 'EXPENSE' && !!c.parentId)?.id || ''
                );
                setIsRecurringModalOpen(true);
              }}
              className="touch-btn py-2.5 px-5 rounded-2xl bg-sky-500 text-slate-950 font-bold text-xs cursor-pointer border-none"
            >
              + Tạo mẫu định kỳ đầu tiên
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {recurringList.map((item) => {
              const cat = categories.find((c) => c.id === item.categoryId);
              const wallet = wallets.find((w) => w.id === item.walletId);
              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-white/8 flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-100">
                        {item.note || cat?.name || 'Giao dịch định kỳ'}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {FREQUENCY_LABELS[item.frequency]} • Ví: {wallet?.name || 'Mặc định'}
                      </div>
                    </div>
                    <div
                      className={`text-base font-black ${
                        item.type === 'EXPENSE' ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {item.type === 'EXPENSE' ? '-' : '+'}
                      {formatVND(item.amount)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/6 text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Calendar size={13} className="text-sky-400" />
                      Kỳ tới: <b className="text-slate-200">{item.nextRunDate}</b>
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRunNow(item.id)}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold flex items-center gap-1 cursor-pointer"
                        title="Ghi ngay 1 giao dịch vào hôm nay"
                      >
                        <Play size={12} /> Ghi ngay
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm('Xóa mẫu ghi chép định kỳ này?')) {
                            await db.recurringTransactions.delete(item.id);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border-none cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isRecurringModalOpen && (
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-md z-[120] flex items-center justify-center p-4"
            onClick={() => setIsRecurringModalOpen(false)}
          >
            <div
              className="w-full max-w-md bg-slate-900 rounded-3xl border border-white/12 p-5 flex flex-col gap-3.5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/8 pb-2.5">
                <span className="text-sm font-bold text-slate-100">Thêm ghi chép định kỳ</span>
                <button
                  type="button"
                  onClick={() => setIsRecurringModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center border-none cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRecType('EXPENSE');
                    setRecCategoryId(
                      categories.find((c) => c.type === 'EXPENSE' && !!c.parentId)?.id || ''
                    );
                  }}
                  className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                    recType === 'EXPENSE'
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                      : 'bg-slate-800 border-white/5 text-slate-400'
                  }`}
                >
                  Khoản Chi định kỳ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecType('INCOME');
                    setRecCategoryId(categories.find((c) => c.type === 'INCOME')?.id || '');
                  }}
                  className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                    recType === 'INCOME'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-800 border-white/5 text-slate-400'
                  }`}
                >
                  Khoản Thu định kỳ
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Tên / Ghi chú khoản định kỳ
                </label>
                <input
                  type="text"
                  value={recNote}
                  onChange={(e) => setRecNote(e.target.value)}
                  placeholder="VD: Tiền thuê nhà, Lương tháng, Cước Internet..."
                  className="input-ios"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Số tiền (VNĐ)
                </label>
                <input
                  type="text"
                  value={recAmountStr}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setRecAmountStr(
                      val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : ''
                    );
                  }}
                  placeholder="Ví dụ: 4.500.000"
                  className="input-ios font-extrabold text-lg text-sky-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Chu kỳ lặp lại
                  </label>
                  <select
                    value={recFrequency}
                    onChange={(e) => setRecFrequency(e.target.value as RecurringFrequency)}
                    className="input-ios"
                  >
                    <option value="DAILY">Hàng ngày</option>
                    <option value="WEEKLY">Hàng tuần</option>
                    <option value="MONTHLY">Hàng tháng</option>
                    <option value="YEARLY">Hàng năm</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Ngày chạy tiếp theo
                  </label>
                  <input
                    type="date"
                    value={recStartDate}
                    onChange={(e) => setRecStartDate(e.target.value)}
                    className="input-ios"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Hạng mục
                  </label>
                  <select
                    value={recCategoryId}
                    onChange={(e) => setRecCategoryId(e.target.value)}
                    className="input-ios"
                  >
                    {categories
                      .filter((c) =>
                        recType === 'EXPENSE' ? c.type === 'EXPENSE' && !!c.parentId : c.type === 'INCOME'
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Tài khoản / Ví
                  </label>
                  <select
                    value={recWalletId}
                    onChange={(e) => setRecWalletId(e.target.value)}
                    className="input-ios"
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateRecurring}
                className="touch-btn py-3 rounded-2xl bg-sky-500 text-slate-950 font-black text-sm cursor-pointer border-none mt-1"
              >
                Lưu mẫu định kỳ
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // SUBVIEW 5: SỰ KIỆN & CHUYẾN ĐI (EVENTS & TRIPS CHUẨN MISA)
  if (subView === 'EVENTS') {
    const handleCreateEvent = async () => {
      if (!evName.trim()) {
        alert('Vui lòng nhập tên sự kiện / chuyến đi');
        return;
      }
      const budget = Number(evBudgetStr.replace(/\D/g, '')) || undefined;
      const now = new Date().toISOString();
      await db.events.add({
        id: generateUUID(),
        name: evName.trim(),
        icon: 'Plane',
        color: '#0EA5E9',
        startDate: evStartDate,
        budgetAmount: budget,
        isCompleted: false,
        createdAt: now,
        updatedAt: now
      });
      setIsEventModalOpen(false);
      setEvName('');
      setEvBudgetStr('');
      showToast('Đã tạo sự kiện / chuyến đi mới!');
    };

    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-white/8 pb-2.5">
          <button
            type="button"
            onClick={() => setSubView('MAIN')}
            className="text-sky-400 font-semibold text-xs flex items-center gap-1 cursor-pointer bg-transparent border-none p-1"
          >
            ← Quay lại mục Khác
          </button>
          <span className="text-xs font-bold text-slate-100 uppercase">
            Sự kiện & Chuyến đi
          </span>
          <button
            type="button"
            onClick={() => setIsEventModalOpen(true)}
            className="text-xs font-bold text-emerald-400 flex items-center gap-1 cursor-pointer bg-emerald-500/15 px-2.5 py-1 rounded-xl border border-emerald-500/30"
          >
            <Plus size={14} /> Tạo mới
          </button>
        </div>

        {notice && (
          <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <Check size={16} />
            <span>{notice}</span>
          </div>
        )}

        {eventsList.length === 0 ? (
          <div className="py-12 px-5 text-center text-slate-400 bg-slate-900/50 rounded-3xl border border-white/6">
            <Plane size={36} className="mx-auto mb-2 text-emerald-400/70" />
            <div className="text-sm font-bold text-slate-200">
              Chưa có Sự kiện / Chuyến đi nào
            </div>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Tạo sự kiện (VD: Du lịch Đà Lạt, Tết Nguyên Đán, Đám cưới) để gom nhóm và tổng hợp toàn bộ chi phí của chuyến đi xuyên qua nhiều hạng mục khác nhau.
            </p>
            <button
              type="button"
              onClick={() => setIsEventModalOpen(true)}
              className="touch-btn py-2.5 px-5 rounded-2xl bg-emerald-500 text-slate-950 font-bold text-xs cursor-pointer border-none"
            >
              + Tạo Sự kiện / Chuyến đi
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {eventsList.map((ev) => {
              const evTxs = transactions.filter((t) => t.eventId === ev.id);
              const totalSpent = evTxs
                .filter((t) => t.type === 'EXPENSE')
                .reduce((s, t) => s + t.amount, 0);
              return (
                <div
                  key={ev.id}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-white/8 flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
                        <Plane size={18} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-100">{ev.name}</div>
                        <div className="text-[11px] text-slate-400">
                          Bắt đầu: {formatFriendlyDate(ev.startDate)} • {evTxs.length} giao dịch
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-slate-400">Tổng chi sự kiện</div>
                      <div className="text-base font-black text-rose-400">
                        -{formatVND(totalSpent)}
                      </div>
                    </div>
                  </div>

                  {ev.budgetAmount && ev.budgetAmount > 0 ? (
                    <div className="text-xs text-slate-400">
                      Ngân sách dự kiến: <b className="text-slate-200">{formatVND(ev.budgetAmount)}</b> (
                      {Math.round((totalSpent / ev.budgetAmount) * 100)}%)
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between pt-2 border-t border-white/6 text-xs">
                    <button
                      type="button"
                      onClick={async () => {
                        await db.events.update(ev.id, {
                          isCompleted: !ev.isCompleted,
                          updatedAt: new Date().toISOString()
                        });
                      }}
                      className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer border ${
                        ev.isCompleted
                          ? 'bg-slate-800 text-slate-400 border-white/10'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {ev.isCompleted ? 'Đã kết thúc (Chạm để mở lại)' : 'Đang diễn ra'}
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm(`Xóa sự kiện "${ev.name}"?`)) {
                          await db.events.delete(ev.id);
                        }
                      }}
                      className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border-none cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isEventModalOpen && (
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-md z-[120] flex items-center justify-center p-4"
            onClick={() => setIsEventModalOpen(false)}
          >
            <div
              className="w-full max-w-md bg-slate-900 rounded-3xl border border-white/12 p-5 flex flex-col gap-3.5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/8 pb-2.5">
                <span className="text-sm font-bold text-slate-100">Tạo Sự kiện / Chuyến đi</span>
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center border-none cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Tên Sự kiện / Chuyến đi
                </label>
                <input
                  type="text"
                  value={evName}
                  onChange={(e) => setEvName(e.target.value)}
                  placeholder="VD: Du lịch Đà Lạt, Tết 2026..."
                  className="input-ios"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Ngân sách dự kiến (Tùy chọn - VNĐ)
                </label>
                <input
                  type="text"
                  value={evBudgetStr}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setEvBudgetStr(
                      val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : ''
                    );
                  }}
                  placeholder="Ví dụ: 10.000.000"
                  className="input-ios"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Ngày bắt đầu
                </label>
                <input
                  type="date"
                  value={evStartDate}
                  onChange={(e) => setEvStartDate(e.target.value)}
                  className="input-ios"
                />
              </div>

              <button
                type="button"
                onClick={handleCreateEvent}
                className="touch-btn py-3 rounded-2xl bg-emerald-500 text-slate-950 font-black text-sm cursor-pointer border-none mt-1"
              >
                Tạo sự kiện
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-32 px-4 pt-3 flex flex-col gap-5">
      {notice && (
        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <Check size={16} strokeWidth={3} />
          <span>{notice}</span>
        </div>
      )}

      {/* NHÓM 1: TÀI CHÍNH & QUẢN LÝ */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Tài chính & Quản lý
        </h3>

        <div className="bg-slate-900/90 rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/5">
          {/* Mục 1: Sổ Nợ (Theo dõi Vay & Cho vay chuẩn MISA) */}
          <button
            type="button"
            onClick={() => setSubView('DEBTS')}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <HandCoins size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>Sổ Nợ (Quản lý Vay & Cho vay)</span>
                  {(debtSummaryByContact.totalReceivable > 0 ||
                    debtSummaryByContact.totalPayable > 0) && (
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                      Đang có dư nợ
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Theo dõi Cần thu ({formatVND(debtSummaryByContact.totalReceivable)}) & Phải trả ({formatVND(debtSummaryByContact.totalPayable)})
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-500 shrink-0" />
          </button>

          {/* Mục 2: Hạn mức chi tiêu */}
          <button
            type="button"
            onClick={() => setSubView('BUDGETS')}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                <Target size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>Hạn mức chi tiêu (Ngân sách)</span>
                  {budgetsCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-md bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                      {budgetsCount} mục
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Thiết lập hạn mức 50/30/20 hoặc từng mục & cảnh báo vượt chi
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-500 shrink-0" />
          </button>

          {/* Mục 3: Hạng mục thu/chi */}
          <button
            type="button"
            onClick={() => setSubView('CATEGORIES')}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                <Tags size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">Hạng mục thu / chi</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {categories.length} danh mục cài đặt sẵn & quick tags
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-500 shrink-0" />
          </button>

          {/* Mục 4: Ghi chép định kỳ */}
          <button
            type="button"
            onClick={() => setSubView('RECURRING')}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                <Repeat size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>Ghi chép định kỳ</span>
                  {recurringList.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                      {recurringList.length} mẫu
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Tự động ghi tiền nhà, tiền mạng, lương hàng tháng
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-500 shrink-0" />
          </button>

          {/* Mục 5: Sự kiện & Chuyến đi */}
          <button
            type="button"
            onClick={() => setSubView('EVENTS')}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <Plane size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>Sự kiện & Chuyến đi</span>
                  {eventsList.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      {eventsList.length} sự kiện
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Gom nhóm chi phí du lịch, lễ Tết, đám cưới riêng biệt
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-500 shrink-0" />
          </button>
        </div>
      </section>

      {/* NHÓM 2: GIAO DIỆN & TRẢI NGHIỆM */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Giao diện & Trải nghiệm
        </h3>

        <div className="bg-slate-900/90 rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/5">
          <div className="p-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                <Smartphone size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">
                  Màn hình mở app đầu tiên
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Chọn tab hiển thị mặc định mỗi khi khởi động ứng dụng
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1 pt-1">
              {[
                { id: 'editor', name: 'Ghi GD' },
                { id: 'overview', name: 'Tổng quan' },
                { id: 'wallets', name: 'Tài khoản' },
                { id: 'analytics', name: 'Báo cáo' },
                { id: 'more', name: 'Khác' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    onChangeDefaultTab(tab.id as AppStartupTab);
                    showToast(`Đã đặt "${tab.name}" làm màn hình khởi động!`);
                  }}
                  className={`touch-btn py-2 px-1 rounded-xl text-[11px] font-bold cursor-pointer border transition-all text-center ${
                    defaultInitialTab === tab.id
                      ? 'bg-sky-500/25 border-sky-400 text-sky-300 shadow-sm'
                      : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800 text-amber-400 flex items-center justify-center shrink-0">
                <Moon size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">
                  Chế độ giao diện (Tối / Sáng)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Chuẩn AMOLED Dark Mode tiết kiệm pin & bảo vệ mắt
                </div>
              </div>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-slate-800 border border-white/10 text-xs font-semibold text-slate-300">
              Giao diện tối
            </div>
          </div>
        </div>
      </section>

      {/* NHÓM 3: DỮ LIỆU & SAO LƯU */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Dữ liệu & Sao lưu
        </h3>

        <div className="bg-slate-900/90 rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/5">
          <button
            type="button"
            onClick={onOpenSettings}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <Cloud size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <span>Đồng bộ Google Drive 2 chiều</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    Máy tính & Điện thoại
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Tự động đồng bộ & hợp nhất dữ liệu liên thông qua Drive
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-500 shrink-0" />
          </button>

          <button
            type="button"
            onClick={handleBackupJSON}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                <ShieldCheck size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">
                  Xuất file sao lưu Offline (JSON)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Tải file JSON toàn bộ dữ liệu về thiết bị
                </div>
              </div>
            </div>
            <Download size={16} className="text-sky-400 shrink-0" />
          </button>

          <label className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors">
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreJSON}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <Upload size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">
                  Khôi phục dữ liệu từ JSON
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Nhập file sao lưu để phục hồi toàn bộ giao dịch
                </div>
              </div>
            </div>
            <Upload size={16} className="text-amber-400 shrink-0" />
          </label>

          <button
            type="button"
            onClick={handleExportExcel}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0">
                <FileSpreadsheet size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">
                  Xuất báo cáo Excel (.xlsx)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Bảng tính 3 sheets chi tiết giao dịch & tài khoản
                </div>
              </div>
            </div>
            <Download size={16} className="text-teal-400 shrink-0" />
          </button>
        </div>
      </section>

      <div className="pt-2 text-center text-slate-500 text-[11px] flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5 font-semibold text-slate-400">
          <Sparkles size={13} className="text-emerald-400" />
          <span>Sổ Thu Chi PWA V3.0 • Local-First • 0đ Vận Hành</span>
        </div>
        <div>100% Offline • Dữ liệu lưu trữ bền vững trên thiết bị của bạn</div>
      </div>
    </div>
  );
};

export default MoreTab;
