// src/services/transactionService.ts
import { db } from '../db';
import type { Transaction, RecurringFrequency, Wallet, WalletType, GoldDetails } from '../types';
import { generateUUID } from '../utils/uuid';
import { recordDeletedEntity } from './syncService';
import { getCurrentDate, getCurrentTime } from '../utils/formatters';

export const SYSTEM_ADJUSTMENT_CATEGORY_ID = 'system_adjustment';

/**
 * Sắp xếp danh sách ví theo thứ tự `order` tùy chỉnh của người dùng
 */
export function sortWallets(wallets: Wallet[]): Wallet[] {
  return [...wallets].sort((a, b) => {
    const orderA = typeof a.order === 'number' ? a.order : 999999;
    const orderB = typeof b.order === 'number' ? b.order : 999999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}

/**
 * Cập nhật thứ tự sắp xếp của toàn bộ danh sách ví vào IndexedDB
 */
export async function reorderWallets(walletIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.wallets, async () => {
    for (let i = 0; i < walletIds.length; i++) {
      await db.wallets.update(walletIds[i], {
        order: i,
        updatedAt: now
      });
    }
  });
}

/**
 * Di chuyển vị trí của 1 ví (Lên, Xuống, hoặc Đưa lên đầu danh sách)
 */
export async function moveWalletPosition(
  walletId: string,
  direction: 'UP' | 'DOWN' | 'TOP'
): Promise<void> {
  const allWallets = await db.wallets.toArray();
  const sorted = sortWallets(allWallets);
  const currentIndex = sorted.findIndex((w) => w.id === walletId);
  if (currentIndex === -1) return;

  const newSorted = [...sorted];
  if (direction === 'TOP') {
    if (currentIndex === 0) return;
    const [target] = newSorted.splice(currentIndex, 1);
    newSorted.unshift(target);
  } else if (direction === 'UP') {
    if (currentIndex === 0) return;
    const temp = newSorted[currentIndex];
    newSorted[currentIndex] = newSorted[currentIndex - 1];
    newSorted[currentIndex - 1] = temp;
  } else if (direction === 'DOWN') {
    if (currentIndex >= newSorted.length - 1) return;
    const temp = newSorted[currentIndex];
    newSorted[currentIndex] = newSorted[currentIndex + 1];
    newSorted[currentIndex + 1] = temp;
  }

  await reorderWallets(newSorted.map((w) => w.id));
}

/**
 * Tạo tài khoản / ví mới và lưu vào IndexedDB
 */
export async function createWallet(params: {
  name: string;
  type: WalletType;
  initialBalance: number;
  icon: string;
  color: string;
  isExcludedFromTotal?: boolean;
  order?: number;
  goldDetails?: GoldDetails;
}): Promise<Wallet> {
  const now = new Date().toISOString();
  const count = await db.wallets.count();
  const newWallet: Wallet = {
    id: generateUUID(),
    name: params.name.trim(),
    type: params.type,
    balance: params.initialBalance,
    initialBalance: params.initialBalance,
    currency: 'VND',
    icon: params.icon || 'Wallet',
    color: params.color || '#10B981',
    isExcludedFromTotal: Boolean(params.isExcludedFromTotal),
    order: typeof params.order === 'number' ? params.order : count,
    goldDetails: params.goldDetails,
    createdAt: now,
    updatedAt: now
  };
  await db.wallets.add(newWallet);
  return newWallet;
}

/**
 * Xóa tài khoản / ví nếu chưa phát sinh giao dịch nào
 */
export async function deleteWallet(walletId: string): Promise<void> {
  const txCount = await db.transactions
    .filter((tx) => tx.walletId === walletId || tx.toWalletId === walletId)
    .count();

  if (txCount > 0) {
    throw new Error(
      `Không thể xóa tài khoản này vì đang có ${txCount} giao dịch liên quan. Hãy xóa hoặc chuyển các giao dịch sang ví khác trước.`
    );
  }

  await db.wallets.delete(walletId);
  await recordDeletedEntity('wallet', walletId);
}

function isOutflowType(type: Transaction['type']): boolean {
  return type === 'EXPENSE' || type === 'LEND' || type === 'PAY_DEBT';
}

function isInflowType(type: Transaction['type']): boolean {
  return type === 'INCOME' || type === 'BORROW' || type === 'COLLECT_DEBT';
}

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
    if (isOutflowType(newTx.type)) {
      const wallet = await db.wallets.get(newTx.walletId);
      if (!wallet) throw new Error(`Ví ${newTx.walletId} không tồn tại`);
      await db.wallets.update(newTx.walletId, {
        balance: wallet.balance - newTx.amount,
        updatedAt: createdAt
      });
    } else if (isInflowType(newTx.type)) {
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

      const fee = newTx.transferFee || 0;
      await db.wallets.update(newTx.walletId, {
        balance: fromWallet.balance - newTx.amount - fee,
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
    if (isOutflowType(oldTx.type)) {
      const oldWallet = await db.wallets.get(oldTx.walletId);
      if (oldWallet) {
        await db.wallets.update(oldTx.walletId, {
          balance: oldWallet.balance + oldTx.amount, // Hoàn trả tiền vào ví cũ
          updatedAt: now
        });
      }
    } else if (isInflowType(oldTx.type)) {
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
      const oldFee = oldTx.transferFee || 0;
      if (oldFrom) {
        await db.wallets.update(oldTx.walletId, {
          balance: oldFrom.balance + oldTx.amount + oldFee, // Trả lại tiền + phí cho ví gửi cũ
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

    if (isOutflowType(newTx.type)) {
      const newWallet = await db.wallets.get(newTx.walletId);
      if (!newWallet) throw new Error(`Ví ${newTx.walletId} không tồn tại`);
      await db.wallets.update(newTx.walletId, {
        balance: newWallet.balance - newTx.amount,
        updatedAt: now
      });
    } else if (isInflowType(newTx.type)) {
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

      const newFee = newTx.transferFee || 0;
      await db.wallets.update(newTx.walletId, {
        balance: newFrom.balance - newTx.amount - newFee,
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
    if (isOutflowType(tx.type)) {
      const wallet = await db.wallets.get(tx.walletId);
      if (wallet) {
        await db.wallets.update(tx.walletId, {
          balance: wallet.balance + tx.amount,
          updatedAt: now
        });
      }
    } else if (isInflowType(tx.type)) {
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
      const fee = tx.transferFee || 0;
      if (fromWallet) {
        await db.wallets.update(tx.walletId, {
          balance: fromWallet.balance + tx.amount + fee,
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
 * - Giảm số dư ví gửi (fromWallet) = amount + transferFee
 * - Tăng số dư ví nhận (toWallet) = amount
 * - Ghi nhận 1 bản ghi giao dịch loại TRANSFER
 */
export async function transferFunds(params: {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  transferFee?: number;
  date: string;
  time: string;
  note?: string;
}): Promise<string> {
  const { fromWalletId, toWalletId, amount, transferFee = 0, date, time, note } = params;
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
      balance: fromWallet.balance - amount - transferFee,
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
      transferFee: transferFee > 0 ? transferFee : undefined,
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
      ...(!autoCreateAdjustmentTx ? { initialBalance: (wallet.initialBalance ?? 0) + diff } : {}),
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

/**
 * Tính ngày chạy tiếp theo của giao dịch định kỳ
 */
export function computeNextRunDate(dateStr: string, frequency: RecurringFrequency): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (frequency === 'DAILY') {
    dt.setDate(dt.getDate() + 1);
  } else if (frequency === 'WEEKLY') {
    dt.setDate(dt.getDate() + 7);
  } else if (frequency === 'MONTHLY') {
    dt.setMonth(dt.getMonth() + 1);
  } else if (frequency === 'YEARLY') {
    dt.setFullYear(dt.getFullYear() + 1);
  }
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/**
 * Tự động kiểm tra và thực thi các mẫu ghi chép định kỳ đã đến hạn (nextRunDate <= today)
 */
export async function processDueRecurringTransactions(): Promise<number> {
  const today = getCurrentDate();
  const nowTime = getCurrentTime();
  const allRecurring = await db.recurringTransactions.toArray();
  // Lọc trong TypeScript theo chuẩn không dùng boolean index
  const dueList = allRecurring.filter((r) => r.isActive && r.nextRunDate <= today);
  if (dueList.length === 0) return 0;

  let executedCount = 0;

  for (const item of dueList) {
    let runDate = item.nextRunDate;
    let safetyCounter = 0;
    // Tạo các giao dịch đến hạn (tối đa 12 kỳ mỗi lần mở app để tránh vòng lặp vô tận nếu quá lâu)
    while (runDate <= today && safetyCounter < 12) {
      safetyCounter++;
      try {
        await createTransaction({
          walletId: item.walletId,
          toWalletId: item.toWalletId,
          categoryId: item.categoryId,
          type: item.type,
          amount: item.amount,
          date: runDate,
          time: nowTime,
          note: item.note ? `[Định kỳ] ${item.note}` : '[Ghi chép định kỳ]',
          recurringId: item.id
        });
        executedCount++;
      } catch (err) {
        console.warn('[Recurring] Bỏ qua kỳ lỗi:', err);
        break;
      }
      runDate = computeNextRunDate(runDate, item.frequency);
    }

    await db.recurringTransactions.update(item.id, {
      lastRunDate: today,
      nextRunDate: runDate,
      updatedAt: new Date().toISOString()
    });
  }

  return executedCount;
}
