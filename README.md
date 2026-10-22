# LUXORA HOTEL

Website đặt phòng và quản lý hoạt động khách sạn. Khách có thể xem phòng, tìm theo ngày/số khách, đặt phòng và sử dụng dịch vụ; nhân viên xử lý lưu trú theo quyền được cấp.

## Thông tin liên hệ

- **Người liên hệ:** Dương Đình Kiền
- **Điện thoại:** 0379887282
- **Email:** kienduon757@gmail.com

## Công nghệ

- **Frontend:** React, Vite, JavaScript, React Router, CSS.
- **Backend:** Node.js, Express, REST API, JWT.
- **Cơ sở dữ liệu:** PostgreSQL.
- **Tích hợp trong source:** gửi email qua SMTP, QR booking/VietQR, chatbot có thể kết nối OpenAI, tải ảnh và tài liệu.

## Chức năng chính

- **Khách:** xem phòng/ảnh/giá/dịch vụ; tìm phòng theo ngày và số khách; đặt, thanh toán theo quy trình hiện có, xem booking/hóa đơn, đăng ký dịch vụ, gửi yêu cầu hủy/hoàn tiền, đánh giá và cập nhật hồ sơ.
- **Lễ tân:** tra booking bằng mã/QR, check-in/check-out, xử lý thanh toán theo quyền, hóa đơn, dịch vụ, dọn phòng, xác thực giấy tờ và chấm công cá nhân.
- **Quản lý:** quản lý phòng, loại phòng, ảnh, dịch vụ, giá, bảo trì, mã giảm giá, báo cáo, nhân sự/lương, cấu hình và yêu cầu hoàn tiền theo quyền.
- **Quản trị viên:** quản lý người dùng và các nghiệp vụ được cấp cho Admin.
- **Nhân viên buồng:** xem việc dọn phòng, chấm công và thông tin lương cá nhân.
- Backend xác thực và kiểm tra quyền trên API; giao diện ẩn các mục người dùng không được phép truy cập.

## Chạy trên máy cá nhân

Cần cài Node.js và PostgreSQL. Tạo database PostgreSQL, sau đó tạo file `backend/.env` (không đưa file này lên Git) với các biến cơ bản:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
PORT=4000
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-another-long-random-secret
```

Khởi tạo database và chạy backend:

```bash
cd backend
npm install
npm run db:init
npm run dev
```

Chạy frontend trong terminal khác:

```bash
cd frontend
npm install
npm run dev
```

Mặc định frontend chạy tại `http://localhost:5173`, API tại `http://localhost:4000`; kiểm tra backend ở `http://localhost:4000/api/health`. Nếu API không chạy ở địa chỉ mặc định, đặt `VITE_API_URL` cho frontend, ví dụ `http://localhost:4000/api`.

`npm run db:seed` tạo dữ liệu mẫu và tài khoản Admin demo được khai báo trong `backend/src/db/DuLieuMau.js`. Chỉ chạy khi chủ động cần dữ liệu mẫu. Nếu dùng để khởi tạo Admin, hãy giữ website kín trong lúc cài đặt, đăng nhập và đổi mật khẩu demo trước khi mở truy cập công khai; không dùng mật khẩu demo trên production.

## Cấu hình dịch vụ ngoài

- **Email:** thêm `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` vào `backend/.env`. Thiếu cấu hình SMTP thì email không được gửi thật.
- **Chatbot AI:** thêm `OPENAI_API_KEY` ở backend; có thể đặt `OPENAI_MODEL`. Không đặt API key ở frontend. Chưa có key thì chatbot dùng câu trả lời dự phòng, không tra cứu động bằng AI.
- **Thanh toán/hoàn tiền:** hiện có quy trình QR và nhân viên xử lý/xác nhận; chưa tự động ghi nhận tiền hoặc chuyển tiền hoàn qua ngân hàng/cổng thanh toán production.
- **Bản đồ:** trang web chưa có bản đồ định vị khách sạn; cần địa chỉ/toạ độ chính xác và chọn dịch vụ bản đồ trước khi tích hợp.

## Đưa lên Internet

1. Tạo PostgreSQL production và lưu `DATABASE_URL` trong phần biến môi trường bảo mật của dịch vụ backend.
2. Deploy backend từ thư mục `backend`, lệnh chạy production `npm start`. Đặt `NODE_ENV=production`, `DATABASE_URL`, `PORT`, `CLIENT_URL` (domain frontend), `JWT_SECRET` và `JWT_REFRESH_SECRET`; thêm cấu hình SMTP/OpenAI nếu sử dụng.
3. Khởi tạo schema trên database production một lần bằng `npm run db:init`. Không chạy seed nếu không muốn tạo dữ liệu demo.
4. Deploy frontend từ thư mục `frontend`, build bằng `npm run build`, thư mục kết quả `dist`. Đặt `VITE_API_URL=https://<domain-backend>/api` và cấu hình SPA rewrite để các đường dẫn của React mở trực tiếp được.
5. Trỏ domain và bật HTTPS; đặt `CLIENT_URL` chính xác theo domain frontend. Kiểm tra health API, đăng nhập, tìm/đặt phòng, upload và email trước khi công bố.
6. Cấu hình lưu trữ bền vững cho `backend/uploads`; ổ đĩa tạm của hosting có thể làm mất tệp sau khi khởi động lại. Không để giấy tờ khách hoặc biên lai nhạy cảm có thể truy cập công khai.

Sau khi triển khai, khách truy cập bằng domain frontend. Các trang quản trị vẫn yêu cầu đăng nhập và được backend kiểm tra quyền.

## Sao lưu database

Trong thư mục `backend`:

```bash
bash scripts/SaoLuu.sh
bash scripts/PhucHoi.sh backups/backup_<ten-file>.sql
```

Hãy cấu hình sao lưu định kỳ trên dịch vụ database production và thử khôi phục bản sao lưu trước khi vận hành thật.

## Mã nguồn và tài liệu

- `frontend/src/`: giao diện khách và các khu vực theo vai trò.
- `backend/src/`: API, nghiệp vụ, xác thực/phân quyền và kết nối database.
- `backend/src/db/`: schema, khởi tạo và dữ liệu mẫu.
- `backend/uploads/`: tệp tải lên trong môi trường hiện tại.
- [`TONG_QUAN_HE_THONG_LUXORA.md`](TONG_QUAN_HE_THONG_LUXORA.md): chức năng theo vai trò, luồng email, giới hạn hiện tại và đề xuất phát triển.
- `DU_LIEU_HUAN_LUYEN_CHATBOT_THEO_VAI_TRO.md`: bộ câu hỏi/câu trả lời tham khảo cho chatbot.
- Các file `FIX*.md` và `V*.md`: ghi chú lịch sử thay đổi.

## Bảo mật

- Không đưa `.env`, khóa API, mật khẩu, dữ liệu khách, giấy tờ hoặc biên lai lên Git.
- Dùng secret ngẫu nhiên riêng cho production; không dùng thông tin mẫu.
- Cấp quyền tối thiểu cần thiết cho từng tài khoản và sao lưu database/tệp tải lên.
