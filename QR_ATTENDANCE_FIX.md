# V40.3 – Fix QR chấm công

- Tăng QR trên màn hình Quản lý/Admin lên 240px, thêm quiet zone 4 và mức sửa lỗi M để camera điện thoại dễ nhận hơn.
- Khi quét QR lúc chưa đăng nhập, hệ thống giữ nguyên `attendanceToken` qua trang đăng nhập. Sau khi đăng nhập đúng tài khoản Lễ tân/Nhân viên, tự quay lại `/account?attendanceToken=...` và ghi nhận vào/ra ca.
- Giữ nguyên token 10 phút và phân quyền backend.

## Lưu ý khi chạy localhost
Nếu QR đang chứa `http://localhost:5173/...`, điện thoại sẽ hiểu `localhost` là chính điện thoại và không mở được web trên máy tính. Khi test 2 thiết bị, cần truy cập frontend bằng địa chỉ LAN của máy tính (ví dụ `http://192.168.1.10:5173`) hoặc dùng tên miền thật/Cloudflare.
