# HERO — Luồng hoàn tiền có kiểm soát bằng Quản lý/Admin

## Quy trình
1. Khách hủy booking có tiền cọc → hệ thống tạo yêu cầu hoàn tiền `PENDING`.
2. Khách khai báo phương thức nhận tiền:
   - Chuyển khoản: ngân hàng, số tài khoản, tên chủ tài khoản.
   - Tiền mặt: nhận tại quầy.
3. Chỉ **Quản lý/Admin** nhìn thấy mục Hoàn tiền.
4. Quản lý/Admin bấm **Duyệt hoàn tiền** → trạng thái `APPROVED`.
5. Nếu chuyển khoản, ngay sau khi duyệt hệ thống hiển thị **VietQR của chính tài khoản khách nhận tiền** trên màn hình Quản lý/Admin.
6. Quản lý dùng **ứng dụng ngân hàng/tài khoản của khách sạn** quét QR và chuyển tiền trực tiếp cho khách.
7. Sau khi chuyển, Quản lý/Admin nhập **mã giao dịch ngân hàng** và bấm **Đã chuyển tiền — xác nhận** → `SUCCESS`.
8. Lễ tân không còn quyền xem/duyệt/xác nhận refund.

## Kiểm soát rủi ro
- Không cho lễ tân tự chuyển tiền hoàn.
- Không đánh dấu hoàn tiền thành công nếu chưa có mã giao dịch ngân hàng.
- Lưu người duyệt, thời gian duyệt, người xác nhận, thời gian xác nhận và mã giao dịch trong `raw_payload` và audit log.
- QR trên màn hình quản lý là QR **người nhận tiền**, không phải QR tài khoản cá nhân của lễ tân.
