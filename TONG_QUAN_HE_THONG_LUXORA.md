# LUXORA HOTEL — Tổng quan hệ thống

## 1. Website này dùng để làm gì?

LUXORA là website để khách tìm và đặt phòng trực tuyến, còn nhân viên dùng để xử lý lưu trú và quản lý vận hành khách sạn. Các màn hình nội bộ yêu cầu đăng nhập; mỗi vai trò chỉ được dùng đúng chức năng được cấp.

## 2. Chức năng và mục đích sử dụng

### Khách xem website

- **Trang chủ:** Giới thiệu khách sạn, tìm phòng theo ngày và số khách, xem phòng nổi bật, dịch vụ và gửi câu hỏi cho chatbot.
- **Phòng:** Xem giá, sức chứa, tiện nghi, tình trạng và ảnh đại diện. Bấm vào phòng để xem thư viện ảnh trước khi đặt.
- **Dịch vụ:** Xem dịch vụ đang cung cấp và mức giá; khách đã đăng nhập có thể đi tới booking để đăng ký dịch vụ.
- **Liên hệ/chatbot:** Hỏi trợ lý về phòng, giá, dịch vụ và quy định. Khi chatbot không có thông tin, khách nên hỏi lễ tân.

### Khách hàng (`CUSTOMER`)

- **Đặt phòng:** Chọn ngày nhận/trả, số khách và phòng còn trống; hệ thống tính tiền theo đêm, kiểm tra sức chứa/trùng lịch, áp dụng mã giảm giá và tạo khoản cọc. Booking chờ thanh toán hết hạn sau 15 phút.
- **Thanh toán:** Khai báo chuyển khoản/tiền mặt, gửi biên lai nếu cần và xem trạng thái nhân viên xác nhận. Hiện quy trình xác nhận là thủ công.
- **Phòng của tôi:** Xem booking, lịch lưu trú và dịch vụ đã đăng ký; hủy booking khi còn đủ điều kiện; đăng ký thêm dịch vụ trong kỳ lưu trú.
- **Hóa đơn:** Xem chi tiết giá phòng, dịch vụ, khoản đã trả và số tiền còn phải thanh toán.
- **Hoàn tiền:** Cung cấp tài khoản nhận tiền và theo dõi yêu cầu hoàn khi booking bị hủy có khoản cọc đủ điều kiện hoàn.
- **Lịch sử:** Tra cứu các booking trước đây, trạng thái và chi tiết liên quan.
- **Hồ sơ/Bảo mật:** Sửa thông tin cá nhân, đổi mật khẩu và gửi yêu cầu xác thực CCCD.
- **Đánh giá/Thông báo:** Gửi đánh giá sau lưu trú và nhận cập nhật từ khách sạn về booking/thanh toán.

### Lễ tân (`RECEPTIONIST`)

- **Nhận phòng/Trả phòng:** Tra booking bằng mã hoặc QR, xác nhận khách đến/rời khách sạn và cập nhật trạng thái phòng.
- **Duyệt thanh toán:** Xem biên lai hoặc thông tin thanh toán và xác nhận/từ chối khoản khách khai báo.
- **Hóa đơn:** Xem booking đang lưu trú, cập nhật số lượng dịch vụ hoặc bỏ dịch vụ, theo dõi tổng tiền và khoản còn phải thu.
- **Dọn phòng:** Xem phòng cần dọn và xác nhận dọn xong để phòng có thể được sử dụng lại.
- **Duyệt CCCD:** Kiểm tra giấy tờ khách gửi và chấp nhận/từ chối xác thực.
- **Chấm công & lương cá nhân:** Chấm công và xem dữ liệu lương của chính mình.

### Quản lý (`MANAGER`)

- **Tổng quan:** Theo dõi tình hình kinh doanh và hoạt động khách sạn.
- **Phòng/Loại phòng/Ảnh:** Tạo phòng và loại phòng, sửa giá/sức chứa, trạng thái và ảnh để khách thấy đúng thông tin.
- **Dịch vụ:** Tạo, sửa, tạm ngưng dịch vụ và giá bán.
- **Bảo trì:** Đánh dấu phòng cần bảo trì, lưu lý do/thời gian dự kiến và mở lại sau khi hoàn tất.
- **Giá đặc biệt/Mã giảm giá:** Lập giá theo khoảng ngày và chương trình giảm giá để áp dụng cho booking mới.
- **Hoàn tiền:** Xem yêu cầu và xử lý theo quy trình được cấp.
- **Báo cáo/Xuất file:** Xem doanh thu, booking, công suất, khách hàng, thanh toán, tiền mặt và lượt check-in/out; tải báo cáo để đối soát.
- **Chấm công & lương:** Theo dõi công, cấu hình lương/phụ cấp và chốt kỳ lương theo quyền.
- **Cài đặt:** Cấu hình thông tin thanh toán, quy tắc vận hành và email hệ thống.
- **Nhật ký:** Tra cứu các thao tác quan trọng để kiểm soát hoạt động.
- Có thể vào nghiệp vụ lễ tân, nhưng API hiện không cấp quyền duyệt thanh toán cọc cho Manager.

### Quản trị viên (`ADMIN`)

Có các quyền quản lý và lễ tân, đồng thời **quản lý người dùng**: tạo tài khoản, đổi vai trò, khóa/mở khóa hoặc xóa tài khoản theo điều kiện hệ thống. Admin cũng có quyền duyệt thanh toán và vào khu vực nhân viên.

### Nhân viên buồng (`STAFF`)

- **Dọn phòng:** Xem phòng được giao và đánh dấu hoàn tất dọn phòng.
- **Chấm công & lương:** Chấm công và chỉ xem dữ liệu của bản thân.

## 3. Vai trò và giới hạn quyền

| Vai trò | Phạm vi |
|---|---|
| Khách chưa đăng nhập | Chỉ nội dung công khai, tìm kiếm và xem phòng/dịch vụ. |
| `CUSTOMER` | Chỉ dữ liệu và booking của chính mình. |
| `STAFF` | Dọn phòng, chấm công và lương cá nhân. |
| `RECEPTIONIST` | Nghiệp vụ lễ tân và chấm công/lương cá nhân. |
| `MANAGER` | Quản trị vận hành, báo cáo, lương và nghiệp vụ lễ tân; không quản lý người dùng, không duyệt thanh toán cọc. |
| `ADMIN` | Toàn quyền quản trị, người dùng, thanh toán, lễ tân và nhân viên. |

Frontend ẩn/hiện màn hình theo vai trò; backend kiểm tra JWT và quyền trên từng API. Backend là lớp phân quyền cuối cùng.

## 4. Quy trình booking và các quy tắc chính

1. Khách chọn ngày và số người; tìm kiếm loại trừ phòng có booking giao nhau trong thời gian đó và phòng không nhận khách.
2. Hệ thống kiểm tra sức chứa, tính số đêm/giá/giảm giá và yêu cầu tiền cọc.
3. Booking chờ thanh toán có 15 phút để hoàn tất khoản cọc; quá hạn sẽ được giải phóng theo xử lý của hệ thống.
4. Nhân viên xác nhận thanh toán; lễ tân check-in/check-out. Giờ chuẩn: nhận phòng 14:00, trả phòng 12:00.
5. Khách có thể đăng ký dịch vụ cho booking đủ điều kiện. Dịch vụ được đưa vào hóa đơn để lễ tân kiểm tra/cập nhật; hóa đơn chốt theo nghiệp vụ lưu trú.
6. Hủy booking có cọc đã thanh toán có thể phát sinh yêu cầu hoàn tiền; tiền không tự chuyển về ngân hàng trong quy trình hiện tại.

### Email: luồng đã có và phần chưa có

**Đã có luồng gửi trong source:**

- Email chào mừng sau khi khách đăng ký.
- Email đặt lại mật khẩu: link dùng một lần, hết hạn sau 30 phút.
- Email xác nhận đặt cọc kèm QR booking sau khi nhân viên xác nhận cọc hoặc webhook báo thanh toán thành công.
- Email hóa đơn tạm tính sau xác nhận cọc; email hóa đơn thanh toán sau khi phần còn lại được xác nhận.
- Email nhắc khách trước giờ nhận phòng khoảng 30 phút; server kiểm tra định kỳ mỗi phút.
- Admin/Manager có nút gửi email thử trong Cấu hình để kiểm tra SMTP.

**Email chưa làm/chưa gửi tự động:**

- **Booking vừa tạo/chờ cọc:** chưa có email riêng khi khách vừa giữ phòng; hiện hệ thống chờ kết quả thanh toán cọc rồi mới gửi xác nhận. Chưa có template/thông báo email cho trạng thái chờ.
- **Hủy booking, từ chối thanh toán, hoàn tiền:** hiện cập nhật thông báo trong website; chưa có template và trigger gửi email ở các bước này.
- **Xác minh CCCD:** kết quả duyệt hiện báo trong website, chưa gửi email chấp nhận/từ chối.
- **Checkout:** checkout tạo/cập nhật hóa đơn và thông báo trong website; chưa tự gửi email hóa đơn cuối ngay lúc checkout. Email hóa đơn hiện gắn với lúc nhân viên xác nhận khoản thanh toán.

Các email này có thể phát triển thêm. Cần thống nhất nội dung mẫu, người nhận (khách/nhân viên), thời điểm gửi và cách thử để tránh gửi nhầm hoặc gửi lặp.
**Trạng thái gửi thật:** source dùng Nodemailer. Khi thiếu `SMTP_HOST` hoặc `SMTP_USER`, hệ thống ở chế độ demo: ghi log, nhưng không gửi email thật. Khi có SMTP, server thử kết nối lúc khởi động; cần xem log `MAIL` và gửi thư thử trong trang Quản lý để xác nhận. Chỉ xem source không thể kết luận SMTP production hiện đang gửi thành công; còn phụ thuộc cấu hình, nhà cung cấp và hộp thư nhận.
## 5. Công nghệ và vị trí mã nguồn

- **Frontend:** React, JavaScript, Vite, React Router, CSS trong `frontend/src/`. `UngDung.jsx` trang chủ; `DauTrang.jsx` điều hướng; `DinhTuyenUngDung.jsx` khai báo URL; `KetNoiAPI.js` gọi API; `DatPhong.jsx` đặt phòng; `TaiKhoan.jsx`, `LeTan.jsx`, `TrangQuanTri.jsx`, `NhanVien.jsx` là các khu vực theo vai trò.
- **Backend:** Node.js/Express trong `backend/src/`. `MayChu.js` khởi động API; `routes/DuongDanAPI.js` chứa nghiệp vụ/API; `middleware/XacThuc.js` xác thực JWT và phân quyền; `utils/` có xử lý đặt phòng, bảo mật, email.
- **Database:** PostgreSQL. `db/CauTrucCSDL.sql` định nghĩa bảng; `KetNoiCSDL.js` kết nối; `KhoiTaoCSDL.js` khởi tạo cấu trúc; `DuLieuMau.js` tạo tài khoản/dữ liệu mẫu.
- **Tệp tải lên:** `backend/uploads/` chứa ảnh phòng, biên lai và giấy tờ khách; cần lưu trữ bền vững khi deploy.
- Các file `V*.md` và `FIX*.md` ở thư mục gốc là ghi chú lịch sử sửa đổi; file này là hướng dẫn tổng quan.

## 6. Chạy trên máy cá nhân

Cần Node.js và PostgreSQL. Tạo `backend/.env` riêng, không chia sẻ/đưa lên Git. Điền ít nhất `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_URL`, `PORT`; SMTP cần thiết nếu muốn gửi email. Để bật AI, thêm `OPENAI_API_KEY` vào `backend/.env` và có thể chọn `OPENAI_MODEL`; tuyệt đối không đặt khóa này ở frontend hoặc gửi qua chat.

```bash
cd backend
npm install
npm run db:init
npm run db:seed   # dữ liệu mẫu cho phát triển; không chạy production nếu không muốn mẫu
npm run dev
```

Mở terminal khác:

```bash
cd frontend
npm install
npm run dev
```

Mặc định frontend `http://localhost:5173`, API `http://localhost:4000`; kiểm tra API ở `/api/health`. Vite proxy `/api` chỉ phục vụ phát triển local.

## 7. Đưa website lên Internet

1. Tạo PostgreSQL production (ví dụ Neon) và lưu `DATABASE_URL` trong phần biến môi trường bảo mật của backend.
2. Deploy backend (ví dụ Render Web Service): root `backend`, cài `npm install`, chạy `npm start`. Cấu hình `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_URL` (domain frontend), `PORT` nếu nền tảng yêu cầu. Thêm `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` nếu cần gửi email.
3. Chạy `npm run db:init` một lần trên database production. Chỉ chạy `npm run db:seed` nếu chủ động muốn tạo dữ liệu/tài khoản mẫu; thay mật khẩu mặc định trước khi mở website.
4. Deploy frontend (ví dụ Vercel/Netlify): root `frontend`, build `npm run build`, output `dist`; đặt `VITE_API_URL=https://<domain-backend>/api`. Bật SPA rewrite để URL React trực tiếp mở được.
5. Cấu hình domain và HTTPS, đặt `CLIENT_URL` khớp chính xác domain frontend, rồi kiểm tra `/api/health`, đăng nhập, đặt thử và email.
6. Tệp ở `backend/uploads` phải nằm trên persistent disk hoặc object storage; ổ đĩa tạm có thể mất ảnh/biên lai/CCCD sau deploy/restart.
7. Trước khi vận hành thật: thay tài khoản demo, cấu hình email/domain, sao lưu database, thay thông tin thanh toán mẫu. Muốn thu tiền/hoàn tiền tự động cần tích hợp nhà cung cấp thật và xác minh chữ ký webhook; hiện thanh toán/hoàn tiền chủ yếu xử lý thủ công.

Sau deploy, ai có URL đều mở được trang công khai; quản lý vẫn bắt buộc đăng nhập và kiểm tra vai trò. Không mở API nội bộ công khai.

## 8. Phần hiện đại có thể phát triển tiếp

Các mục dưới đây chưa hoàn chỉnh cho vận hành production. Chưa triển khai được chủ yếu vì cần chọn nhà cung cấp, thông tin tài khoản/khóa bí mật và quy trình nghiệp vụ của khách sạn; không phải vì hệ thống không thể mở rộng.

- **Thu tiền tự động:** Hiện khách chuyển khoản hoặc khai báo thanh toán, nhân viên duyệt. Backend có endpoint webhook mẫu, nhưng chưa tích hợp VietQR động với API ngân hàng hay một cổng cụ thể. Ảnh QR chỉ giúp chuyển tiền, không xác nhận tiền đã vào tài khoản. Muốn tự động cần chọn nhà cung cấp (ví dụ PayOS/VNPay/MoMo), mở tài khoản merchant, cấu hình khóa production, xác minh chữ ký theo tài liệu chính thức, kiểm tra giao dịch trùng và đối soát tiền.
- **Hoàn tiền tự động:** Hiện khách gửi thông tin nhận tiền, nhân viên/quản lý xử lý và xác nhận thủ công. Muốn hệ thống tự chuyển tiền cần cổng thanh toán hỗ trợ hoàn giao dịch, tài khoản merchant có quyền hoàn, API key, giới hạn/thời hạn hoàn, quy tắc phê duyệt và webhook cập nhật kết quả. Chuyển khoản ngân hàng thông thường không cho website tự ý chuyển/hoàn nếu chưa có API ngân hàng.
- **Trợ lý AI LUXORA:** Backend đã được bổ sung tích hợp OpenAI Responses API theo kiểu function calling và đọc các câu trả lời liên quan từ `DU_LIEU_HUAN_LUYEN_CHATBOT_THEO_VAI_TRO.md`. Khách có thể hỏi tự nhiên; công cụ tra cứu phòng dùng ngày nhận/trả, số khách, sức chứa, booking giao nhau, giá đặc biệt theo đêm và ngân sách nếu khách nêu. Công cụ tra cứu nội bộ chỉ cấp cho đúng vai trò: lễ tân/quản lý/admin tra booking theo ngày hoặc mã; khách đã đăng nhập chỉ xem booking của chính tài khoản; quản lý/admin xem tổng hợp vận hành. Kết quả chỉ đọc, AI không tự duyệt thanh toán/hoàn tiền hay đổi dữ liệu. Lịch sử hội thoại được gửi để hỗ trợ câu hỏi nối tiếp, giới hạn 20 yêu cầu mỗi phút. **Chưa kết nối chạy thật:** `backend/.env` hiện chưa có `OPENAI_API_KEY`, nên chatbot vẫn dùng câu trả lời dự phòng theo từ khóa và không thể xác nhận phòng trống theo ngày. Cần cấu hình API key ở backend, giới hạn chi tiêu ở tài khoản AI và thử các quyền trước khi đưa vào vận hành. Dữ liệu câu hỏi và kết quả công cụ cần được xem xét trước khi gửi tới nhà cung cấp AI.
- **Bản đồ/định vị khách sạn:** Website chưa có bản đồ ghim vị trí và hướng dẫn đường đi. Cần địa chỉ hoặc toạ độ chính xác của khách sạn, rồi chọn Google Maps (có thể cần API key/giới hạn billing) hoặc OpenStreetMap. Có thể hiển thị bản đồ ở trang Liên hệ và nút mở chỉ đường trên điện thoại; không cần thu thập vị trí riêng tư của khách.
- **Email production:** Mã gửi email đã có, nhưng nếu thiếu SMTP thì email chỉ ghi log trên server, không tới khách. Cần cấu hình SMTP thật, tên miền gửi và SPF/DKIM/DMARC để gửi ổn định.
- **Lưu ảnh/tài liệu bền vững:** Tệp hiện được lưu trong `backend/uploads`. Cần persistent disk hoặc dịch vụ object storage như S3/Cloudinary, phân quyền truy cập và chính sách thời hạn lưu, nhất là với CCCD/biên lai.
- **Giám sát và sao lưu production:** Có nhật ký thao tác và script backup database, nhưng cần cấu hình lịch sao lưu tự động, thử khôi phục định kỳ, cảnh báo lỗi/downtime và theo dõi log trên nền tảng hosting.
- **Đưa website lên chính thức:** Source chưa tự tạo hosting, domain, database production hay chứng thư HTTPS. Cần triển khai frontend/backend/database, đặt biến môi trường thật, nối domain và kiểm tra các luồng trước khi công bố URL.

### Thứ tự nên làm

1. Chọn hosting, domain, PostgreSQL production; cấu hình HTTPS, secrets và lưu trữ tệp bền vững.
2. Cấu hình email thật, kiểm tra tạo tài khoản/đặt phòng/nhắc lịch/hóa đơn.
3. Chọn cổng thanh toán, hoàn tất merchant onboarding, rồi tích hợp và thử webhook trên sandbox trước khi bật tiền thật.
4. Cấu hình API key và hạn mức chi phí cho trợ lý AI; thử tra cứu phòng/booking theo từng vai trò và rà soát cách xử lý dữ liệu trước khi vận hành.
5. Bật sao lưu, cảnh báo và quy trình xử lý sự cố trước khi nhận khách thật.
## 9. Lệnh và bảo mật

- Frontend: `npm run dev`, `npm run build`, `npm run preview`.
- Backend: `npm run dev`, `npm start`, `npm run db:init`, `npm run db:seed`.
- Tài khoản Admin mẫu trong README chỉ dành cho lần chạy phát triển đầu tiên. Không dùng mật khẩu mẫu trên production.
- Không công khai `.env`, secret, thông tin ngân hàng thật, ảnh CCCD, biên lai hoặc dữ liệu khách.