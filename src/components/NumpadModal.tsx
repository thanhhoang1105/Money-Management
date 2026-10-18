import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Transaction, TransactionType } from '../types';
import { createTransaction, updateTransaction } from '../services/transactionService';
import { CategoryIcon } from './CategoryIcon';
import { formatVND, getCurrentDate, getCurrentTime } from '../utils/formatters';
import { X, Check, Delete, Plus } from 'lucide-react';

interface NumpadModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTransaction?: Transaction | null;
}

/**
 * Tính toán an toàn giá trị biểu thức toán học (+, -, *, /).
 * Tự động cắt bỏ các toán tử treo ở cuối trước khi evaluate.
 */
function evaluateExpression(rawExpr: string): number {
  if (!rawExpr || rawExpr === '0') return 0;
  // Bỏ các toán tử thừa ở cuối biểu thức (ví dụ "35000+" -> "35000")
  const cleaned = rawExpr.replace(/[+\-*/]+$/, '').trim();
  if (!cleaned) return 0;

  // Chỉ cho phép số và các toán tử hợp lệ +, -, *, /
  const sanitized = cleaned.replace(/[^0-9+\-*/.]/g, '');
  if (!sanitized) return 0;

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${sanitized})`)();
    if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
      return 0;
    }
    // Giới hạn trong khoảng 0 đến 999.999.999.999 ₫
    const rounded = Math.round(result);
    if (rounded < 0) return 0;
    if (rounded > 999_999_999_999) return 999_999_999_999;
    return rounded;
  } catch {
    return 0;
  }
}

/**
 * Tách chuỗi note thành mảng các tag riêng biệt dựa trên dấu phẩy
 */
function getNoteTags(noteText: string): string[] {
  return noteText
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export const NumpadModal: React.FC<NumpadModalProps> = ({
  isOpen,
  onClose,
  editingTransaction
}) => {
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const lastWalletSetting = useLiveQuery(() => db.settings.get('last_used_wallet_id'));

  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amountStr, setAmountStr] = useState<string>('0');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [toWalletId, setToWalletId] = useState<string>('');
  const [date, setDate] = useState<string>(getCurrentDate());
  const [note, setNote] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Trạng thái cho tính năng thêm nhanh Quick Tag tại chỗ
  const [isAddingTag, setIsAddingTag] = useState<boolean>(false);
  const [newTagInput, setNewTagInput] = useState<string>('');

  // Ghi nhớ trạng thái mở của modal để chỉ reset giá trị một lần khi vừa mở
  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (!isOpen) return;

    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmountStr(editingTransaction.amount.toString());
      setSelectedCategoryId(editingTransaction.categoryId || '');
      setSelectedWalletId(editingTransaction.walletId);
      setToWalletId(editingTransaction.toWalletId || '');
      setDate(editingTransaction.date);
      setNote(editingTransaction.note || '');
      setErrorMsg('');
      setIsAddingTag(false);
      setNewTagInput('');
    } else if (justOpened) {
      // 1. Mặc định loại EXPENSE khi tạo mới
      setType('EXPENSE');
      setAmountStr('0');
      setDate(getCurrentDate());
      setNote('');
      setErrorMsg('');
      setIsAddingTag(false);
      setNewTagInput('');

      // 2. Mặc định Ví: ưu tiên Ví sử dụng gần nhất, fallback 'Tiền mặt'
      if (wallets.length > 0) {
        const lastId = lastWalletSetting?.value;
        const foundLast = lastId ? wallets.find((w) => w.id === lastId) : null;
        if (foundLast) {
          setSelectedWalletId(foundLast.id);
        } else {
          const cashWallet = wallets.find((w) =>
            w.name.toLowerCase().includes('tiền mặt')
          );
          setSelectedWalletId(cashWallet ? cashWallet.id : wallets[0].id);
        }
      }

      // 3. Mặc định Danh mục: tự động chọn 'Ăn uống' hoặc danh mục EXPENSE đầu tiên
      const expCategories = categories.filter((c) => c.type === 'EXPENSE');
      if (expCategories.length > 0) {
        const foodCat = expCategories.find((c) =>
          c.name.toLowerCase().includes('ăn uống')
        );
        setSelectedCategoryId(foodCat ? foodCat.id : expCategories[0].id);
      }
    }
  }, [
    isOpen,
    editingTransaction,
    lastWalletSetting?.value,
    wallets,
    categories
  ]);

  // Tự động gán ví nếu mở modal mà ví chưa load kịp
  useEffect(() => {
    if (isOpen && !editingTransaction && !selectedWalletId && wallets.length > 0) {
      const lastId = lastWalletSetting?.value;
      const foundLast = lastId ? wallets.find((w) => w.id === lastId) : null;
      if (foundLast) {
        setSelectedWalletId(foundLast.id);
      } else {
        const cashWallet = wallets.find((w) =>
          w.name.toLowerCase().includes('tiền mặt')
        );
        setSelectedWalletId(cashWallet ? cashWallet.id : wallets[0].id);
      }
    }
  }, [isOpen, editingTransaction, selectedWalletId, wallets, lastWalletSetting?.value]);

  // Tự động gán danh mục nếu mở modal mà danh mục chưa load kịp
  useEffect(() => {
    if (isOpen && !editingTransaction && !selectedCategoryId && categories.length > 0) {
      const expCategories = categories.filter((c) => c.type === 'EXPENSE');
      if (expCategories.length > 0) {
        const foodCat = expCategories.find((c) =>
          c.name.toLowerCase().includes('ăn uống')
        );
        setSelectedCategoryId(foodCat ? foodCat.id : expCategories[0].id);
      }
    }
  }, [isOpen, editingTransaction, selectedCategoryId, categories]);

  if (!isOpen) return null;

  // Lọc danh mục theo loại (EXPENSE / INCOME)
  const activeCategories = categories.filter((c) => c.type === type);
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  // Tính số tiền thực tế theo thời gian thực từ biểu thức
  const currentComputedAmount = evaluateExpression(amountStr);
  const hasOperator = /[+\-*/]/.test(amountStr);

  // Danh sách các tag đang được chọn trong ô note
  const activeTags = getNoteTags(note);

  // Xử lý bấm phím trên Numpad
  const handleKeyPress = (key: string) => {
    setErrorMsg('');

    // Xóa trắng (Clear all)
    if (key === 'C') {
      setAmountStr('0');
      return;
    }

    // Xóa lùi 1 ký tự (Backspace)
    if (key === 'BACKSPACE') {
      if (amountStr.length <= 1) {
        setAmountStr('0');
      } else {
        const nextStr = amountStr.slice(0, -1);
        setAmountStr(nextStr === '' ? '0' : nextStr);
      }
      return;
    }

    // Phím '000' thần thánh: chặn khi số đang là '0' hoặc vừa nhập toán tử
    if (key === '000') {
      if (amountStr === '0') return;
      if (/[+\-*/]$/.test(amountStr)) return;
      if (/[+\-*/]0$/.test(amountStr)) return;
      if (amountStr.length >= 24) return; // Chặn tràn số
      setAmountStr((prev) => prev + '000');
      return;
    }

    // Phép tính +, -, ×, ÷
    if (['+', '-', '×', '÷'].includes(key)) {
      const op = key === '×' ? '*' : key === '÷' ? '/' : key;

      if (amountStr === '0') {
        return; // Không bắt đầu bằng toán tử
      }

      // Nếu ký tự cuối đã là toán tử, thay thế bằng toán tử mới
      if (/[+\-*/]$/.test(amountStr)) {
        setAmountStr((prev) => prev.slice(0, -1) + op);
        return;
      }

      if (amountStr.length >= 26) return;
      setAmountStr((prev) => prev + op);
      return;
    }

    // Các phím số 0-9
    if (amountStr === '0') {
      if (key === '0') return;
      setAmountStr(key);
      return;
    }

    // Nếu vừa gõ toán tử xong gõ số 0 rồi gõ số khác (ví dụ "10+0" rồi gõ 5 -> "10+5")
    if (/[+\-*/]0$/.test(amountStr)) {
      if (key === '0') return;
      setAmountStr((prev) => prev.slice(0, -1) + key);
      return;
    }

    if (amountStr.length >= 28) return;
    setAmountStr((prev) => prev + key);
  };

  // Bật/tắt tag trong chuỗi ghi chú (Cộng dồn thông minh)
  const handleToggleTag = (tag: string) => {
    const currentTags = getNoteTags(note);
    if (currentTags.includes(tag)) {
      // Đã có -> gỡ bỏ
      const nextTags = currentTags.filter((t) => t !== tag);
      setNote(nextTags.join(', '));
    } else {
      // Chưa có -> thêm vào chuỗi
      const nextTags = [...currentTags, tag];
      setNote(nextTags.join(', '));
    }
  };

  // Thêm nhanh Quick Tag mới vào danh mục đang chọn ngay tại chỗ
  const handleSaveNewTag = async () => {
    const trimmed = newTagInput.trim();
    if (!trimmed || !selectedCategory) {
      setIsAddingTag(false);
      setNewTagInput('');
      return;
    }

    try {
      const currentQuickTags = selectedCategory.quickTags || [];
      if (!currentQuickTags.includes(trimmed)) {
        const updatedQuickTags = [...currentQuickTags, trimmed];
        await db.categories.update(selectedCategory.id, {
          quickTags: updatedQuickTags
        });
      }

      // Tự động cộng dồn tag mới tạo vào ô note
      const currentTags = getNoteTags(note);
      if (!currentTags.includes(trimmed)) {
        setNote([...currentTags, trimmed].join(', '));
      }

      setNewTagInput('');
      setIsAddingTag(false);
    } catch (err: any) {
      console.error('Lỗi thêm quick tag:', err);
      setIsAddingTag(false);
    }
  };

  // Tự động tính toán (Auto-evaluate) và Lưu giao dịch
  const handleSave = async () => {
    setErrorMsg('');

    // Auto-evaluate: Tự động tính ra kết quả cuối cùng trước khi lưu
    const finalAmount = evaluateExpression(amountStr);

    if (finalAmount <= 0 || isNaN(finalAmount)) {
      setErrorMsg('Vui lòng nhập số tiền hợp lệ lớn hơn 0');
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
        // Cập nhật giao dịch đã có (với atomic balance revert trong transactionService)
        await updateTransaction(editingTransaction.id, {
          walletId: selectedWalletId,
          toWalletId: type === 'TRANSFER' ? toWalletId : undefined,
          categoryId: type !== 'TRANSFER' ? selectedCategoryId : undefined,
          type,
          amount: finalAmount,
          date,
          time: editingTransaction.time || getCurrentTime(),
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
        backgroundColor: 'rgba(0,0,0,0.72)',
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
          maxHeight: '94vh',
          paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* 1. Header: Chọn Loại Giao Dịch & Nút Đóng */}
        <div
          style={{
            padding: '16px 20px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.06)'
          }}
        >
          {/* Segmented Control 3 Loại Giao Dịch */}
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
                color: type === 'EXPENSE' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease'
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
                color: type === 'INCOME' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease'
              }}
            >
              Thu tiền
            </button>
            <button
              type="button"
              onClick={() => {
                setType('TRANSFER');
                // Nếu chưa có ví nhận hoặc ví nhận trùng ví gửi
                if (!toWalletId || toWalletId === selectedWalletId) {
                  const otherWallet = wallets.find((w) => w.id !== selectedWalletId);
                  if (otherWallet) setToWalletId(otherWallet.id);
                }
              }}
              style={{
                border: 'none',
                padding: '6px 12px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: type === 'TRANSFER' ? '#3B82F6' : 'transparent',
                color: type === 'TRANSFER' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease'
              }}
            >
              Chuyển ví
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

        {/* 2. Khung Hiển Thị Số Tiền & Dòng Biểu Thức Tính Toán Phía Trên */}
        <div style={{ padding: '14px 20px 10px', textAlign: 'center' }}>
          {/* Dòng nhỏ hiển thị biểu thức đang tính PHÍA TRÊN tổng tiền */}
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              minHeight: 20,
              marginBottom: 4,
              color: hasOperator ? '#38BDF8' : '#64748B',
              letterSpacing: hasOperator ? 0.5 : 0
            }}
          >
            {hasOperator
              ? amountStr
                  .replace(/\*/g, ' × ')
                  .replace(/\//g, ' ÷ ')
                  .replace(/\+/g, ' + ')
                  .replace(/-/g, ' - ')
              : type === 'EXPENSE'
              ? 'Số tiền chi'
              : type === 'INCOME'
              ? 'Số tiền thu'
              : 'Số tiền chuyển'}
          </div>

          {/* Số tiền tổng evaluated lớn và sắc nét */}
          <div
            className="font-heading"
            style={{
              fontSize: 36,
              fontWeight: 800,
              color:
                type === 'EXPENSE'
                  ? '#F43F5E'
                  : type === 'INCOME'
                  ? '#10B981'
                  : '#38BDF8',
              letterSpacing: -0.5,
              lineHeight: 1.1
            }}
          >
            {formatVND(currentComputedAmount)}
          </div>
        </div>

        {/* 3. Lựa Chọn Ví & Ngày Tháng (Inputs font-size >= 16px chống iOS auto-zoom) */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '0 20px 10px',
            alignItems: 'center'
          }}
        >
          {/* Chọn Ví (Gửi) */}
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#64748b',
                display: 'block',
                marginBottom: 4
              }}
            >
              {type === 'TRANSFER' ? 'Từ ví' : 'Ví tiền'}
            </label>
            <select
              value={selectedWalletId}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedWalletId(newId);
                if (type === 'TRANSFER' && toWalletId === newId) {
                  const alt = wallets.find((w) => w.id !== newId);
                  setToWalletId(alt ? alt.id : '');
                }
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 10,
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

          {/* Chọn Ví Nhận nếu là Transfer */}
          {type === 'TRANSFER' && (
            <div style={{ flex: 1 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#64748b',
                  display: 'block',
                  marginBottom: 4
                }}
              >
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
                  fontSize: 16,
                  outline: 'none'
                }}
              >
                <option value="">-- Chọn ví nhận --</option>
                {wallets
                  .filter((w) => w.id !== selectedWalletId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatVND(w.balance)})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Chọn Ngày */}
          <div style={{ width: 135 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#64748b',
                display: 'block',
                marginBottom: 4
              }}
            >
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
                fontSize: 16,
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* 4. Lưới Chọn Danh Mục (Khi không phải Chuyển ví) */}
        {type !== 'TRANSFER' && (
          <div style={{ padding: '0 20px 8px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#64748b',
                marginBottom: 6
              }}
            >
              Hạng mục
            </div>
            <div
              style={{
                display: 'flex',
                gap: 10,
                overflowX: 'auto',
                paddingBottom: 6,
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch'
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
                        boxShadow: isSelected
                          ? `0 4px 14px ${cat.color}66`
                          : 'none',
                        border: isSelected
                          ? '2px solid #ffffff'
                          : '1px solid rgba(255,255,255,0.08)'
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
                        fontWeight: isSelected ? 700 : 400,
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

        {/* 5. THANH QUICK TAGS THÔNG MINH (Cộng dồn & Thêm mới tại chỗ) */}
        {type !== 'TRANSFER' && selectedCategory && (
          <div style={{ padding: '0 20px 10px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#64748b',
                marginBottom: 6,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>Gợi ý ghi chú ({selectedCategory.name}):</span>
              {activeTags.length > 0 && (
                <span style={{ color: '#38bdf8', fontSize: 11 }}>
                  Đã chọn {activeTags.length} tag
                </span>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                alignItems: 'center',
                paddingBottom: 4,
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {/* Danh sách các tag có sẵn của danh mục */}
              {(selectedCategory.quickTags || []).map((tag) => {
                const isActive = activeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className="touch-btn"
                    style={{
                      backgroundColor: isActive ? '#2563EB' : '#1e293b',
                      color: isActive ? '#ffffff' : '#94a3b8',
                      border: isActive
                        ? '1px solid #60A5FA'
                        : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 999,
                      padding: '4px 12px',
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 500,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isActive && <Check size={12} strokeWidth={3} />}
                    <span>{tag}</span>
                  </button>
                );
              })}

              {/* Nút Thêm Tag Mới Tại Chỗ */}
              {isAddingTag ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: '#1e293b',
                    border: '1px solid #38BDF8',
                    borderRadius: 999,
                    padding: '2px 6px 2px 10px'
                  }}
                >
                  <input
                    autoFocus
                    type="text"
                    placeholder="Tag mới..."
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveNewTag();
                      } else if (e.key === 'Escape') {
                        setIsAddingTag(false);
                        setNewTagInput('');
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: 12,
                      outline: 'none',
                      width: 75
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveNewTag}
                    style={{
                      background: '#38BDF8',
                      border: 'none',
                      borderRadius: 999,
                      width: 20,
                      height: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0f172a',
                      cursor: 'pointer'
                    }}
                    title="Lưu tag"
                  >
                    <Check size={12} strokeWidth={3} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingTag(false);
                      setNewTagInput('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Hủy"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingTag(true)}
                  className="touch-btn"
                  style={{
                    backgroundColor: 'rgba(56, 189, 248, 0.08)',
                    color: '#38BDF8',
                    border: '1px dashed rgba(56, 189, 248, 0.4)',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Plus size={12} strokeWidth={2.5} />
                  <span>Thêm tag</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 6. Ô Nhập Ghi Chú Chi Tiết (Font-size >= 16px chống iPhone zoom) */}
        <div style={{ padding: '0 20px 10px' }}>
          <input
            type="text"
            placeholder="Ghi chú chi tiết (tùy chọn)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 14px',
              borderRadius: 12,
              backgroundColor: '#1e293b',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 16,
              outline: 'none'
            }}
          />
        </div>

        {/* Báo lỗi nếu có */}
        {errorMsg && (
          <div
            style={{
              color: '#F43F5E',
              fontSize: 12,
              padding: '0 20px 8px',
              textAlign: 'center',
              fontWeight: 500
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* 7. BÀN PHÍM SỐ NUMPAD CHUYÊN DỤNG VỚI PHÍM '000', CÁC PHÉP TÍNH & AUTO-EVALUATE */}
        <div
          style={{
            padding: '4px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8
          }}
        >
          {/* Hàng 1: 1, 2, 3, ÷ */}
          <button
            type="button"
            onClick={() => handleKeyPress('1')}
            className="numpad-btn touch-btn"
          >
            1
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('2')}
            className="numpad-btn touch-btn"
          >
            2
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('3')}
            className="numpad-btn touch-btn"
          >
            3
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('÷')}
            className="numpad-op-btn touch-btn"
            title="Chia"
          >
            ÷
          </button>

          {/* Hàng 2: 4, 5, 6, × */}
          <button
            type="button"
            onClick={() => handleKeyPress('4')}
            className="numpad-btn touch-btn"
          >
            4
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('5')}
            className="numpad-btn touch-btn"
          >
            5
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('6')}
            className="numpad-btn touch-btn"
          >
            6
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('×')}
            className="numpad-op-btn touch-btn"
            title="Nhân"
          >
            ×
          </button>

          {/* Hàng 3: 7, 8, 9, - */}
          <button
            type="button"
            onClick={() => handleKeyPress('7')}
            className="numpad-btn touch-btn"
          >
            7
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('8')}
            className="numpad-btn touch-btn"
          >
            8
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('9')}
            className="numpad-btn touch-btn"
          >
            9
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('-')}
            className="numpad-op-btn touch-btn"
            title="Trừ"
          >
            -
          </button>

          {/* Hàng 4: 000, 0, ⌫, + */}
          <button
            type="button"
            onClick={() => handleKeyPress('000')}
            className="numpad-btn touch-btn"
            style={{ fontWeight: 800, color: '#38BDF8', letterSpacing: -0.5 }}
            title="Thêm ba số không"
          >
            000
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="numpad-btn touch-btn"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('BACKSPACE')}
            className="numpad-del-btn touch-btn"
            title="Xóa 1 ký tự"
          >
            <Delete size={20} />
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('+')}
            className="numpad-op-btn touch-btn"
            title="Cộng"
          >
            +
          </button>

          {/* Hàng 5: C (Xóa trắng) và LƯU GIAO DỊCH (spans 3) */}
          <button
            type="button"
            onClick={() => handleKeyPress('C')}
            className="numpad-clear-btn touch-btn"
            title="Xóa toàn bộ"
          >
            C
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="touch-btn touch-bounce"
            style={{
              gridColumn: 'span 3',
              height: 52,
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 14,
              fontWeight: 700,
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)'
            }}
          >
            <Check size={20} strokeWidth={3} />
            <span>{editingTransaction ? 'CẬP NHẬT' : 'LƯU GIAO DỊCH'}</span>
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
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          transition: transform 0.08s ease, background-color 0.1s ease;
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
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          transition: transform 0.08s ease, background-color 0.1s ease;
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
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          transition: transform 0.08s ease, background-color 0.1s ease;
        }
        .numpad-clear-btn {
          height: 52px;
          background-color: #2a1c22;
          border: 1px solid rgba(244, 63, 94, 0.2);
          border-radius: 14px;
          color: #fb7185;
          font-size: 19px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          transition: transform 0.08s ease, background-color 0.1s ease;
        }
        .numpad-btn:active,
        .numpad-op-btn:active,
        .numpad-del-btn:active,
        .numpad-clear-btn:active {
          transform: scale(0.95);
          filter: brightness(1.2);
        }
      `}</style>
    </div>
  );
};
export default NumpadModal;
