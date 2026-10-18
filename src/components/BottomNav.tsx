// src/components/BottomNav.tsx
import React from 'react';
import { BookOpen, PieChart, Plus, Target, Wallet as WalletIcon } from 'lucide-react';

export type TabType = 'transactions' | 'analytics' | 'budgets' | 'wallets';

interface BottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenQuickAdd: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenQuickAdd
}) => {
  return (
    <nav
      className="glass-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxWidth: 480,
        margin: '0 auto',
        paddingTop: 8,
        paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 50,
        backgroundColor: '#0f172a',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}
    >
      {/* Tab 1: Sổ Giao Dịch */}
      <button
        type="button"
        onClick={() => onSelectTab('transactions')}
        className="touch-btn"
        style={{
          background: 'none',
          border: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          color: currentTab === 'transactions' ? '#10B981' : '#64748B',
          flex: 1
        }}
      >
        <BookOpen size={22} strokeWidth={currentTab === 'transactions' ? 2.5 : 2} />
        <span style={{ fontSize: 11, fontWeight: currentTab === 'transactions' ? 600 : 500 }}>
          Sổ thu chi
        </span>
      </button>

      {/* Tab 2: Báo Cáo */}
      <button
        type="button"
        onClick={() => onSelectTab('analytics')}
        className="touch-btn"
        style={{
          background: 'none',
          border: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          color: currentTab === 'analytics' ? '#10B981' : '#64748B',
          flex: 1
        }}
      >
        <PieChart size={22} strokeWidth={currentTab === 'analytics' ? 2.5 : 2} />
        <span style={{ fontSize: 11, fontWeight: currentTab === 'analytics' ? 600 : 500 }}>
          Báo cáo
        </span>
      </button>

      {/* Center Nút Thêm [+] Nhanh Chuẩn iOS */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={onOpenQuickAdd}
          className="touch-btn touch-bounce"
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 8px 20px rgba(16, 185, 129, 0.4)',
            cursor: 'pointer',
            transform: 'translateY(-12px)'
          }}
        >
          <Plus size={28} strokeWidth={2.8} />
        </button>
      </div>

      {/* Tab 4: Hạn Mức */}
      <button
        type="button"
        onClick={() => onSelectTab('budgets')}
        className="touch-btn"
        style={{
          background: 'none',
          border: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          color: currentTab === 'budgets' ? '#10B981' : '#64748B',
          flex: 1
        }}
      >
        <Target size={22} strokeWidth={currentTab === 'budgets' ? 2.5 : 2} />
        <span style={{ fontSize: 11, fontWeight: currentTab === 'budgets' ? 600 : 500 }}>
          Hạn mức
        </span>
      </button>

      {/* Tab 5: Ví & Tài Khoản */}
      <button
        type="button"
        onClick={() => onSelectTab('wallets')}
        className="touch-btn"
        style={{
          background: 'none',
          border: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          color: currentTab === 'wallets' ? '#10B981' : '#64748B',
          flex: 1
        }}
      >
        <WalletIcon size={22} strokeWidth={currentTab === 'wallets' ? 2.5 : 2} />
        <span style={{ fontSize: 11, fontWeight: currentTab === 'wallets' ? 600 : 500 }}>
          Tài khoản
        </span>
      </button>
    </nav>
  );
};
