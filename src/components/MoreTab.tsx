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
  deleteTransaction,
  computeNextRunDate,
  processDueRecurringTransactions
} from '../services/transactionService';
import { formatVND, getCurrentDate, getCurrentTime, formatFriendlyDate } from '../utils/formatters';
import { generateUUID } from '../utils/uuid';
import { CategoryManagerScreen } from './CategoryManagerScreen';
import { DatePicker } from './ui/DatePicker';
import { CustomSelect } from './ui/CustomSelect';
import type { AppStartupTab, RecurringFrequency, Transaction } from '../types';
import {
  Target,
  Tags,
  Repeat,
  Plane,
  HandCoins,
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
  CheckCircle2,
  Edit2,
  ArrowLeft
} from 'lucide-react';
import { MotorcycleIcon } from './MotorcycleIcon';
import { GrabTripModal } from './GrabTripModal';

interface MoreTabProps {
  onOpenSettings: () => void;
  onEditTransaction?: (tx: Transaction) => void;
  defaultInitialTab: AppStartupTab;
  onChangeDefaultTab: (tab: AppStartupTab) => void;
  resetSignal?: number;
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
  onEditTransaction,
  defaultInitialTab,
  onChangeDefaultTab,
  resetSignal
}) => {
  const [subView, setSubView] = useState<SubViewType>('MAIN');
  const [notice, setNotice] = useState<string | null>(null);
  const [isGrabModalOpen, setIsGrabModalOpen] = useState(false);

  // Lắng nghe tín hiệu từ menu điều hướng để trở về menu Khác chính
  React.useEffect(() => {
    if (resetSignal !== undefined && resetSignal > 0) {
      setSubView('MAIN');
      setIsGrabModalOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [resetSignal]);

  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const budgetsCount = useLiveQuery(() => db.budgets.count()) || 0;
  const recurringList = useLiveQuery(() => db.recurringTransactions.toArray()) || [];
  const eventsList = useLiveQuery(() => db.events.toArray()) || [];
  const savedContactsSetting = useLiveQuery(() => db.settings.get('saved_debt_contacts'));

  // States cho Form phẳng tạo Ghi chép định kỳ (không dùng Popup)
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);
  const [recType, setRecType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [recAmountStr, setRecAmountStr] = useState('');
  const [recCategoryId, setRecCategoryId] = useState('');
  const [recWalletId, setRecWalletId] = useState('');
  const [recFrequency, setRecFrequency] = useState<RecurringFrequency>('MONTHLY');
  const [recStartDate, setRecStartDate] = useState(getCurrentDate());
  const [recNote, setRecNote] = useState('');

  // States cho Form phẳng tạo Sự kiện / Chuyến đi (không dùng Popup)
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [evName, setEvName] = useState('');
  const [evBudgetStr, setEvBudgetStr] = useState('');
  const [evStartDate, setEvStartDate] = useState(getCurrentDate());

  // States cho Sổ Nợ phẳng: Thêm / Sửa tên / Xóa người nợ & Ghi vay/trả nợ trực tiếp
  const [isAddingDebtTx, setIsAddingDebtTx] = useState(false);
  const [newDebtContact, setNewDebtContact] = useState('');
  const [newDebtType, setNewDebtType] = useState<
    'LEND' | 'BORROW' | 'COLLECT_DEBT' | 'PAY_DEBT'
  >('LEND');
  const [newDebtAmountStr, setNewDebtAmountStr] = useState('');
  const [newDebtWalletId, setNewDebtWalletId] = useState('');
  const [newDebtNote, setNewDebtNote] = useState('');

  const [settleInline, setSettleInline] = useState<{
    contactName: string;
    mode: 'COLLECT_DEBT' | 'PAY_DEBT';
  } | null>(null);
  const [settleAmountStr, setSettleAmountStr] = useState('');
  const [settleWalletId, setSettleWalletId] = useState('');

  const [renamingContact, setRenamingContact] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedContactHistory, setExpandedContactHistory] = useState<string | null>(null);

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
        txs: Transaction[];
      }
    >();

    // Nạp cả những người đã lưu trong danh bạ nợ
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

    transactions.forEach((tx) => {
      if (
        tx.type !== 'LEND' &&
        tx.type !== 'BORROW' &&
        tx.type !== 'COLLECT_DEBT' &&
        tx.type !== 'PAY_DEBT'
      ) {
        return;
      }
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

    const contacts = Array.from(map.values())
      .filter((c) => c.txs.length > 0 || savedNames.some((s) => s.toLowerCase() === c.contactName.toLowerCase()))
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

    return {
      contacts,
      totalReceivable,
      totalPayable
    };
  }, [transactions, savedContactsSetting?.value]);

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

  // SUBVIEW 2: HẠNG MỤC THU/CHI (THÊM / SỬA / XÓA PHẲNG)
  if (subView === 'CATEGORIES') {
    return <CategoryManagerScreen isOpen={true} onClose={() => setSubView('MAIN')} />;
  }

  // SUBVIEW 3: SỔ NỢ PHẲNG (THÊM / SỬA / XÓA NGƯỜI NỢ & KHOẢN VAY NỢ)
  if (subView === 'DEBTS') {
    const handleCreateDebtRecord = async () => {
      const person = newDebtContact.trim();
      if (!person) {
        alert('Vui lòng nhập tên người vay / chủ nợ');
        return;
      }
      const amount = Number(newDebtAmountStr.replace(/\D/g, ''));
      if (!amount || amount <= 0) {
        alert('Vui lòng nhập số tiền lớn hơn 0');
        return;
      }
      const walletId = newDebtWalletId || wallets[0]?.id;
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
        (c) => c.type === 'DEBT' && c.name.trim().toLowerCase() === targetNameMap[newDebtType]
      );

      await createTransaction({
        walletId,
        categoryId: debtCat?.id,
        type: newDebtType,
        amount,
        contactName: person,
        date: getCurrentDate(),
        time: getCurrentTime(),
        note: newDebtNote.trim() || `${debtCat?.name || 'Vay nợ'} - ${person}`
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

      setIsAddingDebtTx(false);
      setNewDebtContact('');
      setNewDebtAmountStr('');
      setNewDebtNote('');
      showToast(`Đã lưu khoản vay/nợ của "${person}" thành công!`);
    };

    const handleConfirmSettleInline = async () => {
      if (!settleInline) return;
      const amount = Number(settleAmountStr.replace(/\D/g, ''));
      if (!amount || amount <= 0) {
        alert('Vui lòng nhập số tiền hợp lệ lớn hơn 0');
        return;
      }
      const walletId = settleWalletId || wallets[0]?.id;
      if (!walletId) return;

      const targetCatName = settleInline.mode === 'COLLECT_DEBT' ? 'thu nợ' : 'trả nợ';
      const debtCat = categories.find(
        (c) => c.type === 'DEBT' && c.name.trim().toLowerCase() === targetCatName
      );

      await createTransaction({
        walletId,
        categoryId: debtCat?.id,
        type: settleInline.mode,
        amount,
        contactName: settleInline.contactName,
        date: getCurrentDate(),
        time: getCurrentTime(),
        note:
          settleInline.mode === 'COLLECT_DEBT'
            ? `Thu nợ từ ${settleInline.contactName}`
            : `Trả nợ cho ${settleInline.contactName}`
      });

      setSettleInline(null);
      showToast('Đã ghi nhận thu/trả nợ và cập nhật số dư ví!');
    };

    const handleRenameContact = async (oldName: string) => {
      const nextName = renameValue.trim();
      if (!nextName || nextName === oldName) {
        setRenamingContact(null);
        return;
      }
      const matching = transactions.filter(
        (t) =>
          (t.contactName?.trim() || (t.note?.trim() ? t.note.trim() : 'Chưa ghi tên')).toLowerCase() ===
          oldName.toLowerCase()
      );
      const now = new Date().toISOString();
      await db.transaction('rw', db.transactions, async () => {
        for (const tx of matching) {
          await db.transactions.update(tx.id, {
            contactName: nextName,
            updatedAt: now
          });
        }
      });

      const currentSaved = Array.isArray(savedContactsSetting?.value)
        ? (savedContactsSetting.value as string[])
        : [];
      const nextSaved = currentSaved.map((s) =>
        s.toLowerCase() === oldName.toLowerCase() ? nextName : s
      );
      await db.settings.put({ key: 'saved_debt_contacts', value: nextSaved });

      setRenamingContact(null);
      showToast(`Đã đổi tên "${oldName}" thành "${nextName}"!`);
    };

    const handleDeleteContactAndRecords = async (
      contactName: string,
      txsOfContact: Transaction[]
    ) => {
      const msg =
        txsOfContact.length > 0
          ? `Xóa người nợ "${contactName}" và hoàn tác toàn bộ ${txsOfContact.length} giao dịch vay/nợ của người này?`
          : `Xóa "${contactName}" khỏi danh sách sổ nợ?`;

      if (!window.confirm(msg)) return;

      for (const tx of txsOfContact) {
        await deleteTransaction(tx.id);
      }

      const currentSaved = Array.isArray(savedContactsSetting?.value)
        ? (savedContactsSetting.value as string[])
        : [];
      await db.settings.put({
        key: 'saved_debt_contacts',
        value: currentSaved.filter((s) => s.toLowerCase() !== contactName.toLowerCase())
      });

      showToast(`Đã xóa "${contactName}" khỏi Sổ Nợ!`);
    };

    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4 animate-fade-in">
        <div className="flex items-center justify-between border-b border-white/8 pb-2.5 gap-2">
          <div className="w-9 shrink-0 flex items-center justify-start">
            <button
              type="button"
              onClick={() => setSubView('MAIN')}
              className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              title="Quay lại"
            >
              <ArrowLeft size={18} />
            </button>
          </div>
          <span className="text-xs font-bold text-slate-100 uppercase text-center flex-1 truncate mx-1">
            Sổ Nợ (Quản lý Người Nợ)
          </span>
          <button
            type="button"
            onClick={() => {
              setNewDebtWalletId(wallets[0]?.id || '');
              setIsAddingDebtTx(!isAddingDebtTx);
            }}
            className="text-xs font-extrabold text-slate-950 flex items-center gap-1 cursor-pointer bg-amber-400 px-3 py-1.5 rounded-xl border-none shrink-0"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>Ghi nợ mới</span>
          </button>
        </div>

        {notice && (
          <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <Check size={16} />
            <span>{notice}</span>
          </div>
        )}

        {/* Khung phẳng: Thêm nhanh người nợ / khoản vay nợ mới (không dùng Popup) */}
        {isAddingDebtTx && (
          <div className="p-4 rounded-3xl bg-slate-900 border border-amber-500/40 flex flex-col gap-3 shadow-xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-white/8 pb-2">
              <span className="text-xs font-extrabold text-amber-400 uppercase">
                + Ghi khoản Vay / Cho vay / Thu / Trả nợ
              </span>
              <button
                type="button"
                onClick={() => setIsAddingDebtTx(false)}
                className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center border-none cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'LEND', label: '🤝 Cho vay (Đưa tiền đi)' },
                { id: 'BORROW', label: '🧾 Đi vay (Nhận tiền về)' },
                { id: 'COLLECT_DEBT', label: '🐷 Thu nợ (Đòi lại tiền)' },
                { id: 'PAY_DEBT', label: '💳 Trả nợ (Hoàn trả tiền)' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setNewDebtType(t.id as any)}
                  className={`h-10 px-3 rounded-xl text-xs font-bold border cursor-pointer whitespace-nowrap truncate ${
                    newDebtType === t.id
                      ? 'bg-amber-500 text-slate-950 border-amber-300'
                      : 'bg-slate-800 border-white/5 text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Tên người vay / chủ nợ *
                </label>
                <input
                  type="text"
                  value={newDebtContact}
                  onChange={(e) => setNewDebtContact(e.target.value)}
                  placeholder="VD: Anh Nam, Chị Lan..."
                  className="input-ios"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Số tiền (VNĐ) *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={newDebtAmountStr}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setNewDebtAmountStr(
                      val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : ''
                    );
                  }}
                  placeholder="0"
                  className="input-ios font-extrabold text-amber-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Tài khoản / Ví
                </label>
                <CustomSelect
                  value={newDebtWalletId || (wallets[0]?.id ?? '')}
                  onChange={setNewDebtWalletId}
                  options={wallets.map((w) => ({
                    value: w.id,
                    label: `${w.name} (${formatVND(w.balance)})`
                  }))}
                  triggerClassName="bg-slate-800"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Ghi chú (tùy chọn)
                </label>
                <input
                  type="text"
                  value={newDebtNote}
                  onChange={(e) => setNewDebtNote(e.target.value)}
                  placeholder="Lý do vay, hẹn ngày trả..."
                  className="input-ios"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingDebtTx(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold border-none cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCreateDebtRecord}
                className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black border-none cursor-pointer"
              >
                Lưu vào Sổ Nợ
              </button>
            </div>
          </div>
        )}

        {/* Tổng quan Cần Thu & Phải Trả */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25">
            <div className="text-[11px] font-bold text-amber-300 uppercase">
              Cần thu về (Cho vay)
            </div>
            <div className="font-heading text-xl font-black text-amber-400 mt-1">
              {formatVND(debtSummaryByContact.totalReceivable)}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/25">
            <div className="text-[11px] font-bold text-purple-300 uppercase">
              Phải trả (Đi vay)
            </div>
            <div className="font-heading text-xl font-black text-purple-400 mt-1">
              {formatVND(debtSummaryByContact.totalPayable)}
            </div>
          </div>
        </div>

        {/* Danh sách từng người nợ kèm nút Sửa tên, Xóa, Xem lịch sử & Tất toán phẳng */}
        {debtSummaryByContact.contacts.length === 0 ? (
          <div className="py-12 px-5 text-center text-slate-400 bg-slate-900/50 rounded-3xl border border-white/6">
            <HandCoins size={36} className="mx-auto mb-2 text-amber-400/70" />
            <div className="text-sm font-bold text-slate-200">Chưa có khoản vay nợ nào</div>
            <p className="text-xs text-slate-400 mt-1">
              Bấm nút <b>"+ Ghi nợ mới"</b> ở góc trên để thêm người vay hoặc chủ nợ.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {debtSummaryByContact.contacts.map((item) => {
              const isRenaming = renamingContact === item.contactName;
              const isSettlingThis = settleInline?.contactName === item.contactName;
              const isHistoryOpen = expandedContactHistory === item.contactName;

              return (
                <div
                  key={item.contactName}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-white/8 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold shrink-0">
                        <UserCheck size={18} />
                      </div>

                      {isRenaming ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="input-ios flex-1 py-1 px-2.5 text-xs bg-slate-800 border border-sky-400 rounded-xl"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameContact(item.contactName)}
                            className="px-2.5 py-1.5 rounded-lg bg-sky-500 text-slate-950 font-bold text-xs border-none cursor-pointer"
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingContact(null)}
                            className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs border-none cursor-pointer"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-100 truncate">
                            {item.contactName}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedContactHistory(
                                isHistoryOpen ? null : item.contactName
                              )
                            }
                            className="text-[11px] text-sky-400 hover:underline bg-transparent border-none p-0 cursor-pointer"
                          >
                            {item.txs.length} giao dịch (Bấm để xem / sửa / xóa từng khoản)
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {item.receivable === 0 && item.payable === 0 && item.txs.length > 0 && (
                        <span className="px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle2 size={12} /> Đã tất toán
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setRenamingContact(item.contactName);
                          setRenameValue(item.contactName);
                        }}
                        className="touch-btn p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-sky-400 border-none cursor-pointer"
                        title="Đổi tên người nợ"
                      >
                        <Edit2 size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteContactAndRecords(item.contactName, item.txs)
                        }
                        className="touch-btn p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-none cursor-pointer"
                        title="Xóa người nợ"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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

                  {/* Nút Thu nợ / Trả nợ mở rộng phẳng ngay bên trong thẻ */}
                  {(item.receivable > 0 || item.payable > 0) && (
                    <div className="flex items-center gap-2">
                      {item.receivable > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSettleInline({
                              contactName: item.contactName,
                              mode: 'COLLECT_DEBT'
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
                            setSettleInline({
                              contactName: item.contactName,
                              mode: 'PAY_DEBT'
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

                  {/* Khung Thu nợ / Trả nợ phẳng (Inline) */}
                  {isSettlingThis && settleInline && (
                    <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/30 flex flex-col gap-2.5 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400">
                          {settleInline.mode === 'COLLECT_DEBT'
                            ? `Thu nợ từ ${item.contactName}`
                            : `Trả nợ cho ${item.contactName}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSettleInline(null)}
                          className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={settleAmountStr}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setSettleAmountStr(
                              val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : ''
                            );
                          }}
                          placeholder="Số tiền..."
                          className="input-ios text-sm font-extrabold text-emerald-400"
                        />

                        <CustomSelect
                          value={settleWalletId || (wallets[0]?.id ?? '')}
                          onChange={setSettleWalletId}
                          options={wallets.map((w) => ({
                            value: w.id,
                            label: `${w.name} (${formatVND(w.balance)})`
                          }))}
                          triggerClassName="text-xs bg-slate-800"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleConfirmSettleInline}
                        className="touch-btn py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs cursor-pointer border-none"
                      >
                        Xác nhận ghi giao dịch
                      </button>
                    </div>
                  )}

                  {/* Danh sách chi tiết từng giao dịch vay/nợ của người này để Sửa / Xóa */}
                  {isHistoryOpen && item.txs.length > 0 && (
                    <div className="pt-2 border-t border-white/8 flex flex-col gap-1.5 animate-fade-in">
                      {item.txs.map((tx) => (
                        <div
                          key={tx.id}
                          className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-200">
                              {tx.type === 'LEND'
                                ? 'Cho vay'
                                : tx.type === 'BORROW'
                                ? 'Đi vay'
                                : tx.type === 'COLLECT_DEBT'
                                ? 'Thu nợ'
                                : 'Trả nợ'}{' '}
                              • {formatVND(tx.amount)}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {tx.date} {tx.note ? `• ${tx.note}` : ''}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {onEditTransaction && (
                              <button
                                type="button"
                                onClick={() => onEditTransaction(tx)}
                                className="p-1.5 rounded-lg bg-slate-800 text-sky-400 border-none cursor-pointer"
                                title="Sửa khoản nợ này"
                              >
                                <Edit2 size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                if (window.confirm('Xóa giao dịch nợ này và hoàn tác số dư ví?')) {
                                  await deleteTransaction(tx.id);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400 border-none cursor-pointer"
                              title="Xóa khoản nợ này"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
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
    );
  }

  // SUBVIEW 4: GHI CHÉP ĐỊNH KỲ PHẲNG
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
      setIsAddingRecurring(false);
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
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4 animate-fade-in">
        <div className="flex items-center justify-between border-b border-white/8 pb-2.5 gap-2">
          <div className="w-9 shrink-0 flex items-center justify-start">
            <button
              type="button"
              onClick={() => setSubView('MAIN')}
              className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              title="Quay lại"
            >
              <ArrowLeft size={18} />
            </button>
          </div>
          <span className="text-xs font-bold text-slate-100 uppercase text-center flex-1 truncate mx-1">
            Ghi chép định kỳ
          </span>
          <button
            type="button"
            onClick={() => {
              setRecWalletId(wallets[0]?.id || '');
              setRecCategoryId(
                categories.find((c) => c.type === 'EXPENSE' && !!c.parentId)?.id || ''
              );
              setIsAddingRecurring(!isAddingRecurring);
            }}
            className="text-xs font-bold text-emerald-400 flex items-center gap-1 cursor-pointer bg-emerald-500/15 px-2.5 py-1.5 rounded-xl border border-emerald-500/30 shrink-0"
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

        {/* Form phẳng thêm ghi chép định kỳ */}
        {isAddingRecurring && (
          <div className="w-full bg-slate-900 rounded-3xl border border-sky-500/30 p-5 flex flex-col gap-3.5 shadow-xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-white/8 pb-2.5">
              <span className="text-sm font-bold text-slate-100">Thêm ghi chép định kỳ</span>
              <button
                type="button"
                onClick={() => setIsAddingRecurring(false)}
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
                inputMode="numeric"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Chu kỳ lặp lại
                </label>
                <CustomSelect
                  value={recFrequency}
                  onChange={(val) => setRecFrequency(val as RecurringFrequency)}
                  options={[
                    { value: 'DAILY', label: 'Hàng ngày' },
                    { value: 'WEEKLY', label: 'Hàng tuần' },
                    { value: 'MONTHLY', label: 'Hàng tháng' },
                    { value: 'YEARLY', label: 'Hàng năm' }
                  ]}
                  triggerClassName="bg-slate-800"
                />
              </div>

              <div>
                <DatePicker
                  value={recStartDate}
                  onChange={setRecStartDate}
                  label="Ngày chạy tiếp theo"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Hạng mục
                </label>
                <CustomSelect
                  value={recCategoryId}
                  onChange={setRecCategoryId}
                  options={categories
                    .filter((c) =>
                      recType === 'EXPENSE'
                        ? c.type === 'EXPENSE' && !!c.parentId
                        : c.type === 'INCOME'
                    )
                    .map((c) => ({
                      value: c.id,
                      label: c.name
                    }))}
                  triggerClassName="bg-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Tài khoản / Ví
                </label>
                <CustomSelect
                  value={recWalletId || (wallets[0]?.id ?? '')}
                  onChange={setRecWalletId}
                  options={wallets.map((w) => ({
                    value: w.id,
                    label: `${w.name} (${formatVND(w.balance)})`
                  }))}
                  triggerClassName="bg-slate-800"
                />
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
        )}

        {recurringList.length === 0 && !isAddingRecurring ? (
          <div className="py-12 px-5 text-center text-slate-400 bg-slate-900/50 rounded-3xl border border-white/6">
            <Repeat size={36} className="mx-auto mb-2 text-sky-400/70" />
            <div className="text-sm font-bold text-slate-200">Chưa có mẫu ghi chép định kỳ</div>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Tự động ghi tiền thuê nhà, tiền điện, Internet hoặc lương hàng tháng đúng hạn.
            </p>
            <button
              type="button"
              onClick={() => {
                setRecWalletId(wallets[0]?.id || '');
                setRecCategoryId(
                  categories.find((c) => c.type === 'EXPENSE' && !!c.parentId)?.id || ''
                );
                setIsAddingRecurring(true);
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
      </div>
    );
  }

  // SUBVIEW 5: SỰ KIỆN & CHUYẾN ĐI PHẲNG
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
      setIsAddingEvent(false);
      setEvName('');
      setEvBudgetStr('');
      showToast('Đã tạo sự kiện / chuyến đi mới!');
    };

    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4 animate-fade-in">
        <div className="flex items-center justify-between border-b border-white/8 pb-2.5 gap-2">
          <div className="w-9 shrink-0 flex items-center justify-start">
            <button
              type="button"
              onClick={() => setSubView('MAIN')}
              className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              title="Quay lại"
            >
              <ArrowLeft size={18} />
            </button>
          </div>
          <span className="text-xs font-bold text-slate-100 uppercase text-center flex-1 truncate mx-1">
            Sự kiện & Chuyến đi
          </span>
          <button
            type="button"
            onClick={() => setIsAddingEvent(!isAddingEvent)}
            className="text-xs font-bold text-emerald-400 flex items-center gap-1 cursor-pointer bg-emerald-500/15 px-2.5 py-1.5 rounded-xl border border-emerald-500/30 shrink-0"
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

        {isAddingEvent && (
          <div className="w-full bg-slate-900 rounded-3xl border border-emerald-500/30 p-5 flex flex-col gap-3.5 shadow-xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-white/8 pb-2.5">
              <span className="text-sm font-bold text-slate-100">Tạo Sự kiện / Chuyến đi</span>
              <button
                type="button"
                onClick={() => setIsAddingEvent(false)}
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
                placeholder="VD: Du lịch Đà Lạt, Tết Nguyên Đán..."
                className="input-ios"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Ngân sách dự kiến (Tùy chọn - VNĐ)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
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
                <DatePicker
                  value={evStartDate}
                  onChange={setEvStartDate}
                  label="Ngày bắt đầu"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreateEvent}
              className="touch-btn py-3 rounded-2xl bg-emerald-500 text-slate-950 font-black text-sm cursor-pointer border-none mt-1"
            >
              Tạo sự kiện
            </button>
          </div>
        )}

        {eventsList.length === 0 && !isAddingEvent ? (
          <div className="py-12 px-5 text-center text-slate-400 bg-slate-900/50 rounded-3xl border border-white/6">
            <Plane size={36} className="mx-auto mb-2 text-emerald-400/70" />
            <div className="text-sm font-bold text-slate-200">
              Chưa có Sự kiện / Chuyến đi nào
            </div>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Tạo sự kiện để gom nhóm toàn bộ chi phí của chuyến đi.
            </p>
            <button
              type="button"
              onClick={() => setIsAddingEvent(true)}
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
                      Ngân sách dự kiến:{' '}
                      <b className="text-slate-200">{formatVND(ev.budgetAmount)}</b> (
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
          Tài chính & Quản lý (Thêm / Sửa / Xóa)
        </h3>

        <div className="bg-slate-900/90 rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/5">
          {/* Mục 1: Sổ Nợ & Người nợ */}
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
                  <span>Sổ Nợ & Quản lý Người Nợ</span>
                  {(debtSummaryByContact.totalReceivable > 0 ||
                    debtSummaryByContact.totalPayable > 0) && (
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                      Đang có dư nợ
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Thêm/sửa/xóa người nợ • Cần thu ({formatVND(debtSummaryByContact.totalReceivable)}) & Phải trả ({formatVND(debtSummaryByContact.totalPayable)})
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-500 shrink-0" />
          </button>

          {/* Mục 2: Hạng mục thu/chi */}
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
                <div className="text-xs font-bold text-slate-100">
                  Hạng mục Thu / Chi / Vay nợ
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Thêm, sửa, xóa {categories.length} hạng mục & gợi ý ghi chú nhanh
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-500 shrink-0" />
          </button>

          {/* Mục 3: Hạn mức chi tiêu */}
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

          {/* Mục 6: Tiện ích Tài xế Chạy Grab */}
          <button
            type="button"
            onClick={() => setIsGrabModalOpen(true)}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors bg-emerald-500/5"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <MotorcycleIcon size={20} strokeWidth={2.2} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>Nghiệp vụ Tài xế GrabBike</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    Tự động
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Ghi cuốc xe máy, tự động trừ ví tín dụng, nạp & rút ví Grab
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

            <div className="pt-1">
              <CustomSelect
                value={defaultInitialTab}
                onChange={(val) => {
                  onChangeDefaultTab(val as AppStartupTab);
                  showToast('Đã lưu màn hình khởi động mặc định!');
                }}
                options={[
                  { value: 'overview', label: '📊 Tổng quan (Sổ giao dịch)' },
                  { value: 'editor', label: '➕ Ghi giao dịch mới' },
                  { value: 'wallets', label: '🏦 Tài khoản & Ví tiền' },
                  { value: 'analytics', label: '📈 Báo cáo phân tích' },
                  { value: 'more', label: '⚙️ Tiện ích khác' }
                ]}
                triggerClassName="text-xs font-bold bg-slate-800"
              />
            </div>
          </div>
        </div>
      </section>

      {/* NHÓM 3: ĐỒNG BỘ SUPABASE & SAO LƯU */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Dữ liệu & Đồng bộ Đám mây
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
                  <span>Đồng bộ đám mây Supabase 2 chiều</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    PC & Điện thoại
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Kết nối tài khoản / Mã đồng bộ Supabase siêu tốc, không lo mất dữ liệu
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
          <span>Sổ Thu Chi PWA V3.0 • Local-First • Supabase Cloud</span>
        </div>
        <div>100% Offline • Dữ liệu lưu trữ bền vững trên thiết bị của bạn</div>
      </div>

      {/* MODAL GHI CUỐC GRAB */}
      <GrabTripModal
        isOpen={isGrabModalOpen}
        onClose={() => setIsGrabModalOpen(false)}
        onSuccess={(msg) => {
          setNotice(msg);
          setTimeout(() => setNotice(null), 3500);
        }}
      />
    </div>
  );
};

export default MoreTab;
