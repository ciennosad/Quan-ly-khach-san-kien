# LUXORA HOTEL — Fix email xác nhận / hóa đơn

## Đã sửa

### 1. Mã booking
- Email xác nhận đặt cọc và email hóa đơn đều hiển thị **MÃ BOOKING** rõ ràng, kích thước lớn.
- Mã booking vẫn được hiển thị lại trong bảng thông tin để tránh khách không tìm thấy.

### 2. QR booking trong email
- Trước đây QR được nhúng trực tiếp bằng `data:image/...` trong HTML email.
- Cách này có thể bị Gmail/client email loại bỏ, dẫn đến ô QR không hiển thị.
- Đã đổi sang **inline CID attachment** (`cid:booking-qr@luxora.hotel`) bằng Nodemailer.
- QR được gửi kèm email dưới dạng PNG nên Gmail có thể hiển thị trực tiếp.

### 3. Lịch sử thanh toán
Các mã kỹ thuật không còn hiển thị trực tiếp cho khách. Đã đổi thành tiếng Việt:
- `DEPOSIT` → **Tiền cọc**
- `BALANCE` → **Thanh toán phần còn lại**
- `REFUND` → **Hoàn tiền**
- `BANK_TRANSFER` → **Chuyển khoản ngân hàng**
- `CASH` → **Tiền mặt**
- `MANUAL` → **Thanh toán thủ công**
- `SUCCESS` → **Đã thanh toán**
- `PENDING` → **Chờ xác nhận**
- `REJECTED` → **Đã từ chối**
- `PROCESSING` → **Đang xử lý**

### 4. Test hóa đơn
`test-invoice-email.js` cũng được cập nhật cùng giao diện:
- Mã booking rõ ràng.
- Lịch sử thanh toán tiếng Việt.
- QR booking gửi dạng inline attachment.

### 5. SMTP Gmail thật
- Không hard-code tài khoản/mật khẩu Gmail.
- Vẫn dùng `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` từ `.env`.
- Không đưa `.env` vào ZIP.

## Kiểm tra
- `node --check backend/src/routes/DuongDanAPI.js` — PASS
- `node --check backend/src/utils/ThuDienTu.js` — PASS
- `node --check backend/test-invoice-email.js` — PASS
- Frontend Vite build chưa thể hoàn tất trong môi trường này vì package Rollup native Linux `@rollup/rollup-linux-x64-gnu` không có trong `node_modules`; đây là lỗi dependency của môi trường, không phải lỗi cú pháp phần email.

## Vì sao Gmail đưa email vào Spam?
Việc thư vào Spam không đồng nghĩa SMTP gửi thất bại. Gmail tự phân loại thư dựa trên nhiều tín hiệu như uy tín người gửi, nội dung, tần suất gửi, lịch sử tương tác và xác thực domain.

Nếu dùng Gmail cá nhân làm SMTP gửi tự động, không thể đảm bảo 100% thư sẽ vào Inbox. Với môi trường thật nên:
1. Dùng một địa chỉ gửi cố định.
2. Không thay đổi `SMTP_FROM` thành địa chỉ khác `SMTP_USER` nếu không có cấu hình phù hợp.
3. Người nhận có thể bấm **Không phải spam** và thêm địa chỉ gửi vào danh bạ.
4. Nếu triển khai tên miền riêng của khách sạn, nên cấu hình SPF, DKIM và DMARC cho tên miền gửi để cải thiện khả năng vào Inbox.
