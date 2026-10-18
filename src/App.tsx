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
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#090d16'
      }}
    >
      {/* 1. Header Bar chuẩn phong cách iOS */}
      <header
        className="glass-panel"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          paddingTop: 'max(14px, env(safe-area-inset-top, 0px))',
          paddingBottom: 12,
          paddingLeft: 20,
          paddingRight: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: 16,
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}
          >
            ₫
          </div>
          <div>
            <h1
              className="font-heading"
              style={{ fontSize: 17, fontWeight: 800, color: '#f8fafc', margin: 0, lineHeight: 1.2 }}
            >
              Sổ Thu Chi
            </h1>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              Local-First • 0đ Vận Hành
            </span>
          </div>
        </div>

        {/* Nút Cài đặt & Badge trạng thái dữ liệu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 999,
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.25)'
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: '#10B981',
                boxShadow: '0 0 8px #10B981'
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981' }}>
              Offline 100%
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="touch-btn"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              backgroundColor: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Cài đặt & Sao lưu"
          >
            <SettingsIcon size={18} />
          </button>
        </div>
      </header>

      {/* Thông báo sao lưu tự động thành công */}
      {autoBackupNotice && (
        <div
          style={{
            margin: '10px 16px 0',
            padding: '10px 14px',
            borderRadius: 14,
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: '#10B981',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={16} strokeWidth={3} />
            <span>{autoBackupNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setAutoBackupNotice(null)}
            style={{ background: 'none', border: 'none', color: '#10B981', cursor: 'pointer', padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. Banner Hướng Dẫn "Thêm Vào Màn Hình Chính" (Tự động ẩn hoàn toàn khi đang chạy Standalone) */}
      {!isStandalone && showIosTip && (
        <div
          style={{
            margin: '10px 16px 0',
            padding: '10px 14px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Smartphone size={20} color="#38BDF8" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.4 }}>
              <b>Dùng trên iPhone:</b> Mở Safari ➔ Bấm nút <Share size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> ➔ Chọn <b>"Thêm vào MH chính"</b> để mở full màn hình như app thật!
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissIosTip}
            className="touch-btn"
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3. Nội dung Tab hiện tại */}
      <main
        className="app-scroll-container"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain'
        }}
      >
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
