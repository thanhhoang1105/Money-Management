// src/components/ui/MoneyInput.tsx
import React, { useState } from 'react';
import { Calculator } from 'lucide-react';
import type { TransactionType } from '../../types';
import { applyNumpadKey, evaluateExpression } from '../../utils/formatters';
import { NumpadBottomSheet } from '../NumpadBottomSheet';

export interface MoneyInputProps {
  value: string;
  onChange: (nextValue: string, numericValue: number) => void;
  placeholder?: string;
  type?: TransactionType;
  badgeLabel?: string;
  badgeStyle?: string;
  amountColor?: string;
  size?: 'lg' | 'md' | 'sm';
  returnRawDigits?: boolean;
  allowZeroDisplay?: boolean;
  unitSuffix?: string;
  currentWalletBalance?: number;
  className?: string;
  autoFocus?: boolean;
}

export const MoneyInput: React.FC<MoneyInputProps> = ({
  value,
  onChange,
  placeholder = '0',
  type = 'EXPENSE',
  badgeLabel,
  badgeStyle,
  amountColor = 'text-sky-400',
  size = 'lg',
  returnRawDigits = false,
  allowZeroDisplay = false,
  unitSuffix,
  currentWalletBalance,
  className = '',
  autoFocus = false
}) => {
  const [isNumpadOpen, setIsNumpadOpen] = useState(false);
  const [rawExpr, setRawExpr] = useState<string>('0');

  const rawDigits = (value || '').replace(/[^0-9]/g, '');
  const numericValue = Number(rawDigits) || 0;
  const hasExplicitZero = allowZeroDisplay && (value === '0' || rawDigits === '0');

  const formattedDisplay =
    numericValue > 0
      ? new Intl.NumberFormat('vi-VN').format(numericValue)
      : hasExplicitZero
      ? '0'
      : '';

  const activeRaw = isNumpadOpen
    ? rawExpr
    : numericValue > 0
    ? numericValue.toString()
    : '0';
  const hasOperator = /[+\-*/]/.test(activeRaw);
  const computedAmount = isNumpadOpen ? evaluateExpression(activeRaw) : numericValue;
  const adjustDiff =
    type === 'ADJUST' && currentWalletBalance !== undefined
      ? computedAmount - currentWalletBalance
      : 0;

  const emitChange = (val: number) => {
    if (val <= 0) {
      if (allowZeroDisplay) {
        onChange('0', 0);
      } else {
        onChange('', 0);
      }
      return;
    }
    if (returnRawDigits) {
      onChange(val.toString(), val);
    } else {
      onChange(new Intl.NumberFormat('vi-VN').format(val), val);
    }
  };

  const openNumpad = () => {
    setRawExpr(numericValue > 0 ? numericValue.toString() : '0');
    setIsNumpadOpen(true);
  };

  const handleCloseNumpad = () => {
    if (/[+\-*/]/.test(rawExpr)) {
      const evaluated = evaluateExpression(rawExpr);
      setRawExpr(evaluated > 0 ? evaluated.toString() : '0');
      emitChange(evaluated);
    }
    setIsNumpadOpen(false);
  };

  const handleKeyPress = (key: string) => {
    const nextRaw = applyNumpadKey(rawExpr, key);
    setRawExpr(nextRaw);
    const evaluated = evaluateExpression(nextRaw);
    emitChange(evaluated);
  };

  const sizeStyles = {
    lg: {
      mobileBox: 'py-2.5 px-3.5 rounded-2xl min-h-[50px]',
      desktopInput: `text-2xl font-black py-2.5 px-3.5 ${unitSuffix ? 'pr-12' : ''}`,
      textClass:
        formattedDisplay.length > 13
          ? 'text-lg font-black'
          : formattedDisplay.length > 10
          ? 'text-xl font-black'
          : 'text-2xl font-black'
    },
    md: {
      mobileBox: 'py-2 px-3 rounded-xl min-h-[44px]',
      desktopInput: `text-lg font-extrabold py-2 px-3 ${unitSuffix ? 'pr-12' : ''}`,
      textClass: 'text-lg font-extrabold'
    },
    sm: {
      mobileBox: 'py-1.5 px-2.5 rounded-xl min-h-[38px]',
      desktopInput: `text-xs font-extrabold py-2 px-2.5 ${unitSuffix ? 'pr-10' : ''}`,
      textClass: 'text-xs font-extrabold'
    }
  }[size];

  return (
    <div className={className}>
      {/* Mobile touch trigger (< md): chỉ dùng Numpad của web trên điện thoại */}
      <div
        role="button"
        tabIndex={0}
        onClick={openNumpad}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openNumpad();
          }
        }}
        className={`md:hidden flex items-center justify-between bg-slate-800/90 border ${
          isNumpadOpen
            ? 'border-sky-400 ring-2 ring-sky-400/20'
            : 'border-white/10 active:border-sky-400/60'
        } cursor-pointer transition-all ${sizeStyles.mobileBox}`}
      >
        <div className="flex flex-col min-w-0 flex-1 mr-2">
          {hasOperator && isNumpadOpen && (
            <span className="text-[11px] font-semibold text-sky-400 truncate">
              {activeRaw
                .replace(/\*/g, ' × ')
                .replace(/\//g, ' ÷ ')
                .replace(/\+/g, ' + ')
                .replace(/-/g, ' - ')}
            </span>
          )}
          {formattedDisplay ? (
            <span className={`font-heading ${sizeStyles.textClass} ${amountColor} truncate`}>
              {formattedDisplay}
              {unitSuffix ? (
                <span className="text-xs font-bold text-slate-400 ml-1">{unitSuffix}</span>
              ) : null}
            </span>
          ) : (
            <span
              className={`font-heading ${
                size === 'sm' ? 'text-xs font-semibold' : 'text-base font-bold'
              } text-slate-500 truncate`}
            >
              {placeholder}
            </span>
          )}
        </div>

        {size === 'sm' ? (
          <div className="flex items-center gap-1 text-[11px] text-sky-300 bg-sky-500/15 border border-sky-400/25 px-2 py-1 rounded-lg shrink-0 font-bold">
            <Calculator size={12} />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-sky-300 bg-sky-500/15 border border-sky-400/25 px-2.5 py-1 rounded-xl shrink-0 font-bold">
            <Calculator size={14} />
            <span>Bàn phím</span>
          </div>
        )}
      </div>

      {/* Desktop input (>= md): gõ phím trực tiếp bằng bàn phím máy tính, không mở Numpad */}
      <div className="hidden md:block relative">
        <input
          type="text"
          inputMode="numeric"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={formattedDisplay}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 12);
            const num = Number(raw) || 0;
            emitChange(num);
          }}
          className={`input-ios w-full font-heading ${sizeStyles.desktopInput} ${amountColor}`}
        />
        {unitSuffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
            {unitSuffix}
          </span>
        )}
      </div>

      <NumpadBottomSheet
        isOpen={isNumpadOpen}
        onClose={handleCloseNumpad}
        type={type}
        amountStr={activeRaw}
        computedAmount={computedAmount}
        hasOperator={hasOperator}
        onKeyPress={handleKeyPress}
        currentWalletBalance={currentWalletBalance}
        adjustDiff={adjustDiff}
        badgeLabel={badgeLabel}
        badgeStyle={badgeStyle}
        amountColor={amountColor}
        unitSuffix={unitSuffix}
      />
    </div>
  );
};

export default MoneyInput;
