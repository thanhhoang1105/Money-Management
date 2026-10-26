// src/components/GrabTripModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  Car,
  X,
  Settings2,
  Check,
  CreditCard,
  Banknote,
  ArrowRightLeft,
  Sparkles,
  Gift,
  RefreshCw
} from 'lucide-react';
import { formatVND, getCurrentDate, getCurrentTime } from '../utils/formatters';
import { DatePicker } from './ui/DatePicker';
import { CustomSelect } from './ui/CustomSelect';
import {
  getGrabWalletsConfig,
  saveGrabWalletsConfig,
  createDefaultGrabWallets,
  recordGrabTrip,
  migrateLegacyGrabTransactions
} from '../services/grabService';
import { transferFunds } from '../services/transactionService';

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
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];

  const [mode, setMode] = useState<GrabMode>('CASH');

  // Input states
  const [cashReceivedInput, setCashReceivedInput] = useState<string>('');
  const [netIncomeInput, setNetIncomeInput] = useState<string>('');
  const [tipAmountInput, setTipAmountInput] = useState<string>('');
  const [tipType, setTipType] = useState<'CASH' | 'IN_APP'>('CASH');
  const [date, setDate] = useState<string>(getCurrentDate());
  const [time, setTime] = useState<string>(getCurrentTime());
  const [note, setNote] = useState<string>('');
  const [tag, setTag] = useState<string>('GrabBike');

  // Transfer states
  const [transferAction, setTransferAction] = useState<GrabTransferAction>('TOPUP_CREDIT');
  const [transferAmountInput, setTransferAmountInput] = useState<string>('');
  const [bankWalletId, setBankWalletId] = useState<string>('');

  // Wallets config
  const [creditWalletId, setCreditWalletId] = useState<string>('');
  const [grabCashWalletId, setGrabCashWalletId] = useState<string>('');
  const [physicalCashWalletId, setPhysicalCashWalletId] = useState<string>('');
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Load configuration & tự động chuẩn hóa cuốc Grab cũ về Vốn lưu động
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        await migrateLegacyGrabTransactions();
      } catch {
        // Im lặng nếu đã được chuẩn hóa trước đó
      }
      const config = await getGrabWalletsConfig();
      setCreditWalletId(config.creditWalletId);
      setGrabCashWalletId(config.grabCashWalletId);
      setPhysicalCashWalletId(config.physicalCashWalletId);
      if (!config.isReady) {
        setIsConfigOpen(true);
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

  // Parse numerical inputs
  const cashReceived = useMemo(() => {
    const raw = Number(cashReceivedInput.replace(/\D/g, ''));
    return Number.isFinite(raw) ? raw : 0;
  }, [cashReceivedInput]);

  const netIncome = useMemo(() => {
    const raw = Number(netIncomeInput.replace(/\D/g, ''));
    return Number.isFinite(raw) ? raw : 0;
  }, [netIncomeInput]);

  const tipAmount = useMemo(() => {
    const raw = Number(tipAmountInput.replace(/\D/g, ''));
    return Number.isFinite(raw) ? raw : 0;
  }, [tipAmountInput]);

  const transferAmount = useMemo(() => {
    const raw = Number(transferAmountInput.replace(/\D/g, ''));
    return Number.isFinite(raw) ? raw : 0;
  }, [transferAmountInput]);

  // Vốn lưu động Grab khấu trừ từ ví tín dụng (bù bằng tiền mặt khách đưa)
  const workingCapital = useMemo(() => {
    if (mode !== 'CASH') return 0;
    const isCashTip = tipAmount > 0 && tipType === 'CASH';
    const tripFare = isCashTip ? Math.max(0, cashReceived - tipAmount) : cashReceived;
    return Math.max(0, tripFare - netIncome);
  }, [mode, cashReceived, netIncome, tipAmount, tipType]);

  // Thu nhập thực tế tài xế giữ được từ cuốc xe
  const totalEarned = useMemo(() => {
    return netIncome + tipAmount;
  }, [netIncome, tipAmount]);

  // Thông tin ví đang dùng
  const creditWallet = wallets.find((w) => w.id === creditWalletId);
  const grabCashWallet = wallets.find((w) => w.id === grabCashWalletId);
  const physicalCashWallet = wallets.find((w) => w.id === physicalCashWalletId);

  // Tạo nhanh 2 ví Grab mẫu
  const handleAutoCreateWallets = async () => {
    try {
      const { creditWallet: cw, grabCashWallet: gw } = await createDefaultGrabWallets();
      setCreditWalletId(cw.id);
      setGrabCashWalletId(gw.id);

      // Tìm ví tiền mặt ngoài đời
      const cash = wallets.find((w) => w.type === 'CASH');
      if (cash) {
        setPhysicalCashWalletId(cash.id);
        await saveGrabWalletsConfig({
          creditWalletId: cw.id,
          grabCashWalletId: gw.id,
          physicalCashWalletId: cash.id
        });
      }

      setFeedback('Đã tạo 2 ví Grab mẫu thành công!');
      setIsConfigOpen(false);
      setTimeout(() => setFeedback(''), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tạo ví Grab');
    }
  };

  // Lưu cấu hình ví
  const handleSaveConfig = async () => {
    await saveGrabWalletsConfig({
      creditWalletId,
      grabCashWalletId,
      physicalCashWalletId
    });
    setIsConfigOpen(false);
    setFeedback('Đã cập nhật liên kết ví Grab!');
    setTimeout(() => setFeedback(''), 2500);
  };

  // Nút chạy chuẩn hóa cuốc cũ thủ công
  const handleManualMigrate = async () => {
    try {
      const count = await migrateLegacyGrabTransactions();
      if (count > 0) {
        setFeedback(`Đã chuẩn hóa ${count} cuốc Grab cũ về Vốn lưu động & Thu nhập ròng!`);
      } else {
        setFeedback('Dữ liệu các cuốc Grab đã chuẩn 100%!');
      }
      setTimeout(() => setFeedback(''), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi khi chuẩn hóa');
    }
  };

  // Cộng nhanh tiền vào ô đang chọn
  const handleQuickAddAmount = (add: number, target: 'CASH_RECEIVED' | 'NET_INCOME' | 'TIP') => {
    if (target === 'CASH_RECEIVED') {
      const next = cashReceived + add;
      setCashReceivedInput(new Intl.NumberFormat('vi-VN').format(next));
    } else if (target === 'NET_INCOME') {
      const next = netIncome + add;
      setNetIncomeInput(new Intl.NumberFormat('vi-VN').format(next));
    } else {
      const next = tipAmount + add;
      setTipAmountInput(new Intl.NumberFormat('vi-VN').format(next));
    }
  };

  // Áp dụng ước tính nhanh tỷ lệ % thu nhập ròng thông dụng của Grab (chiết khấu ~25-28%)
  const handleQuickEstimateNet = (percent: number) => {
    if (cashReceived <= 0) return;
    const isCashTip = tipAmount > 0 && tipType === 'CASH';
    const tripFare = isCashTip ? Math.max(0, cashReceived - tipAmount) : cashReceived;
    const estimated = Math.round((tripFare * percent) / 1000) * 1000;
    setNetIncomeInput(new Intl.NumberFormat('vi-VN').format(estimated));
  };

  // Lưu cuốc Grab
  const handleSubmitTrip = async (keepOpen = false) => {
    setErrorMsg('');
    if (!creditWalletId || !grabCashWalletId || !physicalCashWalletId) {
      setErrorMsg('Vui lòng hoàn tất cấu hình 3 ví trước khi ghi cuốc');
      setIsConfigOpen(true);
      return;
    }

    if (mode === 'CASH') {
      if (cashReceived <= 0) {
        setErrorMsg('Vui lòng nhập tiền mặt khách trả lớn hơn 0');
        return;
      }
      if (netIncome <= 0) {
        setErrorMsg('Vui lòng nhập thu nhập ròng lớn hơn 0');
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
        cashReceived,
        netIncome,
        tipAmount,
        tipType,
        creditWalletId,
        grabCashWalletId,
        physicalCashWalletId,
        date,
        time,
        note: fullNote
      });

      const successText =
        mode === 'CASH'
          ? `Đã ghi cuốc Grab tiền mặt: +${formatVND(res.totalEarned)} thu nhập thực nhận (Vốn luân chuyển: ${formatVND(res.workingCapital)})`
          : `Đã ghi cuốc Grab thẻ: +${formatVND(res.totalEarned)} vào Ví Tiền Mặt Grab`;

      if (onSuccess) onSuccess(successText);

      if (keepOpen) {
        // Reset form để tài xế nhập tiếp cuốc sau
        setCashReceivedInput('');
        setNetIncomeInput('');
        setTipAmountInput('');
        setNote('');
        setTime(getCurrentTime());
        setFeedback(successText);
        setTimeout(() => setFeedback(''), 3000);
      } else {
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg max-h-[92dvh] sm:max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden">
        {/* HEADER MODAL */}
        <div className="p-4 border-b border-white/8 flex items-center justify-between bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Car size={20} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold text-slate-100 uppercase tracking-wide m-0">
                  Nghiệp Vụ Chạy Grab
                </h2>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Tài xế 4.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 m-0 mt-0.5">
                Tự động chia tiền mặt bỏ túi & ví tín dụng app
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className={`p-2 rounded-xl border cursor-pointer transition-colors ${
                isConfigOpen
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                  : 'bg-slate-800 border-white/8 text-slate-400 hover:text-white'
              }`}
              title="Cài đặt liên kết ví Grab"
            >
              <Settings2 size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 border border-white/8 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* NỘI DUNG CUỘN CHÍNH */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3.5">
          {/* Thông báo phản hồi */}
          {feedback && (
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold text-center animate-fade-in flex items-center justify-center gap-1.5">
              <Check size={14} strokeWidth={3} />
              <span>{feedback}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold text-center animate-fade-in">
              {errorMsg}
            </div>
          )}

          {/* KHUNG CÀI ĐẶT LIÊN KẾT VÍ GRAB */}
          {isConfigOpen && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-sky-500/30 flex flex-col gap-3 animate-fade-in text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sky-400 uppercase tracking-wide flex items-center gap-1.5">
                  <Settings2 size={14} /> Cấu hình 3 ví của Tài xế
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

              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    1. Ví Tín Dụng Grab (để Grab trừ chiết khấu cuốc xe):
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
                  <label className="text-[11px] text-slate-400 block mb-1">
                    2. Ví Tiền Mặt Grab (tiền cuốc thẻ & rút về bank):
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

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    3. Ví Tiền Mặt ngoài đời (tiền giấy cầm trong túi):
                  </label>
                  <CustomSelect
                    value={physicalCashWalletId}
                    onChange={setPhysicalCashWalletId}
                    options={wallets.map((w) => ({
                      value: w.id,
                      label: `${w.name} (${formatVND(w.balance)})`
                    }))}
                    placeholder="Chọn ví Tiền Mặt ngoài đời..."
                    triggerClassName="py-2 text-xs bg-slate-900 border-white/10"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center gap-2 pt-2 border-t border-white/6">
                <button
                  type="button"
                  onClick={handleManualMigrate}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-semibold cursor-pointer border border-sky-500/20 text-xs flex items-center gap-1.5"
                  title="Chuyển đổi toàn bộ cuốc Grab cũ sang chuẩn Vốn lưu động & Thu nhập ròng"
                >
                  <RefreshCw size={13} />
                  Chuẩn hóa cuốc cũ
                </button>
                <div className="flex gap-2">
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
                    Lưu cấu hình ví
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* THANH SỐ DƯ 3 VÍ TÀI XẾ NHANH */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-2xl bg-slate-950/70 border border-white/6">
              <span className="text-[10px] text-slate-400 block truncate">Ví Tín Dụng</span>
              <span className="text-xs font-black text-sky-400 truncate block mt-0.5">
                {creditWallet ? formatVND(creditWallet.balance) : 'Chưa chọn'}
              </span>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-950/70 border border-white/6">
              <span className="text-[10px] text-slate-400 block truncate">Ví TM Grab</span>
              <span className="text-xs font-black text-emerald-400 truncate block mt-0.5">
                {grabCashWallet ? formatVND(grabCashWallet.balance) : 'Chưa chọn'}
              </span>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-950/70 border border-white/6">
              <span className="text-[10px] text-slate-400 block truncate">Tiền túi ngoài đời</span>
              <span className="text-xs font-black text-amber-400 truncate block mt-0.5">
                {physicalCashWallet ? formatVND(physicalCashWallet.balance) : 'Chưa chọn'}
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
              <span>Thẻ / Ví</span>
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

          {/* NỘI DUNG 1: KHÁCH TRẢ TIỀN MẶT */}
          {mode === 'CASH' && (
            <div className="flex flex-col gap-3 animate-fade-in">
              {/* Ô 1: TIỀN MẶT KHÁCH ĐƯA */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-amber-500/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1">
                    <span>💵 Tiền mặt khách đưa</span>
                    <span className="text-[10px] text-slate-400 normal-case">(Vào túi bạn)</span>
                  </label>
                  {cashReceived > 0 && (
                    <button
                      type="button"
                      onClick={() => setCashReceivedInput('')}
                      className="text-[10px] text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  value={cashReceivedInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setCashReceivedInput(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                  }}
                  placeholder="0 ₫"
                  className="input-ios text-2xl font-black font-heading text-amber-400 py-1 bg-transparent border-none outline-none"
                />

                {/* Các nút bấm mệnh giá nhanh */}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/6">
                  {[20000, 30000, 50000, 100000, 200000, 500000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleQuickAddAmount(val, 'CASH_RECEIVED')}
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
                  <label className="text-xs font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1">
                    <span>✨ Thu nhập ròng cuốc xe</span>
                    <span className="text-[10px] text-slate-400 normal-case">(Hiển thị trên app Grab)</span>
                  </label>
                  {netIncome > 0 && (
                    <button
                      type="button"
                      onClick={() => setNetIncomeInput('')}
                      className="text-[10px] text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  value={netIncomeInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setNetIncomeInput(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                  }}
                  placeholder="0 ₫"
                  className="input-ios text-2xl font-black font-heading text-emerald-400 py-1 bg-transparent border-none outline-none"
                />

                {/* Ước tính nhanh tỷ lệ ròng nếu không muốn gõ */}
                {cashReceived > 0 && (
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

              {/* Ô 3: TIỀN TIP (TIỀN BO) */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-purple-500/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Gift size={15} className="text-purple-400" />
                    <label className="text-xs font-bold text-purple-300 uppercase tracking-wide">
                      Tiền Tip (Khách bo thêm)
                    </label>
                    <span className="text-[10px] text-purple-400/80 font-medium">
                      (Grab 100% không thu phí)
                    </span>
                  </div>
                  {tipAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => setTipAmountInput('')}
                      className="text-[10px] text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  value={tipAmountInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setTipAmountInput(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                  }}
                  placeholder="0 ₫ (nếu có khách bo thêm)"
                  className="input-ios text-xl font-bold font-heading text-purple-400 py-1 bg-transparent border-none outline-none"
                />

                {/* Các nút bấm tip nhanh */}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/6">
                  {[5000, 10000, 20000, 50000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleQuickAddAmount(val, 'TIP')}
                      className="touch-btn text-[11px] font-bold py-1 px-2.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/25 cursor-pointer"
                    >
                      +{val >= 1000 ? `${val / 1000}k` : val}
                    </button>
                  ))}
                </div>

                {tipAmount > 0 && (
                  <div className="flex flex-col gap-1.5 pt-1.5 border-t border-white/6">
                    <span className="text-[11px] text-slate-300 font-semibold">Khách đưa tip bằng cách nào?</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTipType('CASH')}
                        className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                          tipType === 'CASH'
                            ? 'bg-purple-500/20 border-purple-400 text-purple-200 font-bold'
                            : 'bg-slate-900 border-white/6 text-slate-400'
                        }`}
                      >
                        <div className="text-xs">💵 Khỏi thối / Đưa thêm</div>
                        <div className="text-[10px] text-slate-400">Đã gộp trong tiền mặt khách đưa</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipType('IN_APP')}
                        className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                          tipType === 'IN_APP'
                            ? 'bg-purple-500/20 border-purple-400 text-purple-200 font-bold'
                            : 'bg-slate-900 border-white/6 text-slate-400'
                        }`}
                      >
                        <div className="text-xs">📱 Khách tip qua app</div>
                        <div className="text-[10px] text-slate-400">Grab cộng vào Ví TM Grab</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* KHUNG TÓM TẮT PHÂN BỔ DÒNG TIỀN THỰC TẾ */}
              {(cashReceived > 0 || netIncome > 0) && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 flex flex-col gap-2 text-xs">
                  <div className="font-extrabold text-slate-200 flex items-center justify-between pb-1.5 border-b border-white/6">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={14} className="text-emerald-400" />
                      Phân bổ dòng tiền thực tế:
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                      Chuẩn kế toán
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-300 py-0.5">
                    <span className="text-slate-400">💵 Tiền mặt bỏ vào túi:</span>
                    <span className="font-extrabold text-amber-400 text-sm">+{formatVND(cashReceived)}</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-300 py-0.5">
                    <div className="flex flex-col">
                      <span className="text-slate-400">💼 Vốn lưu động luân chuyển:</span>
                      <span className="text-[10px] text-slate-500">
                        (Grab trừ Ví Tín Dụng ➔ Bù tiền mặt vào túi, KHÔNG tính chi tiêu)
                      </span>
                    </div>
                    <span className="font-extrabold text-sky-400 text-sm">
                      {workingCapital > 0 ? formatVND(workingCapital) : '0 ₫'}
                    </span>
                  </div>

                  {tipAmount > 0 && (
                    <div className="flex justify-between items-center text-slate-300 py-0.5">
                      <span className="text-purple-300">
                        🎁 Tiền tip ({tipType === 'CASH' ? 'tiền mặt' : 'trên app'}):
                      </span>
                      <span className="font-extrabold text-purple-400">
                        +{formatVND(tipAmount)}
                      </span>
                    </div>
                  )}

                  {cashReceived < netIncome && cashReceived > 0 && (
                    <div className="flex justify-between items-center text-slate-300 py-0.5">
                      <span className="text-slate-400">🎁 Grab trợ giá voucher vào ví app:</span>
                      <span className="font-extrabold text-sky-400">
                        +{formatVND(netIncome - cashReceived)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 mt-0.5 border-t border-white/8 font-extrabold">
                    <div className="flex flex-col">
                      <span className="text-slate-100 text-xs">✨ Thu nhập thực nhận (Ghi nhận Thu):</span>
                      <span className="text-[10px] text-emerald-400/80 font-normal">
                        Chỉ tính khoản dư ra kiếm được từ Grab
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

          {/* NỘI DUNG 2: KHÁCH TRẢ THẺ / VÍ */}
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
                      onClick={() => setNetIncomeInput('')}
                      className="text-[10px] text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  value={netIncomeInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setNetIncomeInput(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                  }}
                  placeholder="0 ₫"
                  className="input-ios text-2xl font-black font-heading text-emerald-400 py-1 bg-transparent border-none outline-none"
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
                  {tipAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => setTipAmountInput('')}
                      className="text-[10px] text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  value={tipAmountInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setTipAmountInput(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                  }}
                  placeholder="0 ₫ (Grab không thu phí tip)"
                  className="input-ios text-xl font-bold font-heading text-purple-400 py-1 bg-transparent border-none outline-none"
                />

                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/6">
                  {[5000, 10000, 20000, 50000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleQuickAddAmount(val, 'TIP')}
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
                  {tipAmount > 0 && (
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-purple-300">🎁 Tiền tip trên app (100%):</span>
                      <span className="font-extrabold text-purple-400">+{formatVND(tipAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">💵 Tiền mặt bỏ túi:</span>
                    <span className="font-medium text-slate-400">0 ₫ (khách trả thẻ)</span>
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
                <label className="text-xs font-bold text-sky-300 uppercase tracking-wide">
                  Số tiền chuyển (VNĐ)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={transferAmountInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setTransferAmountInput(
                      val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : ''
                    );
                  }}
                  placeholder="0 ₫"
                  className="input-ios text-2xl font-black font-heading text-sky-400 py-1 bg-transparent border-none outline-none"
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
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/6">
            <div>
              <label className="text-[10px] text-slate-400 font-semibold block mb-1">Ngày chạy</label>
              <DatePicker value={date} onChange={setDate} className="w-full text-xs" />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 font-semibold block mb-1">Giờ hoàn thành</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="input-ios text-xs py-2 w-full bg-slate-950 border-white/10 text-slate-200"
              />
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
                <Car size={18} strokeWidth={2.5} />
                <span>{isSubmitting ? 'Đang lưu...' : 'Lưu cuốc Grab'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
