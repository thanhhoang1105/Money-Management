// src/types/index.ts

export type WalletType = 'CASH' | 'BANK' | 'E_WALLET' | 'CREDIT';

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
  createdAt: string;        // ISO 8601
  updatedAt: string;
}

export type CategoryType = 'EXPENSE' | 'INCOME';

export interface Category {
  id: string;
  name: string;             // 'Ăn uống', 'Lương', 'Đi lại'
  type: CategoryType;
  icon: string;             // Lucide icon name
  color: string;            // Mã màu HEX
  quickTags?: string[];     // Danh sách gợi ý ghi chú nhanh
  isDefault: boolean;
  createdAt: string;
}

export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER';

export interface Transaction {
  id: string;
  walletId: string;         // Ví nguồn / ví chi trả
  toWalletId?: string;      // Ví đích (dùng khi type = 'TRANSFER')
  categoryId?: string;      // Danh mục (null nếu là TRANSFER)
  type: TransactionType;
  amount: number;           // Số tiền (> 0)
  date: string;             // 'YYYY-MM-DD'
  time: string;             // 'HH:mm'
  note?: string;            // Ghi chú
  createdAt: string;
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
