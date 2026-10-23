// src/db/index.ts
import Dexie, { type Table } from 'dexie';
import type {
  Wallet,
  Category,
  Transaction,
  Budget,
  Setting,
  RecurringTransaction,
  EventTrip
} from '../types';

export class MoneyDatabase extends Dexie {
  wallets!: Table<Wallet, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  settings!: Table<Setting, string>;
  recurringTransactions!: Table<RecurringTransaction, string>;
  events!: Table<EventTrip, string>;

  constructor() {
    super('MoneyTrackerDB');

    // Schema Version 1 (Cấu hình ban đầu)
    this.version(1).stores({
      wallets: 'id, name, type, isExcludedFromTotal, createdAt',
      categories: 'id, name, type, isDefault, createdAt',
      transactions: 'id, walletId, toWalletId, categoryId, type, date, createdAt, [walletId+date]',
      budgets: 'id, categoryId, month, [categoryId+month]',
      settings: 'key'
    });

    // Schema Version 2 (Cấu hình đầy đủ index tối ưu truy vấn thời gian thực & báo cáo)
    // - transactions: thêm index [categoryId+date] phục vụ drill-down báo cáo danh mục theo tháng
    // - transactions: thêm index [type+date] phục vụ lọc tổng thu/chi theo tháng
    // - wallets: thêm index updatedAt
    this.version(2).stores({
      wallets: 'id, name, type, isExcludedFromTotal, createdAt, updatedAt',
      categories: 'id, name, type, isDefault, createdAt',
      transactions: 'id, walletId, toWalletId, categoryId, type, date, createdAt, [walletId+date], [categoryId+date], [type+date]',
      budgets: 'id, categoryId, month, [categoryId+month]',
      settings: 'key'
    });

    // Schema Version 3 (Khử triệt để index boolean: IndexedDB không hỗ trợ IDBKeyRange cho boolean)
    // Bỏ index isExcludedFromTotal và isDefault để không bị lỗi IndexedDB; lọc bằng JS/TS .filter()
    this.version(3).stores({
      wallets: 'id, name, type, createdAt, updatedAt',
      categories: 'id, name, type, createdAt',
      transactions: 'id, walletId, toWalletId, categoryId, type, date, createdAt, [walletId+date], [categoryId+date], [type+date]',
      budgets: 'id, categoryId, month, [categoryId+month]',
      settings: 'key'
    });

    // Schema Version 4 (V3.0: Thêm Ghi chép định kỳ, Sự kiện/Chuyến đi, Sổ Nợ contactName/eventId)
    // Tuyệt đối KHÔNG đánh index trường boolean (isActive, isCompleted, excludeFromReport)
    this.version(4).stores({
      wallets: 'id, name, type, createdAt, updatedAt',
      categories: 'id, name, type, createdAt',
      transactions: 'id, walletId, toWalletId, categoryId, type, contactName, eventId, date, createdAt, [walletId+date], [categoryId+date], [type+date]',
      budgets: 'id, categoryId, month, [categoryId+month]',
      settings: 'key',
      recurringTransactions: 'id, walletId, type, nextRunDate, createdAt',
      events: 'id, startDate, createdAt'
    });

    // Tự động kích hoạt Persistent Storage khi DB sẵn sàng
    this.on('ready', () => {
      return requestPersistentStorage().catch((err) => {
        console.warn('[DB] Persistent storage request on ready failed:', err);
      });
    });
  }
}

export const db = new MoneyDatabase();

/**
 * Yêu cầu quyền lưu trữ bền vững (Persistent Storage API) từ trình duyệt.
 *
 * TẠI SAO ĐẶC BIỆT QUAN TRỌNG VỚI IOS SAFARI:
 * Theo chính sách WebKit/Safari, các trang web lưu trữ IndexedDB chưa được ghim
 * hoặc không có tương tác thường xuyên có thể bị Safari dọn dẹp (evict) sau 7 ngày
 * nếu máy báo thiếu dung lượng.
 * Gọi navigator.storage.persist() sẽ đánh dấu dữ liệu IndexedDB của ứng dụng là
 * "Bền Vững (Persistent)", ngăn chặn hoàn toàn việc trình duyệt tự động xóa dữ liệu.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof window === 'undefined' || !('storage' in navigator)) {
    return false;
  }

  try {
    if (typeof navigator.storage.persisted === 'function') {
      const isPersisted = await navigator.storage.persisted();
      if (isPersisted) {
        console.log('[Storage] IndexedDB đã ở chế độ Bền Vững (Persistent Storage Active).');
        try {
          await db.settings.put({
            key: 'storage_persisted',
            value: { persisted: true, updatedAt: new Date().toISOString() }
          });
        } catch {
          // Bỏ qua nếu DB chưa mở xong
        }
        return true;
      }
    }

    if (typeof navigator.storage.persist === 'function') {
      const granted = await navigator.storage.persist();
      console.log(`[Storage] Yêu cầu Persistent Storage: ${granted ? 'ĐƯỢC CHẤP THUẬN' : 'TỪ CHỐI'}`);
      try {
        await db.settings.put({
          key: 'storage_persisted',
          value: { persisted: granted, updatedAt: new Date().toISOString() }
        });
      } catch {
        // Bỏ qua nếu DB chưa mở xong
      }
      return granted;
    }
  } catch (err) {
    console.warn('[Storage] Lỗi khi gọi navigator.storage.persist():', err);
  }

  return false;
}

/**
 * Kiểm tra trạng thái dung lượng & quyền lưu trữ bền vững
 */
export async function getStorageStatus(): Promise<{
  persisted: boolean;
  quota?: number;
  usage?: number;
  usagePercent?: number;
}> {
  let persisted = false;
  let quota: number | undefined;
  let usage: number | undefined;
  let usagePercent: number | undefined;

  if (typeof window !== 'undefined' && 'storage' in navigator) {
    if (typeof navigator.storage.persisted === 'function') {
      try {
        persisted = await navigator.storage.persisted();
      } catch (e) {
        console.warn(e);
      }
    }
    if (typeof navigator.storage.estimate === 'function') {
      try {
        const estimate = await navigator.storage.estimate();
        quota = estimate.quota;
        usage = estimate.usage;
        if (quota && usage) {
          usagePercent = Math.round((usage / quota) * 10000) / 100;
        }
      } catch (e) {
        console.warn(e);
      }
    }
  }

  return { persisted, quota, usage, usagePercent };
}
