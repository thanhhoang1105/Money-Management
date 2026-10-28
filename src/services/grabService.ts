// src/services/grabService.ts
import { useLiveQuery } from 'dexie-react-hooks';
import { db, runWithoutDirtyTracking, clearLocalDataChanged } from '../db';
import { getSupabaseConfig, getSupabaseClient } from './supabaseService';
import {
  getLocalSyncPayload,
  deduplicateSyncPayload,
  clearDeletedEntities
} from './syncService';
import { getCurrentDate } from '../utils/formatters';
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
  tipAmount?: number;          // Tiền tip khách cho (nếu không truyền, tự tính = max(0, cashReceived - grabFare))
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
  workingCapital: number;
  tipAmount: number;
  totalEarned: number;
  transactionIds: string[];
}

/**
 * Ghi 1 cuốc Grab tự động phân phối nguồn tiền theo đúng bản chất kế toán dòng tiền:
 *
 * 1. Tiền phí chiết khấu / tiền ứng món ăn Grab trừ từ Ví Tín Dụng là VỐN LƯU ĐỘNG:
 *    - Grab trừ từ Ví Tín Dụng Grab.
 *    - Khách trả bù lại vào ví tài xế nhận (Tiền mặt, Ngân hàng, Ví điện tử).
 *    => Đây là luân chuyển vốn (TRANSFER) giữa Ví Tín Dụng Grab ➔ Ví nhận tiền.
 *    => KHÔNG TÍNH VÀO CHI TIÊU VÀ KHÔNG TÍNH VÀO THU NHẬP!
 *
 * 2. Chỉ có khoảng DƯ RA (Thu nhập ròng + Tip) mới là THU NHẬP THỰC TẾ:
 *    => Ghi giao dịch THU NHẬP (INCOME) vào Ví nhận tiền đúng bằng số tiền thực tế kiếm được!
 *
 * 3. Tiền TIP:
 *    - Tip đưa trực tiếp: 100% vào ví nhận tiền, Grab không thu phí.
 *    - Tip trên app Grab: 100% Grab chuyển vào Ví Tiền Mặt Grab (app), Grab không thu phí.
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
  let workingCapital = 0;
  let totalEarned = 0;

  // Cước cuốc xe theo app Grab
  const appFare = grabFare && grabFare > 0 ? grabFare : cashReceived;

  // Tính tiền tip:
  // Nếu là cuốc tiền mặt và khách đưa nhiều hơn cước app: tự động tính tip = cashReceived - appFare
  let tip = tipAmount > 0 ? tipAmount : 0;
  if (paymentMethod === 'CASH' && appFare > 0 && cashReceived > appFare && tip === 0) {
    tip = cashReceived - appFare;
  }

  await db.transaction('rw', [db.wallets, db.transactions, db.settings], async () => {
    if (paymentMethod === 'CARD') {
      // 1. Khách trả qua Thẻ/Ví app Grab: Tiền thu nhập ròng & Tip qua app vào Ví Tiền Mặt Grab
      const grabCashWallet = await db.wallets.get(grabCashWalletId);
      if (!grabCashWallet) throw new Error('Ví Tiền Mặt Grab không tồn tại');

      totalEarned = netIncome + (tipType === 'IN_APP' ? tip : 0);

      await db.wallets.update(grabCashWalletId, {
        balance: grabCashWallet.balance + totalEarned,
        updatedAt: now
      });

      const txId = generateUUID();
      const noteDetails: string[] = [];
      if (note?.trim()) noteDetails.push(note.trim());
      if (tip > 0 && tipType === 'IN_APP') {
        noteDetails.push(`Đã gồm ${new Intl.NumberFormat('vi-VN').format(tip)}₫ tip app`);
      }

      const newTx: Transaction = {
        id: txId,
        walletId: grabCashWalletId,
        categoryId: GRAB_INCOME_CAT_ID,
        type: 'INCOME',
        amount: totalEarned,
        date,
        time,
        note: `${noteDetails.join(' • ') || 'Cuốc Grab - Khách trả thẻ/ví'}${tip > 0 && tipType === 'IN_APP' ? ', Tiền tip Grab' : ''}`,
        createdAt: now,
        updatedAt: now
      };
      await db.transactions.add(newTx);
      txIds.push(txId);

      // Nếu khách đi cuốc thẻ nhưng tip tiền mặt trực tiếp ngoài app:
      if (tip > 0 && tipType === 'CASH') {
        const targetWalletId = receivingWalletId || physicalCashWalletId || '';
        let targetWallet = targetWalletId ? await db.wallets.get(targetWalletId) : undefined;
        if (!targetWallet) {
          const all = await db.wallets.toArray();
          targetWallet = all.find((w) => w.type === 'CASH') || all[0];
        }
        if (targetWallet) {
          totalEarned += tip;
          await db.wallets.update(targetWallet.id, {
            balance: targetWallet.balance + tip,
            updatedAt: now
          });
          const tipTxId = generateUUID();
          await db.transactions.add({
            id: tipTxId,
            walletId: targetWallet.id,
            categoryId: GRAB_INCOME_CAT_ID,
            type: 'INCOME',
            amount: tip,
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
      // 2. Khách trả TRỰC TIẾP (Tiền mặt / Chuyển khoản ngân hàng / Quét mã MoMo...):
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

      const isCashTip = tip > 0 && tipType === 'CASH';
      const isInAppTip = tip > 0 && tipType === 'IN_APP';

      // Cước cuốc xe thực tế dùng tính hoàn vốn từ ví tín dụng
      const tripFare = appFare > 0 ? appFare : (isCashTip ? Math.max(0, cashReceived - tip) : cashReceived);

      // Nghiệp vụ Grab Driver chuẩn:
      // Grab trừ đúng số tiền cước xe (tripFare) từ Ví Tín Dụng Grab.
      // Khách trả tiền cho tài xế vào ví nhận (targetWallet: BIDV, Tiền mặt...).
      // -> Luân chuyển hoàn vốn cước xe: Ví Tín Dụng -> Ví Nhận Tiền.
      const reimbursedAmount = Math.min(tripFare, cashReceived);
      workingCapital = tripFare;

      // 2.1 Luân chuyển hoàn cước từ Ví Tín Dụng sang Ví Nhận Tiền (TRANSFER)
      if (reimbursedAmount > 0) {
        await db.wallets.update(creditWalletId, {
          balance: creditWallet.balance - reimbursedAmount,
          updatedAt: now
        });
        await db.wallets.update(targetWallet.id, {
          balance: targetWallet.balance + reimbursedAmount,
          updatedAt: now
        });

        const transferTxId = generateUUID();
        const transferTx: Transaction = {
          id: transferTxId,
          walletId: creditWalletId,
          toWalletId: targetWallet.id,
          type: 'TRANSFER',
          amount: reimbursedAmount,
          date,
          time,
          note: `Hoàn vốn cước xe từ khách trả tiền mặt (Cước: ${new Intl.NumberFormat('vi-VN').format(tripFare)}₫)`,
          createdAt: now,
          updatedAt: now
        };
        await db.transactions.add(transferTx);
        txIds.push(transferTxId);
      }

      // Nếu khách trả thiếu so với cước: phần thiếu vẫn bị Grab trừ ở Ví Tín Dụng
      if (cashReceived < tripFare) {
        const fareShortage = tripFare - cashReceived;
        const currentCredit = await db.wallets.get(creditWalletId);
        const creditBal = currentCredit ? currentCredit.balance : creditWallet.balance;
        await db.wallets.update(creditWalletId, {
          balance: creditBal - fareShortage,
          updatedAt: now
        });

        const shortageTxId = generateUUID();
        await db.transactions.add({
          id: shortageTxId,
          walletId: creditWalletId,
          categoryId: GRAB_FEE_CAT_ID,
          type: 'EXPENSE',
          amount: fareShortage,
          date,
          time,
          note: `Hụt cước do khách trả thiếu (Cước: ${new Intl.NumberFormat('vi-VN').format(tripFare)}₫, Thu: ${new Intl.NumberFormat('vi-VN').format(cashReceived)}₫)`,
          createdAt: now,
          updatedAt: now
        });
        txIds.push(shortageTxId);
      }

      // 2.2 Thu nhập ròng cuốc xe cộng vào Ví Tiền Mặt Grab (INCOME)
      const currentGrabCash = await db.wallets.get(grabCashWalletId);
      const cashBal = currentGrabCash ? currentGrabCash.balance : grabCashWallet.balance;
      await db.wallets.update(grabCashWalletId, {
        balance: cashBal + netIncome,
        updatedAt: now
      });

      const incomeTxId = generateUUID();
      const incomeNoteParts: string[] = [];
      if (note?.trim()) incomeNoteParts.push(note.trim());
      if (appFare > 0) {
        incomeNoteParts.push(`Cước: ${new Intl.NumberFormat('vi-VN').format(appFare)}₫`);
      }
      incomeNoteParts.push(`Ròng: +${new Intl.NumberFormat('vi-VN').format(netIncome)}₫`);

      const incomeTx: Transaction = {
        id: incomeTxId,
        walletId: grabCashWalletId,
        categoryId: GRAB_INCOME_CAT_ID,
        type: 'INCOME',
        amount: netIncome,
        date,
        time,
        note: incomeNoteParts.join(' • '),
        createdAt: now,
        updatedAt: now
      };
      await db.transactions.add(incomeTx);
      txIds.push(incomeTxId);

      // 2.3 Tiền tip khách đưa trực tiếp (CASH tip) vào Ví Nhận Tiền
      if (isCashTip) {
        const currentTarget = await db.wallets.get(targetWallet.id);
        const targetBal = currentTarget ? currentTarget.balance : targetWallet.balance;
        await db.wallets.update(targetWallet.id, {
          balance: targetBal + tip,
          updatedAt: now
        });

        const cashTipTxId = generateUUID();
        await db.transactions.add({
          id: cashTipTxId,
          walletId: targetWallet.id,
          categoryId: GRAB_INCOME_CAT_ID,
          type: 'INCOME',
          amount: tip,
          date,
          time,
          note: `Tiền tip khách đưa trực tiếp (Cuốc tiền mặt), Tiền tip Grab`,
          createdAt: now,
          updatedAt: now
        });
        txIds.push(cashTipTxId);
      }

      // 2.4 Tiền tip khách bo qua App Grab (IN_APP tip) vào Ví Tiền Mặt Grab
      if (isInAppTip) {
        const latestGrabCash = await db.wallets.get(grabCashWalletId);
        const latestBal = latestGrabCash ? latestGrabCash.balance : grabCashWallet.balance;
        await db.wallets.update(grabCashWalletId, {
          balance: latestBal + tip,
          updatedAt: now
        });

        const inAppTipTxId = generateUUID();
        await db.transactions.add({
          id: inAppTipTxId,
          walletId: grabCashWalletId,
          categoryId: GRAB_INCOME_CAT_ID,
          type: 'INCOME',
          amount: tip,
          date,
          time,
          note: `[Grab Tip App] Tiền tip khách bo qua app (+${new Intl.NumberFormat('vi-VN').format(tip)}₫), Tiền tip Grab`,
          createdAt: now,
          updatedAt: now
        });
        txIds.push(inAppTipTxId);
      }

      const fareShortage = tripFare > cashReceived ? (tripFare - cashReceived) : 0;
      totalEarned = Math.max(0, netIncome - fareShortage) + (isCashTip ? tip : 0) + (isInAppTip ? tip : 0);
    }
  });

  return {
    netIncome,
    workingCapital,
    tipAmount: tip,
    totalEarned,
    transactionIds: txIds
  };
}

/**
 * Khôi phục và cân đối lại dữ liệu ví Grab về trạng thái thực tế chuẩn xác 100%:
 * - Ví Tiền Mặt Grab: 9.032 ₫
 * - Ví Tín Dụng Grab: 103.132 ₫
 * - Ví BIDV: 16.000 ₫
 * - Tiền mặt: 50.000 ₫
 * Tự động chạy 1 lần duy nhất khi ứng dụng khởi động để sửa triệt để các dữ liệu bị lệch.
 */
export async function repairCorruptedGrabBalances(): Promise<boolean> {
  const flag = await db.settings.get('grab_data_repaired_v5');
  const walletsBefore = await db.wallets.toArray();
  const credCheck = walletsBefore.find((w) => w.name === 'Grab tín dụng');
  const cashCheck = walletsBefore.find((w) => w.name === 'Grab tiền mặt');
  const isCorrupted = credCheck && cashCheck && (credCheck.balance < 0 || cashCheck.balance > 50000);
  if (flag?.value && !isCorrupted) return false;

  const wallets = await db.wallets.toArray();
  const grabCredit = wallets.find((w) => w.name === 'Grab tín dụng');
  const grabCash = wallets.find((w) => w.name === 'Grab tiền mặt');
  const bidv = wallets.find((w) => w.name === 'BIDV');
  const cash = wallets.find((w) => w.name === 'Tiền mặt');

  if (!grabCredit || !grabCash || !bidv || !cash) return false;

  await runWithoutDirtyTracking(async () => {
    await db.transaction('rw', [db.wallets, db.transactions, db.settings], async () => {
      const allTxs = await db.transactions.toArray();
      const now = new Date().toISOString();

      // 0. Chuẩn hóa các giao dịch cuốc Grab từng bị xếp vào danh mục "Chưa phân loại" về "Thu nhập GrabBike"
      const uncatGrabIds = [
        '163467aa-0848-4c83-b831-aa4ffe6cefc0', // 24/10 54.701₫
        '3dc5c4dd-39a6-4eb3-a8ef-26eb83a34263', // 25/10 25.427₫
        '62fa6a6e-4198-4a3a-b7c6-7f76a240a7cb', // 25/10 25.339₫
        '2325a852-e273-42ea-beaf-8ee2a792b72e', // 25/10 14.623₫
        'acef0277-8b96-45b1-8993-4e953a3f0f04', // 25/10 17.600₫
        '3685e33c-bf63-4e23-8574-dab597792ed0', // 25/10 27.000₫
        '611bf416-fd33-4ca3-8f6f-bfdc0d2608af'  // 25/10 32.000₫
      ];
      for (const uncatId of uncatGrabIds) {
        const tx = allTxs.find((t) => t.id === uncatId);
        if (tx && tx.categoryId !== GRAB_INCOME_CAT_ID) {
          await db.transactions.update(uncatId, {
            categoryId: GRAB_INCOME_CAT_ID,
            note: tx.note || 'GrabBike',
            updatedAt: now
          });
        }
      }

      // 1. Phục hồi các giao dịch ngày 26/10 về số tiền chuẩn ban đầu
      const original26Map: Record<string, { amount: number; note: string; walletId?: string }> = {
        '0a416ac7-b804-435b-b816-bcf97f19a46a': { amount: 8005, note: 'Hoàn vốn tín dụng từ khách trả tiền mặt' },
        '0ed4366c-beed-4616-924c-839c9de0d717': { amount: 66588, note: 'Hoàn vốn tín dụng từ khách trả tiền mặt' },
        '96dea067-4f49-4ef8-9dc2-c6a1d9d18aa1': { amount: 655, note: 'Hoàn vốn tín dụng từ khách trả tiền mặt' },
        'c6297d17-59de-4ecd-b411-d9ca69dd2721': { amount: 25988, note: 'Hoàn vốn tín dụng từ khách trả tiền mặt' },
        'e633ccc4-d994-4872-87c9-19ef6cbc4c58': { amount: 5655, note: 'Hoàn vốn tín dụng từ khách trả tiền mặt' },
        'f1451f3c-cd16-4765-ab33-e99a54b6e602': { amount: 7111, note: 'Hoàn vốn tín dụng từ khách trả tiền mặt' },
        'fe1e83d0-7d29-4c14-acae-4a1863334515': { amount: 8116, note: 'Hoàn vốn tín dụng từ khách trả tiền mặt' },
        '84ce243b-a327-4384-83f2-a258f0be6099': { amount: 8345, note: 'GrabBike • Cước: 14.000₫ • Ròng: +8.345₫', walletId: bidv.id },
        'c47d6763-ac8f-4fd3-8feb-0815343c3cc3': { amount: 16995, note: 'GrabBike • Cước: 23.000₫ • Ròng: +14.995₫ • Tip thêm: +2.000₫, Tiền tip Grab', walletId: cash.id }
      };

      for (const [id, orig] of Object.entries(original26Map)) {
        const tx = allTxs.find((t) => t.id === id);
        if (tx) {
          await db.transactions.update(id, {
            amount: orig.amount,
            note: orig.note,
            ...(orig.walletId ? { walletId: orig.walletId } : {}),
            updatedAt: now
          });
        }
      }

      // Xóa các giao dịch phát sinh thừa do lần chạy migrate trước
      const bogusIds = ['f98438be-409d-49d9-bf6b-9efa7c453b5f', 'fe26f236-cd4d-4566-87e8-33706745a2be'];
      for (const bId of bogusIds) {
        if (allTxs.some((t) => t.id === bId)) {
          await db.transactions.delete(bId);
        }
      }

      // 2. Xóa các cuốc test phát sinh sau 15:15 ngày 27/10
      const txs27 = allTxs.filter((t) => t.date === '2026-10-27');
      for (const t of txs27) {
        if (t.time && t.time > '15:15') {
          await db.transactions.delete(t.id);
        }
      }

      // 3. Chuẩn hóa duy nhất 1 cuốc Grab ngày 27/10 lúc 15:11:
      // Chuyển hoàn cước 16.000₫: Grab tín dụng -> BIDV
      // Thu nhập ròng 9.032₫: vào Grab tiền mặt
      const grabTransfer27 = allTxs.find(
        (t) => t.date === '2026-10-27' && t.type === 'TRANSFER' && t.walletId === grabCredit.id
      );
      if (grabTransfer27) {
        await db.transactions.update(grabTransfer27.id, {
          amount: 16000,
          toWalletId: bidv.id,
          note: 'Hoàn vốn cước xe từ khách trả tiền mặt (Cước: 16.000₫)',
          updatedAt: now
        });
      } else {
        await db.transactions.add({
          id: generateUUID(),
          walletId: grabCredit.id,
          toWalletId: bidv.id,
          type: 'TRANSFER',
          amount: 16000,
          date: '2026-10-27',
          time: '15:11',
          note: 'Hoàn vốn cước xe từ khách trả tiền mặt (Cước: 16.000₫)',
          createdAt: now,
          updatedAt: now
        });
      }

      const grabIncome27 = allTxs.find(
        (t) => t.date === '2026-10-27' && t.type === 'INCOME' && (t.note?.includes('9.032') || t.amount === 9032)
      );
      if (grabIncome27) {
        await db.transactions.update(grabIncome27.id, {
          amount: 9032,
          walletId: grabCash.id,
          categoryId: GRAB_INCOME_CAT_ID,
          note: 'GrabBike • Cước: 16.000₫ • Ròng: +9.032₫',
          updatedAt: now
        });
      } else {
        await db.transactions.add({
          id: generateUUID(),
          walletId: grabCash.id,
          categoryId: GRAB_INCOME_CAT_ID,
          type: 'INCOME',
          amount: 9032,
          date: '2026-10-27',
          time: '15:11',
          note: 'GrabBike • Cước: 16.000₫ • Ròng: +9.032₫',
          createdAt: now,
          updatedAt: now
        });
      }

      // 4. Thiết lập chính xác số dư tuyệt đối cho các ví
      await db.wallets.update(grabCredit.id, { balance: 103132, updatedAt: now });
      await db.wallets.update(grabCash.id, { balance: 9032, updatedAt: now });
      await db.wallets.update(bidv.id, { balance: 16000, updatedAt: now });
      await db.wallets.update(cash.id, { balance: 50000, updatedAt: now });

      await db.settings.put({
        key: 'grab_data_repaired_v5',
        value: true
      });
    });
  });

  // Nếu đang kết nối Supabase Cloud: Đẩy ngay bản chuẩn đã sửa lên Cloud để Cloud không kéo data cũ về
  try {
    const { url, anonKey, syncKey, email } = await getSupabaseConfig();
    const client = await getSupabaseClient();
    if (client && syncKey && url && anonKey) {
      const localPayload = await getLocalSyncPayload();
      const cleanPayload = deduplicateSyncPayload(localPayload);
      const now = new Date().toISOString();

      await client.from('user_backups').upsert(
        {
          sync_key: syncKey,
          user_email: email || syncKey,
          payload: cleanPayload,
          updated_at: now
        },
        { onConflict: 'sync_key' }
      );
      await db.settings.put({ key: 'last_supabase_backup_date', value: getCurrentDate() });
      await db.settings.put({ key: 'last_supabase_sync_time', value: now });
      await clearDeletedEntities();
      clearLocalDataChanged();
    }
  } catch (sbErr) {
    console.warn('[repairCorruptedGrabBalances] Không thể đồng bộ sửa lỗi lên Supabase:', sbErr);
  }

  return true;
}
