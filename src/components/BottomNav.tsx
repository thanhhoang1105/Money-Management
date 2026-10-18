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
    <nav className="glass-nav fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto pt-2 safe-nav-bottom flex items-center justify-around z-50 bg-[#0f172a] border-t border-white/8">
      {/* Tab 1: Sổ Giao Dịch */}
      <button
        type="button"
        onClick={() => onSelectTab('transactions')}
        className={`touch-btn flex-1 flex flex-col items-center gap-1 cursor-pointer bg-transparent border-none ${
          currentTab === 'transactions' ? 'text-income' : 'text-slate-400'
        }`}
      >
        <BookOpen size={22} strokeWidth={currentTab === 'transactions' ? 2.5 : 2} />
        <span className={`text-[11px] ${currentTab === 'transactions' ? 'font-semibold' : 'font-medium'}`}>
          Sổ thu chi
        </span>
      </button>

      {/* Tab 2: Báo Cáo */}
      <button
        type="button"
        onClick={() => onSelectTab('analytics')}
        className={`touch-btn flex-1 flex flex-col items-center gap-1 cursor-pointer bg-transparent border-none ${
          currentTab === 'analytics' ? 'text-income' : 'text-slate-400'
        }`}
      >
        <PieChart size={22} strokeWidth={currentTab === 'analytics' ? 2.5 : 2} />
        <span className={`text-[11px] ${currentTab === 'analytics' ? 'font-semibold' : 'font-medium'}`}>
          Báo cáo
        </span>
      </button>

      {/* Center Nút Thêm [+] Nhanh Chuẩn iOS */}
      <div className="flex-1 flex justify-center">
        <button
          type="button"
          onClick={onOpenQuickAdd}
          className="touch-btn touch-bounce w-[52px] h-[52px] rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/40 -translate-y-3 cursor-pointer border-none"
        >
          <Plus size={28} strokeWidth={2.8} />
        </button>
      </div>

      {/* Tab 4: Hạn Mức */}
      <button
        type="button"
        onClick={() => onSelectTab('budgets')}
        className={`touch-btn flex-1 flex flex-col items-center gap-1 cursor-pointer bg-transparent border-none ${
          currentTab === 'budgets' ? 'text-income' : 'text-slate-400'
        }`}
      >
        <Target size={22} strokeWidth={currentTab === 'budgets' ? 2.5 : 2} />
        <span className={`text-[11px] ${currentTab === 'budgets' ? 'font-semibold' : 'font-medium'}`}>
          Hạn mức
        </span>
      </button>

      {/* Tab 5: Ví & Tài Khoản */}
      <button
        type="button"
        onClick={() => onSelectTab('wallets')}
        className={`touch-btn flex-1 flex flex-col items-center gap-1 cursor-pointer bg-transparent border-none ${
          currentTab === 'wallets' ? 'text-income' : 'text-slate-400'
        }`}
      >
        <WalletIcon size={22} strokeWidth={currentTab === 'wallets' ? 2.5 : 2} />
        <span className={`text-[11px] ${currentTab === 'wallets' ? 'font-semibold' : 'font-medium'}`}>
          Tài khoản
        </span>
      </button>
    </nav>
  );
};

export default BottomNav;
