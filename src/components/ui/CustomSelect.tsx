// src/components/ui/CustomSelect.tsx
import React, { useState, useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  groups,
  placeholder = 'Chọn...',
  className = '',
  triggerClassName = '',
  disabled = false
}) => {
  const [open, setOpen] = useState(false);

  const allOptions: SelectOption[] = useMemo(() => {
    if (groups) {
      return groups.flatMap((g) => g.options);
    }
    return options || [];
  }, [groups, options]);

  const selectedOption = allOptions.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  return (
    <div className={`relative ${className}`}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-slate-900 border border-white/10 hover:border-sky-400/50 text-xs sm:text-sm text-slate-100 transition-all cursor-pointer outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-50 disabled:cursor-not-allowed ${triggerClassName}`}
          >
            <div className="flex items-center gap-2 truncate min-w-0">
              {selectedOption?.icon}
              <span
                className={`truncate ${
                  !selectedOption ? 'text-slate-500' : 'text-slate-100 font-medium'
                }`}
              >
                {displayLabel}
              </span>
            </div>
            <ChevronDown
              size={15}
              className={`text-slate-400 shrink-0 transition-transform duration-200 ${
                open ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[200px] max-h-64 overflow-y-auto rounded-2xl bg-slate-900 border border-white/10 shadow-2xl p-1.5 backdrop-blur-md animate-fade-in"
          >
            {groups ? (
              groups.map((group, gIdx) => (
                <div key={group.label || gIdx} className="mb-2 last:mb-0">
                  {group.label && (
                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
                      {group.label}
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5">
                    {group.options.map((opt) => {
                      const isSelected = opt.value === value;
                      return (
                        <div
                          key={opt.value}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            onChange(opt.value);
                            setOpen(false);
                          }}
                          className={`touch-btn flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm cursor-pointer select-none transition-colors ${
                            isSelected
                              ? 'bg-sky-500/20 text-sky-400 font-bold border border-sky-500/30'
                              : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate min-w-0">
                            {opt.icon}
                            <span className="truncate">{opt.label}</span>
                          </div>
                          {isSelected && <Check size={14} className="text-sky-400 shrink-0 ml-2" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col gap-0.5">
                {allOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <div
                      key={opt.value}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={`touch-btn flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm cursor-pointer select-none transition-colors ${
                        isSelected
                          ? 'bg-sky-500/20 text-sky-400 font-bold border border-sky-500/30'
                          : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate min-w-0">
                        {opt.icon}
                        <span className="truncate">{opt.label}</span>
                      </div>
                      {isSelected && <Check size={14} className="text-sky-400 shrink-0 ml-2" />}
                    </div>
                  );
                })}
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
};
