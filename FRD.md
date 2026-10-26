# TÀI LIỆU YÊU CẦU CHỨC NĂNG (FRD) & KẾ HOẠCH TRIỂN KHAI V3.0
## DỰ ÁN: SỔ THU CHI CÁ NHÂN (CHUẨN MISA MONEYKEEPER - RESPONSIVE WEB & MOBILE PWA - LOCAL-FIRST 100% - 0 ĐỒNG CHI PHÍ)

---

## 1. TỔNG QUAN HỆ THỐNG & ĐỊNH HƯỚNG CÔNG NGHỆ

### 1.1 Mục tiêu dự án
* **Định vị sản phẩm:** Ứng dụng quản lý tài chính cá nhân và ghi chép thu chi hàng ngày toàn diện như **MISA Sổ Thu Chi (MoneyKeeper)**, tối ưu tốc độ nhập liệu **< 3 giây/giao dịch**.
* **Đa nền tảng (Cross-Platform Responsive Web & PWA):**
  * **Trên Điện thoại (iOS / Android PWA):** Chạy toàn màn hình (Standalone display), thanh điều hướng đáy (`BottomNav`), thao tác 1 ngón tay cái, hoạt động offline 100% ngoài đường.
  * **Trên Máy tính (Desktop / Laptop Web):** Giao diện Dashboard mở rộng (`max-w-5xl`), thanh điều hướng Header, hộp thoại chuẩn Radix UI (Popover Calendar, Wallet Select, Dialog Modal) và hỗ trợ đầy đủ bàn phím vật lý (`0-9`, `+ - * /`, `Enter`, `Esc`).
* **Chi phí vận hành:** **0 VNĐ trọn đời** (Không phụ thuộc backend trả phí, lưu trữ cục bộ bằng IndexedDB kết hợp đồng bộ đám mây 2 chiều qua Google Drive cá nhân của người dùng).
* **Hiệu năng & Bảo mật:** Dữ liệu lưu 100% trong bộ nhớ thiết bị bằng **IndexedDB (`Dexie.js v4`)** với `navigator.storage.persist()`. Tốc độ đọc/ghi tức thì, an toàn tuyệt đối.

### 1.2 Công nghệ cốt lõi
* **Frontend:** React 19 + Vite + TypeScript.
* **Styling & UI Components:** Tailwind CSS v4 + Radix UI (`@radix-ui/react-dialog`, `@radix-ui/react-popover`, `@radix-ui/react-select`, `@radix-ui/react-dropdown-menu`) + `lucide-react`.
* **Database (Local-First):** `Dexie.js v4` + `dexie-react-hooks` (`useLiveQuery`).
* **Đồng bộ & Sao lưu:** Google Identity Services (OAuth 2.0) + Google Drive REST API v3 (Smart Two-Way Merge Sync) + `xlsx` (SheetJS xuất báo cáo Excel 3 sheets) + JSON Backup/Restore.

---

## 2. THIẾT KẾ CƠ SỞ DỮ LIỆU (DEXIE.JS / INDEXEDDB SCHEMA V3.0)

```typescript
export type WalletType = 'CASH' | 'BANK' | 'E_WALLET' | 'CREDIT' | 'INVESTMENT' | 'OTHER';

export interface Wallet {
  id: string;                   // UUID v4
  name: string;                 // Ví dụ: 'Tiền mặt', 'Vietcombank', 'Ví MoMo'
  type: WalletType;
  balance: number;              // Số dư hiện tại (VNĐ)
  initialBalance: number;       // Số dư khởi tạo ban đầu
  creditLimit?: number;         // Hạn mức tín dụng (dành cho thẻ CREDIT)
  statementDay?: number;        // Ngày sao kê hàng tháng (1-31, dành cho CREDIT)
  paymentDueDay?: number;       // Ngày đến hạn thanh toán (1-31, dành cho CREDIT)
  currency: 'VND';
  icon: string;                 // Tên Lucide Icon
  color: string;                // Mã màu HEX
  isExcludedFromTotal: boolean; // true: không tính vào tổng tài sản khả dụng
  createdAt: string;            // ISO 8601
  updatedAt: string;
}

export type CategoryType = 'EXPENSE' | 'INCOME' | 'DEBT';

export interface Category {
  id: string;
  name: string;                 // Ví dụ: 'Đi chợ & Nấu ăn', 'Must have', 'Lương'
  type: CategoryType;
  parentId?: string;            // null/undefined: Hạng mục cha; có giá trị: Hạng mục con (Mô hình 2 tầng)
  icon: string;                 // Tên Lucide Icon
  color: string;                // Mã màu HEX
  quickTags?: string[];         // Danh sách gợi ý ghi chú nhanh (vd: ['Ăn sáng', 'Cà phê', 'Cơm trưa'])
  isDefault: boolean;
  isStarred?: boolean;          // true: Được gắn sao ưu tiên hiển thị ngoài màn hình ghi chép
  createdAt: string;
  updatedAt?: string;
}

export type TransactionType =
  | 'EXPENSE'        // Chi tiền
  | 'INCOME'         // Thu tiền
  | 'TRANSFER'       // Chuyển khoản nội bộ giữa các ví
  | 'LEND'           // Cho vay (Tiền ra khỏi ví -> Tăng khoản phải thu)
  | 'BORROW'         // Đi vay (Tiền vào ví -> Tăng khoản phải trả)
  | 'COLLECT_DEBT'   // Thu nợ (Tiền vào ví -> Giảm khoản phải thu)
  | 'PAY_DEBT'       // Trả nợ (Tiền ra khỏi ví -> Giảm khoản phải trả)
  | 'ADJUST';        // Điều chỉnh số dư thực tế

export interface Transaction {
  id: string;
  walletId: string;             // Ví nguồn / Ví thanh toán
  toWalletId?: string;          // Ví đích (chỉ dùng khi type = 'TRANSFER')
  categoryId?: string;          // ID hạng mục ('system_adjustment' nếu là điều chỉnh số dư)
  type: TransactionType;
  amount: number;               // Số tiền giao dịch (> 0)
  transferFee?: number;         // Phí chuyển khoản (nếu có khi type = 'TRANSFER', mặc định = 0)
  date: string;                 // 'YYYY-MM-DD'
  time: string;                 // 'HH:mm'
  note?: string;                // Ghi chú giao dịch (hỗ trợ ghép nhiều Quick Tags)
  contactName?: string;         // Người vay / Chủ nợ (dùng cho LEND, BORROW, COLLECT_DEBT, PAY_DEBT)
  eventId?: string;             // ID Sự kiện / Chuyến đi (vd: 'Du lịch Đà Lạt', 'Tết 2026')
  excludeFromReport?: boolean;  // true: Không tính vào báo cáo Thu/Chi tháng (dùng cho khoản chi hộ/thu hộ)
  recurringId?: string;         // ID cấu hình giao dịch định kỳ sinh ra giao dịch này
  createdAt: string;
  updatedAt?: string;           // ISO 8601 phục vụ đồng bộ 2 chiều (Last-Write-Wins)
}

export interface Budget {
  id: string;
  categoryId?: string;          // null: Hạn mức tổng tháng; ID cha: Hạn mức nhóm; ID con: Hạn mức mục con
  amount: number;               // Số tiền hạn mức (> 0)
  month: string;                // 'YYYY-MM' (Ví dụ: '2026-10')
  createdAt: string;
  updatedAt?: string;
}

export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurringTransaction {
  id: string;
  name: string;                 // Ví dụ: 'Tiền thuê nhà', 'Lương hàng tháng', 'Netflix'
  walletId: string;
  toWalletId?: string;
  categoryId?: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amount: number;
  note?: string;
  frequency: RecurringFrequency;
  dayOfMonth?: number;          // Ngày lặp lại trong tháng (1-31)
  nextRunDate: string;          // 'YYYY-MM-DD'
  isActive: boolean;
  autoCreate: boolean;          // true: Tự động ghi sổ khi đến ngày; false: Hiện thông báo nhắc xác nhận
  createdAt: string;
  updatedAt: string;
}

export interface EventTrip {
  id: string;
  name: string;                 // Ví dụ: 'Du lịch Phú Quốc', 'Đám cưới', 'Sửa nhà'
  icon: string;
  color: string;
  budgetAmount?: number;        // Ngân sách dự kiến cho sự kiện
  startDate: string;            // 'YYYY-MM-DD'
  endDate?: string;
  isCompleted: boolean;         // true: Đã kết thúc sự kiện
  createdAt: string;
  updatedAt: string;
}

export interface Setting {
  key: string;
  value: any;
}
```

---

## 3. ĐẶC TẢ CHI TIẾT CÁC MODULE CHỨC NĂNG (FRD V3.0 - CHUẨN MISA SỔ THU CHI)

---

### MODULE 1: QUẢN LÝ ĐA TÀI KHOẢN & VÍ (WALLET MODULE)
* **FR-W-01: Danh sách ví & Tổng tài sản khả dụng:**
  * Thẻ tổng quan hiển thị Tổng tài sản khả dụng (tự động loại trừ các ví có `isExcludedFromTotal = true`).
  * Phân loại 6 nhóm tài khoản: Tiền mặt (`CASH`), Ngân hàng (`BANK`), Ví điện tử (`E_WALLET`), Thẻ tín dụng (`CREDIT`), Đầu tư & Tích lũy (`INVESTMENT`), Khác (`OTHER`).
* **FR-W-02: Preset Ngân hàng & Ví điện tử Việt Nam (1-Click Setup):**
  * Tích hợp sẵn danh mục 15+ Ngân hàng (Vietcombank, Techcombank, MB Bank, VietinBank, BIDV, ACB, TPBank, VPBank, VIB, Sacombank, HDBank, Agribank, Timo, Cake...), 5+ Ví điện tử (MoMo, ZaloPay, VNPay, Viettel Money, ShopeePay) và kênh Đầu tư (Chứng khoán VPS/SSI/TCBS, Sổ tiết kiệm, Vàng SJC, Crypto) kèm màu sắc nhận diện thương hiệu.
  * Cho phép **Tạo tài khoản mới ngay trong lúc đang ghi giao dịch** thông qua Popover/Dialog `WalletSelect` mà không làm mất dữ liệu đang nhập.
* **FR-W-03: Chuyển tiền nội bộ & Phí chuyển khoản (Transfer & Transfer Fee):**
  * Nhập: Ví gửi (`walletId`), Ví nhận (`toWalletId`), Số tiền chuyển (`amount`), **Phí chuyển khoản (`transferFee` - tùy chọn)**, Ngày giờ, Ghi chú.
  * **Xử lý Atomic Transaction:**
    * Giảm số dư Ví gửi: `fromWallet.balance -= (amount + (transferFee || 0))`.
    * Tăng số dư Ví nhận: `toWallet.balance += amount`.
    * Nếu `transferFee > 0`: Tự động ghi nhận phí chuyển khoản vào chi tiêu hoặc lưu trực tiếp trên giao dịch `TRANSFER` để số dư 2 ví luôn khớp 100% thực tế.
* **FR-W-04: Điều chỉnh số dư thực tế (Balance Adjustment):**
  * Khi kiểm kê tiền thực tế bị lệch so với sổ sách, người dùng nhập **Số dư thực tế mới**.
  * Hệ thống tự động tính phần chênh lệch (`diff = newBalance - oldBalance`) và tạo giao dịch điều chỉnh với `categoryId: 'system_adjustment'` để lịch sử biến động luôn minh bạch.
* **FR-W-05: An toàn dữ liệu khi xóa ví:**
  * Chặn xóa ví nếu đã có giao dịch phát sinh, hướng dẫn người dùng chuyển giao dịch sang ví khác hoặc xóa giao dịch trước.

---

### MODULE 2: HỆ THỐNG HẠNG MỤC 2 TẦNG, GẮN SAO & QUICK TAGS (CATEGORY MODULE)
* **FR-C-01: Kiến trúc Hạng mục 2 tầng (Cha – Con) kết hợp Quản trị Tài chính:**
  * **Nhóm Chi tiêu (`EXPENSE`) chia làm 3 nhóm Cha cốt lõi:**
    1. 🛡️ **Must Have (Chi tiêu Thiết yếu - Nhu cầu cơ bản):** Đi chợ & Nấu ăn, Ăn ngoài & Cơm văn phòng, Nhà cửa & Điện nước, Đi lại & Xăng xe, Y tế & Thuốc men, Con cái & Học phí, Hiếu hỉ & Gia đình, Trả nợ & Phí dịch vụ.
    2. ❤️ **Nice to Have (Nâng cao chất lượng sống & Phát triển):** Cà phê & Trà sữa, Giải trí & Hẹn hò, Mua sắm quần áo & Mỹ phẩm, Thể thao & Chăm sóc bản thân, Du lịch & Nghỉ dưỡng, Học tập & Sách vở, Quà tặng & Từ thiện.
    3. 🔥 **Wasted (Chi tiêu Lãng phí / Cần cắt giảm):** Mua sắm bốc đồng, Phí phạt & Lãi quá hạn, Đồ mua không dùng, Tiệc tùng quá đà, Trò chơi & Cá cược.
  * **Nhóm Thu nhập (`INCOME`):** Lương & Phụ cấp, Thưởng & Hoa hồng, Làm thêm & Freelance, Đầu tư & Cổ tức, Lãi tiết kiệm, Tiền mừng & Được tặng, Bán đồ thanh lý.
  * **Nhóm Vay nợ (`DEBT`):** Cho vay, Đi vay, Thu nợ, Trả nợ.
* **FR-C-02: Thanh Hạng mục Hay dùng & Gắn sao ưu tiên (Starred & Frequent Categories):**
  * Hiển thị trực tiếp bên dưới ô chọn hạng mục ở màn hình ghi chép (tối đa 2 dòng).
  * **Thuật toán sắp xếp thông minh:** Ưu tiên (1) Các hạng mục được người dùng **Gắn sao (`isStarred = true`)** ➡️ (2) Các hạng mục có **tần suất sử dụng nhiều nhất** trong lịch sử ➡️ (3) Bảng chữ cái tiếng Việt.
* **FR-C-03: Hệ thống Quick Tags cộng dồn & Tạo nhanh tại chỗ:**
  * Mỗi hạng mục có danh sách gợi ý ghi chú nhanh riêng biệt (ví dụ chọn *Đi lại & Xăng xe* hiện ngay `Đổ xăng`, `Gửi xe`, `Grab/Taxi`, `Bảo dưỡng`).
  * Bấm nhiều tag sẽ tự động nối bằng dấu phẩy (ví dụ: `"Đổ xăng, Gửi xe"`).
  * Nút **`+ Thêm tag`** cho phép tạo mới Quick Tag ngay tại màn hình ghi chép và lưu vĩnh viễn vào hạng mục đó.

---

### MODULE 3: GHI CHÉP GIAO DỊCH HÀNG NGÀY SIÊU TỐC (DAILY TRANSACTION ENTRY)
* **FR-T-01: Bàn phím Numpad tích hợp Máy tính & Phím `000`:**
  * Có phím `000` (chặn bấm khi đang là `0`), tự động tính biểu thức `+`, `-`, `×`, `÷` ngay khi gõ và tự động evaluate ra kết quả cuối cùng khi bấm **Lưu**.
  * Hỗ trợ gõ trực tiếp từ bàn phím cứng khi dùng trên máy tính (PC/Laptop).
* **FR-T-02: Tính năng tăng tốc ghi chép hàng ngày (Chuẩn MISA Sổ Thu Chi):**
  * **Nút "Lưu & Ghi tiếp" (Save & Continue):** Lưu giao dịch hiện tại, giữ nguyên Ngày và Ví vừa chọn, reset số tiền về `0` để nhập ngay món tiếp theo (cực kỳ tiện khi nhập hóa đơn đi chợ nhiều món hoặc tổng kết chi tiêu cuối ngày).
  * **Nút "Nhân bản giao dịch" (Duplicate Transaction):** Trong màn hình chi tiết giao dịch cũ, có nút **"Sao chép / Nhân bản"** để tạo nhanh một giao dịch mới có cùng số tiền, hạng mục, ví và ghi chú nhưng lấy ngày hôm nay.
  * **Tùy chọn "Không tính vào báo cáo" (`excludeFromReport`):** Cho phép đánh dấu các khoản chi hộ / ứng trước cho người khác để vẫn trừ tiền trong ví thực tế nhưng không làm sai lệch báo cáo chi tiêu cá nhân.
  * **Chọn Ngày & Giờ linh hoạt:** Bộ chọn ngày trực quan (kèm nút nhanh *Hôm nay*, *Hôm qua*) và chọn giờ giao dịch.
* **FR-T-03: Hoàn tác số dư nguyên tử (Atomic Balance Revert):**
  * Mọi thao tác Thêm / Sửa / Xóa giao dịch bắt buộc chạy trong `db.transaction('rw', [db.wallets, db.transactions, ...])`.
  * Khi Sửa hoặc Xóa: Luôn hoàn tác chính xác tác động số dư của `oldTx` trên ví cũ trước khi áp dụng `newTx` lên ví mới.

---

### MODULE 4: QUẢN LÝ CÔNG NỢ - SỔ VAY & CHO VAY (DEBT & LOAN TRACKING MODULE)
* **FR-D-01: Tách biệt dòng tiền Vay/Nợ khỏi Thu/Chi tiêu dùng:**
  * Giao dịch `LEND` (Cho vay) và `PAY_DEBT` (Trả nợ) làm giảm số dư ví nhưng **không tính vào Chi tiêu tiêu dùng** mặc định trong báo cáo cơ cấu chi (tránh làm ảo chi tiêu tháng).
  * Giao dịch `BORROW` (Đi vay) và `COLLECT_DEBT` (Thu nợ) làm tăng số dư ví nhưng **không tính vào Thu nhập kiếm được**.
* **FR-D-02: Theo dõi theo Người vay / Chủ nợ (`contactName`):**
  * Khi chọn tab `Cho vay`, `Đi vay`, `Thu nợ`, `Trả nợ`, hiển thị ô nhập/chọn nhanh **Người giao dịch (`contactName`)** (gợi ý danh sách những người đã từng giao dịch trước đó).
* **FR-D-03: Bảng tổng hợp Sổ Nợ (Debt Dashboard):**
  * Thống kê rõ 2 cột giống MISA Sổ Thu Chi:
    1. **Cần thu (Người khác nợ mình):** Tổng cho vay (`LEND`) trừ đi Tổng đã thu nợ (`COLLECT_DEBT`) theo từng người. Có nút **"Thu nợ"** 1 chạm để tự động điền form thu hồi số tiền còn lại.
    2. **Phải trả (Mình nợ người khác):** Tổng đi vay (`BORROW`) trừ đi Tổng đã trả nợ (`PAY_DEBT`) theo từng người. Có nút **"Trả nợ"** 1 chạm.

---

### MODULE 5: GHI CHÉP ĐỊNH KỲ & SỰ KIỆN / CHUYẾN ĐI (RECURRING & EVENTS MODULE)
* **FR-R-01: Giao dịch định kỳ (Recurring Transactions):**
  * Cho phép tạo các mẫu giao dịch lặp lại: Tiền thuê nhà, Điện nước, Internet, Gói đăng ký (Netflix, Spotify, Youtube, iCloud), Lương cứng...
  * Chu kỳ lặp: Hàng ngày (`DAILY`), Hàng tuần (`WEEKLY`), Hàng tháng (`MONTHLY`), Hàng năm (`YEARLY`).
  * Khi mở ứng dụng mỗi ngày, hệ thống kiểm tra các khoản định kỳ có `nextRunDate <= today`:
    * Nếu `autoCreate = true`: Tự động tạo giao dịch, cập nhật số dư ví, đẩy `nextRunDate` sang kỳ tiếp theo và hiện thông báo Toast cho người dùng biết.
    * Nếu `autoCreate = false`: Hiển thị thẻ nhắc nhở "Đến hạn thanh toán" để người dùng bấm **"Ghi sổ ngay"** hoặc chỉnh sửa số tiền thực tế (ví dụ tiền điện mỗi tháng khác nhau).
* **FR-V-01: Quản lý Sự kiện / Chuyến đi (Events & Trips):**
  * Tạo sự kiện (ví dụ: *"Du lịch Đà Nẵng"*, *"Tết Nguyên Đán"*, *"Đám cưới bạn"*).
  * Khi ghi chép giao dịch hàng ngày, có thể gắn giao dịch vào một Sự kiện đang diễn ra.
  * Báo cáo riêng cho từng Sự kiện: Tổng tiền đã chi cho sự kiện đó, danh sách các khoản chi theo ngày giúp quyết toán hoặc chia tiền nhóm dễ dàng.

---

### MODULE 6: BÁO CÁO PHÂN TÍCH ĐA CHIỀU & NGÂN SÁCH 2 TẦNG (ANALYTICS & BUDGETS)
* **FR-A-01: Báo cáo gom nhóm 2 tầng (Cha – Con) & Phân tích 50/30/20:**
  * Chế độ xem **Theo Nhóm Cha** (*Must Have / Nice to Have / Wasted*) giúp người dùng biết ngay tỷ lệ chi tiêu Thiết yếu vs Giải trí vs Lãng phí trong tháng chiếm bao nhiêu %.
  * Chế độ xem **Theo Hạng mục Chi tiết** với biểu đồ Donut trực quan, so sánh cùng kỳ tháng trước (`MoM %`) và tính năng **Drill-down** bấm vào xem danh sách giao dịch chi tiết.
* **FR-A-02: Báo cáo Tình hình Tài chính & Xu hướng Dòng tiền:**
  * Biểu đồ cột so sánh Thu nhập vs Chi tiêu và Dòng tiền ròng (`Net = Thu - Chi`) qua 6 tháng gần nhất.
  * Thống kê trung bình chi tiêu/ngày trong tháng và dự báo chi tiêu cuối tháng.
* **FR-B-01: Hạn mức chi tiêu (Budget) hỗ trợ cả Hạng mục Cha & Con:**
  * Cho phép đặt hạn mức tổng cả tháng, đặt hạn mức cho nhóm Cha (tự động cộng tổng chi của tất cả các mục con thuộc nhóm đó) hoặc đặt hạn mức cho từng hạng mục con cụ thể.
  * Thanh tiến độ cảnh báo 3 cấp màu (Xanh `< 70%`, Vàng `70% - 99%`, Đỏ `>= 100%`), tính toán **Số tiền được phép tiêu an toàn mỗi ngày** cho những ngày còn lại của tháng.
  * Nút **"Sao chép hạn mức từ tháng trước"** bằng 1 chạm.

---

### MODULE 7: ĐỒNG BỘ ĐÁM MÂY GOOGLE DRIVE & XUẤT BÁO CÁO (SYNC & BACKUP)
* **FR-S-01: Đồng bộ 2 chiều thông minh qua Google Drive (Smart Two-Way Sync):**
  * Đăng nhập bằng Google OAuth 2.0 (hỗ trợ cấu hình Custom Client ID trực tiếp trên giao diện để tương thích mọi tên miền triển khai).
  * Hợp nhất dữ liệu thông minh (Merge by ID + `updatedAt` + Tombstone `deletedIds`) giữa Máy tính và Điện thoại thông qua tệp `SoThuChi_SyncData.json` trên Google Drive mà không làm mất giao dịch ở bất kỳ thiết bị nào.
  * Nút **"Sao lưu ngay lên Google Drive"** tạo các bản snapshot dự phòng trong thư mục `SoThuChi_Backups` trên Google Drive.
* **FR-S-02: Lưu trữ & Xuất báo cáo Ngoại tuyến (Offline Export):**
  * Xuất báo cáo bảng tính **Excel (`.xlsx`)** gồm 3 sheets: *Tổng hợp thu chi*, *Chi tiết giao dịch*, *Danh sách tài khoản ví*.
  * Tải tệp JSON về máy (Offline) & Khôi phục dữ liệu từ tệp JSON có màn hình **Xem trước (Preview)** kiểm tra tính hợp lệ trước khi ghi đè.

---

## 4. LỘ TRÌNH HOÀN THIỆN TIẾP THEO (ROADMAP V3.0)

| Giai đoạn | Hạng mục nâng cấp chuẩn MISA Sổ Thu Chi | Trạng thái |
| :--- | :--- | :--- |
| **P1 - P8** | Nền tảng PWA + Responsive Web Desktop/Mobile, Đa ví (Preset ngân hàng VN), Hạng mục 2 tầng + Gắn sao, Numpad `000`, Lịch sử & Lọc đa năng, Báo cáo MoM & Drill-down, Hạn mức tháng, Đồng bộ Google Drive 2 chiều & Xuất Excel. | ✅ **Đã hoàn thành** |
| **P9** | **Tối ưu Ghi chép Hàng ngày & Chuẩn hóa Dòng tiền Vay/Nợ:**<br>• Bổ sung nút **"Lưu & Ghi tiếp"** và **"Nhân bản giao dịch"**.<br>• Bổ sung **Phí chuyển khoản (`transferFee`)** và tích chọn **"Không tính vào báo cáo" (`excludeFromReport`)**.<br>• Tách riêng dòng tiền `LEND`/`BORROW`/`COLLECT_DEBT`/`PAY_DEBT` khỏi báo cáo Thu/Chi tiêu dùng và bổ sung trường **Người vay/Chủ nợ (`contactName`)**. | 🚀 **Ưu tiên tiếp theo** |
| **P10** | **Báo cáo & Ngân sách gom nhóm 2 tầng (Cha – Con):**<br>• Chế độ xem báo cáo theo nhóm Cha (*Must Have / Nice to Have / Wasted*) và tính ngân sách cộng gộp các mục con vào mục cha. | 📋 **Kế hoạch V3.0** |
| **P11** | **Sổ Nợ (Debt Manager), Ghi chép Định kỳ & Sự kiện/Chuyến đi:**<br>• Kích hoạt tính năng **Ghi chép định kỳ** và **Sự kiện / Chia tiền du lịch** trong tab *Khác*.<br>• Màn hình tổng hợp Sổ nợ theo từng đối tượng kèm nút *Thu nợ / Trả nợ* 1 chạm. | 📋 **Kế hoạch V3.0** |
