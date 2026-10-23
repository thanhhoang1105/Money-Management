// src/components/NumpadBottomSheet.tsx
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Delete, Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { TransactionType } from '../types';
import { formatVND } from '../utils/formatters';

interface NumpadBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  type: TransactionType;
  amountStr: string;
  computedAmount: number;
  hasOperator: boolean;
  onKeyPress: (key: string) => void;
  onConfirmAndSave?: () => void;
  currentWalletBalance?: number;
  adjustDiff?: number;
}

export const NumpadBottomSheet: React.FC<NumpadBottomSheetProps> = ({
  isOpen,
  onClose,
  type,
  amountStr,
  computedAmount,
  hasOperator,
  onKeyPress,
  onConfirmAndSave,
  currentWalletBalance,
  adjustDiff = 0
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

  // Render trực tiếp vào document.body qua Portal và ghim thẳng fixed bottom-0 left-0 right-0
  // Đảm bảo trên iPhone (iOS Safari / PWA) luôn nằm cố định sát đáy màn hình, không bao giờ phải cuộn xuống mới thấy
  return createPortal(
    <>
      {/* Lớp nền mờ chạm để đóng */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-[99] bg-black/55 backdrop-blur-[1px] md:hidden animate-fade-in"
      />

      {/* Khung bàn phím bám sát đáy màn hình iPhone (fixed left-0 right-0 bottom-0) */}
      <div
        className="fixed left-0 right-0 bottom-0 z-[100] w-full max-w-[480px] mx-auto bg-slate-900 border-t border-white/15 rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.75)] safe-nav-bottom animate-slide-up flex flex-col overflow-hidden md:hidden font-body select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Thanh kéo đóng nhanh */}
        <div
          className="w-full pt-2 pb-1 flex justify-center cursor-pointer"
          onClick={onClose}
        >
          <div className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>

        {/* Thanh tiêu đề nhỏ gọn */}
        <div className="px-4 py-1.5 flex items-center justify-between border-b border-white/8">
          <div
            className={`px-2.5 py-0.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${getTypeBadgeStyle()}`}
          >
            {type === 'ADJUST' && <SlidersHorizontal size={13} />}
            <span>{getTypeLabel()}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="touch-btn px-2.5 py-1 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1 hover:text-white cursor-pointer border border-white/8"
              title="Ẩn bàn phím"
            >
              <ChevronDown size={14} />
              <span>Gập phím</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="touch-btn px-3 py-1 rounded-xl bg-sky-500/20 text-sky-300 text-xs font-bold flex items-center gap-1 hover:bg-sky-500/30 cursor-pointer border border-sky-400/30"
              title="Xác nhận số tiền"
            >
              <Check size={14} strokeWidth={2.5} />
              <span>Xong</span>
            </button>
          </div>
        </div>

        {/* Màn hình hiển thị số tiền đang bấm */}
        <div className="px-4 py-2 bg-slate-950/75 border-b border-white/8 text-center">
          <div
            className={`text-[11px] font-medium min-h-[16px] ${
              hasOperator ? 'text-sky-400 tracking-wider' : 'text-slate-400'
            }`}
          >
            {hasOperator
              ? amountStr
                  .replace(/\*/g, ' × ')
                  .replace(/\//g, ' ÷ ')
                  .replace(/\+/g, ' + ')
                  .replace(/-/g, ' - ')
              : 'Số tiền nhập'}
          </div>

          <div
            className={`font-heading text-2xl font-black tracking-tight leading-tight ${getAmountColor()}`}
          >
            {formatVND(computedAmount)}
          </div>

          {type === 'ADJUST' && currentWalletBalance !== undefined && (
            <div className="mt-0.5 text-[11px] flex items-center justify-center gap-1.5 font-medium">
              <span className="text-slate-400">Hiện tại: {formatVND(currentWalletBalance)}</span>
              <span>•</span>
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

        {/* Lưới phím bấm chuẩn 1 ngón cái iPhone */}
        <div className="p-2.5 bg-slate-900">
          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => onKeyPress('1')}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 font-heading text-lg font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              1
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('2')}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 font-heading text-lg font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              2
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('3')}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 font-heading text-lg font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              3
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('÷')}
              className="touch-btn h-11 rounded-xl bg-sky-500/15 border border-sky-400/25 font-heading text-lg font-black text-sky-400 flex items-center justify-center cursor-pointer active:bg-sky-500/25"
            >
              ÷
            </button>

            <button
              type="button"
              onClick={() => onKeyPress('4')}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 font-heading text-lg font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              4
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('5')}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 font-heading text-lg font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              5
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('6')}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 font-heading text-lg font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              6
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('×')}
              className="touch-btn h-11 rounded-xl bg-sky-500/15 border border-sky-400/25 font-heading text-lg font-black text-sky-400 flex items-center justify-center cursor-pointer active:bg-sky-500/25"
            >
              ×
            </button>

            <button
              type="button"
              onClick={() => onKeyPress('7')}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 font-heading text-lg font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              7
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('8')}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 font-heading text-lg font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              8
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('9')}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 font-heading text-lg font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              9
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('-')}
              className="touch-btn h-11 rounded-xl bg-sky-500/15 border border-sky-400/25 font-heading text-lg font-black text-sky-400 flex items-center justify-center cursor-pointer active:bg-sky-500/25"
            >
              -
            </button>

            <button
              type="button"
              onClick={() => onKeyPress('000')}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 font-heading text-sm font-black text-sky-400 flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              000
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('0')}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 font-heading text-lg font-bold text-white flex items-center justify-center cursor-pointer active:bg-slate-700"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('BACKSPACE')}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 text-rose-400 flex items-center justify-center cursor-pointer active:bg-slate-700"
              title="Xóa lùi"
            >
              <Delete size={19} />
            </button>
            <button
              type="button"
              onClick={() => onKeyPress('+')}
              className="touch-btn h-11 rounded-xl bg-sky-500/15 border border-sky-400/25 font-heading text-lg font-black text-sky-400 flex items-center justify-center cursor-pointer active:bg-sky-500/25"
            >
              +
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5 mt-1.5">
            <button
              type="button"
              onClick={() => onKeyPress('C')}
              className="touch-btn h-11 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 font-heading text-sm font-bold flex items-center justify-center cursor-pointer active:bg-rose-500/25"
              title="Xóa tất cả về 0"
            >
              C
            </button>

            <button
              type="button"
              onClick={onClose}
              className="touch-btn h-11 rounded-xl bg-slate-800 border border-white/8 text-slate-300 font-heading text-[11px] font-semibold flex flex-col items-center justify-center cursor-pointer active:bg-slate-700"
              title="Gập bàn phím xuống"
            >
              <ChevronDown size={15} />
              <span>Gập phím</span>
            </button>

            {onConfirmAndSave ? (
              <button
                type="button"
                onClick={onConfirmAndSave}
                className={`col-span-2 touch-btn touch-bounce h-11 rounded-xl text-white font-bold flex items-center justify-center gap-1.5 text-xs shadow-lg cursor-pointer border-none ${
                  type === 'EXPENSE' || type === 'PAY_DEBT'
                    ? 'bg-gradient-to-r from-rose-500 to-rose-600 shadow-rose-500/30'
                    : type === 'INCOME' || type === 'COLLECT_DEBT'
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-500/30'
                    : type === 'LEND'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 shadow-amber-500/30'
                    : type === 'BORROW'
                    ? 'bg-gradient-to-r from-purple-500 to-purple-600 shadow-purple-500/30'
                    : type === 'TRANSFER'
                    ? 'bg-gradient-to-r from-sky-500 to-sky-600 shadow-sky-500/30'
                    : 'bg-gradient-to-r from-slate-600 to-slate-700 shadow-slate-500/30'
                }`}
              >
                <Check size={16} strokeWidth={2.8} />
                <span>LƯU GIAO DỊCH</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="col-span-2 touch-btn touch-bounce h-11 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold flex items-center justify-center gap-1.5 text-xs shadow-lg shadow-sky-500/25 cursor-pointer border-none"
              >
                <Check size={16} strokeWidth={2.8} />
                <span>XÁC NHẬN SỐ TIỀN</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default NumpadBottomSheet;
