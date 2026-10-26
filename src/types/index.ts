// src/types/index.ts

export type WalletType = 'CASH' | 'BANK' | 'E_WALLET' | 'CREDIT' | 'INVESTMENT' | 'OTHER';

export interface Wallet {
  id: string;               // UUID
  name: string;             // Ví dụ: 'Tiền mặt', 'Vietcombank', 'Ví MoMo'
  type: WalletType;
  balance: number;          // Số dư hiện tại (VNĐ)
  initialBalance: number;   // Số dư khởi tạo ban đầu
  currency: 'VND';
  icon: string;             // Lucide icon name
  color: string;            // Mã màu HEX
  isExcludedFromTotal: boolean; // true: không tính vào tổng tài sản
  order?: number;           // Thứ tự hiển thị tùy chỉnh của ví
  createdAt: string;        // ISO 8601
  updatedAt: string;
}

export type CategoryType = 'EXPENSE' | 'INCOME' | 'DEBT';

export interface Category {
  id: string;
  name: string;             // 'Ăn uống', 'Lương', 'Must have'...
  type: CategoryType;
  parentId?: string;        // null/undefined: Hạng mục cha; có giá trị: Hạng mục con
  icon: string;             // Lucide icon name
  color: string;            // Mã màu HEX
  quickTags?: string[];     // Danh sách gợi ý ghi chú nhanh
  isDefault: boolean;
  isStarred?: boolean;      // true: Được gắn sao ưu tiên trong mục Hay dùng
  createdAt: string;
  updatedAt?: string;
}

export type AppStartupTab = 'overview' | 'wallets' | 'analytics' | 'more' | 'editor';

export type TransactionType =
  | 'EXPENSE'
  | 'INCOME'
  | 'TRANSFER'
  | 'LEND'
  | 'BORROW'
  | 'COLLECT_DEBT'
  | 'PAY_DEBT'
  | 'ADJUST';

export interface Transaction {
  id: string;
  walletId: string;         // Ví nguồn / ví chi trả
  toWalletId?: string;      // Ví đích (dùng khi type = 'TRANSFER')
  categoryId?: string;      // Danh mục (null nếu là TRANSFER)
  type: TransactionType;
  amount: number;           // Số tiền (> 0)
  transferFee?: number;     // Phí chuyển khoản (chỉ áp dụng khi type = 'TRANSFER')
  contactName?: string;     // Tên người vay / chủ nợ (khi type thuộc nhóm Vay Nợ)
  eventId?: string;         // ID Sự kiện / Chuyến đi (nếu gắn vào sự kiện)
  excludeFromReport?: boolean; // true: Không tính vào báo cáo Thu/Chi tháng (ví dụ: chi hộ/ứng trước)
  recurringId?: string;     // ID của mẫu ghi chép định kỳ đã sinh ra giao dịch này
  date: string;             // 'YYYY-MM-DD'
  time: string;             // 'HH:mm'
  note?: string;            // Ghi chú
  createdAt: string;
  updatedAt?: string;       // ISO 8601 phục vụ đồng bộ 2 chiều
}

export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurringTransaction {
  id: string;
  walletId: string;
  toWalletId?: string;
  categoryId?: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amount: number;
  note?: string;
  frequency: RecurringFrequency;
  startDate: string;        // 'YYYY-MM-DD'
  nextRunDate: string;      // 'YYYY-MM-DD'
  lastRunDate?: string;     // 'YYYY-MM-DD'
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface EventTrip {
  id: string;
  name: string;             // Ví dụ: 'Du lịch Đà Lạt 2026', 'Tết Nguyên Đán'
  icon: string;
  color: string;
  startDate: string;        // 'YYYY-MM-DD'
  endDate?: string;         // 'YYYY-MM-DD'
  budgetAmount?: number;    // Ngân sách dự kiến cho sự kiện
  isCompleted: boolean;     // Đã kết thúc hay đang diễn ra
  createdAt: string;
  updatedAt?: string;
}

export interface Budget {
  id: string;
  categoryId?: string;      // null nếu là hạn mức tổng tháng
  amount: number;           // Số tiền hạn mức
  month: string;            // 'YYYY-MM'
  createdAt: string;
}

export interface Setting {
  key: string;
  value: any;
}

export interface DeletedEntitiesTracking {
  transactionIds: string[];
  walletIds: string[];
  categoryIds: string[];
  budgetIds: string[];
}

export interface SyncSecurityInfo {
  pinHash?: string;
  recoveryQuestion?: string;
  recoveryAnswerHash?: string;
  updatedAt?: string;
}

export interface SyncDataPayload {
  version: string;
  appName: string;
  syncedAt: string;
  deviceId?: string;
  security?: SyncSecurityInfo;
  data: {
    wallets: Wallet[];
    categories: Category[];
    transactions: Transaction[];
    budgets: Budget[];
    settings: Setting[];
    recurringTransactions?: RecurringTransaction[];
    events?: EventTrip[];
  };
  deletedIds?: DeletedEntitiesTracking;
}

export interface SyncResult {
  success: boolean;
  message: string;
  syncedAt?: string;
  changes?: {
    addedTransactions: number;
    updatedTransactions: number;
    deletedTransactions: number;
  };
}

export interface MonthSummary {
  month: string;            // 'YYYY-MM'
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  expenseChangeMoM?: number; // % thay đổi so với tháng trước
  categories: {
    category: Category;
    amount: number;
    percentage: number;
    changeMoM?: number;     // % thay đổi so với tháng trước
  }[];
}
