// src/components/WalletsTab.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Wallet, WalletType } from '../types';
import {
  createWallet,
  adjustWalletBalance,
  deleteWallet,
  sortWallets,
  moveWalletPosition,
  reorderWallets,
  createTransaction
} from '../services/transactionService';
import { CategoryIcon } from './CategoryIcon';
import {
  BANK_BRANDS,
  BankLogo,
  detectBankBrand,
  BankBrandAccordionPicker
} from './BankLogo';
import { formatVND, getCurrentDate, getCurrentTime } from '../utils/formatters';
import { CustomSelect } from './ui/CustomSelect';
import { WalletSelect } from './ui/WalletSelect';
import { DatePicker } from './ui/DatePicker';
import { Toast } from './ui/Toast';
import {
  Plus,
  Edit3,
  Trash2,
  EyeOff,
  Check,
  SlidersHorizontal,
  ShieldAlert,
  ArrowLeft,
  ArrowUpDown,
  ArrowRightLeft,
  MoreVertical,
  ChevronRight,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  GripVertical
} from 'lucide-react';

const WALLET_COLORS = [
  '#10B981',
  '#3B82F6',
  '#E30613',
  '#A50064',
  '#0068FF',
  '#8B5CF6',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
  '#6366F1'
];

interface WalletsTabProps {
  resetSignal?: number;
}

export const WalletsTab: React.FC<WalletsTabProps> = ({ resetSignal }) => {
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const sortedWallets = useMemo(() => sortWallets(wallets), [wallets]);

  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'EDIT' | 'ADJUST' | 'TRANSFER'>('LIST');
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [activeMenuWallet, setActiveMenuWallet] = useState<Wallet | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [draggedWalletId, setDraggedWalletId] = useState<string | null>(null);

  // Transfer states
  const [toWalletId, setToWalletId] = useState<string>('');
  const [transferFeeStr, setTransferFeeStr] = useState<string>('0');
  const [transferDate, setTransferDate] = useState<string>(() => getCurrentDate());
  const [transferNote, setTransferNote] = useState<string>('');
  const [walletNotice, setWalletNotice] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning';
  } | null>(null);

  // Lắng nghe tín hiệu từ menu điều hướng để trở về danh sách ví chính
  const prevResetSignalRef = React.useRef(resetSignal);
  React.useEffect(() => {
    if (
      resetSignal !== undefined &&
      resetSignal > 0 &&
      resetSignal !== prevResetSignalRef.current
    ) {
      prevResetSignalRef.current = resetSignal;
      setViewMode('LIST');
      setSelectedWallet(null);
      setActiveMenuWallet(null);
      setIsReordering(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [resetSignal]);

  // Đóng menu 3 chấm khi bấm phím Escape trên bàn phím
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenuWallet(null);
      }
    };
    if (activeMenuWallet) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [activeMenuWallet]);

  // Form states
  const [name, setName] = useState('');
  const [walletType, setWalletType] = useState<WalletType>('BANK');
  const [balanceStr, setBalanceStr] = useState('');
  const [icon, setIcon] = useState('bank:vcb');
  const [color, setColor] = useState('#00703C');
  const [isExcluded, setIsExcluded] = useState(false);
  const [autoRecordAdjustTx, setAutoRecordAdjustTx] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const totalIncludedBalance = wallets
    .filter((w) => !w.isExcludedFromTotal)
    .reduce((sum, w) => sum + w.balance, 0);

  const totalExcludedBalance = wallets
    .filter((w) => w.isExcludedFromTotal)
    .reduce((sum, w) => sum + w.balance, 0);

  const openCreateModal = () => {
    const defaultBrand = BANK_BRANDS[0];
    setName(defaultBrand.shortName);
    setWalletType('BANK');
    setBalanceStr('');
    setIcon(defaultBrand.id);
    setColor(defaultBrand.primaryColor);
    setIsExcluded(false);
    setErrorMsg('');
    setViewMode('CREATE');
  };

  const openEditModal = (w: Wallet) => {
    setSelectedWallet(w);
    setName(w.name);
    setWalletType(w.type || 'BANK');
    setIcon(w.icon);
    setColor(w.color);
    setIsExcluded(w.isExcludedFromTotal);
    setErrorMsg('');
    setViewMode('EDIT');
  };

  const openAdjustModal = (w: Wallet) => {
    setSelectedWallet(w);
    setBalanceStr(w.balance.toString());
    setAutoRecordAdjustTx(true);
    setErrorMsg('');
    setViewMode('ADJUST');
  };

  const openTransferModal = (w: Wallet) => {
    if (sortedWallets.length <= 1) {
      setWalletNotice({
        message: 'Bạn cần có ít nhất 2 tài khoản / ví để thực hiện chuyển tiền giữa các ví.',
        type: 'warning'
      });
      setTimeout(() => setWalletNotice(null), 3500);
      return;
    }
    setSelectedWallet(w);
    const otherWallet = sortedWallets.find((x) => x.id !== w.id);
    setToWalletId(otherWallet ? otherWallet.id : '');
    setBalanceStr('');
    setTransferFeeStr('0');
    setTransferDate(getCurrentDate());
    setTransferNote('');
    setErrorMsg('');
    setViewMode('TRANSFER');
  };

  const handleSelectBrandLogo = (brandId: string) => {
    const brand = BANK_BRANDS.find((b) => b.id === brandId);
    if (!brand) return;
    setIcon(brand.id);
    setColor(brand.primaryColor);
    if (brand.category === 'BANK') setWalletType('BANK');
    else if (brand.category === 'EWALLET') setWalletType('E_WALLET');
    else if (brand.category === 'CARD') setWalletType('CREDIT');
    else setWalletType('CASH');

    // Tự động gợi ý tên ngân hàng/ví điện tử nếu ô tên đang trống hoặc đang là tên của 1 ngân hàng khác
    const isCurrentNameDefaultOrBrand =
      !name.trim() ||
      BANK_BRANDS.some(
        (b) =>
          b.shortName.toLowerCase() === name.trim().toLowerCase() ||
          b.name.toLowerCase() === name.trim().toLowerCase()
      );
    if (isCurrentNameDefaultOrBrand) {
      setName(brand.shortName);
    }
  };

  const handleCreateWallet = async () => {
    if (!name.trim()) {
      setErrorMsg('Vui lòng nhập tên tài khoản / ví');
      return;
    }
    const initBal = Number(balanceStr.replace(/[^0-9-]/g, '')) || 0;
    try {
      await createWallet({
        name: name.trim(),
        type: walletType,
        initialBalance: initBal,
        icon,
        color,
        isExcludedFromTotal: isExcluded,
        order: wallets.length
      });
      setWalletNotice({
        message: `Đã tạo tài khoản "${name.trim()}" thành công!`,
        type: 'success'
      });
      setTimeout(() => setWalletNotice(null), 3000);
      setViewMode('LIST');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi tạo ví');
    }
  };

  const handleSaveEditWallet = async () => {
    if (!selectedWallet) return;
    if (!name.trim()) {
      setErrorMsg('Tên tài khoản / ví không được để trống');
      return;
    }
    await db.wallets.update(selectedWallet.id, {
      name: name.trim(),
      type: walletType,
      icon,
      color,
      isExcludedFromTotal: isExcluded,
      updatedAt: new Date().toISOString()
    });
    setWalletNotice({
      message: `Đã cập nhật tài khoản "${name.trim()}"!`,
      type: 'success'
    });
    setTimeout(() => setWalletNotice(null), 3000);
    setViewMode('LIST');
  };

  const handleConfirmAdjustBalance = async () => {
    if (!selectedWallet) return;
    const newBal = Number(balanceStr.replace(/[^0-9-]/g, ''));
    if (isNaN(newBal)) {
      setErrorMsg('Số dư không hợp lệ');
      return;
    }
    try {
      await adjustWalletBalance({
        walletId: selectedWallet.id,
        newBalance: newBal,
        autoCreateAdjustmentTx: autoRecordAdjustTx,
        date: getCurrentDate(),
        time: getCurrentTime()
      });
      setWalletNotice({
        message: `Đã điều chỉnh số dư tài khoản "${selectedWallet.name}"!`,
        type: 'success'
      });
      setTimeout(() => setWalletNotice(null), 3000);
      setViewMode('LIST');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi điều chỉnh số dư');
    }
  };

  const handleDeleteWallet = async (w: Wallet) => {
    if (
      window.confirm(
        `Xác nhận xóa tài khoản "${w.name}"? (Lưu ý: Không thể xóa ví đang chứa giao dịch)`
      )
    ) {
      try {
        await deleteWallet(w.id);
        setWalletNotice({
          message: `Đã xóa tài khoản "${w.name}"!`,
          type: 'success'
        });
        setTimeout(() => setWalletNotice(null), 3000);
      } catch (err: any) {
        setWalletNotice({
          message: err?.message || 'Không thể xóa tài khoản',
          type: 'error'
        });
        setTimeout(() => setWalletNotice(null), 3500);
      }
    }
  };

  const handleSwapWallets = () => {
    if (!selectedWallet || !toWalletId) return;
    const targetWallet = wallets.find((w) => w.id === toWalletId);
    if (targetWallet) {
      const prevFrom = selectedWallet;
      setSelectedWallet(targetWallet);
      setToWalletId(prevFrom.id);
    }
  };

  const handleExecuteTransfer = async () => {
    if (!selectedWallet) return;
    if (!toWalletId || toWalletId === selectedWallet.id) {
      setErrorMsg('Vui lòng chọn ví nhận tiền khác với ví gửi');
      return;
    }
    const amt = Number(balanceStr.replace(/[^0-9]/g, '')) || 0;
    if (amt <= 0) {
      setErrorMsg('Vui lòng nhập số tiền chuyển hợp lệ (> 0đ)');
      return;
    }
    const fee = Number(transferFeeStr.replace(/[^0-9]/g, '')) || 0;

    try {
      const toWallet = wallets.find((w) => w.id === toWalletId);
      await createTransaction({
        type: 'TRANSFER',
        amount: amt,
        transferFee: fee,
        walletId: selectedWallet.id,
        toWalletId: toWalletId,
        date: transferDate || getCurrentDate(),
        time: getCurrentTime(),
        note:
          transferNote.trim() ||
          `Chuyển tiền sang ${toWallet?.name || 'tài khoản khác'}`,
        categoryId: ''
      });
      window.dispatchEvent(new Event('local-data-changed'));
      setWalletNotice({
        message: `Đã chuyển ${formatVND(amt)} sang "${toWallet?.name || 'ví nhận'}" thành công!`,
        type: 'success'
      });
      setTimeout(() => setWalletNotice(null), 3000);
      setViewMode('LIST');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi xảy ra khi thực hiện chuyển tiền');
    }
  };

  // ==========================================
  // MÀN HÌNH PHẲNG CON: THÊM HOẶC SỬA TÀI KHOẢN / VÍ
  // ==========================================
  if (viewMode === 'CREATE' || viewMode === 'EDIT') {
    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4 animate-fade-in">
        {/* Header điều hướng phẳng cân đối */}
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-xs font-extrabold text-slate-100 uppercase tracking-wider text-center flex-1 truncate mx-2">
            {viewMode === 'CREATE' ? 'Thêm tài khoản / ví mới' : 'Chỉnh sửa tài khoản / ví'}
          </span>
          <div className="w-9" />
        </div>

        <div className="bg-slate-900/90 rounded-3xl border border-white/10 p-4 sm:p-5 flex flex-col gap-4 shadow-xl">
          {/* 1. Chọn Logo Ngân hàng / Ví điện tử dạng từng Dropdown dọc (bấm cái nào mở cuộn bên dưới) */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              1. Chọn Logo Ngân hàng / Ví điện tử
            </label>
            <BankBrandAccordionPicker
              selectedBrandId={icon}
              onSelectBrand={(brand) => handleSelectBrandLogo(brand.id)}
            />
          </div>

          {/* 2. Tên Ví & Phân loại (Dropdown chuẩn không dàn ngang) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                2. Tên tài khoản / Ví
              </label>
              <input
                type="text"
                placeholder="VD: Vietcombank, Techcombank, Ví MoMo..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-ios"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                Loại tài khoản
              </label>
              <CustomSelect
                value={walletType}
                onChange={(val) => setWalletType(val as WalletType)}
                options={[
                  { value: 'BANK', label: '🏦 Tài khoản Ngân hàng' },
                  { value: 'E_WALLET', label: '📱 Ví điện tử (MoMo, ZaloPay...)' },
                  { value: 'CASH', label: '💵 Tiền mặt' },
                  { value: 'CREDIT', label: '💳 Thẻ tín dụng / Quốc tế' }
                ]}
                triggerClassName="bg-slate-800 font-medium"
              />
            </div>
          </div>

          {/* 3. Số dư khởi tạo (khi thêm mới) */}
          {viewMode === 'CREATE' && (
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                3. Số dư ban đầu (VNĐ)
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={balanceStr}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setBalanceStr(raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '');
                }}
                className="input-ios font-extrabold text-xl text-emerald-400"
              />
            </div>
          )}

          {/* 4. Màu sắc đại diện */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
              Màu sắc viền / thẻ
            </label>
            <div className="flex gap-2 flex-wrap">
              {WALLET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="touch-btn w-8 h-8 rounded-full cursor-pointer flex items-center justify-center transition-transform"
                  style={{
                    backgroundColor: c,
                    border: color === c ? '2.5px solid #fff' : '2px solid transparent'
                  }}
                >
                  {color === c && <Check size={14} color="#fff" />}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Tùy chọn Không tính vào tổng tài sản */}
          <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-white/6 cursor-pointer">
            <input
              type="checkbox"
              checked={isExcluded}
              onChange={(e) => setIsExcluded(e.target.checked)}
              className="w-4.5 h-4.5 accent-emerald-500"
            />
            <div>
              <div className="text-[13px] font-semibold text-slate-100">
                Không tính vào tổng số dư khả dụng
              </div>
              <div className="text-[11px] text-slate-400">
                Dùng cho Sổ tiết kiệm dài hạn, Quỹ đen hoặc Tài khoản giữ hộ
              </div>
            </div>
          </label>

          {errorMsg && (
            <Toast
              message={errorMsg}
              type="error"
              onClose={() => setErrorMsg('')}
            />
          )}

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className="touch-btn py-3.5 px-5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm border-none cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={viewMode === 'CREATE' ? handleCreateWallet : handleSaveEditWallet}
              className="touch-btn flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-none py-3.5 rounded-2xl text-sm font-black cursor-pointer shadow-lg shadow-emerald-500/25"
            >
              {viewMode === 'CREATE' ? 'Tạo tài khoản / ví ngay' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MÀN HÌNH PHẲNG CON: ĐIỀU CHỈNH SỐ DƯ THỰC TẾ
  // ==========================================
  if (viewMode === 'ADJUST' && selectedWallet) {
    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4 animate-fade-in">
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-xs font-extrabold text-slate-100 uppercase tracking-wider text-center flex-1 truncate mx-2">
            Điều chỉnh số dư thực tế
          </span>
          <div className="w-9" />
        </div>

        <div className="bg-slate-900/90 rounded-3xl border border-white/10 p-5 flex flex-col gap-4 shadow-xl">
          <div className="p-3.5 rounded-2xl bg-slate-800/70 border border-white/6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CategoryIcon
                name={selectedWallet.icon}
                walletName={selectedWallet.name}
                size={24}
                color={selectedWallet.color}
              />
              <div>
                <div className="text-xs text-slate-400">Tài khoản đang chọn</div>
                <div className="text-sm font-bold text-slate-100">{selectedWallet.name}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">Số dư trên sổ</div>
              <div className="text-sm font-bold text-slate-200">
                {formatVND(selectedWallet.balance)}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
              Nhập số dư thực tế hiện tại (VNĐ)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={
                balanceStr
                  ? new Intl.NumberFormat('vi-VN').format(
                      Number(balanceStr.replace(/[^0-9]/g, '')) || 0
                    )
                  : ''
              }
              onChange={(e) => setBalanceStr(e.target.value.replace(/[^0-9]/g, ''))}
              className="input-ios text-2xl font-extrabold text-sky-400"
              autoFocus
            />
          </div>

          <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-white/6 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRecordAdjustTx}
              onChange={(e) => setAutoRecordAdjustTx(e.target.checked)}
              className="w-4.5 h-4.5 accent-sky-400"
            />
            <div>
              <div className="text-[13px] font-semibold text-slate-100">
                Tự động tạo giao dịch Điều chỉnh số dư
              </div>
              <div className="text-[11px] text-slate-400">
                Ghi nhận phần chênh lệch vào lịch sử giao dịch để minh bạch sổ sách
              </div>
            </div>
          </label>

          {errorMsg && (
            <Toast
              message={errorMsg}
              type="error"
              onClose={() => setErrorMsg('')}
            />
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className="touch-btn py-3.5 px-5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm border-none cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirmAdjustBalance}
              className="touch-btn flex-1 bg-sky-500 hover:bg-sky-400 text-slate-950 border-none py-3.5 rounded-2xl text-sm font-black cursor-pointer shadow-lg shadow-sky-500/25"
            >
              Xác nhận khớp số dư
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MÀN HÌNH PHẲNG CON: CHUYỂN TIỀN GIỮA CÁC VÍ
  // ==========================================
  if (viewMode === 'TRANSFER' && selectedWallet) {
    const currentAmt = Number(balanceStr.replace(/[^0-9]/g, '')) || 0;
    const currentFee = Number(transferFeeStr.replace(/[^0-9]/g, '')) || 0;
    const targetWallet = wallets.find((w) => w.id === toWalletId);

    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4 animate-fade-in">
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-xs font-extrabold text-slate-100 uppercase tracking-wider text-center flex-1 truncate mx-2">
            Chuyển tiền giữa các ví
          </span>
          <div className="w-9" />
        </div>

        <div className="bg-slate-900/90 rounded-3xl border border-white/10 p-5 flex flex-col gap-4 shadow-xl">
          {/* Khung chuyển từ ví này sang ví kia */}
          <div className="flex flex-col gap-2">
            {/* Ví chuyển (Từ) */}
            <div className="p-3.5 rounded-2xl bg-slate-800/70 border border-white/6 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <CategoryIcon
                  name={selectedWallet.icon}
                  walletName={selectedWallet.name}
                  size={24}
                  color={selectedWallet.color}
                />
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Chuyển từ tài khoản
                  </span>
                  <span className="text-sm font-bold text-slate-100 truncate block">
                    {selectedWallet.name}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[11px] text-slate-400 block">Số dư hiện tại</span>
                <span className="text-xs font-bold text-emerald-400">
                  {formatVND(selectedWallet.balance)}
                </span>
              </div>
            </div>

            {/* Nút Hoán đổi 2 ví */}
            <div className="flex justify-center -my-2.5 relative z-10">
              <button
                type="button"
                onClick={handleSwapWallets}
                title="Đảo chiều ví chuyển"
                className="touch-btn w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 border border-white/15 text-sky-400 flex items-center justify-center shadow-lg transition-transform active:scale-90 cursor-pointer"
              >
                <ArrowUpDown size={16} />
              </button>
            </div>

            {/* Ví nhận (Đến) */}
            <div>
              <WalletSelect
                wallets={wallets}
                selectedWalletId={toWalletId}
                onSelect={setToWalletId}
                excludeWalletId={selectedWallet.id}
                label="Đến tài khoản nhận"
              />
            </div>
          </div>

          {/* Số tiền chuyển */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase">
                Số tiền chuyển (VNĐ)
              </label>
              {selectedWallet.balance > 0 && (
                <button
                  type="button"
                  onClick={() => setBalanceStr(selectedWallet.balance.toString())}
                  className="text-xs font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
                >
                  Chuyển tất cả ({formatVND(selectedWallet.balance)})
                </button>
              )}
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={
                balanceStr
                  ? new Intl.NumberFormat('vi-VN').format(
                      Number(balanceStr.replace(/[^0-9]/g, '')) || 0
                    )
                  : ''
              }
              onChange={(e) => setBalanceStr(e.target.value.replace(/[^0-9]/g, ''))}
              className="input-ios text-2xl font-extrabold text-sky-400"
            />

            {/* Quick Amount Chips */}
            <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-none">
              {[50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    const curr = Number(balanceStr.replace(/[^0-9]/g, '')) || 0;
                    setBalanceStr((curr + amt).toString());
                  }}
                  className="px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-white/6 text-xs font-semibold text-slate-300 hover:text-white shrink-0 cursor-pointer"
                >
                  +{formatVND(amt)}
                </button>
              ))}
            </div>
          </div>

          {/* Phí chuyển khoản */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase">
                Phí chuyển khoản (nếu có)
              </label>
              <span className="text-[11px] text-slate-400">
                Tổng trừ ví gửi: <strong className="text-rose-400">{formatVND(currentAmt + currentFee)}</strong>
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              {[
                { label: 'Miễn phí (0đ)', value: 0 },
                { label: '1.100 đ', value: 1100 },
                { label: '3.300 đ', value: 3300 },
                { label: '5.500 đ', value: 5500 }
              ].map((fee) => (
                <button
                  key={fee.value}
                  type="button"
                  onClick={() => setTransferFeeStr(fee.value.toString())}
                  className={`touch-btn py-2 px-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    currentFee === fee.value
                      ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                      : 'bg-slate-800/80 border-white/6 text-slate-300 hover:text-white'
                  }`}
                >
                  {fee.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Phí tùy chỉnh..."
              value={
                transferFeeStr && transferFeeStr !== '0'
                  ? new Intl.NumberFormat('vi-VN').format(
                      Number(transferFeeStr.replace(/[^0-9]/g, '')) || 0
                    )
                  : ''
              }
              onChange={(e) => setTransferFeeStr(e.target.value.replace(/[^0-9]/g, ''))}
              className="input-ios text-sm font-semibold"
            />
          </div>

          {/* Ngày chuyển & Ghi chú */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                Ngày chuyển
              </label>
              <DatePicker
                value={transferDate}
                onChange={setTransferDate}
                label="Ngày chuyển"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                Ghi chú
              </label>
              <input
                type="text"
                placeholder={`VD: Chuyển tiền sang ${targetWallet?.name || 'ví khác'}...`}
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                className="input-ios"
              />
            </div>
          </div>

          {errorMsg && (
            <Toast
              message={errorMsg}
              type="error"
              onClose={() => setErrorMsg('')}
            />
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className="touch-btn py-3.5 px-5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm border-none cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleExecuteTransfer}
              className="touch-btn flex-1 bg-sky-500 hover:bg-sky-400 text-slate-950 border-none py-3.5 rounded-2xl text-sm font-black cursor-pointer shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2"
            >
              <ArrowRightLeft size={16} />
              <span>Xác nhận chuyển tiền</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MÀN HÌNH PHẲNG CHÍNH: DANH SÁCH VÍ & NGÂN HÀNG
  // ==========================================
  return (
    <div className="pb-28">
      {walletNotice && (
        <Toast
          message={walletNotice.message}
          type={walletNotice.type}
          onClose={() => setWalletNotice(null)}
        />
      )}

      {/* 1. Thẻ Tổng tài sản */}
      <div className="mx-4 my-3 rounded-3xl p-5 bg-gradient-to-br from-emerald-500/15 to-slate-900/95 border border-emerald-500/30 shadow-xl backdrop-blur-md">
        <div className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
          Tổng tài sản tính vào báo cáo
        </div>
        <div className="font-heading text-3xl font-extrabold text-emerald-400 mt-1.5">
          {formatVND(totalIncludedBalance)}
        </div>

        {totalExcludedBalance > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-white/8 text-xs text-slate-400 flex items-center gap-1.5">
            <EyeOff size={14} />
            <span>
              Tài sản riêng / Tiết kiệm ẩn:{' '}
              <strong className="text-slate-200">{formatVND(totalExcludedBalance)}</strong>
            </span>
          </div>
        )}
      </div>

      {/* 2. Header Danh sách, Nút Sắp Xếp & Nút Thêm Ví */}
      <div className="flex justify-between items-center mx-4 mt-4 mb-2.5 px-1">
        <div className="flex items-center gap-2">
          {isReordering ? (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-sm font-bold text-emerald-400 m-0">
                Sắp xếp ví ({sortedWallets.length})
              </h3>
            </div>
          ) : (
            <h3 className="text-sm font-bold text-slate-200 m-0">
              DS Tài khoản ({sortedWallets.length})
            </h3>
          )}
        </div>

        <div className="flex items-center gap-2">
          {sortedWallets.length > 1 && (
            <button
              type="button"
              onClick={() => setIsReordering(!isReordering)}
              className={`touch-btn py-2 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                isReordering
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10'
              }`}
              title={isReordering ? 'Hoàn tất sắp xếp' : 'Thay đổi vị trí các ví'}
            >
              {isReordering ? (
                <>
                  <Check size={14} strokeWidth={3} />
                  <span>Xong</span>
                </>
              ) : (
                <>
                  <ArrowUpDown size={14} className="text-emerald-400" />
                  <span>Sắp xếp</span>
                </>
              )}
            </button>
          )}

          {!isReordering && (
            <button
              type="button"
              onClick={openCreateModal}
              className="touch-btn bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-none py-2 px-3.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Thêm Ví</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner hướng dẫn khi đang ở chế độ Sắp xếp */}
      {isReordering && (
        <div className="mx-4 mb-3 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <GripVertical size={16} className="text-emerald-400 shrink-0" />
            <span>
              Bấm <strong className="text-white">↑ Lên</strong> / <strong className="text-white">↓ Xuống</strong> hoặc nút <strong className="text-white">⇈ Lên đầu</strong> để gom ví hay dùng lên trước.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsReordering(false)}
            className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-lg text-[11px] cursor-pointer border-none shrink-0"
          >
            Lưu
          </button>
        </div>
      )}

      {/* 3. Danh sách các Ví kèm Logo Ngân hàng / Ví điện tử chính thức */}
      <div className="flex flex-col gap-3 px-4">
        {sortedWallets.map((w, index) => {
          const detectedBrand = detectBankBrand(w.icon, w.name);
          return (
            <div
              key={w.id}
              draggable={isReordering}
              onDragStart={(e) => {
                if (!isReordering) return;
                e.dataTransfer.setData('text/plain', w.id);
                setDraggedWalletId(w.id);
              }}
              onDragOver={(e) => {
                if (!isReordering) return;
                e.preventDefault();
              }}
              onDrop={async (e) => {
                if (!isReordering) return;
                e.preventDefault();
                const sourceId = e.dataTransfer.getData('text/plain') || draggedWalletId;
                if (!sourceId || sourceId === w.id) return;
                const currentIds = sortedWallets.map((x) => x.id);
                const fromIdx = currentIds.indexOf(sourceId);
                const toIdx = currentIds.indexOf(w.id);
                if (fromIdx !== -1 && toIdx !== -1) {
                  currentIds.splice(fromIdx, 1);
                  currentIds.splice(toIdx, 0, sourceId);
                  await reorderWallets(currentIds);
                }
                setDraggedWalletId(null);
              }}
              onDragEnd={() => setDraggedWalletId(null)}
              className={`rounded-2xl p-4 bg-slate-900/80 border transition-all ${
                isReordering
                  ? draggedWalletId === w.id
                    ? 'border-emerald-400/60 bg-emerald-500/10 scale-[0.98]'
                    : 'border-white/12 hover:border-emerald-500/40 cursor-grab active:cursor-grabbing'
                  : 'border-white/8 shadow-sm hover:border-white/15'
              }`}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Số thứ tự & Tay nắm kéo khi ở chế độ sắp xếp */}
                  {isReordering && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <GripVertical size={16} className="text-slate-500 shrink-0" />
                      <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-lg border border-emerald-500/25">
                        #{index + 1}
                      </span>
                    </div>
                  )}

                  {detectedBrand ? (
                    <BankLogo brand={detectedBrand} size={44} />
                  ) : (
                    <div
                      className="cat-badge shrink-0"
                      style={{ backgroundColor: `${w.color}22`, color: w.color }}
                    >
                      <CategoryIcon
                        name={w.icon}
                        walletName={w.name}
                        size={22}
                        color={w.color}
                      />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[15px] font-bold text-slate-100 truncate">
                        {w.name}
                      </span>
                      {detectedBrand && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-slate-300 font-semibold">
                          {detectedBrand.category === 'BANK'
                            ? 'Ngân hàng'
                            : detectedBrand.category === 'EWALLET'
                            ? 'Ví điện tử'
                            : detectedBrand.category === 'CARD'
                            ? 'Thẻ quốc tế'
                            : 'Tiền mặt / Vàng'}
                        </span>
                      )}
                      {w.isExcludedFromTotal && (
                        <span className="text-[10px] py-0.5 px-1.5 rounded-md bg-white/8 text-slate-400 flex items-center gap-1 shrink-0">
                          <EyeOff size={10} /> Ẩn tổng
                        </span>
                      )}
                    </div>
                    <div className="font-heading text-lg font-extrabold text-slate-100 mt-0.5">
                      {formatVND(w.balance)}
                    </div>
                  </div>
                </div>

                {/* Các nút hành động: Khi đang sắp xếp vs Khi ở chế độ thường */}
                {isReordering ? (
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {/* Nút Đưa lên đầu */}
                    <button
                      type="button"
                      onClick={() => void moveWalletPosition(w.id, 'TOP')}
                      disabled={index === 0}
                      title="Đưa lên đầu tiên"
                      className="touch-btn w-9 h-9 rounded-[10px] bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-emerald-400 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <ChevronsUp size={16} />
                    </button>
                    {/* Nút Lên 1 nấc */}
                    <button
                      type="button"
                      onClick={() => void moveWalletPosition(w.id, 'UP')}
                      disabled={index === 0}
                      title="Di chuyển lên trên"
                      className="touch-btn w-9 h-9 rounded-[10px] bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <ChevronUp size={16} />
                    </button>
                    {/* Nút Xuống 1 nấc */}
                    <button
                      type="button"
                      onClick={() => void moveWalletPosition(w.id, 'DOWN')}
                      disabled={index === sortedWallets.length - 1}
                      title="Di chuyển xuống dưới"
                      className="touch-btn w-9 h-9 rounded-[10px] bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="relative shrink-0 ml-2">
                    {/* Nút 3 chấm mở Tùy chọn ví */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuWallet(activeMenuWallet?.id === w.id ? null : w);
                      }}
                      title="Tùy chọn ví"
                      className={`touch-btn w-9 h-9 rounded-[10px] border flex items-center justify-center cursor-pointer transition-colors ${
                        activeMenuWallet?.id === w.id
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-sm'
                          : 'bg-slate-800/90 border-white/8 text-slate-300 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      <MoreVertical size={18} />
                    </button>

                    {/* Menu Popover trên Desktop (>= md) */}
                    {activeMenuWallet?.id === w.id && (
                      <>
                        <div
                          className="hidden md:block fixed inset-0 z-30"
                          onClick={() => setActiveMenuWallet(null)}
                        />
                        <div className="hidden md:block absolute right-0 top-full mt-1.5 w-60 bg-slate-900 border border-white/12 rounded-2xl shadow-2xl p-1.5 z-40 backdrop-blur-xl animate-fade-in divide-y divide-white/6">
                          <div className="py-1 flex flex-col gap-0.5">
                            {/* 1. Chuyển khoản */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuWallet(null);
                                openTransferModal(w);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/8 hover:text-white transition-colors cursor-pointer text-left"
                            >
                              <div className="w-6 h-6 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                                <ArrowRightLeft size={13} />
                              </div>
                              <span>Chuyển khoản (Chuyển ví)</span>
                            </button>

                            {/* 2. Điều chỉnh số dư */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuWallet(null);
                                openAdjustModal(w);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/8 hover:text-white transition-colors cursor-pointer text-left"
                            >
                              <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                                <SlidersHorizontal size={13} />
                              </div>
                              <span>Điều chỉnh số dư</span>
                            </button>

                            {/* 3. Chỉnh sửa */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuWallet(null);
                                openEditModal(w);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/8 hover:text-white transition-colors cursor-pointer text-left"
                            >
                              <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                                <Edit3 size={13} />
                              </div>
                              <span>Chỉnh sửa tài khoản</span>
                            </button>
                          </div>

                          {/* 4. Xóa (nếu còn > 1 ví) */}
                          {sortedWallets.length > 1 && (
                            <div className="pt-1 mt-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuWallet(null);
                                  handleDeleteWallet(w);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/15 hover:text-rose-300 transition-colors cursor-pointer text-left"
                              >
                                <div className="w-6 h-6 rounded-lg bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                                  <Trash2 size={13} />
                                </div>
                                <span>Xóa tài khoản</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Gợi ý mẹo sử dụng */}
      <div className="mx-4 mt-4 p-3.5 rounded-2xl bg-sky-400/8 border border-sky-400/20 flex gap-2.5 items-start">
        <ShieldAlert size={18} className="text-sky-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 leading-relaxed">
          <strong className="text-slate-200">Mẹo sắp xếp:</strong> Bạn có thể bấm nút{' '}
          <strong className="text-emerald-400">Sắp xếp</strong> ở góc phải để đưa các ví thường xuyên giao dịch (như Tiền mặt, Grab, MoMo) lên đầu trang, giúp việc chọn ví khi ghi chép nhanh hơn.
        </div>
      </div>

      {/* 3. Popup Bottom Sheet Tác vụ Ví trên Mobile (< md) */}
      {activeMenuWallet && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop tối mờ phía sau */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setActiveMenuWallet(null)}
          />

          {/* Khung nội dung popup trồi từ dưới lên */}
          <div className="relative bg-slate-900 border-t border-white/12 rounded-t-3xl p-5 pb-8 shadow-2xl animate-slide-up flex flex-col gap-3 max-w-lg mx-auto w-full safe-nav-bottom">
            {/* Thanh kéo nhỏ ở đỉnh */}
            <div className="w-10 h-1 bg-white/25 rounded-full mx-auto mb-1" />

            {/* Thông tin ví đang chọn */}
            <div className="flex items-center justify-between pb-3 border-b border-white/8">
              <div className="flex items-center gap-3 min-w-0">
                <CategoryIcon
                  name={activeMenuWallet.icon}
                  walletName={activeMenuWallet.name}
                  size={26}
                  color={activeMenuWallet.color}
                />
                <div className="min-w-0">
                  <div className="text-base font-extrabold text-slate-100 truncate">
                    {activeMenuWallet.name}
                  </div>
                  <div className="text-xs text-slate-400 font-medium">
                    Số dư:{' '}
                    <span className="text-emerald-400 font-bold">
                      {formatVND(activeMenuWallet.balance)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveMenuWallet(null)}
                className="touch-btn w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer border border-white/6"
                title="Đóng"
              >
                <X size={16} />
              </button>
            </div>

            {/* Danh sách các chức năng */}
            <div className="flex flex-col gap-2 pt-1">
              {/* 1. Chuyển khoản */}
              <button
                type="button"
                onClick={() => {
                  const target = activeMenuWallet;
                  setActiveMenuWallet(null);
                  openTransferModal(target);
                }}
                className="touch-btn w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-white/6 flex items-center justify-between text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-400 flex items-center justify-center shrink-0">
                    <ArrowRightLeft size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-100">Chuyển khoản (Chuyển ví)</div>
                    <div className="text-xs text-slate-400">
                      Chuyển tiền sang ví hoặc tài khoản khác
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-500 shrink-0 ml-2" />
              </button>

              {/* 2. Điều chỉnh số dư */}
              <button
                type="button"
                onClick={() => {
                  const target = activeMenuWallet;
                  setActiveMenuWallet(null);
                  openAdjustModal(target);
                }}
                className="touch-btn w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-white/6 flex items-center justify-between text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 flex items-center justify-center shrink-0">
                    <SlidersHorizontal size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-100">Điều chỉnh số dư</div>
                    <div className="text-xs text-slate-400">Cân đối lại số dư cho khớp với thực tế</div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-500 shrink-0 ml-2" />
              </button>

              {/* 3. Chỉnh sửa */}
              <button
                type="button"
                onClick={() => {
                  const target = activeMenuWallet;
                  setActiveMenuWallet(null);
                  openEditModal(target);
                }}
                className="touch-btn w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-white/6 flex items-center justify-between text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 flex items-center justify-center shrink-0">
                    <Edit3 size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-100">Chỉnh sửa tài khoản</div>
                    <div className="text-xs text-slate-400">
                      Đổi tên, loại ví, màu sắc & logo ngân hàng
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-500 shrink-0 ml-2" />
              </button>

              {/* 4. Xóa (chỉ khi có nhiều hơn 1 ví) */}
              {sortedWallets.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const target = activeMenuWallet;
                    setActiveMenuWallet(null);
                    handleDeleteWallet(target);
                  }}
                  className="touch-btn w-full p-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 flex items-center justify-between text-left cursor-pointer transition-colors mt-0.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                      <Trash2 size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-rose-300">Xóa tài khoản này</div>
                      <div className="text-xs text-rose-400/80">Chỉ xóa được khi chưa có giao dịch</div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-rose-500/60 shrink-0 ml-2" />
                </button>
              )}
            </div>

            {/* Nút Đóng */}
            <button
              type="button"
              onClick={() => setActiveMenuWallet(null)}
              className="touch-btn w-full py-3.5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm mt-1 hover:bg-slate-700 cursor-pointer border border-white/6"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletsTab;
