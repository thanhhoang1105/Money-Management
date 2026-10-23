// src/db/seed.ts
import { db, requestPersistentStorage } from './index';
import type { Wallet } from '../types';
import { generateUUID } from '../utils/uuid';

// CÁC HẠNG MỤC CHA MẶC ĐỊNH
export const PARENT_MUST_HAVE_ID = 'cat_parent_must_have';
export const PARENT_NICE_TO_HAVE_ID = 'cat_parent_nice_to_have';
export const PARENT_WASTED_ID = 'cat_parent_wasted';
export const PARENT_INCOME_ID = 'cat_parent_income';
export const PARENT_DEBT_ID = 'cat_parent_debt';

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
  // 1. CHI TIÊU (EXPENSE) - 3 HẠNG MỤC CHA
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

  // --- CÁC MỤC CON THUỘC "MUST HAVE" (Thiết yếu - Bản chất bắt buộc) ---
  {
    name: 'Đi chợ & Nấu ăn',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Soup',
    color: '#10B981',
    quickTags: ['Đi chợ', 'Siêu thị', 'Tự nấu ăn', 'Thịt cá rau', 'Gia vị', 'Gạo & Thực phẩm khô'],
    isDefault: true,
    isStarred: true
  },
  {
    name: 'Nhà cửa & Tiện ích',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Home',
    color: '#EAB308',
    quickTags: ['Tiền nhà', 'Tiền điện', 'Tiền nước', 'Internet', 'Phí chung cư', 'Đổi gas'],
    isDefault: true
  },
  {
    name: 'Đi lại & Xăng xe cơ bản',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Fuel',
    color: '#3B82F6',
    quickTags: ['Đổ xăng', 'Gửi xe', 'Vé xe bus/tàu', 'Bảo dưỡng xe', 'Cầu đường'],
    isDefault: true,
    isStarred: true
  },
  {
    name: 'Y tế & Sức khỏe',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'HeartPulse',
    color: '#EF4444',
    quickTags: ['Thuốc men', 'Khám bệnh', 'Nha khoa', 'Bảo hiểm y tế', 'Vitamin'],
    isDefault: true
  },
  {
    name: 'Giáo dục & Con cái',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'GraduationCap',
    color: '#06B6D4',
    quickTags: ['Học phí', 'Sách vở', 'Khóa học', 'Đồ dùng học tập', 'Sữa cho con'],
    isDefault: true
  },
  {
    name: 'Đồ sinh hoạt thiết yếu',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Package',
    color: '#14B8A6',
    quickTags: ['Bột giặt / Nước xả', 'Nước rửa chén', 'Giấy vệ sinh', 'Kem đánh răng', 'Đồ gia dụng nhỏ'],
    isDefault: true
  },

  // --- CÁC MỤC CON THUỘC "NICE TO HAVE" (Hưởng thụ / Nâng cao) ---
  {
    name: 'Ăn ngoài & Đặt món',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'UtensilsCrossed',
    color: '#F97316',
    quickTags: ['Ăn sáng', 'Ăn trưa công sở', 'Ăn tối ngoài', 'GrabFood / ShopeeFood', 'Nhà hàng', 'Ăn vặt / Tráng miệng'],
    isDefault: true,
    isStarred: true
  },
  {
    name: 'Cà phê & Trà sữa',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Coffee',
    color: '#8B5CF6',
    quickTags: ['Cà phê sáng', 'Trà sữa', 'Gặp gỡ bạn bè', 'Hẹn hò', 'Trà chanh / Sinh tố'],
    isDefault: true,
    isStarred: true
  },
  {
    name: 'Mua sắm & Làm đẹp',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'ShoppingBag',
    color: '#EC4899',
    quickTags: ['Quần áo', 'Giày dép', 'Mỹ phẩm / Skincare', 'Cắt tóc / Spa', 'Phụ kiện thời trang'],
    isDefault: true
  },
  {
    name: 'Du lịch & Nghỉ dưỡng',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Plane',
    color: '#0EA5E9',
    quickTags: ['Vé máy bay / Tàu', 'Khách sạn / Homestay', 'Ăn chơi du lịch', 'Mua quà đặc sản'],
    isDefault: true
  },
  {
    name: 'Thể thao & Rèn luyện',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Dumbbell',
    color: '#10B981',
    quickTags: ['Tập Gym', 'Yoga / Pilates', 'Cầu lông / Bóng đá', 'Thực phẩm bổ sung'],
    isDefault: true
  },
  {
    name: 'Hiếu hỉ & Quà tặng',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Gift',
    color: '#F43F5E',
    quickTags: ['Đám cưới', 'Sinh nhật', 'Biếu bố mẹ', 'Lễ Tết / Lì xì', 'Quà mừng'],
    isDefault: true
  },
  {
    name: 'Giải trí & Phim ảnh',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Clapperboard',
    color: '#6366F1',
    quickTags: ['Xem phim rạp', 'Netflix / Spotify', 'Hát Karaoke', 'Game', 'Sách truyện'],
    isDefault: true
  },

  // --- CÁC MỤC CON THUỘC "WASTED" (Lãng phí / Cần cắt giảm) ---
  {
    name: 'Ăn nhậu quá đà',
    type: 'EXPENSE',
    parentId: PARENT_WASTED_ID,
    icon: 'Beer',
    color: '#EA580C',
    quickTags: ['Bia rượu thừa mứa', 'Tăng 2 tăng 3', 'Tiền tips vô lý', 'Nhậu say gọi đồ thừa'],
    isDefault: true
  },
  {
    name: 'Mua sắm bốc đồng',
    type: 'EXPENSE',
    parentId: PARENT_WASTED_ID,
    icon: 'Flame',
    color: '#F59E0B',
    quickTags: ['Đồ ngẫu hứng', 'Mua về không dùng', 'Săn sale bốc đồng', 'Đồ thừa mứa'],
    isDefault: true
  },
  {
    name: 'Tiền phạt & Phí trễ hạn',
    type: 'EXPENSE',
    parentId: PARENT_WASTED_ID,
    icon: 'AlertTriangle',
    color: '#DC2626',
    quickTags: ['Phạt giao thông', 'Phạt trả chậm thẻ', 'Phí duy trì tài khoản', 'Phạt vi phạm'],
    isDefault: true
  },
  {
    name: 'Đồ hỏng & Bỏ quên',
    type: 'EXPENSE',
    parentId: PARENT_WASTED_ID,
    icon: 'Trash2',
    color: '#6B7280',
    quickTags: ['Đồ ăn hết hạn vứt đi', 'Làm mất đồ', 'Hư hỏng do bất cẩn'],
    isDefault: true
  },
  {
    name: 'Trò chơi may rủi',
    type: 'EXPENSE',
    parentId: PARENT_WASTED_ID,
    icon: 'Dice5',
    color: '#7C3AED',
    quickTags: ['Vé số', 'Game cá cược', 'Sở thích may rủi'],
    isDefault: true
  },

  // ==========================================
  // 2. THU TIỀN (INCOME)
  // ==========================================
  {
    name: 'Lương chính',
    type: 'INCOME',
    icon: 'Banknote',
    color: '#10B981',
    quickTags: ['Lương chuyển khoản', 'Lương cứng', 'Lương tạm ứng'],
    isDefault: true
  },
  {
    name: 'Được cho tặng',
    type: 'INCOME',
    icon: 'PartyPopper',
    color: '#EC4899',
    quickTags: ['Bố mẹ cho', 'Lì xì', 'Bạn bè tặng', 'Người thân biếu'],
    isDefault: true
  },
  {
    name: 'Thưởng',
    type: 'INCOME',
    icon: 'TrendingUp',
    color: '#3B82F6',
    quickTags: ['Thưởng KPI', 'Thưởng Tết', 'Dự án ngoài', 'Hoa hồng'],
    isDefault: true
  },
  {
    name: 'Lãi tiết kiệm',
    type: 'INCOME',
    icon: 'Landmark',
    color: '#8B5CF6',
    quickTags: ['Lãi có kỳ hạn', 'Lãi không kỳ hạn', 'Sổ tiết kiệm'],
    isDefault: true
  },
  {
    name: 'Tiền lãi',
    type: 'INCOME',
    icon: 'Coins',
    color: '#F59E0B',
    quickTags: ['Lãi chứng khoán', 'Lãi cổ tức', 'Lãi cho vay', 'Đầu tư sinh lời'],
    isDefault: true
  },
  {
    name: 'Tiền vào',
    type: 'INCOME',
    icon: 'CircleDollarSign',
    color: '#06B6D4',
    quickTags: ['Bán đồ cũ', 'Thu cọc', 'Hoàn thuế', 'Hoàn tiền mua sắm'],
    isDefault: true
  },
  {
    name: 'Thu nhập khác',
    type: 'INCOME',
    icon: 'MoreHorizontal',
    color: '#64748B',
    quickTags: ['Khoản thu bất ngờ', 'Lặt vặt'],
    isDefault: true
  },

  // ==========================================
  // 3. VAY NỢ (DEBT)
  // ==========================================
  {
    name: 'Cho vay',
    type: 'DEBT',
    icon: 'HandCoins',
    color: '#F59E0B',
    quickTags: ['Bạn bè vay', 'Đồng nghiệp mượn', 'Người thân vay'],
    isDefault: true
  },
  {
    name: 'Đi vay',
    type: 'DEBT',
    icon: 'Receipt',
    color: '#8B5CF6',
    quickTags: ['Vay ngân hàng', 'Mượn bạn', 'Thấu chi thẻ'],
    isDefault: true
  },
  {
    name: 'Thu nợ',
    type: 'DEBT',
    icon: 'PiggyBank',
    color: '#10B981',
    quickTags: ['Bạn trả nợ', 'Đòi được nợ', 'Thu hồi nợ cũ'],
    isDefault: true
  },
  {
    name: 'Trả nợ',
    type: 'DEBT',
    icon: 'CreditCard',
    color: '#EF4444',
    quickTags: ['Trả nợ ngân hàng', 'Trả tiền bạn', 'Thanh toán thẻ tín dụng'],
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
      await db.wallets.add({
        id: generateUUID(),
        ...wallet,
        createdAt: now,
        updatedAt: now
      });
    }
  }
}

/**
 * Đảm bảo nạp đầy đủ cấu trúc Hạng mục Cha & Con mới theo hành vi vào cơ sở dữ liệu
 */
export async function ensureHierarchicalCategories(): Promise<void> {
  const versionSetting = await db.settings.get('has_seeded_categories_v5');
  if (versionSetting?.value) {
    return;
  }

  const now = new Date().toISOString();
  await db.transaction('rw', [db.categories, db.settings], async () => {
    // 1. Đảm bảo 3 nhóm cha của EXPENSE luôn tồn tại
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
        await db.categories.add({
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

    // 2. Nạp hoặc cập nhật các danh mục con theo hành vi và Quick Tags
    const currentCategories = await db.categories.toArray();
    const existingNameSet = new Set(
      currentCategories.map((c) => `${c.type}_${c.name.trim().toLowerCase()}`)
    );

    for (const item of SEED_CATEGORIES) {
      if (item.id && [PARENT_MUST_HAVE_ID, PARENT_NICE_TO_HAVE_ID, PARENT_WASTED_ID].includes(item.id)) {
        continue;
      }

      const key = `${item.type}_${item.name.trim().toLowerCase()}`;
      if (!existingNameSet.has(key)) {
        await db.categories.add({
          id: item.id || generateUUID(),
          name: item.name,
          type: item.type,
          parentId: item.parentId,
          icon: item.icon,
          color: item.color,
          quickTags: item.quickTags || [],
          isDefault: true,
          isStarred: !!item.isStarred,
          createdAt: now
        });
        existingNameSet.add(key);
      } else {
        const found = currentCategories.find(
          (c) => `${c.type}_${c.name.trim().toLowerCase()}` === key
        );
        if (found && found.isDefault) {
          await db.categories.update(found.id, {
            icon: item.icon,
            color: item.color,
            quickTags: item.quickTags || found.quickTags,
            parentId: item.parentId || found.parentId,
            isStarred: item.isStarred !== undefined ? item.isStarred : found.isStarred,
            updatedAt: now
          });
        }
      }
    }

    await db.settings.put({
      key: 'has_seeded_categories_v5',
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
  await ensureDefaultSettings();
  await ensureDefaultWallets();
  await ensureHierarchicalCategories();

  const isInitialized = await db.settings.get('has_seeded_v3');
  if (isInitialized?.value) {
    return;
  }

  const now = new Date().toISOString();
  await db.transaction('rw', [db.categories, db.wallets, db.settings], async () => {
    const sysAdj = await db.categories.get('system_adjustment');
    if (!sysAdj) {
      await db.categories.add({
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
}
