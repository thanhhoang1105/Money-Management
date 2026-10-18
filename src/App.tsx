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
import { IosInstallPromptModal } from './components/IosInstallPromptModal';
import { checkAndRunAutoBackup } from './services/backupService';
import { checkAndRunGoogleDriveAutoSync } from './services/googleDriveService';
import type { Transaction, AppStartupTab } from './types';
import { Share, X, Smartphone, Settings as SettingsIcon, Check, ArrowRight } from 'lucide-react';
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
  // Nếu màn mặc định là 'editor' (Ghi giao dịch), tự động mở thẳng editor khi mở app
  const [isEditorOpen, setIsEditorOpen] = useState(defaultInitialTab === 'editor');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isIosGuideOpen, setIsIosGuideOpen] = useState(false);
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

  // Khởi tạo Seed Data & Auto backup & Auto Sync
  useEffect(() => {
    requestPersistentStorage();
    initializeSeedData()
      .then(async () => {
        const res = await checkAndRunAutoBackup();
        if (res.ran) {
          setAutoBackupNotice(res.message);
          setTimeout(() => setAutoBackupNotice(null), 6000);
        }

        const driveRes = await checkAndRunGoogleDriveAutoSync();
        if (driveRes.ran) {
          setAutoBackupNotice(driveRes.message);
          setTimeout(() => setAutoBackupNotice(null), 6000);
        }
      })
      .catch((err) => {
        console.error('Lỗi khởi tạo dữ liệu seed:', err);
      });

    // Tự động kiểm tra đồng bộ khi mở lại app hoặc chuyển tab (Visibility Change)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const driveRes = await checkAndRunGoogleDriveAutoSync();
        if (driveRes.ran) {
          setAutoBackupNotice(driveRes.message);
          setTimeout(() => setAutoBackupNotice(null), 6000);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const timer = setInterval(async () => {
      const res = await checkAndRunAutoBackup();
      if (res.ran) {
        setAutoBackupNotice(res.message);
        setTimeout(() => setAutoBackupNotice(null), 6000);
      }

      const driveRes = await checkAndRunGoogleDriveAutoSync();
      if (driveRes.ran) {
        setAutoBackupNotice(driveRes.message);
        setTimeout(() => setAutoBackupNotice(null), 6000);
      }
    }, 60000);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleOpenQuickAdd = () => {
    setEditingTransaction(null);
    setIsEditorOpen(true);
  };

  const handleEditTransaction = (tx: Transaction) => {
    setEditingTransaction(tx);
    setIsEditorOpen(true);
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
      {/* 1. Header Bar chuẩn phong cách iOS */}
      <header className="sticky top-0 z-40 safe-padding-top pb-3 px-4 flex items-center justify-between bg-slate-900/90 backdrop-blur-md border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center font-black text-base text-white shadow-md shadow-emerald-500/30 shrink-0">
            ₫
          </div>
          <div>
            <h1 className="font-heading text-[17px] font-extrabold text-slate-100 leading-tight m-0">
              {currentTab === 'overview'
                ? 'Tổng quan'
                : currentTab === 'wallets'
                ? 'Tài khoản'
                : currentTab === 'analytics'
                ? 'Báo cáo'
                : 'Khác'}
            </h1>
            <span className="text-[11px] text-slate-400">
              Local-First • 0đ Vận Hành
            </span>
          </div>
        </div>

        {/* Nút Cài đặt & Badge trạng thái dữ liệu */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-emerald-500/12 border border-emerald-500/25">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10B981]" />
            <span className="text-[11px] font-bold text-emerald-400">
              Offline 100%
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="touch-btn w-8 h-8 rounded-[10px] bg-slate-800 border border-white/8 text-slate-400 flex items-center justify-center cursor-pointer hover:text-white"
            title="Cài đặt & Sao lưu"
          >
            <SettingsIcon size={18} />
          </button>
        </div>
      </header>

      {/* Thông báo sao lưu tự động thành công */}
      {autoBackupNotice && (
        <div className="mx-4 mt-2.5 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 text-[13px] font-semibold flex items-center justify-between gap-2 animate-fade-in">
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

      {/* 2. Banner Hướng Dẫn "Thêm Vào Màn Hình Chính" (Tự động ẩn hoàn toàn khi đang chạy Standalone) */}
      {!isStandalone && showIosTip && (
        <div className="mx-4 mt-2.5 p-3 rounded-2xl bg-gradient-to-r from-sky-500/15 via-indigo-500/15 to-purple-500/15 border border-sky-400/30 flex items-center justify-between gap-2.5 shadow-lg shadow-sky-500/5">
          <button
            type="button"
            onClick={() => setIsIosGuideOpen(true)}
            className="flex items-center gap-2.5 text-left bg-transparent border-none p-0 cursor-pointer flex-1"
          >
            <Smartphone size={20} className="text-sky-400 shrink-0" />
            <div className="text-xs text-slate-200 leading-snug">
              <b>Dùng trên iPhone:</b> Bấm <Share size={12} className="inline align-middle mx-0.5 text-sky-400" /> ➔ <b>"Thêm vào MH chính"</b> để mở full màn hình như app thật!
              <span className="text-sky-400 font-bold ml-1 inline-flex items-center gap-0.5 underline">
                Xem hướng dẫn <ArrowRight size={11} />
              </span>
            </div>
          </button>
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
        <div className="fixed bottom-24 left-4 right-4 z-50 p-3.5 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-2xl border border-white/20 flex items-center justify-between gap-3 animate-slide-up max-w-[440px] mx-auto">
          <div className="text-xs font-semibold leading-tight">
            Đã có phiên bản cập nhật mới của ứng dụng!
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-[11px] font-medium cursor-pointer"
            >
              Để sau
            </button>
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="px-3 py-1.5 rounded-xl bg-white text-sky-700 text-[11px] font-bold shadow cursor-pointer active:scale-95 transition-transform"
            >
              Cập nhật ngay
            </button>
          </div>
        </div>
      )}

      {/* 3. Nội dung Tab hiện tại */}
      <main className="app-scroll-container flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
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
            onOpenSettings={() => setIsSettingsOpen(true)}
            defaultInitialTab={defaultInitialTab}
            onChangeDefaultTab={handleChangeDefaultTab}
          />
        )}
      </main>

      {/* 4. Màn hình Ghi Giao Dịch Riêng Lẻ Toàn Màn Hình (Full-Screen View với z-40 để BottomNav z-50 vẫn hiển thị) */}
      <TransactionEditorScreen
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingTransaction(null);
        }}
        editingTransaction={editingTransaction}
      />

      {/* 5. Bottom Tab Navigation chuẩn iOS (5 Tabs: Tổng quan, Tài khoản, [+], Báo cáo, Khác) */}
      <BottomNav
        currentTab={currentTab}
        isEditorOpen={isEditorOpen}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          setIsEditorOpen(false);
          setEditingTransaction(null);
        }}
        onOpenQuickAdd={() => {
          if (!isEditorOpen) {
            handleOpenQuickAdd();
          }
        }}
      />

      {/* 6. Settings Modal (Cài đặt & Tự động sao lưu hàng ngày) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* 7. Modal Hướng dẫn Cài đặt lên iPhone (A2HS Guide) */}
      <IosInstallPromptModal
        isOpen={isIosGuideOpen}
        onClose={() => setIsIosGuideOpen(false)}
      />
    </div>
  );
}

export default App;
