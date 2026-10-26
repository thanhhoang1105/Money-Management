# Sổ Thu Chi Cá Nhân (Money Management PWA) 📱💰

Ứng dụng quản lý tài chính và thu chi cá nhân hiện đại theo chuẩn **Progressive Web App (PWA)**, tối ưu chuyên sâu cho **iOS Safari (Add to Home Screen)** và hỗ trợ mượt mà trên mọi thiết bị di động cũng như máy tính để bàn.

- **Kiến trúc:** Local-First 100% với IndexedDB (`Dexie.js v4`), hoạt động ngoại tuyến hoàn toàn.
- **Chi phí vận hành:** **0 VNĐ trọn đời** (Không phụ thuộc backend server, không lo khóa tài khoản).
- **Trải nghiệm:** Giao diện tối ưu chuẩn Apple Human Interface Guidelines, Safe Area Insets tràn viền, chống giật nảy màn hình, mở toàn màn hình (Standalone) như một ứng dụng Native thực thụ.
- **Đồng bộ tùy chọn:** Hỗ trợ Cloud Sync 2 chiều miễn phí qua Supabase và Sao lưu tự động JSON hàng ngày.

---

## 🏗️ Kiến trúc & Công nghệ (Tech Stack)

| Thành phần | Công nghệ sử dụng | Mục đích / Ưu điểm |
| :--- | :--- | :--- |
| **Giao diện & Logic** | **React 19 + TypeScript (Strict Mode)** | Tốc độ kết xuất vượt trội, quản lý kiểu dữ liệu chặt chẽ |
| **Công cụ Build** | **Vite 8** | Khởi động dev server tức thì, tối ưu hóa bundle khi build |
| **Styling** | **Tailwind CSS v4** | Hệ thống Design Tokens (`@theme`), Dark Theme `#090d16`, hiệu ứng kính mờ Glassmorphism |
| **Cơ sở dữ liệu** | **Dexie.js v4 + IndexedDB** | Lưu trữ dữ liệu cục bộ chuẩn ACID, phản ứng thời gian thực với `useLiveQuery` |
| **PWA & Offline** | **vite-plugin-pwa (Workbox)** | Tự động cache mã nguồn và tài nguyên, hỗ trợ offline 100%, tự động cập nhật bản mới |
| **Đám mây** | **Supabase (Tùy chọn)** | Đồng bộ 2 chiều (Cloud Sync) thời gian thực, hợp nhất dữ liệu thông minh (Smart Merge) |
| **Icon & Tiện ích** | **Lucide React**, **XLSX**, **Canvas-Confetti** | Bộ biểu tượng phong phú, xuất báo cáo Excel, hiệu ứng hoàn thành mục tiêu |

---

## 🌟 Tính năng Cốt lõi & Luồng Nghiệp vụ Chi tiết

### 1. Bàn phím Numpad & Ghi chép Siêu tốc (< 3 giây)
- **Bàn phím Numpad tùy biến:**
  - Phím **`000`** thông minh (tự động khóa khi số đang là 0 hoặc sau toán tử để chống bấm nhầm).
  - Hỗ trợ nhập và tính toán biểu thức trực tiếp (`+`, `-`, `×`, `÷`) ngay trên form nhập.
  - **Tự động tính toán khi bấm Lưu:** Khi đang nhập dở phép tính (ví dụ: `35000 + 20000`), bấm **Lưu giao dịch** hệ thống sẽ tự động evaluate thành `55000` trước khi lưu vào DB.
- **Smart Defaults:** Tự động điền tab *Chi tiêu*, Ví hay dùng nhất (`last_used_wallet_id`), danh mục mặc định (*Ăn uống*) và thời gian hiện tại.
- **Thanh Quick Tags thông minh:** Gợi ý thẻ ghi chú nhanh theo danh mục (Cơm trưa, Cà phê, Đổ xăng...), bấm để cộng dồn dấu phẩy và hỗ trợ tạo thẻ mới trực tiếp tại chỗ.
- **Hỗ trợ 6 loại nghiệp vụ tài chính:**
  1. `EXPENSE` (Chi tiền): Giảm số dư ví, tính vào Tổng Chi tháng.
  2. `INCOME` (Thu tiền): Tăng số dư ví, tính vào Tổng Thu tháng.
  3. `TRANSFER` (Chuyển khoản ví): Trừ ví gửi, cộng ví nhận. **Không** tính vào Thu/Chi tháng.
  4. `LEND` (Cho vay) & `COLLECT_DEBT` (Thu nợ): Quản lý công nợ cho người khác mượn.
  5. `BORROW` (Đi vay) & `PAY_DEBT` (Trả nợ): Quản lý công nợ mình vay mượn.
  6. `ADJUST` (Điều chỉnh số dư): Cân bằng số dư thực tế, tự động sinh giao dịch đối soát hệ thống.
- **Tùy chọn nâng cao:** Loại trừ khỏi báo cáo thu/chi (`excludeFromReport`), gắn vào Sự kiện/Chuyến đi, ghi chú tên người liên hệ vay nợ.

---

### 2. Quản lý Tài khoản & Ví tiền (Wallets)
- **Đa dạng loại ví:** Tiền mặt, Tài khoản Ngân hàng, Ví điện tử (MoMo, ZaloPay, ViettelPay...), Thẻ tín dụng, Tài khoản đầu tư.
- **Nhận diện Logo Ngân hàng tự động:** Tự động gắn logo thương hiệu tương ứng khi tên ví chứa tên ngân hàng phổ biến (Vietcombank, MB Bank, Techcombank, BIDV, ACB, TPBank, VPBank...).
- **Tùy chỉnh thứ tự hiển thị (Reorder Wallets):** Cho phép thay đổi vị trí các ví để gom các ví hay dùng lên đầu danh sách.
- **Menu hành động 3 chấm gọn gàng:**
  - Hiển thị dạng **Bottom Sheet** trượt từ dưới lên trên Mobile và dạng **Popover** trên Desktop.
  - Tích hợp 4 chức năng: **Chuyển khoản ví**, **Điều chỉnh số dư**, **Chỉnh sửa** và **Xóa ví**.
- **Màn hình Chuyển khoản ví chuyên dụng:**
  - Hỗ trợ nút đổi chiều ví gửi/nhận (Swap), chọn nhanh số tiền và hạch toán phí chuyển khoản riêng biệt.
- **Cơ chế Hoàn tác Số dư Nguyên tử (Atomic Balance Revert):** Khi sửa hoặc xóa bất kỳ giao dịch nào, hệ thống luôn hoàn tác tác động số dư của giao dịch cũ trước khi áp dụng số tiền mới trong một transaction ACID duy nhất.

---

### 3. Phân tầng Danh mục & Bộ lọc Lịch sử Thông minh
- **Cấu trúc Cha - Con linh hoạt:**
  - Danh mục Cha phân loại nhóm lớn (*Chi tiêu thiết yếu*, *Chi tiêu cá nhân & hưởng thụ*, *Thu nhập*...).
  - Danh mục Con chi tiết kèm icon, màu sắc và danh sách Quick Tags riêng.
  - Đánh dấu sao (`isStarred`) cho các danh mục ưu tiên.
- **Bộ lọc Lịch sử Giao dịch tối ưu:**
  - Danh mục Cha luôn đứng đầu mỗi nhóm để phân loại trực quan.
  - Các mục con được tự động tính toán tần suất sử dụng thực tế và **sắp xếp cái nào dùng nhiều nhất lên đầu**.
  - Tự động ẩn bớt các mục ít dùng kèm nút mũi tên **"Xem thêm"** để mở rộng khi cần.
  - Tích hợp thanh tìm kiếm nhanh danh mục.
  - Chọn danh mục Cha sẽ tự động lọc tất cả giao dịch thuộc các danh mục con của Cha đó.

---

### 4. Báo cáo & Phân tích Đa chiều (Analytics)
- **Thẻ tổng quan tháng (Hero Summary Card):** Hiển thị Tổng thu, Tổng chi, Số dư ròng và Tỷ lệ tiết kiệm trong tháng.
- **Chuyển đổi 2 chế độ xem linh hoạt:**
  - **Theo Danh mục:** Biểu đồ cơ cấu trực quan, tỷ lệ phần trăm và chi tiết từng danh mục.
  - **Theo Từng ngày:** Liệt kê toàn bộ các ngày có phát sinh giao dịch trong tháng, thống kê thu, chi, số dư ròng và số lượng giao dịch của từng ngày. Bấm vào ngày bất kỳ để bung mở Accordion xem chi tiết từng giao dịch phát sinh.
- **Bộ lọc ngày:** Cho phép chọn xem riêng một ngày cụ thể hoặc xem tổng thể cả tháng.
- **Màn hình Drill-Down:** Bấm vào một danh mục để xem phân tích chuyên sâu, gom nhóm giao dịch theo từng ngày kèm sub-total theo ngày.

---

### 5. Sổ Ghi nợ & Cho vay (Debts)
- Quản lý 4 nghiệp vụ: Cho vay, Đi vay, Thu nợ, Trả nợ.
- Tự động tổng hợp danh sách công nợ theo từng người liên hệ:
  - Ai đang nợ mình bao nhiêu (phân loại Đang vay / Đã trả hết).
  - Mình đang nợ ai bao nhiêu.
- Hỗ trợ bấm thu nợ/trả nợ nhanh trực tiếp từ thẻ người liên hệ.

---

### 6. Hạn mức Chi tiêu (Budgets)
- Thiết lập ngân sách chi tiêu tối đa cho toàn bộ tháng hoặc cho từng danh mục riêng biệt.
- Theo dõi tiến độ chi tiêu theo thời gian thực: % đã chi, số tiền còn lại được phép tiêu, cảnh báo khi chi tiêu vượt ngưỡng an toàn.

---

### 7. Ghi chép Định kỳ (Recurring Transactions)
- Tự động hóa các khoản thu/chi lặp lại: Tiền thuê nhà, Tiền điện nước, Trả góp, Tiền lương, Gói xem phim...
- Chu kỳ hỗ trợ: **Hàng ngày**, **Hàng tuần**, **Hàng tháng**, **Hàng năm**.
- Ứng dụng tự động kiểm tra và ghi nhận các giao dịch đến hạn mỗi khi người dùng mở app.

---

### 8. Sự kiện & Chuyến đi (Event / Trip)
- Gom nhóm các khoản chi phí cho một mục đích riêng: *Du lịch Đà Lạt*, *Tết Nguyên Đán*, *Đám cưới*, *Dự án cá nhân*...
- Thiết lập ngân sách dự kiến và theo dõi tổng chi phí phát sinh riêng biệt cho sự kiện mà không làm xáo trộn báo cáo thông thường.

---

### 9. Công cụ Chuyên biệt cho Tài xế Grab (Grab Driver Mode) 🛵
- **Giao diện nhập cuốc xe tối ưu:**
  - Hỗ trợ cuốc xe qua app hoặc nhận riêng ngoài app.
  - Nhập cước khách trả, tiền bo (tip), tự động tính chiết khấu app (20%), phí nền tảng 2k, chi phí xăng xe và ăn uống theo ca chạy.
- **Hạch toán dòng tiền chuẩn:**
  - Phí Grab trừ từ Ví Tín dụng thu hộ và chuyển sang Ví Tiền mặt dưới dạng **TRANSFER** (Vốn lưu động).
  - Thu nhập ròng đưa vào ví dưới dạng **INCOME**.
  - Đảm bảo số dư các ví khớp 100% thực tế và không làm sai lệch báo cáo chi tiêu sinh hoạt.

---

### 10. Sao lưu, Phục hồi & Đồng bộ Đám mây (Backup & Sync)
- **Tự động sao lưu JSON hàng ngày (Daily Auto-Backup):** Tự động xuất file backup JSON lưu vào máy khi mở app lần đầu trong ngày.
- **Sao lưu & Khôi phục thủ công:** Xuất/nhập file JSON toàn bộ dữ liệu (ví, danh mục, giao dịch, hạn mức, sự kiện, cài đặt).
- **Xuất báo cáo Excel (.xlsx):** Xuất toàn bộ dữ liệu ra file Excel với đầy đủ thông tin để lưu trữ hoặc phân tích chuyên sâu.
- **Đồng bộ 2 chiều Supabase (Cloud Sync):**
  - Đồng bộ tức thì giữa nhiều thiết bị (Điện thoại, Máy tính, Tablet).
  - Cơ chế Smart Merge giải quyết xung đột dựa trên mốc thời gian `updatedAt`.
  - Hỗ trợ Soft-Delete (không bị đồng bộ ngược lại các bản ghi đã xóa trên máy khác).
  - Tích hợp Dirty Tracking thông minh: Chỉ kích hoạt đồng bộ khi có thay đổi thực tế từ người dùng, bỏ qua các tác vụ chuẩn hóa ngầm (`runWithoutDirtyTracking`).

---

## 📱 Chuẩn mực Trải nghiệm iOS PWA & Mobile-First

1. **Chống phóng to màn hình ngoài ý muốn:** Mọi form `<input>`, `<select>`, `<textarea>` bắt buộc có font-size >= 16px (áp dụng class `.input-ios`) để Safari iOS không tự động phóng to làm vỡ layout.
2. **Safe Area Insets:** Thẻ `<meta name="viewport" content="viewport-fit=cover">` kết hợp padding đáy `env(safe-area-inset-bottom)` giúp thanh điều hướng đáy và các modal ôm sát mép bo tròn của iPhone X trở lên.
3. **Chống trôi màn hình (Rubber-Band Scroll):** Khóa cuộn nảy toàn trang bằng `overscroll-behavior-y: none` trên `body` và nền tối `#090d16` đồng nhất.
4. **Tự động ẩn banner cài đặt:** Tự động phát hiện khi ứng dụng đang chạy ở chế độ Standalone để ẩn các hướng dẫn thêm vào màn hình chính.
5. **Tùy chỉnh màn hình khởi động:** Cho phép người dùng tùy chọn tab mở mặc định (`Tổng quan`, `Tài khoản`, `Ghi giao dịch`, `Báo cáo`, `Khác`) theo thói quen sử dụng cá nhân.

---

## 📁 Cấu trúc Thư mục Dự án

```text
money/
├── .agents/                 # Tài liệu quy chuẩn kiến trúc và hướng dẫn cho AI Agents
│   ├── AGENTS.md            # Các nguyên tắc phát triển bắt buộc
│   └── RULES.md             # Bộ quy chuẩn kỹ thuật, database Dexie, mobile UX
├── public/                  # Tài nguyên tĩnh, icon PWA, manifest
├── src/
│   ├── components/          # Thành phần giao diện React
│   │   ├── ui/              # Các UI components tái sử dụng (CategoryFilterSelect, DatePicker, CustomSelect...)
│   │   ├── AnalyticsTab.tsx # Màn hình Báo cáo & Phân tích (theo danh mục & theo ngày)
│   │   ├── BottomNav.tsx    # Thanh điều hướng cố định sát đáy
│   │   ├── BudgetsTab.tsx   # Quản lý Hạn mức chi tiêu
│   │   ├── GrabTripModal.tsx# Modal ghi chép chuyên dụng cho tài xế Grab
│   │   ├── MoreTab.tsx      # Menu Khác (Sổ nợ, Định kỳ, Sự kiện, Cài đặt, Danh mục)
│   │   ├── TransactionEditorScreen.tsx # Màn hình Ghi giao dịch toàn màn hình với Numpad
│   │   ├── TransactionHistoryView.tsx  # Lịch sử ghi chép đa năng với bộ lọc nâng cao
│   │   ├── TransactionListTab.tsx      # Màn hình Tổng quan
│   │   └── WalletsTab.tsx   # Quản lý ví tiền, sắp xếp vị trí và menu 3 chấm
│   ├── db/                  # Cấu hình cơ sở dữ liệu IndexedDB
│   │   ├── index.ts         # Khởi tạo Dexie DB, persistent storage, hook dirty tracking
│   │   └── seed.ts          # Dữ liệu mẫu khởi tạo (ví mặc định, danh mục chuẩn)
│   ├── services/            # Tầng xử lý nghiệp vụ thuần túy (ACID Transactions)
│   │   ├── backupService.ts # Sao lưu/khôi phục JSON, xuất Excel (.xlsx)
│   │   ├── grabService.ts   # Nghiệp vụ dòng tiền Grab và chuẩn hóa dữ liệu
│   │   ├── supabaseService.ts # Kết nối và cấu hình Supabase Cloud Sync
│   │   ├── syncService.ts   # Thuật toán Smart Merge và đồng bộ 2 chiều
│   │   └── transactionService.ts # Nghiệp vụ Thêm/Sửa/Xóa giao dịch, Hoàn tác số dư
│   ├── types/               # Khai báo kiểu TypeScript dùng chung
│   ├── utils/               # Tiện ích format tiền tệ VND, ngày tháng, sanitize biểu thức
│   ├── App.tsx              # Component gốc, quản lý routing và trạng thái tab
│   ├── index.css            # Tailwind CSS v4 design tokens và lớp tiện ích
│   └── main.tsx             # Điểm khởi chạy ứng dụng React
├── index.html               # Cấu hình meta viewport, tiêu đề và theme-color
├── package.json             # Danh sách dependencies và script lệnh
├── tsconfig.json            # Cấu hình TypeScript Strict Mode
└── vite.config.ts           # Cấu hình Vite, Tailwind v4 và VitePWA Workbox
```

---

## 🚀 Hướng dẫn Cài đặt & Chạy Dự án

### Yêu cầu môi trường
- **Node.js:** Phiên bản 18 trở lên (khuyên dùng Node 20 LTS).
- **Trình quản lý gói:** `npm` hoặc `pnpm`.

### 1. Khởi chạy trên máy tính
```bash
# 1. Cài đặt các thư viện phụ thuộc
npm install

# 2. Khởi chạy máy chủ phát triển cục bộ (cho phép thiết bị trong mạng Wi-Fi truy cập)
npm run dev -- --host

# 3. Kiểm tra chất lượng mã nguồn (Linting)
npm run lint

# 4. Biên dịch bản đóng gói Production
npm run build
```

---

## 📲 Hướng dẫn Cài đặt lên Điện thoại (PWA)

### Trên iPhone / iPad (iOS Safari)
1. Đảm bảo iPhone kết nối cùng mạng Wi-Fi với máy tính (hoặc truy cập domain đã deploy trên Vercel qua HTTPS).
2. Mở trình duyệt **Safari**, truy cập địa chỉ IP máy tính (ví dụ: `http://192.168.1.15:5173`) hoặc link Vercel của bạn.
3. Bấm vào nút **Chia sẻ (Share)** ở thanh công cụ dưới đáy Safari (biểu tượng hình vuông có mũi tên trỏ lên $\uparrow$).
4. Cuộn xuống và chọn **"Thêm vào Màn hình chính" (Add to Home Screen)**.
5. Ứng dụng **Sổ Thu Chi** sẽ xuất hiện trên màn hình chính của iPhone với biểu tượng ứng dụng đầy đủ và hoạt động mượt mà offline 100%.

### Trên Android (Google Chrome)
1. Mở link ứng dụng trên trình duyệt **Chrome**.
2. Nhấn vào biểu tượng menu ba chấm ở góc trên bên phải.
3. Chọn **"Thêm vào Màn hình chính"** hoặc **"Cài đặt ứng dụng" (Install App)**.

---

## ☁️ Hướng dẫn Cấu hình Đồng bộ Đám mây Supabase (Miễn phí)

Nếu bạn muốn đồng bộ dữ liệu giữa nhiều máy hoặc sao lưu dữ liệu tự động lên đám mây:
1. Đăng ký tài khoản miễn phí tại [supabase.com](https://supabase.com) và tạo một dự án mới (chọn region gần nhất: ví dụ Singapore).
2. Vào phần **Project Settings** $\rightarrow$ **API**, copy hai thông số:
   - **Project URL**
   - **Anon / Public Key**
3. Trong ứng dụng Sổ Thu Chi:
   - Mở tab **Khác** $\rightarrow$ Chọn **Cài đặt & Dữ liệu**.
   - Bật tính năng **Đồng bộ Đám mây Supabase**.
   - Dán URL và Key vào form, sau đó bấm **Kiểm tra kết nối & Đồng bộ ngay**.
4. Dữ liệu sẽ được tự động đồng bộ 2 chiều an toàn và hoàn toàn bảo mật.

---

## 🌐 Triển khai lên Vercel (Deploy)

Dự án được cấu hình sẵn sàng triển khai chỉ với 1 cú click trên [Vercel](https://vercel.com):
1. Đẩy mã nguồn lên repository cá nhân trên GitHub / GitLab.
2. Truy cập Vercel, chọn **Add New** $\rightarrow$ **Project** $\rightarrow$ Chọn repository `money`.
3. Framework Preset: chọn **Vite**.
4. Bấm **Deploy**. Sau khoảng 10 - 20 giây, ứng dụng của bạn sẽ được kích hoạt với đường link HTTPS chính thức.

---

## 📜 Giấy phép & Quy chuẩn

Dự án được xây dựng phục vụ nhu cầu quản lý tài chính cá nhân độc lập, ưu tiên bảo mật dữ liệu riêng tư và trải nghiệm người dùng tối ưu. Mọi quy chuẩn mã nguồn phải tuân thủ nghiêm ngặt các điều khoản trong [.agents/RULES.md](.agents/RULES.md).
