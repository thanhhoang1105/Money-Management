// src/services/backupService.ts
import { db, clearLocalDataChanged } from '../db';
import type {
  Wallet,
  Category,
  Transaction,
  Budget,
  Setting,
  RecurringTransaction,
  EventTrip,
  SyncDataPayload
} from '../types';
import { getCurrentDate, getCurrentTime } from '../utils/formatters';
import { getSupabaseConfig, getSupabaseClient } from './supabaseService';
import {
  applyMergedDataToIndexedDB,
  deduplicateSyncPayload,
  clearDeletedEntities
} from './syncService';
import * as XLSX from 'xlsx';
import { ensureStandardizedCategories } from '../db/seed';

export interface FullBackupPayload {
  version: string;
  appName: string;
  exportedAt: string;
  data: {
    wallets: Wallet[];
    categories: Category[];
    transactions: Transaction[];
    budgets: Budget[];
    settings: Setting[];
    recurringTransactions?: RecurringTransaction[];
    events?: EventTrip[];
  };
}

export interface BackupValidationResult {
  isValid: boolean;
  error?: string;
  payload?: FullBackupPayload;
  metadata?: {
    appName: string;
    version: string;
    exportedAt: string;
    walletsCount: number;
    categoriesCount: number;
    transactionsCount: number;
    budgetsCount: number;
    settingsCount: number;
  };
}

/**
 * Xuất toàn bộ dữ liệu từ Dexie IndexedDB thành chuỗi JSON đầy đủ 100% (FR-E-02)
 */
export async function exportFullBackupJSON(): Promise<string> {
  const [wallets, categories, transactions, budgets, settings, recurringTransactions, events] =
    await Promise.all([
      db.wallets.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.settings.toArray(),
      db.recurringTransactions.toArray(),
      db.events.toArray()
    ]);

  const payload: FullBackupPayload = {
    version: '3.0',
    appName: 'SoThuChi',
    exportedAt: new Date().toISOString(),
    data: {
      wallets,
      categories,
      transactions,
      budgets,
      settings,
      recurringTransactions,
      events
    }
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Xác thực cấu trúc file sao lưu JSON trước khi thực hiện khôi phục (FR-E-03 Validation)
 */
export function validateBackupJSON(jsonString: string): BackupValidationResult {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return { isValid: false, error: 'Tệp không phải là định dạng JSON hợp lệ.' };
    }
    if (!parsed.data || typeof parsed.data !== 'object') {
      return { isValid: false, error: 'Thiếu trường dữ liệu data trong tệp sao lưu.' };
    }
    if (!Array.isArray(parsed.data.wallets) || !Array.isArray(parsed.data.categories)) {
      return {
        isValid: false,
        error: 'Cấu trúc dữ liệu không hợp lệ: thiếu danh sách ví hoặc danh mục bắt buộc.'
      };
    }

    return {
      isValid: true,
      payload: parsed,
      metadata: {
        appName: parsed.appName || 'Sổ Thu Chi',
        version: parsed.version || '3.0',
        exportedAt: parsed.exportedAt || 'Không xác định',
        walletsCount: parsed.data.wallets.length,
        categoriesCount: parsed.data.categories.length,
        transactionsCount: Array.isArray(parsed.data.transactions)
          ? parsed.data.transactions.length
          : 0,
        budgetsCount: Array.isArray(parsed.data.budgets) ? parsed.data.budgets.length : 0,
        settingsCount: Array.isArray(parsed.data.settings) ? parsed.data.settings.length : 0
      }
    };
  } catch (err: any) {
    return { isValid: false, error: err?.message || 'Không thể phân tích cú pháp tệp JSON.' };
  }
}

/**
 * Kích hoạt chia sẻ qua Native Web Share API (iOS Tệp, AirDrop, Zalo) hoặc tự động tải về
 */
export async function downloadOrShareFile(
  content: string | ArrayBuffer,
  fileName: string,
  mimeType: string = 'application/json'
): Promise<{ success: boolean; method: 'share' | 'download' }> {
  try {
    const blob = new Blob([content], { type: mimeType });
    const file = new File([blob], fileName, { type: mimeType });

    // 1. Thử dùng navigator.share nếu trình duyệt hỗ trợ file (iOS Safari WebKit)
    if (
      typeof navigator !== 'undefined' &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          title: 'Sao lưu dữ liệu Sổ Thu Chi',
          text: `File sao lưu ngày ${getCurrentDate()}`,
          files: [file]
        });
        return { success: true, method: 'share' };
      } catch (shareErr: any) {
        if (shareErr.name !== 'AbortError') {
          console.warn('navigator.share không hoàn tất, chuyển sang tải trực tiếp:', shareErr);
        }
      }
    }

    // 2. Fallback: Tải file về máy qua Blob URL
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return { success: true, method: 'download' };
  } catch (err: any) {
    console.error('Lỗi tải/chia sẻ file:', err);
    throw new Error('Không thể tải hoặc chia sẻ file sao lưu');
  }
}

/**
 * Khôi phục toàn bộ dữ liệu từ file JSON vào IndexedDB và đồng bộ Cloud (FR-E-03).
 * NGUYÊN TẮC QUAN TRỌNG:
 * Nếu thiết bị đang có kết nối Supabase Cloud:
 * 1. Đẩy toàn bộ payload từ tệp khôi phục lên Supabase Cloud TRƯỚC TIÊN (làm bản gốc mới nhất).
 * 2. Sau đó nạp vào IndexedDB thiết bị thông qua applyMergedDataToIndexedDB (chống xung đột, giữ nguyên config kết nối).
 * 3. Cập nhật last_supabase_sync_time và last_supabase_backup_date đồng bộ với timestamp đẩy Cloud.
 * 4. Xóa sạch tombstone (sync_deleted_entities) và xóa cờ dirty (clearLocalDataChanged).
 * => Ngăn chặn triệt để tình trạng vừa nạp file local xong thì AutoSync lại kéo dữ liệu lỗi/cũ trên Cloud về đè lên!
 */
export async function restoreBackupData(
  jsonString: string,
  options?: { pushToCloudFirst?: boolean }
): Promise<{
  success: boolean;
  message: string;
  counts: { wallets: number; categories: number; transactions: number; budgets: number };
  cloudSynced: boolean;
}> {
  const validation = validateBackupJSON(jsonString);
  if (!validation.isValid || !validation.payload) {
    throw new Error(validation.error || 'Cấu trúc file sao lưu không hợp lệ');
  }

  const {
    wallets,
    categories,
    transactions = [],
    budgets = [],
    settings = [],
    recurringTransactions = [],
    events = []
  } = validation.payload.data;

  const now = new Date().toISOString();
  const shouldPushCloud = options?.pushToCloudFirst !== false;
  let cloudSynced = false;

  const protectedSettingKeys = new Set([
    'supabase_url',
    'supabase_anon_key',
    'supabase_sync_key',
    'supabase_user_email',
    'supabase_auto_sync_enabled'
  ]);

  // Chuẩn hóa payload hợp nhất để đẩy lên Cloud và nạp IndexedDB
  const cleanSyncPayload: SyncDataPayload = deduplicateSyncPayload({
    version: '3.0',
    appName: 'SoThuChi',
    syncedAt: now,
    data: {
      wallets,
      categories,
      transactions,
      budgets,
      settings: settings.filter((s) => !protectedSettingKeys.has(s.key)),
      recurringTransactions,
      events
    },
    deletedIds: {
      transactionIds: [],
      walletIds: [],
      categoryIds: [],
      budgetIds: []
    }
  });

  // 1. Nếu có kết nối Supabase Cloud: ĐẨY LÊN CLOUD TRƯỚC TIÊN để Cloud làm chuẩn gốc
  if (shouldPushCloud) {
    try {
      const { url, anonKey, syncKey, email } = await getSupabaseConfig();
      const client = await getSupabaseClient();
      if (client && syncKey && url && anonKey) {
        const { error } = await client.from('user_backups').upsert(
          {
            sync_key: syncKey,
            user_email: email || syncKey,
            payload: cleanSyncPayload,
            updated_at: now
          },
          { onConflict: 'sync_key' }
        );

        if (error) {
          throw new Error(`Lỗi cập nhật Cloud: ${error.message}`);
        }
        cloudSynced = true;
      }
    } catch (err: any) {
      console.error('[restoreBackupData] Lỗi khi đẩy lên Cloud trước khi khôi phục:', err);
      throw new Error(`Không thể đẩy file lên Cloud trước khi khôi phục: ${err?.message || err}`);
    }
  }

  // 2. Nạp dữ liệu vào IndexedDB máy (dùng applyMergedDataToIndexedDB để bảo vệ config và chạy trong runWithoutDirtyTracking)
  await applyMergedDataToIndexedDB(cleanSyncPayload);
  await ensureStandardizedCategories(true);

  // 3. Cập nhật mốc thời gian đồng bộ trùng khớp với Cloud
  if (cloudSynced) {
    const today = getCurrentDate();
    await db.settings.put({ key: 'last_supabase_backup_date', value: today });
    await db.settings.put({ key: 'last_supabase_sync_time', value: now });
  }

  // 4. Xóa sạch tombstone thực thể đã xóa để không xóa nhầm dữ liệu vừa khôi phục
  await clearDeletedEntities();

  // 5. Xóa sạch cờ dirty để AutoSync không bị kích hoạt ngược lại
  clearLocalDataChanged();

  return {
    success: true,
    message: cloudSynced
      ? 'Đã tải lên Cloud và khôi phục toàn bộ dữ liệu vào thiết bị thành công!'
      : 'Khôi phục toàn bộ dữ liệu vào thiết bị thành công!',
    counts: {
      wallets: wallets.length,
      categories: categories.length,
      transactions: transactions.length,
      budgets: budgets.length
    },
    cloudSynced
  };
}

/**
 * Xuất dữ liệu giao dịch ra file Excel (.xlsx) chuẩn ISO (FR-E-01)
 */
export async function exportTransactionsToExcel(options?: {
  month?: string;
}): Promise<{ fileName: string; transactionCount: number }> {
  const [allTransactions, wallets, categories] = await Promise.all([
    db.transactions.toArray(),
    db.wallets.toArray(),
    db.categories.toArray()
  ]);

  const monthFilter = options?.month;
  const transactions = monthFilter
    ? allTransactions.filter((t) => t.date.startsWith(monthFilter))
    : allTransactions;

  // Sắp xếp ngày mới nhất lên đầu
  transactions.sort((a, b) => b.date.localeCompare(a.date));

  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  // 1. Tính toán số liệu tổng hợp (loại trừ excludeFromReport và Vay nợ khỏi Thu/Chi thuần)
  let totalIncome = 0;
  let totalExpense = 0;
  let transferCount = 0;
  const catExpenseMap: Record<string, number> = {};

  transactions.forEach((t) => {
    if (t.excludeFromReport) return;
    if (t.type === 'INCOME') totalIncome += t.amount;
    if (t.type === 'EXPENSE') {
      totalExpense += t.amount;
      const catName = t.categoryId ? catMap.get(t.categoryId) || 'Chưa phân loại' : 'Khác';
      catExpenseMap[catName] = (catExpenseMap[catName] || 0) + t.amount;
    }
    if (t.type === 'TRANSFER') {
      transferCount++;
      if (t.transferFee && t.transferFee > 0) {
        totalExpense += t.transferFee;
        catExpenseMap['Phí chuyển khoản'] = (catExpenseMap['Phí chuyển khoản'] || 0) + t.transferFee;
      }
    }
  });

  const netSavings = totalIncome - totalExpense;

  // Sheet 1: Bảng tổng hợp dòng tiền (Summary)
  const summaryRows: Array<{ 'CHỈ TIÊU TỔNG HỢP': string; 'GIÁ TRỊ': string | number }> = [
    {
      'CHỈ TIÊU TỔNG HỢP': 'Thời gian báo cáo',
      'GIÁ TRỊ': monthFilter
        ? `Tháng ${parseInt(monthFilter.split('-')[1], 10)}/${monthFilter.split('-')[0]}`
        : 'Toàn bộ thời gian'
    },
    { 'CHỈ TIÊU TỔNG HỢP': 'Ngày xuất file', 'GIÁ TRỊ': `${getCurrentDate()} lúc ${getCurrentTime()}` },
    { 'CHỈ TIÊU TỔNG HỢP': 'Tổng số giao dịch', 'GIÁ TRỊ': transactions.length },
    { 'CHỈ TIÊU TỔNG HỢP': 'Tổng thu nhập thuần (VNĐ)', 'GIÁ TRỊ': totalIncome },
    { 'CHỈ TIÊU TỔNG HỢP': 'Tổng chi tiêu thuần (VNĐ)', 'GIÁ TRỊ': totalExpense },
    { 'CHỈ TIÊU TỔNG HỢP': 'Dòng tiền ròng (Net = Thu - Chi)', 'GIÁ TRỊ': netSavings },
    { 'CHỈ TIÊU TỔNG HỢP': 'Số lượt chuyển ví nội bộ', 'GIÁ TRỊ': transferCount },
    { 'CHỈ TIÊU TỔNG HỢP': '', 'GIÁ TRỊ': '' },
    { 'CHỈ TIÊU TỔNG HỢP': '--- PHÂN BỔ CHI TIÊU THEO HẠNG MỤC ---', 'GIÁ TRỊ': '' }
  ];

  Object.entries(catExpenseMap)
    .sort((a, b) => b[1] - a[1])
    .forEach(([catName, amount]) => {
      const pct = totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(1) : '0';
      summaryRows.push({
        'CHỈ TIÊU TỔNG HỢP': `• ${catName} (${pct}%)`,
        'GIÁ TRỊ': amount
      });
    });

  const getTypeLabel = (type: Transaction['type']) => {
    switch (type) {
      case 'EXPENSE':
        return 'Chi tiền';
      case 'INCOME':
        return 'Thu tiền';
      case 'TRANSFER':
        return 'Chuyển ví';
      case 'LEND':
        return 'Cho vay';
      case 'BORROW':
        return 'Đi vay';
      case 'COLLECT_DEBT':
        return 'Thu nợ';
      case 'PAY_DEBT':
        return 'Trả nợ';
      default:
        return 'Điều chỉnh';
    }
  };

  // Sheet 2: Danh sách chi tiết từng giao dịch
  const txRows = transactions.map((t, idx) => ({
    STT: idx + 1,
    Ngày: t.date,
    Giờ: t.time,
    Loại: getTypeLabel(t.type),
    'Số tiền (VNĐ)': t.amount,
    'Phí CK (VNĐ)': t.transferFee || 0,
    'Hạng mục':
      t.type === 'TRANSFER'
        ? 'Chuyển tiền nội bộ'
        : t.categoryId
        ? catMap.get(t.categoryId) || 'Chưa phân loại'
        : 'Chưa phân loại',
    'Người vay/Chủ nợ': t.contactName || '',
    'Ví nguồn': walletMap.get(t.walletId) || 'Ví không xác định',
    'Ví đích': t.toWalletId ? walletMap.get(t.toWalletId) || '' : '',
    'Ghi chú': t.note || ''
  }));

  // Sheet 3: Danh sách ví và số dư
  const walletRows = wallets.map((w, idx) => ({
    STT: idx + 1,
    'Tên ví': w.name,
    'Loại ví': w.type,
    'Số dư hiện tại (VNĐ)': w.balance,
    'Số dư ban đầu': w.initialBalance,
    'Tính vào tổng tài sản': w.isExcludedFromTotal ? 'Không' : 'Có'
  }));

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  const wsTx = XLSX.utils.json_to_sheet(txRows);
  const wsWallets = XLSX.utils.json_to_sheet(walletRows);

  wsSummary['!cols'] = [{ wch: 45 }, { wch: 25 }];
  wsTx['!cols'] = [
    { wch: 6 },
    { wch: 13 },
    { wch: 8 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 24 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 35 }
  ];
  wsWallets['!cols'] = [
    { wch: 6 },
    { wch: 25 },
    { wch: 15 },
    { wch: 22 },
    { wch: 18 },
    { wch: 24 }
  ];

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Tổng hợp');
  XLSX.utils.book_append_sheet(wb, wsTx, 'Chi tiết giao dịch');
  XLSX.utils.book_append_sheet(wb, wsWallets, 'Tài khoản ví');

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const fileName = monthFilter
    ? `SoThuChi_BaoCao_${monthFilter.replace('-', '_')}.xlsx`
    : `SoThuChi_BaoCao_ToanBo_${getCurrentDate().replace(/-/g, '')}.xlsx`;

  await downloadOrShareFile(
    excelBuffer,
    fileName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  return { fileName, transactionCount: transactions.length };
}

/**
 * Kiểm tra ngầm tự động sao lưu hàng ngày (Auto-Backup Background Check) (FR-E-04)
 */
export async function checkAndRunAutoBackup(options?: {
  force?: boolean;
}): Promise<{ ran: boolean; message: string; fileName?: string }> {
  try {
    if (!options?.force) {
      return { ran: false, message: 'Tự động tải file về máy đã tắt để tránh làm phiền.' };
    }

    const todayStr = getCurrentDate();
    const currentTime = getCurrentTime();

    const jsonStr = await exportFullBackupJSON();
    const dateCompact = todayStr.replace(/-/g, '');
    const timeCompact = currentTime.replace(':', '');
    const fileName = `SoThuChi_Backup_${dateCompact}_${timeCompact}.json`;

    await db.settings.put({
      key: 'last_auto_backup_date',
      value: todayStr
    });

    await downloadOrShareFile(jsonStr, fileName, 'application/json');

    return {
      ran: true,
      message: `Đã xuất file sao lưu dữ liệu ngày ${todayStr} thành công!`,
      fileName
    };
  } catch (err: any) {
    console.error('Lỗi khi sao lưu:', err);
    return { ran: false, message: err?.message || 'Lỗi sao lưu' };
  }
}
