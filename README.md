# Sổ Thu Chi Cá Nhân (Money Management) 📱💰

Ứng dụng quản lý thu chi cá nhân cực nhanh theo chuẩn **PWA (Progressive Web App)** tối ưu cho **iOS Safari (Add to Home Screen)**.

- **Mô hình:** Local-First 100% với IndexedDB (`Dexie.js`)
- **Chi phí vận hành:** **0 VNĐ trọn đời** (Không cần server backend, không cloud database thuê ngoài, không bị khóa sau 7 ngày).
- **Trải nghiệm:** Chạy toàn màn hình, hỗ trợ Safe Area Insets, hoạt động offline hoàn toàn khi không có mạng.

---

## ✨ Tính năng nổi bật

1. **Bàn phím số Numpad chuyên dụng:**
   - Phím **`000`** nhập nhanh tiền VNĐ.
   - Hỗ trợ tính toán nhanh `+ - × ÷` ngay trên form nhập.
   - **Thanh Quick Tags:** Gợi ý ghi chú nhanh theo danh mục (Ăn sáng, Cà phê, Đổ xăng...) chỉ với 1 chạm.

2. **Cơ chế Hoàn tác số dư (Atomic Revert Balance):**
   - Đảm bảo tính nhất quán tuyệt đối của số dư ví khi Sửa hoặc Xóa bất kỳ giao dịch nào trong 1 ACID Transaction.

3. **Đồng bộ Đám mây Supabase & Sao lưu JSON:**
   - **Đồng bộ tức thì 2 chiều (Cloud Sync):** Sử dụng Supabase hoàn toàn miễn phí trọn đời, tự động hợp nhất dữ liệu (Smart Merge) giữa điện thoại và máy tính mà không bao giờ bị ghi đè hay mất giao dịch.
   - **Sao lưu & Phục hồi JSON:** Xuất file backup JSON thủ công lưu trên máy hoặc iCloud Drive.
   - **Xuất báo cáo Excel (.xlsx):** Xuất bảng tính đầy đủ phân tích thu chi.

---

## 🚀 Hướng dẫn cài đặt & Chạy trên máy tính

```bash
# Cài đặt dependencies
npm install

# Khởi chạy server local cho phép điện thoại truy cập qua Wi-Fi
npm run dev -- --host

# Build bản production
npm run build
```

---

## 📲 Hướng dẫn cài đặt lên iPhone

1. Đảm bảo iPhone kết nối cùng mạng Wi-Fi với máy tính.
2. Mở trình duyệt **Safari** trên iPhone, truy cập địa chỉ IP máy tính (ví dụ: `http://192.168.1.184:5173`).
3. Bấm nút **Chia sẻ** (Share icon $\uparrow$) ở đáy màn hình Safari.
4. Chọn **"Thêm vào Màn hình chính" (Add to Home Screen)**.
5. Biểu tượng **Sổ Thu Chi** sẽ xuất hiện trên màn hình chính của iPhone và mở full màn hình như một ứng dụng native thực thụ.
