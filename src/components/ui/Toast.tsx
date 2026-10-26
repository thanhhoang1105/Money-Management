// src/components/ui/Toast.tsx
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
  message: React.ReactNode;
  type?: ToastType;
  icon?: React.ReactNode;
  onClose?: () => void;
  duration?: number; // Thời gian tự đóng tính bằng mili-giây (ms). Mặc định 3000ms (3 giây)
  autoClose?: boolean; // Tự động đóng. Mặc định true
  className?: string;
  inline?: boolean;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'success',
  icon,
  onClose,
  duration,
  autoClose = true,
  className = '',
  inline = false
}) => {
  // Thời gian hiển thị mặc định: 3 giây cho success/info, 4 giây cho warning/error
  const defaultDuration = duration ?? (type === 'error' || type === 'warning' ? 4000 : 3000);

  // Tự động đóng thông báo sau N giây
  useEffect(() => {
    if (!onClose || !autoClose || defaultDuration <= 0) return;
    const timer = setTimeout(() => {
      onClose();
    }, defaultDuration);
    return () => clearTimeout(timer);
  }, [onClose, autoClose, defaultDuration, message]);

  const renderIcon = () => {
    if (icon) return icon;
    switch (type) {
      case 'error':
        return <AlertCircle size={18} strokeWidth={2.5} className="text-rose-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle size={18} strokeWidth={2.5} className="text-amber-400 shrink-0" />;
      case 'info':
        return <Info size={18} strokeWidth={2.5} className="text-sky-400 shrink-0" />;
      case 'success':
      default:
        return <Check size={18} strokeWidth={2.5} className="text-emerald-400 shrink-0" />;
    }
  };

  const getStyleClasses = () => {
    switch (type) {
      case 'error':
        return 'glass-toast-error text-rose-100';
      case 'warning':
        return 'glass-toast-warning text-amber-100';
      case 'info':
        return 'glass-toast-info text-sky-100';
      case 'success':
      default:
        return 'glass-toast-success text-emerald-100';
    }
  };

  const getIconContainerStyle = () => {
    switch (type) {
      case 'error':
        return 'bg-rose-500/25 border-rose-500/50 text-rose-300';
      case 'warning':
        return 'bg-amber-500/25 border-amber-500/50 text-amber-300';
      case 'info':
        return 'bg-sky-500/25 border-sky-500/50 text-sky-300';
      case 'success':
      default:
        return 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300';
    }
  };

  const content = (
    <div
      role="alert"
      className={`
        ${
          inline
            ? 'w-full p-3 rounded-2xl flex items-center justify-between gap-2.5 animate-toast-slide text-[13px] font-semibold select-none'
            : 'fixed top-[max(12px,calc(env(safe-area-inset-top,0px)+8px))] left-0 right-0 mx-auto w-[calc(100%-24px)] max-w-md p-3.5 sm:p-4 rounded-2xl flex items-center justify-between gap-3 animate-toast-pop text-[13px] font-semibold select-none shadow-2xl pointer-events-auto z-[9999]'
        }
        ${getStyleClasses()}
        ${className}
      `}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 backdrop-blur-md shadow-inner ${getIconContainerStyle()}`}
        >
          {renderIcon()}
        </div>
        <div className="flex-1 min-w-0 text-white font-semibold leading-snug break-words text-xs sm:text-[13px]">
          {message}
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/15 active:scale-90 transition-all shrink-0 cursor-pointer"
          aria-label="Đóng thông báo"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );

  if (!inline && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
};

export default Toast;
