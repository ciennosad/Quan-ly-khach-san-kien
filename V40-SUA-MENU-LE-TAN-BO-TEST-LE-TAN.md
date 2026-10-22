# V40 — Sửa menu Lễ tân và quyền chế độ Test/Chạy thật

## Đã sửa
- Menu desktop sắp xếp: **Quản lý → Lễ tân**.
- **Quản lý** vẫn là menu xổ xuống có mũi tên.
- **Lễ tân** đổi thành menu xổ xuống có mũi tên, giữ các chức năng hiện có của Lễ tân.
- Với tài khoản Quản lý, menu Lễ tân vẫn cho phép truy cập đúng các chức năng Lễ tân được phân quyền; không thêm quyền duyệt thanh toán cho Quản lý.
- Tài khoản Lễ tân vẫn có các chức năng cũ và có menu Lễ tân dạng xổ xuống.
- Xóa hoàn toàn phần hiển thị **Chế độ hoạt động / Test / Chạy thật** khỏi giao diện tài khoản Lễ tân.
- Tài khoản Lễ tân không còn gọi API cấu hình chế độ giờ.
- Backend đổi quyền đọc `/admin/operation-settings` thành **ADMIN/MANAGER**; Lễ tân không được truy cập endpoint cấu hình này.
- Nút bật/tắt giới hạn giờ vẫn nằm ở khu vực Quản lý (và Admin), dùng để kiểm thử check-in/check-out.

## Giữ nguyên
- Không thay đổi nghiệp vụ check-in/check-out.
- Không thay đổi các chức năng thanh toán, hoàn tiền, chấm công, lương, CCCD.
- Không thay đổi quyền duyệt thanh toán của Lễ tân.
