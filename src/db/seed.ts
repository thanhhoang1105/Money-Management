// src/db/seed.ts
import { db, requestPersistentStorage, runWithoutDirtyTracking } from './index';
import type { Wallet } from '../types';
import { generateUUID } from '../utils/uuid';
import { ensureGrabCategories, migrateLegacyGrabTransactions } from '../services/grabService';

// 3 HẠNG MỤC CHA MẶC ĐỊNH CỦA KHOẢN CHI (EXPENSE)
export const PARENT_MUST_HAVE_ID = 'cat_parent_must_have';
export const PARENT_NICE_TO_HAVE_ID = 'cat_parent_nice_to_have';
export const PARENT_WASTED_ID = 'cat_parent_wasted';

// HẠNG MỤC CHO NGHIỆP VỤ TÀI XẾ GRAB
export const GRAB_INCOME_CAT_ID = 'cat_income_grab';
export const GRAB_FEE_CAT_ID = 'cat_expense_grab_fee';

export interface SeedCategoryItem {
  id?: string;
  name: string;
  type: 'EXPENSE' | 'INCOME' | 'DEBT';
  parentId?: string;
  icon: string;
  color: string;
  quickTags?: string[];
  isDefault: boolean;
  isStarred?: boolean;
}

export const SEED_CATEGORIES: SeedCategoryItem[] = [
  // ==========================================
  // 1. KHOẢN CHI (EXPENSE) - CHỈ CÓ 3 HẠNG MỤC CHA MẶC ĐỊNH
  // (Người dùng tự thêm các mục con vào bên dưới từng nhóm)
  // ==========================================
  {
    id: PARENT_MUST_HAVE_ID,
    name: 'Must have (Thiết yếu)',
    type: 'EXPENSE',
    icon: 'CheckCircle2',
    color: '#10B981',
    isDefault: true
  },
  {
    id: PARENT_NICE_TO_HAVE_ID,
    name: 'Nice to have (Nâng cao)',
    type: 'EXPENSE',
    icon: 'Sparkles',
    color: '#3B82F6',
    isDefault: true
  },
  {
    id: PARENT_WASTED_ID,
    name: 'Wasted (Lãng phí)',
    type: 'EXPENSE',
    icon: 'AlertCircle',
    color: '#EF4444',
    isDefault: true
  },

  // ==========================================
  // 2. KHOẢN THU (INCOME) - 7 HẠNG MỤC MẶC ĐỊNH
  // (Có thể chọn trực tiếp cha hoặc tạo thêm con bên dưới để chọn)
  // ==========================================
  {
    id: 'cat_income_salary',
    name: 'Lương',
    type: 'INCOME',
    icon: 'Banknote',
    color: '#10B981',
    quickTags: ['Lương tháng', 'Lương chuyển khoản', 'Lương tạm ứng'],
    isDefault: true,
    isStarred: true
  },
  {
    id: 'cat_income_bonus',
    name: 'Thưởng',
    type: 'INCOME',
    icon: 'TrendingUp',
    color: '#3B82F6',
    quickTags: ['Thưởng KPI', 'Thưởng Tết', 'Thưởng dự án', 'Hoa hồng'],
    isDefault: true,
    isStarred: true
  },
  {
    id: 'cat_income_saving_interest',
    name: 'Lãi tiết kiệm',
    type: 'INCOME',
    icon: 'Landmark',
    color: '#8B5CF6',
    quickTags: ['Lãi có kỳ hạn', 'Lãi không kỳ hạn', 'Tất toán sổ tiết kiệm'],
    isDefault: true
  },
  {
    id: 'cat_income_gift',
    name: 'Được cho tặng',
    type: 'INCOME',
    icon: 'PartyPopper',
    color: '#EC4899',
    quickTags: ['Người thân cho', 'Lì xì', 'Bạn bè tặng', 'Quà mừng'],
    isDefault: true
  },
  {
    id: 'cat_income_profit',
    name: 'Tiền lãi',
    type: 'INCOME',
    icon: 'Coins',
    color: '#F59E0B',
    quickTags: ['Lãi đầu tư', 'Lãi cổ tức', 'Lãi cho vay'],
    isDefault: true
  },
  {
    id: 'cat_income_inflow',
    name: 'Tiền vào',
    type: 'INCOME',
    icon: 'CircleDollarSign',
    color: '#06B6D4',
    quickTags: ['Bán đồ cũ', 'Hoàn tiền', 'Thu cọc'],
    isDefault: true
  },
  {
    id: 'cat_income_other',
    name: 'Khác',
    type: 'INCOME',
    icon: 'MoreHorizontal',
    color: '#64748B',
    quickTags: ['Khoản thu khác', 'Lặt vặt'],
    isDefault: true
  },

  // ==========================================
  // 3. VAY NỢ (DEBT) - 4 OPTION MẶC ĐỊNH (PHẲNG, KHÔNG CHA CON)
  // ==========================================
  {
    id: 'cat_debt_lend',
    name: 'Cho vay',
    type: 'DEBT',
    icon: 'HandCoins',
    color: '#F59E0B',
    quickTags: ['Bạn bè vay', 'Đồng nghiệp mượn', 'Người thân vay'],
    isDefault: true
  },
  {
    id: 'cat_debt_borrow',
    name: 'Đi vay',
    type: 'DEBT',
    icon: 'Receipt',
    color: '#8B5CF6',
    quickTags: ['Vay ngân hàng', 'Mượn bạn', 'Vay người thân'],
    isDefault: true
  },
  {
    id: 'cat_debt_collect',
    name: 'Thu nợ',
    type: 'DEBT',
    icon: 'PiggyBank',
    color: '#10B981',
    quickTags: ['Thu nợ bạn trả', 'Thu hồi nợ cũ'],
    isDefault: true
  },
  {
    id: 'cat_debt_pay',
    name: 'Trả nợ',
    type: 'DEBT',
    icon: 'CreditCard',
    color: '#EF4444',
    quickTags: ['Trả nợ ngân hàng', 'Trả tiền bạn', 'Thanh toán thẻ tín dụng'],
    isDefault: true
  }
];

export const DEFAULT_WALLETS: (Omit<Wallet, 'id' | 'createdAt' | 'updatedAt'> & { id: string })[] = [
  {
    id: 'wallet_default_cash',
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
    id: 'wallet_default_bank',
    name: 'Ngân hàng',
    type: 'BANK',
    balance: 0,
    initialBalance: 0,
    currency: 'VND',
    icon: 'Landmark',
    color: '#3B82F6',
    isExcludedFromTotal: false
  }
];

/**
 * Đảm bảo luôn có ít nhất 2 ví mặc định (Tiền mặt và Ngân hàng) khi chưa có ví nào trong DB
 */
export async function ensureDefaultWallets(): Promise<void> {
  const walletCount = await db.wallets.count();
  if (walletCount === 0) {
    const now = new Date().toISOString();
    for (const wallet of DEFAULT_WALLETS) {
      await db.wallets.put({
        ...wallet,
        createdAt: now,
        updatedAt: now
      });
    }
  }
}

/**
 * Đảm bảo cấu trúc hạng mục chuẩn v6:
 * - EXPENSE: Chỉ giữ 3 nhóm cha mặc định (Must have, Nice to have, Wasted). Xóa toàn bộ mục con mặc định cũ (giữ lại mục con do user tự tạo isDefault === false).
 * - INCOME: 7 mục mặc định (Lương, Thưởng, Lãi tiết kiệm, Được cho tặng, Tiền lãi, Tiền vào, Khác).
 * - DEBT: 4 mục phẳng (Cho vay, Đi vay, Thu nợ, Trả nợ), không có quan hệ cha con.
 */
export async function ensureHierarchicalCategories(): Promise<void> {
  const versionSetting = await db.settings.get('has_seeded_categories_v6');
  if (versionSetting?.value) {
    return;
  }

  const now = new Date().toISOString();
  await db.transaction('rw', [db.categories, db.settings], async () => {
    const allCats = await db.categories.toArray();

    // 1. Xóa các hạng mục con EXPENSE mặc định cũ (chỉ giữ lại 3 cha Must have, Nice to have, Wasted, system_adjustment, phí grab và các mục do user tự tạo isDefault === false)
    const expenseParentIds = new Set([
      PARENT_MUST_HAVE_ID,
      PARENT_NICE_TO_HAVE_ID,
      PARENT_WASTED_ID,
      'system_adjustment',
      GRAB_FEE_CAT_ID
    ]);

    for (const cat of allCats) {
      if (cat.type === 'EXPENSE' && !expenseParentIds.has(cat.id)) {
        if (cat.isDefault) {
          await db.categories.delete(cat.id);
        }
      }
      // Chuẩn hóa tên cũ của INCOME nếu có ("Lương chính" -> "Lương", "Thu nhập khác" -> "Khác")
      if (cat.type === 'INCOME' && cat.name.trim().toLowerCase() === 'lương chính') {
        await db.categories.update(cat.id, { name: 'Lương', updatedAt: now });
      }
      if (cat.type === 'INCOME' && cat.name.trim().toLowerCase() === 'thu nhập khác') {
        await db.categories.update(cat.id, { name: 'Khác', updatedAt: now });
      }
      // Đảm bảo DEBT không bao giờ có parentId
      if (cat.type === 'DEBT' && cat.parentId) {
        await db.categories.update(cat.id, { parentId: undefined, updatedAt: now });
      }
    }

    // 2. Đảm bảo 3 nhóm cha của EXPENSE luôn tồn tại
    const parents = [
      {
        id: PARENT_MUST_HAVE_ID,
        name: 'Must have (Thiết yếu)',
        type: 'EXPENSE' as const,
        icon: 'CheckCircle2',
        color: '#10B981'
      },
      {
        id: PARENT_NICE_TO_HAVE_ID,
        name: 'Nice to have (Nâng cao)',
        type: 'EXPENSE' as const,
        icon: 'Sparkles',
        color: '#3B82F6'
      },
      {
        id: PARENT_WASTED_ID,
        name: 'Wasted (Lãng phí)',
        type: 'EXPENSE' as const,
        icon: 'AlertCircle',
        color: '#EF4444'
      }
    ];

    for (const p of parents) {
      const exist = await db.categories.get(p.id);
      if (!exist) {
        await db.categories.put({
          id: p.id,
          name: p.name,
          type: p.type,
          icon: p.icon,
          color: p.color,
          isDefault: true,
          createdAt: now
        });
      }
    }

    // 3. Đảm bảo 7 mục INCOME và 4 mục DEBT mặc định tồn tại
    const remainingCategories = await db.categories.toArray();
    const existingNameSet = new Set(
      remainingCategories.map((c) => `${c.type}_${c.name.trim().toLowerCase()}`)
    );

    for (const item of SEED_CATEGORIES) {
      if (item.type === 'EXPENSE') continue; // EXPENSE chỉ có 3 cha đã tạo ở bước 2

      const key = `${item.type}_${item.name.trim().toLowerCase()}`;
      if (!existingNameSet.has(key)) {
        await db.categories.put({
          id: item.id || generateUUID(),
          name: item.name,
          type: item.type,
          parentId: undefined,
          icon: item.icon,
          color: item.color,
          quickTags: item.quickTags || [],
          isDefault: true,
          isStarred: !!item.isStarred,
          createdAt: now
        });
        existingNameSet.add(key);
      }
    }

    await db.settings.put({
      key: 'has_seeded_categories_v6',
      value: true
    });
  });
}

export async function ensureDefaultSettings(): Promise<void> {
  const enabled = await db.settings.get('auto_backup_enabled');
  if (enabled === undefined) {
    await db.settings.put({ key: 'auto_backup_enabled', value: true });
  }
  const time = await db.settings.get('auto_backup_time');
  if (time === undefined) {
    await db.settings.put({ key: 'auto_backup_time', value: '21:00' });
  }
}

export async function initializeSeedData(): Promise<void> {
  await requestPersistentStorage();
  await runWithoutDirtyTracking(async () => {
    await ensureDefaultSettings();
    await ensureDefaultWallets();
    await ensureHierarchicalCategories();
    await ensureGrabCategories();
    await migrateLegacyGrabTransactions();

    const isInitialized = await db.settings.get('has_seeded_v3');
    if (isInitialized?.value) {
      return;
    }

    const now = new Date().toISOString();
    await db.transaction('rw', [db.categories, db.wallets, db.settings], async () => {
      const sysAdj = await db.categories.get('system_adjustment');
      if (!sysAdj) {
        await db.categories.put({
          id: 'system_adjustment',
          name: 'Điều chỉnh số dư',
          type: 'EXPENSE',
          icon: 'SlidersHorizontal',
          color: '#64748B',
          quickTags: ['Khớp tiền thực tế', 'Tiền chênh lệch', 'Kiểm kê'],
          isDefault: true,
          createdAt: now
        });
      }

      await db.settings.put({
        key: 'has_seeded_v3',
        value: true
      });
    });
  });
}
