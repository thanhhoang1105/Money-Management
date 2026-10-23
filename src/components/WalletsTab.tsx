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
import { backupToGoogleDrive } from '../services/googleDriveService';
import type { Wallet, WalletType } from '../types';
import { CategoryIcon } from './CategoryIcon';
import { formatVND, getCurrentDate, getCurrentTime } from '../utils/formatters';
import { generateUUID } from '../utils/uuid';
import {
  Plus,
  Edit2,
  Trash2,
  Download,
  Upload,
  FileSpreadsheet,
  ShieldCheck,
  ChevronLeft,
  ArrowRightLeft,
  Wallet as WalletIcon,
  CheckCircle2,
  Landmark,
  Smartphone,
  CreditCard,
  TrendingUp,
  Package,
  Check,
  Cloud,
  CloudUpload
} from 'lucide-react';

export interface WalletPreset {
  id: string;
  name: string;
  shortName: string;
  color: string;
  icon: string;
  type: WalletType;
}

// Danh sách các ngân hàng hàng đầu tại Việt Nam với màu sắc nhận diện chuẩn
const POPULAR_BANKS: WalletPreset[] = [
  { id: 'vcb', name: 'Vietcombank', shortName: 'VCB', color: '#00573D', icon: 'Landmark', type: 'BANK' },
  { id: 'tcb', name: 'Techcombank', shortName: 'TCB', color: '#EE1C25', icon: 'Landmark', type: 'BANK' },
  { id: 'mb', name: 'MB Bank', shortName: 'MB', color: '#002878', icon: 'Landmark', type: 'BANK' },
  { id: 'ctg', name: 'VietinBank', shortName: 'CTG', color: '#004B87', icon: 'Landmark', type: 'BANK' },
  { id: 'bid', name: 'BIDV', shortName: 'BIDV', color: '#0A6C74', icon: 'Landmark', type: 'BANK' },
  { id: 'acb', name: 'ACB', shortName: 'ACB', color: '#00529C', icon: 'Landmark', type: 'BANK' },
  { id: 'tpb', name: 'TPBank', shortName: 'TPB', color: '#592D84', icon: 'Landmark', type: 'BANK' },
  { id: 'vpb', name: 'VPBank', shortName: 'VPB', color: '#008643', icon: 'Landmark', type: 'BANK' },
  { id: 'vib', name: 'VIB', shortName: 'VIB', color: '#005DAA', icon: 'Landmark', type: 'BANK' },
  { id: 'stb', name: 'Sacombank', shortName: 'STB', color: '#004A8F', icon: 'Landmark', type: 'BANK' },
  { id: 'hdb', name: 'HDBank', shortName: 'HDB', color: '#E30613', icon: 'Landmark', type: 'BANK' },
  { id: 'ocb', name: 'OCB', shortName: 'OCB', color: '#008542', icon: 'Landmark', type: 'BANK' },
  { id: 'vba', name: 'Agribank', shortName: 'VBA', color: '#8B1D20', icon: 'Landmark', type: 'BANK' },
  { id: 'timo', name: 'Timo Digital Bank', shortName: 'Timo', color: '#6B38FB', icon: 'Landmark', type: 'BANK' },
  { id: 'cake', name: 'Cake by VPBank', shortName: 'Cake', color: '#FF3366', icon: 'Landmark', type: 'BANK' }
];

// Danh sách các ví điện tử phổ biến tại Việt Nam
const POPULAR_E_WALLETS: WalletPreset[] = [
  { id: 'momo', name: 'Ví MoMo', shortName: 'MoMo', color: '#A50064', icon: 'Smartphone', type: 'E_WALLET' },
  { id: 'zalopay', name: 'Ví ZaloPay', shortName: 'ZaloPay', color: '#008FE5', icon: 'Smartphone', type: 'E_WALLET' },
  { id: 'vnpay', name: 'Ví VNPay', shortName: 'VNPay', color: '#005BAC', icon: 'Smartphone', type: 'E_WALLET' },
  { id: 'viettelmoney', name: 'Viettel Money', shortName: 'ViettelPay', color: '#EE0033', icon: 'Smartphone', type: 'E_WALLET' },
  { id: 'shopeepay', name: 'ShopeePay', shortName: 'ShopeePay', color: '#EE4D2D', icon: 'Smartphone', type: 'E_WALLET' }
];

// Danh sách tài khoản đầu tư / tích lũy
const POPULAR_INVESTMENTS: WalletPreset[] = [
  { id: 'stock_vps', name: 'Chứng khoán VPS', shortName: 'VPS', color: '#005CA9', icon: 'TrendingUp', type: 'INVESTMENT' },
  { id: 'stock_ssi', name: 'Chứng khoán SSI', shortName: 'SSI', color: '#004A99', icon: 'TrendingUp', type: 'INVESTMENT' },
  { id: 'stock_tcbs', name: 'Chứng khoán TCBS', shortName: 'TCBS', color: '#CC0000', icon: 'TrendingUp', type: 'INVESTMENT' },
  { id: 'savings', name: 'Sổ tiết kiệm ngân hàng', shortName: 'Tiết kiệm', color: '#F59E0B', icon: 'PiggyBank', type: 'INVESTMENT' },
  { id: 'gold', name: 'Vàng tích trữ SJC', shortName: 'Vàng SJC', color: '#D97706', icon: 'Coins', type: 'INVESTMENT' },
  { id: 'crypto', name: 'Tài sản Crypto', shortName: 'Crypto', color: '#8B5CF6', icon: 'Coins', type: 'INVESTMENT' }
];

// Gợi ý cho thẻ tín dụng
const POPULAR_CREDIT: WalletPreset[] = [
  { id: 'credit_vcb', name: 'Thẻ tín dụng Vietcombank', shortName: 'VCB Visa', color: '#00573D', icon: 'CreditCard', type: 'CREDIT' },
  { id: 'credit_tcb', name: 'Thẻ tín dụng Techcombank', shortName: 'TCB Visa', color: '#EE1C25', icon: 'CreditCard', type: 'CREDIT' },
  { id: 'credit_visa', name: 'Thẻ Visa Credit', shortName: 'Visa Card', color: '#1A1F71', icon: 'CreditCard', type: 'CREDIT' },
  { id: 'credit_master', name: 'Thẻ Mastercard Credit', shortName: 'Mastercard', color: '#EB001B', icon: 'CreditCard', type: 'CREDIT' }
];

// Gợi ý cho tiền mặt
const POPULAR_CASH: WalletPreset[] = [
  { id: 'cash_main', name: 'Tiền mặt trong ví', shortName: 'Ví tiền mặt', color: '#10B981', icon: 'Wallet', type: 'CASH' },
  { id: 'cash_daily', name: 'Tiền tiêu hàng ngày', shortName: 'Tiêu vặt', color: '#059669', icon: 'Wallet', type: 'CASH' },
  { id: 'cash_safe', name: 'Két tiền mặt dự phòng', shortName: 'Két sắt', color: '#047857', icon: 'Wallet', type: 'CASH' }
];

type ViewMode = 'LIST' | 'FORM' | 'TRANSFER';

export const WalletsTab: React.FC = () => {
  // Lấy danh sách ví bằng .toArray() để lọc bằng JS (tránh lỗi IDBKeyRange)
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const googleDriveUserSetting = useLiveQuery(() => db.settings.get('google_drive_user'));
  const [isBackingUpDrive, setIsBackingUpDrive] = useState(false);

  useEffect(() => {
    ensureDefaultWallets();
  }, []);

  // Tính tổng tài sản khả dụng
  const totalBalance = wallets
    .filter((w) => !w.isExcludedFromTotal)
    .reduce((sum, w) => sum + w.balance, 0);

  // Quản lý chuyển đổi màn hình (Full-Screen Views thay vì popup modal)
  const [viewMode, setViewMode] = useState<ViewMode>('LIST');

  // States form Thêm/Sửa ví
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<WalletType>('BANK');
  const [balanceStr, setBalanceStr] = useState('0');
  const [icon, setIcon] = useState('Landmark');
  const [color, setColor] = useState('#00573D');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('vcb');
  const [isExcluded, setIsExcluded] = useState(false);
  const [autoCreateAdjustmentTx, setAutoCreateAdjustmentTx] = useState(true);

  // States form Chuyển tiền nội bộ
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmountStr, setTransferAmountStr] = useState('');
  const [transferDate, setTransferDate] = useState(getCurrentDate());
  const [transferTime, setTransferTime] = useState(getCurrentTime());
  const [transferNote, setTransferNote] = useState('');
  const [transferError, setTransferError] = useState('');

  // Toast status message
  const [statusMsg, setStatusMsg] = useState('');

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 4000);
  };

  // Mở màn hình Thêm ví mới
  const handleOpenAddScreen = () => {
    setEditingWallet(null);
    setName('Vietcombank');
    setType('BANK');
    setBalanceStr('0');
    setIcon('Landmark');
    setColor('#00573D');
    setSelectedPresetId('vcb');
    setIsExcluded(false);
    setAutoCreateAdjustmentTx(true);
    setViewMode('FORM');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Mở màn hình Sửa ví
  const handleOpenEditScreen = (w: Wallet) => {
    setEditingWallet(w);
    setName(w.name);
    setType(w.type);
    setBalanceStr(new Intl.NumberFormat('vi-VN').format(w.balance));
    setIcon(w.icon || 'Wallet');
    setColor(w.color || '#3B82F6');
    setSelectedPresetId('');
    setIsExcluded(w.isExcludedFromTotal);
    setAutoCreateAdjustmentTx(true);
    setViewMode('FORM');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Mở màn hình Chuyển tiền
  const handleOpenTransferScreen = (defaultFromId?: string) => {
    const fromId = defaultFromId || wallets[0]?.id || '';
    const otherWallet = wallets.find((w) => w.id !== fromId);
    setTransferFromId(fromId);
    setTransferToId(otherWallet ? otherWallet.id : '');
    setTransferAmountStr('');
    setTransferDate(getCurrentDate());
    setTransferTime(getCurrentTime());
    setTransferNote('');
    setTransferError('');
    setViewMode('TRANSFER');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Tính chênh lệch số dư khi chỉnh sửa ví
  const parsedTargetBalance = Number(balanceStr.replace(/[^0-9-]/g, '')) || 0;
  const balanceDiff = editingWallet ? parsedTargetBalance - editingWallet.balance : 0;

  // Khi người dùng bấm vào 1 Preset ngân hàng / ví điện tử
  const handleSelectPreset = (preset: WalletPreset) => {
    setSelectedPresetId(preset.id);
    setName(preset.name);
    setColor(preset.color);
    setIcon(preset.icon);
    setType(preset.type);
  };

  // Đổi phân loại tài khoản
  const handleSelectWalletType = (t: WalletType) => {
    setType(t);
    if (t === 'BANK') {
      const p = POPULAR_BANKS[0];
      handleSelectPreset(p);
    } else if (t === 'E_WALLET') {
      const p = POPULAR_E_WALLETS[0];
      handleSelectPreset(p);
    } else if (t === 'CASH') {
      const p = POPULAR_CASH[0];
      handleSelectPreset(p);
    } else if (t === 'CREDIT') {
      const p = POPULAR_CREDIT[0];
      handleSelectPreset(p);
    } else if (t === 'INVESTMENT') {
      const p = POPULAR_INVESTMENTS[0];
      handleSelectPreset(p);
    } else {
      setSelectedPresetId('other');
      setName('Tài khoản khác');
      setColor('#64748B');
      setIcon('Package');
    }
  };

  // Lưu ví (Thêm mới hoặc Cập nhật) - Có bọc try/catch và an toàn 100%
  const handleSaveWallet = async () => {
    if (!name.trim()) {
      alert('Vui lòng nhập tên tài khoản / ví!');
      return;
    }

    const targetBalance = parsedTargetBalance;
    const now = new Date().toISOString();

    try {
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

        showStatus(`Đã cập nhật ví "${name.trim()}" thành công!`);
      } else {
        const newId = generateUUID();
        await db.wallets.add({
          id: newId,
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

        showStatus(`Đã tạo tài khoản "${name.trim()}" thành công!`);
      }

      setViewMode('LIST');
    } catch (err: any) {
      console.error('Lỗi khi lưu ví:', err);
      alert('Lỗi lưu ví: ' + (err?.message || 'Không thể ghi vào cơ sở dữ liệu'));
    }
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
      try {
        await db.wallets.delete(w.id);
        showStatus(`Đã xóa ví "${w.name}" thành công!`);
      } catch (err: any) {
        alert('Lỗi xóa ví: ' + (err?.message || 'Không thể xóa'));
      }
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

      setViewMode('LIST');
      showStatus(
        `Chuyển thành công ${formatVND(amount)} từ "${fromWallet.name}" sang "${toWallet.name}"!`
      );
    } catch (err: any) {
      setTransferError(err?.message || 'Có lỗi xảy ra khi chuyển tiền');
    }
  };

  // Xuất file Excel (.xlsx)
  const handleExportExcel = async () => {
    try {
      await exportTransactionsToExcel();
      showStatus('Đã xuất báo cáo Excel (.xlsx) thành công!');
    } catch (err: any) {
      alert('Lỗi xuất Excel: ' + (err?.message || 'Thao tác thất bại'));
    }
  };

  // Sao lưu trực tiếp lên Google Drive
  const handleDriveBackup = async () => {
    if (!googleDriveUserSetting?.value) {
      alert('Bạn chưa kết nối Google Drive! Hãy mở Cài đặt (biểu tượng bánh răng ở góc trên) để kết nối Google Drive và sao lưu tự động lên đám mây.');
      return;
    }
    setIsBackingUpDrive(true);
    try {
      showStatus('Đang sao lưu lên Google Drive...');
      const res = await backupToGoogleDrive();
      showStatus(`Đã sao lưu lên Google Drive thành công (${res.fileName})!`);
    } catch (err: any) {
      alert('Lỗi sao lưu lên Google Drive: ' + (err?.message || 'Thao tác thất bại'));
    } finally {
      setIsBackingUpDrive(false);
    }
  };

  // Xuất file JSON ngoại tuyến
  const handleBackupJSON = async () => {
    try {
      const jsonStr = await exportFullBackupJSON();
      const fileName = `SoThuChi_Backup_${getCurrentDate().replace(/-/g, '')}.json`;
      await downloadOrShareFile(jsonStr, fileName, 'application/json');
      showStatus('Đã xuất file sao lưu JSON thành công!');
    } catch (err: any) {
      alert('Lỗi sao lưu JSON: ' + (err?.message || 'Thao tác thất bại'));
    }
  };

  // Khôi phục JSON
  const handleRestoreJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('CẢNH BÁO: Thao tác này sẽ ghi đè toàn bộ dữ liệu hiện tại bằng file sao lưu. Bạn có chắc chắn muốn khôi phục?')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const res = await restoreBackupData(content);
        showStatus(`Khôi phục thành công ${res.counts.transactions} giao dịch và ${res.counts.wallets} ví!`);
      } catch (err: any) {
        alert('Lỗi đọc file sao lưu: ' + (err?.message || 'Dữ liệu không hợp lệ'));
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // =========================================================================
  // GIAO DIỆN MÀN HÌNH 2: THÊM / SỬA VÍ (MÀN HÌNH ĐỘC LẬP - KHÔNG DÙNG POPUP)
  // =========================================================================
  if (viewMode === 'FORM') {
    return (
      <div className="flex flex-col min-h-full pb-32 animate-fade-in bg-slate-900/40">
        {/* Header màn hình con với nút Back */}
        <div className="sticky top-0 z-30 safe-padding-top px-4 py-3 bg-slate-900/95 backdrop-blur-md border-b border-white/8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className="touch-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-white/5 cursor-pointer text-xs font-semibold"
          >
            <ChevronLeft size={18} />
            <span>Quay lại</span>
          </button>

          <h2 className="text-[16px] font-bold text-white m-0 truncate">
            {editingWallet ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản mới'}
          </h2>

          <button
            type="button"
            onClick={handleSaveWallet}
            className="touch-btn flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md shadow-emerald-500/20"
          >
            <Check size={16} strokeWidth={2.5} />
            <span>Lưu ví</span>
          </button>
        </div>

        {/* Nội dung Form cuộn tự nhiên của màn hình */}
        <div className="p-4 flex flex-col gap-4 max-w-lg mx-auto w-full">
          {/* BƯỚC 1: CHỌN PHÂN LOẠI TÀI KHOẢN (6 LOẠI) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              1. Phân loại tài khoản
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectWalletType('CASH')}
                className={`touch-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 border text-center transition-all cursor-pointer ${
                  type === 'CASH'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold shadow-md shadow-emerald-500/10'
                    : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <WalletIcon size={20} />
                <span className="text-xs">Tiền mặt</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectWalletType('BANK')}
                className={`touch-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 border text-center transition-all cursor-pointer ${
                  type === 'BANK'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-400 font-bold shadow-md shadow-sky-500/10'
                    : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Landmark size={20} />
                <span className="text-xs">Ngân hàng</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectWalletType('E_WALLET')}
                className={`touch-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 border text-center transition-all cursor-pointer ${
                  type === 'E_WALLET'
                    ? 'bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-400 font-bold shadow-md shadow-fuchsia-500/10'
                    : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone size={20} />
                <span className="text-xs">Ví điện tử</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectWalletType('CREDIT')}
                className={`touch-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 border text-center transition-all cursor-pointer ${
                  type === 'CREDIT'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-400 font-bold shadow-md shadow-amber-500/10'
                    : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <CreditCard size={20} />
                <span className="text-xs">Thẻ tín dụng</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectWalletType('INVESTMENT')}
                className={`touch-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 border text-center transition-all cursor-pointer ${
                  type === 'INVESTMENT'
                    ? 'bg-purple-500/20 border-purple-400 text-purple-400 font-bold shadow-md shadow-purple-500/10'
                    : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <TrendingUp size={20} />
                <span className="text-xs">Đầu tư / Tiết kiệm</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectWalletType('OTHER')}
                className={`touch-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 border text-center transition-all cursor-pointer ${
                  type === 'OTHER'
                    ? 'bg-slate-500/20 border-slate-400 text-slate-300 font-bold shadow-md'
                    : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Package size={20} />
                <span className="text-xs">Khác</span>
              </button>
            </div>
          </div>

          {/* BƯỚC 2: CHỌN ĐƠN VỊ / NGÂN HÀNG PHỔ BIẾN TẠI VIỆT NAM (1-CHẠM TỰ ĐỘNG GÁN LOGO & MÀU) */}
          {type === 'BANK' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>2. Chọn ngân hàng (Tự động gán màu)</span>
                <span className="text-[11px] text-sky-400 lowercase font-normal">Chạm để chọn</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {POPULAR_BANKS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectPreset(b)}
                    className={`touch-btn p-2.5 rounded-xl border flex items-center gap-2 text-left cursor-pointer transition-all ${
                      selectedPresetId === b.id
                        ? 'border-white bg-slate-800 shadow-md ring-2 ring-sky-400/50'
                        : 'border-white/5 bg-slate-800/60 hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: b.color }}
                    />
                    <div className="truncate">
                      <div className="text-xs font-bold text-white truncate">{b.shortName}</div>
                      <div className="text-[10px] text-slate-400 truncate">{b.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'E_WALLET' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                2. Chọn ví điện tử phổ biến
              </label>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_E_WALLETS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleSelectPreset(w)}
                    className={`touch-btn p-3 rounded-xl border flex items-center gap-2.5 text-left cursor-pointer transition-all ${
                      selectedPresetId === w.id
                        ? 'border-white bg-slate-800 shadow-md ring-2 ring-fuchsia-400/50'
                        : 'border-white/5 bg-slate-800/60 hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: w.color }}
                    />
                    <div className="truncate">
                      <div className="text-xs font-bold text-white truncate">{w.shortName}</div>
                      <div className="text-[11px] text-slate-400 truncate">{w.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'INVESTMENT' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                2. Chọn kênh đầu tư / tích lũy
              </label>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_INVESTMENTS.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => handleSelectPreset(inv)}
                    className={`touch-btn p-3 rounded-xl border flex items-center gap-2.5 text-left cursor-pointer transition-all ${
                      selectedPresetId === inv.id
                        ? 'border-white bg-slate-800 shadow-md ring-2 ring-purple-400/50'
                        : 'border-white/5 bg-slate-800/60 hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: inv.color }}
                    />
                    <div className="truncate">
                      <div className="text-xs font-bold text-white truncate">{inv.shortName}</div>
                      <div className="text-[11px] text-slate-400 truncate">{inv.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'CREDIT' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                2. Chọn loại thẻ tín dụng
              </label>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_CREDIT.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectPreset(c)}
                    className={`touch-btn p-3 rounded-xl border flex items-center gap-2.5 text-left cursor-pointer transition-all ${
                      selectedPresetId === c.id
                        ? 'border-white bg-slate-800 shadow-md ring-2 ring-amber-400/50'
                        : 'border-white/5 bg-slate-800/60 hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: c.color }}
                    />
                    <div className="truncate">
                      <div className="text-xs font-bold text-white truncate">{c.shortName}</div>
                      <div className="text-[11px] text-slate-400 truncate">{c.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'CASH' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                2. Gợi ý tên ví tiền mặt
              </label>
              <div className="grid grid-cols-3 gap-2">
                {POPULAR_CASH.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectPreset(c)}
                    className={`touch-btn p-2.5 rounded-xl border flex items-center gap-2 text-left cursor-pointer transition-all ${
                      selectedPresetId === c.id
                        ? 'border-white bg-slate-800 shadow-md ring-2 ring-emerald-400/50'
                        : 'border-white/5 bg-slate-800/60 hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: c.color }}
                    />
                    <div className="truncate">
                      <div className="text-xs font-bold text-white truncate">{c.shortName}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* BƯỚC 3: TÊN TÀI KHOẢN / VÍ */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              3. Tên tài khoản hiển thị
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Techcombank - 8888, MoMo, Tiền mặt..."
              className="input-ios bg-slate-800 text-white font-semibold"
            />
          </div>

          {/* BƯỚC 4: SỐ DƯ HIỆN TẠI (VNĐ) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                4. {editingWallet ? 'Số dư thực tế ngoài đời (VNĐ)' : 'Số dư ban đầu (VNĐ)'}
              </label>
              {editingWallet && (
                <span className="text-xs text-slate-400">
                  Số dư cũ: <b className="text-slate-200">{formatVND(editingWallet.balance)}</b>
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                value={balanceStr}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9-]/g, '');
                  setBalanceStr(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                }}
                placeholder="0"
                className="input-ios bg-slate-800 text-emerald-400 font-black text-xl tracking-tight"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                VNĐ
              </span>
            </div>

            {/* Thông báo chênh lệch và Tùy chọn tự động tạo giao dịch điều chỉnh */}
            {editingWallet && balanceDiff !== 0 && (
              <div
                className={`animate-fade-in mt-2 p-3 rounded-2xl border ${
                  balanceDiff > 0
                    ? 'bg-emerald-500/12 border-emerald-500/30'
                    : 'bg-rose-500/12 border-rose-500/30'
                }`}
              >
                <div
                  className={`text-xs font-bold flex items-center gap-1.5 ${
                    balanceDiff > 0 ? 'text-emerald-400' : 'text-rose-400'
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
                    Tự động tạo giao dịch điều chỉnh số dư vào sổ
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* BƯỚC 5: TÙY CHỌN KHÔNG TÍNH VÀO TỔNG TÀI SẢN */}
          <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-800/70 border border-white/6 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isExcluded}
              onChange={(e) => setIsExcluded(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer"
            />
            <div>
              <div className="text-xs font-bold text-slate-200">
                Không tính ví này vào Tổng tài sản
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Thích hợp cho quỹ nhóm, thẻ tín dụng hoặc tiết kiệm dài hạn
              </div>
            </div>
          </label>

          {/* BƯỚC 6: NÚT LƯU CỐ ĐỊNH Ở ĐÁY - KHÔNG BAO GIỜ BỊ ẨN */}
          <div className="pt-3">
            <button
              type="button"
              onClick={handleSaveWallet}
              className="touch-btn w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-base cursor-pointer shadow-xl shadow-emerald-500/25 text-center flex items-center justify-center gap-2"
            >
              <Check size={20} strokeWidth={3} />
              <span>{editingWallet ? 'Lưu thay đổi tài khoản' : 'Tạo tài khoản mới'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // GIAO DIỆN MÀN HÌNH 3: CHUYỂN TIỀN NỘI BỘ (MÀN HÌNH ĐỘC LẬP - KHÔNG DÙNG POPUP)
  // =========================================================================
  if (viewMode === 'TRANSFER') {
    return (
      <div className="flex flex-col min-h-full pb-32 animate-fade-in bg-slate-900/40">
        {/* Header màn hình con với nút Back */}
        <div className="sticky top-0 z-30 safe-padding-top px-4 py-3 bg-slate-900/95 backdrop-blur-md border-b border-white/8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className="touch-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-white/5 cursor-pointer text-xs font-semibold"
          >
            <ChevronLeft size={18} />
            <span>Quay lại</span>
          </button>

          <h2 className="text-[16px] font-bold text-white m-0">
            Chuyển tiền nội bộ
          </h2>

          <div className="w-16" />
        </div>

        {/* Nội dung form chuyển tiền */}
        <div className="p-4 flex flex-col gap-4 max-w-lg mx-auto w-full">
          {transferError && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-medium">
              {transferError}
            </div>
          )}

          {/* Chọn 2 ví */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Từ ví (Gửi đi)
              </label>
              <select
                value={transferFromId}
                onChange={(e) => setTransferFromId(e.target.value)}
                className="input-ios bg-slate-800 text-white font-medium"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatVND(w.balance)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Đến ví (Nhận tiền)
              </label>
              <select
                value={transferToId}
                onChange={(e) => setTransferToId(e.target.value)}
                className="input-ios bg-slate-800 text-white font-medium"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatVND(w.balance)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Số tiền chuyển */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">
              Số tiền chuyển (VNĐ)
            </label>
            <div className="relative">
              <input
                type="text"
                value={transferAmountStr}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setTransferAmountStr(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                }}
                placeholder="0"
                className="input-ios bg-slate-800 text-sky-400 font-black text-xl"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                VNĐ
              </span>
            </div>
          </div>

          {/* Ngày & Giờ chuyển */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Ngày chuyển
              </label>
              <input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="input-ios bg-slate-800 text-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Giờ chuyển
              </label>
              <input
                type="time"
                value={transferTime}
                onChange={(e) => setTransferTime(e.target.value)}
                className="input-ios bg-slate-800 text-white"
              />
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">
              Ghi chú chuyển tiền
            </label>
            <input
              type="text"
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
              placeholder="VD: Rút tiền ATM, Nạp tiền ví MoMo..."
              className="input-ios bg-slate-800 text-white"
            />
          </div>

          {/* Nút bấm chuyển tiền */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleExecuteTransfer}
              className="touch-btn w-full py-4 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold text-base cursor-pointer shadow-xl shadow-sky-500/25 text-center flex items-center justify-center gap-2"
            >
              <ArrowRightLeft size={18} />
              <span>Xác nhận chuyển tiền</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // GIAO DIỆN MÀN HÌNH 1: DANH SÁCH VÍ & SAO LƯU (MÀN HÌNH CHÍNH CỦA TAB)
  // =========================================================================
  return (
    <div className="flex flex-col min-h-full pb-32 animate-fade-in">
      {/* Toast thông báo nếu có */}
      {statusMsg && (
        <div className="mx-4 mt-3 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-fade-in shadow-lg">
          <CheckCircle2 size={16} />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* 1. THẺ HERO TỔNG TÀI SẢN KHẢ DỤNG */}
      <div className="mx-4 mt-3 p-5 rounded-3xl bg-gradient-to-br from-slate-800/95 to-slate-900/98 border border-white/10 shadow-xl backdrop-blur-md">
        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
          Tổng tài sản khả dụng
        </span>
        <div className="font-heading text-3xl font-black text-white mt-1 tracking-tight">
          {formatVND(totalBalance)}
        </div>
        <div className="text-[11px] text-slate-400 mt-1">
          Bao gồm {wallets.filter((w) => !w.isExcludedFromTotal).length} tài khoản đang hoạt động
        </div>

        {/* 2 Nút thao tác nhanh chuyển sang màn hình con */}
        <div className="grid grid-cols-2 gap-2.5 mt-4 pt-3.5 border-t border-white/10">
          <button
            type="button"
            onClick={handleOpenAddScreen}
            className="touch-btn py-2.5 px-3 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-500/25 cursor-pointer"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Thêm tài khoản</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenTransferScreen()}
            className="touch-btn py-2.5 px-3 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-400/30 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-sky-500/25 cursor-pointer"
          >
            <ArrowRightLeft size={15} />
            <span>Chuyển tiền</span>
          </button>
        </div>
      </div>

      {/* 2. DANH SÁCH CÁC TÀI KHOẢN VÍ */}
      <div className="px-4 pt-5">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Tài khoản của bạn ({wallets.length})
          </span>
          <button
            type="button"
            onClick={handleOpenAddScreen}
            className="text-xs font-bold text-emerald-400 flex items-center gap-1 hover:underline cursor-pointer"
          >
            <Plus size={14} />
            <span>Thêm mới</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {wallets.map((w) => (
            <div
              key={w.id}
              className="glass-card p-3.5 rounded-2xl flex items-center justify-between border border-white/6 bg-slate-800/80 hover:border-white/15 transition-all shadow-md"
            >
              {/* Icon & Tên ví */}
              <div className="flex items-center gap-3 overflow-hidden">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-sm"
                  style={{ backgroundColor: w.color || '#3B82F6' }}
                >
                  <CategoryIcon name={w.icon || 'Landmark'} size={20} color="#ffffff" />
                </div>
                <div className="truncate">
                  <div className="text-sm font-bold text-slate-100 truncate flex items-center gap-1.5">
                    <span>{w.name}</span>
                    {w.isExcludedFromTotal && (
                      <span className="text-[9px] bg-slate-700/80 text-slate-300 px-1.5 py-0.5 rounded-md font-semibold">
                        Không tính tổng
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {w.type === 'CASH'
                      ? 'Tiền mặt'
                      : w.type === 'BANK'
                      ? 'Ngân hàng'
                      : w.type === 'E_WALLET'
                      ? 'Ví điện tử'
                      : w.type === 'CREDIT'
                      ? 'Thẻ tín dụng'
                      : w.type === 'INVESTMENT'
                      ? 'Đầu tư / Tiết kiệm'
                      : 'Khác'}
                  </div>
                </div>
              </div>

              {/* Số dư & Nút hành động */}
              <div className="flex flex-col items-end shrink-0 pl-2">
                <div
                  className={`text-sm font-black font-heading ${
                    w.balance < 0 ? 'text-rose-400' : 'text-slate-100'
                  }`}
                >
                  {formatVND(w.balance)}
                </div>

                <div className="flex gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => handleOpenTransferScreen(w.id)}
                    className="touch-btn w-7 h-7 rounded-lg bg-sky-500/12 text-sky-400 flex items-center justify-center cursor-pointer hover:bg-sky-500/20"
                    title="Chuyển tiền từ ví này"
                  >
                    <ArrowRightLeft size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditScreen(w)}
                    className="touch-btn w-7 h-7 rounded-lg bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer hover:text-white"
                    title="Sửa ví & điều chỉnh số dư"
                  >
                    <Edit2 size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteWallet(w)}
                    className="touch-btn w-7 h-7 rounded-lg bg-rose-500/12 text-rose-400 flex items-center justify-center cursor-pointer hover:bg-rose-500/20"
                    title="Xóa ví"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. KHU VỰC SAO LƯU & XUẤT BÁO CÁO NHANH */}
      <div className="px-4 pt-6">
        <div className="text-xs font-bold text-slate-400 mb-2.5 uppercase tracking-wider px-1">
          Dữ liệu & Báo cáo
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Nút 1: Sao lưu Google Drive */}
          <button
            type="button"
            onClick={handleDriveBackup}
            disabled={isBackingUpDrive}
            className="touch-btn p-3.5 rounded-2xl flex items-center justify-between cursor-pointer border border-white/6 bg-slate-800/80 hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
                <CloudUpload size={18} className={isBackingUpDrive ? 'animate-bounce' : ''} />
              </div>
              <div className="text-left truncate">
                <div className="text-xs font-bold text-slate-100 truncate">
                  Sao lưu lên Google Drive
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {googleDriveUserSetting?.value
                    ? (googleDriveUserSetting.value as any)?.email || 'Đã kết nối Drive'
                    : 'Chạm để sao lưu (Cần kết nối)'}
                </div>
              </div>
            </div>
            <Cloud size={16} className="text-emerald-400 shrink-0" />
          </button>

          {/* Nút 2: Tải JSON về máy */}
          <button
            type="button"
            onClick={handleBackupJSON}
            className="touch-btn p-3.5 rounded-2xl flex items-center justify-between cursor-pointer border border-white/6 bg-slate-800/80 hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center text-sky-400 shrink-0">
                <ShieldCheck size={18} />
              </div>
              <div className="text-left truncate">
                <div className="text-xs font-bold text-slate-100 truncate">
                  Tải file JSON về máy
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  Lưu trữ ngoại tuyến an toàn
                </div>
              </div>
            </div>
            <Download size={16} className="text-sky-400 shrink-0" />
          </button>

          {/* Nút 3: Khôi phục JSON */}
          <label className="touch-btn p-3.5 rounded-2xl flex items-center justify-between cursor-pointer border border-white/6 bg-slate-800/80 hover:bg-slate-800 transition-colors">
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreJSON}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
                <Upload size={18} />
              </div>
              <div className="text-left truncate">
                <div className="text-xs font-bold text-slate-100 truncate">
                  Khôi phục từ file JSON
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  Nạp file sao lưu từ máy
                </div>
              </div>
            </div>
            <Upload size={16} className="text-amber-400 shrink-0" />
          </label>

          {/* Nút 4: Xuất Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="touch-btn p-3.5 rounded-2xl flex items-center justify-between cursor-pointer border border-white/6 bg-slate-800/80 hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-500/15 flex items-center justify-center text-teal-400 shrink-0">
                <FileSpreadsheet size={18} />
              </div>
              <div className="text-left truncate">
                <div className="text-xs font-bold text-slate-100 truncate">
                  Báo cáo Excel (.xlsx)
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  3 sheets giao dịch & số dư
                </div>
              </div>
            </div>
            <Download size={16} className="text-teal-400 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
