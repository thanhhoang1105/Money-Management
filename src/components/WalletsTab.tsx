// src/components/WalletsTab.tsx
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { db } from '../db';
import { ensureDefaultWallets } from '../db/seed';
import { transferFunds, adjustWalletBalance } from '../services/transactionService';
import type { Wallet, WalletType } from '../types';
import { CategoryIcon } from './CategoryIcon';
import { formatVND, getCurrentDate, getCurrentTime } from '../utils/formatters';
import {
  Plus,
  Edit2,
  Trash2,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  X,
  ArrowRightLeft,
  Wallet as WalletIcon,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

const WALLET_ICONS = [
  'Wallet',
  'Landmark',
  'Smartphone',
  'CreditCard',
  'Coins',
  'PiggyBank',
  'Vault',
  'DollarSign',
  'Briefcase'
];

const WALLET_COLORS = [
  '#10B981', // Emerald Green
  '#3B82F6', // Blue
  '#D946EF', // Fuchsia / Purple
  '#F59E0B', // Amber / Orange
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#06B6D4', // Cyan
  '#64748B'  // Slate / Gray
];

export const WalletsTab: React.FC = () => {
  // Lấy danh sách ví bằng .toArray() để lọc bằng JS (tránh lỗi IDBKeyRange với kiểu boolean)
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];

  // Đảm bảo có sẵn 2 ví mặc định nếu DB chưa có ví nào
  useEffect(() => {
    ensureDefaultWallets();
  }, []);

  // Tính tổng tài sản khả dụng (Lọc bằng JS, loại bỏ ví isExcludedFromTotal)
  const totalBalance = wallets
    .filter((w) => !w.isExcludedFromTotal)
    .reduce((sum, w) => sum + w.balance, 0);

  // States cho Modal Thêm / Sửa Ví
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<WalletType>('BANK');
  const [balanceStr, setBalanceStr] = useState('');
  const [icon, setIcon] = useState('Landmark');
  const [color, setColor] = useState('#3B82F6');
  const [isExcluded, setIsExcluded] = useState(false);
  const [autoCreateAdjustmentTx, setAutoCreateAdjustmentTx] = useState(true);

  // States cho Modal Chuyển Tiền Nội Bộ (Transfer)
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmountStr, setTransferAmountStr] = useState('');
  const [transferDate, setTransferDate] = useState(getCurrentDate());
  const [transferTime, setTransferTime] = useState(getCurrentTime());
  const [transferNote, setTransferNote] = useState('');
  const [transferError, setTransferError] = useState('');

  // Status Toast Message
  const [statusMsg, setStatusMsg] = useState('');

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 4000);
  };

  // Mở modal Thêm ví mới
  const openAddModal = () => {
    setEditingWallet(null);
    setName('');
    setType('BANK');
    setBalanceStr('0');
    setIcon('Landmark');
    setColor('#3B82F6');
    setIsExcluded(false);
    setAutoCreateAdjustmentTx(true);
    setIsWalletModalOpen(true);
  };

  // Mở modal Chỉnh sửa ví (kèm tính năng Điều chỉnh số dư thực tế)
  const openEditModal = (w: Wallet) => {
    setEditingWallet(w);
    setName(w.name);
    setType(w.type);
    setBalanceStr(w.balance.toString());
    setIcon(w.icon || 'Wallet');
    setColor(w.color || '#3B82F6');
    setIsExcluded(w.isExcludedFromTotal);
    setAutoCreateAdjustmentTx(true);
    setIsWalletModalOpen(true);
  };

  // Mở modal Chuyển tiền nội bộ (có thể chỉ định trước ví gửi)
  const openTransferModal = (defaultFromId?: string) => {
    const fromId = defaultFromId || wallets[0]?.id || '';
    const otherWallets = wallets.filter((w) => w.id !== fromId);
    const toId = otherWallets[0]?.id || '';

    setTransferFromId(fromId);
    setTransferToId(toId);
    setTransferAmountStr('');
    setTransferDate(getCurrentDate());
    setTransferTime(getCurrentTime());
    setTransferNote('');
    setTransferError('');
    setIsTransferModalOpen(true);
  };

  // Tính chênh lệch khi sửa số dư ví (Balance Adjustment)
  const rawCurrentBalance = Number(balanceStr.replace(/[^0-9-]/g, '')) || 0;
  const balanceDiff = editingWallet ? rawCurrentBalance - editingWallet.balance : 0;

  // Lưu ví (Thêm mới hoặc Cập nhật kèm Điều chỉnh số dư)
  const handleSaveWallet = async () => {
    if (!name.trim()) {
      alert('Vui lòng nhập tên ví');
      return;
    }

    const now = new Date().toISOString();

    if (editingWallet) {
      // 1. Nếu có thay đổi số dư, xử lý điều chỉnh số dư thực tế
      if (balanceDiff !== 0) {
        await adjustWalletBalance({
          walletId: editingWallet.id,
          newBalance: rawCurrentBalance,
          autoCreateAdjustmentTx,
          date: getCurrentDate(),
          time: getCurrentTime()
        });
      }

      // 2. Cập nhật các thông tin còn lại của ví
      await db.wallets.update(editingWallet.id, {
        name: name.trim(),
        type,
        balance: rawCurrentBalance,
        icon,
        color,
        isExcludedFromTotal: isExcluded,
        updatedAt: now
      });

      showStatus(
        balanceDiff !== 0 && autoCreateAdjustmentTx
          ? `Đã cập nhật ví "${name.trim()}" & ghi nhận giao dịch chênh lệch ${formatVND(Math.abs(balanceDiff))}!`
          : `Đã cập nhật ví "${name.trim()}"!`
      );
    } else {
      // Thêm ví mới hoàn toàn
      await db.wallets.add({
        id: crypto.randomUUID(),
        name: name.trim(),
        type,
        balance: rawCurrentBalance,
        initialBalance: rawCurrentBalance,
        currency: 'VND',
        icon,
        color,
        isExcludedFromTotal: isExcluded,
        createdAt: now,
        updatedAt: now
      });

      showStatus(`Đã tạo ví mới "${name.trim()}" thành công!`);
    }

    setIsWalletModalOpen(false);
  };

  // Xóa ví với cơ chế chặn an toàn nếu đã có giao dịch phát sinh
  const handleDeleteWallet = async (w: Wallet) => {
    // Đếm giao dịch liên quan đến ví này (cả ví gửi và ví nhận chuyển khoản)
    const txCount = await db.transactions
      .filter((t) => t.walletId === w.id || t.toWalletId === w.id)
      .count();

    if (txCount > 0) {
      alert(
        `⛔ Không thể xóa ví "${w.name}"!\n\nVí này đang có ${txCount} giao dịch liên quan trong lịch sử. Hãy xóa hoặc chuyển các giao dịch đó sang ví khác trước khi xóa ví.`
      );
      return;
    }

    if (window.confirm(`Bạn có chắc chắn muốn xóa ví "${w.name}"?`)) {
      await db.wallets.delete(w.id);
      showStatus(`Đã xóa ví "${w.name}" thành công!`);
    }
  };

  // Thực hiện Chuyển tiền nội bộ (Atomic Transaction)
  const handleExecuteTransfer = async () => {
    const amount = Number(transferAmountStr.replace(/[^0-9]/g, '')) || 0;

    if (!transferFromId || !transferToId) {
      setTransferError('Vui lòng chọn đầy đủ ví gửi và ví nhận');
      return;
    }

    if (transferFromId === transferToId) {
      setTransferError('Ví gửi và ví nhận không được trùng nhau');
      return;
    }

    if (amount <= 0) {
      setTransferError('Vui lòng nhập số tiền chuyển lớn hơn 0đ');
      return;
    }

    const fromWallet = wallets.find((w) => w.id === transferFromId);
    const toWallet = wallets.find((w) => w.id === transferToId);

    if (!fromWallet || !toWallet) {
      setTransferError('Ví không tồn tại');
      return;
    }

    try {
      await transferFunds({
        fromWalletId: transferFromId,
        toWalletId: transferToId,
        amount,
        date: transferDate,
        time: transferTime,
        note: transferNote.trim() || `Chuyển tiền từ ${fromWallet.name} sang ${toWallet.name}`
      });

      setIsTransferModalOpen(false);
      showStatus(
        `Chuyển thành công ${formatVND(amount)} từ "${fromWallet.name}" sang "${toWallet.name}"!`
      );
    } catch (err: any) {
      setTransferError(err?.message || 'Có lỗi xảy ra khi chuyển tiền');
    }
  };

  // Dữ liệu hỗ trợ xem trước số dư sau khi chuyển (Transfer preview)
  const transferFromWallet = wallets.find((w) => w.id === transferFromId);
  const transferToWallet = wallets.find((w) => w.id === transferToId);
  const currentTransferAmount = Number(transferAmountStr.replace(/[^0-9]/g, '')) || 0;

  // 1. XUẤT BÁO CÁO EXCEL (.xlsx)
  const handleExportExcel = async () => {
    try {
      const allTxs = await db.transactions.toArray();
      const catMap = new Map(categories.map((c) => [c.id, c.name]));
      const wMap = new Map(wallets.map((w) => [w.id, w.name]));

      const txRows = allTxs.map((t) => ({
        'Mã GD': t.id,
        'Ngày': t.date,
        'Giờ': t.time,
        'Loại': t.type === 'EXPENSE' ? 'Chi tiền' : t.type === 'INCOME' ? 'Thu tiền' : 'Chuyển ví nội bộ',
        'Số tiền (VNĐ)': t.amount,
        'Hạng mục': t.categoryId ? catMap.get(t.categoryId) || 'Chưa phân loại' : 'Chuyển ví nội bộ',
        'Ví gửi': wMap.get(t.walletId) || t.walletId,
        'Ví nhận': t.toWalletId ? wMap.get(t.toWalletId) || t.toWalletId : '',
        'Ghi chú': t.note || ''
      }));

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
      showStatus('Xuất file Excel thành công!');
    } catch (err: any) {
      alert('Lỗi xuất file Excel: ' + err?.message);
    }
  };

  // 2. SAO LƯU ĐẦY ĐỦ JSON
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
      showStatus('Sao lưu dữ liệu JSON thành công!');
    } catch (err: any) {
      alert('Lỗi sao lưu JSON: ' + err?.message);
    }
  };

  // 3. PHỤC HỒI DỮ LIỆU JSON
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
    <div style={{ paddingBottom: 110 }}>
      {/* 1. THẺ TỔNG TÀI SẢN KHẢ DỤNG (TOTAL AVAILABLE ASSETS) */}
      <div
        className="glass-panel"
        style={{
          margin: '12px 16px',
          borderRadius: 24,
          padding: '20px 20px',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
              Tổng tài sản khả dụng
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: '#f8fafc',
                margin: '6px 0 4px',
                letterSpacing: -0.5
              }}
            >
              {formatVND(totalBalance)}
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {wallets.length} ví hoạt động • {wallets.filter((w) => !w.isExcludedFromTotal).length} ví tính vào tổng
            </div>
          </div>

          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
            }}
          >
            <WalletIcon size={24} />
          </div>
        </div>

        {/* 2 HÀNH ĐỘNG CỐT LÕI: CHUYỂN TIỀN & THÊM VÍ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => openTransferModal()}
            className="touch-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 14px',
              borderRadius: 14,
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              color: '#38BDF8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <ArrowRightLeft size={16} /> Chuyển tiền
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="touch-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 14px',
              borderRadius: 14,
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#10B981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Plus size={16} /> Thêm ví mới
          </button>
        </div>
      </div>

      {/* Thông báo thao tác thành công (Toast) */}
      {statusMsg && (
        <div
          className="animate-fade-in"
          style={{
            margin: '0 16px 14px',
            padding: '12px 16px',
            borderRadius: 14,
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10B981',
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          <CheckCircle2 size={16} />
          {statusMsg}
        </div>
      )}

      {/* 2. DANH SÁCH VÍ & TÀI KHOẢN */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginBottom: 10 }}>
          Danh sách nguồn tiền ({wallets.length})
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {wallets.map((w) => (
            <div
              key={w.id}
              className="glass-panel"
              style={{
                borderRadius: 20,
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  className="cat-badge"
                  style={{
                    backgroundColor: w.color || '#3B82F6',
                    boxShadow: `0 4px 12px ${w.color}40`
                  }}
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
                    {w.isExcludedFromTotal && (
                      <span style={{ color: '#F59E0B', marginLeft: 6 }}>• Không tính tổng</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  className="font-heading"
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: w.balance < 0 ? '#F43F5E' : '#f8fafc',
                    letterSpacing: -0.2
                  }}
                >
                  {formatVND(w.balance)}
                </div>

                {/* Các nút hành động nhanh trên từng ví */}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                  {/* Nút Chuyển tiền từ ví này */}
                  <button
                    type="button"
                    onClick={() => openTransferModal(w.id)}
                    className="touch-btn"
                    title="Chuyển tiền từ ví này"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: 'rgba(56, 189, 248, 0.12)',
                      border: 'none',
                      color: '#38BDF8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <ArrowRightLeft size={14} />
                  </button>

                  {/* Nút Sửa ví & Điều chỉnh số dư */}
                  <button
                    type="button"
                    onClick={() => openEditModal(w)}
                    className="touch-btn"
                    title="Chỉnh sửa ví & điều chỉnh số dư"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: '#1e293b',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Edit2 size={14} />
                  </button>

                  {/* Nút Xóa ví */}
                  <button
                    type="button"
                    onClick={() => handleDeleteWallet(w)}
                    className="touch-btn"
                    title="Xóa ví"
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
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. KHU VỰC SAO LƯU & XUẤT BÁO CÁO (MODULE 6) */}
      <div style={{ padding: '24px 16px 0' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginBottom: 12 }}>
          Sao lưu & Dữ liệu độc lập (0đ chi phí)
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
                  Bảng kê chi tiết giao dịch & số dư các ví
                </div>
              </div>
            </div>
            <Download size={18} color="#10B981" />
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
                <ShieldCheck size={22} />
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
            <Download size={18} color="#38BDF8" />
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
                <Download size={22} style={{ transform: 'rotate(180deg)' }} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                  Khôi phục dữ liệu từ JSON
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Phục hồi nguyên trạng cơ sở dữ liệu trên máy
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

      {/* =====================================================================
          4. MODAL THÊM / SỬA VÍ & ĐIỀU CHỈNH SỐ DƯ THỰC TẾ
         ===================================================================== */}
      {isWalletModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
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
              gap: 14,
              maxHeight: '90dvh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#f8fafc' }}>
                {editingWallet ? 'Chỉnh sửa ví & Điều chỉnh số dư' : 'Thêm ví mới'}
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

            {/* Tên ví */}
            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Tên ví (Ví dụ: Tiền mặt, Techcombank, MoMo...)
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
                  fontSize: 16,
                  outline: 'none'
                }}
              />
            </div>

            {/* Loại ví */}
            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Phân loại ví
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
                  fontSize: 16,
                  outline: 'none'
                }}
              >
                <option value="CASH">💵 Tiền mặt</option>
                <option value="BANK">🏦 Tài khoản Ngân hàng</option>
                <option value="E_WALLET">📱 Ví điện tử (MoMo, ZaloPay...)</option>
                <option value="CREDIT">💳 Thẻ tín dụng</option>
              </select>
            </div>

            {/* Chọn Icon */}
            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                Biểu tượng
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 6 }}>
                {WALLET_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className="touch-btn"
                    style={{
                      height: 38,
                      borderRadius: 10,
                      backgroundColor: icon === ic ? color : '#1e293b',
                      border: icon === ic ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <CategoryIcon name={ic} size={18} color={icon === ic ? '#ffffff' : '#94a3b8'} />
                  </button>
                ))}
              </div>
            </div>

            {/* Chọn Mã màu */}
            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                Màu sắc nhận diện
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {WALLET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="touch-btn"
                    style={{
                      flex: 1,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: c,
                      border: color === c ? '2.5px solid #ffffff' : 'none',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Số dư hiện tại & Điều chỉnh số dư thực tế (Balance Adjustment) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: 12, color: '#94a3b8' }}>
                  {editingWallet ? 'Số dư thực tế ngoài đời (VNĐ)' : 'Số dư khởi tạo ban đầu (VNĐ)'}
                </label>
                {editingWallet && (
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Hiện tại trong sổ: <b>{formatVND(editingWallet.balance)}</b>
                  </span>
                )}
              </div>

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

              {/* Thông báo chênh lệch và Tùy chọn tự động tạo giao dịch điều chỉnh */}
              {editingWallet && balanceDiff !== 0 && (
                <div
                  className="animate-fade-in"
                  style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    borderRadius: 12,
                    backgroundColor: balanceDiff > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                    border: `1px solid ${balanceDiff > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: balanceDiff > 0 ? '#10B981' : '#F43F5E',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    {balanceDiff > 0 ? '📈 Tiền thực tế tăng thêm:' : '📉 Tiền thực tế giảm đi:'}
                    <span>{balanceDiff > 0 ? `+${formatVND(balanceDiff)}` : `-${formatVND(Math.abs(balanceDiff))}`}</span>
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 8,
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={autoCreateAdjustmentTx}
                      onChange={(e) => setAutoCreateAdjustmentTx(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#10B981' }}
                    />
                    <span style={{ fontSize: 12, color: '#f8fafc', fontWeight: 600 }}>
                      Tự động tạo giao dịch {balanceDiff > 0 ? 'Thu nhập' : 'Chi tiêu'} chênh lệch để lịch sử luôn khớp
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Tùy chọn bỏ qua khỏi Tổng tài sản */}
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

            {/* Nút Submit Lưu Ví */}
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
              {editingWallet ? 'Lưu thay đổi' : 'Thêm ví ngay'}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          5. MODAL CHUYỂN TIỀN NỘI BỘ (INTERNAL TRANSFER MODAL - ATOMIC)
         ===================================================================== */}
      {isTransferModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 130,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            maxWidth: 480,
            margin: '0 auto'
          }}
          onClick={() => setIsTransferModalOpen(false)}
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
              gap: 14,
              maxHeight: '90dvh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38BDF8'
                  }}
                >
                  <ArrowRightLeft size={18} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#f8fafc' }}>
                  Chuyển tiền nội bộ giữa các ví
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
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

            {/* Chọn Ví gửi và Ví nhận */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Ví Gửi */}
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Từ ví gửi
                </label>
                <select
                  value={transferFromId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTransferFromId(id);
                    if (id === transferToId) {
                      const other = wallets.find((w) => w.id !== id);
                      if (other) setTransferToId(other.id);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 12,
                    backgroundColor: '#1e293b',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 16,
                    outline: 'none'
                  }}
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatVND(w.balance)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Ví Nhận */}
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Đến ví nhận
                </label>
                <select
                  value={transferToId}
                  onChange={(e) => setTransferToId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 12,
                    backgroundColor: '#1e293b',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 16,
                    outline: 'none'
                  }}
                >
                  {wallets
                    .filter((w) => w.id !== transferFromId)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({formatVND(w.balance)})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Số tiền chuyển */}
            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Số tiền chuyển (VNĐ)
              </label>
              <input
                type="text"
                value={transferAmountStr}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setTransferAmountStr(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                  setTransferError('');
                }}
                placeholder="0"
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 14,
                  backgroundColor: '#1e293b',
                  color: '#38BDF8',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 22,
                  fontWeight: 800,
                  outline: 'none'
                }}
              />

              {/* Các nút bấm số tiền gợi ý nhanh */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {[50000, 100000, 200000, 500000, 1000000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setTransferAmountStr(new Intl.NumberFormat('vi-VN').format(amt));
                      setTransferError('');
                    }}
                    className="touch-btn"
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      backgroundColor: '#1e293b',
                      color: '#94a3b8',
                      border: '1px solid rgba(255,255,255,0.06)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    +{new Intl.NumberFormat('vi-VN').format(amt / 1000)}k
                  </button>
                ))}
                {transferFromWallet && transferFromWallet.balance > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTransferAmountStr(new Intl.NumberFormat('vi-VN').format(transferFromWallet.balance));
                      setTransferError('');
                    }}
                    className="touch-btn"
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      color: '#38BDF8',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Tất cả số dư
                  </button>
                )}
              </div>
            </div>

            {/* Xem trước số dư 2 ví sau khi chuyển (Balance Preview) */}
            {transferFromWallet && transferToWallet && currentTransferAmount > 0 && (
              <div
                className="animate-fade-in"
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  backgroundColor: '#161f30',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
              >
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>
                  Dự tính số dư sau khi chuyển:
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#e2e8f0' }}>{transferFromWallet.name}:</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: transferFromWallet.balance - currentTransferAmount < 0 ? '#F43F5E' : '#38BDF8'
                    }}
                  >
                    {formatVND(transferFromWallet.balance)} ➔ {formatVND(transferFromWallet.balance - currentTransferAmount)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#e2e8f0' }}>{transferToWallet.name}:</span>
                  <span style={{ fontWeight: 700, color: '#10B981' }}>
                    {formatVND(transferToWallet.balance)} ➔ {formatVND(transferToWallet.balance + currentTransferAmount)}
                  </span>
                </div>
              </div>
            )}

            {/* Ngày và Giờ chuyển */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Ngày giao dịch
                </label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 12,
                    backgroundColor: '#1e293b',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 16,
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Giờ giao dịch
                </label>
                <input
                  type="time"
                  value={transferTime}
                  onChange={(e) => setTransferTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 12,
                    backgroundColor: '#1e293b',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 16,
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Ghi chú chuyển tiền */}
            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Ghi chú chuyển tiền (Tùy chọn)
              </label>
              <input
                type="text"
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                placeholder="Ví dụ: Rút tiền ATM, Nạp tiền MoMo..."
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 16,
                  outline: 'none'
                }}
              />
            </div>

            {/* Lỗi cảnh báo nếu có */}
            {transferError && (
              <div
                style={{
                  color: '#F43F5E',
                  fontSize: 13,
                  backgroundColor: 'rgba(244, 63, 94, 0.1)',
                  padding: '8px 12px',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <AlertTriangle size={16} />
                {transferError}
              </div>
            )}

            {/* Nút Xác nhận Chuyển Tiền */}
            <button
              type="button"
              onClick={handleExecuteTransfer}
              className="touch-btn"
              style={{
                backgroundColor: '#38BDF8',
                color: '#0f172a',
                border: 'none',
                padding: '14px',
                borderRadius: 14,
                fontSize: 16,
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: 6
              }}
            >
              Xác nhận chuyển tiền
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
