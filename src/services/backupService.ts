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

/**
 * Xuất toàn bộ dữ liệu từ Dexie IndexedDB thành chuỗi JSON
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

    // 1. Thử dùng navigator.share nếu trình duyệt hỗ trợ file
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
        // Nếu người dùng hủy share hoặc do thiếu user gesture, chuyển sang tải file
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
 * Khôi phục toàn bộ dữ liệu từ file JSON vào IndexedDB
 */
export async function restoreBackupData(jsonString: string): Promise<{
  success: boolean;
  message: string;
  counts: { wallets: number; categories: number; transactions: number; budgets: number };
}> {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('File không đúng định dạng JSON hợp lệ');
  }

  // Kiểm tra cấu trúc dữ liệu cơ bản
  if (!parsed || !parsed.data || !Array.isArray(parsed.data.wallets) || !Array.isArray(parsed.data.categories)) {
    throw new Error('Cấu trúc file sao lưu không hợp lệ hoặc thiếu dữ liệu danh mục/ví');
  }

  const { wallets, categories, transactions = [], budgets = [], settings = [] } = parsed.data;

  // Ghi đè vào IndexedDB trong 1 Transaction nguyên tử
  await db.transaction('rw', [db.wallets, db.categories, db.transactions, db.budgets, db.settings], async () => {
    await db.wallets.clear();
    await db.categories.clear();
    await db.transactions.clear();
    await db.budgets.clear();

    if (wallets.length > 0) await db.wallets.bulkPut(wallets);
    if (categories.length > 0) await db.categories.bulkPut(categories);
    if (transactions.length > 0) await db.transactions.bulkPut(transactions);
    if (budgets.length > 0) await db.budgets.bulkPut(budgets);

    // Cập nhật lại settings (giữ lại các setting hiện tại nếu trong file thiếu)
    for (const s of settings) {
      await db.settings.put(s);
    }
  });

  return {
    success: true,
    message: 'Khôi phục dữ liệu thành công!',
    counts: {
      wallets: wallets.length,
      categories: categories.length,
      transactions: transactions.length,
      budgets: budgets.length
    }
  };
}

/**
 * Xuất dữ liệu giao dịch ra file Excel (.xlsx) chuẩn
 */
export async function exportTransactionsToExcel(): Promise<void> {
  const [transactions, wallets, categories] = await Promise.all([
    db.transactions.toArray(),
    db.wallets.toArray(),
    db.categories.toArray()
  ]);

  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  // Sheet 1: Danh sách chi tiết giao dịch
  const txRows = transactions.map((t, idx) => ({
    STT: idx + 1,
    Ngày: t.date,
    Giờ: t.time,
    Loại: t.type === 'EXPENSE' ? 'Chi tiền' : t.type === 'INCOME' ? 'Thu tiền' : 'Chuyển ví',
    'Số tiền (VNĐ)': t.amount,
    'Hạng mục': t.categoryId ? (catMap.get(t.categoryId) || 'Chưa phân loại') : 'Chuyển tiền nội bộ',
    'Ví nguồn': walletMap.get(t.walletId) || 'Ví không xác định',
    'Ví đích': t.toWalletId ? (walletMap.get(t.toWalletId) || '') : '',
    'Ghi chú': t.note || ''
  }));

  // Sheet 2: Danh sách ví và số dư
  const walletRows = wallets.map((w) => ({
    'Tên ví': w.name,
    'Loại ví': w.type,
    'Số dư hiện tại': w.balance,
    'Số dư ban đầu': w.initialBalance,
    'Tính vào tổng tài sản': w.isExcludedFromTotal ? 'Không' : 'Có'
  }));

  const wb = XLSX.utils.book_new();
  const wsTx = XLSX.utils.json_to_sheet(txRows);
  const wsWallets = XLSX.utils.json_to_sheet(walletRows);

  XLSX.utils.book_append_sheet(wb, wsTx, 'Giao dịch');
  XLSX.utils.book_append_sheet(wb, wsWallets, 'Danh sách ví');

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const fileName = `SoThuChi_BaoCao_${getCurrentDate().replace(/-/g, '')}.xlsx`;

  await downloadOrShareFile(
    excelBuffer,
    fileName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

/**
 * Kiểm tra ngầm tự động sao lưu hàng ngày (Auto-Backup Background Check)
 * Được gọi khi App khởi động (App initialization) hoặc định kỳ.
 *
 * Điều kiện kích hoạt:
 * 1. auto_backup_enabled === true
 * 2. Chưa sao lưu trong ngày hôm nay (last_auto_backup_date !== today)
 * 3. Đã tới hoặc qua khung giờ cấu hình (currentTime >= auto_backup_time)
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

    // Mặc định bật nếu chưa có cấu hình
    const isEnabled = enabledSetting ? Boolean(enabledSetting.value) : true;
    if (!isEnabled && !options?.force) {
      return { ran: false, message: 'Tính năng tự động sao lưu đang tắt' };
    }

    const todayStr = getCurrentDate();
    const lastBackupDate = lastDateSetting?.value || '';

    // Nếu hôm nay đã sao lưu rồi và không ép buộc chạy lại
    if (lastBackupDate === todayStr && !options?.force) {
      return { ran: false, message: `Hôm nay (${todayStr}) đã được sao lưu rồi` };
    }

    const configuredTime = (timeSetting?.value as string) || '21:00';
    const currentTime = getCurrentTime();

    // Nếu chưa tới giờ và không ép buộc chạy
    if (currentTime < configuredTime && !options?.force) {
      return {
        ran: false,
        message: `Chưa tới khung giờ sao lưu (${currentTime} < ${configuredTime})`
      };
    }

    // Thực hiện xuất file backup JSON
    const jsonStr = await exportFullBackupJSON();
    const dateCompact = todayStr.replace(/-/g, '');
    const timeCompact = currentTime.replace(':', '');
    const fileName = `SoThuChi_AutoBackup_${dateCompact}_${timeCompact}.json`;

    // Cập nhật ngày sao lưu gần nhất TRƯỚC để tránh lặp vô tận nếu share bị hủy
    await db.settings.put({
      key: 'last_auto_backup_date',
      value: todayStr
    });

    // Kích hoạt chia sẻ hoặc tải file
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
