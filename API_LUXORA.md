# Tài liệu API và dữ liệu — HERO Hotel

Tài liệu này được tổng hợp từ mã nguồn hiện có, chủ yếu tại `backend/src/routes/DuongDanAPI.js`, `backend/src/MayChu.js` và `backend/src/db/CauTrucCSDL.sql`.

## 1. Thông tin chung

| Thuộc tính | Giá trị |
|---|---|
| Công nghệ | Node.js + Express, PostgreSQL |
| Prefix API | `/api` |
| URL mặc định | `http://localhost:4000/api` |
| Kiểm tra dịch vụ | `GET /api/health` → `{ "ok": true, "service": "luxora-hotel-api" }` |
| JSON | Body JSON tối đa 2 MB |
| Upload | Multipart, tối đa 5 MB mỗi tệp; tệp được lưu dưới `backend/uploads/` |
| Tệp tĩnh | `/uploads/...` |
| Cấu hình frontend | `VITE_API_URL`; mặc định `http://localhost:4000/api` |

Endpoint bên dưới được ghi với prefix `/api` đầy đủ. Tham số `:id`, `:code`, `:userId` là giá trị thay thế trong URL.

## 2. Xác thực và quyền

API bảo vệ dùng JWT trong header `Authorization: Bearer <accessToken>`. Các endpoint không ghi quyền yêu cầu đăng nhập chỉ cần JWT hợp lệ; quyền được kiểm tra ở backend.

| Vai trò | Ý nghĩa |
|---|---|
| `GUEST` | Người chưa đăng nhập; chỉ API công khai và chatbot |
| `CUSTOMER` | Khách hàng; thao tác tài khoản, booking và thanh toán của chính mình |
| `STAFF` | Nhân viên buồng; vệ sinh, chấm công và lương cá nhân |
| `RECEPTIONIST` | Lễ tân; nghiệp vụ lưu trú, thanh toán, CCCD, chấm công/lương cá nhân |
| `MANAGER` | Quản lý vận hành, cấu hình, báo cáo; một số nghiệp vụ lễ tân |
| `ADMIN` | Quản trị viên; quản lý người dùng và các nghiệp vụ quản trị |

Vai trò được ghi trong cột quyền là danh sách được backend cho phép. `Đăng nhập` nghĩa là cần JWT nhưng route không giới hạn riêng role. `Công khai` nghĩa là không cần JWT. Chatbot có thể nhận JWT tùy chọn.

## 3. Danh mục endpoint

### Sức khỏe, khả dụng và chatbot

| Method | Endpoint | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/health` | Công khai | Kiểm tra server hoạt động |
| GET | `/api/availability/calendar` | Công khai | Lịch ngày còn/hết phòng; query gồm `from`, `to`, `guests`, tùy chọn `roomId`, `checkIn` |
| POST | `/api/chatbot` | Công khai/JWT tùy chọn | Gửi `message`, lịch sử hội thoại tùy chọn; giới hạn 20 yêu cầu/phút, câu hỏi tối đa 1.500 ký tự |

### Tài khoản và xác thực

| Method | Endpoint | Quyền | Mục đích |
|---|---|---|---|
| POST | `/api/auth/register` | Công khai | Đăng ký khách hàng |
| POST | `/api/auth/login` | Công khai | Đăng nhập, cấp token |
| POST | `/api/auth/refresh` | Công khai | Đổi refresh token lấy access token mới |
| POST | `/api/auth/logout` | Đăng nhập | Thu hồi phiên/refresh token |
| POST | `/api/auth/forgot-password` | Công khai | Yêu cầu đặt lại mật khẩu qua email |
| POST | `/api/auth/reset-password` | Công khai | Đặt lại mật khẩu bằng token |
| POST | `/api/auth/change-password` | Đăng nhập | Đổi mật khẩu hiện tại |
| GET | `/api/account/profile` | Đăng nhập | Lấy hồ sơ tài khoản hiện tại |
| PATCH | `/api/account/profile` | Đăng nhập | Cập nhật hồ sơ |
| POST | `/api/account/kyc` | Đăng nhập | Gửi hồ sơ CCCD; multipart `idFront`, `idBack` |

### Phòng, dịch vụ và đánh giá

| Method | Endpoint | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/rooms` | Công khai | Danh sách phòng/loại phòng và thông tin hiển thị |
| GET | `/api/rooms/:id/pricing` | Công khai | Giá phòng theo ngày/giá đặc biệt |
| GET | `/api/rooms/:id/reviews` | Công khai | Đánh giá của phòng |
| GET | `/api/services` | Công khai | Danh sách dịch vụ đang cung cấp |
| GET | `/api/admin/room-types` | `ADMIN`, `MANAGER` | Danh mục loại phòng quản trị |
| GET | `/api/admin/services` | `ADMIN`, `MANAGER` | Danh sách dịch vụ quản trị |
| POST | `/api/admin/services` | `ADMIN`, `MANAGER` | Tạo dịch vụ |
| PATCH | `/api/admin/services/:id` | `ADMIN`, `MANAGER` | Cập nhật dịch vụ |
| DELETE | `/api/admin/services/:id` | `ADMIN`, `MANAGER` | Xóa/ngừng dịch vụ theo xử lý backend |

### Booking, dịch vụ đặt thêm và hóa đơn

| Method | Endpoint | Quyền | Mục đích |
|---|---|---|---|
| POST | `/api/bookings` | Đăng nhập | Tạo booking và khoản thanh toán đặt cọc |
| GET | `/api/bookings/mine` | Đăng nhập | Danh sách booking của tài khoản hiện tại |
| GET | `/api/bookings/:code` | Đăng nhập | Chi tiết booking theo mã; backend kiểm tra quyền sở hữu/vai trò |
| POST | `/api/bookings/:code/cancel` | Đăng nhập | Hủy booking theo điều kiện nghiệp vụ |
| POST | `/api/bookings/:code/services` | `CUSTOMER` | Đăng ký dịch vụ cho booking |
| GET | `/api/bookings/:code/invoice` | Đăng nhập | Xem hóa đơn booking |
| GET | `/api/reception/invoices/active` | `ADMIN`, `MANAGER`, `RECEPTIONIST` | Danh sách hóa đơn/booking đang lưu trú |
| PATCH | `/api/reception/invoices/:code/services/:serviceBookingId` | `ADMIN`, `MANAGER`, `RECEPTIONIST` | Cập nhật số lượng/trạng thái dịch vụ trên hóa đơn |
| POST | `/api/bookings/:code/review` | Đăng nhập | Gửi đánh giá sau lưu trú |

### Thanh toán, QR và hoàn tiền

| Method | Endpoint | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/bookings/:code/vietqr` | Đăng nhập | Lấy thông tin/mã QR chuyển khoản |
| POST | `/api/bookings/:code/payment-proof` | Đăng nhập | Gửi ảnh chứng từ, multipart field `proof` |
| POST | `/api/bookings/:code/payment-method` | Đăng nhập | Chọn/cập nhật phương thức thanh toán |
| GET | `/api/bookings/:code/refund` | Đăng nhập | Xem trạng thái/thông tin hoàn tiền của booking |
| PATCH | `/api/bookings/:code/refund-recipient` | Đăng nhập | Cập nhật thông tin người/tài khoản nhận hoàn tiền |
| POST | `/api/payments/webhook` | Tùy nhà cung cấp | Nhận cập nhật thanh toán từ cổng thanh toán |
| GET | `/api/admin/payments/pending` | `ADMIN`, `RECEPTIONIST` | Danh sách khoản thanh toán chờ duyệt |
| POST | `/api/admin/payments/:id/confirm` | `ADMIN`, `RECEPTIONIST` | Xác nhận thanh toán |
| POST | `/api/admin/payments/:id/reject` | `ADMIN`, `RECEPTIONIST` | Từ chối thanh toán |
| GET | `/api/admin/refunds` | `ADMIN`, `MANAGER` | Danh sách yêu cầu hoàn tiền |
| PATCH | `/api/admin/refunds/:paymentId` | `ADMIN`, `MANAGER` | Cập nhật xử lý hoàn tiền |

### Lễ tân, vệ sinh và bảo trì

| Method | Endpoint | Quyền | Mục đích |
|---|---|---|---|
| POST | `/api/reception/qr-verify` | `ADMIN`, `MANAGER`, `RECEPTIONIST` | Kiểm tra QR/mã booking |
| POST | `/api/reception/check-in` | `ADMIN`, `MANAGER`, `RECEPTIONIST` | Nhận phòng |
| POST | `/api/reception/check-out` | `ADMIN`, `MANAGER`, `RECEPTIONIST` | Trả phòng và cập nhật lưu trú |
| GET | `/api/reception/housekeeping` | `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF` | Danh sách phòng cần vệ sinh |
| PATCH | `/api/reception/rooms/:id/cleaning-complete` | `ADMIN`, `MANAGER`, `RECEPTIONIST`, `STAFF` | Đánh dấu vệ sinh hoàn tất |
| POST | `/api/reception/services` | `ADMIN`, `MANAGER`, `RECEPTIONIST` | Ghi nhận dịch vụ phát sinh tại quầy |
| GET | `/api/admin/maintenance` | `ADMIN`, `MANAGER` | Danh sách/báo cáo bảo trì |
| PATCH | `/api/admin/maintenance/:id` | `ADMIN`, `MANAGER` | Cập nhật trạng thái/thông tin bảo trì |

### CCCD và quản lý người dùng

| Method | Endpoint | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/admin/kyc/pending` | `ADMIN`, `MANAGER`, `RECEPTIONIST` | Hồ sơ CCCD chờ xét duyệt |
| POST | `/api/admin/kyc/:userId/review` | `ADMIN`, `MANAGER`, `RECEPTIONIST` | Duyệt/từ chối hồ sơ |
| GET | `/api/admin/users` | `ADMIN` | Danh sách tài khoản |
| POST | `/api/admin/users` | `ADMIN` | Tạo tài khoản |
| PATCH | `/api/admin/users/:id/status` | `ADMIN` | Khóa/mở tài khoản |
| PATCH | `/api/admin/users/:id/role` | `ADMIN` | Cập nhật vai trò |
| DELETE | `/api/admin/users/:id` | `ADMIN` | Xóa tài khoản theo ràng buộc nghiệp vụ |

### Quản trị danh mục, giá và khuyến mãi

| Method | Endpoint | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/admin/discount-codes` | `ADMIN`, `MANAGER` | Danh sách mã giảm giá |
| POST | `/api/admin/discount-codes` | `ADMIN`, `MANAGER` | Tạo mã giảm giá |
| PATCH | `/api/admin/discount-codes/:id` | `ADMIN`, `MANAGER` | Cập nhật mã giảm giá |
| DELETE | `/api/admin/discount-codes/:id` | `ADMIN`, `MANAGER` | Xóa/ngừng mã giảm giá |
| GET | `/api/discount-codes/:code/check` | Đăng nhập | Kiểm tra mã giảm giá |
| GET | `/api/admin/special-room-prices` | `ADMIN`, `MANAGER` | Danh sách giá phòng đặc biệt |
| POST | `/api/admin/special-room-prices` | `ADMIN`, `MANAGER` | Tạo giá đặc biệt theo khoảng ngày |
| PATCH | `/api/admin/special-room-prices/:id` | `ADMIN`, `MANAGER` | Cập nhật giá đặc biệt |
| DELETE | `/api/admin/special-room-prices/:id` | `ADMIN`, `MANAGER` | Xóa/ngừng giá đặc biệt |
| POST | `/api/admin/room-types` | `ADMIN`, `MANAGER` | Tạo loại phòng |
| PATCH | `/api/admin/room-types/:id` | `ADMIN`, `MANAGER` | Cập nhật loại phòng |
| DELETE | `/api/admin/room-types/:id` | `ADMIN`, `MANAGER` | Xóa loại phòng |
| POST | `/api/admin/rooms` | `ADMIN`, `MANAGER` | Tạo phòng |
| PATCH | `/api/admin/rooms/:id` | `ADMIN`, `MANAGER` | Cập nhật phòng |
| DELETE | `/api/admin/rooms/:id` | `ADMIN`, `MANAGER` | Xóa phòng |
| POST | `/api/admin/rooms/:id/images` | `ADMIN`, `MANAGER` | Tải lên tối đa 10 ảnh phòng |
| PUT | `/api/admin/rooms/:id/images` | `ADMIN`, `MANAGER` | Thay/cập nhật danh sách ảnh phòng |
| DELETE | `/api/admin/rooms/:id/images/:index` | `ADMIN`, `MANAGER` | Xóa ảnh theo vị trí |

### Thông báo và nhật ký

| Method | Endpoint | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/notifications` | Đăng nhập | Lấy thông báo của tài khoản hiện tại |
| POST | `/api/notifications/:id/read` | Đăng nhập | Đánh dấu một thông báo đã đọc |
| POST | `/api/notifications/read-all` | Đăng nhập | Đánh dấu tất cả thông báo đã đọc |
| GET | `/api/admin/audit-logs` | `ADMIN`, `MANAGER` | Tra cứu nhật ký thao tác |

### Cấu hình, dashboard và xuất báo cáo

| Method | Endpoint | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/admin/dashboard` | `ADMIN`, `MANAGER` | Số liệu tổng quan |
| GET | `/api/admin/operation-settings` | `ADMIN`, `MANAGER` | Đọc cài đặt vận hành |
| PATCH | `/api/admin/operation-settings` | `ADMIN`, `MANAGER` | Cập nhật cài đặt vận hành |
| GET | `/api/admin/payment-settings` | `ADMIN`, `MANAGER` | Đọc cấu hình thanh toán |
| PATCH | `/api/admin/payment-settings` | `ADMIN`, `MANAGER` | Cập nhật cấu hình thanh toán |
| POST | `/api/admin/email-test` | `ADMIN`, `MANAGER` | Gửi email kiểm tra cấu hình SMTP |
| GET | `/api/admin/export/bookings.csv` | `ADMIN`, `MANAGER` | Xuất booking dạng CSV |
| GET | `/api/admin/export/accounts.csv` | `ADMIN` | Xuất tài khoản dạng CSV |
| GET | `/api/admin/reports/export.xls` | `ADMIN`, `MANAGER` | Xuất báo cáo tổng hợp XLS |
| GET | `/api/admin/reports/attendance.xls` | `ADMIN`, `MANAGER` | Xuất báo cáo chấm công XLS |
| GET | `/api/admin/reports/checkin-out.xls` | `ADMIN`, `MANAGER` | Xuất báo cáo nhận/trả phòng XLS |
| GET | `/api/admin/reports/finance` | `ADMIN`, `MANAGER` | Báo cáo tài chính |
| GET | `/api/admin/reports/bookings` | `ADMIN`, `MANAGER` | Báo cáo booking |
| GET | `/api/admin/reports/revenue` | `ADMIN`, `MANAGER` | Báo cáo doanh thu |
| GET | `/api/admin/reports/checkinOut` | `ADMIN`, `MANAGER` | Thống kê nhận/trả phòng |
| GET | `/api/admin/reports/occupancy` | `ADMIN`, `MANAGER` | Báo cáo công suất phòng |
| GET | `/api/admin/reports/customers` | `ADMIN`, `MANAGER` | Báo cáo khách hàng |
| GET | `/api/admin/reports/cash-payments` | `ADMIN`, `MANAGER` | Báo cáo thanh toán tiền mặt |
| GET | `/api/admin/reports/cash-payments.xls` | `ADMIN`, `MANAGER` | Xuất báo cáo tiền mặt XLS |
| GET | `/api/admin/reports/payments` | `ADMIN`, `MANAGER` | Báo cáo thanh toán |

### Chấm công và lương

| Method | Endpoint | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/attendance/me` | `STAFF`, `RECEPTIONIST` | Lịch sử chấm công cá nhân |
| POST | `/api/attendance/toggle` | `STAFF`, `RECEPTIONIST` | Chấm công vào/ra |
| GET | `/api/attendance/qr` | `ADMIN`, `MANAGER` | Lấy QR phục vụ chấm công |
| GET | `/api/payroll/account` | `STAFF`, `RECEPTIONIST` | Xem tài khoản nhận lương cá nhân |
| PATCH | `/api/payroll/account` | `STAFF`, `RECEPTIONIST` | Cập nhật tài khoản nhận lương |
| GET | `/api/payroll/me` | `STAFF`, `RECEPTIONIST` | Xem lương cá nhân |
| GET | `/api/admin/attendance` | `ADMIN`, `MANAGER` | Tra cứu/chấm công nhân viên |
| PATCH | `/api/admin/attendance/:id` | `ADMIN`, `MANAGER` | Điều chỉnh bản ghi chấm công |
| GET | `/api/admin/payroll` | `ADMIN`, `MANAGER` | Tra cứu bảng lương |
| PATCH | `/api/admin/payroll/package/:userId` | `ADMIN`, `MANAGER` | Cập nhật gói lương/phụ cấp |
| PATCH | `/api/admin/payroll/rate/:userId` | `ADMIN`, `MANAGER` | Cập nhật mức lương ngày |
| POST | `/api/admin/payroll/close` | `ADMIN`, `MANAGER` | Chốt kỳ lương |
| POST | `/api/admin/payroll/:itemId/pay` | `ADMIN`, `MANAGER` | Ghi nhận đã thanh toán lương |

## 4. Dữ liệu chính trong PostgreSQL

Các bảng được khai báo trong schema SQL:

| Bảng | Nội dung |
|---|---|
| `users` | Tài khoản, vai trò, trạng thái, hồ sơ và cấu hình lương |
| `refresh_tokens`, `password_reset_tokens` | Phiên đăng nhập và token đặt lại mật khẩu |
| `room_types`, `rooms` | Loại phòng, sức chứa, giá cơ bản, tiện nghi, tình trạng phòng |
| `bookings` | Mã đặt phòng, khách, phòng, thời gian lưu trú, tổng tiền và trạng thái |
| `services`, `booking_services` | Danh mục dịch vụ và dịch vụ gắn với booking |
| `payments`, `invoices` | Khoản thanh toán, chứng từ, hóa đơn và số tiền |
| `special_room_prices`, `discount_codes` | Giá theo ngày và mã giảm giá |
| `reviews` | Đánh giá lưu trú/phòng |
| `notifications`, `audit_logs` | Thông báo người dùng và nhật ký quản trị |
| `attendance_records` | Giờ vào/ra và ngày làm việc |
| `payroll_accounts`, `payroll_periods`, `payroll_items` | Tài khoản nhận lương, kỳ lương và chi tiết lương |
| `hotel_settings` | Cấu hình vận hành, ngân hàng và thông tin khách sạn |

Tên cột chi tiết và ràng buộc nằm trong `backend/src/db/CauTrucCSDL.sql`; backend cũng bổ sung một số cột/bảng trong lúc khởi động tại `backend/src/MayChu.js`.

## 5. Quy ước dữ liệu và luồng đáng chú ý

- Ngày nhận/trả phòng được xử lý theo giờ khách sạn; quy ước thông thường là nhận phòng 14:00, trả phòng 12:00.
- Booking chờ thanh toán đặt cọc có thời hạn 15 phút theo phần khởi tạo/luồng hết hạn trong server.
- Upload chứng từ dùng field `proof`; upload CCCD dùng `idFront` và `idBack`. Ảnh phòng dùng field `images`.
- API trả JSON cho phần lớn nghiệp vụ; export trả CSV/XLS hoặc nội dung tải xuống tương ứng.
- Middleware lỗi trả JSON dạng `{ "message": "..." }`; lỗi trùng dữ liệu PostgreSQL được chuyển thành HTTP 409. Lỗi xác thực/phân quyền phụ thuộc middleware.
- API chatbot giới hạn 20 yêu cầu/phút; nhóm đăng nhập/đăng ký/quên mật khẩu giới hạn 20 yêu cầu trong 15 phút theo cấu hình route.
- Đây là danh mục endpoint và mô tả chức năng từ source. Payload/response chi tiết có thể khác nhau theo từng handler; xem phần xử lý route tương ứng trong `backend/src/routes/DuongDanAPI.js` trước khi tích hợp client mới.

## 6. Mã nguồn liên quan

- Khởi tạo Express, middleware, health-check và prefix API: `backend/src/MayChu.js`
- Khai báo endpoint/nghiệp vụ: `backend/src/routes/DuongDanAPI.js`
- JWT và phân quyền: `backend/src/middleware/XacThuc.js`
- Kết nối PostgreSQL: `backend/src/db/KetNoiCSDL.js`
- Cấu trúc bảng: `backend/src/db/CauTrucCSDL.sql`
- Client API frontend và refresh token: `frontend/src/KetNoiAPI.js`
- Proxy phát triển Vite: `frontend/vite.config.js`
