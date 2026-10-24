import { useState, useEffect } from 'react';
import { initializeSeedData } from './db/seed';
import { requestPersistentStorage } from './db';
import { BottomNav, type TabType } from './components/BottomNav';
import { TransactionListTab } from './components/TransactionListTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { WalletsTab } from './components/WalletsTab';
import { MoreTab } from './components/MoreTab';
import { TransactionEditorScreen } from './components/TransactionEditorScreen';
import { SettingsModal } from './components/SettingsModal';
import { checkAndRunSupabaseAutoSync } from './services/supabaseService';
import { processDueRecurringTransactions } from './services/transactionService';
import type { Transaction, AppStartupTab } from './types';
import {
  Share,
  X,
  Smartphone,
  Settings as SettingsIcon,
  Check,
  Plus,
  LayoutDashboard,
  Wallet as WalletIcon,
  PieChart,
  MoreHorizontal
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Kiểm tra nếu app đang chạy ở chế độ Standalone (Đã thêm vào Màn hình chính)
function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

export function App() {
  // Đọc tab khởi động mặc định từ localStorage (mặc định 'overview')
  const [defaultInitialTab, setDefaultInitialTab] = useState<AppStartupTab>(() => {
    try {
      const saved = localStorage.getItem('app_default_tab') as AppStartupTab;
      if (
        saved === 'editor' ||
        saved === 'overview' ||
        saved === 'wallets' ||
        saved === 'analytics' ||
        saved === 'more'
      ) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'overview';
  });

  const [currentTab, setCurrentTab] = useState<TabType>(
    defaultInitialTab === 'editor' ? 'overview' : (defaultInitialTab as TabType)
  );
  // Nếu màn mặc định là 'editor' (Ghi giao dịch), mở thẳng màn hình phẳng Ghi Giao Dịch
  const [isEditorOpen, setIsEditorOpen] = useState(defaultInitialTab === 'editor');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [autoBackupNotice, setAutoBackupNotice] = useState<string | null>(null);

  // Đổi màn hình mặc định khi mở app
  const handleChangeDefaultTab = (tab: AppStartupTab) => {
    setDefaultInitialTab(tab);
    try {
      localStorage.setItem('app_default_tab', tab);
    } catch {
      // ignore
    }
  };

  // PWA Service Worker Auto Update
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        setInterval(() => r.update(), 60 * 60 * 1000);
      }
    }
  });

  const isStandalone = checkIsStandalone();
  const [showIosTip, setShowIosTip] = useState(() => {
    if (checkIsStandalone()) return false;
    try {
      return localStorage.getItem('hide_ios_tip') !== 'true';
    } catch {
      return true;
    }
  });

  // Khởi tạo Seed Data, Chạy Giao dịch định kỳ đến hạn & Đồng bộ thông minh Supabase
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerSyncIfDirty = async () => {
      const sbRes = await checkAndRunSupabaseAutoSync('DIRTY_ONLY');
      if (sbRes.ran) {
        setAutoBackupNotice(sbRes.message);
        setTimeout(() => setAutoBackupNotice(null), 5000);
      }
    };

    const triggerStartupCheck = async () => {
      const sbRes = await checkAndRunSupabaseAutoSync('STARTUP');
      if (sbRes.ran) {
        setAutoBackupNotice(sbRes.message);
        setTimeout(() => setAutoBackupNotice(null), 5000);
      }
    };

    requestPersistentStorage();
    initializeSeedData()
      .then(async () => {
        const recurringExecuted = await processDueRecurringTransactions();
        if (recurringExecuted > 0) {
          setAutoBackupNotice(`Đã tự động ghi ${recurringExecuted} giao dịch định kỳ đến hạn!`);
          setTimeout(() => setAutoBackupNotice(null), 6000);
        }

        // Khi vừa mở app: Tự động kiểm tra và kéo ngay dữ liệu mới nhất nếu Cloud có bản cập nhật mới
        await triggerStartupCheck();
      })
      .catch((err) => {
        console.error('Lỗi khởi tạo dữ liệu seed:', err);
      });

    // Khi người dùng quay lại tab (chuyển từ tab khác hoặc mở khóa màn hình)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        await triggerStartupCheck();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Chỉ kích hoạt đồng bộ đẩy lên Cloud sau 3 giây kể từ khi người dùng thực sự thêm/sửa/xóa dữ liệu ở local
    const handleLocalDataChanged = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void triggerSyncIfDirty();
      }, 3000);
    };

    window.addEventListener('local-data-changed', handleLocalDataChanged);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('local-data-changed', handleLocalDataChanged);
    };
  }, []);

  const handleOpenQuickAdd = () => {
    setEditingTransaction(null);
    setIsSettingsOpen(false);
    setIsEditorOpen(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleEditTransaction = (tx: Transaction) => {
    setEditingTransaction(tx);
    setIsSettingsOpen(false);
    setIsEditorOpen(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleDismissIosTip = () => {
    setShowIosTip(false);
    try {
      localStorage.setItem('hide_ios_tip', 'true');
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-app-bg text-text-main font-body">
      {/* 1. Header Bar chuẩn Responsive Web (Mobile + Desktop) */}
      <header className="sticky top-0 z-30 safe-padding-top pb-3 px-4 bg-slate-900/95 backdrop-blur-md border-b border-white/8">
        <div className="w-full max-w-5xl mx-auto flex items-center justify-between">
          {/* Logo & Tên ứng dụng */}
          <div className="flex items-center gap-3">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center font-black text-base text-white shadow-md shadow-emerald-500/30 shrink-0">
              ₫
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-[17px] font-extrabold text-slate-100 leading-tight m-0">
                  Sổ Thu Chi
                </h1>
                <span className="hidden md:inline-block text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Supabase Sync
                </span>
              </div>
              <span className="text-[11px] text-slate-400 md:hidden">
                {isEditorOpen
                  ? 'Ghi giao dịch'
                  : isSettingsOpen
                  ? 'Đồng bộ & Cài đặt'
                  : currentTab === 'overview'
                  ? 'Tổng quan'
                  : currentTab === 'wallets'
                  ? 'Tài khoản'
                  : currentTab === 'analytics'
                  ? 'Báo cáo'
                  : 'Khác'}
              </span>
            </div>
          </div>

          {/* Điều hướng Desktop Navigation Tabs (Ẩn trên mobile) */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-800/80 p-1 rounded-2xl border border-white/6 shadow-inner">
            <button
              type="button"
              onClick={() => {
                setCurrentTab('overview');
                setIsEditorOpen(false);
                setIsSettingsOpen(false);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                !isEditorOpen && !isSettingsOpen && currentTab === 'overview'
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutDashboard size={15} />
              <span>Tổng quan</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCurrentTab('wallets');
                setIsEditorOpen(false);
                setIsSettingsOpen(false);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                !isEditorOpen && !isSettingsOpen && currentTab === 'wallets'
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <WalletIcon size={15} />
              <span>Tài khoản</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCurrentTab('analytics');
                setIsEditorOpen(false);
                setIsSettingsOpen(false);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                !isEditorOpen && !isSettingsOpen && currentTab === 'analytics'
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <PieChart size={15} />
              <span>Báo cáo</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCurrentTab('more');
                setIsEditorOpen(false);
                setIsSettingsOpen(false);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                !isEditorOpen && !isSettingsOpen && currentTab === 'more'
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MoreHorizontal size={15} />
              <span>Khác</span>
            </button>
          </nav>

          {/* Nút thao tác nhanh & Cài đặt */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleOpenQuickAdd}
              className={`hidden md:flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-extrabold cursor-pointer shadow-lg transition-all active:scale-95 ${
                isEditorOpen
                  ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-300'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/20'
              }`}
            >
              <Plus size={16} strokeWidth={3} />
              <span>Ghi giao dịch</span>
            </button>

            <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-emerald-500/12 border border-emerald-500/25">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10B981]" />
              <span className="text-[11px] font-bold text-emerald-400">
                Offline 100%
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsEditorOpen(false);
                setIsSettingsOpen(!isSettingsOpen);
              }}
              className={`touch-btn w-8 h-8 rounded-[10px] border flex items-center justify-center cursor-pointer transition-colors ${
                isSettingsOpen
                  ? 'bg-sky-500/20 border-sky-400 text-sky-400'
                  : 'bg-slate-800 border-white/8 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
              title="Đồng bộ Supabase & Sao lưu"
            >
              <SettingsIcon size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Thông báo đồng bộ tự động thành công */}
      {autoBackupNotice && (
        <div className="mx-4 mt-2.5 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 text-[13px] font-semibold flex items-center justify-between gap-2 animate-fade-in max-w-5xl md:mx-auto md:w-full">
          <div className="flex items-center gap-2">
            <Check size={16} strokeWidth={3} />
            <span>{autoBackupNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setAutoBackupNotice(null)}
            className="bg-transparent border-none text-emerald-400 cursor-pointer p-0.5"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. Banner Hướng Dẫn "Thêm Vào Màn Hình Chính" phẳng trên Mobile */}
      {!isStandalone && showIosTip && (
        <div className="mx-4 mt-2.5 p-3 rounded-2xl bg-gradient-to-r from-sky-500/15 via-indigo-500/15 to-purple-500/15 border border-sky-400/30 flex items-center justify-between gap-2.5 shadow-lg shadow-sky-500/5 max-w-5xl md:hidden">
          <div className="flex items-center gap-2.5 text-left flex-1">
            <Smartphone size={20} className="text-sky-400 shrink-0" />
            <div className="text-xs text-slate-200 leading-snug">
              <b>Dùng trên iPhone:</b> Bấm{' '}
              <Share size={12} className="inline align-middle mx-0.5 text-sky-400" /> ➔{' '}
              <b>"Thêm vào MH chính"</b> để mở full màn hình như app thật!
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissIosTip}
            className="touch-btn bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg p-1.5 cursor-pointer shrink-0 border border-white/5"
            title="Ẩn thông báo"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Thông báo Service Worker có phiên bản mới */}
      {needRefresh && (
        <div className="mx-4 mt-2.5 p-3.5 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-xl border border-white/20 flex items-center justify-between gap-3 max-w-5xl md:mx-auto">
          <div className="text-xs font-semibold leading-tight">
            Đã có phiên bản cập nhật mới của ứng dụng!
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-[11px] font-medium cursor-pointer border-none text-white"
            >
              Để sau
            </button>
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="px-3 py-1.5 rounded-xl bg-white text-sky-700 text-[11px] font-bold shadow cursor-pointer border-none"
            >
              Cập nhật ngay
            </button>
          </div>
        </div>
      )}

      {/* 3. TOÀN BỘ MÀN HÌNH ĐỀU LÀ MÀN HÌNH PHẲNG TRONG <main> (KHÔNG DÙNG POPUP OVERLAY) */}
      <main className="flex-1 w-full">
        <div className="w-full max-w-5xl mx-auto pb-24 md:pb-12">
          {isEditorOpen ? (
            <TransactionEditorScreen
              isOpen={true}
              onClose={() => {
                setIsEditorOpen(false);
                setEditingTransaction(null);
              }}
              editingTransaction={editingTransaction}
              onSelectTransactionToEdit={(tx) => {
                setEditingTransaction(tx);
              }}
            />
          ) : isSettingsOpen ? (
            <SettingsModal
              isOpen={true}
              onClose={() => setIsSettingsOpen(false)}
            />
          ) : (
            <>
              {currentTab === 'overview' && (
                <TransactionListTab
                  onEditTransaction={handleEditTransaction}
                  onOpenQuickAdd={handleOpenQuickAdd}
                />
              )}

              {currentTab === 'wallets' && <WalletsTab />}

              {currentTab === 'analytics' && (
                <AnalyticsTab onEditTransaction={handleEditTransaction} />
              )}

              {currentTab === 'more' && (
                <MoreTab
                  onOpenSettings={() => {
                    setIsEditorOpen(false);
                    setIsSettingsOpen(true);
                  }}
                  onEditTransaction={handleEditTransaction}
                  defaultInitialTab={defaultInitialTab}
                  onChangeDefaultTab={handleChangeDefaultTab}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* 4. Bottom Tab Navigation (Trên Mobile) */}
      <BottomNav
        currentTab={currentTab}
        isEditorOpen={isEditorOpen}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          setIsEditorOpen(false);
          setIsSettingsOpen(false);
          setEditingTransaction(null);
        }}
        onOpenQuickAdd={() => {
          handleOpenQuickAdd();
        }}
      />
    </div>
  );
}

export default App;
