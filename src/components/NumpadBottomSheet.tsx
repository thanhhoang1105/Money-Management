// src/components/NumpadBottomSheet.tsx
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Delete, Check, SlidersHorizontal } from 'lucide-react';
import type { TransactionType } from '../types';
import { formatVND } from '../utils/formatters';

interface NumpadBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  type?: TransactionType;
  amountStr: string;
  computedAmount: number;
  hasOperator: boolean;
  onKeyPress: (key: string) => void;
  currentWalletBalance?: number;
  adjustDiff?: number;
  badgeLabel?: string;
  badgeStyle?: string;
  amountColor?: string;
}

export const NumpadBottomSheet: React.FC<NumpadBottomSheetProps> = ({
  isOpen,
  onClose,
  type = 'EXPENSE',
  amountStr,
  computedAmount,
  hasOperator,
  onKeyPress,
  currentWalletBalance,
  adjustDiff = 0,
  badgeLabel,
  badgeStyle,
  amountColor
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        onKeyPress(e.key);
      } else if (['+', '-', '*', '/'].includes(e.key)) {
        e.preventDefault();
        onKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onKeyPress('BACKSPACE');
      } else if (e.key === 'c' || e.key === 'C') {
        onKeyPress('CLEAR');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onKeyPress, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const getTypeLabel = () => {
    if (badgeLabel) return badgeLabel;
    switch (type) {
      case 'EXPENSE':
        return 'Chi tiền';
      case 'INCOME':
        return 'Thu tiền';
      case 'LEND':
        return 'Cho vay';
      case 'BORROW':
        return 'Đi vay';
      case 'COLLECT_DEBT':
        return 'Thu nợ';
      case 'PAY_DEBT':
        return 'Trả nợ';
      case 'TRANSFER':
        return 'Chuyển khoản';
      case 'ADJUST':
        return 'Số dư mới';
      default:
        return 'Số tiền';
    }
  };

  const getTypeBadgeStyle = () => {
    if (badgeStyle) return badgeStyle;
    switch (type) {
      case 'EXPENSE':
      case 'PAY_DEBT':
        return 'bg-rose-500/15 border-rose-500/30 text-rose-300';
      case 'INCOME':
      case 'COLLECT_DEBT':
        return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
      case 'LEND':
        return 'bg-amber-500/15 border-amber-500/30 text-amber-300';
      case 'BORROW':
        return 'bg-purple-500/15 border-purple-500/30 text-purple-300';
      case 'TRANSFER':
        return 'bg-sky-500/15 border-sky-400/30 text-sky-300';
      default:
        return 'bg-slate-700 border-white/10 text-slate-300';
    }
  };

  const getAmountColor = () => {
    if (amountColor) return amountColor;
    switch (type) {
      case 'EXPENSE':
      case 'PAY_DEBT':
        return 'text-rose-400';
      case 'INCOME':
      case 'COLLECT_DEBT':
        return 'text-emerald-400';
      case 'LEND':
        return 'text-amber-400';
      case 'BORROW':
        return 'text-purple-400';
      case 'TRANSFER':
        return 'text-sky-400';
      default:
        return 'text-slate-100';
    }
  };

  const getSaveButtonStyle = () => {
    if (amountColor?.includes('amber') || badgeStyle?.includes('amber')) {
      return 'bg-gradient-to-r from-amber-500 to-amber-600 shadow-amber-500/30';
    }
    if (amountColor?.includes('emerald') || badgeStyle?.includes('emerald')) {
      return 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-500/30';
    }
    if (amountColor?.includes('purple') || badgeStyle?.includes('purple')) {
      return 'bg-gradient-to-r from-purple-500 to-purple-600 shadow-purple-500/30';
    }
    if (amountColor?.includes('sky') || badgeStyle?.includes('sky')) {
      return 'bg-gradient-to-r from-sky-500 to-sky-600 shadow-sky-500/30';
    }
    switch (type) {
      case 'EXPENSE':
      case 'PAY_DEBT':
        return 'bg-gradient-to-r from-rose-500 to-rose-600 shadow-rose-500/30';
      case 'INCOME':
      case 'COLLECT_DEBT':
        return 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-500/30';
      case 'LEND':
        return 'bg-gradient-to-r from-amber-500 to-amber-600 shadow-amber-500/30';
      case 'BORROW':
        return 'bg-gradient-to-r from-purple-500 to-purple-600 shadow-purple-500/30';
      case 'TRANSFER':
        return 'bg-gradient-to-r from-sky-500 to-sky-600 shadow-sky-500/30';
      default:
        return 'bg-gradient-to-r from-slate-600 to-slate-700 shadow-slate-500/30';
    }
  };

  // Render trực tiếp vào document.body qua Portal và ghim thẳng fixed bottom-0 left-0 right-0
  return createPortal(
    <>
      {/* Lớp nền mờ chạm để đóng */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-[99] bg-black/55 backdrop-blur-[1px] md:hidden animate-fade-in"
      />

      {/* Khung bàn phím công thái học bám sát đáy màn hình */}
      <div
        className="fixed left-0 right-0 bottom-0 z-[100] w-full max-w-[480px] mx-auto bg-slate-900 border-t border-white/15 rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.75)] safe-nav-bottom animate-slide-up flex flex-col overflow-hidden md:hidden font-body select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Thanh nắm kéo tối giản */}
        <div
          className="w-full pt-2 pb-1 flex justify-center cursor-pointer"
          onClick={onClose}
        >
          <div className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>

        {/* Màn hình hiển thị số tiền gộp gọn gàng trên 1 thanh */}
        <div className="px-4 py-2.5 bg-slate-950/80 border-y border-white/8 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col items-start min-w-0">
              <div
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${getTypeBadgeStyle()}`}
              >
                {type === 'ADJUST' && <SlidersHorizontal size={12} />}
                <span>{getTypeLabel()}</span>
              </div>
              {hasOperator && (
                <div className="text-xs font-semibold text-sky-400 tracking-wide truncate max-w-[180px] mt-1">
                  {amountStr
                    .replace(/\*/g, ' × ')
                    .replace(/\//g, ' ÷ ')
                    .replace(/\+/g, ' + ')
                    .replace(/-/g, ' - ')}
                </div>
              )}
            </div>

            <div
              className={`font-heading text-2xl font-black tracking-tight leading-none text-right truncate ${getAmountColor()}`}
            >
              {formatVND(computedAmount)}
            </div>
          </div>

          {type === 'ADJUST' && currentWalletBalance !== undefined && (
            <div className="pt-1 border-t border-white/5 text-[11px] flex items-center justify-between font-medium">
              <span className="text-slate-400">Hiện tại: {formatVND(currentWalletBalance)}</span>
              <span
                className={
                  adjustDiff > 0
                    ? 'text-emerald-400 font-bold'
                    : adjustDiff < 0
                    ? 'text-rose-400 font-bold'
                    : 'text-slate-400'
                }
              >
                Chênh lệch: {adjustDiff > 0 ? `+${formatVND(adjustDiff)}` : formatVND(adjustDiff)}
              </span>
            </div>
          )}
        </div>

        {/* Lưới bàn phím công thái học 5x4 chuẩn 1 ngón cái (Cao 48px/phím) */}
        <div className="p-2.5 bg-slate-900">
          <div className="grid grid-cols-4 gap-2">
            {/* HÀNG 1: Xóa hết (C) | Chia (÷) | Nhân (×) | Xóa lùi (⌫) */}
            <button
              type="button"
              onClick={() => onKeyPress('C')}
              className="touch-btn h-11 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 font-heading text-base font-extrabold flex items-center justify-center cursor-pointer active:bg-rose-500/25"
              title="Xóa tất cả về 0"
            >
              C
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('÷')}
              className="touch-btn h-11 rounded-2xl bg-slate-800/90 border border-sky-400/20 font-heading text-lg font-black text-sky-400 flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              ÷
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('×')}
              className="touch-btn h-11 rounded-2xl bg-slate-800/90 border border-sky-400/20 font-heading text-lg font-black text-sky-400 flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              ×
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('BACKSPACE')}
              className="touch-btn h-11 rounded-2xl bg-slate-800/90 border border-rose-400/25 text-rose-400 flex items-center justify-center cursor-pointer active:bg-slate-700"
              title="Xóa lùi 1 số"
            >
              <Delete size={20} />
            </button>

            {/* HÀNG 2: 1 | 2 | 3 | Trừ (-) */}
            <button
              type="button"
              onClick={() => onKeyPress('1')}
              className="touch-btn h-12 rounded-2xl bg-slate-800 border border-white/8 font-heading text-xl font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              1
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('2')}
              className="touch-btn h-12 rounded-2xl bg-slate-800 border border-white/8 font-heading text-xl font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              2
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('3')}
              className="touch-btn h-12 rounded-2xl bg-slate-800 border border-white/8 font-heading text-xl font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              3
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('-')}
              className="touch-btn h-12 rounded-2xl bg-sky-500/15 border border-sky-400/25 font-heading text-xl font-black text-sky-400 flex items-center justify-center cursor-pointer active:bg-sky-500/25"
            >
              −
            </button>

            {/* HÀNG 3: 4 | 5 | 6 | Cộng (+) */}
            <button
              type="button"
              onClick={() => onKeyPress('4')}
              className="touch-btn h-12 rounded-2xl bg-slate-800 border border-white/8 font-heading text-xl font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              4
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('5')}
              className="touch-btn h-12 rounded-2xl bg-slate-800 border border-white/8 font-heading text-xl font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              5
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('6')}
              className="touch-btn h-12 rounded-2xl bg-slate-800 border border-white/8 font-heading text-xl font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              6
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('+')}
              className="touch-btn h-12 rounded-2xl bg-sky-500/15 border border-sky-400/25 font-heading text-xl font-black text-sky-400 flex items-center justify-center cursor-pointer active:bg-sky-500/25"
            >
              +
            </button>

            {/* HÀNG 4: 7 | 8 | 9 | = (Tính kết quả biểu thức) */}
            <button
              type="button"
              onClick={() => onKeyPress('7')}
              className="touch-btn h-12 rounded-2xl bg-slate-800 border border-white/8 font-heading text-xl font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              7
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('8')}
              className="touch-btn h-12 rounded-2xl bg-slate-800 border border-white/8 font-heading text-xl font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              8
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('9')}
              className="touch-btn h-12 rounded-2xl bg-slate-800 border border-white/8 font-heading text-xl font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              9
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('=')}
              className="touch-btn h-12 rounded-2xl bg-sky-500/15 border border-sky-400/25 text-sky-400 font-heading text-xl font-black flex items-center justify-center cursor-pointer active:bg-sky-500/25"
              title="Tính kết quả phép tính"
            >
              =
            </button>

            {/* HÀNG 5 (Đáy công thái học): 0 | 000 (Chính giữa) | XÁC NHẬN (Rộng 2 ô góc phải, chỉ xác nhận số tiền & đóng popup bàn phím) */}
            <button
              type="button"
              onClick={() => onKeyPress('0')}
              className="touch-btn h-12 rounded-2xl bg-slate-800 border border-white/8 font-heading text-xl font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('000')}
              className="touch-btn h-12 rounded-2xl bg-slate-800 border border-sky-400/25 font-heading text-base font-black text-sky-400 flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              000
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`col-span-2 touch-btn touch-bounce h-12 rounded-2xl text-white font-extrabold flex items-center justify-center gap-1.5 text-xs shadow-lg cursor-pointer border-none ${getSaveButtonStyle()}`}
            >
              <Check size={17} strokeWidth={2.8} />
              <span>XÁC NHẬN</span>
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default NumpadBottomSheet;
