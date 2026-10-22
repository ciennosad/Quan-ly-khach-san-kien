# FIX EMAIL QR LUXORA

## Yêu cầu đã sửa
- Email xác nhận/hóa đơn hiển thị rõ mã booking và số phòng ở phần thông tin phía trên.
- Không đặt QR chen giữa phần nội dung thanh toán.
- Đưa **MÃ QR BOOKING** xuống **cuối email**, sau phần lời cảm ơn/thông tin cuối.
- QR được nhúng bằng CID (`booking-qr@luxora.hotel`) để Gmail có thể hiển thị ảnh inline thay vì hiện ô placeholder.
- Nội dung QR gồm mã booking, số phòng và loại phòng.
- Test `test:invoice` dùng cùng bố cục với email thực tế.
- Lịch sử thanh toán tiếp tục hiển thị tiếng Việt: Tiền cọc, Thanh toán phần còn lại, Chuyển khoản ngân hàng, Tiền mặt, Đã thanh toán...

## Kiểm tra
- `node --check backend/src/routes/DuongDanAPI.js`: PASS
- `node --check backend/test-invoice-email.js`: PASS
- Không đưa file `.env` vào bản ZIP.

## Lưu ý Gmail
Việc email vào Inbox hay Spam vẫn do bộ lọc Gmail quyết định. SMTP gửi thành công không đồng nghĩa Gmail luôn phân loại vào Inbox.
