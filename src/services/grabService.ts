// src/services/grabService.ts
import { db } from '../db';
import { generateUUID } from '../utils/uuid';
import { PARENT_MUST_HAVE_ID } from '../db/seed';
import type { Wallet, Transaction } from '../types';

export const GRAB_SETTING_CREDIT_WALLET = 'grab_credit_wallet_id';
export const GRAB_SETTING_CASH_WALLET = 'grab_cash_wallet_id';
export const GRAB_SETTING_PHYSICAL_CASH_WALLET = 'grab_physical_cash_wallet_id';

export const GRAB_INCOME_CAT_ID = 'cat_income_grab';
export const GRAB_FEE_CAT_ID = 'cat_expense_grab_fee';

export interface GrabWalletsConfig {
  creditWalletId: string;
  grabCashWalletId: string;
  physicalCashWalletId: string;
  isReady: boolean;
}

/**
 * Đảm bảo 2 danh mục Grab (Thu nhập chạy Grab & Phí chiết khấu Grab) luôn tồn tại
 */
export async function ensureGrabCategories(): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', [db.categories], async () => {
    const incomeCat = await db.categories.get(GRAB_INCOME_CAT_ID);
    if (!incomeCat) {
      await db.categories.put({
        id: GRAB_INCOME_CAT_ID,
        name: 'Thu nhập chạy Grab',
        type: 'INCOME',
        icon: 'Car',
        color: '#00B14F',
        quickTags: ['Cuốc GrabBike', 'Cuốc GrabCar', 'Cuốc GrabFood', 'Tiền tip Grab', 'Thưởng cuốc'],
        isDefault: true,
        isStarred: true,
        createdAt: now,
        updatedAt: now
      });
    }

    const feeCat = await db.categories.get(GRAB_FEE_CAT_ID);
    if (!feeCat) {
      await db.categories.put({
        id: GRAB_FEE_CAT_ID,
        name: 'Phí dịch vụ Grab',
        type: 'EXPENSE',
        parentId: PARENT_MUST_HAVE_ID,
        icon: 'Percent',
        color: '#EF4444',
        quickTags: ['Chiết khấu Grab', 'Phí nền tảng Grab', 'Thuế Grab'],
        isDefault: true,
        createdAt: now,
        updatedAt: now
      });
    }
  });
}

/**
 * Tự động tạo 2 ví Grab mẫu nếu người dùng chưa có
 */
export async function createDefaultGrabWallets(): Promise<{
  creditWallet: Wallet;
  grabCashWallet: Wallet;
}> {
  const now = new Date().toISOString();
  const creditId = generateUUID();
  const cashId = generateUUID();

  const creditWallet: Wallet = {
    id: creditId,
    name: 'Ví Tín Dụng Grab',
    type: 'E_WALLET',
    balance: 200000, // Số dư mẫu để chạy cuốc
    initialBalance: 200000,
    currency: 'VND',
    icon: 'Car',
    color: '#00B14F',
    isExcludedFromTotal: false,
    createdAt: now,
    updatedAt: now
  };

  const grabCashWallet: Wallet = {
    id: cashId,
    name: 'Ví Tiền Mặt Grab',
    type: 'E_WALLET',
    balance: 0,
    initialBalance: 0,
    currency: 'VND',
    icon: 'Wallet',
    color: '#00B14F',
    isExcludedFromTotal: false,
    createdAt: now,
    updatedAt: now
  };

  await db.transaction('rw', [db.wallets, db.settings], async () => {
    await db.wallets.add(creditWallet);
    await db.wallets.add(grabCashWallet);

    await db.settings.put({ key: GRAB_SETTING_CREDIT_WALLET, value: creditId });
    await db.settings.put({ key: GRAB_SETTING_CASH_WALLET, value: cashId });
  });

  await ensureGrabCategories();

  return { creditWallet, grabCashWallet };
}

/**
 * Lấy cấu hình các ví dành cho Grab
 */
export async function getGrabWalletsConfig(): Promise<GrabWalletsConfig> {
  const [creditSetting, grabCashSetting, physicalCashSetting, allWallets] = await Promise.all([
    db.settings.get(GRAB_SETTING_CREDIT_WALLET),
    db.settings.get(GRAB_SETTING_CASH_WALLET),
    db.settings.get(GRAB_SETTING_PHYSICAL_CASH_WALLET),
    db.wallets.toArray()
  ]);

  let creditWalletId = (creditSetting?.value as string) || '';
  let grabCashWalletId = (grabCashSetting?.value as string) || '';
  let physicalCashWalletId = (physicalCashSetting?.value as string) || '';

  // Tự động nhận diện nếu chưa được cấu hình
  if (!creditWalletId) {
    const found = allWallets.find((w) => {
      const n = w.name.toLowerCase();
      return n.includes('grab') && (n.includes('tín dụng') || n.includes('credit'));
    });
    if (found) creditWalletId = found.id;
  }

  if (!grabCashWalletId) {
    const found = allWallets.find((w) => {
      const n = w.name.toLowerCase();
      return n.includes('grab') && (n.includes('tiền mặt') || n.includes('cash'));
    });
    if (found) grabCashWalletId = found.id;
  }

  if (!physicalCashWalletId) {
    const found = allWallets.find((w) => {
      const n = w.name.toLowerCase();
      return w.type === 'CASH' && !n.includes('grab');
    }) || allWallets.find((w) => w.type === 'CASH');
    if (found) physicalCashWalletId = found.id;
  }

  const hasCredit = allWallets.some((w) => w.id === creditWalletId);
  const hasGrabCash = allWallets.some((w) => w.id === grabCashWalletId);
  const hasPhysical = allWallets.some((w) => w.id === physicalCashWalletId);

  return {
    creditWalletId,
    grabCashWalletId,
    physicalCashWalletId,
    isReady: Boolean(hasCredit && hasGrabCash && hasPhysical)
  };
}

/**
 * Lưu cấu hình các ví được chọn cho Grab
 */
export async function saveGrabWalletsConfig(config: {
  creditWalletId: string;
  grabCashWalletId: string;
  physicalCashWalletId: string;
}): Promise<void> {
  await db.transaction('rw', [db.settings], async () => {
    if (config.creditWalletId) {
      await db.settings.put({ key: GRAB_SETTING_CREDIT_WALLET, value: config.creditWalletId });
    }
    if (config.grabCashWalletId) {
      await db.settings.put({ key: GRAB_SETTING_CASH_WALLET, value: config.grabCashWalletId });
    }
    if (config.physicalCashWalletId) {
      await db.settings.put({ key: GRAB_SETTING_PHYSICAL_CASH_WALLET, value: config.physicalCashWalletId });
    }
  });
}

export interface SaveGrabTripParams {
  paymentMethod: 'CASH' | 'CARD';
  cashReceived: number; // Tiền mặt khách đưa (nếu là CASH)
  netIncome: number;    // Thu nhập ròng hiển thị trên app Grab
  creditWalletId: string;
  grabCashWalletId: string;
  physicalCashWalletId: string;
  date: string;
  time: string;
  note?: string;
}

/**
 * Ghi 1 cuốc Grab tự động phân phối nguồn tiền theo chuẩn ACID kép:
 * - Khách trả THẺ:
 *   + Ví Tiền Mặt Grab (app) được cộng +netIncome
 *   + Ghi 1 giao dịch THU NHẬP
 *
 * - Khách trả TIỀN MẶT:
 *   + Ví Tiền Mặt Ngoài Đời được cộng +cashReceived (tiền khách đưa vào túi)
 *   + Ví Tín Dụng Grab bị trừ -grabFee (grabFee = cashReceived - netIncome)
 *   + Ghi 1 giao dịch THU NHẬP bằng cashReceived
 *   + Ghi 1 giao dịch CHI TIÊU bằng grabFee (Phí chiết khấu Grab)
 *   => Tổng tài sản thay đổi đúng: cashReceived - grabFee = netIncome!
 */
export async function recordGrabTrip(params: SaveGrabTripParams): Promise<{
  netIncome: number;
  grabFee: number;
  transactionIds: string[];
}> {
  const {
    paymentMethod,
    cashReceived,
    netIncome,
    creditWalletId,
    grabCashWalletId,
    physicalCashWalletId,
    date,
    time,
    note
  } = params;

  if (netIncome <= 0 && cashReceived <= 0) {
    throw new Error('Số tiền phải lớn hơn 0');
  }

  await ensureGrabCategories();

  const now = new Date().toISOString();
  const txIds: string[] = [];
  let grabFee = 0;

  await db.transaction('rw', [db.wallets, db.transactions, db.settings], async () => {
    if (paymentMethod === 'CARD') {
      // 1. Khách trả qua Thẻ/Ví: Chỉ tăng Ví Tiền Mặt Grab (app)
      const grabCashWallet = await db.wallets.get(grabCashWalletId);
      if (!grabCashWallet) throw new Error('Ví Tiền Mặt Grab không tồn tại');

      await db.wallets.update(grabCashWalletId, {
        balance: grabCashWallet.balance + netIncome,
        updatedAt: now
      });

      const txId = generateUUID();
      const newTx: Transaction = {
        id: txId,
        walletId: grabCashWalletId,
        categoryId: GRAB_INCOME_CAT_ID,
        type: 'INCOME',
        amount: netIncome,
        date,
        time,
        note: note?.trim() ? `[Grab Thẻ] ${note.trim()}` : 'Cuốc Grab - Khách trả thẻ/ví',
        createdAt: now,
        updatedAt: now
      };
      await db.transactions.add(newTx);
      txIds.push(txId);
    } else {
      // 2. Khách trả TIỀN MẶT:
      const physicalCashWallet = await db.wallets.get(physicalCashWalletId);
      if (!physicalCashWallet) throw new Error('Ví Tiền Mặt ngoài đời không tồn tại');

      const creditWallet = await db.wallets.get(creditWalletId);
      if (!creditWallet) throw new Error('Ví Tín Dụng Grab không tồn tại');

      grabFee = Math.max(0, cashReceived - netIncome);

      // 2.1 Cộng tiền mặt khách đưa vào Ví Tiền Mặt ngoài đời (Túi/Bóp)
      await db.wallets.update(physicalCashWalletId, {
        balance: physicalCashWallet.balance + cashReceived,
        updatedAt: now
      });

      const incomeTxId = generateUUID();
      const incomeTx: Transaction = {
        id: incomeTxId,
        walletId: physicalCashWalletId,
        categoryId: GRAB_INCOME_CAT_ID,
        type: 'INCOME',
        amount: cashReceived,
        date,
        time,
        note: note?.trim()
          ? `[Grab Tiền mặt] ${note.trim()} (Ròng: +${new Intl.NumberFormat('vi-VN').format(netIncome)}₫)`
          : `Cuốc Grab - Tiền mặt khách trả (Ròng: +${new Intl.NumberFormat('vi-VN').format(netIncome)}₫)`,
        createdAt: now,
        updatedAt: now
      };
      await db.transactions.add(incomeTx);
      txIds.push(incomeTxId);

      // 2.2 Trừ tiền chiết khấu hoa hồng Grab khỏi Ví Tín Dụng Grab (nếu có phí)
      if (grabFee > 0) {
        await db.wallets.update(creditWalletId, {
          balance: creditWallet.balance - grabFee,
          updatedAt: now
        });

        const feeTxId = generateUUID();
        const feeTx: Transaction = {
          id: feeTxId,
          walletId: creditWalletId,
          categoryId: GRAB_FEE_CAT_ID,
          type: 'EXPENSE',
          amount: grabFee,
          date,
          time,
          note: `Chiết khấu phí Grab (${new Intl.NumberFormat('vi-VN').format(grabFee)}₫) - Cuốc ${new Intl.NumberFormat('vi-VN').format(cashReceived)}₫`,
          createdAt: now,
          updatedAt: now
        };
        await db.transactions.add(feeTx);
        txIds.push(feeTxId);
      }

      // 2.3 Trường hợp đặc biệt: Khách áp mã giảm giá (cashReceived < netIncome)
      // Grab trợ giá tiền voucher vào Ví Tiền Mặt Grab
      if (cashReceived < netIncome) {
        const subsidy = netIncome - cashReceived;
        const grabCashWallet = await db.wallets.get(grabCashWalletId);
        if (grabCashWallet) {
          await db.wallets.update(grabCashWalletId, {
            balance: grabCashWallet.balance + subsidy,
            updatedAt: now
          });

          const subsidyTxId = generateUUID();
          await db.transactions.add({
            id: subsidyTxId,
            walletId: grabCashWalletId,
            categoryId: GRAB_INCOME_CAT_ID,
            type: 'INCOME',
            amount: subsidy,
            date,
            time,
            note: `Grab trợ giá khuyến mãi cuốc xe (+${new Intl.NumberFormat('vi-VN').format(subsidy)}₫)`,
            createdAt: now,
            updatedAt: now
          });
          txIds.push(subsidyTxId);
        }
      }
    }
  });

  return { netIncome, grabFee, transactionIds: txIds };
}
