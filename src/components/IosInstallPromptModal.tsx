// src/components/IosInstallPromptModal.tsx
import React from 'react';
import { X, Share, PlusSquare, Smartphone, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

interface IosInstallPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IosInstallPromptModal: React.FC<IosInstallPromptModalProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel animate-slide-up bg-slate-900 border border-white/10 rounded-3xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-sky-500/15 flex items-center justify-center text-sky-400">
              <Smartphone size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white m-0">Cài đặt lên iPhone</h3>
              <p className="text-xs text-slate-400 m-0">Trải nghiệm toàn màn hình như App thật</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center touch-btn cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 4 Bước cài đặt trực quan */}
        <div className="flex flex-col gap-3">
          {/* Bước 1 */}
          <div className="bg-slate-800/80 rounded-2xl p-3 border border-white/5 flex gap-3 items-start">
            <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              1
            </div>
            <div className="text-xs text-slate-300 leading-relaxed">
              Mở liên kết này bằng trình duyệt <strong className="text-white">Safari</strong> mặc định trên iPhone.
            </div>
          </div>

          {/* Bước 2 */}
          <div className="bg-slate-800/80 rounded-2xl p-3 border border-white/5 flex gap-3 items-start">
            <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              2
            </div>
            <div className="text-xs text-slate-300 leading-relaxed">
              Nhấn vào biểu tượng <strong className="text-sky-400">Chia sẻ</strong>{' '}
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-700 mx-1 align-middle">
                <Share size={12} className="text-sky-400" />
              </span>{' '}
              ở thanh công cụ dưới đáy màn hình Safari.
            </div>
          </div>

          {/* Bước 3 */}
          <div className="bg-slate-800/80 rounded-2xl p-3 border border-white/5 flex gap-3 items-start">
            <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              3
            </div>
            <div className="text-xs text-slate-300 leading-relaxed">
              Cuộn xuống danh sách tùy chọn và chạm vào{' '}
              <strong className="text-white">"Thêm vào MH chính"</strong> (Add to Home Screen){' '}
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-700 mx-1 align-middle">
                <PlusSquare size={12} className="text-emerald-400" />
              </span>.
            </div>
          </div>

          {/* Bước 4 */}
          <div className="bg-slate-800/80 rounded-2xl p-3 border border-white/5 flex gap-3 items-start">
            <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              4
            </div>
            <div className="text-xs text-slate-300 leading-relaxed">
              Nhấn <strong className="text-emerald-400">"Thêm"</strong> (Add) ở góc trên bên phải màn hình. Biểu tượng Sổ Thu Chi sẽ xuất hiện ngay trên màn hình chính iPhone của bạn!
            </div>
          </div>
        </div>

        {/* Lợi ích nổi bật */}
        <div className="bg-gradient-to-r from-emerald-500/10 to-sky-500/10 rounded-2xl p-3 border border-emerald-500/20 space-y-2 text-xs">
          <div className="text-slate-200 font-bold flex items-center gap-1.5">
            <CheckCircle2 size={15} className="text-emerald-400" />
            <span>Ưu điểm khi dùng ở chế độ Ứng dụng:</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1">
            <div className="flex items-center gap-1.5">
              <Zap size={13} className="text-amber-400 shrink-0" />
              <span>Khởi động dưới 1s</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
              <span>Lưu trữ 100% Offline</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Smartphone size={13} className="text-sky-400 shrink-0" />
              <span>Toàn màn hình cực đã</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-purple-400 shrink-0" />
              <span>Không sợ mất dữ liệu</span>
            </div>
          </div>
        </div>

        {/* Nút Đã hiểu */}
        <button
          type="button"
          onClick={onClose}
          className="touch-btn w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-white font-bold text-xs cursor-pointer shadow-lg shadow-sky-500/20 text-center"
        >
          Tôi đã hiểu
        </button>
      </div>
    </div>
  );
};
