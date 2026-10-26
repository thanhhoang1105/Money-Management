// src/components/WalletsTab.tsx
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Wallet, WalletType } from '../types';
import {
  createWallet,
  adjustWalletBalance,
  deleteWallet
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
import {
  Plus,
  Edit3,
  Trash2,
  EyeOff,
  Check,
  SlidersHorizontal,
  ShieldAlert,
  ArrowLeft
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

  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'EDIT' | 'ADJUST'>('LIST');
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);

  // Lắng nghe tín hiệu từ menu điều hướng để trở về danh sách ví chính
  React.useEffect(() => {
    if (resetSignal !== undefined && resetSignal > 0) {
      setViewMode('LIST');
      setSelectedWallet(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [resetSignal]);

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
        isExcludedFromTotal: isExcluded
      });
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
      } catch (err: any) {
        alert(err?.message || 'Không thể xóa tài khoản');
      }
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
            <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 text-xs font-semibold">
              {errorMsg}
            </div>
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
            <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 text-xs">{errorMsg}</div>
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
  // MÀN HÌNH PHẲNG CHÍNH: DANH SÁCH VÍ & NGÂN HÀNG
  // ==========================================
  return (
    <div className="pb-28">
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

      {/* 2. Header Danh sách & Nút Thêm Ví */}
      <div className="flex justify-between items-center mx-4 mt-4 mb-2.5 px-1">
        <h3 className="text-sm font-bold text-slate-200 m-0">
          DS Tài khoản ({wallets.length})
        </h3>
        <button
          type="button"
          onClick={openCreateModal}
          className="touch-btn bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-none py-2 px-3.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>Thêm Ví</span>
        </button>
      </div>

      {/* 3. Danh sách các Ví kèm Logo Ngân hàng / Ví điện tử chính thức */}
      <div className="flex flex-col gap-3 px-4">
        {wallets.map((w) => {
          const detectedBrand = detectBankBrand(w.icon, w.name);
          return (
            <div
              key={w.id}
              className="rounded-2xl p-4 bg-slate-900/80 border border-white/8 shadow-sm hover:border-white/15 transition-colors"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
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

                {/* Các nút hành động: Điều chỉnh số dư, Sửa, Xóa */}
                <div className="flex gap-1.5 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={() => openAdjustModal(w)}
                    title="Điều chỉnh số dư"
                    className="touch-btn w-9 h-9 rounded-[10px] bg-sky-400/12 border border-sky-400/25 text-sky-400 flex items-center justify-center cursor-pointer hover:bg-sky-400/20"
                  >
                    <SlidersHorizontal size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(w)}
                    title="Chỉnh sửa ví & đổi logo ngân hàng"
                    className="touch-btn w-9 h-9 rounded-[10px] bg-slate-800/90 border border-white/8 text-slate-400 flex items-center justify-center cursor-pointer hover:text-white"
                  >
                    <Edit3 size={16} />
                  </button>
                  {wallets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteWallet(w)}
                      title="Xóa ví"
                      className="touch-btn w-9 h-9 rounded-[10px] bg-rose-500/12 border border-rose-500/25 text-rose-400 flex items-center justify-center cursor-pointer hover:bg-rose-500/20"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Gợi ý mẹo sử dụng */}
      <div className="mx-4 mt-4 p-3.5 rounded-2xl bg-sky-400/8 border border-sky-400/20 flex gap-2.5 items-start">
        <ShieldAlert size={18} className="text-sky-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 leading-relaxed">
          <strong className="text-slate-200">Mẹo khớp tiền thực tế:</strong> Bấm vào biểu tượng{' '}
          <SlidersHorizontal size={12} className="inline align-middle text-sky-400" /> bên cạnh mỗi
          ví để <strong>Điều chỉnh số dư</strong> bất cứ khi nào số tiền thực tế trong ngân hàng / ví
          lệch so với sổ.
        </div>
      </div>
    </div>
  );
};

export default WalletsTab;
