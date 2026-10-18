// src/components/NumpadModal.tsx
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Transaction, TransactionType } from '../types';
import { createTransaction, updateTransaction } from '../services/transactionService';
import { CategoryIcon } from './CategoryIcon';
import { formatVND, getCurrentDate, getCurrentTime } from '../utils/formatters';
import { X, Check, Delete } from 'lucide-react';

interface NumpadModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTransaction?: Transaction | null;
}

export const NumpadModal: React.FC<NumpadModalProps> = ({
  isOpen,
  onClose,
  editingTransaction
}) => {
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];

  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amountStr, setAmountStr] = useState<string>('0');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [toWalletId, setToWalletId] = useState<string>('');
  const [date, setDate] = useState<string>(getCurrentDate());
  const [note, setNote] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Khi modal mở hoặc đổi giao dịch cần sửa
  useEffect(() => {
    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmountStr(editingTransaction.amount.toString());
      setSelectedCategoryId(editingTransaction.categoryId || '');
      setSelectedWalletId(editingTransaction.walletId);
      setToWalletId(editingTransaction.toWalletId || '');
      setDate(editingTransaction.date);
      setNote(editingTransaction.note || '');
    } else {
      // Mặc định tạo mới
      setType('EXPENSE');
      setAmountStr('0');
      setDate(getCurrentDate());
      setNote('');
      setErrorMsg('');
      if (wallets.length > 0 && !selectedWalletId) {
        setSelectedWalletId(wallets[0].id);
      }
      const defaultExpCat = categories.find((c) => c.type === 'EXPENSE');
      if (defaultExpCat && !selectedCategoryId) {
        setSelectedCategoryId(defaultExpCat.id);
      }
    }
  }, [editingTransaction, isOpen, wallets, categories]);

  if (!isOpen) return null;

  // Lọc danh mục theo loại (EXPENSE / INCOME)
  const activeCategories = categories.filter((c) => c.type === type);
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  // Xử lý bấm phím Numpad
  const handleKeyPress = (key: string) => {
    setErrorMsg('');
    if (key === 'C') {
      if (amountStr.length <= 1) {
        setAmountStr('0');
      } else {
        setAmountStr(amountStr.slice(0, -1));
      }
      return;
    }

    if (key === '000') {
      if (amountStr === '0') return;
      setAmountStr((prev) => prev + '000');
      return;
    }

    if (['+', '-', 'x', '÷'].includes(key)) {
      // Thêm toán tử nếu ký tự cuối chưa phải toán tử
      const lastChar = amountStr.slice(-1);
      if (['+', '-', '*', '/'].includes(lastChar)) {
        return;
      }
      const op = key === 'x' ? '*' : key === '÷' ? '/' : key;
      setAmountStr((prev) => prev + op);
      return;
    }

    // Các phím số thông thường
    if (amountStr === '0') {
      setAmountStr(key);
    } else {
      setAmountStr((prev) => prev + key);
    }
  };

  // Tính giá trị số thực từ biểu thức toán học
  const evaluateAmount = (): number => {
    try {
      // Thay thế an toàn
      const sanitized = amountStr.replace(/[^0-9+\-*/.]/g, '');
      // evaluate đơn giản không dùng eval nguy hiểm
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${sanitized || 0})`)();
      return Math.max(0, Math.round(Number(result) || 0));
    } catch {
      return 0;
    }
  };

  const currentComputedAmount = evaluateAmount();

  // Lưu giao dịch
  const handleSave = async () => {
    const finalAmount = currentComputedAmount;
    if (finalAmount <= 0) {
      setErrorMsg('Vui lòng nhập số tiền lớn hơn 0');
      return;
    }

    if (!selectedWalletId) {
      setErrorMsg('Vui lòng chọn ví thanh toán');
      return;
    }

    if (type === 'TRANSFER') {
      if (!toWalletId) {
        setErrorMsg('Vui lòng chọn ví nhận');
        return;
      }
      if (selectedWalletId === toWalletId) {
        setErrorMsg('Ví gửi và ví nhận không được trùng nhau');
        return;
      }
    } else if (!selectedCategoryId) {
      setErrorMsg('Vui lòng chọn hạng mục');
      return;
    }

    try {
      if (editingTransaction) {
        // Cập nhật giao dịch đã có
        await updateTransaction(editingTransaction.id, {
          walletId: selectedWalletId,
          toWalletId: type === 'TRANSFER' ? toWalletId : undefined,
          categoryId: type !== 'TRANSFER' ? selectedCategoryId : undefined,
          type,
          amount: finalAmount,
          date,
          time: getCurrentTime(),
          note: note.trim()
        });
      } else {
        // Tạo giao dịch mới
        await createTransaction({
          walletId: selectedWalletId,
          toWalletId: type === 'TRANSFER' ? toWalletId : undefined,
          categoryId: type !== 'TRANSFER' ? selectedCategoryId : undefined,
          type,
          amount: finalAmount,
          date,
          time: getCurrentTime(),
          note: note.trim()
        });
      }

      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi xảy ra khi lưu giao dịch');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        maxWidth: 480,
        margin: '0 auto'
      }}
    >
      <div
        className="glass-panel animate-slide-up"
        style={{
          backgroundColor: '#0f172a',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
          overflowY: 'auto'
        }}
      >
        {/* Header: Thanh điều hướng & Chọn Loại Giao dịch */}
        <div
          style={{
            padding: '16px 20px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.06)'
          }}
        >
          {/* Segmented Control 3 Loại */}
          <div
            style={{
              display: 'flex',
              backgroundColor: '#1e293b',
              borderRadius: 12,
              padding: 3,
              gap: 2
            }}
          >
            <button
              type="button"
              onClick={() => {
                setType('EXPENSE');
                const cat = categories.find((c) => c.type === 'EXPENSE');
                if (cat) setSelectedCategoryId(cat.id);
              }}
              style={{
                border: 'none',
                padding: '6px 14px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: type === 'EXPENSE' ? '#EF4444' : 'transparent',
                color: type === 'EXPENSE' ? '#ffffff' : '#94a3b8'
              }}
            >
              Chi tiền
            </button>
            <button
              type="button"
              onClick={() => {
                setType('INCOME');
                const cat = categories.find((c) => c.type === 'INCOME');
                if (cat) setSelectedCategoryId(cat.id);
              }}
              style={{
                border: 'none',
                padding: '6px 14px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: type === 'INCOME' ? '#10B981' : 'transparent',
                color: type === 'INCOME' ? '#ffffff' : '#94a3b8'
              }}
            >
              Thu tiền
            </button>
            <button
              type="button"
              onClick={() => setType('TRANSFER')}
              style={{
                border: 'none',
                padding: '6px 12px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: type === 'TRANSFER' ? '#3B82F6' : 'transparent',
                color: type === 'TRANSFER' ? '#ffffff' : '#94a3b8'
              }}
            >
              Chuyển khoản
            </button>
          </div>

          {/* Nút Đóng */}
          <button
            type="button"
            onClick={onClose}
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

        {/* Khung Hiển thị Số tiền lớn & Công thức */}
        <div style={{ padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
            {type === 'EXPENSE' ? 'Số tiền chi' : type === 'INCOME' ? 'Số tiền thu' : 'Số tiền chuyển'}
          </div>
          <div
            className="font-heading"
            style={{
              fontSize: 34,
              fontWeight: 800,
              color: type === 'EXPENSE' ? '#F43F5E' : type === 'INCOME' ? '#10B981' : '#38BDF8',
              letterSpacing: -0.5
            }}
          >
            {formatVND(currentComputedAmount)}
          </div>
          {amountStr.includes('+') || amountStr.includes('-') || amountStr.includes('*') || amountStr.includes('/') ? (
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
              Biểu thức: {amountStr}
            </div>
          ) : null}
        </div>

        {/* Lựa chọn Ví & Ngày tháng */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '0 20px 12px',
            alignItems: 'center'
          }}
        >
          {/* Chọn Ví (Gửi) */}
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
              {type === 'TRANSFER' ? 'Từ ví' : 'Ví tiền'}
            </label>
            <select
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 10,
                backgroundColor: '#1e293b',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 13,
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

          {/* Chọn Ví nhận nếu là Transfer */}
          {type === 'TRANSFER' && (
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
                Đến ví
              </label>
              <select
                value={toWalletId}
                onChange={(e) => setToWalletId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 10,
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 13,
                  outline: 'none'
                }}
              >
                <option value="">-- Chọn ví nhận --</option>
                {wallets
                  .filter((w) => w.id !== selectedWalletId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Chọn Ngày */}
          <div style={{ width: 125 }}>
            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Ngày
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 8px',
                borderRadius: 10,
                backgroundColor: '#1e293b',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 12,
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Lưới chọn Danh mục (Nếu không phải Transfer) */}
        {type !== 'TRANSFER' && (
          <div style={{ padding: '0 20px 10px' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
              Chọn hạng mục
            </div>
            <div
              style={{
                display: 'flex',
                gap: 10,
                overflowX: 'auto',
                paddingBottom: 6,
                scrollbarWidth: 'none'
              }}
            >
              {activeCategories.map((cat) => {
                const isSelected = cat.id === selectedCategoryId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className="touch-btn"
                    style={{
                      background: 'none',
                      border: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      flexShrink: 0,
                      width: 60
                    }}
                  >
                    <div
                      className="cat-badge"
                      style={{
                        backgroundColor: isSelected ? cat.color : '#1e293b',
                        boxShadow: isSelected ? `0 4px 14px ${cat.color}66` : 'none',
                        border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.08)'
                      }}
                    >
                      <CategoryIcon
                        name={cat.icon}
                        size={20}
                        color={isSelected ? '#ffffff' : cat.color}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: isSelected ? '#ffffff' : '#94a3b8',
                        fontWeight: isSelected ? 600 : 400,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 62
                      }}
                    >
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* QUICK TAGS BAR (Gợi ý ghi chú nhanh của danh mục) */}
        {selectedCategory?.quickTags && selectedCategory.quickTags.length > 0 && (
          <div style={{ padding: '0 20px 10px' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
              Gợi ý ghi chú nhanh cho {selectedCategory.name}:
            </div>
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                paddingBottom: 4,
                scrollbarWidth: 'none'
              }}
            >
              {selectedCategory.quickTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setNote(tag)}
                  className="touch-btn"
                  style={{
                    backgroundColor: note === tag ? '#3b82f6' : '#1e293b',
                    color: note === tag ? '#ffffff' : '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 999,
                    padding: '4px 12px',
                    fontSize: 12,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer'
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ô Nhập Ghi Chú Tùy Chọn */}
        <div style={{ padding: '0 20px 12px' }}>
          <input
            type="text"
            placeholder="Ghi chú chi tiết (tùy chọn)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 12,
              backgroundColor: '#1e293b',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 13,
              outline: 'none'
            }}
          />
        </div>

        {/* Báo lỗi nếu có */}
        {errorMsg && (
          <div style={{ color: '#F43F5E', fontSize: 12, padding: '0 20px 8px', textAlign: 'center' }}>
            {errorMsg}
          </div>
        )}

        {/* BÀN PHÍM SỐ NUMPAD CHUYÊN DỤNG VỚI PHÍM '000' */}
        <div
          style={{
            padding: '4px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8
          }}
        >
          {/* Hàng 1 */}
          <button type="button" onClick={() => handleKeyPress('1')} className="numpad-btn touch-btn">1</button>
          <button type="button" onClick={() => handleKeyPress('2')} className="numpad-btn touch-btn">2</button>
          <button type="button" onClick={() => handleKeyPress('3')} className="numpad-btn touch-btn">3</button>
          <button type="button" onClick={() => handleKeyPress('+')} className="numpad-op-btn touch-btn">+</button>

          {/* Hàng 2 */}
          <button type="button" onClick={() => handleKeyPress('4')} className="numpad-btn touch-btn">4</button>
          <button type="button" onClick={() => handleKeyPress('5')} className="numpad-btn touch-btn">5</button>
          <button type="button" onClick={() => handleKeyPress('6')} className="numpad-btn touch-btn">6</button>
          <button type="button" onClick={() => handleKeyPress('-')} className="numpad-op-btn touch-btn">-</button>

          {/* Hàng 3 */}
          <button type="button" onClick={() => handleKeyPress('7')} className="numpad-btn touch-btn">7</button>
          <button type="button" onClick={() => handleKeyPress('8')} className="numpad-btn touch-btn">8</button>
          <button type="button" onClick={() => handleKeyPress('9')} className="numpad-btn touch-btn">9</button>
          <button type="button" onClick={() => handleKeyPress('C')} className="numpad-del-btn touch-btn">
            <Delete size={20} />
          </button>

          {/* Hàng 4 */}
          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="numpad-btn touch-btn"
          >
            0
          </button>

          {/* PHÍM '000' THẦN THÁNH CHO TIỀN VNĐ */}
          <button
            type="button"
            onClick={() => handleKeyPress('000')}
            className="numpad-btn touch-btn"
            style={{ fontWeight: 800, color: '#38BDF8', letterSpacing: -0.5 }}
          >
            000
          </button>

          {/* Phím Phép Tính Nhân hoặc Chia */}
          <button type="button" onClick={() => handleKeyPress('x')} className="numpad-op-btn touch-btn">×</button>

          {/* NÚT LƯU TO NỔI BẬT */}
          <button
            type="button"
            onClick={handleSave}
            className="touch-btn touch-bounce"
            style={{
              backgroundColor: '#10B981',
              color: '#ffffff',
              border: 'none',
              borderRadius: 14,
              fontWeight: 700,
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
            }}
          >
            <Check size={20} strokeWidth={3} />
            <span>LƯU</span>
          </button>
        </div>
      </div>

      <style>{`
        .numpad-btn {
          height: 52px;
          background-color: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          color: #f8fafc;
          font-size: 22px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .numpad-op-btn {
          height: 52px;
          background-color: #334155;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          color: #38bdf8;
          font-size: 22px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .numpad-del-btn {
          height: 52px;
          background-color: #27272a;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          color: #f43f5e;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
};
