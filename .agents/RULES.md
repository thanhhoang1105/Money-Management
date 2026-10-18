# RULES & ARCHITECTURAL GUIDELINES: SỔ THU CHI PWA (LOCAL-FIRST)

> **MỤC ĐÍCH TỆP QUY TẮC:**
> Tệp này chứa toàn bộ các nguyên tắc kiến trúc, quy chuẩn kỹ thuật, quy tắc cơ sở dữ liệu Dexie.js và tiêu chuẩn UX/UI bắt buộc cho ứng dụng **Sổ Thu Chi Cá Nhân (Money Management PWA)**.
> **Tất cả các phiên làm việc của AI/Kỹ sư phát triển sau này BẮT BUỘC phải đọc và tuân thủ 100% các điều khoản dưới đây trước khi viết bất kỳ dòng mã nào.**

---

## 1. TECH STACK & KIẾN TRÚC LOCAL-FIRST (0 ĐỒNG, OFFLINE-FIRST)

### 1.1. Công nghệ cốt lõi
- **Runtime & Framework:** React 19, TypeScript (Strict Mode), Vite 8 (ESM).
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite` với thiết kế Design Tokens tại `@theme` trong `src/index.css`).
- **Database:** IndexedDB thông qua thư viện **Dexie.js v4** + `dexie-react-hooks` (`useLiveQuery`).
- **PWA & Offline:** `vite-plugin-pwa` (Workbox Service Worker, tự động cache offline 100%, standalone display).
- **Icons & Tiện ích:** `lucide-react`, `xlsx` (báo cáo Excel), `canvas-confetti`.

### 1.2. Mô hình Local-First & Chi phí 0đ
- **Bảo mật & Riêng tư:** 100% dữ liệu tài chính của người dùng lưu trữ cục bộ trên trình duyệt/thiết bị của họ qua IndexedDB.
- **Không Backend / Không Server Database:** Ứng dụng không phụ thuộc vào bất kỳ máy chủ cơ sở dữ liệu trả phí nào (Firebase, Supabase, AWS...). Vận hành vĩnh viễn với chi phí 0đ.
- **Persistent Storage Bắt buộc:** Khi khởi động ứng dụng, luôn gọi `navigator.storage.persist()` (đã cấu hình sẵn trong `src/db/index.ts`) để ngăn trình duyệt (đặc biệt là iOS Safari WebKit) tự ý xóa dữ liệu IndexedDB sau 7 ngày không hoạt động khi máy thiếu bộ nhớ.

---

## 2. QUY TẮC BẮT BUỘC VỀ DATABASE & DEXIE.JS (CRITICAL)

### 2.1. CẤM TUYỆT ĐỐI: Lỗi Dexie Boolean Indexing
- **Nguyên nhân kỹ thuật:** IndexedDB của trình duyệt **KHÔNG HỖ TRỢ** kiểu dữ liệu `boolean` (`true`/`false`) cho `IDBKeyRange` khi đánh index.
- **Quy tắc:**
  - **KHÔNG BAO GIỜ** đánh index trường boolean trong `stores({ ... })` (ví dụ: `isExcludedFromTotal`, `isDefault`).
  - **CẤM TUYỆT ĐỐI** viết truy vấn: `db.wallets.where('isExcludedFromTotal').equals(false)` hoặc `db.categories.where('isDefault').equals(true)`.
  - **Giải pháp chuẩn:** Luôn lấy toàn bộ danh sách bằng `.toArray()` rồi dùng hàm `.filter()` trong JS/TS:
    ```typescript
    // CHUẨN: Lấy toArray() rồi lọc trong JS
    const wallets = await db.wallets.toArray();
    const activeWallets = wallets.filter(w => !w.isExcludedFromTotal);
    ```

### 2.2. ACID Atomic Transactions
Mọi thao tác thay đổi dòng tiền (Thêm, Sửa, Xóa giao dịch, Chuyển ví, Điều chỉnh số dư) **BẮT BUỘC** phải được bọc trong một Dexie Transaction có đầy đủ quyền đọc/ghi trên các bảng liên quan:
```typescript
await db.transaction('rw', [db.wallets, db.transactions, db.settings], async () => {
  // Thực hiện cập nhật số dư ví VÀ ghi/sửa giao dịch đồng thời
  // Nếu 1 bước lỗi, toàn bộ thay đổi sẽ tự động Rollback
});
```

### 2.3. Cơ chế Hoàn tác Số dư Nguyên tử (Atomic Balance Revert)
Khi **SỬA (Update)** hoặc **XÓA (Delete)** bất kỳ giao dịch nào, hệ thống phải tuân thủ nghiêm ngặt 3 bước:
1. **Đọc `oldTx` từ DB:** Lấy lại dữ liệu cũ trước khi sửa.
2. **Revert (Hoàn tác) hoàn toàn số dư của `oldTx`:**
   - Nếu `oldTx.type === 'EXPENSE'`: Cộng trả lại số tiền vào ví cũ `oldTx.walletId`.
   - Nếu `oldTx.type === 'INCOME'`: Trừ bớt số tiền khỏi ví cũ `oldTx.walletId`.
   - Nếu `oldTx.type === 'TRANSFER'`: Cộng trả lại vào ví gửi cũ `oldTx.walletId` VÀ trừ bớt từ ví nhận cũ `oldTx.toWalletId`.
3. **Áp dụng tác động mới của `newTx`:**
   - Áp dụng số tiền mới lên ví mới (`newTx.walletId` và `newTx.toWalletId` nếu có).
   - Cơ chế này đảm bảo số dư ví **chính xác 100% tuyệt đối** ngay cả khi người dùng đổi số tiền, đổi từ ví A sang ví B, hoặc đổi loại từ Chi sang Thu.

### 2.4. Quy tắc Nghiệp vụ TRANSFER & ADJUSTMENT
- **TRANSFER (Chuyển ví):** 
  - Chỉ làm thay đổi số dư giữa 2 ví nội bộ (Ví gửi giảm, Ví nhận tăng).
  - **TUYỆT ĐỐI KHÔNG ĐƯỢC** cộng vào Tổng Thu (Total Income) hay Tổng Chi (Total Expense) của tháng trong các màn hình Báo cáo và Danh sách.
- **ADJUSTMENT (Điều chỉnh số dư thực tế):**
  - Khi người dùng chọn "Tự động tạo giao dịch chênh lệch", giao dịch sinh ra phải được gán `categoryId: 'system_adjustment'` (Danh mục hệ thống "Điều chỉnh số dư") để phân biệt với chi tiêu sinh hoạt thông thường.

---

## 3. QUY CHUẨN UI/UX CHUẨN MOBILE-FIRST & IOS PWA

### 3.1. Chống Auto-Zoom trên iPhone (Bắt buộc)
- Trình duyệt iOS Safari sẽ tự động phóng to (zoom in) màn hình nếu người dùng chạm vào bất kỳ thẻ input nào có kích thước chữ nhỏ hơn 16px, làm vỡ khung hiển thị PWA.
- **Quy tắc:** Mọi thẻ `<input>`, `<select>`, `<textarea>` **BẮT BUỘC** phải có `font-size >= 16px`. Luôn áp dụng class tiện ích `.input-ios` hoặc thiết lập `text-base` (16px) cho form input.

### 3.2. Khử Khoảng hở đáy & Safe Area Insets (`env(safe-area-inset-bottom)`)
- File `index.html` bắt buộc phải có thuộc tính `viewport-fit=cover`:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  ```
- Nền màn hình `html`, `body`, `#root` phải đồng nhất một màu nền tối `#090d16` và có `min-height: 100dvh` để không bao giờ bị hở viền trắng khi cuộn.
- **Thanh Bottom Navigation:** Bắt buộc cố định sát đáy (`fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto`) và padding đáy bằng `padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px))` (class `.safe-nav-bottom`) để thanh nền màu kính tràn sát mép dưới màn hình iPhone.
- **Modals / Bottom Sheets:** Đáy của modal (như NumpadModal, SettingsModal) phải có `pb-[max(16px,env(safe-area-inset-bottom,0px))]` để các nút bấm không bị thanh Home Indicator của iPhone che khuất.

### 3.3. Khóa Cuộn Elastic Bounce (Rubber-Band Scroll)
- Cấu hình `overscroll-behavior-y: none;` trên `body` để chống hiện tượng giật nảy màn hình (rubber-band) của iOS khi kéo trang.
- Các vùng danh sách cuộn nội bộ dùng `overscroll-behavior-y: contain;` và `-webkit-overflow-scrolling: touch;`.

### 3.4. Tự động ẩn Banner Hướng dẫn trên Màn hình chính
- Nếu ứng dụng đang chạy ở chế độ Standalone (`window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true`), **tự động ẩn hoàn toàn** các banner gợi ý cài đặt PWA / Thêm vào màn hình chính.

---

## 4. TIÊU CHUẨN NGHIỆP VỤ & TRẢI NGHIỆM GHI CHÉP (UX STANDARDS)

### 4.1. Bàn phím số Numpad Chuyên dụng & Auto-Evaluate
- **Phím `000` thông minh:** Chặn bấm `000` khi chuỗi đang là `'0'` hoặc ngay sau các toán tử (`+`, `-`, `×`, `÷`) để tránh lỗi nhập liệu.
- **Hỗ trợ biểu thức tính toán:** Cho phép gõ phép tính `+ - × ÷` ngay trên bàn phím số; dòng biểu thức hiển thị nhỏ phía trên số tiền tổng.
- **Auto-evaluate khi bấm LƯU:** Nếu người dùng đang nhập dở phép tính (ví dụ `35000 + 20000`) mà bấm nút **LƯU GIAO DỊCH** ngay, hệ thống phải tự động tính toán ra kết quả cuối cùng (`55000`) rồi mới tiến hành lưu vào DB. Chặn lưu nếu số tiền `<= 0` hoặc `NaN`.

### 4.2. Smart Defaults (Tối ưu thao tác < 3 giây)
Khi mở modal ghi chép mới:
1. Mặc định chọn tab `EXPENSE` (Chi tiền).
2. Tự động chọn Ví vừa sử dụng gần nhất (lấy từ `last_used_wallet_id` trong bảng `settings`), fallback ví "Tiền mặt".
3. Tự động chọn danh mục đầu tiên (ưu tiên "Ăn uống").
4. Tự động chọn ngày hôm nay (`getCurrentDate()`).

### 4.3. Thanh Quick Tags Thông minh
- Hiển thị danh sách thẻ gợi ý nhanh (`quickTags`) của danh mục đang chọn.
- **Cộng dồn tag:** Bấm vào tag sẽ tự động nối vào ô ghi chú dạng phẩy (ví dụ: `Cơm trưa, Cà phê`), bấm lại vào tag đang sáng thì gỡ bỏ tag đó khỏi ghi chú.
- **Thêm tag tại chỗ:** Có nút `+ Thêm tag` ngay cuối thanh danh sách tag để lưu nhanh 1 tag mới vào bảng danh mục trong DB mà không cần rời khỏi màn hình nhập liệu.

### 4.4. Tự động sao lưu hàng ngày (Daily Auto-Backup)
- Cung cấp tính năng Tự động sao lưu trong Cài đặt với khung giờ cấu hình (mặc định 21:00).
- Khi ứng dụng khởi chạy (App initialization): Kiểm tra nếu `auto_backup_enabled === true` và ngày hôm nay chưa sao lưu lần nào (`last_auto_backup_date !== today`), tự động kích hoạt tạo tệp sao lưu JSON đầy đủ dữ liệu và gọi Web Share API hoặc tải về máy, sau đó cập nhật `last_auto_backup_date`.

---

## 5. CODE QUALITY, CONVENTIONS & STYLING RULES

### 5.1. Cấu trúc thư mục & Tách biệt trách nhiệm (SoC)
- `src/db/`: Chứa cấu hình schema Dexie, migration versions, seed data. **Không đặt code UI ở đây.**
- `src/services/`: Chứa toàn bộ nghiệp vụ xử lý dữ liệu thuần (Business Logic, ACID Transactions, Export/Import, Backup). Các component UI chỉ gọi hàm từ service, **không tự viết transaction phức tạp trong UI**.
- `src/components/`: Chứa các thành phần giao diện người dùng React, sử dụng `useLiveQuery` để lắng nghe dữ liệu phản ứng thời gian thực.
- `src/utils/`: Chứa các hàm tiện ích thuần túy (format VND, ngày tháng, sanitize biểu thức toán học).
- `src/types/`: Định nghĩa kiểu dữ liệu TypeScript dùng chung.

### 5.2. Chuẩn mực Tailwind CSS v4 (Không dùng CSS Inline)
- **Tận dụng Design Tokens:** Sử dụng các màu sắc và font chữ đã khai báo trong `@theme`:
  - Màu nền: `bg-app-bg` (`#090d16`), `bg-app-card` (`#121826`).
  - Màu dòng tiền: `text-income` (`#10b981`), `text-expense` (`#f43f5e`), `text-transfer` (`#38bdf8`).
  - Phông chữ: `font-heading` (`Outfit`), `font-body` (`Plus Jakarta Sans`).
  - Lớp tiện ích: `.glass-panel`, `.glass-card`, `.glass-nav`, `.touch-btn`, `.numpad-key`, `.cat-badge`, `.input-ios`.
- **Nghiêm cấm lạm dụng `style={{ ... }}`:** Tuyệt đối không viết CSS inline cho màu sắc cố định, padding, margin, flexbox hay border. CSS inline **chỉ được phép** dùng cho các giá trị động tính toán runtime (ví dụ: `style={{ backgroundColor: cat.color }}`, góc quay SVG hoặc `%` độ rộng của progress bar).

### 5.3. Quy tắc Kiểm tra & Git Branching
- **Biên dịch & Linter:** Trước khi hoàn tất bất kỳ tính năng nào, bắt buộc phải chạy:
  - `npm run build` (kiểm tra TypeScript và build production với Vite, đảm bảo 0 lỗi).
  - `npm run lint` (kiểm tra chuẩn mã nguồn).
- **Quy tắc Git:** **TUYỆT ĐỐI KHÔNG PUSH TRỰC TIẾP LÊN NHÁNH `master`**. Mọi công việc phát triển tính năng mới hoặc sửa lỗi đều phải thực hiện trên nhánh feature tương ứng (ví dụ: `feature/pwa-core-...`) và đẩy lên remote trên nhánh đó.
