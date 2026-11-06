# V38 – Chế độ kiểm thử giờ Check-in / Check-out

## Chức năng
Admin và Quản lý có thêm công tắc trong **Quản trị → Cấu hình → Vận hành**:

- **BẬT – Chế độ chạy thật:**
  - Check-in chỉ từ 14:00 theo booking.
  - Check-out không muộn hơn 12:00 theo booking.
- **TẮT – Chế độ kiểm thử:**
  - Admin/Quản lý/Lễ tân có thể kiểm thử check-in/check-out bất cứ lúc nào.
  - Chỉ nên tắt trong lúc test.

## Mặc định
Sau khi khởi tạo/cập nhật database, `time_rules_enabled = TRUE`, tức là **BẬT chế độ chạy thật**.

## Database
Bổ sung cột `hotel_settings.time_rules_enabled`. Schema dùng `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` để cập nhật database HERO đang có mà không cần xóa dữ liệu.

## API
- `GET /api/admin/operation-settings`
- `PATCH /api/admin/operation-settings`

Chỉ `ADMIN` và `MANAGER` được phép thay đổi công tắc.

## Lưu ý
Trước khi mở website cho khách thật, luôn kiểm tra công tắc đang ở trạng thái **BẬT**.
