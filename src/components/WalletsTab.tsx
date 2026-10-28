// src/components/WalletsTab.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Wallet, WalletType } from '../types';
import {
  createWallet,
  adjustWalletBalance,
  deleteWallet,
  sortWallets,
  moveWalletPosition,
  reorderWallets,
  createTransaction
} from '../services/transactionService';
import { COLOR_PRESETS, isLightColor } from '../services/categoryService';
import { CategoryIcon } from './CategoryIcon';
import {
  BANK_BRANDS,
  BankLogo,
  detectBankBrand,
  BankBrandAccordionPicker
} from './BankLogo';
import {
  fetchLiveGoldPrice,
  getCachedGoldPrice,
  formatGoldWeight,
  parseGoldWeight,
  updateAllGoldWallets,
  buyGold,
  sellGold,
  type GoldPriceInfo,
  FALLBACK_GOLD_PRICE
} from '../services/goldService';
import { formatVND, getCurrentDate, getCurrentTime } from '../utils/formatters';
import { CustomSelect } from './ui/CustomSelect';
import { WalletSelect } from './ui/WalletSelect';
import { DatePicker } from './ui/DatePicker';
import { Toast } from './ui/Toast';
import {
  Plus,
  Edit3,
  Trash2,
  EyeOff,
  Check,
  SlidersHorizontal,
  ShieldAlert,
  ArrowLeft,
  ArrowUpDown,
  ArrowRightLeft,
  MoreVertical,
  ChevronRight,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  GripVertical,
  RefreshCw,
  Coins,
  ArrowDownLeft,
  Pencil,
  ShieldCheck
} from 'lucide-react';

const WALLET_COLORS = COLOR_PRESETS;

interface WalletsTabProps {
  resetSignal?: number;
}

export const WalletsTab: React.FC<WalletsTabProps> = ({ resetSignal }) => {
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const sortedWallets = useMemo(() => sortWallets(wallets), [wallets]);
  const goldWallets = useMemo(() => sortedWallets.filter((w) => Boolean(w.goldDetails)), [sortedWallets]);

  const [viewMode, setViewMode] = useState<
    'LIST' | 'CREATE' | 'EDIT' | 'ADJUST' | 'TRANSFER' | 'GOLD_TRADE'
  >('LIST');
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [activeMenuWallet, setActiveMenuWallet] = useState<Wallet | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [draggedWalletId, setDraggedWalletId] = useState<string | null>(null);

  // Gold Trade states (Mua / Bán vàng)
  const [goldTradeAction, setGoldTradeAction] = useState<'BUY' | 'SELL'>('BUY');
  const [goldTradeTargetWalletId, setGoldTradeTargetWalletId] = useState<string>('');
  const [goldTradeCashWalletId, setGoldTradeCashWalletId] = useState<string>('');
  const [goldTradeUnitPriceStr, setGoldTradeUnitPriceStr] = useState<string>('');
  const [goldTradeAmountStr, setGoldTradeAmountStr] = useState<string>('');
  const [goldTradeChi, setGoldTradeChi] = useState<string>('');
  const [goldTradePhan, setGoldTradePhan] = useState<string>('');
  const [goldTradeDate, setGoldTradeDate] = useState<string>(() => getCurrentDate());
  const [goldTradeNote, setGoldTradeNote] = useState<string>('');
  const [isEditingCustomPrice, setIsEditingCustomPrice] = useState(false);

  // Transfer states
  const [toWalletId, setToWalletId] = useState<string>('');
  const [transferFeeStr, setTransferFeeStr] = useState<string>('0');
  const [transferDate, setTransferDate] = useState<string>(() => getCurrentDate());
  const [transferNote, setTransferNote] = useState<string>('');
  const [walletNotice, setWalletNotice] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning';
  } | null>(null);

  // Lắng nghe tín hiệu từ menu điều hướng để trở về danh sách ví chính
  const prevResetSignalRef = React.useRef(resetSignal);
  React.useEffect(() => {
    if (
      resetSignal !== undefined &&
      resetSignal > 0 &&
      resetSignal !== prevResetSignalRef.current
    ) {
      prevResetSignalRef.current = resetSignal;
      setViewMode('LIST');
      setSelectedWallet(null);
      setActiveMenuWallet(null);
      setIsReordering(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [resetSignal]);

  // Đóng menu 3 chấm khi bấm phím Escape trên bàn phím
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenuWallet(null);
      }
    };
    if (activeMenuWallet) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [activeMenuWallet]);

  // Form states
  const [name, setName] = useState('');
  const [walletType, setWalletType] = useState<WalletType>('BANK');
  const [balanceStr, setBalanceStr] = useState('');
  const [icon, setIcon] = useState('bank:vcb');
  const [color, setColor] = useState('#00703C');
  const [isExcluded, setIsExcluded] = useState(false);
  const [autoRecordAdjustTx, setAutoRecordAdjustTx] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Gold vault states
  const [liveGoldInfo, setLiveGoldInfo] = useState<GoldPriceInfo | null>(null);
  const [isUpdatingGoldPrice, setIsUpdatingGoldPrice] = useState(false);
  const [goldChi, setGoldChi] = useState('');
  const [goldPhan, setGoldPhan] = useState('');
  const [goldPriceStr, setGoldPriceStr] = useState('');

  // Tải giá vàng nhẫn 9999 khi mở màn hình Ví
  React.useEffect(() => {
    let isMounted = true;
    void getCachedGoldPrice().then((cached) => {
      if (isMounted && cached) setLiveGoldInfo(cached);
    });
    void fetchLiveGoldPrice().then((latest) => {
      if (isMounted && latest) setLiveGoldInfo(latest);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefreshAllGoldWallets = async () => {
    try {
      setIsUpdatingGoldPrice(true);
      const res = await updateAllGoldWallets();
      const latest = await getCachedGoldPrice();
      setLiveGoldInfo(latest);
      if (res.updatedCount > 0) {
        setWalletNotice({
          message: `Đã cập nhật giá vàng mới nhất: ${formatVND(res.pricePerChi)}/chỉ cho ${res.updatedCount} két vàng!`,
          type: 'success'
        });
      } else {
        setWalletNotice({
          message: `Giá vàng nhẫn 9999 hôm nay: ${formatVND(res.pricePerChi)}/chỉ (${latest.source})`,
          type: 'success'
        });
      }
      setTimeout(() => setWalletNotice(null), 3500);
    } catch {
      setWalletNotice({
        message: 'Không thể kết nối tải giá vàng mới nhất, hãy thử lại sau.',
        type: 'warning'
      });
      setTimeout(() => setWalletNotice(null), 3000);
    } finally {
      setIsUpdatingGoldPrice(false);
    }
  };

  const handleRefreshSingleGoldWallet = async (wallet: Wallet) => {
    try {
      setIsUpdatingGoldPrice(true);
      const latestPrice = await fetchLiveGoldPrice();
      setLiveGoldInfo(latestPrice);
      const price = latestPrice.buyPerChi;
      const weightChi = wallet.goldDetails?.weightChi || 0;
      const newBalance = Math.round(weightChi * price);
      const now = new Date().toISOString();

      await db.wallets.update(wallet.id, {
        balance: newBalance,
        goldDetails: {
          ...wallet.goldDetails!,
          currentPricePerChi: price,
          lastUpdated: now
        },
        updatedAt: now
      });

      setWalletNotice({
        message: `Đã cập nhật giá "${wallet.name}": ${formatVND(price)}/chỉ (Số dư: ${formatVND(newBalance)})`,
        type: 'success'
      });
      setTimeout(() => setWalletNotice(null), 3500);
    } catch {
      setWalletNotice({
        message: 'Lỗi tải giá vàng, vui lòng thử lại sau.',
        type: 'error'
      });
      setTimeout(() => setWalletNotice(null), 3000);
    } finally {
      setIsUpdatingGoldPrice(false);
    }
  };

  const totalIncludedBalance = wallets
    .filter((w) => !w.isExcludedFromTotal)
    .reduce((sum, w) => sum + w.balance, 0);

  const totalExcludedBalance = wallets
    .filter((w) => w.isExcludedFromTotal)
    .reduce((sum, w) => sum + w.balance, 0);

  const openCreateModal = () => {
    const defaultBrand = BANK_BRANDS[0];
    setName(defaultBrand.shortName);
    setWalletType('BANK');
    setBalanceStr('');
    setIcon(defaultBrand.id);
    setColor(defaultBrand.primaryColor);
    setIsExcluded(false);
    setGoldChi('');
    setGoldPhan('');
    const defaultPrice = liveGoldInfo?.buyPerChi || FALLBACK_GOLD_PRICE.buyPerChi;
    setGoldPriceStr(new Intl.NumberFormat('vi-VN').format(defaultPrice));
    setErrorMsg('');
    setViewMode('CREATE');
  };

  const openEditModal = (w: Wallet) => {
    setSelectedWallet(w);
    setName(w.name);
    setWalletType(w.type || 'BANK');
    setIcon(w.icon);
    setColor(w.color);
    setIsExcluded(w.isExcludedFromTotal);
    if (w.goldDetails) {
      const rounded = Math.round((w.goldDetails.weightChi || 0) * 10) / 10;
      const chi = Math.floor(rounded);
      const phan = Math.round((rounded - chi) * 10);
      setGoldChi(chi > 0 ? chi.toString() : '');
      setGoldPhan(phan > 0 ? phan.toString() : '');
      const p = w.goldDetails.currentPricePerChi || liveGoldInfo?.buyPerChi || FALLBACK_GOLD_PRICE.buyPerChi;
      setGoldPriceStr(new Intl.NumberFormat('vi-VN').format(p));
    } else {
      setGoldChi('');
      setGoldPhan('');
      const p = liveGoldInfo?.buyPerChi || FALLBACK_GOLD_PRICE.buyPerChi;
      setGoldPriceStr(new Intl.NumberFormat('vi-VN').format(p));
    }
    setErrorMsg('');
    setViewMode('EDIT');
  };

  const openAdjustModal = (w: Wallet) => {
    setSelectedWallet(w);
    setBalanceStr(w.balance.toString());
    setAutoRecordAdjustTx(true);
    setErrorMsg('');
    setViewMode('ADJUST');
  };

  const openTransferModal = (w: Wallet) => {
    if (sortedWallets.length <= 1) {
      setWalletNotice({
        message: 'Bạn cần có ít nhất 2 tài khoản / ví để thực hiện chuyển tiền giữa các ví.',
        type: 'warning'
      });
      setTimeout(() => setWalletNotice(null), 3500);
      return;
    }
    setSelectedWallet(w);
    const otherWallet = sortedWallets.find((x) => x.id !== w.id);
    setToWalletId(otherWallet ? otherWallet.id : '');
    setBalanceStr('');
    setTransferFeeStr('0');
    setTransferDate(getCurrentDate());
    setTransferNote('');
    setErrorMsg('');
    setViewMode('TRANSFER');
  };

  const openGoldTradeModal = (goldWallet: Wallet, action: 'BUY' | 'SELL' = 'BUY') => {
    setGoldTradeAction(action);
    setGoldTradeTargetWalletId(goldWallet.id);
    setIsEditingCustomPrice(false);

    // Tìm ví tiền mặt / ngân hàng mặc định
    const availableCash =
      sortedWallets.find((w) => w.id !== goldWallet.id && !w.goldDetails) ||
      sortedWallets.find((w) => w.id !== goldWallet.id);
    setGoldTradeCashWalletId(availableCash ? availableCash.id : '');

    // Đơn giá tham chiếu: Mua thì lấy giá bán ra (hoặc giá mua vào nếu chưa có), Bán thì lấy giá mua vào
    const defaultUnitPrice =
      action === 'BUY'
        ? liveGoldInfo?.sellPerChi || liveGoldInfo?.buyPerChi || FALLBACK_GOLD_PRICE.sellPerChi
        : liveGoldInfo?.buyPerChi || FALLBACK_GOLD_PRICE.buyPerChi;
    setGoldTradeUnitPriceStr(new Intl.NumberFormat('vi-VN').format(defaultUnitPrice));

    // Khối lượng khởi tạo mặc định: 5 phân (0.5 chỉ)
    setGoldTradeChi('');
    setGoldTradePhan('5');
    const initWeight = 0.5;
    const initAmt = Math.round(initWeight * defaultUnitPrice);
    setGoldTradeAmountStr(new Intl.NumberFormat('vi-VN').format(initAmt));
    setGoldTradeDate(getCurrentDate());
    setGoldTradeNote('');
    setErrorMsg('');
    setViewMode('GOLD_TRADE');
  };

  // Khi người dùng thay đổi Số tiền (VNĐ) -> Tự động tính số Chỉ & Phân
  const handleGoldTradeAmountChange = (valStr: string) => {
    const rawDigits = valStr.replace(/[^0-9]/g, '');
    const amt = Number(rawDigits) || 0;
    setGoldTradeAmountStr(rawDigits ? new Intl.NumberFormat('vi-VN').format(amt) : '');

    const unitPrice = Number(goldTradeUnitPriceStr.replace(/[^0-9]/g, '')) || 0;
    if (unitPrice > 0 && amt > 0) {
      // 1 chỉ = 10 phân -> weightInPhan = (amt / unitPrice) * 10
      const totalPhan = Math.round((amt / unitPrice) * 10 * 10) / 10;
      const c = Math.floor(totalPhan / 10);
      const p = Math.round(totalPhan % 10);
      setGoldTradeChi(c > 0 ? c.toString() : '');
      setGoldTradePhan(p > 0 ? p.toString() : '');
    } else if (amt === 0) {
      setGoldTradeChi('');
      setGoldTradePhan('');
    }
  };

  // Khi người dùng thay đổi Số lượng Chỉ hoặc Phân -> Tự động tính Số tiền (VNĐ)
  const handleGoldTradeWeightChange = (newChiStr: string, newPhanStr: string) => {
    setGoldTradeChi(newChiStr);
    setGoldTradePhan(newPhanStr);

    const c = Number(newChiStr.replace(/[^0-9.]/g, '')) || 0;
    const p = Number(newPhanStr.replace(/[^0-9.]/g, '')) || 0;
    const weight = parseGoldWeight(c, p);
    const unitPrice = Number(goldTradeUnitPriceStr.replace(/[^0-9]/g, '')) || 0;

    if (unitPrice > 0 && weight > 0) {
      const amt = Math.round(weight * unitPrice);
      setGoldTradeAmountStr(new Intl.NumberFormat('vi-VN').format(amt));
    } else {
      setGoldTradeAmountStr('');
    }
  };

  // Khi người dùng thay đổi Đơn giá -> Cập nhật lại số tiền
  const handleGoldTradeUnitPriceChange = (valStr: string) => {
    const rawDigits = valStr.replace(/[^0-9]/g, '');
    const newPrice = Number(rawDigits) || 0;
    setGoldTradeUnitPriceStr(rawDigits ? new Intl.NumberFormat('vi-VN').format(newPrice) : '');

    const c = Number(goldTradeChi.replace(/[^0-9.]/g, '')) || 0;
    const p = Number(goldTradePhan.replace(/[^0-9.]/g, '')) || 0;
    const weight = parseGoldWeight(c, p);

    if (newPrice > 0 && weight > 0) {
      const amt = Math.round(weight * newPrice);
      setGoldTradeAmountStr(new Intl.NumberFormat('vi-VN').format(amt));
    }
  };

  const handleExecuteGoldTrade = async () => {
    if (!goldTradeTargetWalletId || !goldTradeCashWalletId) {
      setErrorMsg('Vui lòng chọn đầy đủ Két vàng và Ví thanh toán / nhận tiền');
      return;
    }
    const unitPrice = Number(goldTradeUnitPriceStr.replace(/[^0-9]/g, '')) || 0;
    if (unitPrice <= 0) {
      setErrorMsg('Vui lòng nhập đơn giá thị trường hợp lệ (> 0đ)');
      return;
    }

    const c = Number(goldTradeChi.replace(/[^0-9.]/g, '')) || 0;
    const p = Number(goldTradePhan.replace(/[^0-9.]/g, '')) || 0;
    let weight = parseGoldWeight(c, p);
    let amt = Number(goldTradeAmountStr.replace(/[^0-9]/g, '')) || 0;

    if (weight <= 0 && amt > 0) {
      weight = Math.round((amt / unitPrice) * 100) / 100;
    }
    if (amt <= 0 && weight > 0) {
      amt = Math.round(weight * unitPrice);
    }

    if (weight <= 0 || amt <= 0) {
      setErrorMsg('Vui lòng nhập số tiền hoặc số lượng vàng hợp lệ');
      return;
    }

    const targetCashWallet = wallets.find((w) => w.id === goldTradeCashWalletId);

    try {
      if (goldTradeAction === 'BUY') {
        const res = await buyGold({
          cashWalletId: goldTradeCashWalletId,
          goldWalletId: goldTradeTargetWalletId,
          amountVnd: amt,
          weightChi: weight,
          pricePerChi: unitPrice,
          date: goldTradeDate || getCurrentDate(),
          time: getCurrentTime(),
          note:
            goldTradeNote.trim() ||
            `Mua ${formatGoldWeight(weight)} vàng nhẫn (${formatVND(amt)}) từ ${targetCashWallet?.name || 'Ví'}`
        });
        setWalletNotice({
          message: `Đã mua thành công ${formatGoldWeight(weight)} vàng! Két hiện có: ${formatGoldWeight(res.newWeightChi)}`,
          type: 'success'
        });
      } else {
        const res = await sellGold({
          goldWalletId: goldTradeTargetWalletId,
          cashWalletId: goldTradeCashWalletId,
          amountVnd: amt,
          weightChi: weight,
          pricePerChi: unitPrice,
          date: goldTradeDate || getCurrentDate(),
          time: getCurrentTime(),
          note:
            goldTradeNote.trim() ||
            `Bán ${formatGoldWeight(weight)} vàng nhẫn thu ${formatVND(amt)} về ${targetCashWallet?.name || 'Ví'}`
        });
        setWalletNotice({
          message: `Đã bán ${formatGoldWeight(weight)} vàng thu về ${formatVND(amt)}! Két còn lại: ${formatGoldWeight(res.newWeightChi)}`,
          type: 'success'
        });
      }
      setTimeout(() => setWalletNotice(null), 3500);
      setViewMode('LIST');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi xảy ra khi thực hiện giao dịch vàng');
    }
  };

  const handleSelectBrandLogo = (brandId: string) => {
    const brand = BANK_BRANDS.find((b) => b.id === brandId);
    if (!brand) return;
    setIcon(brand.id);
    setColor(brand.primaryColor);
    if (brand.id === 'other:gold_9999' || brand.id === 'other:sjc') {
      setWalletType('INVESTMENT');
    } else if (brand.id === 'ewallet:spaylater') {
      setWalletType('CREDIT');
    } else if (brand.category === 'BANK') {
      setWalletType('BANK');
    } else if (brand.category === 'EWALLET') {
      setWalletType('E_WALLET');
    } else if (brand.category === 'CARD') {
      setWalletType('CREDIT');
    } else {
      setWalletType('CASH');
    }

    // Tự động gợi ý tên ngân hàng/ví điện tử nếu ô tên đang trống hoặc đang là tên của 1 ngân hàng khác
    const isCurrentNameDefaultOrBrand =
      !name.trim() ||
      BANK_BRANDS.some(
        (b) =>
          b.shortName.toLowerCase() === name.trim().toLowerCase() ||
          b.name.toLowerCase() === name.trim().toLowerCase()
      );
    if (isCurrentNameDefaultOrBrand) {
      if (brand.id === 'other:gold_9999') {
        setName('Vàng nhẫn 9999 (24K)');
      } else if (brand.id === 'other:sjc') {
        setName('Vàng miếng SJC');
      } else if (brand.id === 'ewallet:spaylater') {
        setName('Shopee SPayLater');
      } else {
        setName(brand.shortName);
      }
    }
  };

  const handleCreateWallet = async () => {
    if (!name.trim()) {
      setErrorMsg('Vui lòng nhập tên tài khoản / ví');
      return;
    }

    let initBal = 0;
    let goldDetails = undefined;

    if (walletType === 'INVESTMENT') {
      const parsedChi = Number(goldChi.replace(/[^0-9.]/g, '')) || 0;
      const parsedPhan = Number(goldPhan.replace(/[^0-9.]/g, '')) || 0;
      const weightChi = parseGoldWeight(parsedChi, parsedPhan);
      const rawPrice =
        Number(goldPriceStr.replace(/[^0-9]/g, '')) ||
        liveGoldInfo?.buyPerChi ||
        FALLBACK_GOLD_PRICE.buyPerChi;
      initBal = Math.round(weightChi * rawPrice);
      goldDetails = {
        weightChi,
        goldType: icon === 'other:sjc' ? 'SJC' : 'NHAN_9999',
        goldTypeName: icon === 'other:sjc' ? 'Vàng miếng SJC' : 'Vàng nhẫn 9999 (24K)',
        currentPricePerChi: rawPrice,
        lastUpdated: new Date().toISOString()
      };
    } else {
      initBal = Number(balanceStr.replace(/[^0-9-]/g, '')) || 0;
    }

    try {
      await createWallet({
        name: name.trim(),
        type: walletType,
        initialBalance: initBal,
        icon,
        color,
        isExcludedFromTotal: isExcluded,
        order: wallets.length,
        goldDetails
      });
      setWalletNotice({
        message: `Đã tạo tài khoản "${name.trim()}" thành công!`,
        type: 'success'
      });
      setTimeout(() => setWalletNotice(null), 3000);
      setViewMode('LIST');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi tạo ví');
    }
  };

  const handleSaveEditWallet = async () => {
    if (!selectedWallet) return;
    if (!name.trim()) {
      setErrorMsg('Tên tài khoản / ví không được để trống');
      return;
    }

    let goldDetails = selectedWallet.goldDetails;
    let newBalance = selectedWallet.balance;

    if (walletType === 'INVESTMENT') {
      const parsedChi = Number(goldChi.replace(/[^0-9.]/g, '')) || 0;
      const parsedPhan = Number(goldPhan.replace(/[^0-9.]/g, '')) || 0;
      const weightChi = parseGoldWeight(parsedChi, parsedPhan);
      const rawPrice =
        Number(goldPriceStr.replace(/[^0-9]/g, '')) ||
        liveGoldInfo?.buyPerChi ||
        FALLBACK_GOLD_PRICE.buyPerChi;
      newBalance = Math.round(weightChi * rawPrice);
      goldDetails = {
        weightChi,
        goldType: icon === 'other:sjc' ? 'SJC' : 'NHAN_9999',
        goldTypeName:
          icon === 'other:sjc'
            ? 'Vàng miếng SJC'
            : selectedWallet.goldDetails?.goldTypeName || 'Vàng nhẫn 9999 (24K)',
        currentPricePerChi: rawPrice,
        lastUpdated: new Date().toISOString()
      };
    } else if (selectedWallet.goldDetails) {
      goldDetails = undefined;
    }

    await db.wallets.update(selectedWallet.id, {
      name: name.trim(),
      type: walletType,
      icon,
      color,
      balance: newBalance,
      isExcludedFromTotal: isExcluded,
      goldDetails,
      updatedAt: new Date().toISOString()
    });
    setWalletNotice({
      message: `Đã cập nhật tài khoản "${name.trim()}"!`,
      type: 'success'
    });
    setTimeout(() => setWalletNotice(null), 3000);
    setViewMode('LIST');
  };

  const handleConfirmAdjustBalance = async () => {
    if (!selectedWallet) return;
    const newBal = Number(balanceStr.replace(/[^0-9-]/g, ''));
    if (isNaN(newBal)) {
      setErrorMsg('Số dư không hợp lệ');
      return;
    }
    try {
      await adjustWalletBalance({
        walletId: selectedWallet.id,
        newBalance: newBal,
        autoCreateAdjustmentTx: autoRecordAdjustTx,
        date: getCurrentDate(),
        time: getCurrentTime()
      });
      setWalletNotice({
        message: `Đã điều chỉnh số dư tài khoản "${selectedWallet.name}"!`,
        type: 'success'
      });
      setTimeout(() => setWalletNotice(null), 3000);
      setViewMode('LIST');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi điều chỉnh số dư');
    }
  };

  const handleDeleteWallet = async (w: Wallet) => {
    if (
      window.confirm(
        `Xác nhận xóa tài khoản "${w.name}"? (Lưu ý: Không thể xóa ví đang chứa giao dịch)`
      )
    ) {
      try {
        await deleteWallet(w.id);
        setWalletNotice({
          message: `Đã xóa tài khoản "${w.name}"!`,
          type: 'success'
        });
        setTimeout(() => setWalletNotice(null), 3000);
      } catch (err: any) {
        setWalletNotice({
          message: err?.message || 'Không thể xóa tài khoản',
          type: 'error'
        });
        setTimeout(() => setWalletNotice(null), 3500);
      }
    }
  };

  const handleSwapWallets = () => {
    if (!selectedWallet || !toWalletId) return;
    const targetWallet = wallets.find((w) => w.id === toWalletId);
    if (targetWallet) {
      const prevFrom = selectedWallet;
      setSelectedWallet(targetWallet);
      setToWalletId(prevFrom.id);
    }
  };

  const handleExecuteTransfer = async () => {
    if (!selectedWallet) return;
    if (!toWalletId || toWalletId === selectedWallet.id) {
      setErrorMsg('Vui lòng chọn ví nhận tiền khác với ví gửi');
      return;
    }
    const amt = Number(balanceStr.replace(/[^0-9]/g, '')) || 0;
    if (amt <= 0) {
      setErrorMsg('Vui lòng nhập số tiền chuyển hợp lệ (> 0đ)');
      return;
    }
    const fee = Number(transferFeeStr.replace(/[^0-9]/g, '')) || 0;

    try {
      const toWallet = wallets.find((w) => w.id === toWalletId);
      await createTransaction({
        type: 'TRANSFER',
        amount: amt,
        transferFee: fee,
        walletId: selectedWallet.id,
        toWalletId: toWalletId,
        date: transferDate || getCurrentDate(),
        time: getCurrentTime(),
        note:
          transferNote.trim() ||
          `Chuyển tiền sang ${toWallet?.name || 'tài khoản khác'}`,
        categoryId: ''
      });
      window.dispatchEvent(new Event('local-data-changed'));
      setWalletNotice({
        message: `Đã chuyển ${formatVND(amt)} sang "${toWallet?.name || 'ví nhận'}" thành công!`,
        type: 'success'
      });
      setTimeout(() => setWalletNotice(null), 3000);
      setViewMode('LIST');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi xảy ra khi thực hiện chuyển tiền');
    }
  };

  // ==========================================
  // MÀN HÌNH PHẲNG CON: THÊM HOẶC SỬA TÀI KHOẢN / VÍ
  // ==========================================
  if (viewMode === 'CREATE' || viewMode === 'EDIT') {
    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4 animate-fade-in">
        {/* Header điều hướng phẳng cân đối */}
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-xs font-extrabold text-slate-100 uppercase tracking-wider text-center flex-1 truncate mx-2">
            {viewMode === 'CREATE' ? 'Thêm tài khoản / ví mới' : 'Chỉnh sửa tài khoản / ví'}
          </span>
          <div className="w-9" />
        </div>

        <div className="bg-slate-900/90 rounded-3xl border border-white/10 p-4 sm:p-5 flex flex-col gap-4 shadow-xl">
          {/* 1. Chọn Logo Ngân hàng / Ví điện tử dạng từng Dropdown dọc (bấm cái nào mở cuộn bên dưới) */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              1. Chọn Logo Ngân hàng / Ví điện tử
            </label>
            <BankBrandAccordionPicker
              selectedBrandId={icon}
              onSelectBrand={(brand) => handleSelectBrandLogo(brand.id)}
            />
          </div>

          {/* 2. Tên Ví & Phân loại (Dropdown chuẩn không dàn ngang) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                2. Tên tài khoản / Ví
              </label>
              <input
                type="text"
                placeholder="VD: Vietcombank, Techcombank, Ví MoMo..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-ios"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                Loại tài khoản
              </label>
              <CustomSelect
                value={walletType}
                onChange={(val) => {
                  const nextType = val as WalletType;
                  setWalletType(nextType);
                  if (nextType === 'INVESTMENT') {
                    if (icon !== 'other:gold_9999' && icon !== 'other:sjc') {
                      setIcon('other:gold_9999');
                      setColor('#F59E0B');
                    }
                    if (!name.trim() || name === 'Vietcombank' || name === 'Tiền mặt') {
                      setName('Vàng nhẫn 9999 (24K)');
                    }
                  }
                }}
                options={[
                  { value: 'BANK', label: '🏦 Tài khoản Ngân hàng' },
                  { value: 'E_WALLET', label: '📱 Ví điện tử (MoMo, ZaloPay...)' },
                  { value: 'CASH', label: '💵 Tiền mặt' },
                  { value: 'CREDIT', label: '💳 Thẻ tín dụng / SPayLater' },
                  { value: 'INVESTMENT', label: '🪙 Két Vàng / Tích lũy (Nhẫn 9999, SJC...)' }
                ]}
                triggerClassName="bg-slate-800 font-medium"
              />
            </div>
          </div>

          {/* 3. Khối định lượng Két Vàng hoặc Số dư khởi tạo */}
          {walletType === 'INVESTMENT' ? (
            <div className="rounded-2xl p-4 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-slate-900 border border-amber-500/30 flex flex-col gap-3.5 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-base">
                    🪙
                  </div>
                  <div>
                    <div className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                      Két vàng tích lũy (Vàng nhẫn 9999 / 24K)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Quản lý theo Chỉ & Phân, tự động định giá theo thị trường mỗi sáng
                    </div>
                  </div>
                </div>
              </div>

              {/* Nút cộng nhanh khối lượng */}
              <div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase mb-1.5">
                  Chọn nhanh số lượng vàng
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '+5 phân (nửa chỉ)', chi: 0, phan: 5 },
                    { label: '+1 chỉ', chi: 1, phan: 0 },
                    { label: '+2 chỉ', chi: 2, phan: 0 },
                    { label: '+5 chỉ', chi: 5, phan: 0 },
                    { label: '+1 cây (10 chỉ)', chi: 10, phan: 0 }
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      onClick={() => {
                        const curChi = Number(goldChi) || 0;
                        const curPhan = Number(goldPhan) || 0;
                        const newTotalPhan = (curChi + btn.chi) * 10 + (curPhan + btn.phan);
                        const c = Math.floor(newTotalPhan / 10);
                        const p = newTotalPhan % 10;
                        setGoldChi(c > 0 ? c.toString() : '');
                        setGoldPhan(p > 0 ? p.toString() : '');
                      }}
                      className="touch-btn px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-bold text-amber-300 transition-colors cursor-pointer"
                    >
                      {btn.label}
                    </button>
                  ))}
                  {(Boolean(goldChi) || Boolean(goldPhan)) && (
                    <button
                      type="button"
                      onClick={() => {
                        setGoldChi('');
                        setGoldPhan('');
                      }}
                      className="touch-btn px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-white/10 text-xs font-medium cursor-pointer"
                    >
                      Đặt lại
                    </button>
                  )}
                </div>
              </div>

              {/* Nhập số Chỉ và số Phân */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase block mb-1">
                    Số lượng Chỉ
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={goldChi}
                      onChange={(e) => setGoldChi(e.target.value.replace(/[^0-9]/g, ''))}
                      className="input-ios text-lg font-black text-amber-300 pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                      chỉ
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase block mb-1">
                    Số lượng Phân (1 chỉ = 10 phân)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={goldPhan}
                      onChange={(e) => setGoldPhan(e.target.value.replace(/[^0-9]/g, ''))}
                      className="input-ios text-lg font-black text-amber-300 pr-14"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                      phân
                    </span>
                  </div>
                </div>
              </div>

              {/* Quy đổi khối lượng thuần Việt */}
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/6 flex items-center justify-between text-xs">
                <span className="text-slate-400">Tổng khối lượng:</span>
                <span className="font-extrabold text-amber-300">
                  {formatGoldWeight(parseGoldWeight(Number(goldChi) || 0, Number(goldPhan) || 0))}
                  {' '}
                  <span className="text-[11px] text-slate-400 font-normal">
                    ({parseGoldWeight(Number(goldChi) || 0, Number(goldPhan) || 0)} chỉ ~{' '}
                    {(parseGoldWeight(Number(goldChi) || 0, Number(goldPhan) || 0) * 3.75).toFixed(2)} gam)
                  </span>
                </span>
              </div>

              {/* Giá thị trường VNĐ / chỉ */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300 uppercase">
                    Giá thu mua thị trường (VNĐ / chỉ)
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsUpdatingGoldPrice(true);
                      try {
                        const latest = await fetchLiveGoldPrice();
                        setLiveGoldInfo(latest);
                        setGoldPriceStr(new Intl.NumberFormat('vi-VN').format(latest.buyPerChi));
                        setWalletNotice({
                          message: `Đã cập nhật giá mới nhất: ${formatVND(latest.buyPerChi)}/chỉ (${latest.source})`,
                          type: 'success'
                        });
                        setTimeout(() => setWalletNotice(null), 3000);
                      } catch {
                        // ignore
                      } finally {
                        setIsUpdatingGoldPrice(false);
                      }
                    }}
                    disabled={isUpdatingGoldPrice}
                    className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                  >
                    <RefreshCw size={12} className={isUpdatingGoldPrice ? 'animate-spin' : ''} />
                    <span>Lấy giá hôm nay</span>
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={goldPriceStr}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setGoldPriceStr(raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '');
                  }}
                  className="input-ios text-base font-bold text-slate-100"
                  placeholder="13.700.000"
                />
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                  <span>
                    Nguồn: {liveGoldInfo?.source || 'vang.today'} ({liveGoldInfo?.updatedDate || 'Hôm nay'})
                  </span>
                  <span className="text-amber-400/80">Giá tiệm mua vào (quy đổi thanh lý)</span>
                </div>
              </div>

              {/* Khối định giá quy đổi VNĐ */}
              <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-amber-300/80 uppercase">
                    Giá trị quy đổi thành tiền mặt
                  </div>
                  <div className="text-xl font-black text-amber-400 mt-0.5">
                    {formatVND(
                      Math.round(
                        parseGoldWeight(Number(goldChi) || 0, Number(goldPhan) || 0) *
                          (Number(goldPriceStr.replace(/[^0-9]/g, '')) ||
                            liveGoldInfo?.buyPerChi ||
                            FALLBACK_GOLD_PRICE.buyPerChi)
                      )
                    )}
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-400 max-w-[130px] leading-tight">
                  Tự động tính vào Tổng tài sản (Net Worth)
                </div>
              </div>
            </div>
          ) : (
            viewMode === 'CREATE' && (
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                  3. Số dư ban đầu (VNĐ)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={balanceStr}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setBalanceStr(raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '');
                  }}
                  className="input-ios font-extrabold text-xl text-emerald-400"
                />
              </div>
            )
          )}

          {/* 4. Màu sắc đại diện (24 màu chuẩn) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase">
                Màu sắc viền / thẻ
              </label>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                <span
                  className="w-2.5 h-2.5 rounded-full border border-white/20 inline-block shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="uppercase">{color}</span>
              </div>
            </div>
            <div className="grid grid-cols-8 gap-2 p-3 rounded-2xl bg-slate-800/60 border border-white/6">
              {WALLET_COLORS.map((c) => {
                const isSelected = color.toLowerCase() === c.toLowerCase();
                const isLight = isLightColor(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`touch-btn w-8 h-8 rounded-full cursor-pointer flex items-center justify-center transition-transform border border-black/15 dark:border-white/10 ${
                      isSelected
                        ? 'ring-2 ring-white scale-110 shadow-lg z-10'
                        : 'opacity-85 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {isSelected && (
                      <Check
                        size={14}
                        strokeWidth={3}
                        className={isLight ? 'text-slate-950' : 'text-white'}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Tùy chọn Không tính vào tổng tài sản */}
          <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-white/6 cursor-pointer">
            <input
              type="checkbox"
              checked={isExcluded}
              onChange={(e) => setIsExcluded(e.target.checked)}
              className="w-4.5 h-4.5 accent-emerald-500"
            />
            <div>
              <div className="text-[13px] font-semibold text-slate-100">
                Không tính vào tổng số dư khả dụng
              </div>
              <div className="text-[11px] text-slate-400">
                Dùng cho Sổ tiết kiệm dài hạn, Quỹ đen hoặc Tài khoản giữ hộ
              </div>
            </div>
          </label>

          {errorMsg && (
            <Toast
              message={errorMsg}
              type="error"
              onClose={() => setErrorMsg('')}
            />
          )}

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className="touch-btn py-3.5 px-5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm border-none cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={viewMode === 'CREATE' ? handleCreateWallet : handleSaveEditWallet}
              className="touch-btn flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-none py-3.5 rounded-2xl text-sm font-black cursor-pointer shadow-lg shadow-emerald-500/25"
            >
              {viewMode === 'CREATE' ? 'Tạo tài khoản / ví ngay' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MÀN HÌNH PHẲNG CON: ĐIỀU CHỈNH SỐ DƯ THỰC TẾ
  // ==========================================
  if (viewMode === 'ADJUST' && selectedWallet) {
    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4 animate-fade-in">
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-xs font-extrabold text-slate-100 uppercase tracking-wider text-center flex-1 truncate mx-2">
            Điều chỉnh số dư thực tế
          </span>
          <div className="w-9" />
        </div>

        <div className="bg-slate-900/90 rounded-3xl border border-white/10 p-5 flex flex-col gap-4 shadow-xl">
          <div className="p-3.5 rounded-2xl bg-slate-800/70 border border-white/6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CategoryIcon
                name={selectedWallet.icon}
                walletName={selectedWallet.name}
                size={24}
                color={selectedWallet.color}
              />
              <div>
                <div className="text-xs text-slate-400">Tài khoản đang chọn</div>
                <div className="text-sm font-bold text-slate-100">{selectedWallet.name}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">Số dư trên sổ</div>
              <div className="text-sm font-bold text-slate-200">
                {formatVND(selectedWallet.balance)}
              </div>
            </div>
          </div>

          {selectedWallet.goldDetails && selectedWallet.goldDetails.weightChi > 0 && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">🪙</span>
                <div className="min-w-0">
                  <div className="font-bold text-amber-300 truncate">
                    Két vàng: {formatGoldWeight(selectedWallet.goldDetails.weightChi)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Giá ghi nhận: ~{formatVND(selectedWallet.goldDetails.currentPricePerChi || liveGoldInfo?.buyPerChi || FALLBACK_GOLD_PRICE.buyPerChi)}/chỉ
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openEditModal(selectedWallet)}
                className="text-amber-400 font-bold hover:underline bg-transparent border-none cursor-pointer p-0 text-[11px] shrink-0 ml-2"
              >
                Sửa số lượng vàng
              </button>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
              Nhập số dư thực tế hiện tại (VNĐ)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={
                balanceStr
                  ? new Intl.NumberFormat('vi-VN').format(
                      Number(balanceStr.replace(/[^0-9]/g, '')) || 0
                    )
                  : ''
              }
              onChange={(e) => setBalanceStr(e.target.value.replace(/[^0-9]/g, ''))}
              className="input-ios text-2xl font-extrabold text-sky-400"
              autoFocus
            />
          </div>

          <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-800/60 border border-white/6 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRecordAdjustTx}
              onChange={(e) => setAutoRecordAdjustTx(e.target.checked)}
              className="w-4.5 h-4.5 accent-sky-400"
            />
            <div>
              <div className="text-[13px] font-semibold text-slate-100">
                Tự động tạo giao dịch Điều chỉnh số dư
              </div>
              <div className="text-[11px] text-slate-400">
                Ghi nhận phần chênh lệch vào lịch sử giao dịch để minh bạch sổ sách
              </div>
            </div>
          </label>

          {errorMsg && (
            <Toast
              message={errorMsg}
              type="error"
              onClose={() => setErrorMsg('')}
            />
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className="touch-btn py-3.5 px-5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm border-none cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirmAdjustBalance}
              className="touch-btn flex-1 bg-sky-500 hover:bg-sky-400 text-slate-950 border-none py-3.5 rounded-2xl text-sm font-black cursor-pointer shadow-lg shadow-sky-500/25"
            >
              Xác nhận khớp số dư
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MÀN HÌNH PHẲNG CON: MUA VÀNG & BÁN VÀNG (REDESIGNED LUXURY FINTECH UI)
  // ==========================================
  if (viewMode === 'GOLD_TRADE') {
    const tradeGoldWallet = wallets.find((w) => w.id === goldTradeTargetWalletId) || goldWallets[0];
    const tradeCashWallet = wallets.find((w) => w.id === goldTradeCashWalletId);
    const currentWeight = tradeGoldWallet?.goldDetails?.weightChi || 0;

    const parsedChi = Number(goldTradeChi.replace(/[^0-9.]/g, '')) || 0;
    const parsedPhan = Number(goldTradePhan.replace(/[^0-9.]/g, '')) || 0;
    const inputWeight = parseGoldWeight(parsedChi, parsedPhan);
    const rawAmt = Number(goldTradeAmountStr.replace(/[^0-9]/g, '')) || 0;
    const unitPrice = Number(goldTradeUnitPriceStr.replace(/[^0-9]/g, '')) || 0;

    const isSellOverLimit = goldTradeAction === 'SELL' && inputWeight > currentWeight + 0.001;
    const newWeightChi =
      goldTradeAction === 'BUY'
        ? currentWeight + inputWeight
        : Math.max(0, currentWeight - inputWeight);

    const liveMarketPrice =
      goldTradeAction === 'BUY'
        ? liveGoldInfo?.sellPerChi || liveGoldInfo?.buyPerChi || FALLBACK_GOLD_PRICE.sellPerChi
        : liveGoldInfo?.buyPerChi || FALLBACK_GOLD_PRICE.buyPerChi;

    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-3.5 animate-fade-in max-w-xl mx-auto w-full">
        {/* 1. Header Điều Hướng Phẳng & Tinh Gọn */}
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Quay lại danh sách ví"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="text-center min-w-0 flex-1 mx-2">
            <h2 className="text-sm font-black text-slate-100 tracking-wide uppercase truncate m-0">
              {goldTradeAction === 'BUY' ? 'Mua Vàng Tích Lũy' : 'Bán Vàng Thu Tiền Mặt'}
            </h2>
            <div className="text-[11px] text-amber-400 font-medium">
              Vàng nhẫn 9999 (24K) • Tự động tính toán
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setIsUpdatingGoldPrice(true);
              try {
                const latest = await fetchLiveGoldPrice();
                setLiveGoldInfo(latest);
                const p =
                  goldTradeAction === 'BUY'
                    ? latest.sellPerChi || latest.buyPerChi
                    : latest.buyPerChi;
                handleGoldTradeUnitPriceChange(new Intl.NumberFormat('vi-VN').format(p));
              } catch {
                // ignore
              } finally {
                setIsUpdatingGoldPrice(false);
              }
            }}
            disabled={isUpdatingGoldPrice}
            title="Tải giá thị trường mới nhất"
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-amber-300 flex items-center justify-center cursor-pointer transition-colors"
          >
            <RefreshCw size={15} className={isUpdatingGoldPrice ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* 2. Segmented Tabs Chuyển Đổi Mua / Bán */}
        <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-900 border border-white/8 shadow-inner gap-1">
          <button
            type="button"
            onClick={() => {
              setGoldTradeAction('BUY');
              setIsEditingCustomPrice(false);
              const p = liveGoldInfo?.sellPerChi || liveGoldInfo?.buyPerChi || FALLBACK_GOLD_PRICE.sellPerChi;
              setGoldTradeUnitPriceStr(new Intl.NumberFormat('vi-VN').format(p));
              if (inputWeight > 0) {
                setGoldTradeAmountStr(new Intl.NumberFormat('vi-VN').format(Math.round(inputWeight * p)));
              }
            }}
            className={`touch-btn py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
              goldTradeAction === 'BUY'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/25'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Coins size={15} />
              <span>MUA THÊM VÀNG</span>
            </div>
            <span className={`text-[10px] font-medium ${goldTradeAction === 'BUY' ? 'text-slate-900/80' : 'text-slate-500'}`}>
              Trích tiền ví → Nhập vàng két
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setGoldTradeAction('SELL');
              setIsEditingCustomPrice(false);
              const p = liveGoldInfo?.buyPerChi || FALLBACK_GOLD_PRICE.buyPerChi;
              setGoldTradeUnitPriceStr(new Intl.NumberFormat('vi-VN').format(p));
              if (inputWeight > 0) {
                setGoldTradeAmountStr(new Intl.NumberFormat('vi-VN').format(Math.round(inputWeight * p)));
              }
            }}
            className={`touch-btn py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
              goldTradeAction === 'SELL'
                ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-md shadow-amber-500/25'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <ArrowDownLeft size={15} />
              <span>BÁN VÀNG THU TIỀN</span>
            </div>
            <span className={`text-[10px] font-medium ${goldTradeAction === 'SELL' ? 'text-slate-900/80' : 'text-slate-500'}`}>
              Bán vàng két → Thu về tiền mặt
            </span>
          </button>
        </div>

        {/* 3. Ticker Đơn Giá Giao Dịch (Gọn gàng, sang trọng, có thể bấm Sửa giá) */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/25 flex flex-col gap-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-lg shrink-0">🪙</span>
              <div className="min-w-0">
                <div className="text-xs text-slate-300 font-semibold truncate">
                  Đơn giá giao dịch:{' '}
                  <span className="text-amber-300 font-black text-sm">{formatVND(unitPrice)}</span> / chỉ
                </div>
                <div className="text-[10px] text-slate-400">
                  ~{formatVND(Math.round(unitPrice / 10))} / phân • {liveGoldInfo?.source || 'vang.today'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsEditingCustomPrice(!isEditingCustomPrice)}
              className="touch-btn px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-amber-300 border border-amber-500/25 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
            >
              <Pencil size={12} />
              <span>{isEditingCustomPrice ? 'Ẩn sửa giá' : 'Đổi đơn giá'}</span>
            </button>
          </div>

          {/* Khung nhập giá tùy chỉnh khi người dùng bấm Đổi đơn giá */}
          {isEditingCustomPrice && (
            <div className="pt-2.5 border-t border-white/6 flex flex-col gap-1.5 animate-fade-in">
              <label className="text-[11px] font-bold text-slate-300 uppercase">
                Nhập đơn giá thực tế bạn giao dịch (VNĐ / chỉ)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={goldTradeUnitPriceStr}
                  onChange={(e) => handleGoldTradeUnitPriceChange(e.target.value)}
                  className="input-ios text-base font-extrabold text-amber-300 flex-1"
                  placeholder="13.700.000"
                />
                <button
                  type="button"
                  onClick={() => {
                    handleGoldTradeUnitPriceChange(new Intl.NumberFormat('vi-VN').format(liveMarketPrice));
                  }}
                  className="touch-btn px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-white/10 shrink-0 cursor-pointer"
                >
                  Giá thị trường
                </button>
              </div>
              <div className="text-[10px] text-slate-400">
                Gợi ý: Nếu tiệm bạn mua/bán có giá khác, hãy gõ giá đó vào đây để tính đúng số tiền.
              </div>
            </div>
          )}
        </div>

        {/* 4. Khối Định Tuyến Ví (Nguồn → Đích rõ ràng) */}
        <div className="p-3.5 rounded-3xl bg-slate-900/90 border border-white/10 flex flex-col gap-2.5 shadow-xl">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {goldTradeAction === 'BUY' ? 'Luồng tiền & Két nhận' : 'Luồng trích vàng & Ví nhận'}
          </div>

          {/* Thẻ 1: Nguồn */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
              {goldTradeAction === 'BUY' ? '1. Trích tiền từ ví / tài khoản:' : '1. Trích vàng từ két:'}
            </label>
            {goldTradeAction === 'BUY' ? (
              <CustomSelect
                value={goldTradeCashWalletId}
                onChange={(val) => setGoldTradeCashWalletId(val)}
                options={sortedWallets
                  .filter((w) => w.id !== goldTradeTargetWalletId)
                  .map((w) => ({
                    value: w.id,
                    label: `${w.name} (Số dư: ${formatVND(w.balance)})`
                  }))}
                triggerClassName="bg-slate-800 font-semibold"
              />
            ) : (
              <div className="p-3 rounded-2xl bg-slate-800/80 border border-amber-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">🪙</span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-100 truncate">
                      {tradeGoldWallet?.name || 'Két vàng nhẫn 9999'}
                    </div>
                    <div className="text-[11px] text-amber-400 font-semibold">
                      Hiện có trong két: {formatGoldWeight(currentWeight)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dấu mũi tên chuyển đổi ở giữa */}
          <div className="flex items-center justify-center -my-1">
            <div className="px-3 py-1 rounded-full bg-slate-800 border border-white/10 text-slate-400 text-xs font-bold flex items-center gap-1 shadow-sm">
              <span className="text-amber-400 font-black">↓</span>
              <span>{goldTradeAction === 'BUY' ? 'Chuyển thành vàng nạp vào' : 'Quy đổi thành tiền lưu vào'}</span>
            </div>
          </div>

          {/* Thẻ 2: Đích */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
              {goldTradeAction === 'BUY' ? '2. Két vàng nhận tích lũy:' : '2. Ví nhận tiền mặt / tài khoản:'}
            </label>
            {goldTradeAction === 'BUY' ? (
              goldWallets.length <= 1 ? (
                <div className="p-3 rounded-2xl bg-slate-800/80 border border-amber-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xl shrink-0">🪙</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-100 truncate">
                        {tradeGoldWallet?.name || 'Két vàng nhẫn 9999'}
                      </div>
                      <div className="text-[11px] text-amber-400 font-semibold">
                        Hiện có trong két: {formatGoldWeight(currentWeight)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <CustomSelect
                  value={goldTradeTargetWalletId}
                  onChange={(val) => setGoldTradeTargetWalletId(val)}
                  options={goldWallets.map((w) => ({
                    value: w.id,
                    label: `${w.name} (Đang có: ${formatGoldWeight(w.goldDetails?.weightChi || 0)})`
                  }))}
                  triggerClassName="bg-slate-800 font-semibold"
                />
              )
            ) : (
              <CustomSelect
                value={goldTradeCashWalletId}
                onChange={(val) => setGoldTradeCashWalletId(val)}
                options={sortedWallets
                  .filter((w) => w.id !== goldTradeTargetWalletId)
                  .map((w) => ({
                    value: w.id,
                    label: `${w.name} (Số dư: ${formatVND(w.balance)})`
                  }))}
                triggerClassName="bg-slate-800 font-semibold"
              />
            )}
          </div>
        </div>

        {/* 5. Bộ Quy Đổi Vàng ↔ Tiền (Hero Conversion Box) */}
        <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-white/10 flex flex-col gap-4 shadow-xl">
          {/* Nhập khối lượng vàng */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase">
                Khối lượng vàng ({goldTradeAction === 'BUY' ? 'Mua thêm' : 'Bán ra'})
              </label>
              <span className="text-xs font-extrabold text-amber-300">
                = {formatGoldWeight(inputWeight)}
                <span className="text-[10px] font-normal text-slate-400 ml-1">
                  (~{(inputWeight * 3.75).toFixed(2)} gam)
                </span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={goldTradeChi}
                  onChange={(e) =>
                    handleGoldTradeWeightChange(e.target.value.replace(/[^0-9]/g, ''), goldTradePhan)
                  }
                  className="input-ios font-black text-lg text-amber-300 pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                  chỉ
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={goldTradePhan}
                  onChange={(e) =>
                    handleGoldTradeWeightChange(goldTradeChi, e.target.value.replace(/[^0-9]/g, ''))
                  }
                  className="input-ios font-black text-lg text-amber-300 pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                  phân
                </span>
              </div>
            </div>

            {/* Quick chips chọn nhanh */}
            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              {goldTradeAction === 'BUY' ? (
                [
                  { label: '+5 phân', chi: 0, phan: 5 },
                  { label: '+1 chỉ', chi: 1, phan: 0 },
                  { label: '+2 chỉ', chi: 2, phan: 0 },
                  { label: '+5 chỉ', chi: 5, phan: 0 },
                  { label: '+1 lượng', chi: 10, phan: 0 }
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={() => {
                      const curC = Number(goldTradeChi) || 0;
                      const curP = Number(goldTradePhan) || 0;
                      const totalP = (curC + btn.chi) * 10 + (curP + btn.phan);
                      const c = Math.floor(totalP / 10);
                      const p = totalP % 10;
                      handleGoldTradeWeightChange(c > 0 ? c.toString() : '', p > 0 ? p.toString() : '');
                    }}
                    className="touch-btn px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-bold text-amber-300 cursor-pointer transition-colors active:scale-95"
                  >
                    {btn.label}
                  </button>
                ))
              ) : (
                [
                  { label: '5 phân', chi: 0, phan: 5 },
                  { label: '1 chỉ', chi: 1, phan: 0 },
                  { label: '2 chỉ', chi: 2, phan: 0 },
                  {
                    label: `Bán hết (${formatGoldWeight(currentWeight)})`,
                    chi: Math.floor(currentWeight),
                    phan: Math.round((currentWeight - Math.floor(currentWeight)) * 10)
                  }
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={() => {
                      handleGoldTradeWeightChange(
                        btn.chi > 0 ? btn.chi.toString() : '',
                        btn.phan > 0 ? btn.phan.toString() : ''
                      );
                    }}
                    className="touch-btn px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-bold text-amber-300 cursor-pointer transition-colors active:scale-95"
                  >
                    {btn.label}
                  </button>
                ))
              )}
              {(Boolean(goldTradeChi) || Boolean(goldTradePhan) || Boolean(goldTradeAmountStr)) && (
                <button
                  type="button"
                  onClick={() => {
                    setGoldTradeChi('');
                    setGoldTradePhan('');
                    setGoldTradeAmountStr('');
                  }}
                  className="touch-btn px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-white/10 text-xs font-medium cursor-pointer"
                >
                  Xóa
                </button>
              )}
            </div>
          </div>

          {/* Dải phân cách quy đổi */}
          <div className="relative flex items-center justify-center my-0.5">
            <div className="w-full border-t border-white/8" />
            <span className="absolute bg-slate-900 px-3 text-[11px] font-semibold text-slate-400">
              ↕ Quy đổi tương đương theo đơn giá
            </span>
          </div>

          {/* Nhập số tiền VNĐ */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase">
                {goldTradeAction === 'BUY' ? 'Số tiền thanh toán (VNĐ)' : 'Số tiền thu về (VNĐ)'}
              </label>
              <span className="text-[11px] text-slate-400">VNĐ</span>
            </div>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={goldTradeAmountStr}
                onChange={(e) => handleGoldTradeAmountChange(e.target.value)}
                className={`input-ios text-2xl font-black ${
                  goldTradeAction === 'BUY' ? 'text-rose-400' : 'text-emerald-400'
                }`}
              />
            </div>
            <span className="text-[11px] text-slate-400 block mt-1">
              Bạn có thể tự gõ số tiền để ứng dụng tự tính ra số chỉ và phân tương ứng.
            </span>
          </div>

          {/* Cảnh báo nếu bán vượt quá số vàng trong két */}
          {isSellOverLimit && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 animate-fade-in">
              ⚠️ Số lượng bán ({formatGoldWeight(inputWeight)}) vượt quá số vàng hiện có trong két ({formatGoldWeight(currentWeight)}).
            </div>
          )}
        </div>

        {/* 6. Ngày Giao Dịch & Ghi Chú */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">
              Ngày giao dịch
            </label>
            <DatePicker
              value={goldTradeDate}
              onChange={setGoldTradeDate}
              label="Ngày giao dịch"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">
              Ghi chú tiệm vàng / hóa đơn
            </label>
            <input
              type="text"
              placeholder={`VD: ${goldTradeAction === 'BUY' ? 'Mua nhẫn tròn trơn tiệm Mi Hồng' : 'Bán lấy tiền chi tiêu'}`}
              value={goldTradeNote}
              onChange={(e) => setGoldTradeNote(e.target.value)}
              className="input-ios text-sm"
            />
          </div>
        </div>

        {/* 7. Xem Trước Biến Động Tài Sản (Luxury Receipt Summary) */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-white/10 flex flex-col gap-2 shadow-lg">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-white/6">
            <span>Tóm tắt biến động tài sản</span>
            <span className="text-amber-400 font-extrabold flex items-center gap-1">
              <ShieldCheck size={13} /> Chuyển đổi tài sản
            </span>
          </div>

          <div className="flex items-center justify-between text-xs py-1 border-b border-white/6">
            <span className="text-slate-300">
              {goldTradeAction === 'BUY' ? 'Ví thanh toán:' : 'Ví nhận tiền:'}
            </span>
            <span className={`font-black ${goldTradeAction === 'BUY' ? 'text-rose-400' : 'text-emerald-400'}`}>
              {tradeCashWallet?.name || 'Ví'}: {goldTradeAction === 'BUY' ? '-' : '+'}{formatVND(rawAmt)}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs py-1 border-b border-white/6">
            <span className="text-slate-300">Két vàng tích lũy:</span>
            <span className="font-extrabold text-amber-300">
              {goldTradeAction === 'BUY' ? '+' : '-'}{formatGoldWeight(inputWeight)}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs py-1">
            <span className="text-slate-400">Số vàng sau giao dịch:</span>
            <span className="font-black text-white">
              {formatGoldWeight(newWeightChi)}
            </span>
          </div>

          <div className="text-[10px] text-slate-400 pt-1 border-t border-white/6">
            ✨ Giao dịch dạng hoán đổi tài sản (TRANSFER) • Không tính vào ngân sách chi tiêu sinh hoạt tháng.
          </div>
        </div>

        {errorMsg && (
          <Toast
            message={errorMsg}
            type="error"
            onClose={() => setErrorMsg('')}
          />
        )}

        {/* 8. Nút Hành Động Xác Nhận */}
        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className="touch-btn py-3.5 px-5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm border-none cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleExecuteGoldTrade}
            disabled={isSellOverLimit || rawAmt <= 0 || inputWeight <= 0}
            className={`touch-btn flex-1 border-none py-3.5 rounded-2xl text-sm font-black cursor-pointer shadow-lg flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-98 ${
              goldTradeAction === 'BUY'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-emerald-500/25'
                : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-amber-500/25'
            }`}
          >
            {goldTradeAction === 'BUY' ? (
              <>
                <Coins size={17} />
                <span>Xác nhận Mua {formatGoldWeight(inputWeight)} Vàng</span>
              </>
            ) : (
              <>
                <ArrowDownLeft size={17} />
                <span>Xác nhận Bán {formatGoldWeight(inputWeight)} Vàng</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // MÀN HÌNH PHẲNG CON: CHUYỂN TIỀN GIỮA CÁC VÍ
  // ==========================================
  if (viewMode === 'TRANSFER' && selectedWallet) {
    const currentAmt = Number(balanceStr.replace(/[^0-9]/g, '')) || 0;
    const currentFee = Number(transferFeeStr.replace(/[^0-9]/g, '')) || 0;
    const targetWallet = wallets.find((w) => w.id === toWalletId);

    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4 animate-fade-in">
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-xs font-extrabold text-slate-100 uppercase tracking-wider text-center flex-1 truncate mx-2">
            Chuyển tiền giữa các ví
          </span>
          <div className="w-9" />
        </div>

        <div className="bg-slate-900/90 rounded-3xl border border-white/10 p-5 flex flex-col gap-4 shadow-xl">
          {/* Khung chuyển từ ví này sang ví kia */}
          <div className="flex flex-col gap-2">
            {/* Ví chuyển (Từ) */}
            <div className="p-3.5 rounded-2xl bg-slate-800/70 border border-white/6 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <CategoryIcon
                  name={selectedWallet.icon}
                  walletName={selectedWallet.name}
                  size={24}
                  color={selectedWallet.color}
                />
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Chuyển từ tài khoản
                  </span>
                  <span className="text-sm font-bold text-slate-100 truncate block">
                    {selectedWallet.name}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[11px] text-slate-400 block">Số dư hiện tại</span>
                <span className="text-xs font-bold text-emerald-400">
                  {formatVND(selectedWallet.balance)}
                </span>
              </div>
            </div>

            {/* Nút Hoán đổi 2 ví */}
            <div className="flex justify-center -my-2.5 relative z-10">
              <button
                type="button"
                onClick={handleSwapWallets}
                title="Đảo chiều ví chuyển"
                className="touch-btn w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 border border-white/15 text-sky-400 flex items-center justify-center shadow-lg transition-transform active:scale-90 cursor-pointer"
              >
                <ArrowUpDown size={16} />
              </button>
            </div>

            {/* Ví nhận (Đến) */}
            <div>
              <WalletSelect
                wallets={wallets}
                selectedWalletId={toWalletId}
                onSelect={setToWalletId}
                excludeWalletId={selectedWallet.id}
                label="Đến tài khoản nhận"
              />
            </div>
          </div>

          {/* Số tiền chuyển */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase">
                Số tiền chuyển (VNĐ)
              </label>
              {selectedWallet.balance > 0 && (
                <button
                  type="button"
                  onClick={() => setBalanceStr(selectedWallet.balance.toString())}
                  className="text-xs font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
                >
                  Chuyển tất cả ({formatVND(selectedWallet.balance)})
                </button>
              )}
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={
                balanceStr
                  ? new Intl.NumberFormat('vi-VN').format(
                      Number(balanceStr.replace(/[^0-9]/g, '')) || 0
                    )
                  : ''
              }
              onChange={(e) => setBalanceStr(e.target.value.replace(/[^0-9]/g, ''))}
              className="input-ios text-2xl font-extrabold text-sky-400"
            />

            {/* Quick Amount Chips */}
            <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-none">
              {[50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    const curr = Number(balanceStr.replace(/[^0-9]/g, '')) || 0;
                    setBalanceStr((curr + amt).toString());
                  }}
                  className="px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-white/6 text-xs font-semibold text-slate-300 hover:text-white shrink-0 cursor-pointer"
                >
                  +{formatVND(amt)}
                </button>
              ))}
            </div>
          </div>

          {/* Phí chuyển khoản */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase">
                Phí chuyển khoản (nếu có)
              </label>
              <span className="text-[11px] text-slate-400">
                Tổng trừ ví gửi: <strong className="text-rose-400">{formatVND(currentAmt + currentFee)}</strong>
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              {[
                { label: 'Miễn phí (0đ)', value: 0 },
                { label: '1.100 đ', value: 1100 },
                { label: '3.300 đ', value: 3300 },
                { label: '5.500 đ', value: 5500 }
              ].map((fee) => (
                <button
                  key={fee.value}
                  type="button"
                  onClick={() => setTransferFeeStr(fee.value.toString())}
                  className={`touch-btn py-2 px-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    currentFee === fee.value
                      ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                      : 'bg-slate-800/80 border-white/6 text-slate-300 hover:text-white'
                  }`}
                >
                  {fee.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Phí tùy chỉnh..."
              value={
                transferFeeStr && transferFeeStr !== '0'
                  ? new Intl.NumberFormat('vi-VN').format(
                      Number(transferFeeStr.replace(/[^0-9]/g, '')) || 0
                    )
                  : ''
              }
              onChange={(e) => setTransferFeeStr(e.target.value.replace(/[^0-9]/g, ''))}
              className="input-ios text-sm font-semibold"
            />
          </div>

          {/* Ngày chuyển & Ghi chú */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                Ngày chuyển
              </label>
              <DatePicker
                value={transferDate}
                onChange={setTransferDate}
                label="Ngày chuyển"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                Ghi chú
              </label>
              <input
                type="text"
                placeholder={`VD: Chuyển tiền sang ${targetWallet?.name || 'ví khác'}...`}
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                className="input-ios"
              />
            </div>
          </div>

          {errorMsg && (
            <Toast
              message={errorMsg}
              type="error"
              onClose={() => setErrorMsg('')}
            />
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className="touch-btn py-3.5 px-5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm border-none cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleExecuteTransfer}
              className="touch-btn flex-1 bg-sky-500 hover:bg-sky-400 text-slate-950 border-none py-3.5 rounded-2xl text-sm font-black cursor-pointer shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2"
            >
              <ArrowRightLeft size={16} />
              <span>Xác nhận chuyển tiền</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MÀN HÌNH PHẲNG CHÍNH: DANH SÁCH VÍ & NGÂN HÀNG
  // ==========================================
  return (
    <div className="pb-28">
      {walletNotice && (
        <Toast
          message={walletNotice.message}
          type={walletNotice.type}
          onClose={() => setWalletNotice(null)}
        />
      )}

      {/* 1. Thẻ Tổng tài sản */}
      <div className="mx-4 my-3 rounded-3xl p-5 bg-gradient-to-br from-emerald-500/15 to-slate-900/95 border border-emerald-500/30 shadow-xl backdrop-blur-md">
        <div className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
          Tổng tài sản tính vào báo cáo
        </div>
        <div className="font-heading text-3xl font-extrabold text-emerald-400 mt-1.5">
          {formatVND(totalIncludedBalance)}
        </div>

        {totalExcludedBalance > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-white/8 text-xs text-slate-400 flex items-center gap-1.5">
            <EyeOff size={14} />
            <span>
              Tài sản riêng / Tiết kiệm ẩn:{' '}
              <strong className="text-slate-200">{formatVND(totalExcludedBalance)}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Banner Thị trường Vàng nhẫn 9999 (nếu người dùng có tạo ví Vàng) */}
      {liveGoldInfo && wallets.some((w) => Boolean(w.goldDetails)) && (
        <div className="mx-4 my-2.5 p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/[0.12] via-slate-900 to-slate-900 border border-amber-500/25 shadow-lg relative overflow-hidden animate-fade-in">
          {/* Ambient gold glow in top right */}
          <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* Dòng 1: Tiêu đề, nhãn trực tiếp & Nút làm mới */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-amber-400/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-400/30">
                <Coins size={13} />
              </div>
              <span className="text-xs font-black tracking-wide text-amber-200 uppercase truncate">
                Giá Vàng Nhẫn 9999 (24K)
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Trực tiếp
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-slate-400 hidden sm:inline">{liveGoldInfo.source}</span>
              <button
                type="button"
                onClick={handleRefreshAllGoldWallets}
                disabled={isUpdatingGoldPrice}
                title="Cập nhật giá vàng mới nhất"
                className="touch-btn p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-amber-300 border border-amber-500/25 cursor-pointer flex items-center transition-colors"
              >
                <RefreshCw size={12} className={isUpdatingGoldPrice ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Dòng 2: Giá vàng nổi bật & Nút mở giao dịch */}
          <div className="flex items-end justify-between gap-3 pt-1 border-t border-white/6">
            <div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-xl sm:text-2xl font-black text-white tracking-tight font-heading">
                  {formatVND(liveGoldInfo.buyPerChi)}
                </span>
                <span className="text-xs font-semibold text-amber-300/80">/ 1 chỉ</span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                <span>~{formatVND(Math.round(liveGoldInfo.buyPerChi / 10))} / 1 phân</span>
                <span>•</span>
                <span>Cập nhật: {liveGoldInfo.updatedDate}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const firstGold = wallets.find((w) => Boolean(w.goldDetails));
                if (firstGold) openGoldTradeModal(firstGold, 'BUY');
              }}
              className="touch-btn px-3 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/20 shrink-0 transition-transform active:scale-95"
            >
              <Coins size={14} />
              <span>Giao Dịch</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. Header Danh sách, Nút Sắp Xếp & Nút Thêm Ví */}
      <div className="flex justify-between items-center mx-4 mt-4 mb-2.5 px-1">
        <div className="flex items-center gap-2">
          {isReordering ? (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-sm font-bold text-emerald-400 m-0">
                Sắp xếp ví ({sortedWallets.length})
              </h3>
            </div>
          ) : (
            <h3 className="text-sm font-bold text-slate-200 m-0">
              DS Tài khoản ({sortedWallets.length})
            </h3>
          )}
        </div>

        <div className="flex items-center gap-2">
          {sortedWallets.length > 1 && (
            <button
              type="button"
              onClick={() => setIsReordering(!isReordering)}
              className={`touch-btn py-2 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                isReordering
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10'
              }`}
              title={isReordering ? 'Hoàn tất sắp xếp' : 'Thay đổi vị trí các ví'}
            >
              {isReordering ? (
                <>
                  <Check size={14} strokeWidth={3} />
                  <span>Xong</span>
                </>
              ) : (
                <>
                  <ArrowUpDown size={14} className="text-emerald-400" />
                  <span>Sắp xếp</span>
                </>
              )}
            </button>
          )}

          {!isReordering && (
            <button
              type="button"
              onClick={openCreateModal}
              className="touch-btn bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-none py-2 px-3.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Thêm Ví</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner hướng dẫn khi đang ở chế độ Sắp xếp */}
      {isReordering && (
        <div className="mx-4 mb-3 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <GripVertical size={16} className="text-emerald-400 shrink-0" />
            <span>
              Bấm <strong className="text-white">↑ Lên</strong> / <strong className="text-white">↓ Xuống</strong> hoặc nút <strong className="text-white">⇈ Lên đầu</strong> để gom ví hay dùng lên trước.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsReordering(false)}
            className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-lg text-[11px] cursor-pointer border-none shrink-0"
          >
            Lưu
          </button>
        </div>
      )}

      {/* 3. Danh sách các Ví kèm Logo Ngân hàng / Ví điện tử chính thức */}
      <div className="flex flex-col gap-3 px-4">
        {sortedWallets.map((w, index) => {
          const detectedBrand = detectBankBrand(w.icon, w.name);
          return (
            <div
              key={w.id}
              draggable={isReordering}
              onDragStart={(e) => {
                if (!isReordering) return;
                e.dataTransfer.setData('text/plain', w.id);
                setDraggedWalletId(w.id);
              }}
              onDragOver={(e) => {
                if (!isReordering) return;
                e.preventDefault();
              }}
              onDrop={async (e) => {
                if (!isReordering) return;
                e.preventDefault();
                const sourceId = e.dataTransfer.getData('text/plain') || draggedWalletId;
                if (!sourceId || sourceId === w.id) return;
                const currentIds = sortedWallets.map((x) => x.id);
                const fromIdx = currentIds.indexOf(sourceId);
                const toIdx = currentIds.indexOf(w.id);
                if (fromIdx !== -1 && toIdx !== -1) {
                  currentIds.splice(fromIdx, 1);
                  currentIds.splice(toIdx, 0, sourceId);
                  await reorderWallets(currentIds);
                }
                setDraggedWalletId(null);
              }}
              onDragEnd={() => setDraggedWalletId(null)}
              className={`rounded-2xl p-4 transition-all ${
                isReordering
                  ? draggedWalletId === w.id
                    ? 'border-emerald-400/60 bg-emerald-500/10 scale-[0.98]'
                    : 'border-white/12 hover:border-emerald-500/40 cursor-grab active:cursor-grabbing bg-slate-900/80'
                  : Boolean(w.goldDetails)
                  ? 'border-amber-500/25 bg-gradient-to-br from-amber-500/[0.07] via-slate-900/90 to-slate-900/90 shadow-md shadow-amber-500/5 hover:border-amber-500/40'
                  : 'border-white/8 bg-slate-900/80 shadow-sm hover:border-white/15'
              } border`}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Số thứ tự & Tay nắm kéo khi ở chế độ sắp xếp */}
                  {isReordering && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <GripVertical size={16} className="text-slate-500 shrink-0" />
                      <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-lg border border-emerald-500/25">
                        #{index + 1}
                      </span>
                    </div>
                  )}

                  {detectedBrand ? (
                    <BankLogo brand={detectedBrand} size={44} />
                  ) : (
                    <div
                      className="cat-badge shrink-0"
                      style={{ backgroundColor: `${w.color}22`, color: w.color }}
                    >
                      <CategoryIcon
                        name={w.icon}
                        walletName={w.name}
                        size={22}
                        color={w.color}
                      />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[15px] font-bold text-slate-100 truncate">
                        {w.name}
                      </span>
                      {w.goldDetails && w.goldDetails.weightChi > 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex items-center gap-1">
                          🪙 {formatGoldWeight(w.goldDetails.weightChi)}
                        </span>
                      ) : detectedBrand ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-slate-300 font-semibold">
                          {detectedBrand.category === 'BANK'
                            ? 'Ngân hàng'
                            : detectedBrand.category === 'EWALLET'
                            ? 'Ví điện tử'
                            : detectedBrand.category === 'CARD'
                            ? 'Thẻ quốc tế'
                            : 'Tiền mặt / Vàng'}
                        </span>
                      ) : null}
                      {w.isExcludedFromTotal && (
                        <span className="text-[10px] py-0.5 px-1.5 rounded-md bg-white/8 text-slate-400 flex items-center gap-1 shrink-0">
                          <EyeOff size={10} /> Ẩn tổng
                        </span>
                      )}
                    </div>
                    <div className="font-heading text-lg font-extrabold text-slate-100 mt-0.5 flex items-baseline gap-2 flex-wrap">
                      <span>{formatVND(w.balance)}</span>
                      {w.goldDetails && w.goldDetails.weightChi > 0 && (
                        <span className="text-[11px] font-normal text-amber-400/90 font-mono">
                          (~{formatVND(w.goldDetails.currentPricePerChi || liveGoldInfo?.buyPerChi || FALLBACK_GOLD_PRICE.buyPerChi)}/chỉ)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Các nút hành động: Khi đang sắp xếp vs Khi ở chế độ thường */}
                {isReordering ? (
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {/* Nút Đưa lên đầu */}
                    <button
                      type="button"
                      onClick={() => void moveWalletPosition(w.id, 'TOP')}
                      disabled={index === 0}
                      title="Đưa lên đầu tiên"
                      className="touch-btn w-9 h-9 rounded-[10px] bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-emerald-400 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <ChevronsUp size={16} />
                    </button>
                    {/* Nút Lên 1 nấc */}
                    <button
                      type="button"
                      onClick={() => void moveWalletPosition(w.id, 'UP')}
                      disabled={index === 0}
                      title="Di chuyển lên trên"
                      className="touch-btn w-9 h-9 rounded-[10px] bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <ChevronUp size={16} />
                    </button>
                    {/* Nút Xuống 1 nấc */}
                    <button
                      type="button"
                      onClick={() => void moveWalletPosition(w.id, 'DOWN')}
                      disabled={index === sortedWallets.length - 1}
                      title="Di chuyển xuống dưới"
                      className="touch-btn w-9 h-9 rounded-[10px] bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="relative shrink-0 ml-2">
                    {/* Nút 3 chấm mở Tùy chọn ví */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuWallet(activeMenuWallet?.id === w.id ? null : w);
                      }}
                      title="Tùy chọn ví"
                      className={`touch-btn w-9 h-9 rounded-[10px] border flex items-center justify-center cursor-pointer transition-colors ${
                        activeMenuWallet?.id === w.id
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-sm'
                          : 'bg-slate-800/90 border-white/8 text-slate-300 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      <MoreVertical size={18} />
                    </button>

                    {/* Menu Popover trên Desktop (>= md) */}
                    {activeMenuWallet?.id === w.id && (
                      <>
                        <div
                          className="hidden md:block fixed inset-0 z-30"
                          onClick={() => setActiveMenuWallet(null)}
                        />
                        <div className="hidden md:block absolute right-0 top-full mt-1.5 w-60 bg-slate-900 border border-white/12 rounded-2xl shadow-2xl p-1.5 z-40 backdrop-blur-xl animate-fade-in divide-y divide-white/6">
                          <div className="py-1 flex flex-col gap-0.5">
                            {/* 1. Chuyển khoản */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuWallet(null);
                                openTransferModal(w);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/8 hover:text-white transition-colors cursor-pointer text-left"
                            >
                              <div className="w-6 h-6 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                                <ArrowRightLeft size={13} />
                              </div>
                              <span>Chuyển khoản (Chuyển ví)</span>
                            </button>

                            {/* 2. Điều chỉnh số dư */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuWallet(null);
                                openAdjustModal(w);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/8 hover:text-white transition-colors cursor-pointer text-left"
                            >
                              <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                                <SlidersHorizontal size={13} />
                              </div>
                              <span>Điều chỉnh số dư</span>
                            </button>

                            {/* 3. Chỉnh sửa */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuWallet(null);
                                openEditModal(w);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/8 hover:text-white transition-colors cursor-pointer text-left"
                            >
                              <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                                <Edit3 size={13} />
                              </div>
                              <span>Chỉnh sửa tài khoản</span>
                            </button>

                            {/* Mua / Bán vàng nếu là két vàng */}
                            {w.goldDetails && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuWallet(null);
                                    openGoldTradeModal(w, 'BUY');
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 transition-colors cursor-pointer text-left"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                                    <Coins size={13} />
                                  </div>
                                  <span>Mua thêm vàng</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuWallet(null);
                                    openGoldTradeModal(w, 'SELL');
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer text-left"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                                    <ArrowDownLeft size={13} />
                                  </div>
                                  <span>Bán vàng lấy tiền</span>
                                </button>
                              </>
                            )}

                            {/* Cập nhật giá vàng nếu là két vàng */}
                            {w.goldDetails && (
                              <button
                                type="button"
                                onClick={async () => {
                                  setActiveMenuWallet(null);
                                  await handleRefreshSingleGoldWallet(w);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer text-left"
                              >
                                <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                                  <RefreshCw size={13} className={isUpdatingGoldPrice ? 'animate-spin' : ''} />
                                </div>
                                <span>Cập nhật giá vàng mới</span>
                              </button>
                            )}
                          </div>

                          {/* 4. Xóa (nếu còn > 1 ví) */}
                          {sortedWallets.length > 1 && (
                            <div className="pt-1 mt-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuWallet(null);
                                  handleDeleteWallet(w);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/15 hover:text-rose-300 transition-colors cursor-pointer text-left"
                              >
                                <div className="w-6 h-6 rounded-lg bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                                  <Trash2 size={13} />
                                </div>
                                <span>Xóa tài khoản</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Thanh tác vụ Mua / Bán vàng chạy ngang toàn bộ chân thẻ két vàng */}
              {w.goldDetails && !isReordering && (
                <div className="mt-3 pt-2.5 border-t border-amber-500/15 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openGoldTradeModal(w, 'BUY');
                    }}
                    className="touch-btn py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 active:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-98 shadow-sm"
                  >
                    <Coins size={14} className="text-emerald-400" />
                    <span>Mua thêm vàng</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openGoldTradeModal(w, 'SELL');
                    }}
                    className="touch-btn py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 active:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-98 shadow-sm"
                  >
                    <ArrowDownLeft size={14} className="text-amber-400" />
                    <span>Bán vàng lấy tiền</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Gợi ý mẹo sử dụng */}
      <div className="mx-4 mt-4 p-3.5 rounded-2xl bg-sky-400/8 border border-sky-400/20 flex gap-2.5 items-start">
        <ShieldAlert size={18} className="text-sky-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 leading-relaxed">
          <strong className="text-slate-200">Mẹo sắp xếp:</strong> Bạn có thể bấm nút{' '}
          <strong className="text-emerald-400">Sắp xếp</strong> ở góc phải để đưa các ví thường xuyên giao dịch (như Tiền mặt, Grab, MoMo) lên đầu trang, giúp việc chọn ví khi ghi chép nhanh hơn.
        </div>
      </div>

      {/* 3. Popup Bottom Sheet Tác vụ Ví trên Mobile (< md) */}
      {activeMenuWallet && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop tối mờ phía sau */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setActiveMenuWallet(null)}
          />

          {/* Khung nội dung popup trồi từ dưới lên */}
          <div className="relative bg-slate-900 border-t border-white/12 rounded-t-3xl p-5 pb-8 shadow-2xl animate-slide-up flex flex-col gap-3 max-w-lg mx-auto w-full safe-nav-bottom">
            {/* Thanh kéo nhỏ ở đỉnh */}
            <div className="w-10 h-1 bg-white/25 rounded-full mx-auto mb-1" />

            {/* Thông tin ví đang chọn */}
            <div className="flex items-center justify-between pb-3 border-b border-white/8">
              <div className="flex items-center gap-3 min-w-0">
                <CategoryIcon
                  name={activeMenuWallet.icon}
                  walletName={activeMenuWallet.name}
                  size={26}
                  color={activeMenuWallet.color}
                />
                <div className="min-w-0">
                  <div className="text-base font-extrabold text-slate-100 truncate">
                    {activeMenuWallet.name}
                  </div>
                  <div className="text-xs text-slate-400 font-medium">
                    Số dư:{' '}
                    <span className="text-emerald-400 font-bold">
                      {formatVND(activeMenuWallet.balance)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveMenuWallet(null)}
                className="touch-btn w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer border border-white/6"
                title="Đóng"
              >
                <X size={16} />
              </button>
            </div>

            {/* Danh sách các chức năng */}
            <div className="flex flex-col gap-2 pt-1">
              {/* 1. Chuyển khoản */}
              <button
                type="button"
                onClick={() => {
                  const target = activeMenuWallet;
                  setActiveMenuWallet(null);
                  openTransferModal(target);
                }}
                className="touch-btn w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-white/6 flex items-center justify-between text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-400 flex items-center justify-center shrink-0">
                    <ArrowRightLeft size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-100">Chuyển khoản (Chuyển ví)</div>
                    <div className="text-xs text-slate-400">
                      Chuyển tiền sang ví hoặc tài khoản khác
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-500 shrink-0 ml-2" />
              </button>

              {/* 2. Điều chỉnh số dư */}
              <button
                type="button"
                onClick={() => {
                  const target = activeMenuWallet;
                  setActiveMenuWallet(null);
                  openAdjustModal(target);
                }}
                className="touch-btn w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-white/6 flex items-center justify-between text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 flex items-center justify-center shrink-0">
                    <SlidersHorizontal size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-100">Điều chỉnh số dư</div>
                    <div className="text-xs text-slate-400">Cân đối lại số dư cho khớp với thực tế</div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-500 shrink-0 ml-2" />
              </button>

              {/* 3. Chỉnh sửa */}
              <button
                type="button"
                onClick={() => {
                  const target = activeMenuWallet;
                  setActiveMenuWallet(null);
                  openEditModal(target);
                }}
                className="touch-btn w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-white/6 flex items-center justify-between text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 flex items-center justify-center shrink-0">
                    <Edit3 size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-100">Chỉnh sửa tài khoản</div>
                    <div className="text-xs text-slate-400">
                      Đổi tên, loại ví, màu sắc & logo ngân hàng
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-500 shrink-0 ml-2" />
              </button>

              {/* Mua / Bán vàng nếu là két vàng */}
              {activeMenuWallet.goldDetails && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const target = activeMenuWallet;
                      setActiveMenuWallet(null);
                      openGoldTradeModal(target, 'BUY');
                    }}
                    className="touch-btn w-full p-3.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-between text-left cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                        <Coins size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-emerald-300">Mua thêm vàng</div>
                        <div className="text-xs text-emerald-400/80">
                          Trích tiền mặt/ngân hàng mua vàng nhập két
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-emerald-500/60 shrink-0 ml-2" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const target = activeMenuWallet;
                      setActiveMenuWallet(null);
                      openGoldTradeModal(target, 'SELL');
                    }}
                    className="touch-btn w-full p-3.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 flex items-center justify-between text-left cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                        <ArrowDownLeft size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-amber-300">Bán vàng lấy tiền mặt</div>
                        <div className="text-xs text-amber-400/80">
                          Bán vàng quy đổi thành tiền lưu vào ví
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-amber-500/60 shrink-0 ml-2" />
                  </button>
                </>
              )}

              {/* Cập nhật giá vàng nếu là két vàng */}
              {activeMenuWallet.goldDetails && (
                <button
                  type="button"
                  onClick={async () => {
                    const target = activeMenuWallet;
                    setActiveMenuWallet(null);
                    await handleRefreshSingleGoldWallet(target);
                  }}
                  className="touch-btn w-full p-3.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 flex items-center justify-between text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                      <RefreshCw size={18} className={isUpdatingGoldPrice ? 'animate-spin' : ''} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-amber-300">Cập nhật giá vàng mới nhất</div>
                      <div className="text-xs text-amber-400/80">
                        Lấy giá thu mua nhẫn 9999 hôm nay từ thị trường
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-amber-500/60 shrink-0 ml-2" />
                </button>
              )}

              {/* 4. Xóa (chỉ khi có nhiều hơn 1 ví) */}
              {sortedWallets.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const target = activeMenuWallet;
                    setActiveMenuWallet(null);
                    handleDeleteWallet(target);
                  }}
                  className="touch-btn w-full p-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 flex items-center justify-between text-left cursor-pointer transition-colors mt-0.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                      <Trash2 size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-rose-300">Xóa tài khoản này</div>
                      <div className="text-xs text-rose-400/80">Chỉ xóa được khi chưa có giao dịch</div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-rose-500/60 shrink-0 ml-2" />
                </button>
              )}
            </div>

            {/* Nút Đóng */}
            <button
              type="button"
              onClick={() => setActiveMenuWallet(null)}
              className="touch-btn w-full py-3.5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm mt-1 hover:bg-slate-700 cursor-pointer border border-white/6"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletsTab;
