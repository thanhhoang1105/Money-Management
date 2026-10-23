// src/components/BottomNav.tsx
import React from 'react';
import { LayoutDashboard, Wallet as WalletIcon, Plus, PieChart, MoreHorizontal } from 'lucide-react';

export type TabType = 'overview' | 'wallets' | 'analytics' | 'more';

interface BottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenQuickAdd: () => void;
  isEditorOpen?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenQuickAdd,
  isEditorOpen = false
}) => {
  return (
    <nav className="glass-nav fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg pt-2 safe-nav-bottom flex items-center justify-around z-40 bg-[#0f172a] border-t border-white/8 md:hidden">
      {/* Tab 1: Tổng quan (trước là Sổ thu chi) */}
      <button
        type="button"
        onClick={() => onSelectTab('overview')}
        className={`touch-btn flex-1 flex flex-col items-center gap-1 cursor-pointer bg-transparent border-none outline-none focus:outline-none select-none ${
          !isEditorOpen && currentTab === 'overview' ? 'text-income' : 'text-slate-400'
        }`}
      >
        <LayoutDashboard size={21} strokeWidth={!isEditorOpen && currentTab === 'overview' ? 2.5 : 2} />
        <span className={`text-[11px] ${!isEditorOpen && currentTab === 'overview' ? 'font-semibold' : 'font-medium'}`}>
          Tổng quan
        </span>
      </button>

      {/* Tab 2: Tài khoản (Ví & Ngân hàng) */}
      <button
        type="button"
        onClick={() => onSelectTab('wallets')}
        className={`touch-btn flex-1 flex flex-col items-center gap-1 cursor-pointer bg-transparent border-none outline-none focus:outline-none select-none ${
          !isEditorOpen && currentTab === 'wallets' ? 'text-income' : 'text-slate-400'
        }`}
      >
        <WalletIcon size={21} strokeWidth={!isEditorOpen && currentTab === 'wallets' ? 2.5 : 2} />
        <span className={`text-[11px] ${!isEditorOpen && currentTab === 'wallets' ? 'font-semibold' : 'font-medium'}`}>
          Tài khoản
        </span>
      </button>

      {/* Nút [+] Ghi giao dịch ở chính giữa */}
      <div className="flex-1 flex justify-center">
        <button
          type="button"
          onClick={onOpenQuickAdd}
          className={`touch-btn touch-bounce w-[52px] h-[52px] rounded-full flex items-center justify-center text-white shadow-lg -translate-y-3 cursor-pointer border-none outline-none focus:outline-none transition-all ${
            isEditorOpen
              ? 'bg-gradient-to-br from-emerald-400 to-teal-500 ring-4 ring-emerald-400/40 shadow-emerald-500/60 scale-105'
              : 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/40'
          }`}
          title="Ghi giao dịch mới"
        >
          <Plus size={28} strokeWidth={2.8} />
        </button>
      </div>

      {/* Tab 4: Báo cáo */}
      <button
        type="button"
        onClick={() => onSelectTab('analytics')}
        className={`touch-btn flex-1 flex flex-col items-center gap-1 cursor-pointer bg-transparent border-none outline-none focus:outline-none select-none ${
          !isEditorOpen && currentTab === 'analytics' ? 'text-income' : 'text-slate-400'
        }`}
      >
        <PieChart size={21} strokeWidth={!isEditorOpen && currentTab === 'analytics' ? 2.5 : 2} />
        <span className={`text-[11px] ${!isEditorOpen && currentTab === 'analytics' ? 'font-semibold' : 'font-medium'}`}>
          Báo cáo
        </span>
      </button>

      {/* Tab 5: Khác */}
      <button
        type="button"
        onClick={() => onSelectTab('more')}
        className={`touch-btn flex-1 flex flex-col items-center gap-1 cursor-pointer bg-transparent border-none outline-none focus:outline-none select-none ${
          !isEditorOpen && currentTab === 'more' ? 'text-income' : 'text-slate-400'
        }`}
      >
        <MoreHorizontal size={22} strokeWidth={!isEditorOpen && currentTab === 'more' ? 2.5 : 2} />
        <span className={`text-[11px] ${!isEditorOpen && currentTab === 'more' ? 'font-semibold' : 'font-medium'}`}>
          Khác
        </span>
      </button>
    </nav>
  );
};

export default BottomNav;
