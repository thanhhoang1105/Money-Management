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
