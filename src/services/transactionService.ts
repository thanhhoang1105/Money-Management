// src/services/transactionService.ts
import { db } from '../db';
import type { Transaction } from '../types';

/**
 * Thêm giao dịch mới và tự động cập nhật số dư ví trong 1 ACID Transaction.
 */
export async function createTransaction(
  data: Omit<Transaction, 'id' | 'createdAt'>
): Promise<string> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const newTx: Transaction = { ...data, id, createdAt };

  await db.transaction('rw', [db.wallets, db.transactions], async () => {
    // 1. Cập nhật số dư ví
    if (newTx.type === 'EXPENSE') {
      const wallet = await db.wallets.get(newTx.walletId);
      if (!wallet) throw new Error(`Ví ${newTx.walletId} không tồn tại`);
      await db.wallets.update(newTx.walletId, {
        balance: wallet.balance - newTx.amount,
        updatedAt: createdAt
      });
    } else if (newTx.type === 'INCOME') {
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

  await db.transaction('rw', [db.wallets, db.transactions], async () => {
    const oldTx = await db.transactions.get(id);
    if (!oldTx) throw new Error(`Giao dịch ${id} không tồn tại`);

    // --- BƯỚC 1: HOÀN TÁC (REVERT) TÁC ĐỘNG CỦA GIAO DỊCH CŨ ---
    if (oldTx.type === 'EXPENSE') {
      const oldWallet = await db.wallets.get(oldTx.walletId);
      if (oldWallet) {
        await db.wallets.update(oldTx.walletId, {
          balance: oldWallet.balance + oldTx.amount, // Hoàn trả tiền vào ví
          updatedAt: now
        });
      }
    } else if (oldTx.type === 'INCOME') {
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
      ...updates
    };

    if (newTx.type === 'EXPENSE') {
      const newWallet = await db.wallets.get(newTx.walletId);
      if (!newWallet) throw new Error(`Ví ${newTx.walletId} không tồn tại`);
      await db.wallets.update(newTx.walletId, {
        balance: newWallet.balance - newTx.amount,
        updatedAt: now
      });
    } else if (newTx.type === 'INCOME') {
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
    if (tx.type === 'EXPENSE') {
      const wallet = await db.wallets.get(tx.walletId);
      if (wallet) {
        await db.wallets.update(tx.walletId, {
          balance: wallet.balance + tx.amount,
          updatedAt: now
        });
      }
    } else if (tx.type === 'INCOME') {
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
}
