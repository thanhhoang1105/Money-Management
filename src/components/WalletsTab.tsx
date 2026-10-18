// src/components/WalletsTab.tsx
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { db } from '../db';
import type { Wallet, WalletType } from '../types';
import { CategoryIcon } from './CategoryIcon';
import { formatVND, getCurrentDate } from '../utils/formatters';
import {
  Plus,
  Edit2,
  Trash2,
  Download,
  Upload,
  FileSpreadsheet,
  ShieldCheck,
  X,
  Share2
} from 'lucide-react';

export const WalletsTab: React.FC = () => {
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState<WalletType>('BANK');
  const [balanceStr, setBalanceStr] = useState('');
  const [icon, setIcon] = useState('Landmark');
  const [color, setColor] = useState('#3B82F6');
  const [isExcluded, setIsExcluded] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const openAddModal = () => {
    setEditingWallet(null);
    setName('');
    setType('BANK');
    setBalanceStr('');
    setIcon('Landmark');
    setColor('#3B82F6');
    setIsExcluded(false);
    setIsWalletModalOpen(true);
  };

  const openEditModal = (w: Wallet) => {
    setEditingWallet(w);
    setName(w.name);
    setType(w.type);
    setBalanceStr(w.balance.toString());
    setIcon(w.icon);
    setColor(w.color);
    setIsExcluded(w.isExcludedFromTotal);
    setIsWalletModalOpen(true);
  };

  const handleSaveWallet = async () => {
    if (!name.trim()) return;
    const balance = Number(balanceStr.replace(/[^0-9-]/g, '')) || 0;
    const now = new Date().toISOString();

    if (editingWallet) {
      await db.wallets.update(editingWallet.id, {
        name: name.trim(),
        type,
        balance,
        icon,
        color,
        isExcludedFromTotal: isExcluded,
        updatedAt: now
      });
    } else {
      await db.wallets.add({
        id: crypto.randomUUID(),
        name: name.trim(),
        type,
        balance,
        initialBalance: balance,
        currency: 'VND',
        icon,
        color,
        isExcludedFromTotal: isExcluded,
        createdAt: now,
        updatedAt: now
      });
    }

    setIsWalletModalOpen(false);
  };

  const handleDeleteWallet = async (id: string) => {
    const txCount = await db.transactions
      .filter((t) => t.walletId === id || t.toWalletId === id)
      .count();

    if (txCount > 0) {
      alert(
        `Không thể xóa ví này vì đang có ${txCount} giao dịch liên quan. Hãy xóa hoặc đổi ví các giao dịch đó trước.`
      );
      return;
    }

    if (window.confirm('Bạn có chắc muốn xóa ví này?')) {
      await db.wallets.delete(id);
    }
  };

  // 1. XUẤT BÁO CÁO EXCEL (.xlsx)
  const handleExportExcel = async () => {
    try {
      const allTxs = await db.transactions.toArray();
      const catMap = new Map(categories.map((c) => [c.id, c.name]));
      const wMap = new Map(wallets.map((w) => [w.id, w.name]));

      // Sheet 1: Danh sách giao dịch
      const txRows = allTxs.map((t) => ({
        'Mã GD': t.id,
        'Ngày': t.date,
        'Giờ': t.time,
        'Loại': t.type === 'EXPENSE' ? 'Chi tiền' : t.type === 'INCOME' ? 'Thu tiền' : 'Chuyển khoản',
        'Số tiền (VNĐ)': t.amount,
        'Hạng mục': t.categoryId ? catMap.get(t.categoryId) || 'Chưa phân loại' : 'Chuyển ví',
        'Ví nguồn': wMap.get(t.walletId) || t.walletId,
        'Ví đích': t.toWalletId ? wMap.get(t.toWalletId) || t.toWalletId : '',
        'Ghi chú': t.note || ''
      }));

      // Sheet 2: Tổng hợp ví
      const walletRows = wallets.map((w) => ({
        'Tên ví': w.name,
        'Loại': w.type,
        'Số dư hiện tại (VNĐ)': w.balance,
        'Không tính vào tổng': w.isExcludedFromTotal ? 'Có' : 'Không'
      }));

      const wb = XLSX.utils.book_new();
      const wsTx = XLSX.utils.json_to_sheet(txRows);
      const wsW = XLSX.utils.json_to_sheet(walletRows);

      XLSX.utils.book_append_sheet(wb, wsTx, 'Lịch sử giao dịch');
      XLSX.utils.book_append_sheet(wb, wsW, 'Tổng hợp ví');

      const fileName = `SoThuChi_BaoCao_${getCurrentDate()}.xlsx`;

      // Tạo file và chia sẻ qua Web Share API (Safari iOS) hoặc tải về
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], fileName)] })) {
        const file = new File([blob], fileName, { type: blob.type });
        await navigator.share({
          files: [file],
          title: 'Báo cáo Sổ Thu Chi',
          text: 'Báo cáo chi tiêu cá nhân xuất từ Sổ Thu Chi'
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
      setStatusMsg('Xuất file Excel thành công!');
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err: any) {
      alert('Lỗi xuất file Excel: ' + err?.message);
    }
  };

  // 2. SAO LƯU ĐẦY ĐỦ JSON (FULL BACKUP)
  const handleBackupJSON = async () => {
    try {
      const data = {
        version: 2,
        exportedAt: new Date().toISOString(),
        wallets: await db.wallets.toArray(),
        categories: await db.categories.toArray(),
        transactions: await db.transactions.toArray(),
        budgets: await db.budgets.toArray(),
        settings: await db.settings.toArray()
      };

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const fileName = `SoThuChi_Backup_${getCurrentDate()}.json`;

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], fileName)] })) {
        const file = new File([blob], fileName, { type: 'application/json' });
        await navigator.share({
          files: [file],
          title: 'Sao lưu dữ liệu Sổ Thu Chi',
          text: 'File sao lưu toàn bộ cơ sở dữ liệu Sổ Thu Chi cá nhân'
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
      setStatusMsg('Sao lưu dữ liệu JSON thành công!');
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err: any) {
      alert('Lỗi sao lưu JSON: ' + err?.message);
    }
  };

  // 3. PHỤC HỒI DỮ LIỆU TỪ FILE JSON (RESTORE)
  const handleRestoreJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        if (!parsed.wallets || !parsed.categories || !parsed.transactions) {
          throw new Error('Định dạng file sao lưu không hợp lệ!');
        }

        if (
          window.confirm(
            `Tìm thấy ${parsed.transactions.length} giao dịch và ${parsed.wallets.length} ví trong bản sao lưu ngày ${
              parsed.exportedAt?.slice(0, 10) || ''
            }. Bạn có chắc muốn khôi phục? (Dữ liệu hiện tại sẽ được thay thế).`
          )
        ) {
          await db.transaction('rw', [db.wallets, db.categories, db.transactions, db.budgets, db.settings], async () => {
            await db.wallets.clear();
            await db.categories.clear();
            await db.transactions.clear();
            await db.budgets.clear();
            await db.settings.clear();

            await db.wallets.bulkAdd(parsed.wallets);
            await db.categories.bulkAdd(parsed.categories);
            await db.transactions.bulkAdd(parsed.transactions);
            if (parsed.budgets?.length) await db.budgets.bulkAdd(parsed.budgets);
            if (parsed.settings?.length) await db.settings.bulkAdd(parsed.settings);
          });

          alert('Khôi phục dữ liệu thành công!');
          window.location.reload();
        }
      } catch (err: any) {
        alert('Lỗi khôi phục: ' + err?.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 20px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>
            Tài khoản & Ví tiền
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Quản lý nguồn tiền & Sao lưu an toàn
          </div>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="touch-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 12,
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            color: '#10B981',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          <Plus size={16} /> Thêm ví
        </button>
      </div>

      {statusMsg && (
        <div
          style={{
            margin: '0 16px 12px',
            padding: '10px 16px',
            borderRadius: 14,
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            color: '#10B981',
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center'
          }}
        >
          {statusMsg}
        </div>
      )}

      {/* Danh sách Ví */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {wallets.map((w) => (
          <div
            key={w.id}
            className="glass-panel touch-btn"
            style={{
              borderRadius: 20,
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                className="cat-badge"
                style={{ backgroundColor: w.color || '#3B82F6' }}
              >
                <CategoryIcon name={w.icon || 'Wallet'} size={22} color="#ffffff" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                  {w.name}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {w.type === 'CASH'
                    ? 'Tiền mặt'
                    : w.type === 'BANK'
                    ? 'Ngân hàng'
                    : w.type === 'E_WALLET'
                    ? 'Ví điện tử'
                    : 'Thẻ tín dụng'}
                  {w.isExcludedFromTotal ? ' • Không tính vào tổng' : ''}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
                  {formatVND(w.balance)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => openEditModal(w)}
                  className="touch-btn"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    backgroundColor: '#1e293b',
                    border: 'none',
                    color: '#38BDF8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Edit2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteWallet(w.id)}
                  className="touch-btn"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    backgroundColor: 'rgba(244, 63, 94, 0.12)',
                    border: 'none',
                    color: '#F43F5E',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* KHU VỰC SAO LƯU & XUẤT DỮ LIỆU (MODULE 6) */}
      <div style={{ padding: '24px 16px 0' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginBottom: 12 }}>
          Sao lưu & Xuất báo cáo (0 đồng chi phí)
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Nút 1: Xuất Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="glass-panel touch-btn"
            style={{
              padding: '16px',
              borderRadius: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10B981'
                }}
              >
                <FileSpreadsheet size={22} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                  Xuất báo cáo Excel (.xlsx)
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Sổ giao dịch & tổng hợp ví, gửi qua Zalo/Mail/Tệp
                </div>
              </div>
            </div>
            <Share2 size={18} color="#94a3b8" />
          </button>

          {/* Nút 2: Sao lưu JSON */}
          <button
            type="button"
            onClick={handleBackupJSON}
            className="glass-panel touch-btn"
            style={{
              padding: '16px',
              borderRadius: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38BDF8'
                }}
              >
                <Download size={22} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                  Sao lưu toàn bộ dữ liệu (JSON)
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Bản lưu 100% không mất mát, lưu lên Google Drive/iCloud
                </div>
              </div>
            </div>
            <ShieldCheck size={18} color="#38BDF8" />
          </button>

          {/* Nút 3: Khôi phục JSON */}
          <label
            className="glass-panel touch-btn"
            style={{
              padding: '16px',
              borderRadius: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  backgroundColor: 'rgba(168, 85, 247, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#A855F7'
                }}
              >
                <Upload size={22} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                  Khôi phục dữ liệu từ file JSON
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Chọn file sao lưu để nạp lại dữ liệu
                </div>
              </div>
            </div>
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreJSON}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* MODAL THÊM / SỬA VÍ */}
      {isWalletModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            zIndex: 130,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            maxWidth: 480,
            margin: '0 auto'
          }}
          onClick={() => setIsWalletModalOpen(false)}
        >
          <div
            className="glass-panel animate-slide-up"
            style={{
              backgroundColor: '#0f172a',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: '20px 20px max(24px, env(safe-area-inset-bottom, 0px))',
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#f8fafc' }}>
                {editingWallet ? 'Chỉnh sửa ví' : 'Thêm ví mới'}
              </div>
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(false)}
                className="touch-btn"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#1e293b',
                  border: 'none',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Tên ví (Ví dụ: MB Bank, Tiền tiết kiệm)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập tên ví..."
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 14,
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Loại ví
              </label>
              <select
                value={type}
                onChange={(e) => {
                  const t = e.target.value as WalletType;
                  setType(t);
                  if (t === 'CASH') {
                    setIcon('Wallet');
                    setColor('#10B981');
                  } else if (t === 'BANK') {
                    setIcon('Landmark');
                    setColor('#3B82F6');
                  } else if (t === 'E_WALLET') {
                    setIcon('Smartphone');
                    setColor('#D946EF');
                  } else {
                    setIcon('CreditCard');
                    setColor('#F59E0B');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 14,
                  outline: 'none'
                }}
              >
                <option value="CASH">Tiền mặt</option>
                <option value="BANK">Tài khoản Ngân hàng</option>
                <option value="E_WALLET">Ví điện tử (MoMo, ZaloPay)</option>
                <option value="CREDIT">Thẻ tín dụng</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Số dư hiện tại (VNĐ)
              </label>
              <input
                type="text"
                value={balanceStr}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9-]/g, '');
                  setBalanceStr(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                }}
                placeholder="0"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  backgroundColor: '#1e293b',
                  color: '#10B981',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 18,
                  fontWeight: 700,
                  outline: 'none'
                }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={isExcluded}
                onChange={(e) => setIsExcluded(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: '#10B981' }}
              />
              <span style={{ fontSize: 13, color: '#94a3b8' }}>
                Không tính số dư này vào tổng tài sản khả dụng
              </span>
            </label>

            <button
              type="button"
              onClick={handleSaveWallet}
              className="touch-btn"
              style={{
                backgroundColor: '#10B981',
                color: '#ffffff',
                border: 'none',
                padding: '14px',
                borderRadius: 14,
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: 8
              }}
            >
              Lưu ví
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
