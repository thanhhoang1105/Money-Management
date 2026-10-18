// src/components/WalletsTab.tsx
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ensureDefaultWallets } from '../db/seed';
import { transferFunds, adjustWalletBalance } from '../services/transactionService';
import {
  exportTransactionsToExcel,
  exportFullBackupJSON,
  downloadOrShareFile,
  restoreBackupData
} from '../services/backupService';
import type { Wallet, WalletType } from '../types';
import { CategoryIcon } from './CategoryIcon';
import { formatVND, getCurrentDate, getCurrentTime } from '../utils/formatters';
import {
  Plus,
  Edit2,
  Trash2,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  X,
  ArrowRightLeft,
  Wallet as WalletIcon,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

const WALLET_ICONS = [
  'Wallet',
  'Landmark',
  'Smartphone',
  'CreditCard',
  'Coins',
  'PiggyBank',
  'Vault',
  'DollarSign',
  'Briefcase'
];

const WALLET_COLORS = [
  '#10B981', // Emerald Green
  '#3B82F6', // Blue
  '#D946EF', // Fuchsia / Purple
  '#F59E0B', // Amber / Orange
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#06B6D4', // Cyan
  '#64748B'  // Slate / Gray
];

export const WalletsTab: React.FC = () => {
  // Lấy danh sách ví bằng .toArray() để lọc bằng JS (tránh lỗi IDBKeyRange với kiểu boolean)
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];

  // Đảm bảo có sẵn 2 ví mặc định nếu DB chưa có ví nào
  useEffect(() => {
    ensureDefaultWallets();
  }, []);

  // Tính tổng tài sản khả dụng (Lọc bằng JS, loại bỏ ví isExcludedFromTotal)
  const totalBalance = wallets
    .filter((w) => !w.isExcludedFromTotal)
    .reduce((sum, w) => sum + w.balance, 0);

  // States cho Modal Thêm / Sửa Ví
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<WalletType>('BANK');
  const [balanceStr, setBalanceStr] = useState('');
  const [icon, setIcon] = useState('Landmark');
  const [color, setColor] = useState('#3B82F6');
  const [isExcluded, setIsExcluded] = useState(false);
  const [autoCreateAdjustmentTx, setAutoCreateAdjustmentTx] = useState(true);

  // States cho Modal Chuyển Tiền Nội Bộ (Transfer)
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmountStr, setTransferAmountStr] = useState('');
  const [transferDate, setTransferDate] = useState(getCurrentDate());
  const [transferTime, setTransferTime] = useState(getCurrentTime());
  const [transferNote, setTransferNote] = useState('');
  const [transferError, setTransferError] = useState('');

  // Status Toast Message
  const [statusMsg, setStatusMsg] = useState('');

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 4000);
  };

  // Mở modal Thêm ví mới
  const openAddModal = () => {
    setEditingWallet(null);
    setName('');
    setType('BANK');
    setBalanceStr('0');
    setIcon('Landmark');
    setColor('#3B82F6');
    setIsExcluded(false);
    setAutoCreateAdjustmentTx(true);
    setIsWalletModalOpen(true);
  };

  // Mở modal Chỉnh sửa ví (kèm tính năng Điều chỉnh số dư thực tế)
  const openEditModal = (w: Wallet) => {
    setEditingWallet(w);
    setName(w.name);
    setType(w.type);
    setBalanceStr(w.balance.toString());
    setIcon(w.icon || 'Wallet');
    setColor(w.color || '#3B82F6');
    setIsExcluded(w.isExcludedFromTotal);
    setAutoCreateAdjustmentTx(true);
    setIsWalletModalOpen(true);
  };

  // Mở modal Chuyển tiền nội bộ (có thể chỉ định trước ví gửi)
  const openTransferModal = (defaultFromId?: string) => {
    const fromId = defaultFromId || wallets[0]?.id || '';
    const otherWallet = wallets.find((w) => w.id !== fromId);
    setTransferFromId(fromId);
    setTransferToId(otherWallet ? otherWallet.id : '');
    setTransferAmountStr('');
    setTransferDate(getCurrentDate());
    setTransferTime(getCurrentTime());
    setTransferNote('');
    setTransferError('');
    setIsTransferModalOpen(true);
  };

  // Tính chênh lệch số dư khi chỉnh sửa ví
  const parsedTargetBalance = Number(balanceStr.replace(/[^0-9-]/g, '')) || 0;
  const balanceDiff = editingWallet ? parsedTargetBalance - editingWallet.balance : 0;

  // Lưu ví (Thêm mới hoặc Cập nhật)
  const handleSaveWallet = async () => {
    if (!name.trim()) {
      alert('Vui lòng nhập tên ví!');
      return;
    }

    const targetBalance = parsedTargetBalance;
    const now = new Date().toISOString();

    if (editingWallet) {
      if (balanceDiff !== 0) {
        await adjustWalletBalance({
          walletId: editingWallet.id,
          newBalance: targetBalance,
          autoCreateAdjustmentTx
        });
      }

      await db.wallets.update(editingWallet.id, {
        name: name.trim(),
        type,
        icon,
        color,
        isExcludedFromTotal: isExcluded,
        updatedAt: now
      });

      showStatus(`Đã cập nhật ví "${name}" thành công!`);
    } else {
      await db.wallets.add({
        id: crypto.randomUUID(),
        name: name.trim(),
        type,
        balance: targetBalance,
        initialBalance: targetBalance,
        currency: 'VND',
        icon,
        color,
        isExcludedFromTotal: isExcluded,
        createdAt: now,
        updatedAt: now
      });

      showStatus(`Đã thêm ví "${name}" thành công!`);
    }

    setIsWalletModalOpen(false);
  };

  // Xóa ví
  const handleDeleteWallet = async (w: Wallet) => {
    const txCount = await db.transactions
      .filter((t) => t.walletId === w.id || t.toWalletId === w.id)
      .count();

    if (txCount > 0) {
      alert(
        `⛔ Không thể xóa ví "${w.name}"!\n\nVí này đang có ${txCount} giao dịch liên quan trong lịch sử. Hãy xóa hoặc chuyển các giao dịch đó sang ví khác trước khi xóa ví.`
      );
      return;
    }

    if (window.confirm(`Bạn có chắc chắn muốn xóa ví "${w.name}"?`)) {
      await db.wallets.delete(w.id);
      showStatus(`Đã xóa ví "${w.name}" thành công!`);
    }
  };

  // Thực hiện Chuyển tiền nội bộ (Atomic Transaction)
  const handleExecuteTransfer = async () => {
    const amount = Number(transferAmountStr.replace(/[^0-9]/g, '')) || 0;

    if (!transferFromId || !transferToId) {
      setTransferError('Vui lòng chọn đầy đủ ví gửi và ví nhận');
      return;
    }

    if (transferFromId === transferToId) {
      setTransferError('Ví gửi và ví nhận không được trùng nhau');
      return;
    }

    if (amount <= 0) {
      setTransferError('Vui lòng nhập số tiền chuyển lớn hơn 0đ');
      return;
    }

    const fromWallet = wallets.find((w) => w.id === transferFromId);
    const toWallet = wallets.find((w) => w.id === transferToId);

    if (!fromWallet || !toWallet) {
      setTransferError('Ví không tồn tại');
      return;
    }

    try {
      await transferFunds({
        fromWalletId: transferFromId,
        toWalletId: transferToId,
        amount,
        date: transferDate,
        time: transferTime,
        note: transferNote.trim() || `Chuyển tiền từ ${fromWallet.name} sang ${toWallet.name}`
      });

      setIsTransferModalOpen(false);
      showStatus(
        `Chuyển thành công ${formatVND(amount)} từ "${fromWallet.name}" sang "${toWallet.name}"!`
      );
    } catch (err: any) {
      setTransferError(err?.message || 'Có lỗi xảy ra khi chuyển tiền');
    }
  };

  const transferFromWallet = wallets.find((w) => w.id === transferFromId);
  const transferToWallet = wallets.find((w) => w.id === transferToId);
  const currentTransferAmount = Number(transferAmountStr.replace(/[^0-9]/g, '')) || 0;

  // Xuất file Excel
  const handleExportExcel = async () => {
    try {
      await exportTransactionsToExcel();
      showStatus('Xuất file Excel thành công!');
    } catch (err: any) {
      alert('Lỗi xuất file Excel: ' + err?.message);
    }
  };

  // Sao lưu JSON
  const handleBackupJSON = async () => {
    try {
      const jsonStr = await exportFullBackupJSON();
      const fileName = `SoThuChi_Backup_${getCurrentDate().replace(/-/g, '')}.json`;
      await downloadOrShareFile(jsonStr, fileName, 'application/json');
      showStatus('Sao lưu dữ liệu JSON thành công!');
    } catch (err: any) {
      alert('Lỗi sao lưu JSON: ' + err?.message);
    }
  };

  // Khôi phục JSON
  const handleRestoreJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        if (
          window.confirm(
            'Bạn có chắc chắn muốn khôi phục dữ liệu từ file này? Dữ liệu hiện tại trên máy sẽ được thay thế.'
          )
        ) {
          const res = await restoreBackupData(content);
          showStatus(res.message);
        }
      } catch (err: any) {
        alert('Lỗi khôi phục: ' + err?.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="pb-28">
      {/* 1. THẺ TỔNG TÀI SẢN KHẢ DỤNG */}
      <div className="glass-panel mx-4 my-3 rounded-[24px] p-5 bg-gradient-to-br from-slate-800/95 to-slate-900/98 shadow-xl border border-white/8">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Tổng tài sản khả dụng
            </div>
            <div className="font-heading text-[32px] font-extrabold text-white my-1.5 tracking-tight">
              {formatVND(totalBalance)}
            </div>
            <div className="text-[11px] text-slate-500">
              {wallets.length} ví hoạt động • {wallets.filter((w) => !w.isExcludedFromTotal).length} ví tính vào tổng
            </div>
          </div>

          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
            <WalletIcon size={24} />
          </div>
        </div>

        {/* 2 HÀNH ĐỘNG CỐT LÕI: CHUYỂN TIỀN & THÊM VÍ */}
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <button
            type="button"
            onClick={() => openTransferModal()}
            className="touch-btn flex items-center justify-center gap-2 py-3 px-3.5 rounded-2xl bg-sky-500/15 text-sky-400 border border-sky-500/30 text-sm font-bold cursor-pointer"
          >
            <ArrowRightLeft size={16} /> Chuyển tiền
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="touch-btn flex items-center justify-center gap-2 py-3 px-3.5 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-sm font-bold cursor-pointer"
          >
            <Plus size={16} /> Thêm ví mới
          </button>
        </div>
      </div>

      {/* Thông báo thao tác thành công (Toast) */}
      {statusMsg && (
        <div className="animate-fade-in mx-4 mb-3.5 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[13px] font-semibold text-center flex items-center justify-center gap-2">
          <CheckCircle2 size={16} />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* 2. DANH SÁCH VÍ & TÀI KHOẢN */}
      <div className="px-4">
        <div className="text-sm font-bold text-slate-100 mb-2.5">
          Danh sách nguồn tiền ({wallets.length})
        </div>

        <div className="flex flex-col gap-2.5">
          {wallets.map((w) => (
            <div
              key={w.id}
              className="glass-panel rounded-[20px] p-4 flex items-center justify-between border border-white/6 hover:bg-white/2 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div
                  className="cat-badge shadow-md"
                  style={{
                    backgroundColor: w.color || '#3B82F6',
                    boxShadow: `0 4px 12px ${w.color}40`
                  }}
                >
                  <CategoryIcon name={w.icon || 'Wallet'} size={22} color="#ffffff" />
                </div>
                <div>
                  <div className="text-[15px] font-bold text-slate-100">
                    {w.name}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {w.type === 'CASH'
                      ? 'Tiền mặt'
                      : w.type === 'BANK'
                      ? 'Ngân hàng'
                      : w.type === 'E_WALLET'
                      ? 'Ví điện tử'
                      : 'Thẻ tín dụng'}
                    {w.isExcludedFromTotal && (
                      <span className="text-amber-400 ml-1.5">• Không tính tổng</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div
                  className={`font-heading text-base font-extrabold ${
                    w.balance < 0 ? 'text-expense' : 'text-slate-100'
                  }`}
                >
                  {formatVND(w.balance)}
                </div>

                {/* Các nút hành động nhanh trên từng ví */}
                <div className="flex gap-1.5 mt-2 justify-end">
                  <button
                    type="button"
                    onClick={() => openTransferModal(w.id)}
                    className="touch-btn w-8 h-8 rounded-[10px] bg-sky-500/12 text-sky-400 border-none flex items-center justify-center cursor-pointer hover:bg-sky-500/20"
                    title="Chuyển tiền từ ví này"
                  >
                    <ArrowRightLeft size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditModal(w)}
                    className="touch-btn w-8 h-8 rounded-[10px] bg-slate-800 text-slate-400 border-none flex items-center justify-center cursor-pointer hover:text-white"
                    title="Chỉnh sửa ví & điều chỉnh số dư"
                  >
                    <Edit2 size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteWallet(w)}
                    className="touch-btn w-8 h-8 rounded-[10px] bg-rose-500/12 text-rose-400 border-none flex items-center justify-center cursor-pointer hover:bg-rose-500/20"
                    title="Xóa ví"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. KHU VỰC SAO LƯU & XUẤT BÁO CÁO */}
      <div className="px-4 pt-6">
        <div className="text-sm font-bold text-slate-100 mb-3">
          Sao lưu & Dữ liệu độc lập (0đ chi phí)
        </div>

        <div className="flex flex-col gap-2.5">
          {/* Nút 1: Xuất Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="glass-panel touch-btn p-4 rounded-[18px] flex items-center justify-between cursor-pointer border border-white/8 hover:bg-white/2"
          >
            <div className="flex items-center gap-3">
              <div className="w-[42px] h-[42px] rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                <FileSpreadsheet size={22} />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-100">
                  Xuất báo cáo Excel (.xlsx)
                </div>
                <div className="text-xs text-slate-400">
                  Bảng kê chi tiết giao dịch & số dư các ví
                </div>
              </div>
            </div>
            <Download size={18} className="text-emerald-400" />
          </button>

          {/* Nút 2: Sao lưu JSON */}
          <button
            type="button"
            onClick={handleBackupJSON}
            className="glass-panel touch-btn p-4 rounded-[18px] flex items-center justify-between cursor-pointer border border-white/8 hover:bg-white/2"
          >
            <div className="flex items-center gap-3">
              <div className="w-[42px] h-[42px] rounded-xl bg-sky-500/15 flex items-center justify-center text-sky-400">
                <ShieldCheck size={22} />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-100">
                  Sao lưu toàn bộ dữ liệu (JSON)
                </div>
                <div className="text-xs text-slate-400">
                  Bản lưu 100% không mất mát, lưu lên Google Drive/iCloud
                </div>
              </div>
            </div>
            <Download size={18} className="text-sky-400" />
          </button>

          {/* Nút 3: Khôi phục JSON */}
          <label className="glass-panel touch-btn p-4 rounded-[18px] flex items-center justify-between cursor-pointer border border-white/8 hover:bg-white/2">
            <div className="flex items-center gap-3">
              <div className="w-[42px] h-[42px] rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400">
                <Download size={22} className="rotate-180" />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-100">
                  Khôi phục dữ liệu từ JSON
                </div>
                <div className="text-xs text-slate-400">
                  Phục hồi nguyên trạng cơ sở dữ liệu trên máy
                </div>
              </div>
            </div>
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreJSON}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* 4. MODAL THÊM / SỬA VÍ & ĐIỀU CHỈNH SỐ DƯ THỰC TẾ */}
      {isWalletModalOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-[130] flex flex-col justify-end max-w-[480px] mx-auto"
          onClick={() => setIsWalletModalOpen(false)}
        >
          <div
            className="glass-panel animate-slide-up bg-slate-900 rounded-t-[28px] p-5 pb-[max(24px,env(safe-area-inset-bottom,0px))] flex flex-col gap-3.5 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="flex justify-between items-center">
              <div className="text-[17px] font-extrabold text-slate-100">
                {editingWallet ? 'Chỉnh sửa ví & Điều chỉnh số dư' : 'Thêm ví mới'}
              </div>
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(false)}
                className="touch-btn w-8 h-8 rounded-full bg-slate-800 border-none text-slate-400 flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tên ví */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Tên ví (Ví dụ: Tiền mặt, Techcombank, MoMo...)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập tên ví..."
                className="input-ios"
              />
            </div>

            {/* Loại ví */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Phân loại ví
              </label>
              <select
                value={type}
                onChange={(e) => {
                  const t = e.target.value as WalletType;
                  setType(t);
                  if (t === 'CASH') {
                    setIcon('Wallet');
                    setColor('#10B981');
                  } else if (t === 'BANK') {
                    setIcon('Landmark');
                    setColor('#3B82F6');
                  } else if (t === 'E_WALLET') {
                    setIcon('Smartphone');
                    setColor('#D946EF');
                  } else {
                    setIcon('CreditCard');
                    setColor('#F59E0B');
                  }
                }}
                className="input-ios"
              >
                <option value="CASH">💵 Tiền mặt</option>
                <option value="BANK">🏦 Tài khoản Ngân hàng</option>
                <option value="E_WALLET">📱 Ví điện tử (MoMo, ZaloPay...)</option>
                <option value="CREDIT">💳 Thẻ tín dụng</option>
              </select>
            </div>

            {/* Chọn Icon */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Biểu tượng
              </label>
              <div className="grid grid-cols-9 gap-1.5">
                {WALLET_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className="touch-btn h-9.5 rounded-[10px] flex items-center justify-center cursor-pointer border-none"
                    style={{
                      backgroundColor: icon === ic ? color : '#1e293b',
                      border: icon === ic ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.06)'
                    }}
                  >
                    <CategoryIcon name={ic} size={18} color={icon === ic ? '#ffffff' : '#94a3b8'} />
                  </button>
                ))}
              </div>
            </div>

            {/* Chọn Mã màu */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Màu sắc nhận diện
              </label>
              <div className="flex gap-2">
                {WALLET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="touch-btn flex-1 h-8 rounded-lg cursor-pointer border-none"
                    style={{
                      backgroundColor: c,
                      border: color === c ? '2.5px solid #ffffff' : 'none'
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Số dư hiện tại & Điều chỉnh số dư thực tế */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-slate-400">
                  {editingWallet ? 'Số dư thực tế ngoài đời (VNĐ)' : 'Số dư khởi tạo ban đầu (VNĐ)'}
                </label>
                {editingWallet && (
                  <span className="text-xs text-slate-500">
                    Hiện tại trong sổ: <b>{formatVND(editingWallet.balance)}</b>
                  </span>
                )}
              </div>

              <input
                type="text"
                value={balanceStr}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9-]/g, '');
                  setBalanceStr(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                }}
                placeholder="0"
                className="input-ios text-income font-bold text-lg"
              />

              {/* Thông báo chênh lệch và Tùy chọn tự động tạo giao dịch điều chỉnh */}
              {editingWallet && balanceDiff !== 0 && (
                <div
                  className={`animate-fade-in mt-2.5 p-2.5 rounded-xl border ${
                    balanceDiff > 0
                      ? 'bg-emerald-500/12 border-emerald-500/30'
                      : 'bg-rose-500/12 border-rose-500/30'
                  }`}
                >
                  <div
                    className={`text-[13px] font-bold flex items-center gap-1.5 ${
                      balanceDiff > 0 ? 'text-income' : 'text-expense'
                    }`}
                  >
                    {balanceDiff > 0 ? '📈 Tiền thực tế tăng thêm:' : '📉 Tiền thực tế giảm đi:'}
                    <span>{balanceDiff > 0 ? `+${formatVND(balanceDiff)}` : `-${formatVND(Math.abs(balanceDiff))}`}</span>
                  </div>

                  <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoCreateAdjustmentTx}
                      onChange={(e) => setAutoCreateAdjustmentTx(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs text-slate-300 font-medium">
                      Tự động tạo giao dịch thu/chi chênh lệch vào sổ
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Bỏ qua khỏi tổng tài sản */}
            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/60 cursor-pointer select-none border border-white/6">
              <input
                type="checkbox"
                checked={isExcluded}
                onChange={(e) => setIsExcluded(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer"
              />
              <div>
                <div className="text-[13px] font-semibold text-slate-200">
                  Không tính ví này vào Tổng tài sản
                </div>
                <div className="text-[11px] text-slate-400">
                  Thích hợp cho quỹ nhóm, thẻ tín dụng, hoặc tiền tiết kiệm dài hạn
                </div>
              </div>
            </label>

            {/* Nút Lưu */}
            <button
              type="button"
              onClick={handleSaveWallet}
              className="touch-btn bg-emerald-500 text-slate-900 border-none p-3.5 rounded-2xl text-base font-extrabold cursor-pointer mt-1.5 shadow-lg shadow-emerald-500/30"
            >
              {editingWallet ? 'Lưu thay đổi ví' : 'Tạo ví mới'}
            </button>
          </div>
        </div>
      )}

      {/* 5. MODAL CHUYỂN TIỀN NỘI BỘ GIỮA 2 VÍ */}
      {isTransferModalOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-[130] flex flex-col justify-end max-w-[480px] mx-auto"
          onClick={() => setIsTransferModalOpen(false)}
        >
          <div
            className="glass-panel animate-slide-up bg-slate-900 rounded-t-[28px] p-5 pb-[max(24px,env(safe-area-inset-bottom,0px))] flex flex-col gap-3.5 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <div className="text-[17px] font-extrabold text-slate-100 flex items-center gap-2">
                <ArrowRightLeft size={18} className="text-sky-400" />
                <span>Chuyển tiền giữa các ví</span>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="touch-btn w-8 h-8 rounded-full bg-slate-800 border-none text-slate-400 flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Lựa chọn 2 ví */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Chuyển từ ví
                </label>
                <select
                  value={transferFromId}
                  onChange={(e) => setTransferFromId(e.target.value)}
                  className="input-ios"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatVND(w.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Chuyển đến ví
                </label>
                <select
                  value={transferToId}
                  onChange={(e) => setTransferToId(e.target.value)}
                  className="input-ios"
                >
                  <option value="">-- Chọn ví nhận --</option>
                  {wallets
                    .filter((w) => w.id !== transferFromId)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({formatVND(w.balance)})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Số tiền cần chuyển */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Số tiền muốn chuyển (VNĐ)
              </label>
              <input
                type="text"
                value={transferAmountStr}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setTransferAmountStr(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                }}
                placeholder="0"
                className="input-ios text-sky-400 font-extrabold text-xl"
              />
            </div>

            {/* Preview biến động số dư 2 ví */}
            {transferFromWallet && transferToWallet && currentTransferAmount > 0 && (
              <div className="animate-fade-in p-3 rounded-xl bg-slate-800/80 border border-sky-400/20 flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-slate-300">{transferFromWallet.name}:</span>
                  <span
                    className={`font-bold ${
                      transferFromWallet.balance - currentTransferAmount < 0 ? 'text-expense' : 'text-sky-400'
                    }`}
                  >
                    {formatVND(transferFromWallet.balance)} ➔ {formatVND(transferFromWallet.balance - currentTransferAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-slate-300">{transferToWallet.name}:</span>
                  <span className="font-bold text-income">
                    {formatVND(transferToWallet.balance)} ➔ {formatVND(transferToWallet.balance + currentTransferAmount)}
                  </span>
                </div>
              </div>
            )}

            {/* Ngày và Giờ chuyển */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Ngày giao dịch
                </label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="input-ios"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Giờ giao dịch
                </label>
                <input
                  type="time"
                  value={transferTime}
                  onChange={(e) => setTransferTime(e.target.value)}
                  className="input-ios"
                />
              </div>
            </div>

            {/* Ghi chú chuyển tiền */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Ghi chú chuyển tiền (Tùy chọn)
              </label>
              <input
                type="text"
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                placeholder="Ví dụ: Rút tiền ATM, Nạp tiền MoMo..."
                className="input-ios"
              />
            </div>

            {/* Lỗi cảnh báo nếu có */}
            {transferError && (
              <div className="text-expense text-[13px] bg-rose-500/10 p-2.5 rounded-xl flex items-center gap-1.5">
                <AlertTriangle size={16} />
                <span>{transferError}</span>
              </div>
            )}

            {/* Nút Xác nhận Chuyển Tiền */}
            <button
              type="button"
              onClick={handleExecuteTransfer}
              className="touch-btn bg-sky-400 text-slate-900 border-none p-3.5 rounded-2xl text-base font-extrabold cursor-pointer mt-1.5 shadow-lg shadow-sky-400/30"
            >
              Xác nhận chuyển tiền
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletsTab;
