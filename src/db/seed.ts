// src/db/seed.ts
import { db, requestPersistentStorage, runWithoutDirtyTracking } from './index';
import type { Wallet } from '../types';
import { generateUUID } from '../utils/uuid';
import { ensureGrabCategories } from '../services/grabService';

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
  order?: number;
}

export const SEED_CATEGORIES: SeedCategoryItem[] = [
  // ==========================================
  // 1. KHOẢN CHI (EXPENSE) - 3 NHÓM CHA
  // ==========================================
  {
    id: PARENT_MUST_HAVE_ID,
    name: 'Must have (Thiết yếu)',
    type: 'EXPENSE',
    icon: 'CheckCircle2',
    color: '#10B981',
    isDefault: true,
    isStarred: false,
    order: 0
  },
  {
    id: PARENT_NICE_TO_HAVE_ID,
    name: 'Nice to have (Nâng cao)',
    type: 'EXPENSE',
    icon: 'Sparkles',
    color: '#3B82F6',
    isDefault: true,
    isStarred: false,
    order: 1
  },
  {
    id: PARENT_WASTED_ID,
    name: 'Wasted (Lãng phí)',
    type: 'EXPENSE',
    icon: 'AlertCircle',
    color: '#EF4444',
    isDefault: true,
    isStarred: false,
    order: 2
  },

  // ==========================================
  // 1.1 MUST HAVE (15 MỤC CON)
  // ==========================================
  {
    id: 'cat_exp_groceries',
    name: 'Đi chợ & Nấu ăn',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Soup',
    color: '#10B981',
    quickTags: ['Rau củ', 'Thịt cá', 'Gia vị', 'Trái cây', 'Gạo', 'Đi chợ'],
    isDefault: true,
    isStarred: true,
    order: 0
  },
  {
    id: 'cat_exp_fuel',
    name: 'Xăng xe đi lại',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Fuel',
    color: '#0284C7',
    quickTags: ['Đổ xăng', 'Vé xe', 'Gửi xe', 'Rửa xe'],
    isDefault: true,
    isStarred: true,
    order: 1
  },
  {
    id: GRAB_FEE_CAT_ID,
    name: 'Phí dịch vụ Grab',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Percent',
    color: '#6366F1',
    quickTags: ['Chiết khấu Grab', 'Phí nền tảng'],
    isDefault: true,
    isStarred: false,
    order: 2
  },
  {
    id: 'cat_exp_education',
    name: 'Giáo dục & Con cái',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'GraduationCap',
    color: '#06B6D4',
    quickTags: ['Học phí', 'Sách vở', 'Khóa học', 'Đồ dùng học tập', 'Sữa cho con'],
    isDefault: true,
    isStarred: false,
    order: 3
  },
  {
    id: 'cat_exp_insurance',
    name: 'Bảo hiểm (Y tế / Xe máy / Tai nạn)',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'ShieldCheck',
    color: '#1E40AF',
    quickTags: ['BHYT', 'Bảo hiểm xe máy', 'Bảo hiểm tai nạn'],
    isDefault: true,
    isStarred: false,
    order: 4
  },
  {
    id: 'cat_exp_electricity',
    name: 'Điện sinh hoạt',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Lightbulb',
    color: '#F59E0B',
    quickTags: ['Tiền điện tháng'],
    isDefault: true,
    isStarred: false,
    order: 5
  },
  {
    id: 'cat_exp_phone',
    name: 'Điện thoại nạp thẻ',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Smartphone',
    color: '#0EA5E9',
    quickTags: ['Nạp tiền điện thoại', 'Thẻ cào'],
    isDefault: true,
    isStarred: false,
    order: 6
  },
  {
    id: 'cat_exp_household',
    name: 'Đồ dùng gia dụng thiết yếu',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Package',
    color: '#14B8A6',
    quickTags: ['Bột giặt', 'Nước xả', 'Kem đánh răng', 'Dầu gội', 'Giấy vệ sinh'],
    isDefault: true,
    isStarred: false,
    order: 7
  },
  {
    id: 'cat_exp_family_support',
    name: 'Gửi tiền về cho Bố Mẹ / Gia đình',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Heart',
    color: '#EC4899',
    quickTags: ['Gửi bố mẹ', 'Phụ gia đình', 'Biếu ông bà'],
    isDefault: true,
    isStarred: false,
    order: 8
  },
  {
    id: 'cat_exp_vehicle_maintenance',
    name: 'Sửa xe & Bảo dưỡng',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Wrench',
    color: '#64748B',
    quickTags: ['Thay nhớt', 'Vá xe', 'Sửa xe', 'Bảo dưỡng định kỳ'],
    isDefault: true,
    isStarred: false,
    order: 9
  },
  {
    id: 'cat_exp_rent',
    name: 'Tiền trọ / Thuê nhà',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Home',
    color: '#3B82F6',
    quickTags: ['Tiền phòng', 'Tiền nhà tháng', 'Cọc phòng'],
    isDefault: true,
    isStarred: false,
    order: 10
  },
  {
    id: 'cat_exp_water',
    name: 'Nước sinh hoạt',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Droplets',
    color: '#06B6D4',
    quickTags: ['Tiền nước tháng'],
    isDefault: true,
    isStarred: false,
    order: 11
  },
  {
    id: 'cat_exp_internet',
    name: 'Mạng Internet / 4G',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'Wifi',
    color: '#8B5CF6',
    quickTags: ['Cước wifi', 'Gói cước 4G'],
    isDefault: true,
    isStarred: false,
    order: 12
  },
  {
    id: 'cat_exp_medicine',
    name: 'Thuốc & Khám bệnh',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'HeartPulse',
    color: '#F43F5E',
    quickTags: ['Thuốc cảm', 'Khám bệnh', 'Khẩu trang', 'Vitamin'],
    isDefault: true,
    isStarred: false,
    order: 13
  },
  {
    id: 'cat_exp_loan_installment',
    name: 'Trả nợ / Trả góp định kỳ',
    type: 'EXPENSE',
    parentId: PARENT_MUST_HAVE_ID,
    icon: 'CreditCard',
    color: '#DC2626',
    quickTags: ['Trả góp điện thoại', 'Trả góp xe', 'Trả nợ vay'],
    isDefault: true,
    isStarred: false,
    order: 14
  },

  // ==========================================
  // 1.2 NICE TO HAVE (11 MỤC CON)
  // ==========================================
  {
    id: 'cat_exp_dining_out',
    name: 'Ăn tiệm & Đặt món',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'UtensilsCrossed',
    color: '#F97316',
    quickTags: ['Ăn sáng', 'Cơm trưa', 'Ăn tối', 'Đặt GrabFood', 'ShopeeFood'],
    isDefault: true,
    isStarred: true,
    order: 0
  },
  {
    id: 'cat_exp_cafe',
    name: 'Cà phê & Trà sữa',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Coffee',
    color: '#D97706',
    quickTags: ['Cà phê sáng', 'Trà sữa', 'Nước ngọt', 'Sinh tố'],
    isDefault: true,
    isStarred: true,
    order: 1
  },
  {
    id: 'cat_exp_clothing',
    name: 'Quần áo & Thời trang',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Shirt',
    color: '#EC4899',
    quickTags: ['Áo quần', 'Giày dép', 'Túi xách'],
    isDefault: true,
    isStarred: false,
    order: 2
  },
  {
    id: 'cat_exp_personal_care',
    name: 'Chăm sóc bản thân (Cắt tóc/Spa)',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Scissors',
    color: '#F472B6',
    quickTags: ['Cắt tóc', 'Gội đầu', 'Mỹ phẩm', 'Skincare'],
    isDefault: true,
    isStarred: false,
    order: 3
  },
  {
    id: 'cat_exp_sports',
    name: 'Cầu lông / Gym',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Activity',
    color: '#22C55E',
    quickTags: ['Tiền sân cầu', 'Mua cầu', 'Tập gym', 'Đan vợt'],
    isDefault: true,
    isStarred: false,
    order: 4
  },
  {
    id: 'cat_exp_online_shopping',
    name: 'Mua sắm online (Shopee)',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'ShoppingBag',
    color: '#FB923C',
    quickTags: ['Shopee', 'Lazada', 'TikTok Shop', 'Mua sắm lặt vặt'],
    isDefault: true,
    isStarred: false,
    order: 5
  },
  {
    id: 'cat_exp_entertainment',
    name: 'Giải trí & Phim ảnh',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Film',
    color: '#8B5CF6',
    quickTags: ['Xem phim rạp', 'Chơi game', 'Bida'],
    isDefault: true,
    isStarred: false,
    order: 6
  },
  {
    id: 'cat_exp_subscription',
    name: 'Gói dịch vụ số (Netflix/Spotify)',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Sparkles',
    color: '#A855F7',
    quickTags: ['Netflix', 'Spotify', 'YouTube Premium', 'iCloud'],
    isDefault: true,
    isStarred: false,
    order: 7
  },
  {
    id: 'cat_exp_travel',
    name: 'Du lịch & Nghỉ dưỡng',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Plane',
    color: '#38BDF8',
    quickTags: ['Vé xe', 'Vé máy bay', 'Khách sạn', 'Tour'],
    isDefault: true,
    isStarred: false,
    order: 8
  },
  {
    id: 'cat_exp_gifts',
    name: 'Hiếu hỷ & Quà cáp',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Gift',
    color: '#FBBF24',
    quickTags: ['Đám cưới', 'Sinh nhật', 'Thôi nôi', 'Quà tặng'],
    isDefault: true,
    isStarred: false,
    order: 9
  },
  {
    id: 'cat_exp_tech_gadgets',
    name: 'Đồ nghề / Phụ kiện công nghệ',
    type: 'EXPENSE',
    parentId: PARENT_NICE_TO_HAVE_ID,
    icon: 'Laptop',
    color: '#3B82F6',
    quickTags: ['Giá đỡ điện thoại', 'Mũ bảo hiểm', 'Pin dự phòng', 'Tai nghe', 'Cáp sạc'],
    isDefault: true,
    isStarred: false,
    order: 10
  },

  // ==========================================
  // 1.3 WASTED (7 MỤC CON)
  // ==========================================
  {
    id: 'cat_exp_impulse_buying',
    name: 'Mua sắm bốc đồng',
    type: 'EXPENSE',
    parentId: PARENT_WASTED_ID,
    icon: 'Flame',
    color: '#EF4444',
    quickTags: ['Mua rồi bỏ xó', 'Thích nhất thời', 'Hối hận'],
    isDefault: true,
    isStarred: false,
    order: 0
  },
  {
    id: 'cat_exp_heavy_drinking',
    name: 'Ăn nhậu quá đà',
    type: 'EXPENSE',
    parentId: PARENT_WASTED_ID,
    icon: 'Beer',
    color: '#EA580C',
    quickTags: ['Bia rượu', 'Tăng 2 tăng 3', 'Nhậu nhẹt'],
    isDefault: true,
    isStarred: false,
    order: 1
  },
  {
    id: 'cat_exp_spoiled_goods',
    name: 'Đồ hỏng & Bỏ quên',
    type: 'EXPENSE',
    parentId: PARENT_WASTED_ID,
    icon: 'Trash2',
    color: '#64748B',
    quickTags: ['Thức ăn hết hạn', 'Đồ để mốc', 'Bỏ quên trong tủ'],
    isDefault: true,
    isStarred: false,
    order: 2
  },
  {
    id: 'cat_exp_fines',
    name: 'Tiền phạt & Lãi phạt',
    type: 'EXPENSE',
    parentId: PARENT_WASTED_ID,
    icon: 'AlertTriangle',
    color: '#DC2626',
    quickTags: ['Phạt giao thông', 'Phạt nộp muộn', 'Lãi quá hạn'],
    isDefault: true,
    isStarred: false,
    order: 3
  },
  {
    id: 'cat_exp_toxic_habits',
    name: 'Thói quen độc hại',
    type: 'EXPENSE',
    parentId: PARENT_WASTED_ID,
    icon: 'AlertCircle',
    color: '#991B1B',
    quickTags: ['Thuốc lá', 'Chất kích thích'],
    isDefault: true,
    isStarred: false,
    order: 4
  },
  {
    id: 'cat_exp_gambling',
    name: 'Trò chơi may rủi (Vé số)',
    type: 'EXPENSE',
    parentId: PARENT_WASTED_ID,
    icon: 'Dice5',
    color: '#7C3AED',
    quickTags: ['Vé số', 'Vé cào', 'Vietlott'],
    isDefault: true,
    isStarred: false,
    order: 5
  },
  {
    id: 'cat_exp_bank_fees',
    name: 'Phí ngân hàng / Hao hụt vặt',
    type: 'EXPENSE',
    parentId: PARENT_WASTED_ID,
    icon: 'Receipt',
    color: '#475569',
    quickTags: ['Phí rút tiền ATM', 'Phí chuyển khoản', 'Hao hụt lặt vặt'],
    isDefault: true,
    isStarred: false,
    order: 6
  },

  // ==========================================
  // 2. KHOẢN THU (INCOME) - 7 MỤC CHUẨN
  // ==========================================
  {
    id: GRAB_INCOME_CAT_ID,
    name: 'Thu nhập GrabBike',
    type: 'INCOME',
    icon: 'Motorcycle',
    color: '#10B981',
    quickTags: ['Cuốc GrabBike', 'Cuốc GrabFood', 'Tiền tip'],
    isDefault: true,
    isStarred: true,
    order: 0
  },
  {
    id: 'cat_income_salary',
    name: 'Lương',
    type: 'INCOME',
    icon: 'Banknote',
    color: '#3B82F6',
    quickTags: ['Lương chuyển khoản', 'Lương cứng', 'Lương tạm ứng'],
    isDefault: true,
    isStarred: false,
    order: 1
  },
  {
    id: 'cat_income_bonus',
    name: 'Thưởng & Làm thêm',
    type: 'INCOME',
    icon: 'TrendingUp',
    color: '#0284C7',
    quickTags: ['Thưởng KPI', 'Thưởng Tết', 'Tăng ca', 'Làm thêm'],
    isDefault: true,
    isStarred: false,
    order: 2
  },
  {
    id: 'cat_income_gift',
    name: 'Được cho tặng',
    type: 'INCOME',
    icon: 'PartyPopper',
    color: '#EC4899',
    quickTags: ['Bố mẹ cho', 'Lì xì', 'Người thân tặng'],
    isDefault: true,
    isStarred: false,
    order: 3
  },
  {
    id: 'cat_income_saving_interest',
    name: 'Lãi tiết kiệm & Đầu tư',
    type: 'INCOME',
    icon: 'Landmark',
    color: '#F59E0B',
    quickTags: ['Lãi có kỳ hạn', 'Lãi không kỳ hạn', 'Lãi cổ tức', 'Lãi chứng khoán'],
    isDefault: true,
    isStarred: false,
    order: 4
  },
  {
    id: 'cat_income_inflow',
    name: 'Thu nhập phụ / Bán đồ cũ',
    type: 'INCOME',
    icon: 'CircleDollarSign',
    color: '#14B8A6',
    quickTags: ['Bán đồ cũ', 'Thanh lý', 'Thu nhập phụ'],
    isDefault: true,
    isStarred: false,
    order: 5
  },
  {
    id: 'cat_income_other',
    name: 'Thu nhập khác',
    type: 'INCOME',
    icon: 'MoreHorizontal',
    color: '#64748B',
    quickTags: ['Khoản thu bất ngờ', 'Lặt vặt'],
    isDefault: true,
    isStarred: false,
    order: 6
  },

  // ==========================================
  // 3. VAY NỢ (DEBT) - 4 OPTION MẶC ĐỊNH (GIỮ NGUYÊN)
  // ==========================================
  {
    id: 'cat_debt_lend',
    name: 'Cho vay',
    type: 'DEBT',
    icon: 'HandCoins',
    color: '#F59E0B',
    quickTags: ['Bạn bè vay', 'Đồng nghiệp mượn', 'Người thân vay'],
    isDefault: true,
    isStarred: false,
    order: 0
  },
  {
    id: 'cat_debt_borrow',
    name: 'Đi vay',
    type: 'DEBT',
    icon: 'Receipt',
    color: '#8B5CF6',
    quickTags: ['Vay ngân hàng', 'Mượn bạn', 'Vay người thân'],
    isDefault: true,
    isStarred: false,
    order: 1
  },
  {
    id: 'cat_debt_collect',
    name: 'Thu nợ',
    type: 'DEBT',
    icon: 'PiggyBank',
    color: '#10B981',
    quickTags: ['Thu nợ bạn trả', 'Thu hồi nợ cũ'],
    isDefault: true,
    isStarred: false,
    order: 2
  },
  {
    id: 'cat_debt_pay',
    name: 'Trả nợ',
    type: 'DEBT',
    icon: 'CreditCard',
    color: '#EF4444',
    quickTags: ['Trả nợ ngân hàng', 'Trả tiền bạn', 'Thanh toán thẻ tín dụng'],
    isDefault: true,
    isStarred: false,
    order: 3
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
        color: '#10B981',
        order: 0
      },
      {
        id: PARENT_NICE_TO_HAVE_ID,
        name: 'Nice to have (Nâng cao)',
        type: 'EXPENSE' as const,
        icon: 'Sparkles',
        color: '#3B82F6',
        order: 1
      },
      {
        id: PARENT_WASTED_ID,
        name: 'Wasted (Lãng phí)',
        type: 'EXPENSE' as const,
        icon: 'AlertCircle',
        color: '#EF4444',
        order: 2
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
          isStarred: false,
          order: p.order,
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
          order: item.order ?? 0,
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

/**
 * Đảm bảo đồng bộ và chuẩn hóa toàn bộ danh mục v7:
 * - 3 nhóm cha EXPENSE (Must have, Nice to have, Wasted)
 * - 14 mục con Must have, 12 mục con Nice to have, 7 mục con Wasted (tất cả isStarred: false)
 * - 7 mục chuẩn INCOME (Lương, Thưởng & Làm thêm, Được cho tặng, Lãi tiết kiệm & Đầu tư, Thu nhập phụ / Bán đồ cũ, Thu nhập khác, Thu nhập GrabBike)
 * - 4 mục chuẩn DEBT (Cho vay, Đi vay, Thu nợ, Trả nợ)
 * - Remap toàn bộ giao dịch lịch sử từ ID cũ/trùng lặp sang ID chuẩn canonical
 * - Cập nhật parentId của các danh mục con tùy chỉnh (như TMA) về đúng ID cha chuẩn
 * - Xóa các danh mục cũ dư thừa
 */
export async function ensureStandardizedCategories(force = false): Promise<void> {
  if (!force) {
    const versionSetting = await db.settings.get('has_synced_categories_v8');
    if (versionSetting?.value) {
      return;
    }
  }

  const now = new Date().toISOString();
  await db.transaction(
    'rw',
    [db.categories, db.transactions, db.budgets, db.recurringTransactions, db.settings],
    async () => {
      // 1. Lấy danh sách danh mục hiện tại
      const existingCats = await db.categories.toArray();

      // Bản đồ chuẩn hóa tên (lowercase trim) -> canonical ID
      const nameToCanonicalId: Record<string, string> = {
        // Must have
        'đi chợ': 'cat_exp_groceries',
        'chợ': 'cat_exp_groceries',
        'đi chợ & nấu ăn': 'cat_exp_groceries',
        'thực phẩm': 'cat_exp_groceries',
        'xăng': 'cat_exp_fuel',
        'xăng xe': 'cat_exp_fuel',
        'xăng xe đi lại': 'cat_exp_fuel',
        'đi lại & xăng xe cơ bản': 'cat_exp_fuel',
        'hư xe': 'cat_exp_vehicle_maintenance',
        'sửa xe': 'cat_exp_vehicle_maintenance',
        'sửa xe & bảo dưỡng': 'cat_exp_vehicle_maintenance',
        'bảo dưỡng xe': 'cat_exp_vehicle_maintenance',
        'trọ': 'cat_exp_rent',
        'tiền trọ': 'cat_exp_rent',
        'tiền trọ / thuê nhà': 'cat_exp_rent',
        'nhà cửa & tiện ích': 'cat_exp_rent',
        'thuê nhà': 'cat_exp_rent',
        'điện': 'cat_exp_electricity',
        'điện sinh hoạt': 'cat_exp_electricity',
        'tiền điện': 'cat_exp_electricity',
        'nước': 'cat_exp_water',
        'nước sinh hoạt': 'cat_exp_water',
        'tiền nước': 'cat_exp_water',
        'internet': 'cat_exp_internet',
        'mạng internet / 4g': 'cat_exp_internet',
        'wifi': 'cat_exp_internet',
        'mạng 4g': 'cat_exp_internet',
        'điện thoại': 'cat_exp_phone',
        'điện thoại nạp thẻ': 'cat_exp_phone',
        'nạp card': 'cat_exp_phone',
        'nạp thẻ': 'cat_exp_phone',
        'thuốc & khám bệnh': 'cat_exp_medicine',
        'thuốc': 'cat_exp_medicine',
        'khám bệnh': 'cat_exp_medicine',
        'y tế & sức khỏe': 'cat_exp_medicine',
        'đồ sinh hoạt thiết yếu': 'cat_exp_household',
        'đồ dùng gia dụng thiết yếu': 'cat_exp_household',
        'đồ gia dụng': 'cat_exp_household',
        'gửi tiền về cho bố mẹ / gia đình': 'cat_exp_family_support',
        'bố mẹ': 'cat_exp_family_support',
        'gia đình': 'cat_exp_family_support',
        'biếu bố mẹ': 'cat_exp_family_support',
        'bảo hiểm (y tế / xe máy / tai nạn)': 'cat_exp_insurance',
        'bảo hiểm': 'cat_exp_insurance',
        'trả nợ / trả góp định kỳ': 'cat_exp_loan_installment',
        'trả góp': 'cat_exp_loan_installment',
        'phí dịch vụ grab': GRAB_FEE_CAT_ID,
        'giáo dục & con cái': 'cat_exp_education',
        'giáo dục': 'cat_exp_education',
        'con cái': 'cat_exp_education',

        // Nice to have
        'ăn tiệm': 'cat_exp_dining_out',
        'ăn tiệm & đặt món': 'cat_exp_dining_out',
        'ăn ngoài & đặt món': 'cat_exp_dining_out',
        'ăn ngoài': 'cat_exp_dining_out',
        'cà phê & nước ngọt': 'cat_exp_cafe',
        'cà phê & trà sữa': 'cat_exp_cafe',
        'cà phê': 'cat_exp_cafe',
        'trà sữa': 'cat_exp_cafe',
        'quần áo': 'cat_exp_clothing',
        'quần áo & thời trang': 'cat_exp_clothing',
        'mua sắm & làm đẹp': 'cat_exp_clothing',
        'skincare/cắt tóc': 'cat_exp_personal_care',
        'chăm sóc bản thân (cắt tóc/spa)': 'cat_exp_personal_care',
        'cắt tóc': 'cat_exp_personal_care',
        'cầu lông': 'cat_exp_sports',
        'cầu lông / gym': 'cat_exp_sports',
        'thể thao & rèn luyện': 'cat_exp_sports',
        'gym': 'cat_exp_sports',
        'shopee': 'cat_exp_online_shopping',
        'mua sắm online (shopee)': 'cat_exp_online_shopping',
        'mua sắm online': 'cat_exp_online_shopping',
        'giải trí & phim ảnh': 'cat_exp_entertainment',
        'giải trí': 'cat_exp_entertainment',
        'gói sub': 'cat_exp_subscription',
        'gói dịch vụ số (netflix/spotify)': 'cat_exp_subscription',
        'subscription': 'cat_exp_subscription',
        'du lịch/trải nghiệm': 'cat_exp_travel',
        'du lịch & nghỉ dưỡng': 'cat_exp_travel',
        'du lịch': 'cat_exp_travel',
        'hiếu hỷ/quà tặng': 'cat_exp_gifts',
        'hiếu hỉ & quà tặng': 'cat_exp_gifts',
        'hiếu hỷ & quà cáp': 'cat_exp_gifts',
        'quà tặng': 'cat_exp_gifts',
        'học tập / nâng cao tay nghề': 'cat_exp_education',
        'học tập': 'cat_exp_education',
        'đồ nghề / phụ kiện công nghệ': 'cat_exp_tech_gadgets',
        'phụ kiện công nghệ': 'cat_exp_tech_gadgets',
        'đồ công nghệ': 'cat_exp_tech_gadgets',

        // Wasted
        'mua sắm bốc đồng': 'cat_exp_impulse_buying',
        'ăn nhậu quá đà': 'cat_exp_heavy_drinking',
        'đồ hỏng & bỏ quên': 'cat_exp_spoiled_goods',
        'tiền phạt & lãi phạt': 'cat_exp_fines',
        'thói quen độc hại': 'cat_exp_toxic_habits',
        'trò chơi may rủi (vé số)': 'cat_exp_gambling',
        'phí ngân hàng / hao hụt vặt': 'cat_exp_bank_fees',

        // Income
        'thu nhập grabbike': GRAB_INCOME_CAT_ID,
        'lương': 'cat_income_salary',
        'lương chính': 'cat_income_salary',
        'tiền lương': 'cat_income_salary',
        'thưởng': 'cat_income_bonus',
        'thưởng & làm thêm': 'cat_income_bonus',
        'được cho tặng': 'cat_income_gift',
        'lãi tiết kiệm & đầu tư': 'cat_income_saving_interest',
        'lãi tiết kiệm': 'cat_income_saving_interest',
        'tiền lãi': 'cat_income_saving_interest',
        'lãi ngân hàng': 'cat_income_saving_interest',
        'thu nhập phụ / bán đồ cũ': 'cat_income_inflow',
        'tiền vào': 'cat_income_inflow',
        'bán đồ cũ': 'cat_income_inflow',
        'thu nhập khác': 'cat_income_other',
        'khác': 'cat_income_other',

        // Debt
        'cho vay': 'cat_debt_lend',
        'đi vay': 'cat_debt_borrow',
        'thu nợ': 'cat_debt_collect',
        'trả nợ': 'cat_debt_pay',

        // System
        'điều chỉnh số dư': 'system_adjustment'
      };

      // Mapping ID cũ trực tiếp sang canonical ID
      const idRedirectMap: Record<string, string> = {
        'a0dbecb5-c095-46b6-a815-56041ec1a2b0': 'cat_exp_groceries',
        '167fa941-893c-4468-b7a4-846387063fe3': 'cat_exp_fuel',
        '9fc39bb0-d790-449e-b83c-1b7e0bbdd832': 'cat_exp_vehicle_maintenance',
        '6bfdf6c5-ea57-41a4-9e8a-e95a9437ddc5': 'cat_exp_rent',
        'fdf07ff8-29ca-4db0-bbfa-61cbfd27d71b': 'cat_exp_electricity',
        'b3858cbe-dfad-42ca-bb0f-0fc35081c784': 'cat_exp_water',
        '51fe05b0-df51-40be-b51c-b5f7fcefc85e': 'cat_exp_internet',
        'cf8d0e7e-324b-4899-b1d5-bc5cb2a2cb87': 'cat_exp_phone',
        '8a7b973d-9d41-4770-9889-fc2d4dfca2ff': 'cat_exp_medicine',
        'ae4cfb87-73d7-4638-9cb5-bb55fc186db1': 'cat_exp_household',
        '2d3b259d-6490-4828-b80c-0973a870d065': 'cat_exp_dining_out',
        '20cf8c42-a25e-49b4-b4a1-0ca2da2fa84b': 'cat_exp_cafe',
        'c0fb01b5-199f-442d-965a-0498b965f9ff': 'cat_exp_clothing',
        'ae054f46-da10-449e-b6d8-eb5cf5a0604b': 'cat_exp_personal_care',
        '2dbca35e-c762-42da-9ae0-a5fe9bc353bc': 'cat_exp_sports',
        'a18ff5c2-f949-41e9-9184-e40344d5c165': 'cat_exp_online_shopping',
        '68fbe0d8-1e4e-4f36-932d-0a2a46dbcb4e': 'cat_exp_subscription',
        '95df0eb1-140a-4286-9a2c-9694e99fc31a': 'cat_exp_travel',
        '2895bf33-28f0-4fa0-86da-285145781604': 'cat_exp_gifts',
        '8ebec932-ae6a-4952-b88d-e0ee54e19b02': 'cat_income_salary',
        '460b37f4-fe11-4fa3-94c3-d083818e692a': 'cat_income_bonus',
        'a3c42805-a3d8-4f27-be8e-17a0225d3a56': 'cat_income_gift',
        '970ba711-6679-4a00-ba53-6ec21a221f70': 'cat_income_saving_interest',
        '311fe1e2-b7b5-4bfe-a28a-ce42be1508db': 'cat_income_saving_interest',
        '376045d6-d74c-473c-ba30-7c2a7e7a83d7': 'cat_income_inflow',
        'bf23fe9b-d748-43d8-ad97-e7d6928e100f': 'cat_income_other',
        '64a4b127-ec14-411a-b328-765f02f928e6': 'cat_income_other',
        '806c6fa8-a55b-4e4f-8e42-dc3072cc3749': 'cat_exp_education'
      };

      const canonicalIdSet = new Set(SEED_CATEGORIES.map((s) => s.id).filter(Boolean) as string[]);
      canonicalIdSet.add('system_adjustment');

      // Quét existingCats để bổ sung idRedirectMap dựa trên tên
      for (const cat of existingCats) {
        if (cat.name.trim().toLowerCase() === 'tma') continue;

        const cleanName = cat.name.trim().toLowerCase();
        const targetId = nameToCanonicalId[cleanName];
        if (targetId && cat.id !== targetId) {
          idRedirectMap[cat.id] = targetId;
        }
      }

      // 2. Upsert tất cả SEED_CATEGORIES (đảm bảo đầy đủ 15 Must have, 11 Nice to have, 7 Wasted, 7 Income, 4 Debt)
      const existingById = new Map(existingCats.map((c) => [c.id, c]));
      for (const seed of SEED_CATEGORIES) {
        if (!seed.id) continue;
        const exist = existingById.get(seed.id);
        const mappedOldCat = existingCats.find((c) => idRedirectMap[c.id] === seed.id);
        const resolvedStarred = exist?.isStarred !== undefined
          ? exist.isStarred
          : (mappedOldCat?.isStarred !== undefined ? mappedOldCat.isStarred : (seed.isStarred ?? false));
        const resolvedOrder = exist?.order !== undefined
          ? exist.order
          : (mappedOldCat?.order !== undefined ? mappedOldCat.order : (seed.order ?? 0));

        if (exist) {
          await db.categories.update(seed.id, {
            name: seed.name,
            type: seed.type,
            parentId: seed.parentId,
            icon: seed.icon,
            color: seed.color,
            quickTags: seed.quickTags || [],
            isDefault: true,
            isStarred: resolvedStarred,
            order: resolvedOrder,
            updatedAt: now
          });
        } else {
          await db.categories.put({
            id: seed.id,
            name: seed.name,
            type: seed.type,
            parentId: seed.parentId,
            icon: seed.icon,
            color: seed.color,
            quickTags: seed.quickTags || [],
            isDefault: true,
            isStarred: resolvedStarred,
            order: resolvedOrder,
            createdAt: now,
            updatedAt: now
          });
        }
      }

      // Đảm bảo system_adjustment tồn tại
      const sysAdj = existingById.get('system_adjustment');
      if (!sysAdj) {
        await db.categories.put({
          id: 'system_adjustment',
          name: 'Điều chỉnh số dư',
          type: 'EXPENSE',
          icon: 'SlidersHorizontal',
          color: '#64748B',
          quickTags: ['Khớp tiền thực tế', 'Tiền chênh lệch', 'Kiểm kê'],
          isDefault: true,
          isStarred: false,
          createdAt: now,
          updatedAt: now
        });
      }

      // 3. Đồng bộ giao dịch lịch sử sang Canonical Category ID
      const allTxs = await db.transactions.toArray();
      for (const tx of allTxs) {
        if (tx.categoryId && idRedirectMap[tx.categoryId]) {
          const canonicalId = idRedirectMap[tx.categoryId];
          await db.transactions.update(tx.id, {
            categoryId: canonicalId,
            updatedAt: now
          });
        }
      }

      // 4. Đồng bộ Budgets nếu có tham chiếu ID cũ
      const allBudgets = await db.budgets.toArray();
      for (const b of allBudgets) {
        if (b.categoryId && idRedirectMap[b.categoryId]) {
          await db.budgets.update(b.id, {
            categoryId: idRedirectMap[b.categoryId]
          });
        }
      }

      // 5. Đồng bộ Recurring Transactions nếu có tham chiếu ID cũ
      const allRecs = await db.recurringTransactions.toArray();
      for (const r of allRecs) {
        if (r.categoryId && idRedirectMap[r.categoryId]) {
          await db.recurringTransactions.update(r.id, {
            categoryId: idRedirectMap[r.categoryId]
          });
        }
      }

      // 6. Cập nhật parentId của các danh mục con tùy chỉnh (như TMA) hoặc danh mục con có parentId cũ
      for (const cat of existingCats) {
        if (cat.name.trim().toLowerCase() === 'tma') {
          await db.categories.update(cat.id, {
            parentId: 'cat_income_salary',
            type: 'INCOME',
            order: cat.order ?? 99,
            updatedAt: now
          });
          continue;
        }

        if (cat.parentId && idRedirectMap[cat.parentId]) {
          await db.categories.update(cat.id, {
            parentId: idRedirectMap[cat.parentId],
            updatedAt: now
          });
        }
      }

      // 7. Xóa các danh mục cũ/trùng lặp đã được chuyển hướng sang canonical ID
      for (const oldId of Object.keys(idRedirectMap)) {
        if (!canonicalIdSet.has(oldId)) {
          await db.categories.delete(oldId);
        }
      }

      // 8. Đánh dấu đã hoàn thành đồng bộ chuẩn v8
      await db.settings.put({
        key: 'has_synced_categories_v8',
        value: true
      });
      await db.settings.put({
        key: 'has_seeded_categories_v6',
        value: true
      });
    }
  );
}

export async function initializeSeedData(): Promise<void> {
  await requestPersistentStorage();
  await runWithoutDirtyTracking(async () => {
    await ensureDefaultSettings();
    await ensureDefaultWallets();
    await ensureHierarchicalCategories();
    await ensureStandardizedCategories();
    await ensureGrabCategories();

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
