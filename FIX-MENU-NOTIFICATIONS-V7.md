# HERO HOTEL — V7 Menu & Notifications

## Đã sửa
- Giữ nguyên thương hiệu **HERO HOTEL**, không đổi sang LUXURY.
- Thay menu desktop bên trái bằng menu ngang trên đầu trang.
- Desktop: Trang chủ, Phòng, Đặt phòng, Dịch vụ, Về chúng tôi.
- Tài khoản có menu theo quyền: Quản lý / Lễ tân / Tài khoản / Đăng xuất.
- Mobile: menu hamburger dạng drawer, responsive.
- Thêm chuông thông báo trên header.
- Chuông chỉ lấy thông báo chưa đọc.
- Nhấp một thông báo: gọi API đánh dấu đã đọc, xóa ngay khỏi danh sách trong chuông và giảm số badge.
- Có nút Đọc tất cả.
- Sửa luồng access token: nếu access token sắp hết hạn thì refresh trước khi gọi API, giúp tránh lỗi 401 lặp lại do token hết hạn; khi refresh token cũng hết hạn thì phiên đăng nhập được dọn sạch.
- Backend hỗ trợ GET `/api/notifications?unread=1` để lấy riêng thông báo chưa đọc.

## Không sửa
- Không đổi tên HERO.
- Không đưa `.env` vào bản ZIP.
- Không xóa các chức năng booking, thanh toán, hoàn tiền, dịch vụ, housekeeping, maintenance và email của V6.
