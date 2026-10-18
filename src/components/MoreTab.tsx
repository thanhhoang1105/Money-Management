// src/components/MoreTab.tsx
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { BudgetsTab } from './BudgetsTab';
import {
  exportTransactionsToExcel,
  exportFullBackupJSON,
  downloadOrShareFile,
  restoreBackupData
} from '../services/backupService';
import { getCurrentDate } from '../utils/formatters';
import { CategoryManagerScreen } from './CategoryManagerScreen';
import type { AppStartupTab } from '../types';
import {
  Target,
  Tags,
  Repeat,
  Users,
  Moon,
  Smartphone,
  Cloud,
  Download,
  Upload,
  FileSpreadsheet,
  ChevronRight,
  ShieldCheck,
  Check,
  Sparkles
} from 'lucide-react';

interface MoreTabProps {
  onOpenSettings: () => void;
  defaultInitialTab: AppStartupTab;
  onChangeDefaultTab: (tab: AppStartupTab) => void;
}

export const MoreTab: React.FC<MoreTabProps> = ({
  onOpenSettings,
  defaultInitialTab,
  onChangeDefaultTab
}) => {
  const [subView, setSubView] = useState<'MAIN' | 'BUDGETS' | 'CATEGORIES'>('MAIN');
  const [notice, setNotice] = useState<string | null>(null);

  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const budgetsCount = useLiveQuery(() => db.budgets.count()) || 0;

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  // Sao lưu JSON
  const handleBackupJSON = async () => {
    try {
      const jsonStr = await exportFullBackupJSON();
      const fileName = `SoThuChi_Backup_${getCurrentDate().replace(/-/g, '')}.json`;
      await downloadOrShareFile(jsonStr, fileName, 'application/json');
      showToast('Đã xuất file sao lưu JSON thành công!');
    } catch (err: any) {
      alert('Lỗi sao lưu JSON: ' + (err?.message || 'Thất bại'));
    }
  };

  // Khôi phục JSON
  const handleRestoreJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('CẢNH BÁO: Ghi đè toàn bộ dữ liệu bằng file sao lưu. Bạn có chắc chắn muốn khôi phục?')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const res = await restoreBackupData(content);
        showToast(`Khôi phục thành công ${res.counts.transactions} giao dịch và ${res.counts.wallets} ví!`);
      } catch (err: any) {
        alert('Lỗi đọc file: ' + (err?.message || 'Không hợp lệ'));
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Xuất Excel
  const handleExportExcel = async () => {
    try {
      const res = await exportTransactionsToExcel();
      showToast(`Đã xuất báo cáo Excel thành công (${res.transactionCount} giao dịch)!`);
    } catch (err: any) {
      alert('Lỗi xuất Excel: ' + (err?.message || 'Thất bại'));
    }
  };

  // Màn hình Hạn Mức Chi Tiêu dạng Subview
  if (subView === 'BUDGETS') {
    return (
      <div className="flex flex-col min-h-full">
        <BudgetsTab onBack={() => setSubView('MAIN')} />
      </div>
    );
  }

  // Màn hình Xem & Quản lý Danh Mục dạng Subview
  if (subView === 'CATEGORIES') {
    return (
      <CategoryManagerScreen
        isOpen={true}
        onClose={() => setSubView('MAIN')}
      />
    );
  }

  return (
    <div className="pb-32 px-4 pt-3 flex flex-col gap-5">
      {/* Thông báo Toast */}
      {notice && (
        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <Check size={16} strokeWidth={3} />
          <span>{notice}</span>
        </div>
      )}

      {/* NHÓM 1: TÀI CHÍNH & QUẢN LÝ */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Tài chính & Quản lý
        </h3>

        <div className="bg-slate-900/90 rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/5">
          {/* Mục 1: Hạn mức chi tiêu */}
          <button
            type="button"
            onClick={() => setSubView('BUDGETS')}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <Target size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>Hạn mức chi tiêu (Ngân sách)</span>
                  {budgetsCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                      {budgetsCount} mục
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Thiết lập hạn mức ngân sách tháng & cảnh báo vượt chi
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-500 shrink-0" />
          </button>

          {/* Mục 2: Hạng mục thu/chi */}
          <button
            type="button"
            onClick={() => setSubView('CATEGORIES')}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                <Tags size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">
                  Hạng mục thu / chi
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {categories.length} danh mục cài đặt sẵn & quick tags
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-500 shrink-0" />
          </button>

          {/* Mục 3: Ghi chép định kỳ */}
          <div className="p-3.5 flex items-center justify-between opacity-80">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                <Repeat size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>Ghi chép định kỳ</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[9px] font-bold uppercase">
                    Sắp ra mắt
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Tự động ghi tiền nhà, tiền mạng, lương hàng tháng
                </div>
              </div>
            </div>
          </div>

          {/* Mục 4: Chia tiền du lịch / Nhóm */}
          <div className="p-3.5 flex items-center justify-between opacity-80">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <Users size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>Chia tiền du lịch & Nhóm</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[9px] font-bold uppercase">
                    Sắp ra mắt
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Tách bill, chia đều chi phí sự kiện cho bạn bè
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NHÓM 2: GIAO DIỆN & TRẢI NGHIỆM */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Giao diện & Trải nghiệm
        </h3>

        <div className="bg-slate-900/90 rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/5">
          {/* Màn hình mở app mặc định */}
          <div className="p-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                <Smartphone size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">
                  Màn hình mở app đầu tiên
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Chọn tab hiển thị mặc định mỗi khi khởi động ứng dụng
                </div>
              </div>
            </div>

            {/* Segmented Selector cho 5 tab mở app */}
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
                  onClick={() => {
                    onChangeDefaultTab(tab.id as AppStartupTab);
                    showToast(`Đã đặt "${tab.name}" làm màn hình khởi động!`);
                  }}
                  className={`touch-btn py-2 px-1 rounded-xl text-[11px] font-bold cursor-pointer border transition-all text-center ${
                    defaultInitialTab === tab.id
                      ? 'bg-sky-500/25 border-sky-400 text-sky-300 shadow-sm'
                      : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          </div>

          {/* Chế độ Giao diện Tối/Sáng */}
          <div className="p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800 text-amber-400 flex items-center justify-center shrink-0">
                <Moon size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">
                  Chế độ giao diện (Tối / Sáng)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Chuẩn AMOLED Dark Mode tiết kiệm pin & bảo vệ mắt
                </div>
              </div>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-slate-800 border border-white/10 text-xs font-semibold text-slate-300">
              Giao diện tối
            </div>
          </div>
        </div>
      </section>

      {/* NHÓM 3: DỮ LIỆU & SAO LƯU */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Dữ liệu & Sao lưu
        </h3>

        <div className="bg-slate-900/90 rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/5">
          {/* Google Drive */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <Cloud size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <span>Đồng bộ Google Drive 2 chiều</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    Máy tính & Điện thoại
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Tự động đồng bộ & hợp nhất dữ liệu liên thông qua Drive
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-500 shrink-0" />
          </button>

          {/* Sao lưu JSON */}
          <button
            type="button"
            onClick={handleBackupJSON}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                <ShieldCheck size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">
                  Sao lưu toàn bộ dữ liệu (JSON)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Lưu trữ cục bộ an toàn 100% trên máy
                </div>
              </div>
            </div>
            <Download size={16} className="text-sky-400 shrink-0" />
          </button>

          {/* Khôi phục JSON */}
          <label className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors">
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreJSON}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <Upload size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">
                  Khôi phục dữ liệu từ JSON
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Nhập file sao lưu để phục hồi toàn bộ giao dịch
                </div>
              </div>
            </div>
            <Upload size={16} className="text-amber-400 shrink-0" />
          </label>

          {/* Xuất Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="touch-btn w-full p-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0">
                <FileSpreadsheet size={19} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">
                  Xuất báo cáo Excel (.xlsx)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Bảng tính 3 sheets chi tiết giao dịch & tài khoản
                </div>
              </div>
            </div>
            <Download size={16} className="text-teal-400 shrink-0" />
          </button>
        </div>
      </section>

      {/* FOOTER BẢN QUYỀN LOCAL-FIRST */}
      <div className="pt-2 text-center text-slate-500 text-[11px] flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5 font-semibold text-slate-400">
          <Sparkles size={13} className="text-emerald-400" />
          <span>Sổ Thu Chi PWA • Local-First • 0đ Vận Hành</span>
        </div>
        <div>100% Offline • Dữ liệu mã hóa trên thiết bị của bạn</div>
      </div>
    </div>
  );
};

export default MoreTab;
