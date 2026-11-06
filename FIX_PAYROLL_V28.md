# V28 – Hoàn thiện chấm công & tiền lương HERO

## Mục tiêu
Bản này tập trung hoàn thiện chức năng chấm công và tiền lương, giữ nguyên các nghiệp vụ khách sạn khác.

## Chức năng Nhân viên / Lễ tân
- Menu chính có `Chấm công & lương`.
- Có thể mở trực tiếp `/account?tab=attendance`.
- Khi quét QR chấm công tại khách sạn, đường dẫn `/account?attendanceToken=...` tự mở đúng màn hình chấm công và tự ghi nhận vào/ra ca.
- QR chấm công do Quản lý/Admin tạo, có thời hạn khoảng 3 phút.
- Xem lịch sử chấm công theo tháng.
- Khai báo tài khoản nhận lương: ngân hàng, số tài khoản, tên chủ tài khoản.
- Sửa lỗi ánh xạ tên trường ngân hàng giữa API PostgreSQL và giao diện, tránh tình trạng đã lưu nhưng form bị trống.
- Xem bảng lương sau khi kỳ công được chốt.
- Xem khoảng lương tham khảo:
  - Lễ tân: 8–10 triệu/tháng.
  - Nhân viên dọn phòng: 6–9 triệu/tháng.

## Chức năng Quản lý / Admin
- Menu `Chấm công & lương`.
- Xem toàn bộ chấm công của Lễ tân và Nhân viên.
- Sửa giờ vào, giờ ra và ghi chú trước khi chốt công.
- Không cho sửa dữ liệu sau khi tháng đã chốt.
- Xem tài khoản ngân hàng nhận lương của từng người.
- Thiết lập mức công/ngày thực tế.
- Chốt kỳ công.
- Hệ thống tạo/cập nhật bảng lương theo số ngày có giờ vào × mức công/ngày.
- Đánh dấu đã thanh toán sau khi Quản lý/Admin chuyển khoản thủ công.
- Xem khoảng lương tham khảo theo vị trí.
- Lưu nhật ký các thao tác cập nhật tài khoản nhận lương, sửa công, thay mức công, chốt công và thanh toán.
- Admin có quyền quản lý toàn bộ phần chấm công/lương mà Quản lý có.

## Kiểm tra kỹ thuật đã thực hiện
- `node --check` thành công với backend routes, server và db/init.
- Kiểm tra trực tiếp các luồng route chấm công/lương trong source.
- Kiểm tra schema khởi tạo tự động khi backend khởi động.
- Kiểm tra ZIP không chứa `.env`.

## Lưu ý kiểm thử thực tế
Môi trường kiểm tra hiện tại không có sẵn PostgreSQL và không có `node_modules` của frontend nên không thể chạy đầy đủ trình duyệt/Vite trong môi trường này. Vì vậy bản này không được coi là đã kiểm thử E2E trên máy người dùng. Khi chạy thực tế cần kiểm tra tuần tự: tạo QR → quét QR bằng tài khoản Lễ tân/Nhân viên → lưu tài khoản ngân hàng → xem công ở Quản lý → sửa công → chốt tháng → xem bảng lương → đánh dấu đã thanh toán.
