import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  exportFullBackupJSON,
  downloadOrShareFile,
  restoreBackupData,
  validateBackupJSON,
  exportTransactionsToExcel
} from '../services/backupService';
import {
  backupToGoogleDrive,
  getLatestBackupFromGoogleDrive,
  performGoogleDriveSmartSync,
  requestGoogleAccessToken,
  disconnectGoogleDrive,
  getSavedGoogleUser,
  saveGoogleClientId,
  type GoogleDriveUser
} from '../services/googleDriveService';
import { IosInstallPromptModal } from './IosInstallPromptModal';
import { getCurrentDate, getCurrentMonth, formatFriendlyDate } from '../utils/formatters';
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
  RotateCw,
  Cloud,
  CloudUpload,
  CloudDownload,
  LogOut,
  Smartphone,
  Copy,
  ChevronDown,
  ChevronUp,
  Key
} from 'lucide-react';

// Icon Google chuẩn 4 màu
const GoogleIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
    />
  </svg>
);

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RestorePreviewData {
  fileName: string;
  jsonContent: string;
  metadata: {
    appName: string;
    version: string;
    exportedAt: string;
    walletsCount: number;
    categoriesCount: number;
    transactionsCount: number;
    budgetsCount: number;
    settingsCount: number;
  };
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  // Google Drive Live Queries
  const googleDriveUserSetting = useLiveQuery(() => db.settings.get('google_drive_user'));
  const lastGoogleBackupDateSetting = useLiveQuery(() => db.settings.get('last_google_drive_backup_date'));
  const lastGoogleDriveSyncSetting = useLiveQuery(() => db.settings.get('last_google_drive_sync_time'));
  const googleDriveAutoBackupSetting = useLiveQuery(() => db.settings.get('google_drive_auto_backup_enabled'));
  const googleClientIdSetting = useLiveQuery(() => db.settings.get('google_client_id'));

  const txCount = useLiveQuery(() => db.transactions.count()) || 0;
  const walletCount = useLiveQuery(() => db.wallets.count()) || 0;
  const categoryCount = useLiveQuery(() => db.categories.count()) || 0;

  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isPersistent, setIsPersistent] = useState<boolean>(false);

  // Google Drive state
  const [googleUser, setGoogleUser] = useState<GoogleDriveUser | null>(null);
  const [isDriveAutoBackup, setIsDriveAutoBackup] = useState<boolean>(true);
  const [isIosModalOpen, setIsIosModalOpen] = useState<boolean>(false);
  const [customClientIdInput, setCustomClientIdInput] = useState<string>('');
  const [showClientIdConfig, setShowClientIdConfig] = useState<boolean>(false);
  const [isCopiedOrigin, setIsCopiedOrigin] = useState<boolean>(false);

  // Xem trước khôi phục JSON (FR-E-03)
  const [restorePreview, setRestorePreview] = useState<RestorePreviewData | null>(null);

  // Phạm vi xuất Excel (toàn bộ hoặc tháng cụ thể)
  const [excelScope, setExcelScope] = useState<'all' | string>('all');

  // Màn hình mở app mặc định
  const [defaultStartTab, setDefaultStartTab] = useState<string>(() => {
    try {
      return localStorage.getItem('app_default_tab') || 'overview';
    } catch {
      return 'overview';
    }
  });

  const handleSelectDefaultStartTab = (tabKey: string) => {
    setDefaultStartTab(tabKey);
    try {
      localStorage.setItem('app_default_tab', tabKey);
      setStatusMsg({ text: 'Đã lưu màn hình mặc định khi mở app!', type: 'success' });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch {
      // ignore
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Đồng bộ giá trị Client ID tùy chỉnh khi tải từ DB
  useEffect(() => {
    if (googleClientIdSetting?.value) {
      setCustomClientIdInput(googleClientIdSetting.value as string);
    }
  }, [googleClientIdSetting]);

  // Đồng bộ trạng thái Google Drive từ DB
  useEffect(() => {
    if (googleDriveUserSetting?.value) {
      setGoogleUser(googleDriveUserSetting.value as GoogleDriveUser);
    } else {
      setGoogleUser(null);
    }
  }, [googleDriveUserSetting]);

  useEffect(() => {
    if (googleDriveAutoBackupSetting !== undefined) {
      setIsDriveAutoBackup(Boolean(googleDriveAutoBackupSetting?.value));
    }
  }, [googleDriveAutoBackupSetting]);

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

  // Lưu Client ID tùy chỉnh do người dùng nhập
  const handleSaveCustomClientId = async () => {
    const trimmed = customClientIdInput.trim();
    if (!trimmed) {
      await db.settings.delete('google_client_id');
      setStatusMsg({ text: 'Đã xóa Client ID tùy chỉnh, sử dụng cấu hình mặc định', type: 'info' });
      return;
    }
    await saveGoogleClientId(trimmed);
    setStatusMsg({ text: 'Đã lưu Google Client ID tùy chỉnh! Bạn có thể kết nối ngay.', type: 'success' });
  };

  // Sao chép URL Origin hiện tại để dán vào Google Cloud Console
  const handleCopyOrigin = async () => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      if (origin) {
        await navigator.clipboard.writeText(origin);
        setIsCopiedOrigin(true);
        setTimeout(() => setIsCopiedOrigin(false), 2500);
      }
    } catch {
      // ignore
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

  // Xuất file Excel (.xlsx) với tùy chọn tháng hoặc toàn bộ
  const handleExportExcel = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      const res = await exportTransactionsToExcel(
        excelScope === 'all' ? undefined : { month: excelScope }
      );
      setStatusMsg({
        text: `Đã xuất báo cáo Excel thành công (${res.transactionCount} giao dịch)!`,
        type: 'success'
      });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Lỗi xuất file Excel', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Xử lý chọn file JSON để xem trước khôi phục (FR-E-03)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatusMsg(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const validation = validateBackupJSON(content);

        if (!validation.isValid || !validation.metadata) {
          setStatusMsg({
            text: validation.error || 'Tệp sao lưu không đúng cấu trúc chuẩn của ứng dụng.',
            type: 'error'
          });
          return;
        }

        // Mở Modal Preview xác nhận trước khi ghi đè
        setRestorePreview({
          fileName: file.name,
          jsonContent: content,
          metadata: validation.metadata
        });
      } catch (err: any) {
        setStatusMsg({
          text: err?.message || 'Lỗi đọc tệp sao lưu',
          type: 'error'
        });
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setStatusMsg({ text: 'Không thể đọc tệp từ thiết bị', type: 'error' });
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.readAsText(file);
  };

  // Xác nhận khôi phục ghi đè dữ liệu từ Modal Preview
  const handleConfirmRestore = async () => {
    if (!restorePreview) return;
    setIsProcessing(true);
    setStatusMsg(null);

    try {
      const result = await restoreBackupData(restorePreview.jsonContent);
      setStatusMsg({
        text: `Khôi phục thành công: ${result.counts.transactions} giao dịch, ${result.counts.wallets} ví, ${result.counts.categories} danh mục!`,
        type: 'success'
      });
      setRestorePreview(null);
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || 'Có lỗi xảy ra khi khôi phục dữ liệu',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 1. Kết nối tài khoản Google Drive
  const handleConnectGoogle = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      await requestGoogleAccessToken(true);
      const user = await getSavedGoogleUser();
      setGoogleUser(user);
      setStatusMsg({
        text: `Đã kết nối tài khoản Google (${user?.email || 'Google Drive'})! Đang kiểm tra dữ liệu đồng bộ...`,
        type: 'success'
      });

      // Tự động kích hoạt đồng bộ 2 chiều ngay lập tức
      try {
        const syncRes = await performGoogleDriveSmartSync();
        setStatusMsg({
          text: `Đã kết nối & ${syncRes.message}`,
          type: syncRes.success ? 'success' : 'info'
        });
      } catch (sErr) {
        console.warn('Lỗi đồng bộ khởi tạo:', sErr);
      }
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || 'Không thể kết nối Google Drive',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 1.5. Đồng bộ 2 chiều thông minh qua Google Drive (Smart Two-Way Sync)
  const handleSmartSyncGoogleDrive = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      const res = await performGoogleDriveSmartSync();
      setStatusMsg({
        text: res.message,
        type: res.success ? 'success' : 'error'
      });
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || 'Có lỗi khi đồng bộ với Google Drive',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Sao lưu lên Google Drive bằng 1 nút bấm (FR-E-Drive)
  const handleBackupToGoogleDrive = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      const res = await backupToGoogleDrive();
      setStatusMsg({
        text: `Sao lưu lên Google Drive thành công! Tệp: ${res.fileName}`,
        type: 'success'
      });
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || 'Có lỗi khi sao lưu lên Google Drive',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Tự động lấy data từ Google Drive bằng 1 nút bấm (FR-E-Drive)
  const handleRestoreFromGoogleDrive = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      const { file, jsonContent } = await getLatestBackupFromGoogleDrive();
      const validation = validateBackupJSON(jsonContent);

      if (!validation.isValid || !validation.metadata) {
        setStatusMsg({
          text: validation.error || 'Tệp sao lưu trên Google Drive không đúng định dạng chuẩn.',
          type: 'error'
        });
        return;
      }

      setRestorePreview({
        fileName: file.name,
        jsonContent,
        metadata: validation.metadata
      });
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || 'Không thể lấy dữ liệu từ Google Drive',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Ngắt kết nối tài khoản Google
  const handleDisconnectGoogle = async () => {
    if (!window.confirm('Bạn có chắc muốn ngắt kết nối tài khoản Google Drive?')) {
      return;
    }
    setIsProcessing(true);
    try {
      await disconnectGoogleDrive();
      setGoogleUser(null);
      setStatusMsg({
        text: 'Đã ngắt kết nối tài khoản Google.',
        type: 'info'
      });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Lỗi ngắt kết nối', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // 5. Bật/Tắt Tự động sao lưu lên Drive hàng ngày
  const handleToggleDriveAutoBackup = async () => {
    const nextVal = !isDriveAutoBackup;
    setIsDriveAutoBackup(nextVal);
    await db.settings.put({
      key: 'google_drive_auto_backup_enabled',
      value: nextVal
    });
    setStatusMsg({
      text: nextVal ? 'Đã bật Tự động đồng bộ lên Google Drive' : 'Đã tắt Tự động đồng bộ Google Drive',
      type: 'info'
    });
  };

  const lastGoogleDriveBackupVal = lastGoogleBackupDateSetting?.value as string | undefined;
  const lastGoogleSyncVal = typeof lastGoogleDriveSyncSetting?.value === 'string'
    ? lastGoogleDriveSyncSetting.value
    : null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex flex-col justify-end md:justify-center items-center p-0 md:p-6 animate-fade-in" onClick={onClose}>
      <div
        className="glass-panel animate-slide-up bg-slate-900 rounded-t-[28px] md:rounded-3xl border-t border-x md:border border-white/10 flex flex-col w-full max-w-[480px] md:max-w-xl max-h-[92vh] pb-[max(18px,env(safe-area-inset-bottom,0px))] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
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
          {/* CÀI ĐẶT MÀN HÌNH KHỞI ĐỘNG MẶC ĐỊNH */}
          <div className="glass-card bg-slate-800/90 rounded-2xl p-4 border border-white/5 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <Smartphone size={20} className="text-indigo-400" />
              <div>
                <div className="text-sm font-bold text-slate-100">
                  Màn hình mở app mặc định
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Chọn tab xuất hiện đầu tiên khi khởi động ứng dụng
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1 pt-1">
              {[
                { id: 'editor', name: 'Ghi GD' },
                { id: 'overview', name: 'Tổng quan' },
                { id: 'wallets', name: 'Tài khoản' },
                { id: 'analytics', name: 'Báo cáo' },
                { id: 'more', name: 'Khác' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSelectDefaultStartTab(tab.id)}
                  className={`touch-btn py-2 px-1 rounded-xl text-[11px] font-bold cursor-pointer border transition-all text-center ${
                    defaultStartTab === tab.id
                      ? 'bg-sky-500/25 border-sky-400 text-sky-300 shadow-sm'
                      : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          </div>

          {/* PHẦN 1: SAO LƯU & ĐỒNG BỘ GOOGLE DRIVE (CLOUD BACKUP) */}
          <div className="glass-card bg-slate-800/90 rounded-2xl p-4 border border-white/5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400">
                  <Cloud size={18} />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    <span>Sao lưu & Đồng bộ Google Drive</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Lưu trữ đám mây 1 chạm, chống mất dữ liệu
                  </div>
                </div>
              </div>

              {googleUser && (
                <button
                  type="button"
                  onClick={handleDisconnectGoogle}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 cursor-pointer flex items-center gap-1"
                  title="Ngắt kết nối tài khoản"
                >
                  <LogOut size={12} />
                  <span>Ngắt</span>
                </button>
              )}
            </div>

            {/* Trạng thái 1: Chưa kết nối Google Drive */}
            {!googleUser ? (
              <div className="flex flex-col gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  disabled={isProcessing}
                  className="touch-btn bg-white hover:bg-slate-100 text-slate-900 font-bold px-4 py-3 rounded-xl flex items-center justify-center gap-2.5 cursor-pointer shadow-md transition-all active:scale-[0.98]"
                >
                  {isProcessing ? (
                    <RotateCw size={17} className="animate-spin text-slate-700" />
                  ) : (
                    <GoogleIcon />
                  )}
                  <span className="text-xs">Kết nối với Google Drive</span>
                </button>

                <div className="text-[11px] text-slate-400 text-center px-1">
                  Đăng nhập tài khoản Google để tự động sao lưu & đồng bộ 2 chiều dữ liệu giữa Máy tính & Điện thoại.
                </div>

                {/* Hướng dẫn và cấu hình Client ID để khắc phục lỗi 400 origin_mismatch */}
                <div className="pt-2 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowClientIdConfig(!showClientIdConfig)}
                    className="text-xs text-sky-400 hover:text-sky-300 flex items-center justify-between w-full py-1 cursor-pointer bg-transparent border-none"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <Key size={13} />
                      <span>Cấu hình Google Client ID (Khắc phục lỗi origin_mismatch)</span>
                    </span>
                    {showClientIdConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showClientIdConfig && (
                    <div className="mt-2.5 p-3 rounded-xl bg-slate-900/90 border border-white/10 flex flex-col gap-2.5 text-xs text-slate-300">
                      <div className="text-[11px] text-amber-300 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20 leading-relaxed">
                        ⚠️ <strong>Lỗi 400 (origin_mismatch):</strong> Xảy ra khi URL trang web này chưa được đăng ký trong mục <em>Authorized JavaScript origins</em> tại Google Cloud Console.
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          1. URL trang web hiện tại của bạn:
                        </label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-slate-950 px-2.5 py-1.5 rounded-lg text-emerald-400 font-mono text-[11px] truncate border border-white/5">
                            {typeof window !== 'undefined' ? window.location.origin : ''}
                          </code>
                          <button
                            type="button"
                            onClick={handleCopyOrigin}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[11px] font-medium flex items-center gap-1 cursor-pointer shrink-0 border border-white/10"
                          >
                            {isCopiedOrigin ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            <span>{isCopiedOrigin ? 'Đã sao chép' : 'Sao chép URL'}</span>
                          </button>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Dán URL này vào mục <strong>Authorized JavaScript origins</strong> trong Google Cloud Console.
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          2. Google OAuth Client ID của bạn:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={customClientIdInput}
                            onChange={(e) => setCustomClientIdInput(e.target.value)}
                            placeholder="xxxx.apps.googleusercontent.com"
                            className="flex-1 bg-slate-950 px-2.5 py-1.5 rounded-lg text-slate-100 text-xs border border-white/10 focus:border-sky-400 outline-none font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleSaveCustomClientId}
                            className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shrink-0 border-none"
                          >
                            Lưu ID
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Trạng thái 2: Đã kết nối Google Drive */
              <div className="flex flex-col gap-3 pt-1">
                {/* Thông tin tài khoản */}
                <div className="bg-slate-900/80 rounded-xl p-2.5 border border-white/8 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    {googleUser.picture ? (
                      <img
                        src={googleUser.picture}
                        alt={googleUser.name}
                        className="w-8 h-8 rounded-full border border-emerald-500/40 shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {googleUser.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="truncate">
                      <div className="text-xs font-bold text-white truncate">{googleUser.name}</div>
                      <div className="text-[11px] text-slate-400 truncate">{googleUser.email}</div>
                    </div>
                  </div>

                  <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold shrink-0">
                    Đã liên kết
                  </span>
                </div>

                {/* NÚT CHÍNH: SAO LƯU NGAY LÊN GOOGLE DRIVE */}
                <button
                  type="button"
                  onClick={handleBackupToGoogleDrive}
                  disabled={isProcessing}
                  className="touch-btn w-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold p-3.5 rounded-2xl flex items-center justify-between cursor-pointer shadow-lg shadow-emerald-950/40 border border-emerald-400/30 transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                      {isProcessing ? (
                        <RotateCw size={20} className="animate-spin text-white" />
                      ) : (
                        <CloudUpload size={20} className="text-white" />
                      )}
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-black text-white flex items-center gap-1.5 uppercase tracking-wide">
                        <span>Sao lưu ngay lên Google Drive</span>
                      </div>
                      <div className="text-[11px] text-emerald-100 mt-0.5">
                        Lưu bản sao mới nhất vào thư mục SoThuChi_Backups
                      </div>
                      {lastGoogleDriveBackupVal && (
                        <div className="text-[10px] text-emerald-200 font-medium mt-1">
                          Lần sao lưu gần nhất: {formatFriendlyDate(lastGoogleDriveBackupVal)}
                        </div>
                      )}
                    </div>
                  </div>
                </button>

                {/* 2 NÚT THAO TÁC PHỤ: ĐỒNG BỘ 2 CHIỀU & KHÔI PHỤC TỪ DRIVE */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleSmartSyncGoogleDrive}
                    disabled={isProcessing}
                    className="touch-btn p-3 rounded-xl bg-slate-900/90 hover:bg-slate-900 border border-white/10 flex items-center gap-2.5 text-left cursor-pointer transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                      <RotateCw size={16} className={isProcessing ? 'animate-spin' : ''} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-100">Đồng bộ 2 chiều</div>
                      <div className="text-[10px] text-slate-400">
                        {lastGoogleSyncVal ? `Lần cuối: ${lastGoogleSyncVal.slice(0, 10)}` : 'Hợp nhất PC & Mobile'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleRestoreFromGoogleDrive}
                    disabled={isProcessing}
                    className="touch-btn p-3 rounded-xl bg-slate-900/90 hover:bg-slate-900 border border-white/10 flex items-center gap-2.5 text-left cursor-pointer transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                      <CloudDownload size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-100">Khôi phục từ Drive</div>
                      <div className="text-[10px] text-slate-400">Lấy bản sao gần nhất</div>
                    </div>
                  </button>
                </div>

                {/* Tùy chọn Tự động đồng bộ ngầm khi mở app */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <div>
                    <div className="text-xs font-medium text-slate-200">
                      Tự động đồng bộ ngầm khi mở app
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Tự động lưu & cập nhật với Google Drive trong im lặng (không tải file về máy)
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleDriveAutoBackup}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer p-0.5 border-none shrink-0 ${
                      isDriveAutoBackup ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform shadow-md ${
                        isDriveAutoBackup ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* PHẦN 2: LƯU TRỮ TỆP NGOẠI TUYẾN (OFFLINE) */}
          <div className="glass-card bg-slate-800/90 rounded-2xl p-4 border border-white/5 flex flex-col gap-2.5">
            <div>
              <div className="text-xs font-bold text-slate-400 mb-0.5 tracking-wider uppercase">
                LƯU TRỮ TỆP NGOẠI TUYẾN (OFFLINE)
              </div>
              <div className="text-[11px] text-slate-400">
                Xuất hoặc nhập tệp dữ liệu trực tiếp trên thiết bị (không cần kết nối đám mây)
              </div>
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
                  <div className="text-xs font-semibold">Tải tệp JSON về máy (Offline)</div>
                  <div className="text-[11px] text-slate-400">Xuất file .json lưu trên ổ đĩa máy tính</div>
                </div>
              </div>
              <span className="text-xs text-emerald-400 font-semibold shrink-0">Tải về</span>
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

            {/* Khối Xuất Excel kèm tùy chọn phạm vi (FR-E-01) */}
            <div className="bg-slate-900 border border-white/10 rounded-xl p-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-emerald-500 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-100">Báo cáo bảng tính Excel (.xlsx)</div>
                    <div className="text-[11px] text-slate-400">Gồm 3 sheets: Tổng hợp, Chi tiết giao dịch, Danh sách ví</div>
                  </div>
                </div>
              </div>

              {/* Lựa chọn phạm vi xuất */}
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <span className="text-xs text-slate-400 font-medium">Phạm vi:</span>
                <select
                  value={excelScope}
                  onChange={(e) => setExcelScope(e.target.value)}
                  className="input-ios bg-slate-800 text-slate-200 border border-white/10 rounded-xl px-2.5 py-1 text-xs outline-none cursor-pointer focus:border-emerald-500/50"
                >
                  <option value="all">Toàn bộ lịch sử ({txCount} GD)</option>
                  <option value={getCurrentMonth()}>Tháng hiện tại ({getCurrentMonth()})</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleExportExcel}
                disabled={isProcessing}
                className="touch-btn bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer font-semibold text-xs transition-colors"
              >
                {isProcessing ? (
                  <RotateCw size={15} className="animate-spin" />
                ) : (
                  <Download size={15} />
                )}
                <span>Xuất tệp Excel (.xlsx)</span>
              </button>
            </div>
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

            {/* Nút xem hướng dẫn cài đặt PWA lên Home Screen */}
            <button
              type="button"
              onClick={() => setIsIosModalOpen(true)}
              className="mt-1.5 touch-btn bg-slate-900 hover:bg-slate-700/80 text-sky-400 border border-sky-400/20 px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <Smartphone size={16} />
                <span>Xem hướng dẫn cài lên màn hình chính</span>
              </div>
              <span className="text-[11px] text-slate-400">iOS / Android</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal Hướng dẫn cài đặt lên iPhone */}
      <IosInstallPromptModal
        isOpen={isIosModalOpen}
        onClose={() => setIsIosModalOpen(false)}
      />

      {/* MODAL XEM TRƯỚC KHÔI PHỤC DỮ LIỆU (FR-E-03 Restore Preview Dialog) */}
      {restorePreview && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-5 max-w-sm w-full shadow-2xl animate-fade-in flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white m-0">Xác nhận khôi phục</h3>
                <p className="text-xs text-slate-400 m-0">Kiểm tra thông tin trước khi ghi đè</p>
              </div>
            </div>

            {/* Thông tin metadata trích xuất từ file sao lưu */}
            <div className="bg-slate-800/80 rounded-2xl p-3.5 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Tên tệp:</span>
                <span className="font-medium text-slate-200 truncate max-w-[170px]" title={restorePreview.fileName}>
                  {restorePreview.fileName}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Thời gian sao lưu:</span>
                <span className="font-medium text-slate-200">
                  {restorePreview.metadata.exportedAt
                    ? restorePreview.metadata.exportedAt.slice(0, 19).replace('T', ' ')
                    : 'N/A'}
                </span>
              </div>
              <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-2 text-slate-300">
                <div className="bg-slate-900/70 p-2 rounded-xl text-center">
                  <div className="text-[11px] text-slate-400">Giao dịch</div>
                  <div className="text-sm font-bold text-sky-400">{restorePreview.metadata.transactionsCount}</div>
                </div>
                <div className="bg-slate-900/70 p-2 rounded-xl text-center">
                  <div className="text-[11px] text-slate-400">Ví tài khoản</div>
                  <div className="text-sm font-bold text-emerald-400">{restorePreview.metadata.walletsCount}</div>
                </div>
                <div className="bg-slate-900/70 p-2 rounded-xl text-center">
                  <div className="text-[11px] text-slate-400">Danh mục</div>
                  <div className="text-sm font-bold text-amber-400">{restorePreview.metadata.categoriesCount}</div>
                </div>
                <div className="bg-slate-900/70 p-2 rounded-xl text-center">
                  <div className="text-[11px] text-slate-400">Hạn mức</div>
                  <div className="text-sm font-bold text-purple-400">{restorePreview.metadata.budgetsCount}</div>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs leading-relaxed">
              ⚠️ <strong>Cảnh báo:</strong> Thao tác này sẽ cập nhật và đồng bộ toàn bộ cơ sở dữ liệu trên thiết bị theo tệp sao lưu này.
            </div>

            {/* 2 Nút hành động */}
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setRestorePreview(null)}
                className="touch-btn flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer text-center"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmRestore}
                className="touch-btn flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30"
              >
                {isProcessing ? <RotateCw size={14} className="animate-spin" /> : null}
                <span>Khôi phục ngay</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
