# TÀI LIỆU YÊU CẦU CHỨC NĂNG (FRD) & KẾ HOẠCH TRIỂN KHAI V2.0
## DỰ ÁN: SỔ THU CHI CÁ NHÂN (PWA CHUẨN IOS - LOCAL-FIRST 100% - 0 ĐỒNG CHI PHÍ)

---

## 1. TỔNG QUAN HỆ THỐNG & ĐỊNH HƯỚNG CÔNG NGHỆ

### 1.1 Mục tiêu dự án
* **Nền tảng:** Progressive Web App (PWA) tối ưu hóa giao diện và trải nghiệm cảm ứng theo chuẩn iOS Safari ("Thêm vào Màn hình chính" / Add to Home Screen).
* **Trải nghiệm:** Chạy toàn màn hình (Standalone display), không thanh URL, có icon ứng dụng trên màn hình chính của iPhone, hoạt động offline 100% ngoài đường mà không cần bật máy tính hay kết nối Internet.
* **Chi phí vận hành:** **0 VNĐ trọn đời** (Không máy chủ, không cloud database bên ngoài, không lo bị tạm dừng sau 7 ngày).
* **Hiệu năng & Bảo mật:** Dữ liệu lưu 100% trong bộ nhớ iPhone bằng **IndexedDB (qua thư viện Dexie.js)**. Tốc độ đọc/ghi tức thì, an toàn tuyệt đối.

### 1.2 Công nghệ cốt lõi
* **Frontend:** React + Vite + TypeScript.
* **Styling & Design System:** TailwindCSS + iOS Human Interface Guidelines (Dynamic Safe Area Insets, Smooth transitions, Touch visual feedback, Rounded cards).
* **Database (Local-First):** `Dexie.js` (Wrapper mạnh mẽ nhất của IndexedDB trên trình duyệt, hỗ trợ ACID Transactions, Reactive Hooks, Schema Indexing).
* **State Management:** Zustand + Dexie liveQuery.
* **Icon:** `lucide-react`.
* **Biểu đồ:** Recharts hoặc Chart.js (tương thích hoàn hảo với touch/drill-down trên di động).
* **Xuất file:** `xlsx` (SheetJS xuất Excel) và Native Web Share API (`navigator.share`) để gửi file backup JSON/Excel qua AirDrop, Zalo, Mail, Tệp.

---

## 2. THIẾT KẾ CƠ SỞ DỮ LIỆU (DEXIE.JS / INDEXEDDB SCHEMA)

```typescript
// Định nghĩa Database Schema trong Dexie.js
export interface Wallet {
  id: string;               // UUID v4
  name: string;             // Ví dụ: 'Tiền mặt', 'Vietcombank', 'Ví MoMo'
  type: 'CASH' | 'BANK' | 'E_WALLET' | 'CREDIT';
  balance: number;          // Số dư hiện tại (VNĐ)
  initialBalance: number;   // Số dư khởi tạo ban đầu
  currency: 'VND';
  icon: string;             // Tên Lucide Icon
  color: string;            // Mã màu HEX
  isExcludedFromTotal: boolean; // true: không tính vào tổng tài sản
  createdAt: string;        // ISO 8601
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;             // Ví dụ: 'Ăn uống', 'Lương', 'Đi lại'
  type: 'EXPENSE' | 'INCOME';
  icon: string;             // Tên Lucide Icon
  color: string;            // Mã màu HEX
  quickTags?: string[];     // Danh sách gợi ý ghi chú nhanh (vd: ['Ăn sáng', 'Cà phê', 'Cơm trưa'])
  isDefault: boolean;
  createdAt: string;
}

export interface Transaction {
  id: string;
  walletId: string;         // Ví nguồn
  toWalletId?: string;      // Ví đích (chỉ dùng khi type = 'TRANSFER')
  categoryId?: string;      // ID danh mục (null nếu là TRANSFER)
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amount: number;           // Số tiền (> 0)
  date: string;             // 'YYYY-MM-DD'
  time: string;             // 'HH:mm'
  note?: string;            // Ghi chú giao dịch
  createdAt: string;
}

export interface Budget {
  id: string;
  categoryId?: string;      // null nếu là hạn mức tổng tháng
  amount: number;           // Số tiền hạn mức
  month: string;            // 'YYYY-MM' (Ví dụ: '2026-10')
  createdAt: string;
}

export interface Setting {
  key: string;              // 'app_theme', 'user_name', 'last_backup', etc.
  value: any;
}
```

---

## 3. ĐẶC TẢ CHI TIẾT CÁC MODULE CHỨC NĂNG (FRD V2.0)

---

### MODULE 1: QUẢN LÝ VÍ & TÀI KHOẢN (WALLET MODULE)
* **FR-W-01: Danh sách ví & Tổng tài sản:**
  * Thẻ tổng quan hiển thị Tổng số dư khả dụng (không cộng các ví `isExcludedFromTotal = true`).
  * Danh sách phân nhóm: Tiền mặt, Ngân hàng, Ví điện tử, Thẻ tín dụng. Hiển thị số dư định dạng chuẩn `1.500.000 ₫`.
* **FR-W-02: Tạo mới & Sửa ví:**
  * Nhập: Tên ví, Loại ví, Số dư ban đầu, chọn Icon, chọn Mã màu, Tùy chọn bỏ qua khỏi tổng tài sản.
* **FR-W-03: Chuyển tiền nội bộ (Transfer):**
  * Nhập: Ví gửi (`walletId`), Ví nhận (`toWalletId`), Số tiền chuyển, Ngày giờ, Ghi chú.
  * **Xử lý Atomic Transaction trong Dexie:** Giảm số dư Ví gửi, tăng số dư Ví nhận, ghi 1 bản ghi giao dịch loại `TRANSFER`.
* **FR-W-04: Xóa ví:**
  * Kiểm tra an toàn: Nếu ví đã có giao dịch phát sinh, chặn xóa và hiển thị cảnh báo yêu cầu xóa hoặc đổi ví các giao dịch liên quan trước.

---

### MODULE 2: DANH MỤC THU / CHI & QUICK TAGS (CATEGORY MODULE)
* **FR-C-01: Bộ danh mục chuẩn hóa Việt Nam (Seed Data kèm Quick Tags):**
  * **Chi tiêu (EXPENSE):**
    * 🍔 **Ăn uống** (Icon: `Utensils`, Màu: `#F97316`) ➡️ *Quick Tags: `['Ăn sáng', 'Cơm trưa', 'Cơm tối', 'Cà phê', 'Trà sữa', 'Ăn vặt']`*
    * 🚗 **Đi lại / Xăng xe** (Icon: `Car`, Màu: `#3B82F6`) ➡️ *Quick Tags: `['Đổ xăng', 'Gửi xe', 'Grab/Taxi', 'Rửa xe', 'Bảo dưỡng']`*
    * 🛒 **Đi chợ / Siêu thị** (Icon: `ShoppingBag`, Màu: `#8B5CF6`) ➡️ *Quick Tags: `['Thịt cá rau', 'Gia vị', 'Đồ dùng nhà tắm', 'Bách hóa']`*
    * 🏠 **Hóa đơn nhà cửa** (Icon: `Home`, Màu: `#EAB308`) ➡️ *Quick Tags: `['Tiền nhà', 'Tiền điện', 'Tiền nước', 'Internet', 'Phí dịch vụ']`*
    * 💊 **Y tế & Sức khỏe** (Icon: `HeartPulse`, Màu: `#EF4444`) ➡️ *Quick Tags: `['Thuốc men', 'Khám bệnh', 'Nha khoa', 'Vitamin/Thực phẩm chức năng']`*
    * 🎮 **Giải trí & Gặp gỡ** (Icon: `PartyPopper`, Màu: `#EC4899`) ➡️ *Quick Tags: `['Xem phim', 'Nhậu với bạn', 'Du lịch', 'Game/App']`*
    * 📚 **Phát triển bản thân** (Icon: `GraduationCap`, Màu: `#10B981`) ➡️ *Quick Tags: `['Sách', 'Khóa học', 'Dụng cụ học tập']`*
    * 🎁 **Hiếu hỉ & Quà cáp** (Icon: `Gift`, Màu: `#06B6D4`) ➡️ *Quick Tags: `['Đám cưới', 'Sinh nhật', 'Biếu bố mẹ', 'Mừng lễ']`*
    * 📦 **Chi tiêu khác** (Icon: `MoreHorizontal`, Màu: `#6B7280`) ➡️ *Quick Tags: `['Rút tiền', 'Chi đột xuất']`*
  * **Thu nhập (INCOME):**
    * 💰 **Lương chính** (Icon: `Banknote`, Màu: `#059669`) ➡️ *Quick Tags: `['Lương cứng', 'Lương chuyển khoản']`*
    * 📈 **Thưởng & Làm thêm** (Icon: `TrendingUp`, Màu: `#2563EB`) ➡️ *Quick Tags: `['Thưởng KPI', 'Dự án ngoài', 'Overtime']`*
    * 🪙 **Thu nhập khác** (Icon: `Coins`, Màu: `#D97706`) ➡️ *Quick Tags: `['Được tặng', 'Bán đồ cũ', 'Lãi tiết kiệm']`*
* **FR-C-02: Tùy biến danh mục:**
  * Cho phép thêm danh mục mới, chỉnh sửa icon, mã màu và bổ sung danh sách Quick Tags.

---

### MODULE 3: GHI CHÉP GIAO DỊCH CỰC NHANH (FAST TRANSACTION ENTRY)
* **FR-T-01: Bàn phím số tích hợp (Custom Numpad với phím `000`):**
  * Thiết kế bàn phím số riêng chiếm nửa dưới màn hình:
    * Hàng phím số: `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `C`, `0`, **`000`** (bấm `5` rồi bấm `000` thành `5.000`, bấm thêm lần nữa thành `5.000.000`).
    * Hàng phím tính toán nhanh: `+`, `-`, `x`, `÷` (cho phép tính gộp nhiều món ngay trên form nhập: vd: `35000 + 42000`).
    * Nút **"LƯU"** to nổi bật, dễ bấm bằng ngón tay cái trên iPhone.
* **FR-T-02: Hàng gợi ý ghi chú nhanh (Quick Tags Bar):**
  * Khi chọn danh mục (ví dụ: Ăn uống), hệ thống ngay lập tức hiển thị một hàng ngang các Quick Tags tương ứng (`Ăn sáng`, `Cơm trưa`, `Cà phê`...).
  * Chạm 1 lần vào tag để điền nhanh vào ô ghi chú mà không cần gõ bàn phím chữ.
* **FR-T-03: Logic Thêm giao dịch (Create Transaction):**
  * Thực thi trong `Dexie Transaction`:
    * Tạo record trong bảng `transactions`.
    * Cập nhật số dư ví:
      * Nếu `EXPENSE`: `wallet.balance = wallet.balance - amount`
      * Nếu `INCOME`: `wallet.balance = wallet.balance + amount`
      * Nếu `TRANSFER`: `wallet.balance = wallet.balance - amount`, `toWallet.balance = toWallet.balance + amount`
* **FR-T-04: Logic SỬA / XÓA giao dịch có hoàn tác số dư (Atomic Revert Balance):**
  * **Quy tắc bắt buộc khi CẬP NHẬT giao dịch (Update):**
    1. Lấy dữ liệu giao dịch cũ (`oldTx`) trước khi sửa.
    2. **Hoàn tác số dư cũ:**
       * Nếu `oldTx.type == 'EXPENSE'`: hoàn trả số tiền cũ vào ví cũ (`oldWallet.balance += oldTx.amount`).
       * Nếu `oldTx.type == 'INCOME'`: trừ lại số tiền cũ khỏi ví cũ (`oldWallet.balance -= oldTx.amount`).
       * Nếu `oldTx.type == 'TRANSFER'`: trả tiền về ví gửi cũ (`oldWallet.balance += oldTx.amount`) và trừ tiền khỏi ví nhận cũ (`oldToWallet.balance -= oldTx.amount`).
    3. **Áp dụng số dư mới (`newTx`):**
       * Áp dụng tương tự bước Thêm mới vào ví mới (`newWallet`, `newToWallet`).
    4. Toàn bộ bước (2) và (3) phải chạy trong **cùng 1 `db.transaction('rw', [db.wallets, db.transactions], ...)`**.
  * **Quy tắc bắt buộc khi XÓA giao dịch (Delete):**
    1. Thực hiện bước (2) Hoàn tác số dư.
    2. Xóa record khỏi bảng `transactions`.

---

### MODULE 4: LỊCH SỬ & BÁO CÁO THÁNG THÔNG MINH (ANALYTICS & DRILL-DOWN)
* **FR-A-01: Sổ lịch sử Timeline:**
  * Nhóm theo Ngày: Mỗi ngày có header hiển thị Thứ/Ngày và tổng Chi tiêu/Thu nhập trong ngày.
  * Chạm vào từng giao dịch để xem chi tiết / chỉnh sửa / xóa.
* **FR-A-02: Phân tích so sánh tháng liền trước (MoM - Month-over-Month):**
  * Hiển thị tỷ lệ biến động:
    * Tổng chi tiêu tháng này so với tháng trước: hiển thị Badge chỉ số ví dụ `+15.2%` (Màu đỏ - chi nhiều hơn) hoặc `-8.4%` (Màu xanh - tiết kiệm hơn).
    * So sánh từng danh mục: Bên cạnh mỗi danh mục có hiển thị chênh lệch số tiền và % so với tháng trước để người dùng biết danh mục nào đang bị "vung tay quá trán".
* **FR-A-03: Biểu đồ tròn cơ cấu chi & Drill-down chi tiết:**
  * Biểu đồ Donut hiển thị tỷ lệ % các nhóm chi tiêu trong tháng.
  * **Tính năng Drill-down:** Người dùng bấm trực tiếp vào một miếng trên biểu đồ hoặc bấm vào một danh mục trong danh sách ➡️ Ứng dụng mở ngay **Màn hình/Modal danh sách chi tiết tất cả các giao dịch của danh mục đó trong tháng** để rà soát cụ thể từng khoản chi.
* **FR-A-04: Biểu đồ cột Thu nhập vs Chi tiêu:**
  * So sánh các tháng gần nhất để theo dõi xu hướng tích lũy và dòng tiền ròng (Net = Thu - Chi).

---

### MODULE 5: QUẢN LÝ HẠN MỨC & SAO CHÉP HẠN MỨC (BUDGET MODULE)
* **FR-B-01: Thiết lập hạn mức chi tiêu:**
  * Hạn mức tổng cho cả tháng hoặc hạn mức riêng cho từng danh mục.
* **FR-B-02: Sao chép hạn mức từ tháng trước (Copy Budgets):**
  * Nút bấm nổi bật: **"Sao chép hạn mức tháng trước"** khi sang tháng mới.
  * Tự động quét toàn bộ hạn mức của tháng liền trước (`YYYY-(MM-1)`) và nhân bản sang tháng hiện tại chỉ với 1 chạm.
* **FR-B-03: Giám sát & Cảnh báo thông minh:**
  * Thanh tiến độ đổi màu:
    * Xanh lá: < 70% hạn mức (An toàn).
    * Vàng cam: 70% - 99% (Cần chú ý).
    * Đỏ rực: >= 100% (Vượt ngân sách).
  * Hiển thị số tiền còn lại được phép chi và số tiền trung bình an toàn mỗi ngày đến hết tháng.

---

### MODULE 6: SAO LƯU & XUẤT DỮ LIỆU ĐỘC LẬP (BACKUP & EXPORT)
* **FR-E-01: Xuất báo cáo Excel (.xlsx):**
  * Xuất bảng kê chi tiết và bảng tổng hợp thu chi theo tháng dạng file Excel chuẩn.
  * Kích hoạt Native Web Share API (`navigator.share`) để gửi qua Zalo, Mail, AirDrop hoặc lưu vào app Tệp trên iPhone.
* **FR-E-02: Sao lưu đầy đủ (Full JSON Backup):**
  * Xuất 100% dữ liệu (Wallets, Categories, Transactions, Budgets, Settings) thành 1 file `.json`.
  * Không phụ thuộc bất kỳ file ảnh nào, đảm bảo sao lưu và phục hồi thành công 100%.
* **FR-E-03: Khôi phục dữ liệu (Restore Data):**
  * Tải lên file JSON backup, xác thực cấu trúc trước khi ghi đè vào IndexedDB.
* **FR-E-04: Tự động sao lưu hàng ngày (Auto-Backup & Background Trigger):**
  * **Cấu hình trong Cài đặt (Settings):**
    * Tùy chọn Bật/Tắt `auto_backup_enabled` (lưu trong bảng `settings` của Dexie).
    * Chọn khung giờ sao lưu hàng ngày `auto_backup_time` (mặc định: `21:00`).
    * Ghi nhớ ngày sao lưu tự động thành công gần nhất `last_auto_backup_date` (`YYYY-MM-DD`).
  * **Cơ chế kiểm tra ngầm khi khởi động ứng dụng (App Initialization Check):**
    * Mỗi khi ứng dụng khởi chạy hoặc hoạt động: nếu `auto_backup_enabled === true` và hôm nay chưa sao lưu lần nào (`last_auto_backup_date !== today`), hệ thống sẽ tự động gọi logic xuất file JSON đầy đủ toàn bộ dữ liệu.
    * Kích hoạt `navigator.share()` (trên iOS/Safari để lưu vào app Tệp hoặc gửi qua AirDrop/Zalo) hoặc tự động tải file `.json` về máy.
    * Sau khi xuất thành công, cập nhật ngay `last_auto_backup_date` thành ngày hiện tại để không lặp lại trong ngày.

---

## 4. KẾ HOẠCH TRIỂN KHAI THEO GIAI ĐOẠN (ROADMAP)

| Giai đoạn | Nội dung thực hiện | Bàn giao (Deliverables) |
| :--- | :--- | :--- |
| **P1** | **Khởi tạo PWA & Cấu hình Dexie.js Database** | Khởi tạo dự án Vite React TypeScript, cấu hình PWA Manifest + Service Worker, khởi tạo Dexie DB Schema, bộ Seed Data danh mục kèm Quick Tags. |
| **P2** | **Module Ví & Quản lý Dòng tiền** | UI Danh sách ví, Thêm/Sửa ví, Chuyển tiền nội bộ giữa các ví, tính toán số dư. |
| **P3** | **Module Ghi chép Nhanh & Numpad (`000` + Quick Tags)** | Form nhập liệu cực nhanh, bàn phím số có phím `000` và tính toán `+ - x ÷`, thanh Quick Tags, Atomic Balance Revert. |
| **P4** | **Module Lịch sử & Sổ giao dịch** | Timeline giao dịch theo ngày, bộ lọc, chức năng Sửa/Xóa giao dịch có hoàn tác số dư. |
| **P5** | **Module Báo cáo Tháng (MoM & Drill-down)** | Biểu đồ tròn cơ cấu chi, tính năng Drill-down xem chi tiết giao dịch danh mục, so sánh % tăng giảm với tháng trước. |
| **P6** | **Module Hạn mức (Budget & Copy tháng trước)** | Thiết lập ngân sách, thanh tiến độ cảnh báo, nút "Sao chép hạn mức từ tháng trước". |
| **P7** | **Module Xuất Excel & Backup/Restore JSON** | Xuất file Excel (.xlsx), Backup & Restore JSON, tích hợp Web Share API. |
| **P8** | **Hoàn thiện PWA iOS & Tối ưu Trải nghiệm Home Screen** | Thử nghiệm trên Safari iPhone (Add to Home Screen), tối ưu hóa Safe Area, Offline Caching. |
