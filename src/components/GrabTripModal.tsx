// src/components/GrabTripModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  ArrowLeft,
  Settings2,
  CreditCard,
  Banknote,
  ArrowRightLeft,
  Sparkles,
  Gift,
  Smartphone,
  Wallet as WalletIcon,
  Clock,
  Calculator
} from 'lucide-react';
import { MotorcycleIcon } from './MotorcycleIcon';
import {
  formatVND,
  getCurrentDate,
  getCurrentTime,
  evaluateExpression,
  applyNumpadKey
} from '../utils/formatters';
import { DatePicker } from './ui/DatePicker';
import { CustomSelect } from './ui/CustomSelect';
import { Toast } from './ui/Toast';
import { NumpadBottomSheet } from './NumpadBottomSheet';
import {
  getGrabWalletsConfig,
  saveGrabWalletsConfig,
  createDefaultGrabWallets,
  recordGrabTrip
} from '../services/grabService';
import { transferFunds, sortWallets } from '../services/transactionService';

interface GrabTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

type GrabMode = 'CASH' | 'CARD' | 'TRANSFER';
type GrabTransferAction = 'TOPUP_CREDIT' | 'WITHDRAW_CASH' | 'INTERNAL_SWAP';

export const GrabTripModal: React.FC<GrabTripModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const rawWallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const wallets = useMemo(() => sortWallets(rawWallets), [rawWallets]);

  const [mode, setMode] = useState<GrabMode>('CASH');

  // Input states
  const [grabFareInput, setGrabFareInput] = useState<string>(''); // Giá tiền cuốc xe trên app Grab
  const [netIncomeInput, setNetIncomeInput] = useState<string>(''); // Thu nhập ròng trên app Grab
  const [cashReceivedInput, setCashReceivedInput] = useState<string>(''); // Tiền khách thực tế đưa
  const [cardTipInput, setCardTipInput] = useState<string>(''); // Tip app hoặc ngoài cho cuốc thẻ
  const [date, setDate] = useState<string>(getCurrentDate());
  const [time, setTime] = useState<string>(getCurrentTime());
  const [note, setNote] = useState<string>('');
  const [tag, setTag] = useState<string>('GrabBike');

  // Quản lý Bàn phím số Numpad ảo của web trên mobile
  const [activeNumpadField, setActiveNumpadField] = useState<
    'GRAB_FARE' | 'NET_INCOME' | 'CASH_RECEIVED' | 'CARD_TIP' | 'TRANSFER_AMOUNT' | null
  >(null);
  const [grabFareRaw, setGrabFareRaw] = useState<string>('');
  const [netIncomeRaw, setNetIncomeRaw] = useState<string>('');
  const [cashReceivedRaw, setCashReceivedRaw] = useState<string>('');
  const [cardTipRaw, setCardTipRaw] = useState<string>('');
  const [transferAmountRaw, setTransferAmountRaw] = useState<string>('');

  // Ví nhận tiền thực tế từ khách (Tiền mặt, Vietcombank, MoMo...)
  const [receivingWalletId, setReceivingWalletId] = useState<string>('');

  // Transfer states
  const [transferAction, setTransferAction] = useState<GrabTransferAction>('TOPUP_CREDIT');
  const [transferAmountInput, setTransferAmountInput] = useState<string>('');
  const [bankWalletId, setBankWalletId] = useState<string>('');

  // Wallets config dành riêng cho 2 ví app Grab
  const [creditWalletId, setCreditWalletId] = useState<string>('');
  const [grabCashWalletId, setGrabCashWalletId] = useState<string>('');
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const resetTripForm = () => {
    setGrabFareInput('');
    setGrabFareRaw('');
    setNetIncomeInput('');
    setNetIncomeRaw('');
    setCashReceivedInput('');
    setCashReceivedRaw('');
    setCardTipInput('');
    setCardTipRaw('');
    setTransferAmountInput('');
    setTransferAmountRaw('');
    setNote('');
    setErrorMsg('');
    setActiveNumpadField(null);
    setTime(getCurrentTime());
    setDate(getCurrentDate());
  };

  const handleClose = () => {
    resetTripForm();
    onClose();
  };

  // Load configuration 2 ví Grab
  useEffect(() => {
    if (!isOpen) return;
    // Tự động dọn dẹp trắng form mỗi lần mở modal
    resetTripForm();
    (async () => {
      const config = await getGrabWalletsConfig();
      setCreditWalletId(config.creditWalletId);
      setGrabCashWalletId(config.grabCashWalletId);
      if (!config.isReady) {
        setIsConfigOpen(true);
      }

      // Khởi tạo ví nhận tiền từ khách
      const lastRecv = await db.settings.get('last_grab_receiving_wallet_id');
      const allW = await db.wallets.toArray();
      if (lastRecv?.value && allW.some((w) => w.id === lastRecv.value)) {
        setReceivingWalletId(lastRecv.value as string);
      } else {
        const cash = allW.find((w) => w.type === 'CASH') || allW.find((w) => !w.name.toLowerCase().includes('grab'));
        if (cash) setReceivingWalletId(cash.id);
      }
    })();
  }, [isOpen]);

  // Set default bank wallet for transfers
  useEffect(() => {
    if (wallets.length > 0 && !bankWalletId) {
      const bank = wallets.find((w) => w.type === 'BANK') || wallets[0];
      if (bank) setBankWalletId(bank.id);
    }
  }, [wallets, bankWalletId]);

  // Đảm bảo receivingWalletId luôn hợp lệ khi danh sách wallets load
  useEffect(() => {
    if (wallets.length > 0 && !receivingWalletId) {
      const cash = wallets.find((w) => w.type === 'CASH') || wallets.find((w) => !w.name.toLowerCase().includes('grab'));
      if (cash) setReceivingWalletId(cash.id);
    }
  }, [wallets, receivingWalletId]);

  // Parse numerical inputs
  const grabFare = useMemo(() => {
    const raw = Number(grabFareInput.replace(/\D/g, ''));
    return Number.isFinite(raw) ? raw : 0;
  }, [grabFareInput]);

  const netIncome = useMemo(() => {
    const raw = Number(netIncomeInput.replace(/\D/g, ''));
    return Number.isFinite(raw) ? raw : 0;
  }, [netIncomeInput]);

  const cashReceived = useMemo(() => {
    const raw = Number(cashReceivedInput.replace(/\D/g, ''));
    return Number.isFinite(raw) ? raw : 0;
  }, [cashReceivedInput]);

  const cardTip = useMemo(() => {
    const raw = Number(cardTipInput.replace(/\D/g, ''));
    return Number.isFinite(raw) ? raw : 0;
  }, [cardTipInput]);

  const transferAmount = useMemo(() => {
    const raw = Number(transferAmountInput.replace(/\D/g, ''));
    return Number.isFinite(raw) ? raw : 0;
  }, [transferAmountInput]);

  // Tiền tip tự động tính khi khách đưa nhiều hơn giá cước app Grab:
  const autoTip = useMemo(() => {
    if (mode === 'CASH') {
      const baseFare = grabFare > 0 ? grabFare : cashReceived;
      if (baseFare > 0 && cashReceived > baseFare) {
        return cashReceived - baseFare;
      }
      return 0;
    }
    return cardTip;
  }, [mode, grabFare, cashReceived, cardTip]);

  // Phí chiết khấu Grab trừ Ví Tín Dụng:
  const grabFee = useMemo(() => {
    if (mode !== 'CASH') return 0;
    const tripFare = grabFare > 0 ? grabFare : cashReceived;
    return Math.max(0, tripFare - netIncome);
  }, [mode, grabFare, cashReceived, netIncome]);

  // Tiền voucher Grab bù vào Ví Tiền Mặt Grab nếu khách trả ít hơn giá gốc:
  const voucherSubsidy = useMemo(() => {
    if (mode !== 'CASH') return 0;
    const tripFare = grabFare > 0 ? grabFare : cashReceived;
    return cashReceived < tripFare ? tripFare - cashReceived : 0;
  }, [mode, grabFare, cashReceived]);

  // Phần thu nhập ròng nằm trong tiền mặt khách đưa:
  const cashNetIncome = useMemo(() => {
    if (mode !== 'CASH') return 0;
    return Math.max(0, netIncome - voucherSubsidy);
  }, [mode, netIncome, voucherSubsidy]);

  // Thu nhập thực tế tài xế giữ được từ cuốc xe
  const totalEarned = useMemo(() => {
    if (mode === 'CASH') {
      return netIncome + autoTip;
    }
    return netIncome + cardTip;
  }, [mode, netIncome, autoTip, cardTip]);

  // Gợi ý làm tròn tiền chẵn khách đưa (ví dụ cước 25k -> gợi ý 30k, 40k, 50k, 100k)
  const roundUpSuggestions = useMemo(() => {
    if (grabFare <= 0) return [];
    const candidates = [10000, 20000, 25000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 150000, 200000, 300000, 500000];
    return candidates.filter((v) => v > grabFare).slice(0, 4);
  }, [grabFare]);

  // Thông tin ví đang dùng
  const creditWallet = wallets.find((w) => w.id === creditWalletId);
  const grabCashWallet = wallets.find((w) => w.id === grabCashWalletId);
  const receivingWallet = wallets.find((w) => w.id === receivingWalletId);

  // Tạo nhanh 2 ví Grab mẫu
  const handleAutoCreateWallets = async () => {
    try {
      const { creditWallet: cw, grabCashWallet: gw } = await createDefaultGrabWallets();
      setCreditWalletId(cw.id);
      setGrabCashWalletId(gw.id);

      await saveGrabWalletsConfig({
        creditWalletId: cw.id,
        grabCashWalletId: gw.id
      });

      setFeedback('Đã tạo 2 ví Grab mẫu thành công!');
      setIsConfigOpen(false);
      setTimeout(() => setFeedback(''), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tạo ví Grab');
    }
  };

  // Lưu cấu hình 2 ví Grab nội bộ
  const handleSaveConfig = async () => {
    await saveGrabWalletsConfig({
      creditWalletId,
      grabCashWalletId
    });
    setIsConfigOpen(false);
    setFeedback('Đã cập nhật liên kết 2 ví Grab!');
    setTimeout(() => setFeedback(''), 2500);
  };

  // Mở Numpad cho một trường cụ thể & đồng bộ bộ nhớ đệm Raw
  const openNumpadFor = (field: 'GRAB_FARE' | 'NET_INCOME' | 'CASH_RECEIVED' | 'CARD_TIP' | 'TRANSFER_AMOUNT') => {
    setActiveNumpadField(field);
    if (field === 'GRAB_FARE') setGrabFareRaw(grabFare > 0 ? grabFare.toString() : '');
    else if (field === 'NET_INCOME') setNetIncomeRaw(netIncome > 0 ? netIncome.toString() : '');
    else if (field === 'CASH_RECEIVED') setCashReceivedRaw(cashReceived > 0 ? cashReceived.toString() : '');
    else if (field === 'CARD_TIP') setCardTipRaw(cardTip > 0 ? cardTip.toString() : '');
    else if (field === 'TRANSFER_AMOUNT') setTransferAmountRaw(transferAmount > 0 ? transferAmount.toString() : '');
  };

  // Làm rỗng bộ nhớ đệm và giá trị hiển thị khi người dùng xóa trường
  const clearField = (field: 'GRAB_FARE' | 'NET_INCOME' | 'CASH_RECEIVED' | 'CARD_TIP' | 'TRANSFER_AMOUNT') => {
    if (field === 'GRAB_FARE') {
      const oldFare = grabFareInput;
      setGrabFareInput('');
      setGrabFareRaw('');
      if (!cashReceivedInput || cashReceivedInput === oldFare) {
        setCashReceivedInput('');
        setCashReceivedRaw('');
      }
    } else if (field === 'NET_INCOME') {
      setNetIncomeInput('');
      setNetIncomeRaw('');
    } else if (field === 'CASH_RECEIVED') {
      setCashReceivedInput('');
      setCashReceivedRaw('');
    } else if (field === 'CARD_TIP') {
      setCardTipInput('');
      setCardTipRaw('');
    } else if (field === 'TRANSFER_AMOUNT') {
      setTransferAmountInput('');
      setTransferAmountRaw('');
    }
  };

  // Xử lý khi nhấn phím trên Bàn phím số Numpad ảo (Web)
  const handleNumpadKeyPress = (key: string) => {
    if (!activeNumpadField) return;

    if (activeNumpadField === 'GRAB_FARE') {
      const current = grabFareRaw;
      const nextRaw = applyNumpadKey(current, key);
      const cleanedRaw = (nextRaw === '0' && (key === 'C' || key === 'CLEAR' || key === 'BACKSPACE')) ? '' : nextRaw;
      setGrabFareRaw(cleanedRaw);
      const val = evaluateExpression(cleanedRaw);
      const formatted = val > 0 ? new Intl.NumberFormat('vi-VN').format(val) : '';
      const oldFare = grabFareInput;
      setGrabFareInput(formatted);
      if (!cashReceivedInput || cashReceivedInput === oldFare) {
        setCashReceivedInput(formatted);
        setCashReceivedRaw(cleanedRaw);
      }
    } else if (activeNumpadField === 'NET_INCOME') {
      const current = netIncomeRaw;
      const nextRaw = applyNumpadKey(current, key);
      const cleanedRaw = (nextRaw === '0' && (key === 'C' || key === 'CLEAR' || key === 'BACKSPACE')) ? '' : nextRaw;
      setNetIncomeRaw(cleanedRaw);
      const val = evaluateExpression(cleanedRaw);
      setNetIncomeInput(val > 0 ? new Intl.NumberFormat('vi-VN').format(val) : '');
    } else if (activeNumpadField === 'CASH_RECEIVED') {
      const current = cashReceivedRaw;
      const nextRaw = applyNumpadKey(current, key);
      const cleanedRaw = (nextRaw === '0' && (key === 'C' || key === 'CLEAR' || key === 'BACKSPACE')) ? '' : nextRaw;
      setCashReceivedRaw(cleanedRaw);
      const val = evaluateExpression(cleanedRaw);
      setCashReceivedInput(val > 0 ? new Intl.NumberFormat('vi-VN').format(val) : '');
    } else if (activeNumpadField === 'CARD_TIP') {
      const current = cardTipRaw;
      const nextRaw = applyNumpadKey(current, key);
      const cleanedRaw = (nextRaw === '0' && (key === 'C' || key === 'CLEAR' || key === 'BACKSPACE')) ? '' : nextRaw;
      setCardTipRaw(cleanedRaw);
      const val = evaluateExpression(cleanedRaw);
      setCardTipInput(val > 0 ? new Intl.NumberFormat('vi-VN').format(val) : '');
    } else if (activeNumpadField === 'TRANSFER_AMOUNT') {
      const current = transferAmountRaw;
      const nextRaw = applyNumpadKey(current, key);
      const cleanedRaw = (nextRaw === '0' && (key === 'C' || key === 'CLEAR' || key === 'BACKSPACE')) ? '' : nextRaw;
      setTransferAmountRaw(cleanedRaw);
      const val = evaluateExpression(cleanedRaw);
      setTransferAmountInput(val > 0 ? new Intl.NumberFormat('vi-VN').format(val) : '');
    }
  };

  const numpadInfo = useMemo(() => {
    if (activeNumpadField === 'GRAB_FARE') {
      const raw = grabFareRaw || (grabFare > 0 ? grabFare.toString() : '0');
      const val = evaluateExpression(raw);
      return {
        amountStr: raw,
        computedAmount: val,
        badgeLabel: 'Cước App Grab',
        badgeStyle: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        amountColor: 'text-amber-400'
      };
    }
    if (activeNumpadField === 'NET_INCOME') {
      const raw = netIncomeRaw || (netIncome > 0 ? netIncome.toString() : '0');
      const val = evaluateExpression(raw);
      return {
        amountStr: raw,
        computedAmount: val,
        badgeLabel: 'Thu nhập ròng',
        badgeStyle: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        amountColor: 'text-emerald-400'
      };
    }
    if (activeNumpadField === 'CASH_RECEIVED') {
      const raw = cashReceivedRaw || (cashReceived > 0 ? cashReceived.toString() : '0');
      const val = evaluateExpression(raw);
      return {
        amountStr: raw,
        computedAmount: val,
        badgeLabel: 'Tiền khách thực đưa',
        badgeStyle:
          autoTip > 0
            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
            : 'bg-sky-500/20 text-sky-300 border-sky-500/30',
        amountColor: autoTip > 0 ? 'text-purple-300' : 'text-sky-300'
      };
    }
    if (activeNumpadField === 'CARD_TIP') {
      const raw = cardTipRaw || (cardTip > 0 ? cardTip.toString() : '0');
      const val = evaluateExpression(raw);
      return {
        amountStr: raw,
        computedAmount: val,
        badgeLabel: 'Tiền Tip trên App',
        badgeStyle: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        amountColor: 'text-purple-400'
      };
    }
    if (activeNumpadField === 'TRANSFER_AMOUNT') {
      const raw = transferAmountRaw || (transferAmount > 0 ? transferAmount.toString() : '0');
      const val = evaluateExpression(raw);
      return {
        amountStr: raw,
        computedAmount: val,
        badgeLabel: 'Số tiền chuyển',
        badgeStyle: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
        amountColor: 'text-sky-400'
      };
    }
    return null;
  }, [
    activeNumpadField,
    grabFareRaw,
    grabFare,
    netIncomeRaw,
    netIncome,
    cashReceivedRaw,
    cashReceived,
    autoTip,
    cardTipRaw,
    cardTip,
    transferAmountRaw,
    transferAmount
  ]);

  // Xử lý khi thay đổi Giá cước App Grab
  const handleGrabFareChange = (valStr: string) => {
    const rawVal = valStr.replace(/\D/g, '').slice(0, 12);
    const formatted = rawVal ? new Intl.NumberFormat('vi-VN').format(Number(rawVal)) : '';
    const oldFare = grabFareInput;
    setGrabFareInput(formatted);
    setGrabFareRaw(rawVal);

    // Tự động điền tiền khách đưa bằng cước app nếu ô khách đưa đang trống hoặc bằng đúng cước cũ
    if (!cashReceivedInput || cashReceivedInput === oldFare) {
      setCashReceivedInput(formatted);
      setCashReceivedRaw(rawVal);
    }
  };

  // Nút nhanh: Khách đưa vừa đủ
  const handleSetExactCash = () => {
    setCashReceivedInput(grabFareInput);
    setCashReceivedRaw(grabFare > 0 ? grabFare.toString() : '');
  };

  // Nút nhanh: Tip thêm (+5k, +10k, +20k, +50k)
  const handleAddQuickTip = (tipAdd: number) => {
    const base = grabFare > 0 ? grabFare : cashReceived;
    const nextCash = base + tipAdd;
    setCashReceivedInput(new Intl.NumberFormat('vi-VN').format(nextCash));
    setCashReceivedRaw(nextCash.toString());
  };

  // Nút nhanh: Làm tròn mệnh giá khách đưa
  const handleSelectRoundUp = (roundVal: number) => {
    setCashReceivedInput(new Intl.NumberFormat('vi-VN').format(roundVal));
    setCashReceivedRaw(roundVal.toString());
  };

  // Cộng nhanh tiền vào ô đang chọn
  const handleQuickAddAmount = (add: number, target: 'GRAB_FARE' | 'CASH_RECEIVED' | 'NET_INCOME' | 'CARD_TIP' | 'TRANSFER_AMOUNT') => {
    if (target === 'GRAB_FARE') {
      const next = grabFare + add;
      const formatted = new Intl.NumberFormat('vi-VN').format(next);
      setGrabFareInput(formatted);
      setGrabFareRaw(next.toString());
      if (!cashReceivedInput || cashReceivedInput === grabFareInput) {
        setCashReceivedInput(formatted);
        setCashReceivedRaw(next.toString());
      }
    } else if (target === 'CASH_RECEIVED') {
      const next = cashReceived + add;
      setCashReceivedInput(new Intl.NumberFormat('vi-VN').format(next));
      setCashReceivedRaw(next.toString());
    } else if (target === 'NET_INCOME') {
      const next = netIncome + add;
      setNetIncomeInput(new Intl.NumberFormat('vi-VN').format(next));
      setNetIncomeRaw(next.toString());
    } else if (target === 'CARD_TIP') {
      const next = cardTip + add;
      setCardTipInput(new Intl.NumberFormat('vi-VN').format(next));
      setCardTipRaw(next.toString());
    } else {
      const next = transferAmount + add;
      setTransferAmountInput(new Intl.NumberFormat('vi-VN').format(next));
      setTransferAmountRaw(next.toString());
    }
  };

  // Áp dụng ước tính nhanh tỷ lệ % thu nhập ròng thông dụng của Grab (chiết khấu ~25-28%)
  const handleQuickEstimateNet = (percent: number) => {
    const baseFare = grabFare > 0 ? grabFare : cashReceived;
    if (baseFare <= 0) return;
    const estimated = Math.round((baseFare * percent) / 1000) * 1000;
    setNetIncomeInput(new Intl.NumberFormat('vi-VN').format(estimated));
    setNetIncomeRaw(estimated.toString());
  };

  // Lưu cuốc Grab
  const handleSubmitTrip = async (keepOpen = false) => {
    setErrorMsg('');
    if (!creditWalletId || !grabCashWalletId) {
      setErrorMsg('Vui lòng cấu hình 2 ví Grab trước khi ghi cuốc');
      setIsConfigOpen(true);
      return;
    }

    if (mode === 'CASH') {
      if (grabFare <= 0 && cashReceived <= 0) {
        setErrorMsg('Vui lòng nhập giá cước Grab hoặc tiền khách đưa');
        return;
      }
      if (netIncome <= 0) {
        setErrorMsg('Vui lòng nhập thu nhập ròng lớn hơn 0');
        return;
      }
      if (!receivingWalletId) {
        setErrorMsg('Vui lòng chọn ví nhận tiền từ khách');
        return;
      }
    } else if (mode === 'CARD') {
      if (netIncome <= 0) {
        setErrorMsg('Vui lòng nhập thu nhập ròng nhận được từ Grab');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const fullNote = [tag, note.trim()].filter(Boolean).join(' • ');
      const res = await recordGrabTrip({
        paymentMethod: mode as 'CASH' | 'CARD',
        grabFare: grabFare > 0 ? grabFare : cashReceived,
        cashReceived: cashReceived > 0 ? cashReceived : grabFare,
        netIncome,
        tipAmount: autoTip,
        tipType: 'CASH',
        creditWalletId,
        grabCashWalletId,
        receivingWalletId,
        date,
        time,
        note: fullNote
      });

      const successText =
        mode === 'CASH'
          ? `Đã ghi cuốc Grab: +${formatVND(cashReceived)} vào ${receivingWallet?.name} (Grab trừ ${formatVND(res.grabFee)} Tín Dụng, ròng: +${formatVND(netIncome)}${res.voucherSubsidy > 0 ? `, hoàn voucher +${formatVND(res.voucherSubsidy)} Ví TM` : ''}${res.tipAmount > 0 ? `, tip +${formatVND(res.tipAmount)}` : ''})`
          : `Đã ghi cuốc Grab thẻ: +${formatVND(res.totalEarned)} vào Ví Tiền Mặt Grab`;

      if (onSuccess) onSuccess(successText);

      if (keepOpen) {
        resetTripForm();
        setFeedback(successText);
        setTimeout(() => setFeedback(''), 3000);
      } else {
        resetTripForm();
        onClose();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi khi lưu cuốc Grab');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xử lý nạp / rút ví Grab
  const handleSubmitTransfer = async () => {
    setErrorMsg('');
    if (transferAmount <= 0) {
      setErrorMsg('Vui lòng nhập số tiền chuyển hợp lệ');
      return;
    }

    let fromId = '';
    let toId = '';
    let transferNote = '';

    if (transferAction === 'TOPUP_CREDIT') {
      fromId = bankWalletId;
      toId = creditWalletId;
      transferNote = 'Nạp tiền vào Ví Tín Dụng Grab để chạy xe';
    } else if (transferAction === 'WITHDRAW_CASH') {
      fromId = grabCashWalletId;
      toId = bankWalletId;
      transferNote = 'Rút tiền từ Ví Tiền Mặt Grab về Ngân hàng';
    } else {
      fromId = grabCashWalletId;
      toId = creditWalletId;
      transferNote = 'Chuyển tiền nội bộ: Ví Tiền Mặt Grab sang Ví Tín Dụng';
    }

    if (!fromId || !toId) {
      setErrorMsg('Chưa chọn đủ ví gửi và ví nhận');
      return;
    }

    setIsSubmitting(true);
    try {
      await transferFunds({
        fromWalletId: fromId,
        toWalletId: toId,
        amount: transferAmount,
        date,
        time,
        note: transferNote
      });

      const msg = `Chuyển ${formatVND(transferAmount)} thành công!`;
      if (onSuccess) onSuccess(msg);
      setTransferAmountInput('');
      setFeedback(msg);
      setTimeout(() => setFeedback(''), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi khi chuyển tiền');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-full max-w-2xl mx-auto pb-28 animate-fade-in font-body text-slate-100">
      {/* 1. HEADER BAR PHẲNG CÓ NÚT BACK */}
      <div className="px-4 py-3 bg-slate-900/95 border-b border-white/8 flex items-center justify-between gap-3 sticky top-0 z-20 backdrop-blur-md">
        <button
          type="button"
          onClick={handleClose}
          className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
          title="Quay lại"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex-1 flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <MotorcycleIcon size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-sm font-extrabold text-slate-100 uppercase tracking-wide m-0 truncate">
                Nghiệp Vụ GrabBike
              </h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                Tài xế 4.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400 m-0 mt-0.5 truncate">
              Tự động tách vốn lưu động & thu nhập ròng
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsConfigOpen(!isConfigOpen)}
          className={`touch-btn w-9 h-9 rounded-xl border cursor-pointer transition-colors shrink-0 flex items-center justify-center ${
            isConfigOpen
              ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
              : 'bg-slate-800/80 border-white/10 text-slate-300 hover:text-white'
          }`}
          title="Cài đặt 2 ví app Grab"
        >
          <Settings2 size={16} />
        </button>
      </div>

      {/* 2. NỘI DUNG CUỘN CHÍNH */}
      <div className="p-4 flex flex-col gap-3.5">
          {/* Thông báo phản hồi (Glassmorphism) */}
          {feedback && (
            <Toast
              message={feedback}
              type="success"
              onClose={() => setFeedback('')}
            />
          )}

          {errorMsg && (
            <Toast
              message={errorMsg}
              type="error"
              onClose={() => setErrorMsg('')}
            />
          )}

          {/* KHUNG CÀI ĐẶT 2 VÍ APP GRAB */}
          {isConfigOpen && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-sky-500/30 flex flex-col gap-3 animate-fade-in text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sky-400 uppercase tracking-wide flex items-center gap-1.5">
                  <Settings2 size={14} /> Cấu hình 2 ví App Grab
                </span>
                {(!creditWalletId || !grabCashWalletId) && (
                  <button
                    type="button"
                    onClick={handleAutoCreateWallets}
                    className="touch-btn py-1 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold cursor-pointer"
                  >
                    ⚡ Tạo 2 ví Grab mẫu
                  </button>
                )}
              </div>

              <p className="text-[11px] text-slate-400 m-0">
                Chỉ cần liên kết 2 ví nội bộ trên ứng dụng Grab Driver. Ví nhận tiền từ khách sẽ được chọn trực tiếp khi ghi cuốc.
              </p>

              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-[11px] text-slate-300 font-semibold block mb-1">
                    1. Ví Tín Dụng Grab (để Grab trừ chiết khấu cuốc xe / tiền mua món ăn):
                  </label>
                  <CustomSelect
                    value={creditWalletId}
                    onChange={setCreditWalletId}
                    options={wallets.map((w) => ({
                      value: w.id,
                      label: `${w.name} (${formatVND(w.balance)})`
                    }))}
                    placeholder="Chọn ví Tín Dụng Grab..."
                    triggerClassName="py-2 text-xs bg-slate-900 border-white/10"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 font-semibold block mb-1">
                    2. Ví Tiền Mặt Grab (app Grab nhận tiền cuốc thẻ, tip app & rút về bank):
                  </label>
                  <CustomSelect
                    value={grabCashWalletId}
                    onChange={setGrabCashWalletId}
                    options={wallets.map((w) => ({
                      value: w.id,
                      label: `${w.name} (${formatVND(w.balance)})`
                    }))}
                    placeholder="Chọn ví Tiền Mặt Grab..."
                    triggerClassName="py-2 text-xs bg-slate-900 border-white/10"
                  />
                </div>
              </div>

              <div className="flex justify-end items-center gap-2 pt-2 border-t border-white/6">
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 font-semibold cursor-pointer border-none"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-4 py-1.5 rounded-xl bg-sky-500 text-slate-950 font-bold cursor-pointer border-none"
                >
                  Lưu cấu hình
                </button>
              </div>
            </div>
          )}

          {/* THANH SỐ DƯ VÍ TÀI XẾ */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-2xl bg-slate-950/70 border border-white/6 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 block truncate font-medium">Ví Tín Dụng</span>
              <span className="text-xs font-black text-sky-400 truncate block mt-0.5">
                {creditWallet ? formatVND(creditWallet.balance) : '0 ₫'}
              </span>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-950/70 border border-white/6 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 block truncate font-medium">Ví TM Grab</span>
              <span className="text-xs font-black text-emerald-400 truncate block mt-0.5">
                {grabCashWallet ? formatVND(grabCashWallet.balance) : '0 ₫'}
              </span>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-950/70 border border-white/6 flex flex-col justify-between min-w-0">
              <span className="text-[10px] text-slate-400 block truncate font-medium">Ví nhận tiền</span>
              <span className="text-xs font-black text-amber-400 truncate block mt-0.5">
                {receivingWallet ? formatVND(receivingWallet.balance) : '0 ₫'}
              </span>
              <span className="text-[9px] text-slate-400 truncate block font-medium">
                {receivingWallet?.name || 'Chưa chọn'}
              </span>
            </div>
          </div>

          {/* TAB CHỌN CHẾ ĐỘ: TIỀN MẶT / THẺ / NẠP RÚT */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-950 border border-white/8">
            <button
              type="button"
              onClick={() => setMode('CASH')}
              className={`py-2 px-1 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer border transition-all ${
                mode === 'CASH'
                  ? 'bg-amber-500/25 border-amber-500 text-amber-300 shadow-sm'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Banknote size={15} />
              <span>Tiền mặt</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('CARD')}
              className={`py-2 px-1 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer border transition-all ${
                mode === 'CARD'
                  ? 'bg-emerald-500/25 border-emerald-500 text-emerald-300 shadow-sm'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <CreditCard size={15} />
              <span>Thẻ / Ví Grab</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('TRANSFER')}
              className={`py-2 px-1 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer border transition-all ${
                mode === 'TRANSFER'
                  ? 'bg-sky-500/25 border-sky-500 text-sky-300 shadow-sm'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <ArrowRightLeft size={15} />
              <span>Nạp / Rút</span>
            </button>
          </div>

          {/* NỘI DUNG 1: KHÁCH TRẢ TRỰC TIẾP (TIỀN MẶT / CHUYỂN KHOẢN NGÂN HÀNG / VÍ ĐIỆN TỬ) */}
          {mode === 'CASH' && (
            <div className="flex flex-col gap-3 animate-fade-in">
              {/* CHỌN VÍ NHẬN TIỀN TỪ KHÁCH */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-sky-500/30 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <label className="text-xs font-bold text-sky-300 uppercase tracking-wide flex items-center gap-1.5">
                    <WalletIcon size={14} />
                    <span>Ví nhận tiền:</span>
                  </label>
                  <span className="text-[11px] font-bold text-sky-300 bg-sky-500/15 px-2 py-0.5 rounded-lg border border-sky-500/25 truncate max-w-[200px]">
                    {receivingWallet?.name} ({formatVND(receivingWallet?.balance || 0)})
                  </span>
                </div>

                {/* Danh sách chip chọn nhanh các ví khả dụng */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {wallets
                    .filter((w) => w.id !== creditWalletId && w.id !== grabCashWalletId)
                    .map((w) => {
                      const isSelected = w.id === receivingWalletId;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setReceivingWalletId(w.id)}
                          className={`touch-btn py-1.5 px-3 rounded-xl text-xs font-bold border cursor-pointer transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-sky-500/25 border-sky-400 text-sky-200 shadow-sm'
                              : 'bg-slate-900 border-white/6 text-slate-400 hover:text-white'
                          }`}
                        >
                          <span>{w.type === 'CASH' ? '💵' : w.type === 'BANK' ? '🏦' : '📱'}</span>
                          <span>{w.name}</span>
                        </button>
                      );
                    })}
                </div>
                <p className="text-[10px] text-slate-400 m-0">
                  Khách đưa tiền mặt chọn <b>Tiền mặt</b>. Khách chuyển khoản thì bấm chọn <b>Ngân hàng / MoMo</b> để tiền tự vào đúng ví.
                </p>
              </div>

              {/* Ô 1: GIÁ CƯỚC TRÊN APP GRAB */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-amber-500/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                    <Smartphone size={14} />
                    <span>Giá tiền Grab (Cước trên App)</span>
                  </label>
                  {grabFare > 0 && (
                    <button
                      type="button"
                      onClick={() => clearField('GRAB_FARE')}
                      className="text-[10px] text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                {/* Mobile touch trigger */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openNumpadFor('GRAB_FARE')}
                  className="md:hidden flex items-center justify-between py-2 px-3 rounded-xl bg-slate-900 border border-white/10 active:border-amber-400/50 cursor-pointer min-h-[48px]"
                >
                  <span
                    className={`${
                      grabFareInput.length > 11
                        ? 'text-lg'
                        : grabFareInput.length > 8
                        ? 'text-xl'
                        : 'text-2xl'
                    } font-black font-heading text-amber-400 truncate flex-1 min-w-0 mr-2`}
                  >
                    {grabFareInput || '0 ₫'}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-amber-400/80 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                    <Calculator size={14} />
                    <span>Bàn phím</span>
                  </div>
                </div>

                {/* Desktop input */}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={16}
                  value={grabFareInput}
                  onChange={(e) => handleGrabFareChange(e.target.value)}
                  placeholder="0 ₫"
                  className="hidden md:block input-ios text-2xl font-black font-heading text-amber-400 py-1 bg-transparent border-none outline-none"
                />

                {/* Các nút bấm mệnh giá cước nhanh */}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/6">
                  {[20000, 25000, 30000, 50000, 77000, 100000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleQuickAddAmount(val, 'GRAB_FARE')}
                      className="touch-btn text-[11px] font-bold py-1 px-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-white/6 cursor-pointer"
                    >
                      +{val >= 1000 ? `${val / 1000}k` : val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ô 2: THU NHẬP RÒNG TRÊN APP GRAB */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-emerald-500/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles size={14} />
                    <span>Thu nhập ròng trên App</span>
                    <span className="text-[10px] text-slate-400 normal-case">(Grab báo nhận được)</span>
                  </label>
                  {netIncome > 0 && (
                    <button
                      type="button"
                      onClick={() => clearField('NET_INCOME')}
                      className="text-[10px] text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                {/* Mobile touch trigger */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openNumpadFor('NET_INCOME')}
                  className="md:hidden flex items-center justify-between py-2 px-3 rounded-xl bg-slate-900 border border-white/10 active:border-emerald-400/50 cursor-pointer min-h-[48px]"
                >
                  <span
                    className={`${
                      netIncomeInput.length > 11
                        ? 'text-lg'
                        : netIncomeInput.length > 8
                        ? 'text-xl'
                        : 'text-2xl'
                    } font-black font-heading text-emerald-400 truncate flex-1 min-w-0 mr-2`}
                  >
                    {netIncomeInput || '0 ₫'}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400/80 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                    <Calculator size={14} />
                    <span>Bàn phím</span>
                  </div>
                </div>

                {/* Desktop input */}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={16}
                  value={netIncomeInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setNetIncomeInput(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                  }}
                  placeholder="0 ₫"
                  className="hidden md:block input-ios text-2xl font-black font-heading text-emerald-400 py-1 bg-transparent border-none outline-none"
                />

                {/* Ước tính nhanh tỷ lệ ròng nếu không muốn gõ */}
                {(grabFare > 0 || cashReceived > 0) && (
                  <div className="flex items-center gap-1.5 pt-1 border-t border-white/6 text-[10px] text-slate-400">
                    <span>Tính nhanh:</span>
                    <button
                      type="button"
                      onClick={() => handleQuickEstimateNet(72)}
                      className="py-0.5 px-1.5 rounded bg-slate-800 text-emerald-400 font-bold border border-white/6 cursor-pointer"
                    >
                      72% (CK 28%)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickEstimateNet(75)}
                      className="py-0.5 px-1.5 rounded bg-slate-800 text-emerald-400 font-bold border border-white/6 cursor-pointer"
                    >
                      75% (CK 25%)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickEstimateNet(80)}
                      className="py-0.5 px-1.5 rounded bg-slate-800 text-emerald-400 font-bold border border-white/6 cursor-pointer"
                    >
                      80% (CK 20%)
                    </button>
                  </div>
                )}
              </div>

              {/* Ô 3: TIỀN KHÁCH THỰC TẾ ĐƯA */}
              <div
                className={`p-3.5 rounded-2xl bg-slate-950/80 border transition-all flex flex-col gap-2 ${
                  autoTip > 0
                    ? 'border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                    : 'border-sky-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <label className="text-xs font-bold text-sky-300 uppercase tracking-wide flex items-center gap-1">
                      <span>💵 Tiền khách thực đưa</span>
                      <span className="text-[10px] text-slate-400 normal-case">
                        (Vào ví {receivingWallet?.name || 'nhận'})
                      </span>
                    </label>
                    {autoTip > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30 text-[11px] animate-fade-in flex items-center gap-1">
                        <Gift size={12} />
                        <span>Tip thêm: +{formatVND(autoTip)}</span>
                      </span>
                    )}
                  </div>
                  {cashReceived > 0 && (
                    <button
                      type="button"
                      onClick={() => clearField('CASH_RECEIVED')}
                      className="text-[10px] text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                {/* Mobile touch trigger */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openNumpadFor('CASH_RECEIVED')}
                  className="md:hidden flex items-center justify-between py-2 px-3 rounded-xl bg-slate-900 border border-white/10 active:border-sky-400/50 cursor-pointer min-h-[48px]"
                >
                  <span className={`${cashReceivedInput.length > 11 ? 'text-lg' : cashReceivedInput.length > 8 ? 'text-xl' : 'text-2xl'} font-black font-heading ${autoTip > 0 ? 'text-purple-300' : 'text-sky-300'} truncate flex-1 min-w-0 mr-2`}>
                    {cashReceivedInput || (grabFareInput ? `${grabFareInput} (mặc định)` : '0 ₫')}
                  </span>
                  <div
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg ${
                      autoTip > 0 ? 'text-purple-300 bg-purple-500/10' : 'text-sky-400/80 bg-sky-500/10'
                    }`}
                  >
                    <Calculator size={14} />
                    <span>Bàn phím</span>
                  </div>
                </div>

                {/* Desktop input */}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={16}
                  value={cashReceivedInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setCashReceivedInput(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                  }}
                  placeholder={grabFareInput || '0 ₫'}
                  className={`hidden md:block input-ios text-2xl font-black font-heading py-1 bg-transparent border-none outline-none ${
                    autoTip > 0 ? 'text-purple-300' : 'text-sky-300'
                  }`}
                />

                {/* Các nút bấm thao tác thông minh cho tiền khách đưa */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-white/6">
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400">
                    {/* Nút đặt lại khách đưa vừa đủ nếu đang lệch */}
                    {grabFare > 0 && cashReceived !== grabFare && (
                      <button
                        type="button"
                        onClick={handleSetExactCash}
                        className="touch-btn py-1 px-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 font-bold cursor-pointer"
                      >
                        Khách đưa vừa đủ ({formatVND(grabFare)})
                      </button>
                    )}

                    {/* Các nút tip nhanh: +5k, +10k, +20k, +50k */}
                    <span className="text-slate-500">Tip nhanh:</span>
                    {[5000, 10000, 20000, 50000].map((tipVal) => (
                      <button
                        key={tipVal}
                        type="button"
                        onClick={() => handleAddQuickTip(tipVal)}
                        className="touch-btn text-[11px] font-bold py-1 px-2 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/25 cursor-pointer"
                      >
                        +{tipVal >= 1000 ? `${tipVal / 1000}k` : tipVal}
                      </button>
                    ))}
                  </div>

                  {/* Nút làm tròn tiền chẵn nếu khách đưa tờ tròn không thối */}
                  {roundUpSuggestions.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400">
                      <span className="text-slate-500">Khách đưa tròn:</span>
                      {roundUpSuggestions.map((roundVal) => (
                        <button
                          key={roundVal}
                          type="button"
                          onClick={() => handleSelectRoundUp(roundVal)}
                          className="touch-btn text-[11px] font-bold py-0.5 px-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-white/6 cursor-pointer"
                        >
                          {roundVal >= 1000 ? `${roundVal / 1000}k` : roundVal}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* KHUNG TÓM TẮT PHÂN BỔ DÒNG TIỀN THỰC TẾ */}
              {(cashReceived > 0 || grabFare > 0 || netIncome > 0) && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 flex flex-col gap-2 text-xs">
                  <div className="font-extrabold text-slate-200 flex items-center justify-between pb-1.5 border-b border-white/6">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={14} className="text-emerald-400" />
                      Phân bổ dòng tiền tự động:
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                      Chuẩn kế toán
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-300 py-0.5">
                    <span className="text-slate-400">💵 Tiền nhận vào {receivingWallet?.name}:</span>
                    <span className="font-extrabold text-amber-400 text-sm">+{formatVND(cashReceived)}</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-300 py-0.5">
                    <div className="flex flex-col">
                      <span className="text-slate-400">💼 Chiết khấu Grab trừ Ví Tín Dụng:</span>
                      <span className="text-[10px] text-slate-500">
                        (Khách đưa tiền cước gồm cả phí, Grab trừ phí ở Ví Tín Dụng)
                      </span>
                    </div>
                    <span className="font-extrabold text-rose-400 text-sm">
                      -{formatVND(grabFee)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-300 py-0.5">
                    <div className="flex flex-col">
                      <span className="text-slate-400">✨ Thu nhập ròng tiền mặt:</span>
                      <span className="text-[10px] text-slate-500">
                        (Thu nhập nằm trong tiền mặt khách đưa ➔ Vào {receivingWallet?.name})
                      </span>
                    </div>
                    <span className="font-extrabold text-emerald-400 text-sm">+{formatVND(cashNetIncome)}</span>
                  </div>

                  {voucherSubsidy > 0 && (
                    <div className="flex justify-between items-center text-sky-300 py-0.5 animate-fade-in font-bold">
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1">
                          <Gift size={13} />
                          Grab hoàn Voucher / Giảm giá:
                        </span>
                        <span className="text-[10px] text-sky-400/80 font-normal">
                          (Khách trả thiếu do dùng mã ➔ Grab bù vào Ví TM Grab)
                        </span>
                      </div>
                      <span className="text-sky-300 text-sm font-extrabold">
                        +{formatVND(voucherSubsidy)}
                      </span>
                    </div>
                  )}

                  {autoTip > 0 && (
                    <div className="flex justify-between items-center text-purple-300 py-0.5 animate-fade-in font-bold">
                      <span className="flex items-center gap-1">
                        <Gift size={13} />
                        Tiền Tip khách cho thêm (Vào {receivingWallet?.name}):
                      </span>
                      <span className="text-purple-300 text-sm">
                        +{formatVND(autoTip)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 mt-0.5 border-t border-white/8 font-extrabold">
                    <div className="flex flex-col">
                      <span className="text-slate-100 text-xs">💰 Tổng thu nhập thực nhận:</span>
                      <span className="text-[10px] text-emerald-400/80 font-normal">
                        Ròng {formatVND(netIncome)} {voucherSubsidy > 0 ? `(Tiền mặt ${formatVND(cashNetIncome)} + Grab bù ${formatVND(voucherSubsidy)})` : ''} {autoTip > 0 ? `+ Tip ${formatVND(autoTip)}` : ''}
                      </span>
                    </div>
                    <span className="text-base font-heading font-black text-income">
                      +{formatVND(totalEarned)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* NỘI DUNG 2: KHÁCH TRẢ THẺ / VÍ GRAB */}
          {mode === 'CARD' && (
            <div className="flex flex-col gap-3 animate-fade-in">
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-emerald-500/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1">
                    <span>💳 Thu nhập ròng cuốc xe</span>
                    <span className="text-[10px] text-slate-400 normal-case">(Vào Ví Tiền Mặt Grab)</span>
                  </label>
                  {netIncome > 0 && (
                    <button
                      type="button"
                      onClick={() => clearField('NET_INCOME')}
                      className="text-[10px] text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                {/* Mobile touch trigger */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openNumpadFor('NET_INCOME')}
                  className="md:hidden flex items-center justify-between py-2 px-3 rounded-xl bg-slate-900 border border-white/10 active:border-emerald-400/50 cursor-pointer min-h-[48px]"
                >
                  <span
                    className={`${
                      netIncomeInput.length > 11
                        ? 'text-lg'
                        : netIncomeInput.length > 8
                        ? 'text-xl'
                        : 'text-2xl'
                    } font-black font-heading text-emerald-400 truncate flex-1 min-w-0 mr-2`}
                  >
                    {netIncomeInput || '0 ₫'}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400/80 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                    <Calculator size={14} />
                    <span>Bàn phím</span>
                  </div>
                </div>

                {/* Desktop input */}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={16}
                  value={netIncomeInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setNetIncomeInput(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                  }}
                  placeholder="0 ₫"
                  className="hidden md:block input-ios text-2xl font-black font-heading text-emerald-400 py-1 bg-transparent border-none outline-none"
                />

                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/6">
                  {[20000, 30000, 50000, 70000, 100000, 150000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleQuickAddAmount(val, 'NET_INCOME')}
                      className="touch-btn text-[11px] font-bold py-1 px-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-white/6 cursor-pointer"
                    >
                      +{val >= 1000 ? `${val / 1000}k` : val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ô TIP APP CHO CUỐC THẺ */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-purple-500/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Gift size={15} className="text-purple-400" />
                    <label className="text-xs font-bold text-purple-300 uppercase tracking-wide">
                      Tiền Tip trên App (nếu có)
                    </label>
                    <span className="text-[10px] text-purple-400/80 font-medium">
                      (100% về ví app)
                    </span>
                  </div>
                  {cardTip > 0 && (
                    <button
                      type="button"
                      onClick={() => clearField('CARD_TIP')}
                      className="text-[10px] text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                {/* Mobile touch trigger */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openNumpadFor('CARD_TIP')}
                  className="md:hidden flex items-center justify-between py-2 px-3 rounded-xl bg-slate-900 border border-white/10 active:border-purple-400/50 cursor-pointer min-h-[44px]"
                >
                  <span
                    className={`${
                      cardTipInput.length > 11
                        ? 'text-base'
                        : cardTipInput.length > 8
                        ? 'text-lg'
                        : 'text-xl'
                    } font-bold font-heading text-purple-400 truncate flex-1 min-w-0 mr-2`}
                  >
                    {cardTipInput || '0 ₫ (Grab không thu phí tip)'}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-purple-400/80 bg-purple-500/10 px-2.5 py-1 rounded-lg">
                    <Calculator size={14} />
                    <span>Bàn phím</span>
                  </div>
                </div>

                {/* Desktop input */}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={16}
                  value={cardTipInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setCardTipInput(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                  }}
                  placeholder="0 ₫ (Grab không thu phí tip)"
                  className="hidden md:block input-ios text-xl font-bold font-heading text-purple-400 py-1 bg-transparent border-none outline-none"
                />

                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/6">
                  {[5000, 10000, 20000, 50000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleQuickAddAmount(val, 'CARD_TIP')}
                      className="touch-btn text-[11px] font-bold py-1 px-2.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/25 cursor-pointer"
                    >
                      +{val >= 1000 ? `${val / 1000}k` : val}
                    </button>
                  ))}
                </div>
              </div>

              {netIncome > 0 && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/10 flex flex-col gap-2 text-xs">
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">📱 Thu nhập cuốc thẻ:</span>
                    <span className="font-extrabold text-emerald-400">+{formatVND(netIncome)}</span>
                  </div>
                  {cardTip > 0 && (
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-purple-300">🎁 Tiền tip trên app (100%):</span>
                      <span className="font-extrabold text-purple-400">+{formatVND(cardTip)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">💵 Tiền nhận trực tiếp:</span>
                    <span className="font-medium text-slate-400">0 ₫ (khách trả thẻ qua app)</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 mt-0.5 border-t border-white/8 font-extrabold">
                    <div className="flex flex-col">
                      <span className="text-slate-100 text-xs">✨ Tổng tiền vào Ví Tiền Mặt Grab:</span>
                      <span className="text-[10px] text-emerald-400/80 font-normal">
                        Có thể rút về tài khoản ngân hàng bất cứ lúc nào
                      </span>
                    </div>
                    <span className="text-base font-heading font-black text-income">
                      +{formatVND(totalEarned)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* NỘI DUNG 3: NẠP TIỀN / RÚT TIỀN VÍ GRAB */}
          {mode === 'TRANSFER' && (
            <div className="flex flex-col gap-3 animate-fade-in">
              <div className="flex flex-col gap-1.5">
                {[
                  {
                    id: 'TOPUP_CREDIT',
                    label: '⚡ Nạp Ví Tín Dụng Grab',
                    desc: 'Chuyển tiền từ Ngân hàng sang Ví Tín Dụng để có tiền chạy'
                  },
                  {
                    id: 'WITHDRAW_CASH',
                    label: '🏦 Rút Ví Tiền Mặt Grab',
                    desc: 'Rút tiền thu nhập cuốc thẻ từ Grab về tài khoản Ngân hàng'
                  },
                  {
                    id: 'INTERNAL_SWAP',
                    label: '🔄 Chuyển Ví nội bộ Grab',
                    desc: 'Chuyển tiền từ Ví Tiền Mặt sang Ví Tín Dụng để tiếp tục chạy'
                  }
                ].map((act) => (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => setTransferAction(act.id as GrabTransferAction)}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      transferAction === act.id
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                        : 'bg-slate-950 border-white/6 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold">{act.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{act.desc}</div>
                  </button>
                ))}
              </div>

              {transferAction !== 'INTERNAL_SWAP' && (
                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">
                    Chọn Tài khoản Ngân hàng:
                  </label>
                  <CustomSelect
                    value={bankWalletId}
                    onChange={setBankWalletId}
                    options={wallets.map((w) => ({
                      value: w.id,
                      label: `${w.name} (${formatVND(w.balance)})`
                    }))}
                    triggerClassName="py-2 text-xs bg-slate-950 border-white/10"
                  />
                </div>
              )}

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-sky-500/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-sky-300 uppercase tracking-wide">
                    Số tiền chuyển (VNĐ)
                  </label>
                  {transferAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => clearField('TRANSFER_AMOUNT')}
                      className="text-[10px] text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>
                {/* Mobile touch trigger */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openNumpadFor('TRANSFER_AMOUNT')}
                  className="md:hidden flex items-center justify-between py-2 px-3 rounded-xl bg-slate-900 border border-white/10 active:border-sky-400/50 cursor-pointer min-h-[48px]"
                >
                  <span
                    className={`${
                      transferAmountInput.length > 11
                        ? 'text-lg'
                        : transferAmountInput.length > 8
                        ? 'text-xl'
                        : 'text-2xl'
                    } font-black font-heading text-sky-400 truncate flex-1 min-w-0 mr-2`}
                  >
                    {transferAmountInput || '0 ₫'}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-sky-400/80 bg-sky-500/10 px-2.5 py-1 rounded-lg">
                    <Calculator size={14} />
                    <span>Bàn phím</span>
                  </div>
                </div>

                {/* Desktop input */}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={16}
                  value={transferAmountInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setTransferAmountInput(
                      val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : ''
                    );
                  }}
                  placeholder="0 ₫"
                  className="hidden md:block input-ios text-2xl font-black font-heading text-sky-400 py-1 bg-transparent border-none outline-none"
                />

                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/6">
                  {[100000, 200000, 500000, 1000000, 2000000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        const next = transferAmount + val;
                        setTransferAmountInput(new Intl.NumberFormat('vi-VN').format(next));
                      }}
                      className="touch-btn text-[11px] font-bold py-1 px-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-white/6 cursor-pointer"
                    >
                      +{val >= 1000000 ? `${val / 1000000}tr` : `${val / 1000}k`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CÁC THÔNG TIN PHỤ: NGÀY, GIỜ, GHI CHÚ NHANH */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/6 w-full min-w-0">
            <div className="min-w-0">
              <label className="text-[10px] text-slate-400 font-semibold block mb-1 truncate">Ngày chạy</label>
              <DatePicker value={date} onChange={setDate} compact className="w-full" />
            </div>

            <div className="min-w-0">
              <label className="text-[10px] text-slate-400 font-semibold block mb-1 truncate">Giờ hoàn thành</label>
              <div className="relative h-11 px-3 rounded-2xl bg-slate-900 border border-white/8 hover:border-sky-400/50 flex items-center gap-2 w-full min-w-0">
                <Clock size={15} className="text-amber-400 shrink-0" />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="input-ios text-xs font-bold py-0 w-full bg-transparent border-none text-slate-100 outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {mode !== 'TRANSFER' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {['GrabBike', 'GrabCar', 'GrabFood', 'GrabExpress', 'Tiền tip thêm'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTag(t)}
                    className={`py-1 px-2.5 rounded-full text-[11px] font-bold border cursor-pointer transition-colors ${
                      tag === t
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-950 text-slate-400 border-white/6 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú thêm (khách bo, lộ trình...)..."
                maxLength={100}
                className="input-ios text-xs py-2 bg-slate-950 border-white/10"
              />
            </div>
          )}
        </div>

        {/* FOOTER NÚT BẤM CỐ ĐỊNH Ở ĐÁY */}
        <div className="p-4 border-t border-white/8 bg-slate-950 shrink-0 flex items-center gap-2">
          {mode === 'TRANSFER' ? (
            <button
              type="button"
              disabled={isSubmitting || transferAmount <= 0}
              onClick={handleSubmitTransfer}
              className="touch-btn h-12 flex-1 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-sm flex items-center justify-center gap-1.5 cursor-pointer border-none shadow-lg disabled:opacity-50"
            >
              {isSubmitting ? 'Đang thực hiện...' : 'Xác nhận chuyển tiền'}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmitTrip(true)}
                className="touch-btn h-12 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-extrabold text-xs flex items-center justify-center gap-1 cursor-pointer border border-emerald-500/30 shrink-0 disabled:opacity-50"
                title="Lưu cuốc này và giữ form để nhập tiếp cuốc sau"
              >
                + Lưu & Ghi tiếp
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmitTrip(false)}
                className="touch-btn h-12 flex-1 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer border-none shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                <MotorcycleIcon size={20} strokeWidth={2.2} />
                <span>{isSubmitting ? 'Đang lưu...' : 'Lưu cuốc GrabBike'}</span>
              </button>
            </>
          )}
        </div>

      {/* Bàn phím số Numpad ảo Web cho thiết bị di động */}
      {activeNumpadField && numpadInfo && (
        <NumpadBottomSheet
          isOpen={!!activeNumpadField}
          onClose={() => setActiveNumpadField(null)}
          amountStr={numpadInfo.amountStr}
          computedAmount={numpadInfo.computedAmount}
          hasOperator={/[+\-*/]/.test(numpadInfo.amountStr)}
          onKeyPress={handleNumpadKeyPress}
          badgeLabel={numpadInfo.badgeLabel}
          badgeStyle={numpadInfo.badgeStyle}
          amountColor={numpadInfo.amountColor}
        />
      )}
    </div>
  );
};
