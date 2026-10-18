// src/services/backupService.ts
import { db } from '../db';
import type { Wallet, Category, Transaction, Budget, Setting } from '../types';
import { getCurrentDate, getCurrentTime } from '../utils/formatters';
import * as XLSX from 'xlsx';

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
  const [wallets, categories, transactions, budgets, settings] = await Promise.all([
    db.wallets.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.budgets.toArray(),
    db.settings.toArray()
  ]);

  const payload: FullBackupPayload = {
    version: '2.0',
    appName: 'SoThuChi',
    exportedAt: new Date().toISOString(),
    data: {
      wallets,
      categories,
      transactions,
      budgets,
      settings
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
        version: parsed.version || '2.0',
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
 * Khôi phục toàn bộ dữ liệu từ file JSON vào IndexedDB trong 1 Transaction nguyên tử (FR-E-03)
 */
export async function restoreBackupData(jsonString: string): Promise<{
  success: boolean;
  message: string;
  counts: { wallets: number; categories: number; transactions: number; budgets: number };
}> {
  const validation = validateBackupJSON(jsonString);
  if (!validation.isValid || !validation.payload) {
    throw new Error(validation.error || 'Cấu trúc file sao lưu không hợp lệ');
  }

  const { wallets, categories, transactions = [], budgets = [], settings = [] } =
    validation.payload.data;

  // Ghi đè vào IndexedDB trong 1 Transaction nguyên tử
  await db.transaction(
    'rw',
    [db.wallets, db.categories, db.transactions, db.budgets, db.settings],
    async () => {
      await db.wallets.clear();
      await db.categories.clear();
      await db.transactions.clear();
      await db.budgets.clear();

      if (wallets.length > 0) await db.wallets.bulkPut(wallets);
      if (categories.length > 0) await db.categories.bulkPut(categories);
      if (transactions.length > 0) await db.transactions.bulkPut(transactions);
      if (budgets.length > 0) await db.budgets.bulkPut(budgets);

      for (const s of settings) {
        await db.settings.put(s);
      }
    }
  );

  return {
    success: true,
    message: 'Khôi phục toàn bộ dữ liệu thành công!',
    counts: {
      wallets: wallets.length,
      categories: categories.length,
      transactions: transactions.length,
      budgets: budgets.length
    }
  };
}

/**
 * Xuất dữ liệu giao dịch ra file Excel (.xlsx) chuẩn ISO (FR-E-01)
 * Hỗ trợ xuất theo tháng cụ thể hoặc toàn bộ lịch sử.
 * Bao gồm 3 Sheets:
 * - Sheet 1: Bảng tổng hợp dòng tiền & tỷ trọng danh mục
 * - Sheet 2: Bảng kê chi tiết từng giao dịch kèm ghi chú và ví
 * - Sheet 3: Danh sách các tài khoản ví & số dư
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

  // 1. Tính toán số liệu tổng hợp
  let totalIncome = 0;
  let totalExpense = 0;
  let transferCount = 0;
  const catExpenseMap: Record<string, number> = {};

  transactions.forEach((t) => {
    if (t.type === 'INCOME') totalIncome += t.amount;
    if (t.type === 'EXPENSE') {
      totalExpense += t.amount;
      const catName = t.categoryId ? catMap.get(t.categoryId) || 'Chưa phân loại' : 'Khác';
      catExpenseMap[catName] = (catExpenseMap[catName] || 0) + t.amount;
    }
    if (t.type === 'TRANSFER') transferCount++;
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
    { 'CHỈ TIÊU TỔNG HỢP': 'Tổng thu nhập (VNĐ)', 'GIÁ TRỊ': totalIncome },
    { 'CHỈ TIÊU TỔNG HỢP': 'Tổng chi tiêu (VNĐ)', 'GIÁ TRỊ': totalExpense },
    { 'CHỈ TIÊU TỔNG HỢP': 'Dòng tiền ròng (Net = Thu - Chi)', 'GIÁ TRỊ': netSavings },
    { 'CHỈ TIÊU TỔNG HỢP': 'Số lượt chuyển ví nội bộ', 'GIÁ TRỊ': transferCount },
    { 'CHỈ TIÊU TỔNG HỢP': '', 'GIÁ TRỊ': '' },
    { 'CHỈ TIÊU TỔNG HỢP': '--- PHÂN BỔ CHI TIÊU THEO HẠNG MỤC ---', 'GIÁ TRỊ': '' }
  ];

  // Thêm các hạng mục chi tiêu theo tỷ trọng
  Object.entries(catExpenseMap)
    .sort((a, b) => b[1] - a[1])
    .forEach(([catName, amount]) => {
      const pct = totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(1) : '0';
      summaryRows.push({
        'CHỈ TIÊU TỔNG HỢP': `• ${catName} (${pct}%)`,
        'GIÁ TRỊ': amount
      });
    });

  // Sheet 2: Danh sách chi tiết từng giao dịch
  const txRows = transactions.map((t, idx) => ({
    STT: idx + 1,
    Ngày: t.date,
    Giờ: t.time,
    Loại: t.type === 'EXPENSE' ? 'Chi tiền' : t.type === 'INCOME' ? 'Thu tiền' : 'Chuyển ví',
    'Số tiền (VNĐ)': t.amount,
    'Hạng mục':
      t.type === 'TRANSFER'
        ? 'Chuyển tiền nội bộ'
        : t.categoryId
        ? catMap.get(t.categoryId) || 'Chưa phân loại'
        : 'Chưa phân loại',
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

  // Cấu hình độ rộng cột (Column widths) chống hiển thị ###
  wsSummary['!cols'] = [{ wch: 45 }, { wch: 25 }];
  wsTx['!cols'] = [
    { wch: 6 },
    { wch: 13 },
    { wch: 8 },
    { wch: 12 },
    { wch: 16 },
    { wch: 24 },
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
    const [enabledSetting, timeSetting, lastDateSetting] = await Promise.all([
      db.settings.get('auto_backup_enabled'),
      db.settings.get('auto_backup_time'),
      db.settings.get('last_auto_backup_date')
    ]);

    const isEnabled = enabledSetting ? Boolean(enabledSetting.value) : true;
    if (!isEnabled && !options?.force) {
      return { ran: false, message: 'Tính năng tự động sao lưu đang tắt' };
    }

    const todayStr = getCurrentDate();
    const lastBackupDate = lastDateSetting?.value || '';

    if (lastBackupDate === todayStr && !options?.force) {
      return { ran: false, message: `Hôm nay (${todayStr}) đã được sao lưu rồi` };
    }

    const configuredTime = (timeSetting?.value as string) || '21:00';
    const currentTime = getCurrentTime();

    if (currentTime < configuredTime && !options?.force) {
      return {
        ran: false,
        message: `Chưa tới khung giờ sao lưu (${currentTime} < ${configuredTime})`
      };
    }

    const jsonStr = await exportFullBackupJSON();
    const dateCompact = todayStr.replace(/-/g, '');
    const timeCompact = currentTime.replace(':', '');
    const fileName = `SoThuChi_AutoBackup_${dateCompact}_${timeCompact}.json`;

    await db.settings.put({
      key: 'last_auto_backup_date',
      value: todayStr
    });

    await downloadOrShareFile(jsonStr, fileName, 'application/json');

    return {
      ran: true,
      message: `Đã tự động sao lưu dữ liệu ngày ${todayStr} thành công!`,
      fileName
    };
  } catch (err: any) {
    console.error('Lỗi khi tự động sao lưu:', err);
    return { ran: false, message: err?.message || 'Lỗi sao lưu tự động' };
  }
}
