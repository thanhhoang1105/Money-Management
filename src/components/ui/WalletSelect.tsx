// src/components/ui/WalletSelect.tsx
import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Check, Plus, X } from 'lucide-react';
import type { Wallet, WalletType } from '../../types';
import { CategoryIcon } from '../CategoryIcon';
import {
  BANK_BRANDS,
  BankBrandAccordionPicker,
  type BankBrandInfo
} from '../BankLogo';
import { formatVND } from '../../utils/formatters';
import { createWallet } from '../../services/transactionService';

interface WalletSelectProps {
  wallets: Wallet[];
  selectedWalletId: string;
  onSelect: (walletId: string) => void;
  label?: string;
  excludeWalletId?: string;
}

export const WalletSelect: React.FC<WalletSelectProps> = ({
  wallets,
  selectedWalletId,
  onSelect,
  label = 'Tài khoản / Ví',
  excludeWalletId
}) => {
  const [open, setOpen] = useState(false);

  // Chế độ tạo ví nhanh phẳng (Inline) ngay bên dưới mà không bật Popup
  const [isAddingWallet, setIsAddingWallet] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBalanceStr, setNewBalanceStr] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<BankBrandInfo>(BANK_BRANDS[0]);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const availableWallets = excludeWalletId
    ? wallets.filter((w) => w.id !== excludeWalletId)
    : wallets;

  const selectedWallet =
    availableWallets.find((w) => w.id === selectedWalletId) || availableWallets[0];

  const handleSelectBrand = (brand: BankBrandInfo) => {
    setSelectedBrand(brand);
    const isPrevBrandName = BANK_BRANDS.some(
      (b) => b.shortName.toLowerCase() === newName.trim().toLowerCase()
    );
    if (!newName.trim() || isPrevBrandName) {
      setNewName(brand.shortName);
    }
  };

  const handleQuickCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setErrorMsg('Vui lòng nhập tên ví (VD: Vietcombank, MoMo...)');
      return;
    }

    const rawDigits = newBalanceStr.replace(/\D/g, '');
    const initialBalance = rawDigits ? parseInt(rawDigits, 10) : 0;

    const walletType: WalletType =
      selectedBrand.category === 'BANK'
        ? 'BANK'
        : selectedBrand.category === 'EWALLET'
        ? 'E_WALLET'
        : selectedBrand.category === 'CARD'
        ? 'CREDIT'
        : 'CASH';

    try {
      setIsSaving(true);
      const created = await createWallet({
        name: trimmedName,
        type: walletType,
        initialBalance,
        icon: selectedBrand.id,
        color: selectedBrand.primaryColor,
        isExcludedFromTotal: false
      });

      onSelect(created.id);
      setIsAddingWallet(false);
      setNewName('');
      setNewBalanceStr('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tạo ví mới');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="w-full p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800/90 border border-white/10 hover:border-sky-400/40 flex flex-col justify-between text-left cursor-pointer transition-all group outline-none focus:ring-2 focus:ring-sky-500/40"
          >
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {label}
            </span>
            <div className="flex items-center justify-between gap-2 mt-1 w-full">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${selectedWallet?.color || '#10B981'}22`
                  }}
                >
                  <CategoryIcon
                    name={selectedWallet?.icon || 'Wallet'}
                    walletName={selectedWallet?.name}
                    size={15}
                    color={selectedWallet?.color || '#10B981'}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-100 truncate">
                    {selectedWallet?.name || 'Chọn ví'}
                  </div>
                  {selectedWallet && (
                    <div className="text-[10px] text-slate-400 truncate">
                      {formatVND(selectedWallet.balance)}
                    </div>
                  )}
                </div>
              </div>
              <ChevronDown
                size={15}
                className="text-slate-400 group-hover:text-sky-400 shrink-0 transition-transform duration-200"
              />
            </div>
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            align="start"
            className="z-[110] w-68 rounded-2xl bg-slate-900 border border-white/15 shadow-2xl p-2 text-slate-100 animate-fade-in"
          >
            <div className="px-2.5 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-white/8 mb-1">
              Chọn Tài Khoản / Ví
            </div>

            <div className="max-h-60 overflow-y-auto flex flex-col gap-1 pr-0.5">
              {availableWallets.map((w) => {
                const isSelected = w.id === selectedWallet?.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      onSelect(w.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-left cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-sky-500/20 border border-sky-400/40 text-white'
                        : 'hover:bg-slate-800 text-slate-300 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${w.color}25` }}
                      >
                        <CategoryIcon
                          name={w.icon}
                          walletName={w.name}
                          size={16}
                          color={w.color}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{w.name}</div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {formatVND(w.balance)}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check size={15} className="text-sky-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Nút mở khung tạo ví phẳng ngay bên dưới */}
            <div className="pt-1.5 mt-1 border-t border-white/8">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setErrorMsg('');
                  setNewName(BANK_BRANDS[0].shortName);
                  setSelectedBrand(BANK_BRANDS[0]);
                  setIsAddingWallet(true);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold cursor-pointer transition-colors"
              >
                <Plus size={15} />
                <span>Tạo tài khoản / ví mới</span>
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Khung tạo ví nhanh phẳng (Inline) không dùng Popup */}
      {isAddingWallet && (
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-emerald-500/30 flex flex-col gap-3 animate-fade-in col-span-2">
          <div className="flex items-center justify-between border-b border-white/8 pb-2">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              + Thêm nhanh Ngân hàng / Ví mới
            </span>
            <button
              type="button"
              onClick={() => setIsAddingWallet(false)}
              className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center border-none cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
              Chọn Logo Ngân hàng / Ví điện tử
            </label>
            <BankBrandAccordionPicker
              selectedBrandId={selectedBrand.id}
              onSelectBrand={handleSelectBrand}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                Tên ví / tài khoản
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="VD: Vietcombank, MoMo..."
                className="input-ios w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                Số dư ban đầu (VNĐ)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={newBalanceStr}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  setNewBalanceStr(
                    digits ? parseInt(digits, 10).toLocaleString('vi-VN') : ''
                  );
                }}
                placeholder="0"
                className="input-ios w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-xs font-bold text-emerald-400"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddingWallet(false)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold border-none cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleQuickCreateWallet}
              className="px-4 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold border-none cursor-pointer"
            >
              {isSaving ? 'Đang tạo...' : 'Lưu ví mới'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletSelect;
