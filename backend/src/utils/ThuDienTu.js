import nodemailer from 'nodemailer';

let transporter=null;
if(process.env.SMTP_HOST && process.env.SMTP_USER) {
  transporter=nodemailer.createTransport({
    host:process.env.SMTP_HOST,
    port:Number(process.env.SMTP_PORT||587),
    secure:Number(process.env.SMTP_PORT||587)===465,
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}
  });
  // Kiểm tra kết nối SMTP ngay khi khởi động server, thay vì chỉ phát hiện lỗi khi có
  // khách đặt phòng thật — giúp phát hiện sai SMTP_USER/SMTP_PASS sớm trong log server.
  transporter.verify()
    .then(()=>console.log('[MAIL] Kết nối SMTP OK — email sẽ được gửi thật tới hộp thư khách hàng.'))
    .catch(err=>console.error('[MAIL] ⚠ Kết nối SMTP LỖI, email sẽ KHÔNG gửi được:',err.message,
      '— Kiểm tra lại SMTP_HOST/SMTP_USER/SMTP_PASS trong biến môi trường (Render → Environment).'));
} else {
  console.warn('[MAIL] ⚠ Chưa cấu hình SMTP_HOST/SMTP_USER — email đang chạy ở chế độ DEMO',
    '(chỉ log ra console, KHÔNG gửi email thật). Nếu deploy thật, vào Render → Environment,',
    'thêm đủ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM rồi khởi động lại service.');
}

export async function sendMail({to,subject,html,attachments=[]}) {
  if(!transporter) {
    console.log('[MAIL DEMO — KHÔNG gửi email thật vì thiếu cấu hình SMTP]',{to,subject});
    return {demo:true};
  }
  return transporter.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to,subject,html,attachments});
}


export async function sendTestEmail(to) {
  const safe = String(to || '').trim();
  if (!safe) throw new Error('Thiếu email nhận test');
  return sendMail({
    to: safe,
    subject: 'HERO HOTEL — Email SMTP test',
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:32px;background:#f7f3ea;color:#18212b"><div style="background:#fff;padding:28px;border:1px solid #e5dfd2"><div style="letter-spacing:3px;font-size:11px;color:#b08d57">HERO HOTEL</div><h1 style="font-family:Georgia,serif;font-weight:500">SMTP hoạt động</h1><p>Email test đã được gửi thành công từ hệ thống HERO.</p><p style="color:#6f746f">Bạn có thể dùng cấu hình này để gửi xác nhận đăng ký, xác nhận thanh toán và hóa đơn.</p><div style="margin-top:24px;padding:14px;background:#f7f3ea;font-size:13px">Thời gian: ${new Date().toLocaleString('vi-VN')}</div></div></div>`
  });
}
