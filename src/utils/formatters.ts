// src/utils/formatters.ts

/**
 * Định dạng số tiền sang chuẩn VNĐ (Ví dụ: 1.500.000 ₫)
 */
export function formatVND(amount: number): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(Math.round(amount));
  const formatted = new Intl.NumberFormat('vi-VN').format(absAmount);
  return `${isNegative ? '-' : ''}${formatted} ₫`;
}

/**
 * Lấy tháng hiện tại theo format YYYY-MM (Ví dụ: '2026-10')
 */
export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Lấy ngày hiện tại theo format YYYY-MM-DD
 */
export function getCurrentDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Lấy giờ hiện tại theo format HH:mm
 */
export function getCurrentTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Lấy tháng liền trước (Ví dụ: '2026-10' -> '2026-09')
 */
export function getPreviousMonth(monthStr: string): string {
  const [yearStr, mStr] = monthStr.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(mStr, 10) - 1;

  if (month === 0) {
    month = 12;
    year -= 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Hiển thị tiêu đề tháng (Ví dụ: "Tháng 10, 2026")
 */
export function formatMonthDisplay(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  return `Tháng ${parseInt(month, 10)}/${year}`;
}

/**
 * Định dạng ngày theo phong cách tiếng Việt dễ đọc (Ví dụ: "Hôm nay", "Hôm qua", hoặc "Thứ Năm, 18/10")
 */
export function formatFriendlyDate(dateStr: string): string {
  const today = getCurrentDate();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;

  if (dateStr === today) return 'Hôm nay';
  if (dateStr === yesterday) return 'Hôm qua';

  const date = new Date(dateStr + 'T00:00:00');
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayName = days[date.getDay()];
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');

  return `${dayName}, ${d}/${m}`;
}

/**
 * Lấy danh sách N tháng gần nhất kết thúc tại referenceMonth (Ví dụ: 6 tháng gần nhất)
 */
export function getLastNMonths(referenceMonth: string, count: number = 6): string[] {
  const [yearStr, mStr] = referenceMonth.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(mStr, 10);
  const months: string[] = [];

  for (let i = 0; i < count; i++) {
    months.unshift(`${year}-${String(month).padStart(2, '0')}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return months;
}

/**
 * Định dạng ngày hiển thị ngắn gọn kèm Hôm nay nếu trùng
 */
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const today = getCurrentDate();
  const [y, m, d] = dateStr.split('-');
  if (dateStr === today) {
    return `Hôm nay (${d}/${m})`;
  }
  return `${d}/${m}/${y}`;
}


/**
 * Tính toán an toàn giá trị biểu thức toán học (+, -, *, /)
 */
export function evaluateExpression(rawExpr: string): number {
  if (!rawExpr || rawExpr === '0') return 0;
  const cleaned = rawExpr.replace(/[+\-*/]+$/, '').trim();
  if (!cleaned) return 0;

  const sanitized = cleaned.replace(/[^0-9+\-*/.]/g, '');
  if (!sanitized) return 0;

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${sanitized})`)();
    if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
      return 0;
    }
    const rounded = Math.round(result);
    if (rounded < 0) return 0;
    if (rounded > 999_999_999_999) return 999_999_999_999;
    return rounded;
  } catch {
    return 0;
  }
}

/**
 * Xử lý phím bấm Numpad trên chuỗi số / biểu thức
 */
export function applyNumpadKey(currentStr: string, key: string): string {
  const str = currentStr || '0';

  if (key === 'C' || key === 'CLEAR') {
    return '0';
  }

  if (key === 'BACKSPACE') {
    if (str.length <= 1) {
      return '0';
    }
    const nextStr = str.slice(0, -1);
    return nextStr === '' ? '0' : nextStr;
  }

  const currentDigits = str.split(/[+\-*/]/).pop() || '';

  if (key === '000') {
    if (str === '0') return '0';
    if (/[+\-*/]$/.test(str)) return str;
    if (/[+\-*/]0$/.test(str)) return str;
    if (currentDigits.length > 9 || str.length >= 24) return str;
    return str + '000';
  }

  if (['+', '-', '×', '÷', '*', '/'].includes(key)) {
    const op = key === '×' ? '*' : key === '÷' ? '/' : key;
    if (str === '0') return '0';
    if (/[+\-*/]$/.test(str)) {
      return str.slice(0, -1) + op;
    }
    if (str.length >= 26) return str;
    return str + op;
  }

  if (key === '=') {
    const evaluated = evaluateExpression(str);
    return evaluated.toString();
  }

  // Chặn không cho nhập số vượt quá 12 chữ số để không tràn giao diện
  if (currentDigits.length >= 12) return str;

  if (str === '0') {
    if (key === '0') return '0';
    return key;
  }

  if (/[+\-*/]0$/.test(str)) {
    if (key === '0') return str;
    return str.slice(0, -1) + key;
  }

  if (str.length >= 28) return str;
  return str + key;
}
