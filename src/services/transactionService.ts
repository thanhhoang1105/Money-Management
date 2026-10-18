// src/services/transactionService.ts
import { db } from '../db';
import type { Transaction } from '../types';
import { generateUUID } from '../utils/uuid';
import { recordDeletedEntity } from './syncService';

export const SYSTEM_ADJUSTMENT_CATEGORY_ID = 'system_adjustment';

/**
 * Thêm giao dịch mới và tự động cập nhật số dư ví trong 1 ACID Transaction.
 * Đồng thời ghi nhớ ví sử dụng gần nhất (Smart Defaults) vào db.settings.
 */
export async function createTransaction(
  data: Omit<Transaction, 'id' | 'createdAt'>
): Promise<string> {
  const id = generateUUID();
  const createdAt = new Date().toISOString();
  const newTx: Transaction = { ...data, id, createdAt, updatedAt: createdAt };

  await db.transaction('rw', [db.wallets, db.transactions, db.settings], async () => {
    // 1. Cập nhật số dư ví
    if (newTx.type === 'EXPENSE' || newTx.type === 'LEND') {
      const wallet = await db.wallets.get(newTx.walletId);
      if (!wallet) throw new Error(`Ví ${newTx.walletId} không tồn tại`);
      await db.wallets.update(newTx.walletId, {
        balance: wallet.balance - newTx.amount,
        updatedAt: createdAt
      });
    } else if (newTx.type === 'INCOME' || newTx.type === 'BORROW') {
      const wallet = await db.wallets.get(newTx.walletId);
      if (!wallet) throw new Error(`Ví ${newTx.walletId} không tồn tại`);
      await db.wallets.update(newTx.walletId, {
        balance: wallet.balance + newTx.amount,
        updatedAt: createdAt
      });
    } else if (newTx.type === 'TRANSFER') {
      if (!newTx.toWalletId) throw new Error('Chuyển tiền cần có ví nhận');
      const fromWallet = await db.wallets.get(newTx.walletId);
      const toWallet = await db.wallets.get(newTx.toWalletId);
      if (!fromWallet) throw new Error(`Ví gửi ${newTx.walletId} không tồn tại`);
      if (!toWallet) throw new Error(`Ví nhận ${newTx.toWalletId} không tồn tại`);

      await db.wallets.update(newTx.walletId, {
        balance: fromWallet.balance - newTx.amount,
        updatedAt: createdAt
      });
      await db.wallets.update(newTx.toWalletId, {
        balance: toWallet.balance + newTx.amount,
        updatedAt: createdAt
      });
    }

    // 2. Thêm bản ghi giao dịch
    await db.transactions.add(newTx);

    // 3. Ghi nhớ ví sử dụng gần nhất vào settings (Smart Defaults)
    await db.settings.put({
      key: 'last_used_wallet_id',
      value: newTx.walletId
    });
  });

  return id;
}

/**
 * Cập nhật giao dịch với cơ chế HOÀN TÁC (Revert) số dư cũ và ÁP DỤNG số dư mới
 * Đảm bảo số dư không bao giờ bị lệch kể cả khi đổi ví, đổi số tiền hay đổi loại giao dịch.
 */
export async function updateTransaction(
  id: string,
  updates: Partial<Omit<Transaction, 'id' | 'createdAt'>>
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction('rw', [db.wallets, db.transactions, db.settings], async () => {
    const oldTx = await db.transactions.get(id);
    if (!oldTx) throw new Error(`Giao dịch ${id} không tồn tại`);

    // --- BƯỚC 1: HOÀN TÁC (REVERT) TÁC ĐỘNG CỦA GIAO DỊCH CŨ ---
    if (oldTx.type === 'EXPENSE' || oldTx.type === 'LEND') {
      const oldWallet = await db.wallets.get(oldTx.walletId);
      if (oldWallet) {
        await db.wallets.update(oldTx.walletId, {
          balance: oldWallet.balance + oldTx.amount, // Hoàn trả tiền vào ví cũ
          updatedAt: now
        });
      }
    } else if (oldTx.type === 'INCOME' || oldTx.type === 'BORROW') {
      const oldWallet = await db.wallets.get(oldTx.walletId);
      if (oldWallet) {
        await db.wallets.update(oldTx.walletId, {
          balance: oldWallet.balance - oldTx.amount, // Rút lại khoản thu nhập cũ
          updatedAt: now
        });
      }
    } else if (oldTx.type === 'TRANSFER' && oldTx.toWalletId) {
      const oldFrom = await db.wallets.get(oldTx.walletId);
      const oldTo = await db.wallets.get(oldTx.toWalletId);
      if (oldFrom) {
        await db.wallets.update(oldTx.walletId, {
          balance: oldFrom.balance + oldTx.amount, // Trả lại tiền cho ví gửi cũ
          updatedAt: now
        });
      }
      if (oldTo) {
        await db.wallets.update(oldTx.toWalletId, {
          balance: oldTo.balance - oldTx.amount, // Rút tiền từ ví nhận cũ
          updatedAt: now
        });
      }
    }

    // --- BƯỚC 2: TÍNH TOÁN DỮ LIỆU MỚI VÀ ÁP DỤNG TÁC ĐỘNG MỚI ---
    const newTx: Transaction = {
      ...oldTx,
      ...updates,
      updatedAt: now
    };

    if (newTx.type === 'EXPENSE' || newTx.type === 'LEND') {
      const newWallet = await db.wallets.get(newTx.walletId);
      if (!newWallet) throw new Error(`Ví ${newTx.walletId} không tồn tại`);
      await db.wallets.update(newTx.walletId, {
        balance: newWallet.balance - newTx.amount,
        updatedAt: now
      });
    } else if (newTx.type === 'INCOME' || newTx.type === 'BORROW') {
      const newWallet = await db.wallets.get(newTx.walletId);
      if (!newWallet) throw new Error(`Ví ${newTx.walletId} không tồn tại`);
      await db.wallets.update(newTx.walletId, {
        balance: newWallet.balance + newTx.amount,
        updatedAt: now
      });
    } else if (newTx.type === 'TRANSFER') {
      if (!newTx.toWalletId) throw new Error('Chuyển tiền cần có ví nhận');
      const newFrom = await db.wallets.get(newTx.walletId);
      const newTo = await db.wallets.get(newTx.toWalletId);
      if (!newFrom) throw new Error(`Ví gửi ${newTx.walletId} không tồn tại`);
      if (!newTo) throw new Error(`Ví nhận ${newTx.toWalletId} không tồn tại`);

      await db.wallets.update(newTx.walletId, {
        balance: newFrom.balance - newTx.amount,
        updatedAt: now
      });
      await db.wallets.update(newTx.toWalletId, {
        balance: newTo.balance + newTx.amount,
        updatedAt: now
      });
    }

    // --- BƯỚC 3: LƯU RECORD CẬP NHẬT ---
    await db.transactions.put(newTx);

    // Ghi nhớ ví sử dụng gần nhất
    await db.settings.put({
      key: 'last_used_wallet_id',
      value: newTx.walletId
    });
  });
}

/**
 * Xóa giao dịch và HOÀN TÁC (Revert) số dư ví về trạng thái trước đó.
 */
export async function deleteTransaction(id: string): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction('rw', [db.wallets, db.transactions], async () => {
    const tx = await db.transactions.get(id);
    if (!tx) return;

    // Hoàn tác số dư
    if (tx.type === 'EXPENSE' || tx.type === 'LEND') {
      const wallet = await db.wallets.get(tx.walletId);
      if (wallet) {
        await db.wallets.update(tx.walletId, {
          balance: wallet.balance + tx.amount,
          updatedAt: now
        });
      }
    } else if (tx.type === 'INCOME' || tx.type === 'BORROW') {
      const wallet = await db.wallets.get(tx.walletId);
      if (wallet) {
        await db.wallets.update(tx.walletId, {
          balance: wallet.balance - tx.amount,
          updatedAt: now
        });
      }
    } else if (tx.type === 'TRANSFER' && tx.toWalletId) {
      const fromWallet = await db.wallets.get(tx.walletId);
      const toWallet = await db.wallets.get(tx.toWalletId);
      if (fromWallet) {
        await db.wallets.update(tx.walletId, {
          balance: fromWallet.balance + tx.amount,
          updatedAt: now
        });
      }
      if (toWallet) {
        await db.wallets.update(tx.toWalletId, {
          balance: toWallet.balance - tx.amount,
          updatedAt: now
        });
      }
    }

    // Xóa record
    await db.transactions.delete(id);
  });

  // Ghi nhận tombstone cho hệ thống đồng bộ
  await recordDeletedEntity('transaction', id);
}

/**
 * Chuyển tiền nội bộ giữa 2 ví chuẩn ACID Atomic
 * - Giảm số dư ví gửi (fromWallet)
 * - Tăng số dư ví nhận (toWallet)
 * - Ghi nhận 1 bản ghi giao dịch loại TRANSFER
 * - Giao dịch TRANSFER tuyệt đối không ảnh hưởng đến tổng thu/chi của tháng
 */
export async function transferFunds(params: {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  date: string;
  time: string;
  note?: string;
}): Promise<string> {
  const { fromWalletId, toWalletId, amount, date, time, note } = params;
  if (!fromWalletId || !toWalletId) {
    throw new Error('Vui lòng chọn đầy đủ ví gửi và ví nhận');
  }
  if (fromWalletId === toWalletId) {
    throw new Error('Ví gửi và ví nhận không được trùng nhau');
  }
  if (amount <= 0) {
    throw new Error('Số tiền chuyển phải lớn hơn 0');
  }

  const id = generateUUID();
  const now = new Date().toISOString();

  await db.transaction('rw', [db.wallets, db.transactions, db.settings], async () => {
    const fromWallet = await db.wallets.get(fromWalletId);
    const toWallet = await db.wallets.get(toWalletId);
    if (!fromWallet) throw new Error('Ví gửi không tồn tại');
    if (!toWallet) throw new Error('Ví nhận không tồn tại');

    // Cập nhật số dư 2 ví
    await db.wallets.update(fromWalletId, {
      balance: fromWallet.balance - amount,
      updatedAt: now
    });
    await db.wallets.update(toWalletId, {
      balance: toWallet.balance + amount,
      updatedAt: now
    });

    // Thêm bản ghi giao dịch TRANSFER
    await db.transactions.add({
      id,
      walletId: fromWalletId,
      toWalletId,
      type: 'TRANSFER',
      amount,
      date,
      time,
      note: note?.trim() || `Chuyển tiền từ ${fromWallet.name} sang ${toWallet.name}`,
      createdAt: now,
      updatedAt: now
    });

    // Lưu ví gửi gần nhất vào settings
    await db.settings.put({
      key: 'last_used_wallet_id',
      value: fromWalletId
    });
  });

  return id;
}

/**
 * Điều chỉnh số dư thực tế của một ví:
 * - Cập nhật số dư ví thành số tiền thực tế
 * - Nếu autoCreateAdjustmentTx = true và có chênh lệch, tự động tạo 1 giao dịch
 *   với categoryId: 'system_adjustment' (Danh mục hệ thống "Điều chỉnh số dư")
 */
export async function adjustWalletBalance(params: {
  walletId: string;
  newBalance: number;
  autoCreateAdjustmentTx: boolean;
  date?: string;
  time?: string;
}): Promise<void> {
  const { walletId, newBalance, autoCreateAdjustmentTx, date, time } = params;
  const now = new Date().toISOString();

  await db.transaction('rw', [db.wallets, db.transactions, db.categories], async () => {
    const wallet = await db.wallets.get(walletId);
    if (!wallet) throw new Error('Ví không tồn tại');

    const oldBalance = wallet.balance;
    const diff = newBalance - oldBalance;

    // 1. Cập nhật số dư ví
    await db.wallets.update(walletId, {
      balance: newBalance,
      updatedAt: now
    });

    // 2. Tạo giao dịch thu/chi chênh lệch nếu có tùy chọn
    if (autoCreateAdjustmentTx && diff !== 0) {
      const type = diff > 0 ? 'INCOME' : 'EXPENSE';
      const absAmount = Math.abs(diff);

      // Đảm bảo danh mục hệ thống 'system_adjustment' tồn tại trong DB
      const sysCat = await db.categories.get(SYSTEM_ADJUSTMENT_CATEGORY_ID);
      if (!sysCat) {
        await db.categories.put({
          id: SYSTEM_ADJUSTMENT_CATEGORY_ID,
          name: 'Điều chỉnh số dư',
          type,
          icon: 'SlidersHorizontal',
          color: '#64748B',
          isDefault: true,
          createdAt: now,
          updatedAt: now
        });
      }

      const d = date || now.split('T')[0];
      const t = time || now.split('T')[1].substring(0, 5);

      await db.transactions.add({
        id: generateUUID(),
        walletId,
        categoryId: SYSTEM_ADJUSTMENT_CATEGORY_ID,
        type,
        amount: absAmount,
        date: d,
        time: t,
        note: `Điều chỉnh số dư ví "${wallet.name}" (${diff > 0 ? '+' : '-'}${new Intl.NumberFormat('vi-VN').format(absAmount)} ₫)`,
        createdAt: now,
        updatedAt: now
      });
    }
  });
}
