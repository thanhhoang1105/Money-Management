import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDisplayDate } from '../../utils/formatters';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  label = 'Ngày ghi chép',
  className = ''
}) => {
  const [open, setOpen] = useState(false);

  // Parse YYYY-MM-DD
  const selectedDate = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState<number>(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(selectedDate.getMonth()); // 0-11

  const todayStr = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  const yesterdayStr = (() => {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

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

  const handleSelectDay = (day: number) => {
    const mStr = String(viewMonth + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const newDateStr = `${viewYear}-${mStr}-${dStr}`;
    onChange(newDateStr);
    setOpen(false);
  };

  // Tính số ngày trong tháng viewMonth
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Ngày đầu tiên của tháng là thứ mấy (0: CN, 1: T2, ..., 6: T7)
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  // Điều chỉnh để bắt đầu từ Thứ 2 (0: T2, 1: T3, ..., 6: CN)
  const adjustedFirstDay = (firstDayOfWeek + 6) % 7;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`relative p-3 rounded-2xl bg-slate-900 border border-white/8 hover:border-sky-400/50 flex items-center justify-between text-left transition-all cursor-pointer outline-none focus:ring-2 focus:ring-sky-500/40 ${className}`}
        >
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {label}
            </div>
            <div className="text-xs font-bold text-white mt-0.5">
              {formatDisplayDate(value)}
            </div>
            <div className="text-[10px] text-sky-400 font-medium mt-0.5">
              {value === todayStr ? 'Hôm nay' : value === yesterdayStr ? 'Hôm qua' : 'Bấm để đổi'}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0 ml-1.5 shadow-sm">
            <CalendarIcon size={16} />
          </div>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="z-[90] w-[310px] bg-slate-900/98 backdrop-blur-xl border border-white/12 rounded-2xl shadow-2xl p-4 text-slate-100 animate-fade-in outline-none focus:outline-none"
        >
          {/* Phím tắt nhanh */}
          <div className="flex items-center gap-1.5 pb-3 border-b border-white/10 mb-3">
            <button
              type="button"
              onClick={() => {
                onChange(todayStr);
                const t = new Date();
                setViewYear(t.getFullYear());
                setViewMonth(t.getMonth());
                setOpen(false);
              }}
              className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                value === todayStr
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(yesterdayStr);
                const t = new Date();
                t.setDate(t.getDate() - 1);
                setViewYear(t.getFullYear());
                setViewMonth(t.getMonth());
                setOpen(false);
              }}
              className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                value === yesterdayStr
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Hôm qua
            </button>
          </div>

          {/* Điều hướng Tháng & Năm */}
          <div className="flex items-center justify-between mb-3 px-1">
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

          {/* Tên các thứ trong tuần (T2 - CN) */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-2">
            <div>T2</div>
            <div>T3</div>
            <div>T4</div>
            <div>T5</div>
            <div>T6</div>
            <div className="text-amber-400">T7</div>
            <div className="text-rose-400">CN</div>
          </div>

          {/* Lưới các ngày */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {/* Ô trống trước ngày đầu tháng */}
            {Array.from({ length: adjustedFirstDay }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-8" />
            ))}

            {/* Các ngày trong tháng */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const mStr = String(viewMonth + 1).padStart(2, '0');
              const dStr = String(day).padStart(2, '0');
              const dateStr = `${viewYear}-${mStr}-${dStr}`;
              const isSelected = dateStr === value;
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-8 w-8 mx-auto rounded-xl text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-sky-500 text-white font-bold shadow-md shadow-sky-500/30 ring-2 ring-sky-300/40'
                      : isToday
                      ? 'bg-slate-800 text-sky-400 font-bold border border-sky-400/40 hover:bg-slate-700'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
