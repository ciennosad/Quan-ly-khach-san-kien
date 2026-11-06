# Dự thảo API, quy trình tư vấn, giá và chính sách LUXORA

**Trạng thái: chờ chủ dự án kiểm tra và xác nhận.** Đây là bản làm việc để duyệt nội dung trước khi cập nhật `DU_LIEU_HUAN_LUYEN_CHATBOT_THEO_VAI_TRO.md`. Các mức giá dưới đây được đọc từ dữ liệu hiện có; các nội dung ghi **CẦN DUYỆT** chưa được xem là chính sách khách sạn chính thức.

## 1. Nguồn dữ liệu và API

- Backend: `backend/src/routes/DuongDanAPI.js`; prefix API là `/api`.
- API catalog đầy đủ (bao gồm endpoint quản trị, báo cáo, nhân sự): [`API_LUXORA.md`](API_LUXORA.md).
- Danh sách phòng/dịch vụ và giá ở bản nháp này được đọc qua API công khai của dự án. Giá có thể đổi trong phần quản trị.
- API trả `room_type_name`/`name` theo tên đang lưu trong database; giao diện và chatbot cần hiển thị nhãn tiếng Việt đã chuẩn hóa.

### API chính trong luồng khách hàng và chatbot

| Method, đường dẫn | Dữ liệu chính | Mục đích/quyền |
|---|---|---|
| `GET /api/health` | trạng thái dịch vụ | Kiểm tra backend |
| `GET /api/rooms?guests=...&checkIn=...&checkOut=...` | phòng, loại, sức chứa, giá cơ bản, tình trạng, lịch đã đặt | Tìm phòng. `guests` hiện lọc phòng có sức chứa từ số khách trở lên. Khách phải đăng nhập để tạo booking. |
| `GET /api/rooms/:id/pricing?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD` | `basePrice`, tổng giá, giá từng đêm | Tính giá phòng cụ thể theo ngày; có thể áp dụng giá đặc biệt. |
| `GET /api/availability/calendar?from=...&to=...&guests=...` | các ngày trống/bị chặn | Lịch khả dụng cho bộ chọn ngày. |
| `POST /api/chatbot` | `{ message, history }`; header Bearer tùy đăng nhập | Tư vấn. Chatbot tra dữ liệu qua backend; dữ liệu cá nhân và công cụ nội bộ phụ thuộc role. Giới hạn 20 yêu cầu/phút. |
| `POST /api/auth/register`, `POST /api/auth/login` | thông tin đăng ký/đăng nhập | Tạo tài khoản, cấp token. |
| `POST /api/bookings` | `roomId`, ngày nhận/trả, `guestCount`, phương thức cọc, mã giảm giá và dịch vụ nếu chọn | Tạo booking; cần đăng nhập. Backend kiểm tra lại phòng, tính giá, chiết khấu và tiền cọc. |
| `GET /api/bookings/mine` | danh sách booking của người dùng hiện tại | Khách xem đặt phòng của mình. |
| `POST /api/bookings/:code/cancel` | lý do hủy tùy chọn | Khách yêu cầu hủy booking của mình theo điều kiện backend. |
| `GET /api/services` | dịch vụ đang bật và giá | Danh sách dịch vụ. |
| `POST /api/bookings/:code/services` | `serviceId`, `quantity` | Khách thêm dịch vụ vào booking đã xác nhận/đang lưu trú; giá được chốt lúc thêm. |
| `GET /api/bookings/:code/invoice` | tiền phòng, dịch vụ, phụ phí, đã trả, còn lại | Xem hóa đơn booking của mình/theo role. |
| `GET /api/bookings/:code/vietqr`, `POST /api/bookings/:code/payment-proof`, `POST /api/bookings/:code/payment-method` | dữ liệu thanh toán/chứng từ | Hướng dẫn và gửi thông tin thanh toán. Xác nhận thủ công theo luồng hiện tại. |
| `GET /api/discount-codes/:code/check` | mã giảm giá | Kiểm tra mã (cần đăng nhập). |
| `GET /api/bookings/:code/refund`, `PATCH /api/bookings/:code/refund-recipient` | yêu cầu/trạng thái và người nhận | Khách xem/cập nhật thông tin nhận hoàn tiền khi đủ điều kiện. |
| `GET /api/rooms/:id/reviews`, `POST /api/bookings/:code/review` | đánh giá | Xem/gửi đánh giá; gửi qua booking đã lưu trú theo điều kiện backend. |

## 2. Bảng phòng và giá theo nội dung khách nhìn thấy trên website

> Tên hạng, thông tin giường và mô tả dưới đây theo cách giao diện khách hàng đang hiển thị. Giá là **giá cơ bản mỗi đêm** đọc từ dữ liệu hiện tại; giá đặc biệt theo ngày có thể thay thế giá cơ bản cho từng đêm.

| Hạng phòng hiển thị | Thông tin giường | Mô tả hiển thị cho khách | Sức chứa tối đa | Giá cơ bản/đêm |
|---|---|---|---:|---:|
| Phòng thường | 1 giường | Phòng tiêu chuẩn có 1 giường lớn, không gian gọn gàng và phù hợp tối đa 2 khách. | 2 khách | 1.200.000 ₫ |
| Phòng cao cấp | 1 giường | Không gian hiện đại, cửa sổ lớn, phù hợp 2 khách. | 2 khách | 1.200.000 ₫ |
| Phòng thường | 2 giường | Phòng tiêu chuẩn có 2 giường riêng biệt, phù hợp tối đa 4 khách. | 4 khách | 2.200.000 ₫ |
| Phòng cao cấp | 1 giường | Phòng cao cấp rộng rãi, có khu vực ghế sofa riêng. | 4 khách | 2.200.000 ₫ |
| Phòng gia đình | 1 giường lớn | Phòng gia đình rộng rãi, tiện nghi đầy đủ. | 4 khách | 2.600.000 ₫ |
| Phòng nhóm | 3 giường | Phòng nhóm gồm 2 giường đôi và 1 giường đơn, phù hợp tối đa 5 khách. | 5 khách | 3.500.000 ₫ |
| Phòng nhóm | 3 giường | Phòng nhóm gồm 3 giường đôi, phù hợp tối đa 6 khách. | 6 khách | 4.200.000 ₫ |
| Phòng nhóm | 4 giường | Phòng nhóm gồm 3 giường đôi và 1 giường đơn, phù hợp tối đa 7 khách. | 7 khách | 4.900.000 ₫ |
| Phòng nhóm | 5 giường | Phòng nhóm gồm 3 giường đôi và 2 giường đơn, phù hợp tối đa 8 khách. | 8 khách | 5.600.000 ₫ |

Một số hạng phòng có cùng tên hiển thị nên khách cần phân biệt bằng số giường, sức chứa, mô tả và giá. Tên hiển thị không dùng mã/tên kỹ thuật trong hệ thống.

## 3. Dịch vụ và giá hiện có

| Tên dịch vụ tiếng Việt | Mô tả | Giá đang hiển thị | Đơn vị tính cần xác nhận |
|---|---|---:|---|
| Đưa đón sân bay | Đưa đón sân bay | 350.000 ₫ | **CẦN DUYỆT:** mỗi lượt, mỗi chiều hay mỗi xe? |
| Buffet sáng | Buffet sáng mỗi ngày | 180.000 ₫ | **CẦN DUYỆT:** mỗi khách, mỗi bữa hay mỗi ngày? |
| Giặt và sấy quần áo | Giặt và sấy quần áo | 100.000 ₫ | **CẦN DUYỆT:** mỗi kg, mỗi túi hay mỗi lượt? |
| Đồ ăn nhẹ và nước uống trong phòng | Đồ uống và thức ăn nhẹ | 120.000 ₫ | **CẦN DUYỆT:** giá theo gói hay theo sản phẩm? |
| Nước suối | Mô tả trên website hiện ghi “Nước suối của gia đình tự sáng tạo ra”. | 30.000 ₫ | **CẦN DUYỆT:** sửa mô tả và xác nhận tính theo chai hay đơn vị khác. |

Tên và mô tả dịch vụ hiện được lưu bằng tiếng Việt không dấu; giao diện lấy các nội dung này trực tiếp từ dữ liệu. Đơn vị tính giá vẫn cần được xác nhận. Backend lưu giá tại lúc khách thêm dịch vụ; hóa đơn tính số lượng × đơn giá và loại trừ dịch vụ đã hủy theo trạng thái.

Chatbot chỉ nên báo giá dịch vụ sau khi đơn vị được xác nhận. Backend lưu `unit_price` tại thời điểm khách thêm dịch vụ; hóa đơn cộng dịch vụ theo `số lượng × đơn giá` và loại trừ dịch vụ đã hủy theo trạng thái.

## 4. Quy trình đặt phòng và tư vấn giá đề xuất

### Luồng tư vấn của chatbot

1. Hỏi/lấy đủ **ngày nhận**, **ngày trả**, **số khách** và **loại phòng** mong muốn. Có thể dùng thông tin khách đã cung cấp ở các tin nhắn trước trong cùng cuộc hội thoại.
2. Nếu thiếu dữ liệu bắt buộc, hỏi đúng phần còn thiếu; không tự thay bằng hạng phòng khác.
3. Tra phòng còn khả dụng và sức chứa. Theo yêu cầu chủ dự án, khi khách yêu cầu loại phòng/sức chứa cụ thể, chỉ đưa ra lựa chọn khớp sức chứa yêu cầu; nếu không có thì báo không có lựa chọn khớp và hỏi khách có muốn xem phương án khác không.
4. Khi khách chọn một hạng/phòng cụ thể, gọi API tính giá cho đúng phòng và ngày nhận/trả. Dùng giá từng đêm từ backend, không nhân giá cơ bản nếu đang có giá đặc biệt.
5. Trả lời theo cấu trúc: loại phòng, số khách, ngày nhận/trả, số đêm, số lượng phòng còn, bảng giá từng đêm, tổng tiền phòng và ghi chú về dịch vụ/giảm giá.
6. Chatbot chỉ tư vấn và báo giá, **không giữ phòng**. Tình trạng chỉ được xác nhận lại khi khách tạo booking.

### Luồng đặt phòng trên website

1. Khách chọn ngày và số khách; website gọi API danh sách phòng/lịch khả dụng.
2. Khách chọn một phòng cụ thể; website lấy giá theo đúng `roomId`, `checkIn`, `checkOut`.
3. Khách đăng nhập, kiểm tra thông tin, có thể nhập mã giảm giá/chọn dịch vụ/phương thức cọc.
4. Website gửi `POST /api/bookings`; backend kiểm tra lại lịch trùng, sức chứa, thời gian và giá trong giao dịch trước khi tạo booking.
5. Backend lưu booking, dịch vụ được chọn, khoản cọc và thời hạn thanh toán; website hiển thị mã booking/QR/thông tin thanh toán.
6. Nhân viên hoặc webhook xác nhận khoản thanh toán theo trạng thái; khách theo dõi booking và hóa đơn trong tài khoản.

### Quy tắc tính tổng tiền

- Số đêm = ngày trả − ngày nhận; đêm nhận phòng không tính đến giờ trả phòng, theo cách tính ngày của backend.
- Với từng đêm, dùng giá đặc biệt đang hiệu lực cho loại phòng nếu có; nếu không, dùng `base_price`.
- **Tổng phòng trước giảm giá** = tổng giá của từng đêm. Ví dụ 3 đêm đều 2.200.000 ₫: `2.200.000 × 3 = 6.600.000 ₫`.
- Nếu có mã giảm giá hợp lệ: trừ chiết khấu theo cấu hình mã; **giá phòng sau giảm** là số được lưu làm `room_price`.
- Cọc hiện tại = **10% giá sau giảm**, làm tròn theo phép tính backend; còn phải trả cho phần phòng = giá sau giảm − cọc.
- Dịch vụ không nằm trong tổng phòng trên. Tổng hóa đơn sau này gồm tiền phòng + dịch vụ chưa hủy + phụ phí nếu có − khoản đã thanh toán.
- Giá hiển thị trước khi tạo booking là báo giá; backend tính lại giá ở thời điểm đặt. Nếu giá/tình trạng đổi, cần hiển thị kết quả mới trước khi khách xác nhận.

### Ví dụ theo dữ liệu hiện tại (chưa tính giá đặc biệt/giảm giá/dịch vụ)

Khoảng ngày **10/11/2026 đến 13/11/2026**, 4 khách = 3 đêm. Nếu còn trống và các mức cơ bản chưa đổi:

| Loại phòng khớp sức chứa 4 khách | Tính tiền | Tổng phòng |
|---|---:|---:|
| Phòng thường · 2 giường | 2.200.000 × 3 | 6.600.000 ₫ |
| Phòng cao cấp · 1 giường (sức chứa tối đa 4 khách) | 2.200.000 × 3 | 6.600.000 ₫ |
| Phòng gia đình · 1 giường lớn | 2.600.000 × 3 | 7.800.000 ₫ |

Ví dụ cọc theo logic đang cài: lần lượt **660.000 ₫**, **660.000 ₫**, **780.000 ₫**. Giá thực tế cần kiểm tra API vì giá đặc biệt có thể áp dụng theo từng ngày.

### Quy trình sử dụng website dành cho khách hàng

Phần này chỉ hướng dẫn **khách hàng** theo các mục và nút đang có trên giao diện. Chatbot cần chỉ khách thao tác trong tài khoản của chính họ; không hướng dẫn quy trình nghiệp vụ của lễ tân, quản lý hoặc nhân viên. Một số điều kiện như phí hủy và thời gian xử lý hoàn tiền chưa được xác nhận thành chính sách công khai.

#### Khách chưa đăng nhập

1. **Xem phòng:** vào Trang chủ hoặc mục Phòng, chọn ngày nhận/trả và số khách; xem tình trạng, sức chứa, giá cơ bản, tiện nghi và lịch đã đặt.
2. **Xem dịch vụ:** vào mục Dịch vụ để xem tên, mô tả và giá hiện được hệ thống công bố.
3. **Hỏi chatbot/liên hệ:** mở trợ lý để hỏi thông tin chung hoặc dùng mục Liên hệ. Chatbot không tạo booking và không giữ phòng.
4. **Bắt đầu đặt:** chọn Đặt phòng. Nếu chưa đăng nhập, website yêu cầu đăng nhập/đăng ký trước khi mở biểu mẫu booking.

#### Đăng ký, đăng nhập và khôi phục tài khoản

1. Khách tạo tài khoản tại `/register`, hoặc đăng nhập tại `/login`.
2. Nếu quên mật khẩu, gửi yêu cầu ở `/forgot-password`, sau đó mở đường dẫn đặt lại được gửi qua email tại `/reset-password`.
3. Sau khi đăng nhập, website lưu phiên đăng nhập; các API cá nhân gửi access token và tự làm mới phiên khi cần.
4. Người dùng cập nhật hồ sơ và mật khẩu trong mục Tài khoản → Hồ sơ/Bảo mật.

#### Đặt phòng và thanh toán tiền cọc

1. Vào **Phòng**, chọn ngày nhận phòng, ngày trả phòng và số khách; xem các phòng còn khả dụng. Chỉ tư vấn loại phòng có sức chứa đủ số khách.
2. Chọn đúng thẻ phòng và bấm **Đặt phòng**. Đăng nhập/đăng ký nếu website yêu cầu, kiểm tra lại ngày, số khách, giá và thông tin đặt phòng rồi xác nhận.
3. Sau khi đặt, mở **Tài khoản → Phòng của tôi**, tìm booking vừa tạo và bấm **Xem chi tiết** rồi **Xem hóa đơn**.
4. Nếu booking đang chờ tiền cọc, hoàn tất trong thời hạn **15 phút** đang hiển thị trên trang. Chọn **Chuyển khoản** để xem QR/thông tin ngân hàng, tải ảnh biên lai vào mục **Ảnh biên lai chuyển khoản**, rồi bấm **Xác nhận thanh toán**. Nội dung chuyển khoản cần dùng đúng nội dung mà hóa đơn hiển thị.
5. Nếu chọn **Tiền mặt tại khách sạn**, bấm **Xác nhận thanh toán** để gửi lựa chọn và thanh toán tại quầy khách sạn. Hóa đơn hiển thị trạng thái chờ xác nhận; chatbot không được nói khoản tiền đã được nhận khi trạng thái chưa xác nhận.
6. Nếu hết 15 phút mà chưa hoàn tất, booking bị hủy và phòng được giải phóng. Khách cần tạo booking mới và kiểm tra lại tình trạng/giá tại thời điểm đặt.

Khi khách hỏi “Tôi đã đặt nhưng chưa thanh toán cọc, thanh toán ở đâu?”, chatbot hướng dẫn ngắn gọn: **Tài khoản → Phòng của tôi → booking cần thanh toán → Xem chi tiết → Xem hóa đơn → chọn Chuyển khoản hoặc Tiền mặt tại khách sạn và làm theo hướng dẫn trên hóa đơn.** API tham chiếu: `POST /api/bookings`, `GET /api/bookings/:code/invoice`, `GET /api/bookings/:code/vietqr`, `POST /api/bookings/:code/payment-proof`, `POST /api/bookings/:code/payment-method`.

#### Xem booking và hóa đơn

1. Đăng nhập, mở **Tài khoản → Phòng của tôi** để xem các booking của chính mình.
2. Bấm **Xem chi tiết** tại booking cần kiểm tra. Trong phần chi tiết, bấm **Xem hóa đơn** để xem tiền phòng, dịch vụ, khoản đã thanh toán và số còn lại.
3. Nếu hóa đơn không tải được hoặc thông tin chưa cập nhật, chatbot đề nghị khách tải lại trang/kiểm tra kết nối và liên hệ khách sạn kèm mã booking; không tự suy đoán trạng thái thanh toán.

#### Thêm dịch vụ vào booking

1. Mở **Tài khoản → Phòng của tôi → Dịch vụ**.
2. Chọn booking đang được xác nhận hoặc đang lưu trú, chọn dịch vụ và số lượng (từ 1 đến 50), rồi bấm **Thêm vào đặt phòng**.
3. Hệ thống chốt đơn giá hiện tại khi khách thêm dịch vụ. Dịch vụ được cộng vào hóa đơn chính thức sau khi khách sạn xác nhận nhận phòng; khách có thể xem hóa đơn trong booking.
4. Nếu booking chưa xác nhận, đã kết thúc hoặc không xuất hiện trong danh sách chọn booking, khách chưa thể thêm dịch vụ qua mục này. Chatbot không hứa rằng yêu cầu đã được ghi nhận nếu giao diện không báo thành công.

#### Hủy booking và yêu cầu hoàn tiền

1. Vào **Tài khoản → Phòng của tôi**, mở booking và bấm **Hủy đặt phòng** nếu nút này đang hiển thị. Giao diện hiện chỉ cho phép khách tự hủy booking đang chờ thanh toán hoặc đã xác nhận, trước giờ nhận phòng.
2. Nếu booking đã thanh toán thành công tiền cọc, hệ thống tạo khoản hoàn tiền ở trạng thái chờ xử lý khi hủy. Nếu chưa có khoản cọc thanh toán thành công thì không phát sinh khoản hoàn cọc.
3. Mở **Tài khoản → Hoàn tiền**, tìm booking đã hủy có yêu cầu hoàn, điền mã ngân hàng, số tài khoản và tên chủ tài khoản đúng như biểu mẫu, rồi bấm **Lưu và gửi lại quản lý**.
4. Theo dõi trạng thái tại mục **Hoàn tiền**. Chatbot chỉ hướng dẫn gửi và theo dõi yêu cầu, không xác nhận yêu cầu đã được duyệt hoặc tiền đã chuyển.

Chưa có chính sách đã xác nhận về phí hủy, các trường hợp được hoàn, số tiền hoàn cuối cùng và thời gian xử lý. Chatbot cần nói rõ phần này chưa có thông tin chính thức và hướng khách liên hệ khách sạn; không cam kết ngày nhận tiền. API tham chiếu: `POST /api/bookings/:code/cancel`, `GET /api/bookings/:code/refund`, `PATCH /api/bookings/:code/refund-recipient`.

#### Các tiện ích tài khoản dành cho khách

- **Hồ sơ và bảo mật:** vào **Tài khoản → Hồ sơ** hoặc **Bảo mật** để cập nhật thông tin cá nhân/mật khẩu.
- **Xác thực CCCD:** vào **Tài khoản → Xác thực CCCD**, gửi ảnh theo biểu mẫu và theo dõi trạng thái tại đó.
- **Đánh giá:** sau khi lưu trú hoàn tất, mở booking trong lịch sử và gửi đánh giá nếu giao diện cho phép.
- **Thông báo:** mở biểu tượng chuông/thông báo để xem cập nhật.

Danh sách endpoint kỹ thuật đầy đủ nằm trong [`API_LUXORA.md`](API_LUXORA.md); tài liệu API có thể gồm nhóm dành cho nhân viên/quản trị để tham khảo kỹ thuật, nhưng các quy trình chatbot trong tài liệu này chỉ dành cho khách hàng.

## 5. Chính sách dự thảo cho website

Phần này phân biệt hành vi đã có trong phần mềm và điều khoản cần chủ khách sạn duyệt. Không dùng các mục “CẦN DUYỆT” làm lời cam kết của chatbot trước khi bạn xác nhận.

| Chủ đề | Hành vi/nguồn hiện có | Câu chữ dự thảo hoặc việc cần duyệt |
|---|---|---|
| Nhận/trả phòng | Bộ kiến thức và các màn hình ghi nhận nhận phòng 14:00, trả phòng 12:00; cấu hình vận hành có thể bật/tắt quy tắc thời gian. | “Nhận phòng từ 14:00; trả phòng trước 12:00.” **CẦN DUYỆT** thời gian, phụ phí nhận sớm/trả trễ và ngoại lệ. |
| Khả dụng | Booking đang giữ/đã xác nhận chặn phòng; chatbot không giữ phòng. | “Tình trạng phòng được xác nhận tại thời điểm hoàn tất đặt phòng.” |
| Đặt phòng/cọc | Backend yêu cầu đăng nhập; hỗ trợ `CASH` hoặc `BANK_TRANSFER`; tiền cọc 10% giá sau giảm; booking chờ cọc tối đa 15 phút rồi được giải phóng/hủy theo job backend. | Công bố “cọc 10%, hoàn tất trong 15 phút” chỉ sau khi chủ khách sạn xác nhận đây là quy định bán hàng, không chỉ là cấu hình hệ thống. |
| Thanh toán | Có luồng tải chứng từ và nhân viên duyệt; thanh toán còn lại/tiền mặt xử lý trong nghiệp vụ lễ tân. | **CẦN DUYỆT** thời điểm thanh toán phần còn lại, phương thức được nhận, thời gian đối soát và khi nào booking được xác nhận. |
| Hủy | Mã nguồn cho hủy khi chưa check-in và chưa quá giờ nhận phòng; nếu có tiền cọc thì tạo khoản hoàn ở trạng thái chờ xử lý. | Có thể thông báo điều kiện hủy theo hệ thống, nhưng **không cam kết chắc chắn được hoàn/bao lâu nhận tiền**. Cần chủ khách sạn duyệt mức phí, hạn hủy và thời gian xử lý hoàn. |
| Giá | Tính theo ngày; giá đặc biệt có thể áp dụng; mã giảm giá có thời hạn/lượt sử dụng; server tính lại khi tạo booking. | “Giá cuối cùng là giá hiển thị ở bước xác nhận đặt phòng.” **CẦN DUYỆT** thuế/phí có bao gồm chưa. |
| Dịch vụ | Chỉ thêm dịch vụ vào booking đã xác nhận hoặc đang lưu trú; giá lưu tại lúc đăng ký; số lượng 1–50 theo API. | Xác nhận đơn vị giá, thời điểm phục vụ, cách hủy và dịch vụ nào tính theo khách/đêm/lượt. |
| Hoàn tiền | Tạo yêu cầu và trạng thái để nhân viên/quản lý xử lý; chatbot không tự duyệt. | **CẦN DUYỆT** trường hợp được hoàn, khoản được hoàn, thời hạn xử lý và phương thức trả. |
| Trẻ em/giường phụ/thú cưng/hút thuốc/đặt cọc hư hại | Chưa thấy mức/chính sách chính thức đủ căn cứ trong dữ liệu truy vấn. | **CẦN DUYỆT** từng chính sách; chatbot hiện phải chuyển lễ tân thay vì tự trả lời. |

## 6. Quy tắc trả lời dành cho chatbot (đề xuất)

- Giữ lại ngày, số khách và loại phòng khách đã nêu trong các lượt hội thoại gần nhất; nếu thông tin mâu thuẫn, hỏi khách xác nhận lại.
- Câu hỏi về tổng giá phải tính từ giá theo từng đêm API trả về. Không tự tính bằng giá trung bình, không dùng giá của hạng phòng khác.
- Nếu khách nêu “Phòng thường 2 giường”, không thay bằng danh sách mọi phòng. Nếu không còn đúng hạng/sức chứa, báo rõ và chỉ gợi ý phương án khác sau khi hỏi khách.
- Nêu rõ số đêm, tổng tiền phòng, tiền cọc (nếu khách hỏi), dịch vụ chưa cộng và trạng thái chưa giữ chỗ.
- Chỉ trả lời chính sách trong mục đã được chủ khách sạn duyệt. Với chính sách chưa duyệt, nói chưa có thông tin chính thức và hướng khách đến lễ tân.
- Không lộ dữ liệu booking của khách khác; truy vấn nội bộ dựa trên JWT/role và các công cụ backend đã cấp.

## 7. Điểm cần chủ dự án kiểm tra

Bạn có thể ghi nhận theo số mục để mình cập nhật bản chatbot sau khi duyệt:

1. **Tên hiển thị** từng loại phòng có đúng ý không? Đặc biệt hai hạng Phòng cao cấp có sức chứa 2 khách và 4 khách.
2. **Sức chứa/giá cơ bản** trong bảng có khớp giá bạn muốn công bố không?
3. **Dịch vụ:** tên tiếng Việt, mô tả, giá và đơn vị tính (mỗi khách/lượt/kg/đêm/gói) của từng dịch vụ.
4. **Tiền cọc 10% và hạn 15 phút:** có phải chính sách khách sạn muốn công bố không?
5. **Hủy/hoàn tiền:** mốc hủy, phí phạt, điều kiện hoàn và thời gian xử lý mong muốn.
6. **Nhận/trả phòng:** 14:00/12:00 có đúng không; phụ phí nhận sớm/trả trễ thế nào?
7. Thuế/phí, trẻ em, giường phụ, thú cưng, hút thuốc, bữa sáng và các chính sách khác bạn muốn chatbot tư vấn.

Sau khi bạn xác nhận/chỉnh các mục trên, mình sẽ cập nhật `DU_LIEU_HUAN_LUYEN_CHATBOT_THEO_VAI_TRO.md` theo chính sách đã duyệt và giữ các quy tắc không bịa dữ liệu/không tự thao tác nghiệp vụ.
