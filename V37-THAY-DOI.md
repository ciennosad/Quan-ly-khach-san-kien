# LUXORA V37 - Trang chủ, cọc 10%, thanh toán, hoàn tiền và chatbot

## Đã triển khai
- Trang chủ có khối tìm phòng kiểu Booking: ngày nhận/trả, số khách, nút tìm phòng.
- Lịch ngày dạng ô chọn; ngày không còn phòng được khóa màu xám, ngày còn phòng màu trắng.
- Backend `/availability/calendar` kiểm tra phòng thực tế theo sức chứa và booking.
- Tên loại phòng hiển thị tiếng Việt ở các màn hình khách.
- Tiền cọc được backend tính cố định 10% tổng tiền phòng sau giảm giá.
- Hóa đơn khách giữ luồng chọn tiền mặt/chuyển khoản và VietQR tài khoản khách sạn hiện có.
- Thanh toán phần còn lại tiếp tục chờ lễ tân/admin xác nhận; endpoint pending đã nhận cả khai báo tiền mặt và biên lai chuyển khoản.
- Sau khi xác nhận BALANCE, backend tiếp tục gọi gửi hóa đơn email.
- Trạng thái hoàn tiền phía khách: Đang chờ hoàn tiền / Đã duyệt — chờ chuyển / Đã hoàn; không còn nút khách tự bấm “Đã hoàn tiền”.
- Chatbot nổi trên trang chủ, tư vấn phòng theo số người, sức chứa, giá và dịch vụ bằng dữ liệu thật từ PostgreSQL; chưa cho chatbot tự thay đổi booking/payment/refund.
- Không đưa `.env`/secret vào bản bàn giao.

## Kiểm tra
- `node --check` đã chạy thành công cho backend route và server.
- Chưa chạy được `npm run build` trong môi trường hiện tại vì `node_modules` trong source không đầy đủ và môi trường không tải được toàn bộ package từ npm registry. Vì vậy cần chạy `npm ci`/`npm install` trên máy chạy dự án rồi `npm run build` để xác nhận build frontend.
- Chưa chạy E2E PostgreSQL/Gmail thật trong môi trường này.
