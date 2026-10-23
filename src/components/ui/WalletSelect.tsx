import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Wallet as WalletIcon,
  ChevronDown,
  Plus,
  Check,
  X,
  Landmark,
  Smartphone
} from 'lucide-react';
import type { Wallet, WalletType } from '../../types';
import { formatVND } from '../../utils/formatters';
import { db } from '../../db';
import { generateUUID } from '../../utils/uuid';

interface WalletSelectProps {
  wallets: Wallet[];
  selectedWalletId: string;
  onSelect: (walletId: string) => void;
  label?: string;
  excludeWalletId?: string;
  className?: string;
}

const PRESET_COLORS = [
  '#00573D', // VCB Green
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#004B87', // Navy
  '#A50064', // MoMo Pink
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EE1C25'  // Techcom Red
];

export const WalletSelect: React.FC<WalletSelectProps> = ({
  wallets,
  selectedWalletId,
  onSelect,
  label = 'Tài khoản / Ví',
  excludeWalletId,
  className = ''
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Form tạo ví nhanh
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletType, setNewWalletType] = useState<WalletType>('BANK');
  const [newWalletBalance, setNewWalletBalance] = useState('0');
  const [newWalletColor, setNewWalletColor] = useState('#00573D');
  const [isSaving, setIsSaving] = useState(false);

  const availableWallets = excludeWalletId
    ? wallets.filter((w) => w.id !== excludeWalletId)
    : wallets;

  const currentWallet = wallets.find((w) => w.id === selectedWalletId);

  const handleOpenCreateModal = () => {
    setPopoverOpen(false);
    setNewWalletName('');
    setNewWalletType('BANK');
    setNewWalletBalance('0');
    setNewWalletColor('#00573D');
    setCreateModalOpen(true);
  };

  const handleQuickCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWalletName.trim()) {
      alert('Vui lòng nhập tên tài khoản!');
      return;
    }

    setIsSaving(true);
    try {
      const numBalance = Number(newWalletBalance.replace(/[^0-9-]/g, '')) || 0;
      const now = new Date().toISOString();
      const newId = generateUUID();

      let defaultIcon = 'Landmark';
      if (newWalletType === 'CASH') defaultIcon = 'Wallet';
      else if (newWalletType === 'E_WALLET') defaultIcon = 'Smartphone';
      else if (newWalletType === 'CREDIT') defaultIcon = 'CreditCard';
      else if (newWalletType === 'INVESTMENT') defaultIcon = 'TrendingUp';
      else if (newWalletType === 'OTHER') defaultIcon = 'Package';

      await db.wallets.add({
        id: newId,
        name: newWalletName.trim(),
        type: newWalletType,
        balance: numBalance,
        initialBalance: numBalance,
        currency: 'VND',
        icon: defaultIcon,
        color: newWalletColor,
        isExcludedFromTotal: false,
        createdAt: now,
        updatedAt: now
      });

      // Tự động chọn ví vừa tạo
      onSelect(newId);
      setCreateModalOpen(false);
    } catch (err: any) {
      alert('Không thể tạo ví: ' + (err?.message || 'Lỗi DB'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={`relative p-3 rounded-2xl bg-slate-900 border border-white/8 hover:border-sky-400/50 flex items-center justify-between text-left transition-all cursor-pointer outline-none focus:ring-2 focus:ring-sky-500/40 ${className}`}
          >
            <div className="truncate pr-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {label}
              </div>
              <div className="text-xs font-bold text-white truncate mt-0.5">
                {currentWallet?.name || 'Chọn ví'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {currentWallet ? formatVND(currentWallet.balance) : '0 ₫'}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                style={{ backgroundColor: currentWallet?.color || '#3B82F6' }}
              >
                <WalletIcon size={16} />
              </div>
              <ChevronDown size={14} className="text-slate-400" />
            </div>
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={8}
            className="z-[90] w-[300px] max-h-[380px] flex flex-col bg-slate-900/98 backdrop-blur-xl border border-white/12 rounded-2xl shadow-2xl p-2.5 text-slate-100 animate-fade-in outline-none focus:outline-none"
          >
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5 border-b border-white/10 mb-1">
              Chọn tài khoản thanh toán
            </div>

            {/* Danh sách các ví */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-1 py-1 max-h-[220px]">
              {availableWallets.map((w) => {
                const isSelected = w.id === selectedWalletId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      onSelect(w.id);
                      setPopoverOpen(false);
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all text-left ${
                      isSelected
                        ? 'bg-sky-500/20 border border-sky-400/40 text-white font-semibold'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
                        style={{ backgroundColor: w.color || '#3B82F6' }}
                      >
                        <WalletIcon size={14} />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold truncate text-white">{w.name}</div>
                        <div className="text-[10px] text-slate-400">{formatVND(w.balance)}</div>
                      </div>
                    </div>
                    {isSelected && <Check size={16} className="text-sky-400 shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>

            {/* Nút Tạo ví mới ngay tại chỗ */}
            <div className="pt-2 border-t border-white/10 mt-1">
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="w-full py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
              >
                <Plus size={15} strokeWidth={2.5} />
                <span>+ Thêm tài khoản mới</span>
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Modal Tạo ví nhanh (Dialog chuẩn Web cho cả PC & Mobile) */}
      <Dialog.Root open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-md animate-fade-in" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90%] max-w-[420px] bg-slate-900 border border-white/12 rounded-3xl shadow-2xl p-5 text-slate-100 animate-fade-in outline-none focus:outline-none">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Plus size={18} />
                </div>
                <Dialog.Title className="text-sm font-bold text-white uppercase tracking-wider">
                  Tạo tài khoản mới
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleQuickCreateWallet} className="flex flex-col gap-3.5">
              {/* Chọn loại ví */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Loại tài khoản
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { type: 'BANK' as const, label: 'Ngân hàng', icon: Landmark },
                    { type: 'CASH' as const, label: 'Tiền mặt', icon: WalletIcon },
                    { type: 'E_WALLET' as const, label: 'Ví điện tử', icon: Smartphone }
                  ].map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        setNewWalletType(item.type);
                        if (item.type === 'CASH') setNewWalletName('Tiền mặt');
                        else if (item.type === 'E_WALLET') setNewWalletName('MoMo');
                        else setNewWalletName('Vietcombank');
                      }}
                      className={`p-2 rounded-xl border flex flex-col items-center gap-1 text-[11px] font-semibold cursor-pointer transition-all ${
                        newWalletType === item.type
                          ? 'bg-sky-500/20 border-sky-400 text-sky-400 shadow-sm'
                          : 'bg-slate-800 border-white/5 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <item.icon size={16} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tên ví */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Tên tài khoản / Ngân hàng
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Vietcombank, Techcombank, Tiền mặt..."
                  value={newWalletName}
                  onChange={(e) => setNewWalletName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-white font-semibold text-sm outline-none focus:border-sky-400"
                  autoFocus
                />
              </div>

              {/* Số dư ban đầu */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Số dư ban đầu (VNĐ)
                </label>
                <input
                  type="text"
                  placeholder="0"
                  value={newWalletBalance}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9-]/g, '');
                    setNewWalletBalance(digits ? new Intl.NumberFormat('vi-VN').format(Number(digits)) : '');
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-emerald-400 font-bold text-base outline-none focus:border-emerald-400"
                />
              </div>

              {/* Màu sắc nhận diện */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Màu đại diện
                </label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewWalletColor(c)}
                      className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${
                        newWalletColor === c ? 'scale-125 ring-2 ring-white shadow-md' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Nút hành động */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/20"
                >
                  <Check size={16} strokeWidth={2.5} />
                  <span>{isSaving ? 'Đang tạo...' : 'Lưu tài khoản'}</span>
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
