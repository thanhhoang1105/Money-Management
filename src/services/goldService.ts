// src/services/goldService.ts
import { db } from '../db';
import { generateUUID } from '../utils/uuid';
import { formatVND, getCurrentDate, getCurrentTime } from '../utils/formatters';

export interface GoldPriceInfo {
  buyPerChi: number;   // Giá mua vào (VNĐ/chỉ) - Dùng để định giá tài sản thực tế khi thanh lý
  sellPerChi: number;  // Giá bán ra (VNĐ/chỉ)
  brandName: string;
  updatedDate: string;
  updatedTime: string;
  source: string;
}

export const FALLBACK_GOLD_PRICE: GoldPriceInfo = {
  buyPerChi: 13700000, // 13.7 triệu/chỉ (tham khảo)
  sellPerChi: 14100000,
  brandName: 'Vàng nhẫn 9999 (24K)',
  updatedDate: '2026-10-27',
  updatedTime: '09:00',
  source: 'Hệ thống'
};

const GOLD_PRICE_API_URL = 'https://www.vang.today/api/prices';

/**
 * Định dạng khối lượng vàng thành chuỗi thuần Việt (Cây, Chỉ, Phân)
 * Ví dụ:
 * - 0.5 -> "5 phân"
 * - 1.0 -> "1 chỉ"
 * - 1.5 -> "1 chỉ 5 phân"
 * - 12.5 -> "1 cây 2 chỉ 5 phân"
 */
export function formatGoldWeight(weightChi: number): string {
  if (!weightChi || weightChi <= 0) return '0 chỉ';

  const rounded = Math.round(weightChi * 10) / 10;
  const cay = Math.floor(rounded / 10);
  const rem = rounded % 10;
  const chi = Math.floor(rem);
  const phan = Math.round((rem - chi) * 10);

  const parts: string[] = [];
  if (cay > 0) parts.push(`${cay} cây`);
  if (chi > 0) parts.push(`${chi} chỉ`);
  if (phan > 0) parts.push(`${phan} phân`);

  return parts.length > 0 ? parts.join(' ') : '0 chỉ';
}

/**
 * Quy đổi từ (Số chỉ, Số phân) thành tổng số chỉ dạng số thập phân
 * Ví dụ: 1 chỉ, 5 phân -> 1.5 chỉ
 */
export function parseGoldWeight(chi: number = 0, phan: number = 0): number {
  const safeChi = Math.max(0, Number(chi) || 0);
  const safePhan = Math.max(0, Number(phan) || 0);
  return Math.round((safeChi + safePhan * 0.1) * 100) / 100;
}

/**
 * Tải giá vàng nhẫn 9999 hôm nay từ API công khai vang.today (hỗ trợ CORS)
 */
export async function fetchLiveGoldPrice(): Promise<GoldPriceInfo> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(GOLD_PRICE_API_URL, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    const prices = data?.prices || {};

    // Ưu tiên lấy giá Vàng nhẫn 9999 (Bảo Tín Minh Châu, DOJI hoặc SJC Ring)
    const nhanRef =
      prices.BT9999NTT ||
      prices.DOJINHTV ||
      prices.PQHN24NTT ||
      prices.SJ9999;

    if (nhanRef && nhanRef.buy > 0) {
      // API trả về đơn vị 1 lượng (10 chỉ) -> chia 10 ra giá 1 chỉ
      const buyPerChi = Math.round(nhanRef.buy / 10);
      const sellPerChi = Math.round(nhanRef.sell / 10);

      const priceInfo: GoldPriceInfo = {
        buyPerChi,
        sellPerChi,
        brandName: 'Vàng nhẫn 9999 (24K)',
        updatedDate: data.date || new Date().toISOString().slice(0, 10),
        updatedTime: data.time || '09:00',
        source: 'Thị trường tự do / vang.today'
      };

      // Lưu cache vào IndexedDB settings để dùng offline
      await db.settings.put({
        key: 'cached_gold_price',
        value: priceInfo
      });
      await db.settings.put({
        key: 'last_gold_price_time',
        value: new Date().toISOString()
      });

      return priceInfo;
    }

    throw new Error('Không tìm thấy dữ liệu giá vàng nhẫn 9999');
  } catch (err) {
    console.warn('[GoldService] Không thể tải giá vàng trực tuyến, dùng cache:', err);
    return await getCachedGoldPrice();
  }
}

/**
 * Lấy giá vàng từ bộ nhớ đệm (IndexedDB) hoặc giá dự phòng
 */
export async function getCachedGoldPrice(): Promise<GoldPriceInfo> {
  try {
    const cached = await db.settings.get('cached_gold_price');
    if (cached?.value && typeof cached.value === 'object') {
      return cached.value as GoldPriceInfo;
    }
  } catch {
    // ignore
  }
  return FALLBACK_GOLD_PRICE;
}

/**
 * Tự động cập nhật số dư cho toàn bộ các ví Vàng (Gold Vault) theo giá vàng mới nhất
 */
export async function updateAllGoldWallets(customPricePerChi?: number): Promise<{
  updatedCount: number;
  pricePerChi: number;
}> {
  const priceInfo = customPricePerChi
    ? { ...FALLBACK_GOLD_PRICE, buyPerChi: customPricePerChi }
    : await fetchLiveGoldPrice();

  const price = priceInfo.buyPerChi;
  const wallets = await db.wallets.toArray();
  const goldWallets = wallets.filter(
    (w) => w.goldDetails && typeof w.goldDetails.weightChi === 'number' && w.goldDetails.weightChi > 0
  );

  if (goldWallets.length === 0) {
    return { updatedCount: 0, pricePerChi: price };
  }

  const now = new Date().toISOString();
  await db.transaction('rw', [db.wallets, db.settings], async () => {
    for (const w of goldWallets) {
      if (!w.goldDetails) continue;
      const weightChi = w.goldDetails.weightChi;
      const newBalance = Math.round(weightChi * price);

      await db.wallets.update(w.id, {
        balance: newBalance,
        goldDetails: {
          ...w.goldDetails,
          currentPricePerChi: price,
          lastUpdated: now
        },
        updatedAt: now
      });
    }

    await db.settings.put({
      key: 'last_gold_wallets_sync',
      value: now
    });
  });

  return { updatedCount: goldWallets.length, pricePerChi: price };
}

/**
 * Tự động kiểm tra và cập nhật giá vàng khi ứng dụng khởi động vào buổi sáng (sau 8h30)
 */
export async function checkAndUpdateGoldOnStartup(): Promise<boolean> {
  try {
    const wallets = await db.wallets.toArray();
    const hasGoldWallet = wallets.some(
      (w) => w.goldDetails && w.goldDetails.weightChi && w.goldDetails.weightChi > 0
    );

    if (!hasGoldWallet) return false;

    // Kiểm tra thời gian cập nhật gần nhất
    const lastSyncSetting = await db.settings.get('last_gold_wallets_sync');
    const lastSyncTime =
      typeof lastSyncSetting?.value === 'string'
        ? new Date(lastSyncSetting.value).getTime()
        : 0;

    const now = Date.now();
    // Nếu chưa cập nhật quá 4 tiếng -> Tự động tải giá mới
    if (now - lastSyncTime > 4 * 60 * 60 * 1000) {
      const res = await updateAllGoldWallets();
      return res.updatedCount > 0;
    }
  } catch (err) {
    console.warn('[GoldService] Startup gold price check skipped:', err);
  }
  return false;
}

export interface BuyGoldParams {
  cashWalletId: string;       // Ví trích tiền (Tiền mặt, Vietcombank...)
  goldWalletId: string;       // Két vàng nhận vàng
  amountVnd: number;          // Số tiền đã chi trả (VNĐ)
  weightChi: number;          // Khối lượng vàng mua (Chỉ, VD: 0.5 chỉ = 5 phân)
  pricePerChi: number;        // Đơn giá tại thời điểm mua (VNĐ/chỉ)
  date?: string;              // YYYY-MM-DD
  time?: string;              // HH:mm
  note?: string;              // Ghi chú
}

export interface SellGoldParams {
  goldWalletId: string;       // Két vàng trích bán
  cashWalletId: string;       // Ví nhận tiền (Tiền mặt, Vietcombank...)
  amountVnd: number;          // Số tiền thực nhận về (VNĐ)
  weightChi: number;          // Khối lượng vàng bán (Chỉ, VD: 0.5 chỉ = 5 phân)
  pricePerChi: number;        // Đơn giá bán tại thời điểm giao dịch (VNĐ/chỉ)
  date?: string;              // YYYY-MM-DD
  time?: string;              // HH:mm
  note?: string;              // Ghi chú
}

/**
 * Mua vàng tích lũy: Trích tiền từ ví tiền mặt/ngân hàng, cộng dồn số lượng vàng vào Két vàng
 */
export async function buyGold(params: BuyGoldParams): Promise<{
  transactionId: string;
  newWeightChi: number;
  newGoldBalance: number;
}> {
  const { cashWalletId, goldWalletId, amountVnd, weightChi, pricePerChi } = params;
  if (!cashWalletId || !goldWalletId) throw new Error('Vui lòng chọn ví thanh toán và Két vàng');
  if (cashWalletId === goldWalletId) throw new Error('Ví thanh toán và Két vàng không thể trùng nhau');
  if (amountVnd <= 0) throw new Error('Số tiền mua vàng phải lớn hơn 0');
  if (weightChi <= 0) throw new Error('Số lượng vàng mua phải lớn hơn 0');

  const now = new Date().toISOString();
  const txId = generateUUID();
  const date = params.date || getCurrentDate();
  const time = params.time || getCurrentTime();

  let finalNewWeight = 0;
  let finalNewBalance = 0;

  await db.transaction('rw', [db.wallets, db.transactions, db.settings], async () => {
    const cashWallet = await db.wallets.get(cashWalletId);
    const goldWallet = await db.wallets.get(goldWalletId);

    if (!cashWallet) throw new Error('Không tìm thấy ví thanh toán');
    if (!goldWallet) throw new Error('Không tìm thấy Két vàng');

    const currentWeight = goldWallet.goldDetails?.weightChi || 0;
    finalNewWeight = Math.round((currentWeight + weightChi) * 100) / 100;
    // Số dư định giá của két vàng được cập nhật theo tổng khối lượng mới và đơn giá
    finalNewBalance = Math.round(finalNewWeight * pricePerChi);

    // 1. Trừ tiền ở ví thanh toán
    await db.wallets.update(cashWalletId, {
      balance: cashWallet.balance - amountVnd,
      updatedAt: now
    });

    // 2. Cập nhật Két vàng: tăng khối lượng vàng và cập nhật số dư định giá
    await db.wallets.update(goldWalletId, {
      balance: finalNewBalance,
      goldDetails: {
        weightChi: finalNewWeight,
        goldType: goldWallet.goldDetails?.goldType || 'NHAN_9999',
        goldTypeName: goldWallet.goldDetails?.goldTypeName || 'Vàng nhẫn 9999 (24K)',
        currentPricePerChi: pricePerChi,
        lastUpdated: now
      },
      updatedAt: now
    });

    // 3. Tạo bản ghi giao dịch TRANSFER
    const noteText =
      params.note?.trim() ||
      `Mua ${formatGoldWeight(weightChi)} vàng nhẫn (${formatVND(amountVnd)}) từ ${cashWallet.name}`;

    await db.transactions.add({
      id: txId,
      walletId: cashWalletId,
      toWalletId: goldWalletId,
      type: 'TRANSFER',
      amount: amountVnd,
      date,
      time,
      note: noteText,
      categoryId: '',
      createdAt: now,
      updatedAt: now
    });

    await db.settings.put({
      key: 'last_used_wallet_id',
      value: cashWalletId
    });
  });

  window.dispatchEvent(new Event('local-data-changed'));
  return { transactionId: txId, newWeightChi: finalNewWeight, newGoldBalance: finalNewBalance };
}

/**
 * Bán vàng: Trừ số lượng vàng trong Két vàng, cộng tiền mặt/ngân hàng vào ví nhận
 */
export async function sellGold(params: SellGoldParams): Promise<{
  transactionId: string;
  newWeightChi: number;
  newGoldBalance: number;
}> {
  const { goldWalletId, cashWalletId, amountVnd, weightChi, pricePerChi } = params;
  if (!cashWalletId || !goldWalletId) throw new Error('Vui lòng chọn Két vàng và ví nhận tiền');
  if (cashWalletId === goldWalletId) throw new Error('Két vàng và ví nhận tiền không thể trùng nhau');
  if (amountVnd <= 0) throw new Error('Số tiền bán vàng phải lớn hơn 0');
  if (weightChi <= 0) throw new Error('Số lượng vàng bán phải lớn hơn 0');

  const now = new Date().toISOString();
  const txId = generateUUID();
  const date = params.date || getCurrentDate();
  const time = params.time || getCurrentTime();

  let finalNewWeight = 0;
  let finalNewBalance = 0;

  await db.transaction('rw', [db.wallets, db.transactions, db.settings], async () => {
    const goldWallet = await db.wallets.get(goldWalletId);
    const cashWallet = await db.wallets.get(cashWalletId);

    if (!goldWallet) throw new Error('Không tìm thấy Két vàng');
    if (!cashWallet) throw new Error('Không tìm thấy ví nhận tiền');

    const currentWeight = goldWallet.goldDetails?.weightChi || 0;
    if (weightChi > currentWeight + 0.001) {
      throw new Error(
        `Số lượng vàng trong két (${formatGoldWeight(currentWeight)}) không đủ để bán ${formatGoldWeight(weightChi)}`
      );
    }

    finalNewWeight = Math.max(0, Math.round((currentWeight - weightChi) * 100) / 100);
    finalNewBalance = Math.round(finalNewWeight * pricePerChi);

    // 1. Trừ khối lượng vàng trong Két vàng và cập nhật số dư định giá
    await db.wallets.update(goldWalletId, {
      balance: finalNewBalance,
      goldDetails: {
        weightChi: finalNewWeight,
        goldType: goldWallet.goldDetails?.goldType || 'NHAN_9999',
        goldTypeName: goldWallet.goldDetails?.goldTypeName || 'Vàng nhẫn 9999 (24K)',
        currentPricePerChi: pricePerChi,
        lastUpdated: now
      },
      updatedAt: now
    });

    // 2. Cộng tiền vào ví nhận tiền
    await db.wallets.update(cashWalletId, {
      balance: cashWallet.balance + amountVnd,
      updatedAt: now
    });

    // 3. Tạo bản ghi giao dịch TRANSFER
    const noteText =
      params.note?.trim() ||
      `Bán ${formatGoldWeight(weightChi)} vàng nhẫn thu ${formatVND(amountVnd)} về ${cashWallet.name}`;

    await db.transactions.add({
      id: txId,
      walletId: goldWalletId,
      toWalletId: cashWalletId,
      type: 'TRANSFER',
      amount: amountVnd,
      date,
      time,
      note: noteText,
      categoryId: '',
      createdAt: now,
      updatedAt: now
    });

    await db.settings.put({
      key: 'last_used_wallet_id',
      value: cashWalletId
    });
  });

  window.dispatchEvent(new Event('local-data-changed'));
  return { transactionId: txId, newWeightChi: finalNewWeight, newGoldBalance: finalNewBalance };
}
