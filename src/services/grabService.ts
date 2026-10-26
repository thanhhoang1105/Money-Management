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

      // Ghi nhớ ví nhận tiền gần nhất
      await db.settings.put({
        key: 'last_grab_receiving_wallet_id',
        value: targetWallet.id
      });

      const isCashTip = tip > 0 && tipType === 'CASH';
      const isInAppTip = tip > 0 && tipType === 'IN_APP';

      // Cước cuốc xe thực tế dùng tính vốn lưu động từ ví tín dụng
      const tripFare = appFare > 0 ? appFare : (isCashTip ? Math.max(0, cashReceived - tip) : cashReceived);

      // Vốn lưu động Grab trừ từ ví tín dụng để bù cho tiền khách đưa (phí chiết khấu + tiền món ăn ứng trước)
      workingCapital = Math.max(0, tripFare - netIncome);

      // 2.1 Luân chuyển vốn lưu động (TRANSFER):
      // Grab trừ từ Ví Tín Dụng, tài xế thu tiền tương ứng từ khách bù vào ví nhận tiền.
      // Bản chất là luân chuyển giữa 2 ví, KHÔNG PHẢI chi tiêu hay thu nhập.
      if (workingCapital > 0) {
        await db.wallets.update(creditWalletId, {
          balance: creditWallet.balance - workingCapital,
          updatedAt: now
        });
        await db.wallets.update(targetWallet.id, {
          balance: targetWallet.balance + workingCapital,
          updatedAt: now
        });

        const transferTxId = generateUUID();
        const transferTx: Transaction = {
          id: transferTxId,
          walletId: creditWalletId,
          toWalletId: targetWallet.id,
          type: 'TRANSFER',
          amount: workingCapital,
          date,
          time,
          note: `Hoàn vốn tín dụng từ khách trả tiền mặt`,
          createdAt: now,
          updatedAt: now
        };
        await db.transactions.add(transferTx);
        txIds.push(transferTxId);
      }

      // 2.2 Thu nhập thực tế bỏ túi (INCOME):
      // Thu nhập thực sự kiếm được: Thu nhập ròng cuốc xe + Tip (nếu có)
      // Nếu khách đưa hụt so với cước: trừ phần hụt vào thu nhập
      const fareShortage = appFare > cashReceived ? (appFare - cashReceived) : 0;
      const cashIncomeAmount = Math.max(0, netIncome - fareShortage) + (isCashTip ? tip : 0);
      totalEarned = cashIncomeAmount;

      // Cập nhật số dư mới nhất của Ví nhận tiền
      const currentTarget = await db.wallets.get(targetWallet.id);
      const currentBalance = currentTarget ? currentTarget.balance : targetWallet.balance;

      await db.wallets.update(targetWallet.id, {
        balance: currentBalance + cashIncomeAmount,
        updatedAt: now
      });

      const incomeTxId = generateUUID();
      const incomeNoteParts: string[] = [];
      if (note?.trim()) incomeNoteParts.push(note.trim());
      if (appFare > 0) {
        incomeNoteParts.push(`Cước: ${new Intl.NumberFormat('vi-VN').format(appFare)}₫`);
      }
      incomeNoteParts.push(`Ròng: +${new Intl.NumberFormat('vi-VN').format(netIncome)}₫`);
      if (isCashTip) {
        incomeNoteParts.push(`Tip thêm: +${new Intl.NumberFormat('vi-VN').format(tip)}₫`);
      }

      let incomeNoteStr = incomeNoteParts.join(' • ');
      if (isCashTip) {
        incomeNoteStr += ', Tiền tip Grab';
      }

      const incomeTx: Transaction = {
        id: incomeTxId,
        walletId: targetWallet.id,
        categoryId: GRAB_INCOME_CAT_ID,
        type: 'INCOME',
        amount: cashIncomeAmount,
        date,
        time,
        note: incomeNoteStr,
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
            note: `[Grab Tip App] Tiền tip khách bo qua app (+${new Intl.NumberFormat('vi-VN').format(tip)}₫), Tiền tip Grab`,
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
  await db.transaction('rw', [db.transactions, db.categories, db.wallets, db.settings], async () => {
    // Đảm bảo 2 danh mục Grab luôn tồn tại
    const now = new Date().toISOString();
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
    }

    const allTxs = await db.transactions.toArray();
    // Tìm các giao dịch EXPENSE phí Grab cũ
    const feeTxs = allTxs.filter(
      (tx) =>
        tx.type === 'EXPENSE' &&
        (tx.categoryId === GRAB_FEE_CAT_ID ||
          (tx.note && (tx.note.toLowerCase().includes('chiết khấu phí grab') || tx.note.toLowerCase().includes('chiết khấu'))))
    );

    if (feeTxs.length === 0) return;

    const allIncomes = allTxs.filter((t) => t.type === 'INCOME');
    const allWallets = await db.wallets.toArray();
    const defaultCashWallet = allWallets.find((w) => w.type === 'CASH') || allWallets[0];

    for (const feeTx of feeTxs) {
      // 1. Trích xuất số tiền cuốc nếu có trong note: "Chiết khấu phí Grab (25.588₫) - Cuốc 36.000₫"
      let expectedCashReceived = 0;
      const match = feeTx.note?.match(/Cuốc\s+([0-9.,]+)/i);
      if (match && match[1]) {
        expectedCashReceived = Number(match[1].replace(/\D/g, ''));
      }

      // Candidate incomes cùng ngày
      const candidateIncomes = allIncomes.filter(
        (t) => t.date === feeTx.date && t.amount > feeTx.amount
      );

      let matchedIncome: Transaction | undefined;
      // Khớp theo expectedCashReceived
      if (expectedCashReceived > 0) {
        matchedIncome = candidateIncomes.find((t) => Math.abs(t.amount - expectedCashReceived) <= 10);
      }
      // Khớp theo Ròng trong note của income:
      if (!matchedIncome) {
        matchedIncome = candidateIncomes.find((t) => {
          const rMatch = t.note?.match(/Ròng:\s*\+?([0-9.,]+)/i);
          if (rMatch && rMatch[1]) {
            const expNet = Number(rMatch[1].replace(/\D/g, ''));
            return Math.abs(t.amount - feeTx.amount - expNet) <= 10;
          }
          return false;
        });
      }
      // Khớp theo category / note Grab
      if (!matchedIncome) {
        matchedIncome = candidateIncomes.find(
          (t) => t.categoryId === GRAB_INCOME_CAT_ID || (t.note && t.note.includes('Grab'))
        );
      }
      // Khớp theo giờ gần nhất
      if (!matchedIncome && candidateIncomes.length > 0) {
        matchedIncome = [...candidateIncomes].sort((a, b) => {
          const diffA = Math.abs((a.time || '').localeCompare(feeTx.time || ''));
          const diffB = Math.abs((b.time || '').localeCompare(feeTx.time || ''));
          return diffA - diffB;
        })[0];
      }

      if (matchedIncome) {
        // Chuyển feeTx thành TRANSFER (Vốn lưu động) từ ví tín dụng sang ví nhận tiền
        await db.transactions.update(feeTx.id, {
          type: 'TRANSFER',
          walletId: feeTx.walletId,
          toWalletId: matchedIncome.walletId,
          categoryId: undefined,
          note: `[Vốn lưu động Grab] Luân chuyển ví tín dụng sang ví nhận (Vốn cuốc: ${new Intl.NumberFormat('vi-VN').format(feeTx.amount)}₫)`,
          updatedAt: now
        });

        // Chuyển matchedIncome về đúng Thu nhập ròng
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

        const idx = allIncomes.indexOf(matchedIncome);
        if (idx !== -1) allIncomes.splice(idx, 1);

        migratedCount++;
      } else if (defaultCashWallet) {
        // Nếu không tìm thấy income matching, vẫn đổi feeTx thành TRANSFER để không bị âm vào Chi tiêu!
        await db.transactions.update(feeTx.id, {
          type: 'TRANSFER',
          walletId: feeTx.walletId,
          toWalletId: defaultCashWallet.id,
          categoryId: undefined,
          note: `[Vốn lưu động Grab] Luân chuyển ví tín dụng (${new Intl.NumberFormat('vi-VN').format(feeTx.amount)}₫)`,
          updatedAt: now
        });
        migratedCount++;
      }
    }
  });

  return migratedCount;
}
