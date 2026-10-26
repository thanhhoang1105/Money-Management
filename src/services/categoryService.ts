// src/services/categoryService.ts
import { db } from '../db';
import type { Category } from '../types';

/**
 * Bảng màu preset 24 màu cao cấp được chọn lọc kỹ lưỡng:
 * Đầy đủ các dải sắc độ Đậm / Chuẩn / Nhạt của:
 * - Đỏ (Crimson / Red / Coral)
 * - Cam (Rust / Orange / Peach)
 * - Vàng (Amber / Yellow)
 * - Xanh lá (Forest / Emerald / Lime)
 * - Xanh ngọc (Dark Teal / Teal / Cyan)
 * - Xanh dương (Navy / Royal / Sky)
 * - Tím (Indigo / Violet / Lavender)
 * - Hồng (Berry / Pink / Rose Pastel)
 * - Xám (Slate Dark / Slate Light)
 */
export const COLOR_PRESETS = [
  // 1. Nhóm Đỏ (Red: Đậm - Chuẩn - Nhạt)
  '#991B1B', // Đỏ mận / Đô đậm
  '#EF4444', // Đỏ tươi chuẩn
  '#F87171', // Đỏ san hô nhạt

  // 2. Nhóm Cam (Orange: Đậm - Tươi - Nhạt)
  '#C2410C', // Cam đất / Gạch nung
  '#F97316', // Cam tươi chuẩn
  '#FB923C', // Cam đào / Mơ nhạt

  // 3. Nhóm Vàng & Hổ phách (Yellow: Đậm - Tươi)
  '#F59E0B', // Vàng hổ phách
  '#EAB308', // Vàng chanh tươi sáng

  // 4. Nhóm Xanh lá (Green: Đậm - Chuẩn - Nhạt)
  '#047857', // Xanh rừng rêu đậm
  '#10B981', // Xanh lục bảo chuẩn
  '#84CC16', // Xanh cốm / Chanh non

  // 5. Nhóm Xanh ngọc (Teal & Cyan: Đậm - Chuẩn - Sáng)
  '#0F766E', // Xanh ngọc bích sẫm
  '#14B8A6', // Xanh ngọc bích chuẩn
  '#06B6D4', // Xanh lam ngọc biển

  // 6. Nhóm Xanh dương (Blue & Sky: Đậm - Chuẩn - Nhạt)
  '#1D4ED8', // Xanh navy / Biển sâu
  '#3B82F6', // Xanh dương chuẩn
  '#38BDF8', // Xanh da trời thanh mát

  // 7. Nhóm Tím (Purple: Đậm - Chuẩn - Nhạt)
  '#6D28D9', // Tím thẫm đậm
  '#8B5CF6', // Tím thạch anh chuẩn
  '#C084FC', // Tím lavender nhạt

  // 8. Nhóm Hồng (Pink & Rose: Đậm - Tươi - Nhạt)
  '#BE185D', // Hồng dâu sẫm
  '#EC4899', // Hồng cánh sen tươi
  '#F472B6', // Hồng phấn pastel

  // 9. Nhóm Xám (Slate: Đậm - Nhạt)
  '#334155', // Xám than Slate đậm
  '#94A3B8'  // Xám bạc Slate nhạt
];

/**
 * Kiểm tra xem một màu HEX có phải là màu sáng (độ chói cao) hay không,
 * để quyết định màu icon dấu tích (đen hay trắng) đạt độ tương phản tối ưu.
 */
export function isLightColor(hex: string): boolean {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 170;
}

/**
 * Sắp xếp danh sách hạng mục:
 * 1. Luôn ưu tiên các hạng mục có gắn sao (`isStarred === true`) lên hàng đầu.
 * 2. Theo thứ tự tùy chỉnh của người dùng (`order`).
 * 3. Fallback theo thời gian tạo (`createdAt`) hoặc tên tiếng Việt.
 */
export function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    // 1. Luôn ưu tiên mục có dấu sao lên đầu
    const starA = a.isStarred ? 1 : 0;
    const starB = b.isStarred ? 1 : 0;
    if (starB !== starA) return starB - starA;

    // 2. Thứ tự hiển thị tùy chỉnh do người dùng sắp xếp (order)
    const orderA = typeof a.order === 'number' ? a.order : 999999;
    const orderB = typeof b.order === 'number' ? b.order : 999999;
    if (orderA !== orderB) return orderA - orderB;

    // 3. Fallback theo thời gian tạo
    const timeA = a.createdAt || '';
    const timeB = b.createdAt || '';
    if (timeA && timeB && timeA !== timeB) return timeA.localeCompare(timeB);

    return a.name.localeCompare(b.name, 'vi');
  });
}

/**
 * Cập nhật thứ tự sắp xếp của danh sách hạng mục vào IndexedDB
 */
export async function reorderCategories(categoryIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.categories, async () => {
    for (let i = 0; i < categoryIds.length; i++) {
      await db.categories.update(categoryIds[i], {
        order: i,
        updatedAt: now
      });
    }
  });
}

/**
 * Di chuyển vị trí của 1 hạng mục (Lên hoặc Xuống) trong cùng nhóm
 * Tuân thủ nghiêm ngặt nguyên tắc: Các mục có dấu sao ⭐ luôn luôn đứng trên các mục thường!
 */
export async function moveCategoryPosition(
  categoryId: string,
  direction: 'UP' | 'DOWN',
  siblingCategories: Category[]
): Promise<void> {
  const sorted = sortCategories(siblingCategories);
  const currentIndex = sorted.findIndex((c) => c.id === categoryId);
  if (currentIndex === -1) return;

  const currentCat = sorted[currentIndex];
  const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= sorted.length) return;

  const targetCat = sorted[targetIndex];

  // Không cho phép đổi chỗ giữa mục có sao và mục không có sao
  // Mục có sao bắt buộc phải luôn đứng trên mục không có sao
  if (Boolean(currentCat.isStarred) !== Boolean(targetCat.isStarred)) {
    return;
  }

  const newSorted = [...sorted];
  newSorted[currentIndex] = targetCat;
  newSorted[targetIndex] = currentCat;

  await reorderCategories(newSorted.map((c) => c.id));
}

/**
 * Bật/tắt gắn sao ưu tiên cho một hạng mục và sắp xếp lại thứ tự ngay lập tức
 */
export async function toggleCategoryStar(
  cat: Category,
  siblingCategories?: Category[]
): Promise<boolean> {
  const nextStarred = !cat.isStarred;
  const now = new Date().toISOString();

  await db.transaction('rw', db.categories, async () => {
    if (siblingCategories && siblingCategories.length > 0) {
      const updatedCat: Category = {
        ...cat,
        isStarred: nextStarred,
        updatedAt: now
      };
      const others = siblingCategories.filter((c) => c.id !== cat.id);
      const allUpdated = [...others, updatedCat];
      const sorted = sortCategories(allUpdated);

      for (let i = 0; i < sorted.length; i++) {
        await db.categories.update(sorted[i].id, {
          ...(sorted[i].id === cat.id ? { isStarred: nextStarred } : {}),
          order: i,
          updatedAt: now
        });
      }
    } else {
      await db.categories.update(cat.id, {
        isStarred: nextStarred,
        updatedAt: now
      });
    }
  });

  return nextStarred;
}
