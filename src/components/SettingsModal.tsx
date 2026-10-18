// src/components/SettingsModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  exportFullBackupJSON,
  downloadOrShareFile,
  restoreBackupData,
  exportTransactionsToExcel,
  checkAndRunAutoBackup
} from '../services/backupService';
import { getCurrentDate, formatFriendlyDate } from '../utils/formatters';
import {
  X,
  Clock,
  Database,
  FileSpreadsheet,
  Download,
  Upload,
  ShieldCheck,
  Check,
  AlertTriangle,
  RotateCw
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const autoBackupEnabledSetting = useLiveQuery(() =>
    db.settings.get('auto_backup_enabled')
  );
  const autoBackupTimeSetting = useLiveQuery(() =>
    db.settings.get('auto_backup_time')
  );
  const lastBackupDateSetting = useLiveQuery(() =>
    db.settings.get('last_auto_backup_date')
  );

  const txCount = useLiveQuery(() => db.transactions.count()) || 0;
  const walletCount = useLiveQuery(() => db.wallets.count()) || 0;
  const categoryCount = useLiveQuery(() => db.categories.count()) || 0;

  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [backupTime, setBackupTime] = useState<string>('21:00');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isPersistent, setIsPersistent] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Đồng bộ giá trị từ IndexedDB Settings khi modal mở
  useEffect(() => {
    if (autoBackupEnabledSetting !== undefined) {
      setIsEnabled(autoBackupEnabledSetting ? Boolean(autoBackupEnabledSetting.value) : true);
    }
    if (autoBackupTimeSetting?.value) {
      setBackupTime(autoBackupTimeSetting.value as string);
    }
  }, [autoBackupEnabledSetting, autoBackupTimeSetting]);

  // Kiểm tra quyền lưu trữ bền vững (Persistent Storage)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((persisted) => {
        setIsPersistent(persisted);
      }).catch(() => {
        setIsPersistent(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Bật/Tắt tự động sao lưu
  const handleToggleAutoBackup = async () => {
    const nextVal = !isEnabled;
    setIsEnabled(nextVal);
    await db.settings.put({
      key: 'auto_backup_enabled',
      value: nextVal
    });
    setStatusMsg({
      text: nextVal ? 'Đã bật Tự động sao lưu hàng ngày' : 'Đã tắt Tự động sao lưu',
      type: 'info'
    });
  };

  // Thay đổi khung giờ sao lưu
  const handleTimeChange = async (newTime: string) => {
    if (!newTime) return;
    setBackupTime(newTime);
    await db.settings.put({
      key: 'auto_backup_time',
      value: newTime
    });
    setStatusMsg({
      text: `Đã cập nhật khung giờ sao lưu thành ${newTime}`,
      type: 'info'
    });
  };

  // Kích hoạt sao lưu ngay lập tức
  const handleBackupNow = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      const res = await checkAndRunAutoBackup({ force: true });
      if (res.ran) {
        setStatusMsg({
          text: 'Sao lưu thành công! File JSON đã được tạo và kích hoạt chia sẻ/tải về.',
          type: 'success'
        });
      } else {
        setStatusMsg({ text: res.message, type: 'info' });
      }
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Có lỗi khi sao lưu', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Xuất file JSON thủ công
  const handleExportManualJSON = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      const jsonStr = await exportFullBackupJSON();
      const dateStr = getCurrentDate().replace(/-/g, '');
      const fileName = `SoThuChi_Backup_${dateStr}.json`;
      await downloadOrShareFile(jsonStr, fileName, 'application/json');
      setStatusMsg({
        text: 'Đã xuất dữ liệu JSON thành công!',
        type: 'success'
      });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Lỗi xuất file', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Xuất file Excel (.xlsx)
  const handleExportExcel = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      await exportTransactionsToExcel();
      setStatusMsg({
        text: 'Đã xuất báo cáo Excel (.xlsx) thành công!',
        type: 'success'
      });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Lỗi xuất file Excel', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Xử lý chọn file JSON để khôi phục
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('CẢNH BÁO: Thao tác này sẽ cập nhật toàn bộ cơ sở dữ liệu từ file sao lưu. Bạn có chắc muốn tiếp tục?')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsProcessing(true);
    setStatusMsg(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const result = await restoreBackupData(content);
        setStatusMsg({
          text: `Khôi phục thành công: ${result.counts.transactions} giao dịch, ${result.counts.wallets} ví!`,
          type: 'success'
        });
      } catch (err: any) {
        setStatusMsg({
          text: err?.message || 'Lỗi đọc file sao lưu',
          type: 'error'
        });
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setStatusMsg({ text: 'Không thể đọc file từ thiết bị', type: 'error' });
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.readAsText(file);
  };

  const lastBackupVal = lastBackupDateSetting?.value as string | undefined;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex flex-col justify-end max-w-[480px] mx-auto">
      <div className="glass-panel animate-slide-up bg-slate-900 rounded-t-[28px] border-t border-x border-white/10 flex flex-col max-h-[92vh] pb-[max(18px,env(safe-area-inset-bottom,0px))] overflow-y-auto">
        {/* Header Modal */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/15 flex items-center justify-center text-sky-400">
              <Database size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 m-0">
                Cài đặt & Sao lưu
              </h2>
              <span className="text-[11px] text-slate-400">
                Bảo vệ dữ liệu Local-First 100%
              </span>
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

        {/* Thông báo trạng thái nếu có */}
        {statusMsg && (
          <div
            className={`mx-4 mt-3 px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 border ${
              statusMsg.type === 'success'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : statusMsg.type === 'error'
                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                : 'bg-sky-500/15 text-sky-400 border-sky-500/30'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <Check size={16} />
            ) : statusMsg.type === 'error' ? (
              <AlertTriangle size={16} />
            ) : (
              <Clock size={16} />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div className="p-4 flex flex-col gap-4">
          {/* PHẦN 1: TỰ ĐỘNG SAO LƯU HÀNG NGÀY (AUTO-BACKUP) */}
          <div className="glass-card bg-slate-800/90 rounded-2xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <Clock size={20} className="text-sky-400" />
                <div>
                  <div className="text-sm font-bold text-slate-100">
                    Tự động sao lưu hàng ngày
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Tự động xuất file JSON khi mở app
                  </div>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={handleToggleAutoBackup}
                className={`w-12 h-7 rounded-full transition-colors relative cursor-pointer p-0.5 border-none ${
                  isEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full bg-white transition-transform shadow-md ${
                    isEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {isEnabled && (
              <div className="mt-3.5 pt-3 border-t border-white/5 flex flex-col gap-3">
                {/* Chọn Khung giờ */}
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300 font-medium">
                    Khung giờ sao lưu:
                  </label>
                  <input
                    type="time"
                    value={backupTime}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    className="bg-slate-900 text-sky-400 border border-sky-400/30 rounded-xl px-3 py-1 text-base font-bold outline-none"
                  />
                </div>

                {/* Ngày sao lưu gần nhất */}
                <div className="text-xs text-slate-400">
                  Lần sao lưu gần nhất:{' '}
                  <span className={`font-semibold ${lastBackupVal ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {lastBackupVal ? formatFriendlyDate(lastBackupVal) : 'Chưa có'}
                  </span>
                </div>

                {/* Nút Sao lưu ngay */}
                <button
                  type="button"
                  onClick={handleBackupNow}
                  disabled={isProcessing}
                  className="touch-btn bg-sky-500/15 text-sky-400 border border-sky-400/30 px-3.5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer flex items-center justify-center gap-2 mt-1 hover:bg-sky-500/20"
                >
                  {isProcessing ? (
                    <RotateCw size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  <span>Sao lưu ngay bây giờ (Xuất JSON)</span>
                </button>
              </div>
            )}
          </div>

          {/* PHẦN 2: QUẢN LÝ DỮ LIỆU & XUẤT BÁO CÁO THỦ CÔNG */}
          <div className="glass-card bg-slate-800/90 rounded-2xl p-4 border border-white/5 flex flex-col gap-2.5">
            <div className="text-xs font-bold text-slate-400 mb-0.5 tracking-wider uppercase">
              SAO LƯU & KHÔI PHỤC THỦ CÔNG
            </div>

            {/* Nút Xuất JSON */}
            <button
              type="button"
              onClick={handleExportManualJSON}
              disabled={isProcessing}
              className="touch-btn bg-slate-900 text-slate-100 border border-white/10 px-3.5 py-3 rounded-xl flex items-center justify-between cursor-pointer hover:border-white/20 transition-colors"
            >
              <div className="flex items-center gap-2.5 text-left">
                <Download size={18} className="text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">Xuất toàn bộ dữ liệu (JSON)</div>
                  <div className="text-[11px] text-slate-400">Bao gồm ví, danh mục, giao dịch, hạn mức</div>
                </div>
              </div>
              <span className="text-xs text-emerald-400 font-semibold shrink-0">Tải / Chia sẻ</span>
            </button>

            {/* Nút Nhập JSON */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="touch-btn bg-slate-900 text-slate-100 border border-white/10 px-3.5 py-3 rounded-xl flex items-center justify-between cursor-pointer hover:border-white/20 transition-colors"
            >
              <div className="flex items-center gap-2.5 text-left">
                <Upload size={18} className="text-sky-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">Khôi phục từ file JSON</div>
                  <div className="text-[11px] text-slate-400">Nạp lại dữ liệu từ tệp sao lưu trước đó</div>
                </div>
              </div>
              <span className="text-xs text-sky-400 font-semibold shrink-0">Chọn file</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Nút Xuất Excel */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isProcessing}
              className="touch-btn bg-slate-900 text-slate-100 border border-white/10 px-3.5 py-3 rounded-xl flex items-center justify-between cursor-pointer hover:border-white/20 transition-colors"
            >
              <div className="flex items-center gap-2.5 text-left">
                <FileSpreadsheet size={18} className="text-emerald-500 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">Xuất bảng tính Excel (.xlsx)</div>
                  <div className="text-[11px] text-slate-400">Báo cáo giao dịch chi tiết theo bảng</div>
                </div>
              </div>
              <span className="text-xs text-emerald-500 font-semibold shrink-0">Xuất Excel</span>
            </button>
          </div>

          {/* PHẦN 3: THÔNG TIN HỆ THỐNG & BẢO VỆ BỘ NHỚ */}
          <div className="glass-card bg-slate-800/90 rounded-2xl p-3.5 border border-white/5 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className={isPersistent ? 'text-emerald-400' : 'text-amber-400'} />
              <div className="text-xs font-bold text-slate-100">
                Bộ nhớ thiết bị (IndexedDB)
              </div>
            </div>

            <div className="text-xs text-slate-400 leading-relaxed">
              {isPersistent
                ? 'Bộ nhớ bền vững (Persistent Storage) đã được kích hoạt. Trình duyệt sẽ không tự ý xóa dữ liệu thu chi của bạn.'
                : 'Đang lưu trữ dữ liệu an toàn trên bộ nhớ trình duyệt Safari/Chrome.'}
            </div>

            <div className="flex gap-4 pt-2 mt-1 border-t border-white/5 text-xs text-slate-300">
              <div>
                Giao dịch: <b className="text-white">{txCount}</b>
              </div>
              <div>
                Ví: <b className="text-white">{walletCount}</b>
              </div>
              <div>
                Hạng mục: <b className="text-white">{categoryCount}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
