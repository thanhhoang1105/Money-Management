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
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex flex-col justify-end max-w-[480px] mx-auto">
      <div className="glass-panel animate-slide-up bg-slate-900 rounded-t-[28px] border-t border-x border-white/10 flex flex-col max-h-[94vh] pb-[max(14px,env(safe-area-inset-bottom,0px))] overflow-y-auto">
        {/* 1. Header: Chọn Loại Giao Dịch & Nút Đóng */}
        <div className="px-5 pt-4 pb-2.5 flex items-center justify-between border-b border-white/5">
          {/* Segmented Control 3 Loại Giao Dịch */}
          <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => {
                setType('EXPENSE');
                const cat = categories.find((c) => c.type === 'EXPENSE');
                if (cat) setSelectedCategoryId(cat.id);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                type === 'EXPENSE'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                type === 'INCOME'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Thu tiền
            </button>
            <button
              type="button"
              onClick={() => {
                setType('TRANSFER');
                if (!toWalletId || toWalletId === selectedWalletId) {
                  const otherWallet = wallets.find((w) => w.id !== selectedWalletId);
                  if (otherWallet) setToWalletId(otherWallet.id);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                type === 'TRANSFER'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Chuyển ví
            </button>
          </div>

          {/* Nút Đóng */}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center touch-btn cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 2. Khung Hiển Thị Số Tiền & Dòng Biểu Thức Tính Toán Phía Trên */}
        <div className="px-5 pt-3.5 pb-2 text-center">
          {/* Dòng nhỏ hiển thị biểu thức đang tính PHÍA TRÊN tổng tiền */}
          <div
            className={`text-xs font-medium min-h-5 mb-1 ${
              hasOperator ? 'text-sky-400 tracking-wider' : 'text-slate-400'
            }`}
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
            className={`font-heading text-4xl font-extrabold tracking-tight leading-none ${
              type === 'EXPENSE'
                ? 'text-rose-500'
                : type === 'INCOME'
                ? 'text-emerald-400'
                : 'text-sky-400'
            }`}
          >
            {formatVND(currentComputedAmount)}
          </div>
        </div>

        {/* 3. Lựa Chọn Ví & Ngày Tháng (Inputs font-size >= 16px chống iOS auto-zoom) */}
        <div className="flex gap-2.5 px-5 pb-2.5 items-center">
          {/* Chọn Ví (Gửi) */}
          <div className="flex-1">
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">
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
              className="input-ios"
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
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Đến ví
              </label>
              <select
                value={toWalletId}
                onChange={(e) => setToWalletId(e.target.value)}
                className="input-ios"
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
          <div className="w-[135px]">
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">
              Ngày
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-ios"
            />
          </div>
        </div>

        {/* 4. Lưới Chọn Danh Mục (Khi không phải Chuyển ví) */}
        {type !== 'TRANSFER' && (
          <div className="px-5 pb-2">
            <div className="text-[11px] font-semibold text-slate-400 mb-1.5">
              Hạng mục
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1.5 scrollbar-none">
              {activeCategories.map((cat) => {
                const isSelected = cat.id === selectedCategoryId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className="touch-btn flex flex-col items-center gap-1 cursor-pointer shrink-0 w-15"
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
                      className={`text-[11px] text-center truncate max-w-[62px] ${
                        isSelected ? 'text-white font-bold' : 'text-slate-400 font-normal'
                      }`}
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
          <div className="px-5 pb-2.5">
            <div className="flex justify-between items-center text-[11px] font-semibold text-slate-400 mb-1.5">
              <span>Gợi ý ghi chú ({selectedCategory.name}):</span>
              {activeTags.length > 0 && (
                <span className="text-sky-400 text-[11px]">
                  Đã chọn {activeTags.length} tag
                </span>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto items-center pb-1 scrollbar-none">
              {/* Danh sách các tag có sẵn của danh mục */}
              {(selectedCategory.quickTags || []).map((tag) => {
                const isActive = activeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`touch-btn px-3 py-1 rounded-full text-xs whitespace-nowrap cursor-pointer flex items-center gap-1 transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white border border-blue-400 font-semibold'
                        : 'bg-slate-800 text-slate-400 border border-white/10 hover:text-slate-200 font-medium'
                    }`}
                  >
                    {isActive && <Check size={12} strokeWidth={3} />}
                    <span>{tag}</span>
                  </button>
                );
              })}

              {/* Nút Thêm Tag Mới Tại Chỗ */}
              {isAddingTag ? (
                <div className="flex items-center gap-1 bg-slate-800 border border-sky-400 rounded-full py-0.5 pl-2.5 pr-1.5">
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
                    className="bg-transparent border-none text-white text-xs outline-none w-20"
                  />
                  <button
                    type="button"
                    onClick={handleSaveNewTag}
                    className="bg-sky-400 text-slate-900 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer touch-btn"
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
                    className="text-slate-400 hover:text-white cursor-pointer p-0.5"
                    title="Hủy"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingTag(true)}
                  className="touch-btn bg-sky-500/10 text-sky-400 border border-dashed border-sky-400/40 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap cursor-pointer flex items-center gap-1"
                >
                  <Plus size={12} strokeWidth={2.5} />
                  <span>Thêm tag</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 6. Ô Nhập Ghi Chú Chi Tiết (Font-size >= 16px chống iPhone zoom) */}
        <div className="px-5 pb-2.5">
          <input
            type="text"
            placeholder="Ghi chú chi tiết (tùy chọn)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input-ios"
          />
        </div>

        {/* Báo lỗi nếu có */}
        {errorMsg && (
          <div className="text-rose-500 text-xs px-5 pb-2 text-center font-medium">
            {errorMsg}
          </div>
        )}

        {/* 7. BÀN PHÍM SỐ NUMPAD CHUYÊN DỤNG VỚI PHÍM '000', CÁC PHÉP TÍNH & AUTO-EVALUATE */}
        <div className="px-4 pt-1 pb-1 grid grid-cols-4 gap-2">
          {/* Hàng 1: 1, 2, 3, ÷ */}
          <button
            type="button"
            onClick={() => handleKeyPress('1')}
            className="numpad-key touch-btn bg-slate-800 hover:bg-slate-700/80 border border-white/5 text-slate-100 text-2xl font-semibold"
          >
            1
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('2')}
            className="numpad-key touch-btn bg-slate-800 hover:bg-slate-700/80 border border-white/5 text-slate-100 text-2xl font-semibold"
          >
            2
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('3')}
            className="numpad-key touch-btn bg-slate-800 hover:bg-slate-700/80 border border-white/5 text-slate-100 text-2xl font-semibold"
          >
            3
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('÷')}
            className="numpad-key touch-btn bg-slate-700/80 hover:bg-slate-600 border border-white/10 text-sky-400 text-2xl font-bold"
            title="Chia"
          >
            ÷
          </button>

          {/* Hàng 2: 4, 5, 6, × */}
          <button
            type="button"
            onClick={() => handleKeyPress('4')}
            className="numpad-key touch-btn bg-slate-800 hover:bg-slate-700/80 border border-white/5 text-slate-100 text-2xl font-semibold"
          >
            4
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('5')}
            className="numpad-key touch-btn bg-slate-800 hover:bg-slate-700/80 border border-white/5 text-slate-100 text-2xl font-semibold"
          >
            5
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('6')}
            className="numpad-key touch-btn bg-slate-800 hover:bg-slate-700/80 border border-white/5 text-slate-100 text-2xl font-semibold"
          >
            6
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('×')}
            className="numpad-key touch-btn bg-slate-700/80 hover:bg-slate-600 border border-white/10 text-sky-400 text-2xl font-bold"
            title="Nhân"
          >
            ×
          </button>

          {/* Hàng 3: 7, 8, 9, - */}
          <button
            type="button"
            onClick={() => handleKeyPress('7')}
            className="numpad-key touch-btn bg-slate-800 hover:bg-slate-700/80 border border-white/5 text-slate-100 text-2xl font-semibold"
          >
            7
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('8')}
            className="numpad-key touch-btn bg-slate-800 hover:bg-slate-700/80 border border-white/5 text-slate-100 text-2xl font-semibold"
          >
            8
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('9')}
            className="numpad-key touch-btn bg-slate-800 hover:bg-slate-700/80 border border-white/5 text-slate-100 text-2xl font-semibold"
          >
            9
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('-')}
            className="numpad-key touch-btn bg-slate-700/80 hover:bg-slate-600 border border-white/10 text-sky-400 text-2xl font-bold"
            title="Trừ"
          >
            -
          </button>

          {/* Hàng 4: 000, 0, ⌫, + */}
          <button
            type="button"
            onClick={() => handleKeyPress('000')}
            className="numpad-key touch-btn bg-slate-800 hover:bg-slate-700/80 border border-white/5 text-sky-400 text-2xl font-extrabold tracking-tighter"
            title="Thêm ba số không"
          >
            000
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="numpad-key touch-btn bg-slate-800 hover:bg-slate-700/80 border border-white/5 text-slate-100 text-2xl font-semibold"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('BACKSPACE')}
            className="numpad-key touch-btn bg-zinc-800 hover:bg-zinc-700 border border-white/5 text-rose-400"
            title="Xóa 1 ký tự"
          >
            <Delete size={20} />
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('+')}
            className="numpad-key touch-btn bg-slate-700/80 hover:bg-slate-600 border border-white/10 text-sky-400 text-2xl font-bold"
            title="Cộng"
          >
            +
          </button>

          {/* Hàng 5: C (Xóa trắng) và LƯU GIAO DỊCH (spans 3) */}
          <button
            type="button"
            onClick={() => handleKeyPress('C')}
            className="numpad-key touch-btn bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/20 text-rose-300 text-lg font-bold"
            title="Xóa toàn bộ"
          >
            C
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="col-span-3 h-13 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 cursor-pointer touch-btn touch-bounce"
          >
            <Check size={20} strokeWidth={3} />
            <span>{editingTransaction ? 'CẬP NHẬT' : 'LƯU GIAO DỊCH'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default NumpadModal;
