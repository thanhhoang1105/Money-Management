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
  performSupabaseSmartSync,
  checkSyncKeySecurity,
  verifySyncPin,
  recoverSyncPinWithAnswer,
  setupOrUpdateSyncSecurity,
  removeSyncSecurity,
  SUPABASE_SETUP_SQL
} from '../services/supabaseService';
import {
  checkAndCreateDailyCloudSnapshot,
  getCloudSnapshotHistory,
  restoreFromCloudSnapshot,
  type CloudSnapshotItem
} from '../services/snapshotService';
import { PREDEFINED_SECURITY_QUESTIONS } from '../utils/crypto';
import { getCurrentDate, getCurrentMonth, formatFriendlyDate } from '../utils/formatters';
import { CustomSelect } from './ui/CustomSelect';
import { Toast } from './ui/Toast';
import {
  ArrowLeft,
  Database,
  FileSpreadsheet,
  Download,
  Upload,
  AlertTriangle,
  RotateCw,
  CloudUpload,
  CloudDownload,
  LogOut,
  UserCheck,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  HelpCircle,
  Lock,
  X,
  History,
  Camera,
  Copy,
  Check
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
  const supabasePinHashSetting = useLiveQuery(() => db.settings.get('supabase_pin_hash'));
  const supabaseQuestionSetting = useLiveQuery(() => db.settings.get('supabase_recovery_question'));
  const hasConfiguredPin = Boolean(supabasePinHashSetting?.value);

  const txCount = useLiveQuery(() => db.transactions.count()) || 0;

  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Supabase States
  const [sbSyncKeyInput, setSbSyncKeyInput] = useState<string>('');
  const [sbEmailInput, setSbEmailInput] = useState<string>('');
  const [sbPasswordInput, setSbPasswordInput] = useState<string>('');
  const [authMode, setAuthMode] = useState<'SYNC_KEY' | 'EMAIL_AUTH'>('SYNC_KEY');
  const [isAutoSync, setIsAutoSync] = useState<boolean>(true);
  const [showSyncKey, setShowSyncKey] = useState<boolean>(false);
  const [showInputSyncKey, setShowInputSyncKey] = useState<boolean>(false);

  // States Quản lý Bảo mật (PIN & Câu hỏi bảo mật)
  const [isSecurityFormOpen, setIsSecurityFormOpen] = useState(false);
  const [formPin, setFormPin] = useState('');
  const [formConfirmPin, setFormConfirmPin] = useState('');
  const [formQuestion, setFormQuestion] = useState(PREDEFINED_SECURITY_QUESTIONS[0]);
  const [formCustomQuestion, setFormCustomQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');
  const [showFormPin, setShowFormPin] = useState(false);

  // State Xác thực PIN / Khôi phục PIN khi kết nối từ máy mới
  const [pinPrompt, setPinPrompt] = useState<{
    syncKey: string;
    recoveryQuestion?: string;
    mode: 'ENTER_PIN' | 'RECOVER_PIN';
  } | null>(null);
  const [verifyPinInput, setVerifyPinInput] = useState('');
  const [recoverAnswerInput, setRecoverAnswerInput] = useState('');
  const [recoverNewPinInput, setRecoverNewPinInput] = useState('');
  const [showVerifyPin, setShowVerifyPin] = useState(false);

  // Snapshot 5 ngày qua trên Supabase
  const [snapshots, setSnapshots] = useState<CloudSnapshotItem[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [snapshotTableMissing, setSnapshotTableMissing] = useState<boolean>(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
  const [confirmRestoreSnapshot, setConfirmRestoreSnapshot] = useState<CloudSnapshotItem | null>(null);
  const [restorePinInput, setRestorePinInput] = useState<string>('');
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  // Xem trước khôi phục JSON (hiển thị phẳng không dùng Popup)
  const [restorePreview, setRestorePreview] = useState<RestorePreviewData | null>(null);

  // Phạm vi xuất Excel
  const [excelScope, setExcelScope] = useState<'all' | string>('all');

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

  const loadSnapshots = async () => {
    if (!activeSyncKey) return;
    setIsLoadingSnapshots(true);
    try {
      const res = await getCloudSnapshotHistory();
      setSnapshots(res.snapshots);
      setSnapshotTableMissing(Boolean(res.tableMissing));
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  useEffect(() => {
    if (isOpen && isSupabaseConnected) {
      loadSnapshots();
    }
  }, [isOpen, isSupabaseConnected]);

  if (!isOpen) return null;

  const handleCreateManualSnapshot = async () => {
    setIsCreatingSnapshot(true);
    try {
      const res = await checkAndCreateDailyCloudSnapshot({ force: true });
      if (res.created) {
        setStatusMsg({ text: res.message, type: 'success' });
        await loadSnapshots();
      } else {
        setStatusMsg({ text: res.message, type: 'info' });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Lỗi tạo snapshot', type: 'error' });
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleConfirmRestoreSnapshot = async () => {
    if (!confirmRestoreSnapshot) return;
    if (hasConfiguredPin) {
      if (!restorePinInput.trim()) {
        setStatusMsg({ text: 'Vui lòng nhập mã PIN bảo mật để khôi phục', type: 'error' });
        return;
      }
      const pinValid = await verifySyncPin(activeSyncKey, restorePinInput.trim());
      if (!pinValid) {
        setStatusMsg({ text: 'Mã PIN bảo mật không chính xác', type: 'error' });
        return;
      }
    }
    setIsRestoring(true);
    try {
      const res = await restoreFromCloudSnapshot(confirmRestoreSnapshot.id);
      setStatusMsg({ text: res.message, type: 'success' });
      setConfirmRestoreSnapshot(null);
      setRestorePinInput('');
      await loadSnapshots();
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Lỗi khôi phục điểm sao lưu', type: 'error' });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCopySetupSql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    } catch {
      setStatusMsg({ text: 'Không thể sao chép vào bộ nhớ tạm', type: 'error' });
    }
  };

  // Hoàn tất lưu cấu hình và đồng bộ sau khi vượt qua xác thực PIN
  const doFinishConnect = async (cleanKey: string) => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      await saveSupabaseConfig({
        syncKey: cleanKey,
        email: cleanKey
      });

      const syncRes = await connectInitialSupabaseSync();
      setPinPrompt(null);
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

  // Kết nối bằng Mã Đồng Bộ cá nhân (Sync Key) với bước kiểm tra PIN
  const handleConnectWithSyncKey = async () => {
    const cleanKey = sbSyncKeyInput.trim();
    if (!cleanKey) {
      setStatusMsg({
        text: 'Vui lòng nhập Mã Đồng Bộ cá nhân (VD: email hoặc mật mã riêng của bạn).',
        type: 'error'
      });
      return;
    }

    setIsProcessing(true);
    setStatusMsg(null);
    try {
      // 1. Kiểm tra xem mã này trên Supabase đã có PIN chưa
      const sec = await checkSyncKeySecurity(cleanKey);

      if (sec.exists && sec.hasPin) {
        // Mã này có PIN -> Yêu cầu nhập PIN xác thực!
        setPinPrompt({
          syncKey: cleanKey,
          recoveryQuestion: sec.recoveryQuestion,
          mode: 'ENTER_PIN'
        });
        setVerifyPinInput('');
        setIsProcessing(false);
        return;
      }

      // Chưa có PIN (hoặc mã mới tinh) -> Kết nối bình thường
      await doFinishConnect(cleanKey);
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || 'Không thể kiểm tra đồng bộ với Supabase',
        type: 'error'
      });
      setIsProcessing(false);
    }
  };

  // Xác thực mã PIN khi kết nối máy mới
  const handleConfirmVerifyPin = async () => {
    if (!pinPrompt) return;
    if (!verifyPinInput.trim()) {
      setStatusMsg({ text: 'Vui lòng nhập mã PIN bảo vệ', type: 'error' });
      return;
    }

    setIsProcessing(true);
    try {
      const isValid = await verifySyncPin(pinPrompt.syncKey, verifyPinInput);
      if (!isValid) {
        setStatusMsg({
          text: 'Mã PIN bảo vệ không chính xác! Vui lòng thử lại hoặc bấm "Quên mã PIN?"',
          type: 'error'
        });
        setIsProcessing(false);
        return;
      }

      // PIN đúng -> Hoàn tất kết nối
      await doFinishConnect(pinPrompt.syncKey);
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Lỗi xác thực mã PIN', type: 'error' });
      setIsProcessing(false);
    }
  };

  // Khôi phục mã PIN bằng câu hỏi bảo mật
  const handleConfirmRecoverPin = async () => {
    if (!pinPrompt) return;
    const answer = recoverAnswerInput.trim();
    const newPin = recoverNewPinInput.trim();

    if (!answer) {
      setStatusMsg({ text: 'Vui lòng nhập câu trả lời bảo mật', type: 'error' });
      return;
    }
    if (!newPin || newPin.length < 4) {
      setStatusMsg({ text: 'Mã PIN mới cần tối thiểu 4 ký tự', type: 'error' });
      return;
    }

    setIsProcessing(true);
    try {
      const res = await recoverSyncPinWithAnswer(
        pinPrompt.syncKey,
        answer,
        newPin
      );

      if (!res.success) {
        setStatusMsg({ text: res.message, type: 'error' });
        setIsProcessing(false);
        return;
      }

      // Khôi phục thành công -> Kết nối luôn
      await doFinishConnect(pinPrompt.syncKey);
      setStatusMsg({
        text: 'Khôi phục mã PIN thành công! Đã kết nối và đồng bộ dữ liệu.',
        type: 'success'
      });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Lỗi khôi phục mã PIN', type: 'error' });
      setIsProcessing(false);
    }
  };

  // Lưu thiết lập Mã PIN & Câu hỏi bảo mật mới
  const handleSaveSecuritySettings = async () => {
    const pin = formPin.trim();
    const confirm = formConfirmPin.trim();
    const question =
      formQuestion === 'Tự nhập câu hỏi riêng của bạn...'
        ? formCustomQuestion.trim()
        : formQuestion.trim();
    const answer = formAnswer.trim();

    if (!pin || pin.length < 4) {
      setStatusMsg({ text: 'Mã PIN cần có tối thiểu 4 ký tự (số hoặc chữ).', type: 'error' });
      return;
    }
    if (pin !== confirm) {
      setStatusMsg({ text: 'Mã PIN nhập lại không khớp. Vui lòng kiểm tra lại.', type: 'error' });
      return;
    }
    if (!question) {
      setStatusMsg({ text: 'Vui lòng chọn hoặc nhập câu hỏi bảo mật.', type: 'error' });
      return;
    }
    if (!answer) {
      setStatusMsg({ text: 'Vui lòng nhập câu trả lời bảo mật để khôi phục khi quên PIN.', type: 'error' });
      return;
    }

    setIsProcessing(true);
    try {
      await setupOrUpdateSyncSecurity(pin, question, answer);
      setIsSecurityFormOpen(false);
      setStatusMsg({
        text: 'Đã kích hoạt Mã PIN & Câu hỏi khôi phục bảo vệ Mã đồng bộ thành công!',
        type: 'success'
      });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Lỗi lưu bảo mật PIN', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Gỡ bỏ mã PIN
  const handleRemovePin = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn gỡ bỏ Mã PIN bảo vệ? Bất kỳ ai có Mã đồng bộ sẽ có thể truy cập dữ liệu.')) {
      return;
    }

    setIsProcessing(true);
    try {
      await removeSyncSecurity();
      setIsSecurityFormOpen(false);
      setStatusMsg({ text: 'Đã gỡ bỏ Mã PIN bảo vệ khỏi Mã đồng bộ.', type: 'info' });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Lỗi gỡ bỏ mã PIN', type: 'error' });
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
        text: result.cloudSynced
          ? `Đã đẩy lên Cloud & khôi phục thành công: ${result.counts.transactions} giao dịch, ${result.counts.wallets} ví, ${result.counts.categories} danh mục!`
          : `Khôi phục thành công: ${result.counts.transactions} giao dịch, ${result.counts.wallets} ví, ${result.counts.categories} danh mục!`,
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
    <div className="w-full max-w-2xl mx-auto pb-36 animate-fade-in font-body text-slate-100">
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

      {/* Thông báo trạng thái nổi (Floating Popup Toast) */}
      {statusMsg && (
        <Toast
          message={statusMsg.text}
          type={statusMsg.type}
          onClose={() => setStatusMsg(null)}
        />
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

          {activeSyncKey && (
            <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-2.5 flex items-start gap-2 text-left">
              <CloudUpload size={16} className="text-sky-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-sky-200">
                <span className="font-semibold text-white">Bảo vệ đồng bộ Cloud:</span> Dữ liệu tệp này sẽ được đẩy thẳng lên Supabase Cloud làm bản gốc mới nhất trước rồi mới nạp vào máy, đảm bảo Cloud không lấy dữ liệu cũ đè lên dữ liệu vừa khôi phục.
              </div>
            </div>
          )}

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
              {isProcessing ? 'Đang đẩy lên Cloud & khôi phục...' : 'Xác nhận khôi phục ngay'}
            </button>
          </div>
        </div>
      )}

      <div className="p-4 flex flex-col gap-4">
        {/* PHẦN 1: ĐỒNG BỘ ĐÁM MÂY SUPABASE 2 CHIỀU TỨC THÌ */}
        <div className="bg-slate-900/95 rounded-3xl p-4 border border-emerald-500/25 flex flex-col gap-3.5 shadow-xl">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 font-black text-sm shrink-0 mt-0.5">
              <Database size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-100">Đồng bộ đám mây Supabase</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold whitespace-nowrap shrink-0 border border-emerald-500/35">
                  Khuyên dùng
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1 leading-snug">
                Hoạt động trên mọi thiết bị Web PC & Điện thoại, không lỗi chặn tên miền
              </div>
            </div>
          </div>

          {/* Nếu chưa kết nối tài khoản / Mã đồng bộ Supabase */}
          {!isSupabaseConnected ? (
            pinPrompt ? (
              /* Khung Xác thực PIN hoặc Khôi phục PIN khi kết nối máy mới */
              <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/40 flex flex-col gap-3 shadow-xl animate-fade-in">
                {pinPrompt.mode === 'ENTER_PIN' ? (
                  <>
                    <div className="flex items-center gap-2.5 border-b border-white/8 pb-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <Lock size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-white">
                          Nhập Mã PIN bảo vệ
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Mã đồng bộ <b className="text-emerald-400">{pinPrompt.syncKey}</b> đã được khóa bằng mã PIN
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Mã PIN xác thực:
                      </label>
                      <div className="relative">
                        <input
                          type={showVerifyPin ? 'text' : 'password'}
                          value={verifyPinInput}
                          onChange={(e) => setVerifyPinInput(e.target.value)}
                          placeholder="Nhập mã PIN..."
                          className="input-ios w-full pr-10 text-sm font-bold tracking-wider"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleConfirmVerifyPin();
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowVerifyPin(!showVerifyPin)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white border-none bg-transparent cursor-pointer p-1"
                        >
                          {showVerifyPin ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPinPrompt({ ...pinPrompt, mode: 'RECOVER_PIN' });
                          setRecoverAnswerInput('');
                          setRecoverNewPinInput('');
                        }}
                        className="text-xs text-sky-400 hover:underline border-none bg-transparent cursor-pointer font-semibold"
                      >
                        Quên mã PIN?
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPinPrompt(null)}
                          className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold border-none cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmVerifyPin}
                          disabled={isProcessing}
                          className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black border-none cursor-pointer hover:bg-emerald-400"
                        >
                          {isProcessing ? 'Đang xác thực...' : 'Xác nhận & Kết nối'}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  /* Chế độ KHÔI PHỤC PIN bằng câu hỏi bảo mật */
                  <>
                    <div className="flex items-center gap-2.5 border-b border-white/8 pb-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                        <HelpCircle size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-white">
                          Khôi phục mã PIN bằng Câu hỏi bảo mật
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Trả lời đúng câu hỏi đã đặt để tạo mã PIN mới
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-800/80 p-3 rounded-xl border border-white/5 flex flex-col gap-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                        Câu hỏi bảo mật của bạn:
                      </span>
                      <span className="text-xs font-bold text-amber-300">
                        {pinPrompt.recoveryQuestion || 'Câu hỏi bảo mật đã lưu của bạn'}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Câu trả lời của bạn:
                      </label>
                      <input
                        type="text"
                        value={recoverAnswerInput}
                        onChange={(e) => setRecoverAnswerInput(e.target.value)}
                        placeholder="Nhập câu trả lời..."
                        className="input-ios w-full text-xs"
                        autoFocus
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Mã PIN mới bạn muốn đặt:
                      </label>
                      <input
                        type="password"
                        value={recoverNewPinInput}
                        onChange={(e) => setRecoverNewPinInput(e.target.value)}
                        placeholder="Tối thiểu 4 số/chữ..."
                        className="input-ios w-full text-xs font-bold"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => setPinPrompt({ ...pinPrompt, mode: 'ENTER_PIN' })}
                        className="text-xs text-slate-400 hover:text-white border-none bg-transparent cursor-pointer"
                      >
                        ← Quay lại nhập PIN
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPinPrompt(null)}
                          className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold border-none cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmRecoverPin}
                          disabled={isProcessing}
                          className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black border-none cursor-pointer hover:bg-emerald-400"
                        >
                          {isProcessing ? 'Đang kiểm tra...' : 'Đặt lại PIN & Kết nối'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
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
                    <div className="relative flex-1">
                      <input
                        type={showInputSyncKey ? 'text' : 'password'}
                        value={sbSyncKeyInput}
                        onChange={(e) => setSbSyncKeyInput(e.target.value)}
                        placeholder="VD: thanh2026 hoặc email của bạn..."
                        className="input-ios w-full bg-slate-800 border border-white/10 rounded-xl px-3.5 py-2.5 pr-10 text-sm text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowInputSyncKey((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 border-none bg-transparent cursor-pointer transition-colors"
                        title={showInputSyncKey ? 'Ẩn mã' : 'Hiện mã'}
                      >
                        {showInputSyncKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
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
            )
          ) : (
            /* Trạng thái Đã kết nối Supabase */
            <div className="flex flex-col gap-3 pt-1">
              <div className="bg-slate-800/80 rounded-2xl p-3 border border-white/8 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                    <UserCheck size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                      <span>Mã đồng bộ:</span>
                      <span className="text-emerald-400 font-mono tracking-wider font-extrabold">
                        {showSyncKey ? (activeEmail || activeSyncKey) : '••••••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowSyncKey((prev) => !prev)}
                        className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 cursor-pointer border-none transition-colors inline-flex items-center"
                        title={showSyncKey ? 'Ẩn mã đồng bộ' : 'Hiện mã đồng bộ'}
                      >
                        {showSyncKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
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

              {/* Thẻ Quản lý Bảo mật Mã PIN & Câu hỏi khôi phục */}
              <div className="bg-slate-800/80 rounded-2xl p-3 border border-white/8 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        hasConfiguredPin
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      <KeyRound size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                        <span>Bảo vệ Mã đồng bộ (PIN)</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                            hasConfiguredPin
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {hasConfiguredPin ? 'Đang bật' : 'Chưa bật'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {hasConfiguredPin
                          ? `Câu hỏi khôi phục: "${supabaseQuestionSetting?.value || 'Đã cài đặt'}"`
                          : 'Khóa mã để tránh người khác kết nối trái phép'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsSecurityFormOpen(!isSecurityFormOpen);
                      setFormPin('');
                      setFormConfirmPin('');
                      setFormAnswer('');
                    }}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl border cursor-pointer transition-colors shrink-0 ${
                      hasConfiguredPin
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 border-white/10'
                        : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {hasConfiguredPin ? 'Đổi PIN' : '+ Cài đặt PIN'}
                  </button>
                </div>

                {/* Form thiết lập / thay đổi mã PIN phẳng */}
                {isSecurityFormOpen && (
                  <div className="p-3 bg-slate-900/90 rounded-xl border border-white/10 flex flex-col gap-2.5 animate-fade-in mt-1">
                    <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                      <span className="text-xs font-extrabold text-slate-200">
                        {hasConfiguredPin
                          ? 'Đổi Mã PIN & Câu hỏi bảo mật'
                          : 'Thiết lập Mã PIN bảo vệ'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsSecurityFormOpen(false)}
                        className="text-slate-400 hover:text-white p-1 border-none bg-transparent cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                          Mã PIN mới (≥ 4 số/chữ) *
                        </label>
                        <div className="relative">
                          <input
                            type={showFormPin ? 'text' : 'password'}
                            value={formPin}
                            onChange={(e) => setFormPin(e.target.value)}
                            placeholder="VD: 123456"
                            className="input-ios w-full pr-8 text-xs font-bold tracking-wider"
                          />
                          <button
                            type="button"
                            onClick={() => setShowFormPin(!showFormPin)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white border-none bg-transparent cursor-pointer p-0.5"
                          >
                            {showFormPin ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                          Nhập lại mã PIN *
                        </label>
                        <input
                          type={showFormPin ? 'text' : 'password'}
                          value={formConfirmPin}
                          onChange={(e) => setFormConfirmPin(e.target.value)}
                          placeholder="Nhập lại PIN"
                          className="input-ios w-full text-xs font-bold tracking-wider"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Câu hỏi bảo mật (Để khôi phục nếu quên PIN) *
                      </label>
                      <CustomSelect
                        value={formQuestion}
                        onChange={setFormQuestion}
                        options={PREDEFINED_SECURITY_QUESTIONS.map((q) => ({
                          value: q,
                          label: q
                        }))}
                        triggerClassName="text-xs py-1.5 px-2 bg-slate-800"
                      />
                    </div>

                    {formQuestion === 'Tự nhập câu hỏi riêng của bạn...' && (
                      <input
                        type="text"
                        value={formCustomQuestion}
                        onChange={(e) => setFormCustomQuestion(e.target.value)}
                        placeholder="Nhập câu hỏi bảo mật riêng của bạn..."
                        className="input-ios w-full text-xs"
                      />
                    )}

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Câu trả lời bảo mật của bạn *
                      </label>
                      <input
                        type="text"
                        value={formAnswer}
                        onChange={(e) => setFormAnswer(e.target.value)}
                        placeholder="VD: 8899 hoặc tên thú cưng..."
                        className="input-ios w-full text-xs font-semibold text-emerald-400"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      {hasConfiguredPin ? (
                        <button
                          type="button"
                          onClick={handleRemovePin}
                          className="text-[11px] text-rose-400 hover:underline border-none bg-transparent cursor-pointer"
                        >
                          Gỡ bỏ mã PIN
                        </button>
                      ) : <span />}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsSecurityFormOpen(false)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold border-none cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveSecuritySettings}
                          disabled={isProcessing}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold border-none cursor-pointer hover:bg-emerald-400"
                        >
                          Lưu cài đặt PIN
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Nút chính: Sao lưu ngay lên Supabase */}
              <button
                type="button"
                onClick={handleBackupToSupabase}
                disabled={isProcessing}
                className="touch-btn w-full bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-teal-500/15 hover:from-emerald-500/25 hover:to-teal-500/25 border border-emerald-500/35 hover:border-emerald-500/50 p-3.5 rounded-2xl flex items-center justify-between cursor-pointer shadow-lg shadow-emerald-950/20 transition-all text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                    {isProcessing ? (
                      <RotateCw size={20} className="animate-spin text-emerald-400" />
                    ) : (
                      <CloudUpload size={20} className="text-emerald-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-emerald-400 uppercase tracking-wide">
                      Sao lưu ngay lên Supabase Cloud
                    </div>
                    <div className="text-[11px] text-slate-300 mt-0.5 truncate">
                      Đẩy toàn bộ ví, hạng mục, sổ nợ & giao dịch lên đám mây
                    </div>
                    {lastSupabaseBackupVal && (
                      <div className="text-[10px] text-emerald-400/80 font-medium mt-0.5">
                        Sao lưu gần nhất: {formatFriendlyDate(lastSupabaseBackupVal)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0 ml-2">
                  <ChevronRight size={14} />
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

              {/* KHU VỰC ĐIỂM KHÔI PHỤC DỮ LIỆU (5 NGÀY GẦN NHẤT) */}
              <div className="bg-slate-950/70 rounded-xl p-3 border border-white/8 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History size={16} className="text-amber-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-slate-200">
                        Điểm khôi phục dữ liệu (5 ngày qua)
                      </div>
                      <div className="text-[10px] text-slate-400 m-0">
                        Tự động snapshot hàng ngày phòng ngừa lỗi hoặc mất dữ liệu
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateManualSnapshot}
                    disabled={isCreatingSnapshot}
                    className="touch-btn text-[10px] font-bold py-1 px-2.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/25 flex items-center gap-1 cursor-pointer shrink-0"
                    title="Chốt snapshot trạng thái hiện tại"
                  >
                    {isCreatingSnapshot ? (
                      <RotateCw size={11} className="animate-spin" />
                    ) : (
                      <Camera size={11} />
                    )}
                    <span>Chụp ngay</span>
                  </button>
                </div>

                {snapshotTableMissing ? (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex flex-col gap-2">
                    <div className="text-[11px] leading-relaxed">
                      ⚠️ Bảng lịch sử <code className="text-amber-300 font-mono">user_backup_history</code> chưa có trên Supabase của bạn. Hãy sao chép đoạn mã SQL bên dưới và dán vào mục <strong>SQL Editor</strong> trên Supabase để kích hoạt tính năng này.
                    </div>
                    <button
                      type="button"
                      onClick={handleCopySetupSql}
                      className="touch-btn py-1 px-2.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer self-start"
                    >
                      {copiedSql ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedSql ? 'Đã sao chép SQL!' : 'Sao chép mã SQL Supabase'}</span>
                    </button>
                  </div>
                ) : isLoadingSnapshots ? (
                  <div className="flex items-center justify-center py-3 text-slate-400 text-xs gap-2">
                    <RotateCw size={14} className="animate-spin text-sky-400" />
                    <span>Đang tải các điểm khôi phục...</span>
                  </div>
                ) : snapshots.length === 0 ? (
                  <div className="text-[11px] text-slate-400 italic py-2 text-center bg-slate-900/50 rounded-lg">
                    Chưa có điểm snapshot nào. Bấm "Chụp ngay" để lưu bản đầu tiên hôm nay.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {snapshots.map((item) => {
                      const isToday = item.backupDate === getCurrentDate();
                      const timeStr = item.createdAt ? item.createdAt.slice(11, 16) : '';
                      return (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-lg bg-slate-900/90 border border-white/6 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                isToday ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-slate-500'
                              }`}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-100">
                                  {isToday ? 'Hôm nay' : formatFriendlyDate(item.backupDate)}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  ({item.backupDate})
                                </span>
                                {timeStr && (
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {timeStr}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {item.txCount} giao dịch • {item.walletCount} tài khoản/ví
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setConfirmRestoreSnapshot(item);
                              setRestorePinInput('');
                            }}
                            className="touch-btn shrink-0 py-1.5 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/25 font-bold text-[11px] cursor-pointer transition-colors"
                          >
                            Khôi phục
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
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

              {/* Nút ngắt kết nối dạng thanh ngang dài phía dưới */}
              <button
                type="button"
                onClick={handleDisconnectSupabase}
                className="touch-btn w-full py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors mt-1"
              >
                <LogOut size={14} />
                <span>Ngắt kết nối Supabase Cloud</span>
              </button>
            </div>
          )}
        </div>

        {/* PHẦN 2: SAO LƯU & XUẤT TỆP NGOẠI TUYẾN (JSON & EXCEL) */}
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

        {/* MODAL XÁC NHẬN KHÔI PHỤC SNAPSHOT CLOUD */}
        {confirmRestoreSnapshot && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-amber-500/30 p-4 flex flex-col gap-3 shadow-2xl">
              <div className="flex items-center gap-2.5 text-amber-400">
                <AlertTriangle size={20} className="shrink-0" />
                <h3 className="text-sm font-extrabold text-white m-0">
                  Xác nhận khôi phục điểm sao lưu
                </h3>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed m-0">
                Bạn có chắc chắn muốn khôi phục dữ liệu về ngày <strong className="text-amber-300">{confirmRestoreSnapshot.backupDate}</strong> ({confirmRestoreSnapshot.txCount} giao dịch, {confirmRestoreSnapshot.walletCount} tài khoản/ví)?
              </p>
              <p className="text-[11px] text-rose-400/90 leading-relaxed m-0">
                ⚠️ Dữ liệu hiện tại trên thiết bị sẽ được thay thế bằng bản sao lưu này.
              </p>

              {hasConfiguredPin && (
                <div className="mt-1">
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Nhập mã PIN bảo mật để xác thực:
                  </label>
                  <input
                    type="password"
                    value={restorePinInput}
                    onChange={(e) => setRestorePinInput(e.target.value)}
                    placeholder="Nhập mã PIN"
                    className="input-ios w-full text-xs font-bold tracking-wider"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRestoreSnapshot(null);
                    setRestorePinInput('');
                  }}
                  className="touch-btn flex-1 py-2 px-3 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/10 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRestoreSnapshot}
                  disabled={isRestoring}
                  className="touch-btn flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isRestoring ? (
                    <RotateCw size={13} className="animate-spin" />
                  ) : (
                    <History size={13} />
                  )}
                  <span>Xác nhận</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsModal;
