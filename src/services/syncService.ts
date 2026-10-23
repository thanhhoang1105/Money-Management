// src/services/syncService.ts
import { db } from '../db';
import type {
  Wallet,
  Category,
  Transaction,
  Budget,
  Setting,
  RecurringTransaction,
  EventTrip,
  SyncDataPayload,
  DeletedEntitiesTracking
} from '../types';

const DELETED_ENTITIES_SETTING_KEY = 'sync_deleted_entities';

/**
 * Lấy danh sách các thực thể đã xóa (Tombstone Tracking) từ IndexedDB settings
 */
export async function getDeletedEntities(): Promise<DeletedEntitiesTracking> {
  const setting = await db.settings.get(DELETED_ENTITIES_SETTING_KEY);
  if (setting?.value && typeof setting.value === 'object') {
    return {
      transactionIds: Array.isArray(setting.value.transactionIds) ? setting.value.transactionIds : [],
      walletIds: Array.isArray(setting.value.walletIds) ? setting.value.walletIds : [],
      categoryIds: Array.isArray(setting.value.categoryIds) ? setting.value.categoryIds : [],
      budgetIds: Array.isArray(setting.value.budgetIds) ? setting.value.budgetIds : []
    };
  }

  return {
    transactionIds: [],
    walletIds: [],
    categoryIds: [],
    budgetIds: []
  };
}

/**
 * Ghi nhận một thực thể đã bị xóa để tránh việc thiết bị khác "hồi sinh" bản ghi này khi đồng bộ
 */
export async function recordDeletedEntity(
  type: 'transaction' | 'wallet' | 'category' | 'budget',
  id: string
): Promise<void> {
  try {
    const current = await getDeletedEntities();
    const keyMap = {
      transaction: 'transactionIds',
      wallet: 'walletIds',
      category: 'categoryIds',
      budget: 'budgetIds'
    } as const;

    const listKey = keyMap[type];
    if (!current[listKey].includes(id)) {
      current[listKey].push(id);
      await db.settings.put({
        key: DELETED_ENTITIES_SETTING_KEY,
        value: current
      });
    }
  } catch (err) {
    console.error('Lỗi khi ghi nhận thực thể đã xóa cho đồng bộ:', err);
  }
}

/**
 * Xóa danh sách tombstone sau khi đồng bộ thành công hoặc dọn dẹp định kỳ
 */
export async function clearDeletedEntities(): Promise<void> {
  await db.settings.delete(DELETED_ENTITIES_SETTING_KEY);
}

/**
 * Thu thập toàn bộ dữ liệu hiện tại của máy để chuẩn bị payload đồng bộ
 */
export async function getLocalSyncPayload(): Promise<SyncDataPayload> {
  const [wallets, categories, transactions, budgets, settings, recurringTransactions, events, deletedIds] =
    await Promise.all([
      db.wallets.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.settings.toArray(),
      db.recurringTransactions.toArray(),
      db.events.toArray(),
      getDeletedEntities()
    ]);

  return {
    version: '3.0',
    appName: 'SoThuChi',
    syncedAt: new Date().toISOString(),
    data: {
      wallets,
      categories,
      transactions,
      budgets,
      settings: settings.filter((s) => s.key !== 'google_access_token' && s.key !== DELETED_ENTITIES_SETTING_KEY),
      recurringTransactions,
      events
    },
    deletedIds
  };
}

/**
 * Tính toán lại số dư ví chính xác theo số dư khởi tạo (initialBalance) và các giao dịch phát sinh
 */
export function recalculateWalletBalances(
  wallets: Wallet[],
  transactions: Transaction[]
): Wallet[] {
  const balanceMap = new Map<string, number>();

  wallets.forEach((w) => {
    balanceMap.set(w.id, typeof w.initialBalance === 'number' ? w.initialBalance : w.balance);
  });

  transactions.forEach((tx) => {
    if (tx.type === 'EXPENSE' || tx.type === 'LEND' || tx.type === 'PAY_DEBT') {
      const current = balanceMap.get(tx.walletId) ?? 0;
      balanceMap.set(tx.walletId, current - tx.amount);
    } else if (tx.type === 'INCOME' || tx.type === 'BORROW' || tx.type === 'COLLECT_DEBT') {
      const current = balanceMap.get(tx.walletId) ?? 0;
      balanceMap.set(tx.walletId, current + tx.amount);
    } else if (tx.type === 'TRANSFER' && tx.toWalletId) {
      const fee = tx.transferFee || 0;
      const fromCurr = balanceMap.get(tx.walletId) ?? 0;
      balanceMap.set(tx.walletId, fromCurr - tx.amount - fee);

      const toCurr = balanceMap.get(tx.toWalletId) ?? 0;
      balanceMap.set(tx.toWalletId, toCurr + tx.amount);
    }
  });

  const now = new Date().toISOString();
  return wallets.map((w) => ({
    ...w,
    balance: balanceMap.get(w.id) ?? w.balance,
    updatedAt: now
  }));
}

/**
 * THUẬT TOÁN HỢP NHẤT DỮ LIỆU 2 CHIỀU (Two-Way Smart Merge)
 * Hợp nhất thông minh giữa dữ liệu máy hiện tại (local) và dữ liệu tải về từ Google Drive (remote)
 */
export function mergeTwoWayData(
  localPayload: SyncDataPayload,
  remotePayload: SyncDataPayload
): {
  mergedPayload: SyncDataPayload;
  changes: {
    addedTransactions: number;
    updatedTransactions: number;
    deletedTransactions: number;
  };
} {
  // 1. Hợp nhất danh sách ID đã xóa (Tombstones) từ cả 2 bên
  const localDeleted = localPayload.deletedIds || {
    transactionIds: [],
    walletIds: [],
    categoryIds: [],
    budgetIds: []
  };
  const remoteDeleted = remotePayload.deletedIds || {
    transactionIds: [],
    walletIds: [],
    categoryIds: [],
    budgetIds: []
  };

  const allDeletedTxIds = new Set([...localDeleted.transactionIds, ...remoteDeleted.transactionIds]);
  const allDeletedWalletIds = new Set([...localDeleted.walletIds, ...remoteDeleted.walletIds]);
  const allDeletedCatIds = new Set([...localDeleted.categoryIds, ...remoteDeleted.categoryIds]);
  const allDeletedBudgetIds = new Set([...localDeleted.budgetIds, ...remoteDeleted.budgetIds]);

  let addedTxCount = 0;
  let updatedTxCount = 0;
  let deletedTxCount = 0;

  // 2. HỢP NHẤT GIAO DỊCH (Transactions)
  const localTxMap = new Map<string, Transaction>(localPayload.data.transactions.map((t) => [t.id, t]));
  const remoteTxMap = new Map<string, Transaction>(remotePayload.data.transactions.map((t) => [t.id, t]));
  const mergedTxMap = new Map<string, Transaction>();

  // Duyệt các transaction từ Remote
  for (const [id, remoteTx] of remoteTxMap.entries()) {
    if (allDeletedTxIds.has(id)) {
      deletedTxCount++;
      continue;
    }

    const localTx = localTxMap.get(id);
    if (!localTx) {
      mergedTxMap.set(id, remoteTx);
      addedTxCount++;
    } else {
      const localTime = localTx.updatedAt || localTx.createdAt;
      const remoteTime = remoteTx.updatedAt || remoteTx.createdAt;

      if (remoteTime > localTime) {
        mergedTxMap.set(id, remoteTx);
        updatedTxCount++;
      } else {
        mergedTxMap.set(id, localTx);
      }
    }
  }

  for (const [id, localTx] of localTxMap.entries()) {
    if (allDeletedTxIds.has(id)) {
      continue;
    }
    if (!mergedTxMap.has(id)) {
      mergedTxMap.set(id, localTx);
    }
  }

  const mergedTransactions = Array.from(mergedTxMap.values());

  // 3. HỢP NHẤT DANH MỤC (Categories)
  const localCatMap = new Map<string, Category>(localPayload.data.categories.map((c) => [c.id, c]));
  const remoteCatMap = new Map<string, Category>(remotePayload.data.categories.map((c) => [c.id, c]));
  const mergedCatMap = new Map<string, Category>();

  for (const [id, remoteCat] of remoteCatMap.entries()) {
    if (allDeletedCatIds.has(id)) continue;

    const localCat = localCatMap.get(id);
    if (!localCat) {
      mergedCatMap.set(id, remoteCat);
    } else {
      const localTime = localCat.updatedAt || localCat.createdAt;
      const remoteTime = remoteCat.updatedAt || remoteCat.createdAt;
      const chosen = remoteTime > localTime ? { ...remoteCat } : { ...localCat };

      if (localCat.isStarred || remoteCat.isStarred) {
        chosen.isStarred = true;
      }

      const tags = new Set([...(localCat.quickTags || []), ...(remoteCat.quickTags || [])]);
      chosen.quickTags = Array.from(tags);

      mergedCatMap.set(id, chosen);
    }
  }

  for (const [id, localCat] of localCatMap.entries()) {
    if (!allDeletedCatIds.has(id) && !mergedCatMap.has(id)) {
      mergedCatMap.set(id, localCat);
    }
  }

  const mergedCategories = Array.from(mergedCatMap.values());

  // 4. HỢP NHẤT VÍ TIỀN (Wallets)
  const localWalletMap = new Map<string, Wallet>(localPayload.data.wallets.map((w) => [w.id, w]));
  const remoteWalletMap = new Map<string, Wallet>(remotePayload.data.wallets.map((w) => [w.id, w]));
  const mergedWalletMap = new Map<string, Wallet>();

  for (const [id, remoteWallet] of remoteWalletMap.entries()) {
    if (allDeletedWalletIds.has(id)) continue;

    const localWallet = localWalletMap.get(id);
    if (!localWallet) {
      mergedWalletMap.set(id, remoteWallet);
    } else {
      const localTime = localWallet.updatedAt || localWallet.createdAt;
      const remoteTime = remoteWallet.updatedAt || remoteWallet.createdAt;
      mergedWalletMap.set(id, remoteTime > localTime ? remoteWallet : localWallet);
    }
  }

  for (const [id, localWallet] of localWalletMap.entries()) {
    if (!allDeletedWalletIds.has(id) && !mergedWalletMap.has(id)) {
      mergedWalletMap.set(id, localWallet);
    }
  }

  const rawMergedWallets = Array.from(mergedWalletMap.values());
  const finalMergedWallets = recalculateWalletBalances(rawMergedWallets, mergedTransactions);

  // 5. HỢP NHẤT HẠN MỨC (Budgets)
  const localBudgetMap = new Map<string, Budget>(localPayload.data.budgets.map((b) => [b.id, b]));
  const remoteBudgetMap = new Map<string, Budget>(remotePayload.data.budgets.map((b) => [b.id, b]));
  const mergedBudgetMap = new Map<string, Budget>();

  for (const [id, remoteBudget] of remoteBudgetMap.entries()) {
    if (allDeletedBudgetIds.has(id)) continue;
    const localBudget = localBudgetMap.get(id);
    if (!localBudget) {
      mergedBudgetMap.set(id, remoteBudget);
    } else {
      mergedBudgetMap.set(id, remoteBudget.createdAt > localBudget.createdAt ? remoteBudget : localBudget);
    }
  }

  for (const [id, localBudget] of localBudgetMap.entries()) {
    if (!allDeletedBudgetIds.has(id) && !mergedBudgetMap.has(id)) {
      mergedBudgetMap.set(id, localBudget);
    }
  }

  const mergedBudgets = Array.from(mergedBudgetMap.values());

  // 6. HỢP NHẤT GHI CHÉP ĐỊNH KỲ & SỰ KIỆN
  const mergedRecurringMap = new Map<string, RecurringTransaction>();
  (remotePayload.data.recurringTransactions || []).forEach((r) => mergedRecurringMap.set(r.id, r));
  (localPayload.data.recurringTransactions || []).forEach((r) => {
    const existing = mergedRecurringMap.get(r.id);
    if (!existing || (r.updatedAt || r.createdAt) >= (existing.updatedAt || existing.createdAt)) {
      mergedRecurringMap.set(r.id, r);
    }
  });

  const mergedEventsMap = new Map<string, EventTrip>();
  (remotePayload.data.events || []).forEach((ev) => mergedEventsMap.set(ev.id, ev));
  (localPayload.data.events || []).forEach((ev) => {
    const existing = mergedEventsMap.get(ev.id);
    if (!existing || (ev.updatedAt || ev.createdAt) >= (existing.updatedAt || existing.createdAt)) {
      mergedEventsMap.set(ev.id, ev);
    }
  });

  // 7. HỢP NHẤT CÀI ĐẶT (Settings)
  const mergedSettingsMap = new Map<string, Setting>();
  (remotePayload.data.settings || []).forEach((s) => {
    if (s.key !== 'google_client_id' && s.key !== 'google_drive_user') {
      mergedSettingsMap.set(s.key, s);
    }
  });
  (localPayload.data.settings || []).forEach((s) => {
    mergedSettingsMap.set(s.key, s);
  });

  const mergedSettings = Array.from(mergedSettingsMap.values());

  const nowIso = new Date().toISOString();

  const mergedPayload: SyncDataPayload = {
    version: '3.0',
    appName: 'SoThuChi',
    syncedAt: nowIso,
    data: {
      wallets: finalMergedWallets,
      categories: mergedCategories,
      transactions: mergedTransactions,
      budgets: mergedBudgets,
      settings: mergedSettings,
      recurringTransactions: Array.from(mergedRecurringMap.values()),
      events: Array.from(mergedEventsMap.values())
    },
    deletedIds: {
      transactionIds: Array.from(allDeletedTxIds),
      walletIds: Array.from(allDeletedWalletIds),
      categoryIds: Array.from(allDeletedCatIds),
      budgetIds: Array.from(allDeletedBudgetIds)
    }
  };

  return {
    mergedPayload,
    changes: {
      addedTransactions: addedTxCount,
      updatedTransactions: updatedTxCount,
      deletedTransactions: deletedTxCount
    }
  };
}

/**
 * Ghi toàn bộ dữ liệu đã hợp nhất vào IndexedDB trong 1 Transaction nguyên tử duy nhất (ACID)
 */
export async function applyMergedDataToIndexedDB(mergedPayload: SyncDataPayload): Promise<void> {
  const {
    wallets,
    categories,
    transactions,
    budgets,
    settings,
    recurringTransactions = [],
    events = []
  } = mergedPayload.data;
  const deletedIds = mergedPayload.deletedIds;

  await db.transaction(
    'rw',
    [
      db.wallets,
      db.categories,
      db.transactions,
      db.budgets,
      db.settings,
      db.recurringTransactions,
      db.events
    ],
    async () => {
      if (deletedIds?.transactionIds?.length) {
        await db.transactions.bulkDelete(deletedIds.transactionIds);
      }
      if (deletedIds?.walletIds?.length) {
        await db.wallets.bulkDelete(deletedIds.walletIds);
      }
      if (deletedIds?.categoryIds?.length) {
        await db.categories.bulkDelete(deletedIds.categoryIds);
      }
      if (deletedIds?.budgetIds?.length) {
        await db.budgets.bulkDelete(deletedIds.budgetIds);
      }

      if (wallets.length > 0) await db.wallets.bulkPut(wallets);
      if (categories.length > 0) await db.categories.bulkPut(categories);
      if (transactions.length > 0) await db.transactions.bulkPut(transactions);
      if (budgets.length > 0) await db.budgets.bulkPut(budgets);
      if (recurringTransactions.length > 0) await db.recurringTransactions.bulkPut(recurringTransactions);
      if (events.length > 0) await db.events.bulkPut(events);

      for (const s of settings) {
        await db.settings.put(s);
      }

      if (deletedIds) {
        await db.settings.put({
          key: DELETED_ENTITIES_SETTING_KEY,
          value: deletedIds
        });
      }
    }
  );
}
