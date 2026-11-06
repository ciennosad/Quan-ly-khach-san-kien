import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {router} from './routes/DuongDanAPI.js';
import {pool} from './db/KetNoiCSDL.js';

const uploadsDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../uploads');
fs.mkdirSync(uploadsDir,{recursive:true});
const app=express();
const port=process.env.PORT||4000;

async function ensureRoomTypeCatalog(){
  const catalog=[
    ['Phong thuong 1 giuong','Phong tieu chuan voi 1 giuong lon, phu hop toi da 2 khach.',2,1200000,['Wifi mien phi','Tivi thong minh','Dieu hoa']],
    ['Phong doi 2 giuong','Phong co 2 giuong rieng biet, phu hop toi da 4 khach.',4,1500000,['Wifi mien phi','Tivi thong minh','Dieu hoa']],
    ['Phong cao cap 1 giuong','Phong cao cap voi 1 giuong lon, phu hop toi da 2 khach.',2,1800000,['Wifi mien phi','Bua sang','Tivi thong minh','Bon tam']],
    ['Phong cao cap 2 giuong','Phong cao cap voi 2 giuong, phu hop toi da 4 khach.',4,2200000,['Wifi mien phi','Bua sang','Tivi thong minh','Bon tam']],
    ['Phong gia dinh 1 giuong lon','Phong rong cho gia dinh voi 1 giuong lon, phu hop toi da 4 khach.',4,2600000,['Wifi mien phi','Bua sang','Tivi thong minh','Tu lanh mini']],
    ['Phong tap the 5 giuong','Phong luu tru nhom voi 5 giuong rieng, phu hop toi da 5 khach.',5,3500000,['Wifi mien phi','Dieu hoa','Tu khoa ca nhan']],
  ];
  for(const [name,description,capacity,price,amenities] of catalog){
    await pool.query(`INSERT INTO room_types(name,description,capacity,base_price,amenities) VALUES($1,$2,$3,$4,$5) ON CONFLICT(name) DO NOTHING`,[name,description,capacity,price,JSON.stringify(amenities)]);
  }
}
async function ensurePayrollSchema(){
  try{
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS payroll_daily_rate NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checkin_reminder_sent_at TIMESTAMPTZ;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checkin_reminder_claimed_at TIMESTAMPTZ;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30);
      ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
      ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
      ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
      ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_bookings_payment_expiry ON bookings(status,payment_expires_at);
      CREATE INDEX IF NOT EXISTS idx_payments_expiry ON payments(status,expires_at);
      CREATE TABLE IF NOT EXISTS special_room_prices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_type_id UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
        name VARCHAR(160) NOT NULL,
        date_from DATE NOT NULL,
        date_to DATE NOT NULL,
        price NUMERIC(12,2) NOT NULL CHECK(price >= 0),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK(date_to >= date_from)
      );
      CREATE INDEX IF NOT EXISTS idx_special_room_prices_lookup ON special_room_prices(room_type_id,date_from,date_to,is_active);
      UPDATE bookings SET payment_expires_at=created_at + INTERVAL '15 minutes' WHERE status='PENDING_PAYMENT' AND payment_expires_at IS NULL;
      UPDATE payments p SET expires_at=b.payment_expires_at FROM bookings b WHERE p.booking_id=b.id AND p.type='DEPOSIT' AND p.status='PENDING' AND p.expires_at IS NULL;
      UPDATE payments SET expires_at=created_at + INTERVAL '15 minutes' WHERE type='DEPOSIT' AND status='PENDING' AND expires_at IS NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS payroll_monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS housing_allowance NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS transport_allowance NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS attendance_bonus NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_employee NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_employer NUMERIC(12,2) NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS attendance_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        work_date DATE NOT NULL,
        clock_in TIMESTAMPTZ,
        clock_out TIMESTAMPTZ,
        device_key VARCHAR(120),
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, work_date),
        CHECK (clock_out IS NULL OR clock_in IS NULL OR clock_out >= clock_in)
      );
      CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_records(user_id, work_date DESC);
      CREATE TABLE IF NOT EXISTS payroll_accounts (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        bank_code VARCHAR(30) NOT NULL,
        bank_account VARCHAR(50) NOT NULL,
        account_name VARCHAR(120) NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS payroll_periods (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        month_key CHAR(7) UNIQUE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
        closed_at TIMESTAMPTZ,
        closed_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS payroll_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        work_days INT NOT NULL DEFAULT 0,
        total_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
        daily_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
        monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
        housing_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
        transport_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
        attendance_bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
        insurance_employee NUMERIC(12,2) NOT NULL DEFAULT 0,
        insurance_employer NUMERIC(12,2) NOT NULL DEFAULT 0,
        gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        employer_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
        payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID','PAID')),
        paid_at TIMESTAMPTZ,
        paid_by UUID REFERENCES users(id),
        payment_note TEXT,
        UNIQUE(period_id,user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_payroll_items_user ON payroll_items(user_id);
      ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS housing_allowance NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS transport_allowance NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS attendance_bonus NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS insurance_employee NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS insurance_employer NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS employer_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
      UPDATE payroll_items SET net_amount=COALESCE(NULLIF(net_amount,0),gross_amount), employer_cost=COALESCE(NULLIF(employer_cost,0),gross_amount) WHERE gross_amount>0;
    `);
    console.log('Payroll schema ready.');
  }catch(e){
    console.error('[PAYROLL] Không thể khởi tạo bảng chấm công/lương:',e.message);
  }
}

app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));
app.use(cors({origin:process.env.CLIENT_URL||'http://localhost:5173'}));
app.use(express.json({limit:'2mb'}));
app.use(morgan('dev'));
app.use('/uploads',express.static(uploadsDir));
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'luxora-hotel-api'}));
app.use('/api',router);
app.use((err,_req,res,_next)=>{
  console.error(err);
  const status=err.status|| (err.code==='23505'?409:500);
  res.status(status).json({message:status===409?'Dữ liệu đã tồn tại':(err.message||'Lỗi máy chủ, vui lòng thử lại sau')});
});
async function expirePaymentHolds(){
  try{
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const rows=(await c.query(`
        SELECT b.id,b.booking_code,b.customer_id,p.id payment_id
        FROM bookings b
        JOIN payments p ON p.booking_id=b.id AND p.type='DEPOSIT' AND p.status='PENDING'
        WHERE b.status='PENDING_PAYMENT'
          AND COALESCE(b.payment_expires_at,p.expires_at,b.created_at+INTERVAL '15 minutes') <= NOW()
        FOR UPDATE OF b,p SKIP LOCKED
        LIMIT 100
      `)).rows;
      for(const b of rows){
        await c.query(`UPDATE payments SET status='EXPIRED' WHERE id=$1 AND status='PENDING'`,[b.payment_id]);
        await c.query(`UPDATE bookings SET status='CANCELLED',cancellation_reason='Hết thời hạn thanh toán cọc 15 phút' WHERE id=$1 AND status='PENDING_PAYMENT'`,[b.id]);
        await c.query(`INSERT INTO notifications(user_id,title,message,link) VALUES($1,$2,$3,$4)`,[
          b.customer_id,'Giữ phòng đã hết hạn',`Booking ${b.booking_code} đã hết thời hạn 15 phút để thanh toán cọc nên hệ thống đã hủy giữ phòng. Bạn có thể đặt lại nếu vẫn có nhu cầu.`,'/account'
        ]);
      }
      await c.query('COMMIT');
      if(rows.length) console.log(`[PAYMENT EXPIRY] Đã hết hạn ${rows.length} booking giữ phòng.`);
    }catch(e){ await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }catch(e){ console.error('[PAYMENT EXPIRY] Lỗi:',e.message); }
}

async function sendCheckinReminders(){
  try{
    const rows=(await pool.query(`
      SELECT b.id,b.booking_code,b.check_in,b.room_id,r.room_number,rt.name room_type_name,
             u.id customer_id,u.full_name,u.email
      FROM bookings b
      JOIN users u ON u.id=b.customer_id
      JOIN rooms r ON r.id=b.room_id
      JOIN room_types rt ON rt.id=r.room_type_id
      WHERE b.status='CONFIRMED'
        AND b.check_in > NOW()
        AND b.check_in <= NOW() + INTERVAL '30 minutes'
        AND b.checkin_reminder_sent_at IS NULL
        AND b.checkin_reminder_claimed_at IS NULL
      ORDER BY b.check_in ASC
      LIMIT 100
    `)).rows;
    for(const candidate of rows){
      // Claim atomically trước khi gửi để nhiều worker/process không gửi trùng.
      const claimed=(await pool.query(`UPDATE bookings SET checkin_reminder_claimed_at=NOW()
        WHERE id=$1 AND checkin_reminder_sent_at IS NULL AND checkin_reminder_claimed_at IS NULL
        RETURNING id`,[candidate.id])).rowCount;
      if(!claimed) continue;
      try{
        const b=candidate;
        const when=new Date(b.check_in).toLocaleString('vi-VN',{dateStyle:'medium',timeStyle:'short'});
        const clientUrl=process.env.CLIENT_URL||'http://localhost:5173';
        const html=`<!doctype html><html><body style="margin:0;background:#f3efe7;font-family:Arial,sans-serif;color:#18212b"><div style="max-width:650px;margin:24px auto;background:#fff;border:1px solid #e4ddcf"><div style="padding:28px 32px;background:#18212b;color:#fff"><div style="font-size:11px;letter-spacing:4px;color:#d4b47a">LUXORA HOTEL</div><h1 style="font-family:Georgia,serif;font-weight:400;margin:12px 0 4px">Nhắc lịch nhận phòng</h1></div><div style="padding:30px 32px"><p>Xin chào <b>${String(b.full_name||'Quý khách').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}</b>,</p><p>LUXORA xin nhắc bạn rằng bạn sẽ nhận phòng sau khoảng <b>30 phút</b>.</p><div style="padding:18px;background:#f7f3ea;border:1px solid #e4ddcf"><b>Booking:</b> ${b.booking_code}<br><b>Phòng:</b> ${b.room_number} — ${b.room_type_name}<br><b>Giờ nhận phòng:</b> ${when}</div><p style="margin-top:22px">Vui lòng sắp xếp thời gian di chuyển đến khách sạn để làm thủ tục nhận phòng.</p><a href="${clientUrl}/account" style="display:inline-block;padding:12px 18px;background:#18212b;color:#fff;text-decoration:none">Mở LUXORA</a><p style="font-size:12px;color:#777;margin-top:26px">Đây là email nhắc lịch tự động từ LUXORA HOTEL.</p></div></div></body></html>`;
        await sendMail({to:b.email,subject:`LUXORA — Nhắc lịch nhận phòng ${b.booking_code}`,html});
        await pool.query(`INSERT INTO notifications(user_id,title,message,link) VALUES($1,$2,$3,$4)`,[
          b.customer_id,'Sắp đến giờ nhận phòng',`Booking ${b.booking_code} — phòng ${b.room_number}. Bạn sẽ nhận phòng lúc ${when}, vui lòng sắp xếp thời gian di chuyển đến khách sạn.`,'/account'
        ]);
        await pool.query(`UPDATE bookings SET checkin_reminder_sent_at=NOW(),checkin_reminder_claimed_at=NULL WHERE id=$1`,[b.id]);
        console.log(`[CHECK-IN REMINDER] Đã gửi nhắc cho ${b.booking_code} → ${b.email}`);
      }catch(err){
        // Cho phép retry nếu SMTP/database lỗi; claim không được giữ vĩnh viễn.
        await pool.query(`UPDATE bookings SET checkin_reminder_claimed_at=NULL WHERE id=$1 AND checkin_reminder_sent_at IS NULL`,[candidate.id]).catch(()=>{});
        console.error(`[CHECK-IN REMINDER] Không gửi được ${candidate.booking_code}:`,err.message);
      }
    }
  }catch(err){ console.error('[CHECK-IN REMINDER] Lỗi truy vấn:',err.message); }
}

ensurePayrollSchema().then(ensureRoomTypeCatalog).catch(err=>console.error('[ROOM TYPES] Cannot initialize catalog:',err.message)).finally(()=>{
  app.listen(port,()=>{
    console.log(`LUXORA API → http://localhost:${port}`);
    expirePaymentHolds();
    sendCheckinReminders();
    setInterval(expirePaymentHolds,30*1000);
    setInterval(sendCheckinReminders,60*1000);
  });
});
