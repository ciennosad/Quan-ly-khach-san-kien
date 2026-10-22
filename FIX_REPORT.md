# LUXORA HOTEL — Báo cáo sửa lỗi

## Phạm vi đã sửa

### 1. Authentication
- Bổ sung route frontend: `/register`, `/forgot-password`, `/reset-password`.
- Login/Register lưu cả `accessToken` và `refreshToken`.
- Frontend tự gọi `/auth/refresh` khi API trả `401`, sau đó tự gọi lại request một lần.
- Backend refresh token có rotation: token cũ bị revoke, token mới được cấp và lưu hash.
- Bổ sung `/auth/logout` để revoke refresh token.
- Reset/change password revoke các refresh token hiện có.
- Thêm link Đăng ký và Quên mật khẩu trên màn hình đăng nhập.

### 2. Booking
- Giá phòng được tính theo số đêm: `đơn giá/đêm × số đêm`.
- Tính số đêm bằng khoảng thời gian check-in/check-out và yêu cầu tối thiểu 1 đêm.
- Kiểm tra phòng có thể đặt: không cho đặt phòng đang OCCUPIED/CLEANING/MAINTENANCE.
- Chống booking trùng theo khoảng thời gian trong transaction.
- Bổ sung `guest_count` vào bảng `bookings` và kiểm tra không vượt `room_type.capacity`.
- API `/rooms` nhận `guests` để lọc theo sức chứa.
- Tiền cọc không được âm và không được vượt tổng tiền sau giảm giá.
- Response booking trả chi tiết pricing: số đêm, đơn giá, tổng trước giảm, giảm giá, tổng cuối, cọc, còn lại.

### 3. Discount
- Giảm giá được tính trên tổng tiền của toàn bộ số đêm, không phải giá 1 đêm.
- Kiểm tra thời gian hiệu lực, trạng thái và số lượt sử dụng.

### 4. Upload / hình ảnh
- Chuẩn hóa thư mục upload thành đường dẫn tuyệt đối theo source backend, không phụ thuộc thư mục chạy lệnh.
- Frontend có `assetUrl()` để chuyển `/uploads/...` thành URL Backend đúng.
- Trang chủ và trang booking sử dụng URL ảnh chuẩn hóa.
- Các luồng upload payment proof, KYC, room images dùng API helper để hưởng cơ chế refresh token.

### 5. Database
- Bổ sung `guest_count` cho `bookings`.
- `schema.sql` có `ALTER TABLE ... IF NOT EXISTS` để cập nhật database cũ mà không cần xóa dữ liệu.

### 6. UX / Responsive
- Giữ sidebar desktop và drawer menu mobile.
- Thêm khối tạm tính booking theo số đêm/số khách.
- Giao diện mobile hiện có breakpoint cho điện thoại nhỏ và tablet.

## Những phần đã kiểm tra tĩnh
- Backend JavaScript đã chạy `node --check` thành công cho các file backend chính sau khi sửa.
- Đã rà các luồng route auth, rooms, bookings và upload trong source.

## Giới hạn xác nhận
Không thể xác nhận 100% runtime trong môi trường đóng gói này nếu chưa có PostgreSQL, file `.env` thực tế, SMTP và thông tin tài khoản thanh toán. Vì vậy báo cáo này phân biệt giữa **đã sửa theo source** và **cần chạy integration/end-to-end để xác nhận**.

## Checklist chạy sau khi giải nén
1. Tạo `backend/.env` từ `.env.example`.
2. Tạo database PostgreSQL và chạy `npm run db:init` + `npm run db:seed`.
3. Chạy backend bằng `npm run dev`.
4. Chạy frontend bằng `npm run dev`.
5. Kiểm tra `/api/health`.
6. Chạy TEST CASE TC01–TC60 và R01–R10 trong checklist đã lập.


## Bổ sung theo yêu cầu nghiệp vụ hiện tại
- Hoàn tiền thủ công do **Lễ tân hoặc Admin** xử lý; Manager không còn quyền duyệt hoàn tiền.
- Khi khách hủy booking có khoản cọc đã thanh toán thành công, hệ thống tạo payment `REFUND` ở trạng thái `PENDING`.
- Lễ tân có tab **Hoàn tiền** để xem, xác nhận đã hoàn hoặc từ chối yêu cầu.
- Hủy booking gửi thông báo tới **Lễ tân + Admin** để xử lý hoàn tiền.
- Thanh toán hiện tại giữ mô hình **thủ công tạm thời**: khách chuyển khoản/gửi biên lai, hoặc khai báo tiền mặt/chuyển khoản cho phần còn lại; nhân viên xác nhận thủ công, chưa tích hợp cổng thanh toán/hoàn tiền tự động.

## 2026-09-22 — PRO + Manual Payment/Refund + runtime fixes

### 1. Hoàn tiền thủ công
- Quyền xử lý hoàn tiền: ADMIN và RECEPTIONIST.
- Khi booking bị hủy và có tiền cọc đã thanh toán thành công, hệ thống tạo REFUND ở trạng thái PENDING.
- Duyệt hoàn: chuyển REFUND -> SUCCESS và ghi paid_at.
- Từ chối: chuyển REFUND -> REJECTED và lưu lý do.
- Chặn xử lý lại một yêu cầu refund đã xử lý.
- Ghi audit log và gửi thông báo cho khách.

### 2. Fix lỗi PostgreSQL khi duyệt hoàn tiền
- Tách câu UPDATE SUCCESS/REJECTED thay vì dùng cùng parameter `$1` ở nhiều ngữ cảnh kiểu dữ liệu.
- Ép kiểu payment id thành UUID và payload thành JSONB.
- Mục tiêu trực tiếp: loại bỏ lỗi `inconsistent types deduced for parameter $1` quan sát được trong Console.

### 3. Fix luồng tạo booking ở Frontend
- Thêm trạng thái `submitting` để khóa nút trong lúc tạo booking, tránh gửi POST /bookings lặp khi người dùng bấm nhiều lần.
- Validate ngày nhận/trả, số khách và tiền cọc trước khi gọi API.
- Chuẩn hóa payload gửi API: guests/depositAmount là number và discountCode được trim.
- Hiển thị trạng thái `Đang tạo booking…` trong lúc request.

### 4. Lỗi `startTime`
- Đã kiểm tra toàn bộ source frontend/backend: không có `onboarding.js`, `reportAllChanges` hoặc truy cập `startTime` tương ứng.
- Stack trace trong ảnh trỏ tới `onboarding.js`/`VM...`, nên hiện chưa có bằng chứng đây là code của LUXORA; không thêm code để nuốt lỗi nhằm che khuất lỗi bên ngoài.
- Nếu sau khi chạy bản mới vẫn xuất hiện lỗi này, cần kiểm tra extension/script inject của trình duyệt và tab Sources để xác định nguồn script.

### 5. Kiểm tra
- `node --check backend/src/routes/DuongDanAPI.js`: PASS.
- Frontend build chưa xác nhận trong môi trường hiện tại vì dependencies chưa được cài hoàn chỉnh; lệnh `npm ci` đã timeout.
- Chưa có PostgreSQL/.env runtime của máy người dùng trong môi trường kiểm tra, nên chưa thể xác nhận thao tác DB thực tế.

## V3 – Payment settings, deposit methods, reports, email & invoice
- Admin/Manager now have **Thanh toán & Email** settings: bank code, account number, account name, hotel email.
- Customer booking with a deposit can choose **BANK_TRANSFER/VietQR** or **CASH**. Cash deposit is stored as a PENDING manual payment for Reception/Admin to confirm.
- VietQR now reads the saved hotel bank account; balance-payment QR can use `?type=BALANCE` and generates the remaining amount instead of the deposit amount.
- Admin/Manager reports are hardened against incomplete/null report rows so a missing `status` cannot crash `AdminHome` with `toLowerCase`.
- Added standalone SMTP test: `backend/test-email.js` and npm script `npm run test:email -- yourgmail@gmail.com`.
- Added standalone real-booking invoice test: `backend/test-invoice-email.js` and `npm run test:invoice -- BK-XXXX [gmail]`.
- Registration now sends a welcome email asynchronously after account creation when SMTP is configured.
- Successful deposit/balance confirmation and checkout now attempt to send a styled HTML invoice email; SMTP failures are logged and do not fail the payment transaction.
- Customer invoice UI has been redesigned with a hotel-style header, totals, payment history, and responsive mobile layout.
- SMTP remains optional in development. Without SMTP_HOST/SMTP_USER, email is DEMO/log-only. Gmail should use an App Password, not the normal Gmail password.
