# HERO V41 – Hoàn thiện chức năng, giữ nguyên logic cũ

Mục tiêu: sửa các điểm có thể gây sai trạng thái hoặc dữ liệu trong các luồng đang có, không đổi giao diện và không thay đổi nghiệp vụ đã thống nhất.

## Các điểm hardening
- Webhook thanh toán: kiểm tra mã booking/mã giao dịch, số tiền hợp lệ, booking còn `PENDING_PAYMENT`, chưa quá 15 phút và số tiền khớp tiền cọc trước khi ghi `SUCCESS`.
- Duyệt thanh toán thủ công: khóa payment + booking trong transaction; không cho duyệt cọc khi booking đã hết hạn/đã đổi trạng thái; kiểm tra số tiền cọc khớp.
- Thanh toán phần còn lại: chỉ xác nhận khi booking còn ở trạng thái phù hợp.
- Thêm validate số lượng dịch vụ tại endpoint lễ tân (1–50), tránh dữ liệu quantity không hợp lệ.

## Giữ nguyên
- Không đổi giao diện.
- Không đổi luồng cọc 10%.
- Không đổi thời hạn thanh toán 15 phút.
- Không đổi check-in 14:00 / checkout 12:00.
- Không đổi quyền duyệt thanh toán.
- Không đổi luồng hoàn tiền Manager/Admin.
- Không đưa `.env` hoặc secret vào ZIP.
