# LUXORA HOTEL — Full Stack Booking & Hotel Management

Bộ source đồ án theo tài liệu yêu cầu:
- React + Vite + JavaScript + CSS
- Node.js + Express
- PostgreSQL
- JWT + refresh token + RBAC
- Booking chống trùng
- QR booking
- Check-in / Check-out
- Dịch vụ + hóa đơn
- Payment webhook mẫu (sẵn điểm tích hợp VietQR/cổng thanh toán)
- Forgot password
- Audit log
- Admin / Manager / Receptionist / Customer
- Dashboard
- Export CSV (mở được bằng Excel)
- Giao diện responsive, hiện đại
- Refresh token tự động + logout revoke token
- Tính giá booking theo số đêm + kiểm tra sức chứa khách
- Chuẩn hóa upload/ảnh và validation tiền cọc

## 1. Chạy backend
```bash
cd backend
cp .env.example .env
npm install
npm run db:init
npm run db:seed
npm run dev
```

## 2. Chạy frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:4000

## Tài khoản khởi tạo
Chỉ có sẵn 1 tài khoản Admin để đăng nhập lần đầu:
admin@example.com
Admin@12345

Sau khi đăng nhập, vào Tài khoản > Bảo mật để đổi mật khẩu, và vào Quản lý > Người dùng > "Tạo tài khoản mới" để tự tạo thêm tài khoản Quản lý/Lễ tân/Khách hàng theo nhu cầu thực tế.

## Production
- Không commit `.env`
- Thay PAYMENT_* bằng thông tin nhà cung cấp thật
- Cấu hình SMTP thật để gửi email
- Dùng HTTPS
- Deploy frontend/backend trên Render, PostgreSQL trên Neon
- Webhook payment phải kiểm tra chữ ký của nhà cung cấp thật

## Sao lưu / khôi phục database
```bash
cd backend
bash scripts/SaoLuu.sh                        # tạo file backups/backup_<ngày giờ>.sql
bash scripts/PhucHoi.sh backups/backup_xxx.sql # khôi phục từ 1 file backup
```
Lưu ý: nếu deploy database bằng Neon, Neon đã tự động sao lưu và hỗ trợ khôi phục theo thời điểm (point-in-time restore) sẵn — 2 script trên chủ yếu dùng cho môi trường phát triển cục bộ.

## Báo cáo sửa lỗi
Xem `FIX_REPORT.md` để biết chi tiết các lỗi đã được sửa, phạm vi xác nhận và checklist kiểm thử sau khi cài đặt.
