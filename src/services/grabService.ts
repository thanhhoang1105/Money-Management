// src/services/grabService.ts
import { db } from '../db';
import { generateUUID } from '../utils/uuid';
import {
  PARENT_MUST_HAVE_ID,
  GRAB_INCOME_CAT_ID,
  GRAB_FEE_CAT_ID
} from '../db/seed';
import type { Wallet, Transaction } from '../types';

export { GRAB_INCOME_CAT_ID, GRAB_FEE_CAT_ID };

export const GRAB_SETTING_CREDIT_WALLET = 'grab_credit_wallet_id';
export const GRAB_SETTING_CASH_WALLET = 'grab_cash_wallet_id';
export const GRAB_SETTING_PHYSICAL_CASH_WALLET = 'grab_physical_cash_wallet_id';

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
    } else if (feeCat.name !== 'Phí dịch vụ Grab' || feeCat.icon !== 'Percent') {
      await db.categories.update(GRAB_FEE_CAT_ID, {
        name: 'Phí dịch vụ Grab',
        icon: 'Percent',
        color: '#EF4444',
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
  cashReceived: number;        // Tiền mặt khách đưa (đã bao gồm tip tiền mặt nếu có)
  netIncome: number;           // Thu nhập ròng hiển thị trên app Grab
  tipAmount?: number;          // Tiền tip khách cho (mặc định 0)
  tipType?: 'CASH' | 'IN_APP'; // 'CASH' (tiền mặt đưa tận tay) hoặc 'IN_APP' (bo qua app)
  creditWalletId: string;
  grabCashWalletId: string;
  physicalCashWalletId: string;
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
 *    - Khách trả tiền mặt bù lại cho tài xế nhét vào túi.
 *    => Đây là luân chuyển vốn (TRANSFER) giữa Ví Tín Dụng và Ví Tiền Mặt.
 *    => KHÔNG TÍNH VÀO CHI TIÊU VÀ KHÔNG TÍNH VÀO THU NHẬP!
 *
 * 2. Chỉ có khoảng DƯ RA (Thu nhập ròng + Tip) mới là THU NHẬP THỰC TẾ:
 *    => Ghi giao dịch THU NHẬP (INCOME) đúng bằng số tiền thực tế kiếm được!
 *
 * 3. Tiền TIP:
 *    - Tip tiền mặt: 100% vào túi tiền mặt của tài xế, Grab không thu phí.
 *    - Tip trên app Grab: 100% Grab chuyển vào Ví Tiền Mặt Grab (app), Grab không thu phí.
 */
export async function recordGrabTrip(params: SaveGrabTripParams): Promise<SaveGrabTripResult> {
  const {
    paymentMethod,
    cashReceived,
    netIncome,
    tipAmount = 0,
    tipType = 'CASH',
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
  const tip = tipAmount > 0 ? tipAmount : 0;
  let workingCapital = 0;
  let totalEarned = 0;

  await db.transaction('rw', [db.wallets, db.transactions, db.settings], async () => {
    if (paymentMethod === 'CARD') {
      // 1. Khách trả qua Thẻ/Ví: Tiền thu nhập ròng & Tip qua app vào Ví Tiền Mặt Grab
      const grabCashWallet = await db.wallets.get(grabCashWalletId);
      if (!grabCashWallet) throw new Error('Ví Tiền Mặt Grab không tồn tại');

      totalEarned = netIncome + tip;

      await db.wallets.update(grabCashWalletId, {
        balance: grabCashWallet.balance + totalEarned,
        updatedAt: now
      });

      const txId = generateUUID();
      const noteDetails: string[] = [];
      if (note?.trim()) noteDetails.push(note.trim());
      if (tip > 0) noteDetails.push(`Đã gồm ${new Intl.NumberFormat('vi-VN').format(tip)}₫ tip app`);

      const newTx: Transaction = {
        id: txId,
        walletId: grabCashWalletId,
        categoryId: GRAB_INCOME_CAT_ID,
        type: 'INCOME',
        amount: totalEarned,
        date,
        time,
        note: `[Grab Thẻ] ${noteDetails.join(' • ') || 'Cuốc Grab - Khách trả thẻ/ví'}`,
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

      const isCashTip = tip > 0 && tipType === 'CASH';
      const isInAppTip = tip > 0 && tipType === 'IN_APP';

      // Cước cuốc xe thực tế (trừ tip tiền mặt nếu khách đưa gộp chung)
      const tripFare = isCashTip ? Math.max(0, cashReceived - tip) : cashReceived;

      // Vốn lưu động Grab trừ từ ví tín dụng để bù cho tiền mặt khách đưa (phí chiết khấu + tiền món ăn ứng trước)
      workingCapital = Math.max(0, tripFare - netIncome);

      // 2.1 Luân chuyển vốn lưu động (TRANSFER):
      // Grab trừ từ Ví Tín Dụng, tài xế thu tiền mặt tương ứng từ khách bù vào ví tiền mặt.
      // Bản chất là luân chuyển giữa 2 ví, KHÔNG PHẢI chi tiêu hay thu nhập.
      if (workingCapital > 0) {
        await db.wallets.update(creditWalletId, {
          balance: creditWallet.balance - workingCapital,
          updatedAt: now
        });
        await db.wallets.update(physicalCashWalletId, {
          balance: physicalCashWallet.balance + workingCapital,
          updatedAt: now
        });

        const transferTxId = generateUUID();
        const transferTx: Transaction = {
          id: transferTxId,
          walletId: creditWalletId,
          toWalletId: physicalCashWalletId,
          type: 'TRANSFER',
          amount: workingCapital,
          date,
          time,
          note: `[Vốn lưu động Grab] Luân chuyển ví tín dụng sang tiền mặt (Vốn cuốc xe: ${new Intl.NumberFormat('vi-VN').format(workingCapital)}₫)`,
          createdAt: now,
          updatedAt: now
        };
        await db.transactions.add(transferTx);
        txIds.push(transferTxId);
      }

      // 2.2 Thu nhập thực tế bỏ túi (INCOME):
      // Thu nhập thực sự kiếm được: Thu nhập ròng cuốc xe + Tip tiền mặt (nếu có)
      const cashIncomeAmount = netIncome + (isCashTip ? tip : 0);
      totalEarned = cashIncomeAmount;

      // Cập nhật số dư mới nhất của Ví tiền mặt ngoài đời
      const currentPhysicalCash = await db.wallets.get(physicalCashWalletId);
      const currentCashBalance = currentPhysicalCash ? currentPhysicalCash.balance : physicalCashWallet.balance;

      await db.wallets.update(physicalCashWalletId, {
        balance: currentCashBalance + cashIncomeAmount,
        updatedAt: now
      });

      const incomeTxId = generateUUID();
      const incomeNoteParts: string[] = [];
      if (note?.trim()) incomeNoteParts.push(note.trim());
      incomeNoteParts.push(`Ròng: +${new Intl.NumberFormat('vi-VN').format(netIncome)}₫`);
      if (isCashTip) {
        incomeNoteParts.push(`Tip tiền mặt: +${new Intl.NumberFormat('vi-VN').format(tip)}₫`);
      }

      const incomeTx: Transaction = {
        id: incomeTxId,
        walletId: physicalCashWalletId,
        categoryId: GRAB_INCOME_CAT_ID,
        type: 'INCOME',
        amount: cashIncomeAmount,
        date,
        time,
        note: `[Thu nhập Grab] ${incomeNoteParts.join(' • ')}`,
        createdAt: now,
        updatedAt: now
      };
      await db.transactions.add(incomeTx);
      txIds.push(incomeTxId);

      // 2.3 Khách tip qua app trên cuốc tiền mặt:
      // Grab cộng 100% tiền tip app vào Ví Tiền Mặt Grab trên app
      if (isInAppTip) {
        totalEarned += tip;
        const grabCashWallet = await db.wallets.get(grabCashWalletId);
        if (grabCashWallet) {
          await db.wallets.update(grabCashWalletId, {
            balance: grabCashWallet.balance + tip,
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
            note: `[Grab Tip App] Tiền tip khách bo qua app (+${new Intl.NumberFormat('vi-VN').format(tip)}₫)`,
            createdAt: now,
            updatedAt: now
          });
          txIds.push(inAppTipTxId);
        }
      }

      // 2.4 Khách áp mã giảm giá lớn hơn cước xe (tripFare < netIncome):
      // Grab trợ giá tiền khuyến mãi vào Ví Tiền Mặt Grab trên app
      if (tripFare < netIncome) {
        const subsidy = netIncome - tripFare;
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
            note: `[Grab Trợ Giá] Tiền trợ giá khuyến mãi voucher cuốc xe (+${new Intl.NumberFormat('vi-VN').format(subsidy)}₫)`,
            createdAt: now,
            updatedAt: now
          });
          txIds.push(subsidyTxId);
        }
      }
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
 * Tự động chuẩn hóa các cuốc Grab tiền mặt cũ:
 * Chuyển đổi các giao dịch Phí Grab (EXPENSE) và Tiền cước (INCOME) cũ sang chuẩn Vốn lưu động (TRANSFER) và Thu nhập ròng (INCOME).
 * Giữ nguyên 100% số dư tất cả các ví, xóa sạch lỗi 'Chưa phân loại' và đưa Báo cáo Thu/Chi về đúng bản chất dòng tiền thực tế.
 */
export async function migrateLegacyGrabTransactions(): Promise<number> {
  let migratedCount = 0;
  await db.transaction('rw', [db.transactions, db.categories, db.settings], async () => {
    const allTxs = await db.transactions.toArray();
    // Tìm các giao dịch EXPENSE phí Grab cũ
    const feeTxs = allTxs.filter(
      (tx) =>
        tx.type === 'EXPENSE' &&
        (tx.categoryId === GRAB_FEE_CAT_ID ||
          (tx.note && tx.note.toLowerCase().includes('chiết khấu phí grab')))
    );

    if (feeTxs.length === 0) return 0;

    const allIncomes = allTxs.filter((t) => t.type === 'INCOME');
    const now = new Date().toISOString();

    for (const feeTx of feeTxs) {
      // Trích xuất số tiền cuốc nếu có trong note: "Chiết khấu phí Grab (25.588₫) - Cuốc 36.000₫"
      let expectedCashReceived = 0;
      const match = feeTx.note?.match(/Cuốc\s+([0-9.,]+)/i);
      if (match && match[1]) {
        expectedCashReceived = Number(match[1].replace(/\D/g, ''));
      }

      // Tìm giao dịch INCOME tương ứng: cùng ngày
      const candidateIncomes = allIncomes.filter(
        (t) =>
          t.date === feeTx.date &&
          t.amount > feeTx.amount &&
          (t.categoryId === GRAB_INCOME_CAT_ID ||
            (t.note && (t.note.includes('Grab') || t.note.includes('Cuốc'))))
      );

      let matchedIncome: Transaction | undefined;
      if (expectedCashReceived > 0) {
        matchedIncome = candidateIncomes.find((t) => t.amount === expectedCashReceived);
      }
      if (!matchedIncome && candidateIncomes.length === 1) {
        matchedIncome = candidateIncomes[0];
      } else if (!matchedIncome && candidateIncomes.length > 1) {
        // Tìm transaction gần nhất theo giờ
        matchedIncome = [...candidateIncomes].sort((a, b) => {
          const diffA = Math.abs((a.time || '').localeCompare(feeTx.time || ''));
          const diffB = Math.abs((b.time || '').localeCompare(feeTx.time || ''));
          return diffA - diffB;
        })[0];
      }

      if (matchedIncome) {
        // 1. Chuyển feeTx thành TRANSFER (Vốn lưu động) từ ví tín dụng sang ví tiền mặt
        await db.transactions.update(feeTx.id, {
          type: 'TRANSFER',
          walletId: feeTx.walletId,
          toWalletId: matchedIncome.walletId,
          categoryId: undefined,
          note: `[Vốn lưu động Grab] Luân chuyển ví tín dụng sang tiền mặt (Vốn cuốc: ${new Intl.NumberFormat('vi-VN').format(feeTx.amount)}₫)`,
          updatedAt: now
        });

        // 2. Chuyển matchedIncome về đúng Thu nhập ròng
        const trueNet = matchedIncome.amount - feeTx.amount;
        let cleanNote = matchedIncome.note || '';
        cleanNote = cleanNote.replace(/\[Grab Tiền mặt\]/, '[Thu nhập Grab]');
        if (!cleanNote.includes('[Thu nhập Grab]')) {
          cleanNote = `[Thu nhập Grab] ${cleanNote}`;
        }

        await db.transactions.update(matchedIncome.id, {
          amount: trueNet,
          note: cleanNote,
          updatedAt: now
        });

        // Loại bỏ matchedIncome khỏi danh sách để không bị ghép trùng
        const idx = allIncomes.indexOf(matchedIncome);
        if (idx !== -1) allIncomes.splice(idx, 1);

        migratedCount++;
      }
    }
  });

  return migratedCount;
}
