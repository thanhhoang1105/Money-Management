# AGENTS.md

> Quy định kiến trúc và phát triển cho các tác tử AI làm việc trên dự án **Sổ Thu Chi (Money Management PWA)**.

Toàn bộ tài liệu quy chuẩn kỹ thuật và kiến trúc chi tiết được lưu trữ tại [.agents/RULES.md](RULES.md).
Mọi tác tử AI phải đọc và tuân thủ các nguyên tắc cốt lõi sau:

1. **Tech Stack & Architecture:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Dexie.js v4. Kiến trúc Local-First, chi phí 0đ, lưu trữ 100% offline trên IndexedDB với `navigator.storage.persist()`.
2. **Database & Dexie.js Rules (Bắt buộc):**
   - **CẤM** query boolean bằng IndexedDB index (`.where('isExcludedFromTotal').equals(false)`). Luôn lấy `.toArray()` và `.filter()` trong TypeScript.
   - Mọi thao tác sửa đổi số dư phải bọc trong `db.transaction('rw', [db.wallets, db.transactions, ...], async () => { ... })`.
   - **Atomic Balance Revert:** Sửa/Xóa giao dịch luôn revert số dư cũ của `oldTx` trước khi áp dụng số dư mới của `newTx`.
   - Giao dịch `TRANSFER` không bao giờ được tính vào Tổng Thu/Chi tháng.
   - Giao dịch điều chỉnh số dư dùng `categoryId: 'system_adjustment'`.
3. **Mobile-First & iOS PWA UI/UX Rules:**
   - Mọi input, select, textarea PHẢI có `font-size >= 16px` (dùng `.input-ios`) để chống iOS Safari auto-zoom.
   - `viewport-fit=cover`, `min-height: 100dvh`, nền `#090d16` đồng nhất. Bottom nav cố định sát đáy với `safe-nav-bottom`.
   - Chống rubber-band bounce bằng `overscroll-behavior-y: none`.
   - Ẩn banner hướng dẫn thêm vào màn hình chính khi đang chạy Standalone.
4. **Business Logic & UX Standards:**
   - Bàn phím Numpad có phím `000` (chặn bấm khi đang là 0), tự động evaluate biểu thức khi bấm Lưu.
   - Smart Defaults (< 3s): Tab EXPENSE, ví gần nhất (`last_used_wallet_id`), danh mục "Ăn uống", ngày hiện tại.
   - Quick Tags cộng dồn dấu phẩy và cho phép tạo nhanh tại chỗ.
   - Tự động sao lưu JSON hàng ngày khi khởi động ứng dụng nếu chưa sao lưu hôm nay.
5. **Code Quality & Git Conventions:**
   - Tách biệt logic DB trong `src/services/` khỏi UI trong `src/components/`.
   - Dùng Tailwind CSS v4 design tokens (`src/index.css`), **không dùng CSS inline** trừ giá trị runtime động (`cat.color`, góc SVG, % width).
   - Chạy `npm run build` và `npm run lint` đạt 0 lỗi trước khi hoàn tất.
   - **KHÔNG BAO GIỜ push trực tiếp lên `master`**, luôn làm việc trên nhánh feature branch.
