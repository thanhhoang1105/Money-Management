// src/components/SettingsModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LOCAL_CONNECTED_SYNC_KEY } from '../db';
import {
  exportFullBackupJSON,
  downloadOrShareFile,
  restoreBackupData,
  validateBackupJSON,
  exportTransactionsToExcel
} from '../services/backupService';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  disconnectSupabase,
  signInOrSignUpSupabase,
  backupToSupabase,
  getBackupFromSupabase,
  connectInitialSupabaseSync,
  performSupabaseSmartSync
} from '../services/supabaseService';
import { getCurrentDate, getCurrentMonth, formatFriendlyDate } from '../utils/formatters';
import { CustomSelect } from './ui/CustomSelect';
import {
  ArrowLeft,
  Clock,
  Database,
  FileSpreadsheet,
  Download,
  Upload,
  ShieldCheck,
  Check,
  AlertTriangle,
  RotateCw,
  CloudUpload,
  CloudDownload,
  LogOut,
  Smartphone,
  Sparkles,
  UserCheck
} from 'lucide-react';

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
  // Supabase Live Queries
  const supabaseSyncKeySetting = useLiveQuery(() => db.settings.get('supabase_sync_key'));
  const supabaseEmailSetting = useLiveQuery(() => db.settings.get('supabase_user_email'));
  const lastSupabaseBackupSetting = useLiveQuery(() =>
    db.settings.get('last_supabase_backup_date')
  );
  const lastSupabaseSyncSetting = useLiveQuery(() =>
    db.settings.get('last_supabase_sync_time')
  );
  const supabaseAutoSyncSetting = useLiveQuery(() =>
    db.settings.get('supabase_auto_sync_enabled')
  );

  const txCount = useLiveQuery(() => db.transactions.count()) || 0;
  const walletCount = useLiveQuery(() => db.wallets.count()) || 0;
  const categoryCount = useLiveQuery(() => db.categories.count()) || 0;

  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isPersistent, setIsPersistent] = useState<boolean>(false);

  // Supabase States
  const [sbSyncKeyInput, setSbSyncKeyInput] = useState<string>('');
  const [sbEmailInput, setSbEmailInput] = useState<string>('');
  const [sbPasswordInput, setSbPasswordInput] = useState<string>('');
  const [authMode, setAuthMode] = useState<'SYNC_KEY' | 'EMAIL_AUTH'>('SYNC_KEY');
  const [isAutoSync, setIsAutoSync] = useState<boolean>(true);

  // Xem trước khôi phục JSON (hiển thị phẳng không dùng Popup)
  const [restorePreview, setRestorePreview] = useState<RestorePreviewData | null>(null);

  // Phạm vi xuất Excel
  const [excelScope, setExcelScope] = useState<'all' | string>('all');

  // Màn hình mở app mặc định
  const [defaultStartTab, setDefaultStartTab] = useState<string>(() => {
    try {
      return localStorage.getItem('app_default_tab') || 'overview';
    } catch {
      return 'overview';
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSupabaseConfig().then((cfg) => {
      setSbSyncKeyInput(cfg.syncKey);
      if (cfg.email) setSbEmailInput(cfg.email);
    });
  }, [supabaseSyncKeySetting?.value, supabaseEmailSetting?.value]);

  useEffect(() => {
    if (supabaseAutoSyncSetting !== undefined) {
      setIsAutoSync(Boolean(supabaseAutoSyncSetting?.value));
    }
  }, [supabaseAutoSyncSetting]);

  useEffect(() => {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      navigator.storage.persisted
    ) {
      navigator.storage
        .persisted()
        .then((persisted) => setIsPersistent(persisted))
        .catch(() => setIsPersistent(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const localStoredKey = (() => {
    try {
      return localStorage.getItem(LOCAL_CONNECTED_SYNC_KEY)?.trim() || '';
    } catch {
      return '';
    }
  })();

  const activeSyncKey =
    (typeof supabaseSyncKeySetting?.value === 'string' &&
      supabaseSyncKeySetting.value.trim()) ||
    localStoredKey ||
    '';
  const activeEmail =
    (typeof supabaseEmailSetting?.value === 'string' &&
      supabaseEmailSetting.value.trim()) ||
    '';
  const isSupabaseConnected = Boolean(activeSyncKey);

  const handleSelectDefaultStartTab = (tabKey: string) => {
    setDefaultStartTab(tabKey);
    try {
      localStorage.setItem('app_default_tab', tabKey);
      setStatusMsg({
        text: 'Đã lưu màn hình mặc định khi mở app!',
        type: 'success'
      });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch {
      // ignore
    }
  };

  // Kết nối bằng Mã Đồng Bộ cá nhân (Sync Key)
  const handleConnectWithSyncKey = async () => {
    if (!sbSyncKeyInput.trim()) {
      setStatusMsg({
        text: 'Vui lòng nhập Mã Đồng Bộ cá nhân (VD: email hoặc mật mã riêng của bạn).',
        type: 'error'
      });
      return;
    }

    setIsProcessing(true);
    setStatusMsg(null);
    try {
      await saveSupabaseConfig({
        syncKey: sbSyncKeyInput.trim(),
        email: sbSyncKeyInput.trim()
      });

      const syncRes = await connectInitialSupabaseSync();
      setStatusMsg({
        text: `Đã kết nối Supabase! ${syncRes.message}`,
        type: 'success'
      });
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || 'Không thể đồng bộ với Supabase',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Đăng nhập hoặc Đăng ký bằng Email & Mật khẩu Supabase Auth
  const handleEmailAuth = async (mode: 'SIGN_IN' | 'SIGN_UP') => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      const res = await signInOrSignUpSupabase(sbEmailInput, sbPasswordInput, mode);
      setSbSyncKeyInput(res.syncKey);
      const syncRes = await connectInitialSupabaseSync();
      setStatusMsg({
        text: `Đăng nhập thành công (${res.email})! ${syncRes.message}`,
        type: 'success'
      });
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || 'Lỗi xác thực tài khoản Supabase',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Sao lưu ngay lên Supabase
  const handleBackupToSupabase = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      await backupToSupabase();
      setStatusMsg({
        text: 'Đã sao lưu toàn bộ dữ liệu lên Supabase Cloud thành công!',
        type: 'success'
      });
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || 'Có lỗi khi sao lưu lên Supabase',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Đồng bộ 2 chiều thông minh qua Supabase
  const handleSmartSyncSupabase = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      const res = await performSupabaseSmartSync();
      setStatusMsg({
        text: res.message,
        type: res.success ? 'success' : 'error'
      });
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || 'Có lỗi khi đồng bộ 2 chiều với Supabase',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Khôi phục từ Supabase
  const handleRestoreFromSupabase = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      const remote = await getBackupFromSupabase();
      if (!remote) {
        setStatusMsg({
          text: 'Chưa có bản sao lưu nào trên Supabase với mã đồng bộ này.',
          type: 'info'
        });
        return;
      }

      const validation = validateBackupJSON(remote.jsonContent);
      if (!validation.isValid || !validation.metadata) {
        setStatusMsg({
          text: validation.error || 'Dữ liệu trên Supabase không đúng cấu trúc.',
          type: 'error'
        });
        return;
      }

      setRestorePreview({
        fileName: `Supabase_Cloud (${activeEmail || activeSyncKey})`,
        jsonContent: remote.jsonContent,
        metadata: validation.metadata
      });
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || 'Không thể tải bản sao lưu từ Supabase',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisconnectSupabase = async () => {
    if (!window.confirm('Bạn có chắc muốn ngắt kết nối đồng bộ Supabase?')) return;
    await disconnectSupabase();
    setSbSyncKeyInput('');
    setStatusMsg({ text: 'Đã ngắt kết nối tài khoản Supabase.', type: 'info' });
  };

  const handleToggleAutoSync = async () => {
    const nextVal = !isAutoSync;
    setIsAutoSync(nextVal);
    await db.settings.put({
      key: 'supabase_auto_sync_enabled',
      value: nextVal
    });
    setStatusMsg({
      text: nextVal
        ? 'Đã bật Tự động đồng bộ ngầm với Supabase'
        : 'Đã tắt Tự động đồng bộ Supabase',
      type: 'info'
    });
  };

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

    reader.readAsText(file);
  };

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

  const lastSupabaseBackupVal = lastSupabaseBackupSetting?.value as string | undefined;
  const lastSupabaseSyncVal =
    typeof lastSupabaseSyncSetting?.value === 'string'
      ? lastSupabaseSyncSetting.value
      : null;

  return (
    <div className="w-full max-w-2xl mx-auto pb-28 animate-fade-in font-body text-slate-100">
      {/* Header Màn hình phẳng cân đối */}
      <div className="px-4 py-3 bg-slate-900/95 border-b border-white/8 flex items-center justify-between gap-3">
        <div className="w-9 shrink-0 flex items-center justify-start">
          <button
            type="button"
            onClick={onClose}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
        </div>

        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider text-center flex-1 truncate m-0">
          Đồng bộ Supabase & Sao lưu
        </h2>

        <div className="w-9 shrink-0" />
      </div>

      {/* Thông báo trạng thái */}
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
            <Check size={16} className="shrink-0" />
          ) : statusMsg.type === 'error' ? (
            <AlertTriangle size={16} className="shrink-0" />
          ) : (
            <Clock size={16} className="shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Khung xác nhận Khôi phục dữ liệu phẳng (không dùng Popup) */}
      {restorePreview && (
        <div className="mx-4 mt-3 bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-5 shadow-2xl animate-fade-in flex flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white m-0">
                Xác nhận khôi phục dữ liệu
              </h3>
              <p className="text-xs text-slate-400 m-0">
                Nguồn: {restorePreview.fileName}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-slate-800/80 p-2 rounded-xl">
              <div className="text-[10px] text-slate-400">Giao dịch</div>
              <div className="text-sm font-bold text-sky-400">
                {restorePreview.metadata.transactionsCount}
              </div>
            </div>
            <div className="bg-slate-800/80 p-2 rounded-xl">
              <div className="text-[10px] text-slate-400">Ví</div>
              <div className="text-sm font-bold text-emerald-400">
                {restorePreview.metadata.walletsCount}
              </div>
            </div>
            <div className="bg-slate-800/80 p-2 rounded-xl">
              <div className="text-[10px] text-slate-400">Hạng mục</div>
              <div className="text-sm font-bold text-amber-400">
                {restorePreview.metadata.categoriesCount}
              </div>
            </div>
            <div className="bg-slate-800/80 p-2 rounded-xl">
              <div className="text-[10px] text-slate-400">Hạn mức</div>
              <div className="text-sm font-bold text-purple-400">
                {restorePreview.metadata.budgetsCount}
              </div>
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setRestorePreview(null)}
              className="touch-btn flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer border-none"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleConfirmRestore}
              className="touch-btn flex-1 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold cursor-pointer border-none"
            >
              {isProcessing ? 'Đang khôi phục...' : 'Xác nhận khôi phục ngay'}
            </button>
          </div>
        </div>
      )}

      <div className="p-4 flex flex-col gap-4">
        {/* PHẦN 1: ĐỒNG BỘ ĐÁM MÂY SUPABASE 2 CHIỀU TỨC THÌ */}
        <div className="bg-slate-900/95 rounded-3xl p-4 border border-emerald-500/25 flex flex-col gap-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 font-black text-sm">
                <Database size={18} />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  <span>Đồng bộ đám mây Supabase</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                    Khuyên dùng
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Hoạt động trên mọi thiết bị Web PC & Điện thoại, không lỗi chặn tên miền
                </div>
              </div>
            </div>

            {isSupabaseConnected && (
              <button
                type="button"
                onClick={handleDisconnectSupabase}
                className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold px-2.5 py-1 rounded-xl bg-rose-500/10 border border-rose-500/20 cursor-pointer flex items-center gap-1"
              >
                <LogOut size={12} />
                <span>Ngắt</span>
              </button>
            )}
          </div>

          {/* Nếu chưa kết nối tài khoản / Mã đồng bộ Supabase */}
          {!isSupabaseConnected ? (
            <div className="flex flex-col gap-3 pt-1">
              {/* Chọn chế độ kết nối: Mã Đồng Bộ nhanh vs Email/Mật khẩu */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-800/80 rounded-xl">
                <button
                  type="button"
                  onClick={() => setAuthMode('SYNC_KEY')}
                  className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer border-none transition-all ${
                    authMode === 'SYNC_KEY'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  Mã Đồng Bộ Nhanh
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('EMAIL_AUTH')}
                  className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer border-none transition-all ${
                    authMode === 'EMAIL_AUTH'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  Đăng nhập Email / Mật khẩu
                </button>
              </div>

              {authMode === 'SYNC_KEY' ? (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Nhập Mã Đồng Bộ cá nhân (Dùng chung trên cả Máy tính & Điện thoại):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={sbSyncKeyInput}
                      onChange={(e) => setSbSyncKeyInput(e.target.value)}
                      placeholder="VD: thanh2026 hoặc email của bạn..."
                      className="input-ios flex-1 bg-slate-800 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white"
                    />
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleConnectWithSyncKey}
                      className="touch-btn py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs cursor-pointer border-none shrink-0"
                    >
                      {isProcessing ? 'Đang kết nối...' : 'Kết nối & Đồng bộ'}
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Chỉ cần nhập cùng 1 Mã Đồng Bộ trên Web PC và Điện thoại để tự động hợp nhất dữ liệu 2 chiều.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="email"
                      value={sbEmailInput}
                      onChange={(e) => setSbEmailInput(e.target.value)}
                      placeholder="Email của bạn..."
                      className="input-ios bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="password"
                      value={sbPasswordInput}
                      onChange={(e) => setSbPasswordInput(e.target.value)}
                      placeholder="Mật khẩu (tối thiểu 6 ký tự)..."
                      className="input-ios bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleEmailAuth('SIGN_IN')}
                      className="touch-btn py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs cursor-pointer border-none"
                    >
                      Đăng nhập
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleEmailAuth('SIGN_UP')}
                      className="touch-btn py-2.5 rounded-xl bg-slate-800 text-emerald-400 border border-emerald-500/30 font-bold text-xs cursor-pointer"
                    >
                      Đăng ký tài khoản mới
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Trạng thái Đã kết nối Supabase */
            <div className="flex flex-col gap-3 pt-1">
              <div className="bg-slate-800/80 rounded-2xl p-3 border border-white/8 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                    <UserCheck size={16} />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold text-white truncate">
                      Mã đồng bộ: <span className="text-emerald-400">{activeEmail || activeSyncKey}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Supabase Cloud • Đồng bộ 2 chiều
                    </div>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold shrink-0">
                  Đã kết nối
                </span>
              </div>

              {/* Nút chính: Sao lưu ngay lên Supabase */}
              <button
                type="button"
                onClick={handleBackupToSupabase}
                disabled={isProcessing}
                className="touch-btn w-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold p-3.5 rounded-2xl flex items-center justify-between cursor-pointer shadow-lg shadow-emerald-950/40 border border-emerald-400/30 transition-all"
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
                    <div className="text-xs font-black text-white uppercase tracking-wide">
                      Sao lưu ngay lên Supabase Cloud
                    </div>
                    <div className="text-[11px] text-emerald-100 mt-0.5">
                      Đẩy toàn bộ ví, hạng mục, sổ nợ & giao dịch lên đám mây
                    </div>
                    {lastSupabaseBackupVal && (
                      <div className="text-[10px] text-emerald-200 font-medium mt-0.5">
                        Sao lưu gần nhất: {formatFriendlyDate(lastSupabaseBackupVal)}
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {/* 2 Nút phụ: Đồng bộ 2 chiều & Khôi phục từ Supabase */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleSmartSyncSupabase}
                  disabled={isProcessing}
                  className="touch-btn p-3 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-white/10 flex items-center gap-2.5 text-left cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                    <RotateCw size={16} className={isProcessing ? 'animate-spin' : ''} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-100">Đồng bộ 2 chiều</div>
                    <div className="text-[10px] text-slate-400">
                      {lastSupabaseSyncVal
                        ? `Lần cuối: ${lastSupabaseSyncVal.slice(0, 10)}`
                        : 'Hợp nhất PC & Mobile'}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleRestoreFromSupabase}
                  disabled={isProcessing}
                  className="touch-btn p-3 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-white/10 flex items-center gap-2.5 text-left cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <CloudDownload size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-100">Khôi phục về máy</div>
                    <div className="text-[10px] text-slate-400">Lấy bản sao trên Cloud</div>
                  </div>
                </button>
              </div>

              {/* Tự động đồng bộ khi có thay đổi ở local */}
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div>
                  <div className="text-xs font-medium text-slate-200">
                    Tự động đồng bộ khi có thay đổi dữ liệu ở máy
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Chỉ đẩy đồng bộ khi đã lưu mã dưới máy và bạn vừa thêm/sửa/xóa dữ liệu
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleAutoSync}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer p-0.5 border-none shrink-0 ${
                    isAutoSync ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform shadow-md ${
                      isAutoSync ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PHẦN 2: MÀN HÌNH MỞ APP MẶC ĐỊNH */}
        <div className="bg-slate-900/90 rounded-2xl p-4 border border-white/8 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <Smartphone size={20} className="text-indigo-400" />
            <div>
              <div className="text-sm font-bold text-slate-100">
                Màn hình mở app mặc định
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Chọn màn hình phẳng xuất hiện đầu tiên khi mở ứng dụng
              </div>
            </div>
          </div>

          <div className="pt-1">
            <CustomSelect
              value={defaultStartTab}
              onChange={handleSelectDefaultStartTab}
              options={[
                { value: 'overview', label: '📊 Tổng quan (Sổ giao dịch)' },
                { value: 'editor', label: '➕ Ghi giao dịch mới' },
                { value: 'wallets', label: '🏦 Tài khoản & Ví tiền' },
                { value: 'analytics', label: '📈 Báo cáo phân tích' },
                { value: 'more', label: '⚙️ Tiện ích khác' }
              ]}
              triggerClassName="text-xs font-bold bg-slate-800"
            />
          </div>
        </div>

        {/* PHẦN 3: SAO LƯU & XUẤT TỆP NGOẠI TUYẾN (JSON & EXCEL) */}
        <div className="bg-slate-900/90 rounded-2xl p-4 border border-white/8 flex flex-col gap-2.5">
          <div>
            <div className="text-xs font-bold text-slate-300 mb-0.5 tracking-wider uppercase">
              Sao lưu tệp ngoại tuyến (JSON & Excel)
            </div>
            <div className="text-[11px] text-slate-400">
              Tải tệp sao lưu trực tiếp về máy tính hoặc điện thoại
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportManualJSON}
            disabled={isProcessing}
            className="touch-btn bg-slate-800/80 text-slate-100 border border-white/8 px-3.5 py-3 rounded-xl flex items-center justify-between cursor-pointer hover:border-white/20 transition-colors"
          >
            <div className="flex items-center gap-2.5 text-left">
              <Download size={18} className="text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs font-semibold">Tải tệp JSON về máy (Offline)</div>
                <div className="text-[11px] text-slate-400">
                  Xuất toàn bộ giao dịch, ví, hạng mục, sổ nợ ra file .json
                </div>
              </div>
            </div>
            <span className="text-xs text-emerald-400 font-semibold shrink-0">Tải về</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="touch-btn bg-slate-800/80 text-slate-100 border border-white/8 px-3.5 py-3 rounded-xl flex items-center justify-between cursor-pointer hover:border-white/20 transition-colors"
          >
            <div className="flex items-center gap-2.5 text-left">
              <Upload size={18} className="text-sky-400 shrink-0" />
              <div>
                <div className="text-xs font-semibold">Khôi phục từ file JSON</div>
                <div className="text-[11px] text-slate-400">
                  Nạp lại dữ liệu từ tệp sao lưu trước đó
                </div>
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

          <div className="bg-slate-800/80 border border-white/8 rounded-xl p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-emerald-500 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    Báo cáo bảng tính Excel (.xlsx)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    3 sheets: Tổng hợp, Chi tiết giao dịch, Danh sách ví
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <span className="text-xs text-slate-400 font-medium">Phạm vi:</span>
              <CustomSelect
                value={excelScope}
                onChange={setExcelScope}
                options={[
                  { value: 'all', label: `Toàn bộ lịch sử (${txCount} GD)` },
                  { value: getCurrentMonth(), label: `Tháng hiện tại (${getCurrentMonth()})` }
                ]}
                className="max-w-[220px]"
                triggerClassName="text-xs py-1.5 px-2.5 bg-slate-800"
              />
            </div>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isProcessing}
              className="touch-btn bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer font-semibold text-xs transition-colors"
            >
              <Download size={15} />
              <span>Xuất tệp Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* PHẦN 4: THÔNG TIN BỘ NHỚ THIẾT BỊ */}
        <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-white/8 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck
              size={18}
              className={isPersistent ? 'text-emerald-400' : 'text-amber-400'}
            />
            <div className="text-xs font-bold text-slate-100">
              Bộ nhớ thiết bị (IndexedDB Local-First)
            </div>
          </div>

          <div className="flex gap-4 pt-1 text-xs text-slate-300">
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

        <div className="pt-1 text-center text-slate-500 text-[11px] flex items-center justify-center gap-1.5">
          <Sparkles size={13} className="text-emerald-400" />
          <span>Sổ Thu Chi V3.0 • Flat UI • Supabase Cloud Sync</span>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
