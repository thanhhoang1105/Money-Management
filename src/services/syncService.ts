// src/services/syncService.ts
import { db, runWithoutDirtyTracking, markLocalDataChanged } from '../db';
import {
  SEED_CATEGORIES,
  PARENT_MUST_HAVE_ID,
  PARENT_NICE_TO_HAVE_ID,
  PARENT_WASTED_ID,
  GRAB_FEE_CAT_ID
} from '../db/seed';
import { generateUUID } from '../utils/uuid';
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
      markLocalDataChanged();
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
  const [
    wallets,
    categories,
    transactions,
    budgets,
    settings,
    recurringTransactions,
    events,
    deletedIds,
    pinSetting,
    questionSetting,
    answerSetting
  ] = await Promise.all([
    db.wallets.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.budgets.toArray(),
    db.settings.toArray(),
    db.recurringTransactions.toArray(),
    db.events.toArray(),
    getDeletedEntities(),
    db.settings.get('supabase_pin_hash'),
    db.settings.get('supabase_recovery_question'),
    db.settings.get('supabase_recovery_answer_hash')
  ]);

  const security = pinSetting?.value
    ? {
        pinHash: String(pinSetting.value),
        recoveryQuestion: questionSetting?.value ? String(questionSetting.value) : undefined,
        recoveryAnswerHash: answerSetting?.value ? String(answerSetting.value) : undefined,
        updatedAt: new Date().toISOString()
      }
    : undefined;

  return {
    version: '3.0',
    appName: 'SoThuChi',
    syncedAt: new Date().toISOString(),
    security,
    data: {
      wallets,
      categories,
      transactions,
      budgets,
      settings: settings.filter((s) => s.key !== DELETED_ENTITIES_SETTING_KEY),
      recurringTransactions,
      events
    },
    deletedIds
  };
}

/**
 * Tính toán lại số dư ví chính xác theo số dư khởi tạo (initialBalance) và các giao dịch phát sinh.
 * Tự động hiệu chỉnh initialBalance chuẩn xác theo lịch sử giao dịch để bảo toàn số dư thực tế,
 * ngăn chặn tình trạng số dư bị nhảy loạn sau mỗi lần đồng bộ 3 giây.
 */
export function recalculateWalletBalances(
  wallets: Wallet[],
  transactions: Transaction[]
): Wallet[] {
  const txDeltaMap = new Map<string, number>();

  transactions.forEach((tx) => {
    if (tx.type === 'EXPENSE' || tx.type === 'LEND' || tx.type === 'PAY_DEBT') {
      const current = txDeltaMap.get(tx.walletId) ?? 0;
      txDeltaMap.set(tx.walletId, current - tx.amount);
    } else if (tx.type === 'INCOME' || tx.type === 'BORROW' || tx.type === 'COLLECT_DEBT') {
      const current = txDeltaMap.get(tx.walletId) ?? 0;
      txDeltaMap.set(tx.walletId, current + tx.amount);
    } else if (tx.type === 'TRANSFER' && tx.toWalletId) {
      const fee = tx.transferFee || 0;
      const fromCurr = txDeltaMap.get(tx.walletId) ?? 0;
      txDeltaMap.set(tx.walletId, fromCurr - tx.amount - fee);

      const toCurr = txDeltaMap.get(tx.toWalletId) ?? 0;
      txDeltaMap.set(tx.toWalletId, toCurr + tx.amount);
    }
  });

  const now = new Date().toISOString();
  return wallets.map((w) => {
    const txSum = txDeltaMap.get(w.id) ?? 0;

    // Xác định initialBalance:
    // Nếu initialBalance là số hợp lệ: dùng nó. Nếu không, suy ra từ balance: initialBalance = balance - txSum
    let initBal = typeof w.initialBalance === 'number' && !isNaN(w.initialBalance)
      ? w.initialBalance
      : ((typeof w.balance === 'number' ? w.balance : 0) - txSum);

    // Tính toán số dư dựa trên initialBalance + tổng giao dịch
    const calculatedBal = initBal + txSum;

    // Nếu có sự chênh lệch giữa số dư thực tế w.balance và calculatedBal (do từng sửa trực tiếp số dư):
    // Cập nhật lại initialBalance = w.balance - txSum để bảo toàn số dư thực tế w.balance
    let finalBal = calculatedBal;
    let finalInitBal = initBal;

    if (typeof w.balance === 'number' && calculatedBal !== w.balance) {
      finalInitBal = w.balance - txSum;
      finalBal = w.balance;
    }

    return {
      ...w,
      initialBalance: finalInitBal,
      balance: finalBal,
      updatedAt: w.updatedAt || now
    };
  });
}

/**
 * THUẬT TOÁN HỢP NHẤT DỮ LIỆU 2 CHIỀU (Two-Way Smart Merge)
 * Hợp nhất thông minh giữa dữ liệu máy hiện tại (local) và dữ liệu tải về từ Cloud (remote)
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

      chosen.isStarred = remoteTime > localTime ? Boolean(remoteCat.isStarred) : Boolean(localCat.isStarred);
      chosen.order = remoteTime > localTime ? (remoteCat.order ?? localCat.order) : (localCat.order ?? remoteCat.order);

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
  const obsoleteSettingKeys = new Set(['google_client_id', 'google_drive_user', 'google_access_token']);
  const mergedSettingsMap = new Map<string, Setting>();
  (remotePayload.data.settings || []).forEach((s) => {
    if (!obsoleteSettingKeys.has(s.key)) {
      mergedSettingsMap.set(s.key, s);
    }
  });
  (localPayload.data.settings || []).forEach((s) => {
    if (!obsoleteSettingKeys.has(s.key)) {
      mergedSettingsMap.set(s.key, s);
    }
  });

  const mergedSettings = Array.from(mergedSettingsMap.values());

  const nowIso = new Date().toISOString();

  const mergedPayload: SyncDataPayload = {
    version: '3.0',
    appName: 'SoThuChi',
    syncedAt: nowIso,
    security: localPayload.security || remotePayload.security,
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

  const cleanedPayload = deduplicateSyncPayload(mergedPayload);

  return {
    mergedPayload: cleanedPayload,
    changes: {
      addedTransactions: addedTxCount,
      updatedTransactions: updatedTxCount,
      deletedTransactions: deletedTxCount
    }
  };
}

/**
 * DỌN DẸP & CHỐNG TRÙNG LẶP DỮ LIỆU (Deduplication & Category v6 Cleanup)
 * - Gộp các Ví bị trùng tên + cùng loại (VD: 2 ví BIDV, 2 ví Grab, 2 ví Tiền mặt do khác UUID khi khởi tạo ở 2 máy)
 * - Gộp các Hạng mục bị trùng tên + cùng loại + cùng nhóm cha, đồng thời dọn bỏ các mục con EXPENSE mặc định cũ
 * - Ánh xạ lại walletId / categoryId của giao dịch và loại bỏ giao dịch bị nhân đôi trên ví trùng
 */
export function deduplicateSyncPayload(payload: SyncDataPayload): SyncDataPayload {
  const nowIso = new Date().toISOString();
  const rawWallets = payload.data.wallets || [];
  const rawCategories = payload.data.categories || [];
  const rawTransactions = payload.data.transactions || [];
  const rawBudgets = payload.data.budgets || [];
  const rawSettings = payload.data.settings || [];
  const rawRecurring = payload.data.recurringTransactions || [];
  const rawEvents = payload.data.events || [];

  const deletedTxIds = new Set<string>(payload.deletedIds?.transactionIds || []);
  const deletedWalletIds = new Set<string>(payload.deletedIds?.walletIds || []);
  const deletedCatIds = new Set<string>(payload.deletedIds?.categoryIds || []);
  const deletedBudgetIds = new Set<string>(payload.deletedIds?.budgetIds || []);

  // 1. Đếm số lượng giao dịch tham chiếu tới từng Ví để ưu tiên giữ lại Ví chính
  const walletTxCountMap = new Map<string, number>();
  for (const tx of rawTransactions) {
    if (deletedTxIds.has(tx.id)) continue;
    walletTxCountMap.set(tx.walletId, (walletTxCountMap.get(tx.walletId) || 0) + 1);
    if (tx.toWalletId) {
      walletTxCountMap.set(tx.toWalletId, (walletTxCountMap.get(tx.toWalletId) || 0) + 1);
    }
  }

  // Nhóm các ví theo `${type}_${name.trim().toLowerCase()}`
  const walletGroups = new Map<string, Wallet[]>();
  for (const w of rawWallets) {
    if (deletedWalletIds.has(w.id)) continue;
    const key = `${w.type}_${w.name.trim().toLowerCase()}`;
    const list = walletGroups.get(key) || [];
    list.push(w);
    walletGroups.set(key, list);
  }

  const walletIdMap = new Map<string, string>();
  const remappedDuplicateWalletIds = new Set<string>();
  const dedupedWallets: Wallet[] = [];

  for (const group of walletGroups.values()) {
    if (group.length === 1) {
      dedupedWallets.push(group[0]);
      continue;
    }

    // Sắp xếp để chọn ví chính (canonical):
    // Ưu tiên 1: Có nhiều giao dịch hơn
    // Ưu tiên 2: Có số dư hoặc số dư ban đầu khác 0
    // Ưu tiên 3: Có ID chuẩn mặc định hoặc được tạo sớm hơn
    group.sort((a, b) => {
      const txDiff = (walletTxCountMap.get(b.id) || 0) - (walletTxCountMap.get(a.id) || 0);
      if (txDiff !== 0) return txDiff;

      const aNonZero = Math.abs(a.balance || 0) > 0 || Math.abs(a.initialBalance || 0) > 0 ? 1 : 0;
      const bNonZero = Math.abs(b.balance || 0) > 0 || Math.abs(b.initialBalance || 0) > 0 ? 1 : 0;
      if (bNonZero !== aNonZero) return bNonZero - aNonZero;

      const aIsDefaultId = a.id.startsWith('wallet_default_') ? 1 : 0;
      const bIsDefaultId = b.id.startsWith('wallet_default_') ? 1 : 0;
      if (bIsDefaultId !== aIsDefaultId) return bIsDefaultId - aIsDefaultId;

      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    const canonical = { ...group[0] };
    dedupedWallets.push(canonical);

    for (let i = 1; i < group.length; i++) {
      const dup = group[i];
      walletIdMap.set(dup.id, canonical.id);
      remappedDuplicateWalletIds.add(dup.id);
      deletedWalletIds.add(dup.id);
    }
  }

  // 2. DỌN DẸP & GỘP HẠNG MỤC (Categories)
  const allowedDefaultExpenseIds = new Set<string>([
    PARENT_MUST_HAVE_ID,
    PARENT_NICE_TO_HAVE_ID,
    PARENT_WASTED_ID,
    'system_adjustment',
    GRAB_FEE_CAT_ID,
    ...SEED_CATEGORIES.map((s) => s.id).filter(Boolean) as string[]
  ]);

  const categoryIdMap = new Map<string, string>();
  const normalizedCategories: Category[] = [];

  for (const rawCat of rawCategories) {
    if (deletedCatIds.has(rawCat.id)) continue;

    // Loại bỏ các mục con EXPENSE mặc định cũ (chỉ giữ lại 3 cha Must have, Nice to have, Wasted và các mục con do user tự tạo isDefault === false)
    if (
      rawCat.type === 'EXPENSE' &&
      rawCat.isDefault &&
      !allowedDefaultExpenseIds.has(rawCat.id)
    ) {
      const fallbackParentId =
        rawCat.parentId && allowedDefaultExpenseIds.has(rawCat.parentId)
          ? rawCat.parentId
          : PARENT_MUST_HAVE_ID;
      categoryIdMap.set(rawCat.id, fallbackParentId);
      deletedCatIds.add(rawCat.id);
      continue;
    }

    const cat: Category = { ...rawCat };
    if (cat.type === 'INCOME' && cat.name.trim().toLowerCase() === 'lương chính') {
      cat.name = 'Lương';
    }
    if (cat.type === 'INCOME' && cat.name.trim().toLowerCase() === 'thu nhập khác') {
      cat.name = 'Khác';
    }
    if (cat.type === 'DEBT' && cat.parentId) {
      cat.parentId = undefined;
    }

    normalizedCategories.push(cat);
  }

  const catGroups = new Map<string, Category[]>();
  for (const c of normalizedCategories) {
    const key = `${c.type}_${c.name.trim().toLowerCase()}_${c.parentId || ''}`;
    const list = catGroups.get(key) || [];
    list.push(c);
    catGroups.set(key, list);
  }

  const dedupedCategories: Category[] = [];
  for (const group of catGroups.values()) {
    group.sort((a, b) => {
      const aFixed =
        allowedDefaultExpenseIds.has(a.id) ||
        a.id.startsWith('cat_income_') ||
        a.id.startsWith('cat_debt_')
          ? 1
          : 0;
      const bFixed =
        allowedDefaultExpenseIds.has(b.id) ||
        b.id.startsWith('cat_income_') ||
        b.id.startsWith('cat_debt_')
          ? 1
          : 0;
      if (bFixed !== aFixed) return bFixed - aFixed;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    const canonical = { ...group[0] };
    const mergedTags = new Set<string>(canonical.quickTags || []);

    for (let i = 1; i < group.length; i++) {
      const dup = group[i];
      if (dup.isStarred) canonical.isStarred = true;
      (dup.quickTags || []).forEach((t) => mergedTags.add(t));
      categoryIdMap.set(dup.id, canonical.id);
      deletedCatIds.add(dup.id);
    }

    canonical.quickTags = Array.from(mergedTags);
    dedupedCategories.push(canonical);
  }

  // Đảm bảo các hạng mục mặc định chuẩn v6 luôn tồn tại đầy đủ
  const existingCatKeys = new Set(
    dedupedCategories.map((c) => `${c.type}_${c.name.trim().toLowerCase()}_${c.parentId || ''}`)
  );
  const existingCatIds = new Set(dedupedCategories.map((c) => c.id));

  for (const seedItem of SEED_CATEGORIES) {
    const key = `${seedItem.type}_${seedItem.name.trim().toLowerCase()}_${seedItem.parentId || ''}`;
    if (!existingCatKeys.has(key) && (!seedItem.id || !existingCatIds.has(seedItem.id))) {
      const newCat: Category = {
        id: seedItem.id || generateUUID(),
        name: seedItem.name,
        type: seedItem.type,
        parentId: seedItem.parentId,
        icon: seedItem.icon,
        color: seedItem.color,
        quickTags: seedItem.quickTags || [],
        isDefault: true,
        isStarred: !!seedItem.isStarred,
        createdAt: nowIso
      };
      dedupedCategories.push(newCat);
      existingCatKeys.add(key);
      existingCatIds.add(newCat.id);
    }
  }

  if (!existingCatIds.has('system_adjustment')) {
    dedupedCategories.push({
      id: 'system_adjustment',
      name: 'Điều chỉnh số dư',
      type: 'EXPENSE',
      icon: 'SlidersHorizontal',
      color: '#64748B',
      quickTags: ['Khớp tiền thực tế', 'Tiền chênh lệch', 'Kiểm kê'],
      isDefault: true,
      createdAt: nowIso
    });
  }

  // 3. ÁNH XẠ & CHỐNG TRÙNG GIAO DỊCH (Transactions)
  // Sắp xếp giao dịch thuộc ví gốc lên trước, giao dịch thuộc ví trùng xuống sau
  const sortedTransactions = [...rawTransactions].sort((a, b) => {
    const aFromDup = remappedDuplicateWalletIds.has(a.walletId) ? 1 : 0;
    const bFromDup = remappedDuplicateWalletIds.has(b.walletId) ? 1 : 0;
    if (aFromDup !== bFromDup) return aFromDup - bFromDup;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  const seenCanonicalTxSignatures = new Set<string>();
  const seenExactTxSignatures = new Set<string>();
  const dedupedTransactions: Transaction[] = [];

  for (const tx of sortedTransactions) {
    if (deletedTxIds.has(tx.id)) continue;

    const wasFromDuplicateWallet = remappedDuplicateWalletIds.has(tx.walletId);
    const newWalletId = walletIdMap.get(tx.walletId) || tx.walletId;
    const newToWalletId = tx.toWalletId
      ? walletIdMap.get(tx.toWalletId) || tx.toWalletId
      : undefined;
    const newCategoryId = tx.categoryId
      ? categoryIdMap.get(tx.categoryId) || tx.categoryId
      : undefined;

    // Nếu giao dịch đến từ ví bị nhân đôi và là giao dịch điều chỉnh số dư (system_adjustment),
    // bỏ qua để tránh cộng dồn gấp đôi số dư của ví gốc
    if (wasFromDuplicateWallet && newCategoryId === 'system_adjustment') {
      deletedTxIds.add(tx.id);
      continue;
    }

    const looseSig = `${newWalletId}_${newToWalletId || ''}_${tx.type}_${tx.amount}_${tx.date}_${(tx.note || '').trim().toLowerCase()}`;
    const exactSig = `${looseSig}_${newCategoryId || ''}_${tx.createdAt || ''}`;

    if (seenExactTxSignatures.has(exactSig)) {
      deletedTxIds.add(tx.id);
      continue;
    }

    if (wasFromDuplicateWallet && seenCanonicalTxSignatures.has(looseSig)) {
      deletedTxIds.add(tx.id);
      continue;
    }

    seenExactTxSignatures.add(exactSig);
    seenCanonicalTxSignatures.add(looseSig);

    dedupedTransactions.push({
      ...tx,
      walletId: newWalletId,
      toWalletId: newToWalletId,
      categoryId: newCategoryId
    });
  }

  // 4. TÍNH LẠI SỐ DƯ VÍ SAU KHI GỘP
  const finalWallets = recalculateWalletBalances(dedupedWallets, dedupedTransactions);

  // 5. ÁNH XẠ & CHỐNG TRÙNG HẠN MỨC (Budgets)
  const budgetKeyMap = new Map<string, Budget>();
  for (const b of rawBudgets) {
    if (deletedBudgetIds.has(b.id)) continue;
    const mappedCatId = categoryIdMap.get(b.categoryId || '') || b.categoryId;
    const key = `${mappedCatId}_${b.month}`;
    const existing = budgetKeyMap.get(key);
    if (!existing) {
      budgetKeyMap.set(key, { ...b, categoryId: mappedCatId });
    } else {
      deletedBudgetIds.add(b.id);
    }
  }
  const dedupedBudgets = Array.from(budgetKeyMap.values());

  // 6. ÁNH XẠ GHI CHÉP ĐỊNH KỲ
  const dedupedRecurring = rawRecurring.map((r) => ({
    ...r,
    walletId: walletIdMap.get(r.walletId) || r.walletId,
    toWalletId: r.toWalletId ? walletIdMap.get(r.toWalletId) || r.toWalletId : undefined,
    categoryId: r.categoryId ? categoryIdMap.get(r.categoryId) || r.categoryId : r.categoryId
  }));

  return {
    version: '3.0',
    appName: 'SoThuChi',
    syncedAt: nowIso,
    security: payload.security,
    data: {
      wallets: finalWallets,
      categories: dedupedCategories,
      transactions: dedupedTransactions,
      budgets: dedupedBudgets,
      settings: rawSettings,
      recurringTransactions: dedupedRecurring,
      events: rawEvents
    },
    deletedIds: {
      transactionIds: Array.from(deletedTxIds),
      walletIds: Array.from(deletedWalletIds),
      categoryIds: Array.from(deletedCatIds),
      budgetIds: Array.from(deletedBudgetIds)
    }
  };
}

/**
 * Ghi toàn bộ dữ liệu đã hợp nhất vào IndexedDB trong 1 Transaction nguyên tử duy nhất (ACID).
 * Xóa sạch (clear) 6 bảng dữ liệu thực thể trước khi ghi để đảm bảo không bao giờ bị trùng lặp bản ghi cũ ở local.
 */
export async function applyMergedDataToIndexedDB(mergedPayload: SyncDataPayload): Promise<void> {
  const cleanedPayload = deduplicateSyncPayload(mergedPayload);
  const {
    wallets,
    categories,
    transactions,
    budgets,
    settings,
    recurringTransactions = [],
    events = []
  } = cleanedPayload.data;
  const deletedIds = cleanedPayload.deletedIds;

  const protectedSettingKeys = new Set([
    'supabase_url',
    'supabase_anon_key',
    'supabase_sync_key',
    'supabase_user_email',
    'supabase_auto_sync_enabled'
  ]);

  await runWithoutDirtyTracking(async () => {
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
        // Clear toàn bộ dữ liệu thực thể ở local trước khi nạp bản chuẩn đã đồng bộ
        await Promise.all([
          db.wallets.clear(),
          db.categories.clear(),
          db.transactions.clear(),
          db.budgets.clear(),
          db.recurringTransactions.clear(),
          db.events.clear()
        ]);

        if (wallets.length > 0) await db.wallets.bulkPut(wallets);
        if (categories.length > 0) await db.categories.bulkPut(categories);
        if (transactions.length > 0) await db.transactions.bulkPut(transactions);
        if (budgets.length > 0) await db.budgets.bulkPut(budgets);
        if (recurringTransactions.length > 0) {
          await db.recurringTransactions.bulkPut(recurringTransactions);
        }
        if (events.length > 0) await db.events.bulkPut(events);

        for (const s of settings) {
          if (!protectedSettingKeys.has(s.key)) {
            await db.settings.put(s);
          }
        }

        // Đảm bảo đánh dấu đã seed v6 để không chạy lại seed tạo thêm dữ liệu thừa
        await db.settings.put({ key: 'has_seeded_categories_v6', value: true });
        await db.settings.put({ key: 'has_seeded_v3', value: true });

        if (wallets.length > 0) {
          const walletIdSet = new Set(wallets.map((w) => w.id));
          const lastUsedWallet = await db.settings.get('last_used_wallet_id');
          if (
            !lastUsedWallet?.value ||
            typeof lastUsedWallet.value !== 'string' ||
            !walletIdSet.has(lastUsedWallet.value)
          ) {
            await db.settings.put({ key: 'last_used_wallet_id', value: wallets[0].id });
          }
        }

        if (deletedIds) {
          await db.settings.put({
            key: DELETED_ENTITIES_SETTING_KEY,
            value: deletedIds
          });
        }

        if (cleanedPayload.security?.pinHash) {
          await db.settings.put({ key: 'supabase_pin_hash', value: cleanedPayload.security.pinHash });
          if (cleanedPayload.security.recoveryQuestion) {
            await db.settings.put({ key: 'supabase_recovery_question', value: cleanedPayload.security.recoveryQuestion });
          }
          if (cleanedPayload.security.recoveryAnswerHash) {
            await db.settings.put({ key: 'supabase_recovery_answer_hash', value: cleanedPayload.security.recoveryAnswerHash });
          }
        }
      }
    );
  });
}
