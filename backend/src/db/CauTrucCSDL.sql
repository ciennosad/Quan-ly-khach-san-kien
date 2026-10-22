CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(30),
  address VARCHAR(255),
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER'
    CHECK (role IN ('ADMIN','MANAGER','RECEPTIONIST','STAFF','CUSTOMER')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  id_card_number VARCHAR(20),
  id_card_front_url TEXT,
  id_card_back_url TEXT,
  kyc_status VARCHAR(20) NOT NULL DEFAULT 'NONE' CHECK (kyc_status IN ('NONE','PENDING','VERIFIED','REJECTED')),
  kyc_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) UNIQUE NOT NULL,
  description TEXT,
  capacity INT NOT NULL DEFAULT 2,
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number VARCHAR(30) UNIQUE NOT NULL,
  room_type_id UUID NOT NULL REFERENCES room_types(id),
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE','BOOKED','OCCUPIED','CLEANING','MAINTENANCE')),
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  cleaning_started_at TIMESTAMPTZ,
  cleaning_completed_at TIMESTAMPTZ,
  maintenance_note TEXT,
  maintenance_started_at TIMESTAMPTZ,
  maintenance_expected_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code VARCHAR(40) UNIQUE NOT NULL,
  customer_id UUID REFERENCES users(id),
  room_id UUID NOT NULL REFERENCES rooms(id),
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ NOT NULL,
  actual_check_in TIMESTAMPTZ,
  actual_check_out TIMESTAMPTZ,
  room_price NUMERIC(12,2) NOT NULL,
  deposit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  guest_count INT NOT NULL DEFAULT 1 CHECK (guest_count BETWEEN 1 AND 20),
  customer_phone VARCHAR(30),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT'
    CHECK (status IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED')),
  cancellation_reason TEXT,
  qr_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (check_out > check_in)
);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) UNIQUE NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS booking_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  quantity INT NOT NULL DEFAULT 1 CHECK(quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  used_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  transaction_code VARCHAR(120) UNIQUE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('DEPOSIT','BALANCE','REFUND')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  provider VARCHAR(50),
  proof_url TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID UNIQUE NOT NULL REFERENCES bookings(id),
  room_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  service_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  surcharge NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS special_room_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (date_to >= date_from)
);
CREATE INDEX IF NOT EXISTS idx_special_room_prices_lookup ON special_room_prices(room_type_id,date_from,date_to,is_active);

CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) UNIQUE NOT NULL,
  percent_off INT CHECK (percent_off IS NULL OR (percent_off>0 AND percent_off<=100)),
  amount_off NUMERIC(12,2) CHECK (amount_off IS NULL OR amount_off>=0),
  max_uses INT,
  used_count INT NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  link VARCHAR(255),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES users(id),
  room_id UUID NOT NULL REFERENCES rooms(id),
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_room_dates ON bookings(room_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_booking_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- Bổ sung cột cho database đã khởi tạo từ trước (an toàn khi chạy lại db:init nhiều lần).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_card_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_card_front_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_card_back_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) NOT NULL DEFAULT 'NONE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_note TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_count INT NOT NULL DEFAULT 1;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30);
ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_code VARCHAR(40);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checkin_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checkin_reminder_claimed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ;
UPDATE bookings SET payment_expires_at=created_at + INTERVAL '15 minutes' WHERE status='PENDING_PAYMENT' AND payment_expires_at IS NULL;
UPDATE payments p SET expires_at=b.payment_expires_at FROM bookings b WHERE p.booking_id=b.id AND p.type='DEPOSIT' AND p.status='PENDING' AND p.expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_payment_expiry ON bookings(status,payment_expires_at);
CREATE INDEX IF NOT EXISTS idx_payments_expiry ON payments(status,expires_at);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleaning_started_at TIMESTAMPTZ;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleaning_completed_at TIMESTAMPTZ;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS maintenance_note TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS maintenance_started_at TIMESTAMPTZ;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS maintenance_expected_end TIMESTAMPTZ;



-- Chấm công và tiền lương (bổ sung, không ảnh hưởng các bảng nghiệp vụ cũ).
ALTER TABLE users ADD COLUMN IF NOT EXISTS payroll_daily_rate NUMERIC(12,2) NOT NULL DEFAULT 0;
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

CREATE TABLE IF NOT EXISTS hotel_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  bank_code VARCHAR(30) NOT NULL DEFAULT 'VCB',
  bank_account VARCHAR(50) NOT NULL DEFAULT '',
  bank_account_name VARCHAR(120) NOT NULL DEFAULT 'LUXORA HOTEL',
  hotel_email VARCHAR(255),
  time_rules_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  cleaning_rules_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE hotel_settings ADD COLUMN IF NOT EXISTS time_rules_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE hotel_settings ADD COLUMN IF NOT EXISTS cleaning_rules_enabled BOOLEAN NOT NULL DEFAULT TRUE;
INSERT INTO hotel_settings(id, bank_code, bank_account, bank_account_name, hotel_email, time_rules_enabled, cleaning_rules_enabled)
VALUES(TRUE, 'VCB', '', 'LUXORA HOTEL', NULL, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;


DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users DROP CONSTRAINT users_role_check;
  END IF;
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN','MANAGER','RECEPTIONIST','STAFF','CUSTOMER'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
