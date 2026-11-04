// src/components/ui/DateRangePicker.tsx
import React, { useState, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, ArrowRight } from 'lucide-react';
import { getCurrentDate } from '../../utils/formatters';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

interface DateRangePickerProps {
  startDate: string;
  endDate?: string;
  onChange: (range: DateRange) => void;
  label?: string;
  className?: string;
}

function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDMY(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function calcDaysBetween(startStr: string, endStr: string): number {
  const s = parseDate(startStr);
  const e = parseDate(endStr);
  const diffTime = e.getTime() - s.getTime();
  return Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1);
}

function addDaysToStr(startStr: string, days: number): string {
  const s = parseDate(startStr);
  s.setDate(s.getDate() + days);
  return formatDateStr(s);
}

function getEndOfMonth(dateStr: string): string {
  const d = parseDate(dateStr);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return formatDateStr(lastDay);
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  label = 'Thời gian diễn ra (Bắt đầu ➔ Kết thúc)',
  className = ''
}) => {
  const [open, setOpen] = useState(false);

  // States chọn dải ngày nội bộ
  const [tempStart, setTempStart] = useState<string>(startDate || getCurrentDate());
  const [tempEnd, setTempEnd] = useState<string | undefined>(endDate);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [step, setStep] = useState<'START' | 'END'>('START');

  // Tháng và năm đang hiển thị trên Lịch
  const initialDate = parseDate(startDate || getCurrentDate());
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth()); // 0-11

  const todayStr = getCurrentDate();

  // Đồng bộ lại khi props thay đổi hoặc khi mở Popover
  useEffect(() => {
    if (open) {
      setTempStart(startDate || todayStr);
      setTempEnd(endDate);
      setStep('START');
      setHoverDate(null);
      const d = parseDate(startDate || todayStr);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [open, startDate, endDate, todayStr]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleSelectDay = (dateStr: string) => {
    if (step === 'START') {
      // Click lần 1: chọn ngày bắt đầu
      setTempStart(dateStr);
      setTempEnd(undefined);
      setStep('END');
    } else {
      // step === 'END': chọn ngày kết thúc
      if (dateStr < tempStart) {
        // Nếu bấm ngày nhỏ hơn ngày bắt đầu -> Đổi ngày này làm ngày bắt đầu mới
        setTempStart(dateStr);
        setTempEnd(undefined);
        // Vẫn giữ step === 'END' để user bấm tiếp ngày kết thúc
      } else {
        // dateStr >= tempStart -> Hoàn tất dải ngày!
        setTempEnd(dateStr);
        setStep('START');

        onChange({
          startDate: tempStart,
          endDate: dateStr
        });

        // Tự động đóng sau khi hoàn tất chọn dải ngày
        setTimeout(() => {
          setOpen(false);
        }, 220);
      }
    }
  };

  // Nút phím tắt nhanh (Antd presets)
  const applyPreset = (preset: 'TODAY' | '7D' | '30D' | 'END_MONTH' | 'NO_END') => {
    const base = tempStart || todayStr;
    if (preset === 'TODAY') {
      setTempStart(todayStr);
      setTempEnd(todayStr);
      onChange({ startDate: todayStr, endDate: todayStr });
    } else if (preset === '7D') {
      const e = addDaysToStr(base, 6);
      setTempEnd(e);
      onChange({ startDate: base, endDate: e });
    } else if (preset === '30D') {
      const e = addDaysToStr(base, 29);
      setTempEnd(e);
      onChange({ startDate: base, endDate: e });
    } else if (preset === 'END_MONTH') {
      const e = getEndOfMonth(base);
      setTempEnd(e);
      onChange({ startDate: base, endDate: e });
    } else if (preset === 'NO_END') {
      setTempEnd(undefined);
      onChange({ startDate: base, endDate: undefined });
    }
    setStep('START');
    setTimeout(() => {
      setOpen(false);
    }, 200);
  };

  // Tính số ngày trong tháng viewMonth
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  // Điều chỉnh để bắt đầu từ Thứ 2 (0: T2, ..., 6: CN)
  const adjustedFirstDay = (firstDayOfWeek + 6) % 7;

  // Xác định khoảng hiển thị highlight (Active Range hoặc Hover Preview)
  const activeEnd = step === 'END' && hoverDate && hoverDate >= tempStart ? hoverDate : tempEnd;
  const hasRange = Boolean(tempStart && activeEnd);

  const rangeMin = tempStart;
  const rangeMax = activeEnd || tempStart;

  const durationDays = tempStart && tempEnd ? calcDaysBetween(tempStart, tempEnd) : null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`relative p-3 rounded-2xl bg-slate-900 border border-white/8 hover:border-emerald-400/50 flex items-center justify-between text-left transition-all cursor-pointer outline-none focus:ring-2 focus:ring-emerald-500/40 w-full ${className}`}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {label}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs font-bold text-white">
              <span className="bg-slate-800/80 px-2 py-0.5 rounded-lg border border-white/10">
                {formatDMY(startDate)}
              </span>
              <ArrowRight size={13} className="text-emerald-400 shrink-0" />
              {endDate ? (
                <span className="bg-slate-800/80 px-2 py-0.5 rounded-lg border border-white/10">
                  {formatDMY(endDate)}
                </span>
              ) : (
                <span className="text-slate-500 font-normal italic text-[11px]">
                  Không hạn chót
                </span>
              )}
            </div>
            <div className="text-[10px] text-emerald-400 font-medium mt-1 flex items-center gap-1.5">
              {endDate ? (
                <span>Kéo dài {calcDaysBetween(startDate, endDate)} ngày</span>
              ) : (
                <span className="text-slate-400">Chỉ tính từ ngày bắt đầu (Bấm để chọn dải ngày)</span>
              )}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 ml-2 shadow-sm">
            <CalendarIcon size={16} />
          </div>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="z-[90] w-[320px] max-w-[calc(100vw-24px)] bg-slate-900/98 backdrop-blur-xl border border-white/12 rounded-2xl shadow-2xl p-4 text-slate-100 animate-fade-in outline-none focus:outline-none"
        >
          {/* Antd Style: Range Display Header (Có thể bấm để chọn lại Bắt đầu / Kết thúc) */}
          <div className="bg-slate-950/70 rounded-xl p-2.5 border border-white/8 mb-3">
            <div className="flex items-center justify-between text-xs font-semibold gap-1.5">
              <button
                type="button"
                onClick={() => setStep('START')}
                className={`flex-1 text-center py-1.5 px-2 rounded-lg transition-all cursor-pointer border ${
                  step === 'START'
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold border-emerald-500/50 shadow-sm'
                    : 'bg-slate-900/50 text-slate-300 border-white/6 hover:bg-slate-800'
                }`}
              >
                <div className="text-[9px] text-slate-400 uppercase">Bắt đầu</div>
                <div className="text-xs font-bold text-white">{formatDMY(tempStart) || '--/--/----'}</div>
              </button>

              <ArrowRight size={14} className="text-emerald-400 shrink-0" />

              <button
                type="button"
                onClick={() => setStep('END')}
                className={`flex-1 text-center py-1.5 px-2 rounded-lg transition-all cursor-pointer border ${
                  step === 'END'
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold border-emerald-500/50 shadow-sm'
                    : 'bg-slate-900/50 text-slate-300 border-white/6 hover:bg-slate-800'
                }`}
              >
                <div className="text-[9px] text-slate-400 uppercase">Kết thúc</div>
                <div className="text-xs font-bold text-white">
                  {tempEnd ? formatDMY(tempEnd) : step === 'END' ? 'Chọn ngày...' : 'Chưa đặt'}
                </div>
              </button>
            </div>

            {/* Trạng thái hướng dẫn */}
            <div className="text-[10px] text-center mt-2 font-medium flex items-center justify-center gap-1">
              {step === 'START' ? (
                <span className="text-emerald-400">
                  {durationDays ? `✨ Đã chọn: ${durationDays} ngày (Bấm ngày để chọn lại)` : '👉 Bấm ngày để chọn ngày bắt đầu'}
                </span>
              ) : (
                <span className="text-amber-300 animate-pulse">
                  👉 Bấm tiếp ngày để chọn ngày kết thúc
                </span>
              )}
            </div>
          </div>

          {/* Quick Presets (Nút tắt nhanh kiểu Antd) */}
          <div className="flex items-center gap-1.5 flex-wrap pb-2.5 border-b border-white/10 mb-3">
            <button
              type="button"
              onClick={() => applyPreset('7D')}
              className="py-1 px-2.5 rounded-lg text-[11px] font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
            >
              7 ngày
            </button>
            <button
              type="button"
              onClick={() => applyPreset('30D')}
              className="py-1 px-2.5 rounded-lg text-[11px] font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
            >
              30 ngày
            </button>
            <button
              type="button"
              onClick={() => applyPreset('END_MONTH')}
              className="py-1 px-2.5 rounded-lg text-[11px] font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
            >
              Hết tháng
            </button>
            <button
              type="button"
              onClick={() => applyPreset('NO_END')}
              className="py-1 px-2.5 rounded-lg text-[11px] font-semibold bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-all cursor-pointer ml-auto"
            >
              Không hạn chót
            </button>
          </div>

          {/* Điều hướng Tháng & Năm */}
          <div className="flex items-center justify-between mb-2.5 px-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-xs font-bold text-white tracking-wide">
              Tháng {viewMonth + 1}, {viewYear}
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Tiêu đề các thứ trong tuần */}
          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 mb-1.5">
            <div>T2</div>
            <div>T3</div>
            <div>T4</div>
            <div>T5</div>
            <div>T6</div>
            <div className="text-amber-400">T7</div>
            <div className="text-rose-400">CN</div>
          </div>

          {/* Lưới các ngày với dải kết nối Antd Range */}
          <div className="grid grid-cols-7 text-center">
            {/* Các ô trống đầu tháng */}
            {Array.from({ length: adjustedFirstDay }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-8" />
            ))}

            {/* Các ngày trong tháng */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const mStr = String(viewMonth + 1).padStart(2, '0');
              const dStr = String(day).padStart(2, '0');
              const dateStr = `${viewYear}-${mStr}-${dStr}`;

              const colIndex = (adjustedFirstDay + idx) % 7;
              const isFirstCol = colIndex === 0;
              const isLastCol = colIndex === 6;

              const isStart = dateStr === rangeMin;
              const isEnd = dateStr === rangeMax && hasRange;
              const isInRange = hasRange && dateStr > rangeMin && dateStr < rangeMax;
              const isToday = dateStr === todayStr;

              return (
                <div
                  key={day}
                  className="relative h-8 flex items-center justify-center p-0"
                  onMouseEnter={() => {
                    if (step === 'END') {
                      setHoverDate(dateStr);
                    }
                  }}
                >
                  {/* Dải nền Range Highlight kiểu Ant Design */}
                  {isInRange && (
                    <div
                      className={`absolute inset-y-1 inset-x-0 bg-emerald-500/20 pointer-events-none ${
                        isFirstCol ? 'rounded-l-lg' : ''
                      } ${isLastCol ? 'rounded-r-lg' : ''}`}
                    />
                  )}
                  {isStart && hasRange && rangeMin !== rangeMax && (
                    <div className="absolute inset-y-1 left-1/2 right-0 bg-emerald-500/20 pointer-events-none" />
                  )}
                  {isEnd && hasRange && rangeMin !== rangeMax && (
                    <div className="absolute inset-y-1 left-0 right-1/2 bg-emerald-500/20 pointer-events-none" />
                  )}

                  {/* Nút bấm chọn ngày */}
                  <button
                    type="button"
                    onClick={() => handleSelectDay(dateStr)}
                    className={`relative z-10 h-7 w-7 rounded-xl text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                      isStart || isEnd
                        ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30 scale-105'
                        : isInRange
                        ? 'text-emerald-200 font-bold hover:bg-emerald-500/30'
                        : isToday
                        ? 'bg-slate-800 text-emerald-400 font-bold border border-emerald-400/50 hover:bg-slate-700'
                        : 'text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {day}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer nút hành động */}
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                setTempStart(todayStr);
                setTempEnd(undefined);
                onChange({ startDate: todayStr, endDate: undefined });
                setOpen(false);
              }}
              className="text-[11px] text-slate-400 hover:text-slate-200 font-medium cursor-pointer"
            >
              Đặt lại
            </button>
            <button
              type="button"
              onClick={() => {
                onChange({ startDate: tempStart, endDate: tempEnd });
                setOpen(false);
              }}
              className="py-1 px-3 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer hover:bg-emerald-400 transition-colors shadow-sm"
            >
              <Check size={14} /> Hoàn tất
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
