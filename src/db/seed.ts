// src/db/seed.ts
import { db } from './index';
import type { Wallet, Category } from '../types';

export const DEFAULT_CATEGORIES: Omit<Category, 'id' | 'createdAt'>[] = [
  // CHI TIÊU (EXPENSES)
  {
    name: 'Ăn uống',
    type: 'EXPENSE',
    icon: 'Utensils',
    color: '#F97316',
    quickTags: ['Ăn sáng', 'Cơm trưa', 'Cơm tối', 'Cà phê', 'Trà sữa', 'Ăn vặt', 'Nhậu'],
    isDefault: true
  },
  {
    name: 'Đi lại / Xăng xe',
    type: 'EXPENSE',
    icon: 'Car',
    color: '#3B82F6',
    quickTags: ['Đổ xăng', 'Gửi xe', 'Grab/Taxi', 'Rửa xe', 'Bảo dưỡng xe', 'Cầu đường'],
    isDefault: true
  },
  {
    name: 'Đi chợ / Siêu thị',
    type: 'EXPENSE',
    icon: 'ShoppingBag',
    color: '#8B5CF6',
    quickTags: ['Thịt cá rau', 'Gia vị', 'Đồ nhà tắm', 'Bách hóa', 'Trái cây'],
    isDefault: true
  },
  {
    name: 'Hóa đơn nhà cửa',
    type: 'EXPENSE',
    icon: 'Home',
    color: '#EAB308',
    quickTags: ['Tiền nhà', 'Tiền điện', 'Tiền nước', 'Internet', 'Phí dịch vụ', 'Gas'],
    isDefault: true
  },
  {
    name: 'Y tế & Sức khỏe',
    type: 'EXPENSE',
    icon: 'HeartPulse',
    color: '#EF4444',
    quickTags: ['Thuốc men', 'Khám bệnh', 'Nha khoa', 'Vitamin', 'Bảo hiểm'],
    isDefault: true
  },
  {
    name: 'Giải trí & Gặp gỡ',
    type: 'EXPENSE',
    icon: 'PartyPopper',
    color: '#EC4899',
    quickTags: ['Xem phim', 'Tụ tập bạn bè', 'Du lịch', 'Game/App', 'Sở thích'],
    isDefault: true
  },
  {
    name: 'Phát triển bản thân',
    type: 'EXPENSE',
    icon: 'GraduationCap',
    color: '#10B981',
    quickTags: ['Sách', 'Khóa học', 'Dụng cụ học tập', 'Gym/Thể thao'],
    isDefault: true
  },
  {
    name: 'Hiếu hỉ & Quà cáp',
    type: 'EXPENSE',
    icon: 'Gift',
    color: '#06B6D4',
    quickTags: ['Đám cưới', 'Sinh nhật', 'Biếu bố mẹ', 'Mừng lễ', 'Lì xì'],
    isDefault: true
  },
  {
    name: 'Chi tiêu khác',
    type: 'EXPENSE',
    icon: 'MoreHorizontal',
    color: '#6B7280',
    quickTags: ['Rút tiền', 'Chi đột xuất', 'Phí chuyển khoản', 'Mất tiền'],
    isDefault: true
  },

  // THU NHẬP (INCOMES)
  {
    name: 'Lương chính',
    type: 'INCOME',
    icon: 'Banknote',
    color: '#059669',
    quickTags: ['Lương cứng', 'Lương chuyển khoản', 'Lương tạm ứng'],
    isDefault: true
  },
  {
    name: 'Thưởng & Làm thêm',
    type: 'INCOME',
    icon: 'TrendingUp',
    color: '#2563EB',
    quickTags: ['Thưởng KPI', 'Thưởng Tết', 'Dự án ngoài', 'Overtime'],
    isDefault: true
  },
  {
    name: 'Thu nhập khác',
    type: 'INCOME',
    icon: 'Coins',
    color: '#D97706',
    quickTags: ['Được tặng', 'Bán đồ cũ', 'Lãi tiết kiệm', 'Đầu tư'],
    isDefault: true
  }
];

export const DEFAULT_WALLETS: Omit<Wallet, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Tiền mặt',
    type: 'CASH',
    balance: 0,
    initialBalance: 0,
    currency: 'VND',
    icon: 'Wallet',
    color: '#10B981',
    isExcludedFromTotal: false
  },
  {
    name: 'Tài khoản Ngân hàng',
    type: 'BANK',
    balance: 0,
    initialBalance: 0,
    currency: 'VND',
    icon: 'Landmark',
    color: '#3B82F6',
    isExcludedFromTotal: false
  },
  {
    name: 'Ví MoMo',
    type: 'E_WALLET',
    balance: 0,
    initialBalance: 0,
    currency: 'VND',
    icon: 'Smartphone',
    color: '#D946EF',
    isExcludedFromTotal: false
  }
];

export async function initializeSeedData(): Promise<void> {
  const isInitialized = await db.settings.get('has_seeded');
  if (isInitialized?.value) {
    return;
  }

  const now = new Date().toISOString();

  await db.transaction('rw', [db.categories, db.wallets, db.settings], async () => {
    // 1. Thêm danh mục mặc định
    for (const cat of DEFAULT_CATEGORIES) {
      await db.categories.add({
        id: crypto.randomUUID(),
        ...cat,
        createdAt: now
      });
    }

    // 2. Thêm ví mặc định
    for (const wallet of DEFAULT_WALLETS) {
      await db.wallets.add({
        id: crypto.randomUUID(),
        ...wallet,
        createdAt: now,
        updatedAt: now
      });
    }

    // 3. Đánh dấu đã seed
    await db.settings.put({
      key: 'has_seeded',
      value: true
    });
  });
}
