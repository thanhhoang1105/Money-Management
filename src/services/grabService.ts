// src/services/grabService.ts
import { useLiveQuery } from 'dexie-react-hooks';
import { db, runWithoutDirtyTracking } from '../db';
import { generateUUID } from '../utils/uuid';
import {
  PARENT_MUST_HAVE_ID,
  GRAB_INCOME_CAT_ID,
  GRAB_FEE_CAT_ID
} from '../db/seed';
import type { Wallet, Transaction } from '../types';

export { GRAB_INCOME_CAT_ID, GRAB_FEE_CAT_ID };

export const GRAB_SETTING_ENABLED = 'grab_driver_mode_enabled';
export const GRAB_SETTING_CREDIT_WALLET = 'grab_credit_wallet_id';
export const GRAB_SETTING_CASH_WALLET = 'grab_cash_wallet_id';
export const GRAB_SETTING_PHYSICAL_CASH_WALLET = 'grab_physical_cash_wallet_id';

/**
 * Hook kiểm tra trạng thái bật/tắt nghiệp vụ Tài xế GrabBike.
 * Tự động đồng bộ phản ứng thời gian thực khi người dùng gạt công tắc trong Cài đặt.
 * - Mặc định với người dùng mới: false (TẮT).
 * - Tự động nhận diện với người dùng cũ (đã có ví hoặc giao dịch Grab): true (BẬT).
 */
export function useGrabDriverMode(): boolean {
  const setting = useLiveQuery(() => db.settings.get(GRAB_SETTING_ENABLED));
  const creditSetting = useLiveQuery(() => db.settings.get(GRAB_SETTING_CREDIT_WALLET));
  const cashSetting = useLiveQuery(() => db.settings.get(GRAB_SETTING_CASH_WALLET));

  if (setting !== undefined) {
    return Boolean(setting?.value);
  }

  // Tự động giữ BẬT cho người dùng đã cấu hình ví Grab từ trước
  if (creditSetting?.value || cashSetting?.value) {
    return true;
  }

  return false;
}

/**
 * Cập nhật trạng thái BẬT/TẮT tính năng Tài xế GrabBike vào IndexedDB
 */
export async function setGrabDriverModeEnabled(enabled: boolean): Promise<void> {
  await db.settings.put({
    key: GRAB_SETTING_ENABLED,
    value: enabled
  });
}

export interface GrabWalletsConfig {
  creditWalletId: string;
  grabCashWalletId: string;
  isReady: boolean;
}

/**
 * Đảm bảo 2 danh mục Grab (Thu nhập chạy Grab & Phí chiết khấu Grab) luôn tồn tại
 */
export async function ensureGrabCategories(): Promise<void> {
  const now = new Date().toISOString();
  await runWithoutDirtyTracking(async () => {
    await db.transaction('rw', [db.categories], async () => {
      const incomeCat = await db.categories.get(GRAB_INCOME_CAT_ID);
      if (!incomeCat) {
        await db.categories.put({
          id: GRAB_INCOME_CAT_ID,
          name: 'Thu nhập GrabBike',
          type: 'INCOME',
          icon: 'Motorcycle',
          color: '#00B14F',
          quickTags: ['Cuốc GrabBike', 'Cuốc GrabFood', 'Cuốc GrabExpress', 'Tiền tip Grab', 'Thưởng cuốc'],
          isDefault: true,
          isStarred: true,
          createdAt: now,
          updatedAt: now
        });
      } else if (incomeCat.icon !== 'Motorcycle' || incomeCat.name !== 'Thu nhập GrabBike') {
        await db.categories.update(GRAB_INCOME_CAT_ID, {
          icon: 'Motorcycle',
          name: 'Thu nhập GrabBike',
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
      } else if (feeCat.name !== 'Phí dịch vụ Grab' || feeCat.icon !== 'Percent') {
        await db.categories.update(GRAB_FEE_CAT_ID, {
          name: 'Phí dịch vụ Grab',
          icon: 'Percent',
          color: '#EF4444',
          updatedAt: now
        });
      }
    });
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
    balance: 200000,
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
 * Lấy cấu hình 2 ví nội bộ dành riêng cho App Grab
 */
export async function getGrabWalletsConfig(): Promise<GrabWalletsConfig> {
  const [creditSetting, grabCashSetting, allWallets] = await Promise.all([
    db.settings.get(GRAB_SETTING_CREDIT_WALLET),
    db.settings.get(GRAB_SETTING_CASH_WALLET),
    db.wallets.toArray()
  ]);

  let creditWalletId = (creditSetting?.value as string) || '';
  let grabCashWalletId = (grabCashSetting?.value as string) || '';

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

  const hasCredit = allWallets.some((w) => w.id === creditWalletId);
  const hasGrabCash = allWallets.some((w) => w.id === grabCashWalletId);

  return {
    creditWalletId,
    grabCashWalletId,
    isReady: Boolean(hasCredit && hasGrabCash)
  };
}

/**
 * Lưu cấu hình 2 ví Grab nội bộ
 */
export async function saveGrabWalletsConfig(config: {
  creditWalletId: string;
  grabCashWalletId: string;
}): Promise<void> {
  await db.transaction('rw', [db.settings], async () => {
    if (config.creditWalletId) {
      await db.settings.put({ key: GRAB_SETTING_CREDIT_WALLET, value: config.creditWalletId });
    }
    if (config.grabCashWalletId) {
      await db.settings.put({ key: GRAB_SETTING_CASH_WALLET, value: config.grabCashWalletId });
    }
  });
}

export interface SaveGrabTripParams {
  paymentMethod: 'CASH' | 'CARD';
  grabFare?: number;           // Giá cước cuốc xe hiển thị trên app Grab (vd 25.000₫)
  cashReceived: number;        // Tiền khách thực tế đưa cho tài xế (vd 45.000₫ hoặc 25.000₫)
  netIncome: number;           // Thu nhập ròng hiển thị trên app Grab (vd 20.000₫)
  tipAmount?: number;          // Tiền tip khách cho
  tipType?: 'CASH' | 'IN_APP'; // 'CASH' (đưa trực tiếp/khỏi thối) hoặc 'IN_APP' (bo qua app)
  creditWalletId: string;      // Ví Tín Dụng Grab
  grabCashWalletId: string;    // Ví Tiền Mặt Grab trên app
  receivingWalletId?: string;  // Ví nhận tiền thực tế từ khách (Tiền mặt, Vietcombank, MoMo...)
  physicalCashWalletId?: string; // Tương thích ngược
  date: string;
  time: string;
  note?: string;
}

export interface SaveGrabTripResult {
  netIncome: number;
  grabFee: number;
  voucherSubsidy: number;
  tipAmount: number;
  totalEarned: number;
  workingCapital?: number;     // Tương thích ngược
  transactionIds: string[];
}

/**
 * Ghi 1 cuốc xe Grab chuẩn xác 100% theo dòng tiền thực tế trên app Grab Driver:
 *
 * 1. Cuốc khách trả Thẻ/Ví (CARD):
 *    - Thu nhập ròng (netIncome) cộng vào Ví Tiền Mặt Grab.
 *    - Tiền tip qua app cộng vào Ví Tiền Mặt Grab; tip tiền mặt cộng vào Ví nhận ngoài.
 *    - Ví Tín Dụng Grab GIỮ NGUYÊN.
 *
 * 2. Cuốc khách trả Tiền mặt (CASH):
 *    - tripFare = grabFare > 0 ? grabFare : cashReceived
 *    - grabFee = Math.max(0, tripFare - netIncome) (Grab trừ vào Ví Tín Dụng)
 *    - voucherSubsidy = cashReceived < tripFare ? (tripFare - cashReceived) : 0 (Grab bù vào Ví Tiền Mặt Grab)
 *    - autoTip = cashReceived > tripFare ? (cashReceived - tripFare) : 0
 *    - cashNetIncome = netIncome - voucherSubsidy (Thu nhập ròng nằm trong tiền mặt khách đưa)
 *
 *    Các giao dịch sinh ra:
 *    - TRANSFER: Chuyển grabFee từ Ví Tín Dụng ➔ Ví nhận tiền mặt/BIDV (Ví Tín Dụng trừ grabFee, ví nhận tiền có tiền phí)
 *    - INCOME: Cộng cashNetIncome vào Ví nhận tiền mặt/BIDV (Khớp đúng tổng tiền khách đưa = grabFee + cashNetIncome)
 *    - INCOME (nếu voucherSubsidy > 0): Cộng voucherSubsidy vào Ví Tiền Mặt Grab (Grab hoàn tiền voucher)
 *    - INCOME (nếu autoTip > 0): Cộng autoTip vào Ví nhận tiền mặt/BIDV
 */
export async function recordGrabTrip(params: SaveGrabTripParams): Promise<SaveGrabTripResult> {
  const {
    paymentMethod,
    grabFare,
    cashReceived,
    netIncome,
    tipAmount = 0,
    tipType = 'CASH',
    creditWalletId,
    grabCashWalletId,
    receivingWalletId,
    physicalCashWalletId,
    date,
    time,
    note
  } = params;

  if (netIncome <= 0 && cashReceived <= 0 && (!grabFare || grabFare <= 0)) {
    throw new Error('Số tiền phải lớn hơn 0');
  }

  await ensureGrabCategories();

  const now = new Date().toISOString();
  const txIds: string[] = [];
  let grabFee = 0;
  let voucherSubsidy = 0;
  let autoTip = 0;
  let totalEarned = 0;

  await db.transaction('rw', [db.wallets, db.transactions, db.settings], async () => {
    if (paymentMethod === 'CARD') {
      // 1. Khách trả qua Thẻ/Ví app Grab: Tiền thu nhập ròng & Tip qua app vào Ví Tiền Mặt Grab
      const grabCashWallet = await db.wallets.get(grabCashWalletId);
      if (!grabCashWallet) throw new Error('Ví Tiền Mặt Grab không tồn tại');

      const isAppTip = tipAmount > 0 && tipType === 'IN_APP';
      const isCashTip = tipAmount > 0 && tipType === 'CASH';

      totalEarned = netIncome + (isAppTip ? tipAmount : 0);

      await db.wallets.update(grabCashWalletId, {
        balance: grabCashWallet.balance + totalEarned,
        updatedAt: now
      });

      const txId = generateUUID();
      const noteDetails: string[] = [];
      if (note?.trim()) noteDetails.push(note.trim());
      if (isAppTip) {
        noteDetails.push(`Đã gồm ${new Intl.NumberFormat('vi-VN').format(tipAmount)}₫ tip app`);
      }

      const newTx: Transaction = {
        id: txId,
        walletId: grabCashWalletId,
        categoryId: GRAB_INCOME_CAT_ID,
        type: 'INCOME',
        amount: totalEarned,
        date,
        time,
        note: `${noteDetails.join(' • ') || 'Cuốc Grab - Khách trả thẻ/ví'}${isAppTip ? ', Tiền tip Grab' : ''}`,
        createdAt: now,
        updatedAt: now
      };
      await db.transactions.add(newTx);
      txIds.push(txId);

      // Nếu khách đi cuốc thẻ nhưng tip tiền mặt trực tiếp ngoài app:
      if (isCashTip) {
        const targetWalletId = receivingWalletId || physicalCashWalletId || '';
        let targetWallet = targetWalletId ? await db.wallets.get(targetWalletId) : undefined;
        if (!targetWallet) {
          const all = await db.wallets.toArray();
          targetWallet = all.find((w) => w.type === 'CASH') || all[0];
        }
        if (targetWallet) {
          totalEarned += tipAmount;
          await db.wallets.update(targetWallet.id, {
            balance: targetWallet.balance + tipAmount,
            updatedAt: now
          });
          const tipTxId = generateUUID();
          await db.transactions.add({
            id: tipTxId,
            walletId: targetWallet.id,
            categoryId: GRAB_INCOME_CAT_ID,
            type: 'INCOME',
            amount: tipAmount,
            date,
            time,
            note: `Tiền tip khách đưa trực tiếp (Cuốc thẻ), Tiền tip Grab`,
            createdAt: now,
            updatedAt: now
          });
          txIds.push(tipTxId);
        }
      }
    } else {
      // 2. Khách trả TIỀN MẶT (hoặc chuyển khoản ngân hàng) trực tiếp cho tài xế:
      const targetWalletId = receivingWalletId || physicalCashWalletId || '';
      let targetWallet = targetWalletId ? await db.wallets.get(targetWalletId) : undefined;

      if (!targetWallet) {
        const all = await db.wallets.toArray();
        targetWallet = all.find((w) => w.type === 'CASH') || all[0];
        if (!targetWallet) throw new Error('Vui lòng chọn ví nhận tiền từ khách');
      }

      const creditWallet = await db.wallets.get(creditWalletId);
      if (!creditWallet) throw new Error('Ví Tín Dụng Grab không tồn tại');

      const grabCashWallet = await db.wallets.get(grabCashWalletId);
      if (!grabCashWallet) throw new Error('Ví Tiền Mặt Grab không tồn tại');

      // Ghi nhớ ví nhận tiền gần nhất
      await db.settings.put({
        key: 'last_grab_receiving_wallet_id',
        value: targetWallet.id
      });

      // A. Tính toán ngầm:
      const tripFare = grabFare && grabFare > 0 ? grabFare : cashReceived;
      grabFee = Math.max(0, tripFare - netIncome);
      voucherSubsidy = cashReceived < tripFare ? (tripFare - cashReceived) : 0;
      autoTip = cashReceived > tripFare ? (cashReceived - tripFare) : (tipAmount > 0 ? tipAmount : 0);
      const rawCashNetIncome = netIncome - voucherSubsidy;
      const cashNetIncome = Math.max(0, rawCashNetIncome);

      // B. Sinh các giao dịch tự động:
      // 1. TRANSFER: Phí chiết khấu Grab trừ Ví Tín Dụng ➔ Chuyển vào Ví nhận tiền mặt/BIDV
      if (grabFee > 0) {
        const currentCredit = await db.wallets.get(creditWalletId);
        const creditBal = currentCredit ? currentCredit.balance : creditWallet.balance;
        const currentTarget = await db.wallets.get(targetWallet.id);
        const targetBal = currentTarget ? currentTarget.balance : targetWallet.balance;

        await db.wallets.update(creditWalletId, {
          balance: creditBal - grabFee,
          updatedAt: now
        });
        await db.wallets.update(targetWallet.id, {
          balance: targetBal + grabFee,
          updatedAt: now
        });

        const feeTxId = generateUUID();
        const transferTx: Transaction = {
          id: feeTxId,
          walletId: creditWalletId,
          toWalletId: targetWallet.id,
          type: 'TRANSFER',
          amount: grabFee,
          date,
          time,
          note: `Grab trừ chiết khấu cuốc xe (Cước: ${new Intl.NumberFormat('vi-VN').format(tripFare)}₫, Phí: ${new Intl.NumberFormat('vi-VN').format(grabFee)}₫)`,
          createdAt: now,
          updatedAt: now
        };
        await db.transactions.add(transferTx);
        txIds.push(feeTxId);
      }

      // 2. INCOME: Thu nhập ròng tiền mặt cộng vào Ví nhận tiền (Tiền mặt/BIDV)
      if (cashNetIncome > 0) {
        const currentTarget = await db.wallets.get(targetWallet.id);
        const targetBal = currentTarget ? currentTarget.balance : targetWallet.balance;
        await db.wallets.update(targetWallet.id, {
          balance: targetBal + cashNetIncome,
          updatedAt: now
        });

        const incomeTxId = generateUUID();
        const incomeNoteParts: string[] = [];
        if (note?.trim()) incomeNoteParts.push(note.trim());
        incomeNoteParts.push(`Cước: ${new Intl.NumberFormat('vi-VN').format(tripFare)}₫`);
        incomeNoteParts.push(`Thu nhập ròng tiền mặt: +${new Intl.NumberFormat('vi-VN').format(cashNetIncome)}₫`);

        const incomeTx: Transaction = {
          id: incomeTxId,
          walletId: targetWallet.id,
          categoryId: GRAB_INCOME_CAT_ID,
          type: 'INCOME',
          amount: cashNetIncome,
          date,
          time,
          note: incomeNoteParts.join(' • '),
          createdAt: now,
          updatedAt: now
        };
        await db.transactions.add(incomeTx);
        txIds.push(incomeTxId);
      }

      // 3. INCOME: Tiền Grab bù Voucher/Khuyến mãi vào Ví Tiền Mặt Grab (nếu voucherSubsidy > 0)
      if (voucherSubsidy > 0) {
        const currentGrabCash = await db.wallets.get(grabCashWalletId);
        const grabCashBal = currentGrabCash ? currentGrabCash.balance : grabCashWallet.balance;
        await db.wallets.update(grabCashWalletId, {
          balance: grabCashBal + voucherSubsidy,
          updatedAt: now
        });

        const voucherTxId = generateUUID();
        const voucherTx: Transaction = {
          id: voucherTxId,
          walletId: grabCashWalletId,
          categoryId: GRAB_INCOME_CAT_ID,
          type: 'INCOME',
          amount: voucherSubsidy,
          date,
          time,
          note: `Grab hoàn tiền khuyến mãi / voucher cho khách (+${new Intl.NumberFormat('vi-VN').format(voucherSubsidy)}₫ vào Ví TM Grab)`,
          createdAt: now,
          updatedAt: now
        };
        await db.transactions.add(voucherTx);
        txIds.push(voucherTxId);
      }

      // 4. INCOME: Tiền tip nếu khách đưa dư (nếu autoTip > 0) vào Ví nhận tiền mặt/BIDV
      if (autoTip > 0) {
        const currentTarget = await db.wallets.get(targetWallet.id);
        const targetBal = currentTarget ? currentTarget.balance : targetWallet.balance;
        await db.wallets.update(targetWallet.id, {
          balance: targetBal + autoTip,
          updatedAt: now
        });

        const tipTxId = generateUUID();
        const tipTx: Transaction = {
          id: tipTxId,
          walletId: targetWallet.id,
          categoryId: GRAB_INCOME_CAT_ID,
          type: 'INCOME',
          amount: autoTip,
          date,
          time,
          note: `Tiền tip khách đưa trực tiếp (Cuốc tiền mặt), Tiền tip Grab`,
          createdAt: now,
          updatedAt: now
        };
        await db.transactions.add(tipTx);
        txIds.push(tipTxId);
      }

      totalEarned = netIncome + autoTip;
    }
  });

  return {
    netIncome,
    grabFee,
    voucherSubsidy,
    tipAmount: autoTip,
    totalEarned,
    workingCapital: grabFee,
    transactionIds: txIds
  };
}
