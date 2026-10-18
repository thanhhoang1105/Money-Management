import { useState, useEffect } from 'react';
import { initializeSeedData } from './db/seed';
import { requestPersistentStorage } from './db';
import { BottomNav, type TabType } from './components/BottomNav';
import { TransactionListTab } from './components/TransactionListTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { BudgetsTab } from './components/BudgetsTab';
import { WalletsTab } from './components/WalletsTab';
import { NumpadModal } from './components/NumpadModal';
import { SettingsModal } from './components/SettingsModal';
import { checkAndRunAutoBackup } from './services/backupService';
import type { Transaction } from './types';
import { Share, X, Smartphone, Settings as SettingsIcon, Check } from 'lucide-react';

// Kiểm tra nếu app đang chạy ở chế độ Standalone (Đã thêm vào Màn hình chính)
function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

export function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('transactions');
  const [isNumpadOpen, setIsNumpadOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [autoBackupNotice, setAutoBackupNotice] = useState<string | null>(null);
  
  // Tự động ẩn hoàn toàn banner nếu đang chạy Standalone trên Home Screen iPhone
  const isStandalone = checkIsStandalone();
  const [showIosTip, setShowIosTip] = useState(() => {
    if (checkIsStandalone()) return false;
    try {
      return localStorage.getItem('hide_ios_tip') !== 'true';
    } catch {
      return true;
    }
  });

  // Khởi tạo Seed Data, Yêu cầu Persistent Storage & Kiểm tra Tự động sao lưu hàng ngày khi mở app
  useEffect(() => {
    requestPersistentStorage();
    initializeSeedData()
      .then(async () => {
        // Kiểm tra ngầm Tự động sao lưu hàng ngày khi App khởi động
        const res = await checkAndRunAutoBackup();
        if (res.ran) {
          setAutoBackupNotice(res.message);
          setTimeout(() => setAutoBackupNotice(null), 6000);
        }
      })
      .catch((err) => {
        console.error('Lỗi khởi tạo dữ liệu seed:', err);
      });

    // Định kỳ kiểm tra mỗi phút nếu người dùng đang dùng app khi đến khung giờ sao lưu
    const timer = setInterval(async () => {
      const res = await checkAndRunAutoBackup();
      if (res.ran) {
        setAutoBackupNotice(res.message);
        setTimeout(() => setAutoBackupNotice(null), 6000);
      }
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const handleOpenQuickAdd = () => {
    setEditingTransaction(null);
    setIsNumpadOpen(true);
  };

  const handleEditTransaction = (tx: Transaction) => {
    setEditingTransaction(tx);
    setIsNumpadOpen(true);
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
      <header className="glass-panel sticky top-0 z-40 safe-padding-top pb-3 px-5 flex items-center justify-between border-b border-white/6">
        <div className="flex items-center gap-2.5">
          <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center font-black text-base text-white shadow-md shadow-emerald-500/30">
            ₫
          </div>
          <div>
            <h1 className="font-heading text-[17px] font-extrabold text-slate-100 leading-tight m-0">
              Sổ Thu Chi
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
        <div className="mx-4 mt-2.5 p-3 rounded-2xl bg-gradient-to-r from-sky-500/15 to-indigo-500/15 border border-sky-400/30 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Smartphone size={20} className="text-sky-400 shrink-0" />
            <div className="text-xs text-slate-200 leading-snug">
              <b>Dùng trên iPhone:</b> Mở Safari ➔ Bấm nút <Share size={12} className="inline align-middle mx-0.5" /> ➔ Chọn <b>"Thêm vào MH chính"</b> để mở full màn hình như app thật!
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissIosTip}
            className="touch-btn bg-transparent border-none text-slate-400 cursor-pointer p-1"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3. Nội dung Tab hiện tại */}
      <main className="app-scroll-container flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        {currentTab === 'transactions' && (
          <TransactionListTab
            onEditTransaction={handleEditTransaction}
            onOpenQuickAdd={handleOpenQuickAdd}
          />
        )}

        {currentTab === 'analytics' && (
          <AnalyticsTab onEditTransaction={handleEditTransaction} />
        )}

        {currentTab === 'budgets' && <BudgetsTab />}

        {currentTab === 'wallets' && <WalletsTab />}
      </main>

      {/* 4. Bottom Tab Navigation chuẩn iOS */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenQuickAdd={handleOpenQuickAdd}
      />

      {/* 5. Custom Numpad Modal (Ghi chép nhanh với phím 000 & Quick tags) */}
      <NumpadModal
        isOpen={isNumpadOpen}
        onClose={() => {
          setIsNumpadOpen(false);
          setEditingTransaction(null);
        }}
        editingTransaction={editingTransaction}
      />

      {/* 6. Settings Modal (Cài đặt & Tự động sao lưu hàng ngày) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
