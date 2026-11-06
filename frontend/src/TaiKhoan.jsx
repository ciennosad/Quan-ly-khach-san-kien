import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, money, date, bookingStatusLabel, roleLabel, paymentTypeLabel, paymentStatusLabel, roomTypeLabel, serviceDisplay } from './KetNoiAPI';

const REFUND_STATUS_LABEL = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt — chờ chuyển',
  REJECTED: 'Cần cập nhật thông tin',
  SUCCESS: 'Đã hoàn tiền'
};

function ReviewBox({ booking, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    await api(`/bookings/${booking.booking_code}/review`, { method: 'POST', body: JSON.stringify({ rating: Number(rating), comment }) });
    setSent(true);
    onDone?.();
  }

  if (sent) return <div className="review-box"><span className="notice">Cảm ơn bạn đã đánh giá!</span></div>;
  return (
    <form onSubmit={submit} className="review-box">
      <label>Đánh giá
        <select value={rating} onChange={e => setRating(e.target.value)}>
          {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} sao</option>)}
        </select>
      </label>
      <label style={{ flex: 1, minWidth: 200 }}>Cảm nhận của bạn (tùy chọn)
        <input value={comment} onChange={e => setComment(e.target.value)} />
      </label>
      <button className="btn dark">Gửi đánh giá</button>
    </form>
  );
}

function ProfileTab({ profile, onSaved }) {
  const [form, setForm] = useState({ fullName: profile.full_name || '', phone: profile.phone || '', address: profile.address || '', idCardNumber: profile.id_card_number || '', idCardIssueDate: String(profile.id_card_issue_date || '').slice(0,10) });
  const [msg, setMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    const idCardNumber=String(form.idCardNumber||'').trim();
    const idCardIssueDate=String(form.idCardIssueDate||'').trim();
    if((idCardNumber||idCardIssueDate)&&(!/^\d{12}$/.test(idCardNumber)||!idCardIssueDate)) { setMsg('Nhập đủ số CCCD 12 chữ số và ngày cấp, hoặc xóa cả hai trường.'); return; }
    try {
      const updated = await api('/account/profile', { method: 'PATCH', body: JSON.stringify({ ...form, idCardNumber, idCardIssueDate }) });
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...u, fullName: updated.full_name }));
      onSaved(updated);
      setMsg('Đã lưu thông tin hồ sơ.');
    } catch (e) { setMsg(e.message); }
  }

  return (
    <form onSubmit={submit} className="manage-form">
      <label>Họ tên<input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required /></label>
      <label>Số điện thoại<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
      <label>Địa chỉ<input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></label>
      <label>Thư điện tử (không thể đổi)<input value={profile.email} disabled /></label>
      {profile.role === 'CUSTOMER' && <>
        <label>Số CCCD<input type="text" inputMode="numeric" autoComplete="off" maxLength="12" value={form.idCardNumber} onChange={e => setForm({ ...form, idCardNumber: e.target.value.replace(/\D/g,'').slice(0,12) })} placeholder="Nhập đủ 12 chữ số" /></label>
        <label>Ngày cấp CCCD<input type="date" max={new Date().toISOString().slice(0,10)} value={form.idCardIssueDate} onChange={e => setForm({ ...form, idCardIssueDate: e.target.value })} /></label>
        <small style={{gridColumn:'1/-1'}}>Thông tin CCCD được dùng cho các lần đặt phòng của bạn. Lễ tân chỉ thấy 4 số cuối và ngày cấp.</small>
      </>}
      <button className="btn dark">Lưu thay đổi</button>
      {msg && <span className="notice" style={{ marginTop: 0 }}>{msg}</span>}
    </form>
  );
}

function ServicesTab({ bookings }) {
  const [services, setServices] = useState([]);
  const [bookingCode, setBookingCode] = useState('');
  const [qty, setQty] = useState({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { api('/services').then(setServices).catch(e => setMsg(e.message)).finally(() => setLoading(false)); }, []);
  const activeBookings = bookings.filter(b => ['CONFIRMED','CHECKED_IN'].includes(b.status) && new Date(b.check_out)>new Date());
  useEffect(() => { if (!bookingCode && activeBookings[0]) setBookingCode(activeBookings[0].booking_code); }, [activeBookings.length]);
  async function add(service) {
    if (!bookingCode) { setMsg('Bạn chưa có đặt phòng đang hoạt động để gắn dịch vụ.'); return; }
    try { const n=Number(qty[service.id]||1); await api(`/bookings/${bookingCode}/services`,{method:'POST',body:JSON.stringify({serviceId:service.id,quantity:n})}); setMsg(`Đã đăng ký ${serviceDisplay(service).name} cho đặt phòng ${bookingCode}. Dịch vụ sẽ được tính vào hóa đơn sau khi Lễ tân check-in.`); }
    catch(e){setMsg(e.message)}
  }
  if (loading) return <div className="loader">Đang tải dịch vụ…</div>;
  return <div>
    <div className="notice">Bạn có thể đăng ký dịch vụ cho booking đã xác nhận. Dịch vụ chỉ được tính vào hóa đơn khi Lễ tân check-in.</div>
    {activeBookings.length>0 ? <label style={{maxWidth:420,display:'block',margin:'18px 0'}}>Đặt phòng sử dụng dịch vụ<select value={bookingCode} onChange={e=>setBookingCode(e.target.value)}>{activeBookings.map(b=><option key={b.id} value={b.booking_code}>{b.booking_code} · Phòng {b.room_number}</option>)}</select></label> : <div className="empty">Bạn chưa có đặt phòng đang hoạt động để đặt dịch vụ.</div>}
    {msg && <div className="notice">{msg}</div>}
    <div className="service-customer-grid">{services.map(s=>{const display=serviceDisplay(s);return <div className="customer-service-card" key={s.id}><span className="eyebrow">DỊCH VỤ</span><h3>{display.name}</h3><p>{display.description||'Dịch vụ tại HERO HOTEL'}</p><b>{money(s.price)}</b><div className="service-order"><input type="number" min="1" max="50" value={qty[s.id]||1} onChange={e=>setQty({...qty,[s.id]:e.target.value})}/><button className="btn dark" disabled={!activeBookings.length} onClick={()=>add(s)}>Thêm vào đặt phòng</button></div></div>})}</div>
  </div>;
}

function SecurityTab() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify(form) });
      setMsg('Đổi mật khẩu thành công.');
      setForm({ currentPassword: '', newPassword: '' });
    } catch (e) { setMsg(e.message); }
  }

  return (
    <form onSubmit={submit} className="manage-form">
      <label>Mật khẩu hiện tại
        <input type="password" required value={form.currentPassword} onChange={e => setForm({ ...form, currentPassword: e.target.value })} />
      </label>
      <label>Mật khẩu mới (tối thiểu 8 ký tự)
        <input type="password" required minLength={8} value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} />
      </label>
      <button className="btn dark">Đổi mật khẩu</button>
      {msg && <span className="notice" style={{ marginTop: 0 }}>{msg}</span>}
    </form>
  );
}

function RefundRecipientTab({ bookings }) {
  const [items, setItems] = useState([]);
  const [forms, setForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    async function loadRefunds() {
      setLoading(true);
      setMsg('');
      const cancelled = bookings.filter(x => x.status === 'CANCELLED');
      const results = await Promise.all(cancelled.map(async booking => {
        try {
          const r = await api(`/bookings/${booking.booking_code}/refund`);
          if (r.exists === false) return null;
          const x = r.refund || {};
          return {
            ...booking,
            refund: r,
            form: {
              method: 'BANK_TRANSFER',
              bankCode: x.refundBankCode || '',
              bankAccount: x.refundBankAccount || '',
              accountName: x.refundAccountName || ''
            }
          };
        } catch (e) {
          // Booking cũ có thể không còn bản ghi tương ứng trong database.
          // Không để một refund 404 làm đỏ Console khi khách mở mục Hoàn tiền.
          if (e?.message) return null;
          return null;
        }
      }));
      if (!alive) return;
      const valid = results.filter(Boolean);
      setItems(valid);
      setForms(Object.fromEntries(valid.map(x => [x.booking_code, x.form])));
      setLoading(false);
    }
    loadRefunds();
    return () => { alive = false; };
  }, [bookings]);

  function updateForm(code, patch) {
    setForms(prev => ({ ...prev, [code]: { ...(prev[code] || {}), ...patch } }));
  }

  async function save(booking) {
    const form = forms[booking.booking_code];
    setMsg('');
    try {
      const r = await api(`/bookings/${booking.booking_code}/refund-recipient`, {
        method: 'PATCH',
        body: JSON.stringify(form)
      });
      setItems(prev => prev.map(x => x.booking_code === booking.booking_code ? { ...x, refund: { ...x.refund, ...r } } : x));
      setMsg(`Đã lưu thông tin nhận hoàn tiền cho ${booking.booking_code}.`);
    } catch (e) { setMsg(e.message); }
  }

  if (loading) return <div className="loader">Đang tải yêu cầu hoàn tiền…</div>;
  if (!items.length) return <div className="empty">Hiện chưa có đặt phòng nào phát sinh yêu cầu hoàn tiền.</div>;

  return <div className="refund-recipient-page">
    {msg && <div className="notice">{msg}</div>}
    {items.map(item => {
      const form = forms[item.booking_code] || {};
      const needsInfo = !form.bankCode || !form.bankAccount || !form.accountName;
      // Approved refunds still wait for the transfer, so let the customer correct
      // recipient details until the refund is marked successful.
      const locked = item.refund.status === 'SUCCESS';
      return <div className="refund-recipient-card" key={item.booking_code}>
        <div className="refund-recipient-head">
          <div>
            <span className="eyebrow">YÊU CẦU HOÀN TIỀN</span>
            <h3>{item.booking_code}</h3>
            <p>Phòng {item.room_number} · {roomTypeLabel(item.room_type_name)}</p>
          </div>
          <span className={`status ${(item.refund.status || '').toLowerCase()}`}>{REFUND_STATUS_LABEL[item.refund.status] || paymentStatusLabel(item.refund.status)}</span>
        </div>
        <div className="invoice-line"><span>Số tiền dự kiến hoàn</span><b>{money(item.refund.amount)}</b></div>
        <form onSubmit={e => { e.preventDefault(); save(item); }} className="manage-form" style={{ marginTop: 18 }}>
          <div className="notice" style={{marginBottom:12}}>Thông tin hoàn tiền bắt buộc: chuyển khoản vào tài khoản bạn cung cấp.</div>
          <div className="refund-bank-grid">
            <label>Ngân hàng / mã BIN<input value={form.bankCode || ''} disabled={locked} onChange={e => updateForm(item.booking_code, { bankCode: e.target.value })} placeholder="VCB" className={form.bankCode?.toUpperCase() === 'VCB' ? 'refund-bank-vcb' : ''} required /></label>
            <label>Số tài khoản<input inputMode="numeric" value={form.bankAccount || ''} disabled={locked} onChange={e => updateForm(item.booking_code, { bankAccount: e.target.value })} placeholder="0123456789" required /></label>
            <label>Tên chủ tài khoản<input value={form.accountName || ''} disabled={locked} onChange={e => updateForm(item.booking_code, { accountName: e.target.value })} placeholder="NGUYEN VAN A" required /></label>
          </div>
          {!locked
            ? <button className="btn dark" disabled={needsInfo}>{item.refund.status === 'APPROVED' ? 'Lưu thông tin nhận tiền' : 'Lưu và gửi lại quản lý'}</button>
            : <span className="refund-complete-label">{item.refund.status === 'SUCCESS' ? '✓ Đã hoàn' : 'Đã gửi quản lý duyệt'}</span>}
        </form>
      </div>;
    })}
  </div>;
}

function PaymentHoldCountdown({ seconds, active }) {
  if(!active) return null;
  if(seconds<=0) return <div className="notice" style={{marginTop:12}}>⏱️ Thời hạn thanh toán cọc 15 phút đã hết. Hệ thống đang cập nhật trạng thái giữ phòng.</div>;
  const m=Math.floor(seconds/60), s=seconds%60;
  return <div className="notice" style={{marginTop:12}}>⏱️ Thời gian giữ phòng còn <b>{m}:{String(s).padStart(2,'0')}</b>. Bạn có thể đóng tab và quay lại <b>Phòng của tôi</b> để thanh toán tiếp, nhưng cần hoàn tất trước khi hết thời gian.</div>;
}

function InvoiceRow({ booking, invoiceOnly = true }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [methodMsg, setMethodMsg] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [payQr, setPayQr] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [depositFile, setDepositFile] = useState(null);
  const invoiceStatus = data?.booking?.status || booking.status;
  const latestDepositPayment = [...(data?.payments || [])].filter(p => p.type === 'DEPOSIT').sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
  useEffect(() => {
    if (invoiceStatus !== 'PENDING_PAYMENT') return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [invoiceStatus]);

  async function load() {
    setLoading(true);
    try { setData(await api(`/bookings/${booking.booking_code}/invoice`)); }
    finally { setLoading(false); }
  }

  async function uploadDepositProof(e) {
    e.preventDefault();
    const file = depositFile || e.target.elements.proof?.files?.[0];
    if(!file) { setMethodMsg('Vui lòng tải ảnh bill/biên lai trước khi xác nhận thanh toán.'); return; }
    setProofBusy(true);
    try{
      const fd=new FormData(); fd.append('proof',file);
      await api(`/bookings/${booking.booking_code}/payment-proof`,{method:'POST',body:fd});
      setDepositFile(null);
      await load();
    }catch(e){ setMethodMsg(e.message); } finally { setProofBusy(false); }
  }

  useEffect(() => {
    if (!invoiceOnly || !open || invoiceStatus !== 'PENDING_PAYMENT') return;
    const timer = setInterval(async () => {
      try { setData(await api(`/bookings/${booking.booking_code}/invoice`)); }
      catch (_e) {}
    }, 5000);
    return () => clearInterval(timer);
  }, [invoiceOnly, open, invoiceStatus, booking.booking_code]);

  useEffect(() => {
    const shouldLoadDepositQr = invoiceOnly && open && invoiceStatus === 'PENDING_PAYMENT' &&
      (selectedMethod === 'BANK_TRANSFER' ||
        (latestDepositPayment?.status === 'PENDING' && latestDepositPayment.provider === 'BANK_TRANSFER'));
    if (!shouldLoadDepositQr) {
      if (invoiceStatus !== 'PENDING_PAYMENT' || latestDepositPayment?.status === 'SUCCESS') setPayQr(null);
      return;
    }
    let cancelled = false;
    api(`/bookings/${booking.booking_code}/vietqr?type=DEPOSIT`)
      .then(qr => { if (!cancelled) setPayQr(qr); })
      .catch(e => { if (!cancelled) setMethodMsg(e.message); });
    return () => { cancelled = true; };
  }, [invoiceOnly, open, invoiceStatus, booking.booking_code, selectedMethod, latestDepositPayment?.id, latestDepositPayment?.status, latestDepositPayment?.provider]);

  async function toggle() {
    if (!open && !data) await load();
    setOpen(o => !o);
  }

  // Chỉ tạo khoản thanh toán PENDING khi khách bấm nút xác nhận cuối cùng.
  async function submitPayment(method) {
    setMethodMsg('');
    try {
      await api(`/bookings/${booking.booking_code}/payment-method`, {
        method: 'POST',
        body: JSON.stringify({ method })
      });
      setSelectedMethod('');
      setShowTransfer(false);
      setPayQr(null);
      setMethodMsg(method === 'CASH'
        ? 'Đã gửi yêu cầu thanh toán tiền mặt. Lễ tân sẽ thu tiền và duyệt thanh toán.'
        : 'Đã gửi xác nhận chuyển khoản. Lễ tân sẽ kiểm tra và duyệt thanh toán.');
      await load();
    } catch (e) { setMethodMsg(e.message); }
  }

  async function selectMethod(method) {
    setMethodMsg('');
    setSelectedMethod(method);
    if (method === 'BANK_TRANSFER') {
      setShowTransfer(true);
      if (invoiceOnly && invoiceStatus === 'PENDING_PAYMENT') return;
      try {
        const type = invoiceStatus === 'PENDING_PAYMENT' ? 'DEPOSIT' : 'BALANCE';
        setPayQr(await api(`/bookings/${booking.booking_code}/vietqr?type=${type}`));
      } catch (e) {
        setSelectedMethod('');
        setShowTransfer(false);
        setMethodMsg(e.message);
      }
    } else {
      setShowTransfer(false);
      setPayQr(null);
    }
  }

  const hasDepositPayment = data?.payments?.some(p => p.type === 'DEPOSIT' && ['PENDING', 'SUCCESS'].includes(p.status));
  const hasBalancePayment = data?.payments?.some(p => p.type === 'BALANCE' && ['PENDING', 'SUCCESS'].includes(p.status));
  const paymentExpiry = data?.booking?.payment_expires_at || booking?.payment_expires_at;
  const bookingCreatedAt = data?.booking?.created_at || booking?.created_at;
  const paymentExpiryMs = paymentExpiry ? new Date(paymentExpiry).getTime() : (bookingCreatedAt ? new Date(bookingCreatedAt).getTime()+15*60*1000 : 0);
  const paymentSeconds = Math.max(0, Math.ceil((paymentExpiryMs-nowMs)/1000));
  const paymentStillOpen = invoiceStatus === 'PENDING_PAYMENT' && paymentSeconds > 0;
  const canPayDeposit = data && paymentStillOpen && !data.payments?.some(p => p.type === 'DEPOSIT' && p.status === 'SUCCESS') && Number(booking.deposit_amount || 0) > 0;
  const canChooseMethod = data && data.invoice.remainingTotal > 0 && ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'].includes(invoiceStatus) && !hasBalancePayment;

  return (
    <div>
      <div className="booking-row">
        <div><b>{booking.booking_code}</b><span>Phòng {booking.room_number} · {roomTypeLabel(booking.room_type_name)}</span></div>
        <div><span>{date(booking.check_in)} → {date(booking.check_out)}</span><b>{money(booking.room_price)}</b></div>
        <span className={`status ${(invoiceStatus || '').toLowerCase()}`}>{bookingStatusLabel(invoiceStatus)}</span>
        <button className="btn ghost" onClick={toggle}>{loading ? 'Đang tải…' : open ? 'Ẩn hóa đơn' : 'Xem hóa đơn'}</button>
      </div>
      {open && data && (
        <div className={`invoice-box invoice-card ${invoiceOnly ? 'invoice-customer-layout' : ''}`}>
          <div className="invoice-head">
            <div>
              <span className="eyebrow">HERO HOTEL</span>
              <h3>HÓA ĐƠN LƯU TRÚ</h3>
              <span>{booking.booking_code} · Phòng {booking.room_number} · {roomTypeLabel(booking.room_type_name)}</span>
              <span className="invoice-stay-dates">{date(booking.check_in)} → {date(booking.check_out)}</span>

            </div>
            <div className="invoice-total"><small>TỔNG HÓA ĐƠN</small><b>{money(data.invoice.grandTotal)}</b></div>
          </div>
          {invoiceOnly && invoiceStatus === 'PENDING_PAYMENT' && (() => {
            const rejectedDeposit = latestDepositPayment?.status === 'REJECTED';
            const pendingWithProof = latestDepositPayment?.status === 'PENDING' && !!latestDepositPayment?.proof_url;
            const pendingWithoutProof = latestDepositPayment?.status === 'PENDING' && !latestDepositPayment?.proof_url;
            const depositSuccess = data.payments?.some(p => p.type === 'DEPOSIT' && p.status === 'SUCCESS');
            const showTransferDetails = !!payQr && (selectedMethod === 'BANK_TRANSFER' || pendingWithProof || (pendingWithoutProof && latestDepositPayment.provider === 'BANK_TRANSFER'));
            return (
              <section className={`invoice-customer-payment ${rejectedDeposit ? 'is-rejected' : ''}`}>
                <div className="invoice-payment-top">
                  <div className={`invoice-payment-countdown ${paymentStillOpen ? '' : 'expired'}`}>
                    <span>{paymentStillOpen ? 'THỜI GIAN GIỮ PHÒNG' : 'ĐÃ HẾT THỜI GIAN GIỮ PHÒNG'}</span>
                    <b>{paymentStillOpen ? `${String(Math.floor(paymentSeconds/60)).padStart(2,'0')}:${String(paymentSeconds%60).padStart(2,'0')}` : '00:00'}</b>
                  </div>
                  <div className="invoice-payment-reference"><small>MÃ ĐẶT PHÒNG</small><b>{booking.booking_code}</b></div>
                  <div className="invoice-payment-amount"><small>SỐ TIỀN ĐẶT CỌC</small><b>{money(booking.deposit_amount)}</b></div>
                </div>
                {depositSuccess && <div className="invoice-deposit-status success">Thanh toán thành công. Lễ tân đã xác nhận khoản đặt cọc của bạn.</div>}
                {!depositSuccess && pendingWithoutProof && <div className="invoice-deposit-status pending">
                  {latestDepositPayment.provider === 'CASH' ? 'Yêu cầu tiền mặt đã gửi Lễ tân. Vui lòng thanh toán tại quầy để được xác nhận.' : 'Tải ảnh biên lai bên dưới để Lễ tân kiểm tra và duyệt giao dịch.'}
                </div>}
                {!depositSuccess && rejectedDeposit && <div className="invoice-deposit-status rejected">Giao dịch bị từ chối. Chọn lại phương thức và gửi biên lai mới để Lễ tân kiểm tra.</div>}
                {!depositSuccess && (pendingWithProof || (pendingWithoutProof && latestDepositPayment.provider === 'BANK_TRANSFER') || (!pendingWithoutProof && paymentStillOpen)) && (
                  <div className="invoice-payment-step">
                    {!pendingWithProof && !pendingWithoutProof && !selectedMethod && (
                      <>
                        <p>Chọn phương thức thanh toán</p>
                        <div className="payment-method-actions">
                          <button className="btn ghost" type="button" onClick={() => selectMethod('BANK_TRANSFER')}>🏦 Chuyển khoản</button>
                          <button className="btn ghost" type="button" onClick={() => selectMethod('CASH')}>💵 Tiền mặt tại khách sạn</button>
                        </div>
                      </>
                    )}
                    {showTransferDetails && (
                      <div className="invoice-transfer-step">
                        <div className="invoice-deposit-qr">
                          <h4>THÔNG TIN CHUYỂN KHOẢN</h4>
                          <img src={payQr.url} alt="Mã QR thanh toán tiền cọc" />
                          <div className="invoice-deposit-details">
                            <div><span>Mã đặt phòng</span><b>{payQr.bookingCode}</b></div>
                            <div><span>Ngân hàng</span><b>{payQr.bankCode}</b></div>
                            <div><span>Chủ tài khoản</span><b>{payQr.accountName || 'HERO HOTEL'}</b></div>
                            <div><span>Số tài khoản</span><b>{payQr.account}</b></div>
                            <div><span>Số tiền</span><b>{money(payQr.amount)}</b></div>
                            <div><span>Nội dung chuyển khoản</span><b>{payQr.bookingCode} {payQr.paymentLabel || 'DAT COC'}</b></div>
                          </div>
                        </div>
                        {!pendingWithProof && (
                          <form onSubmit={uploadDepositProof}>
                            <label className="invoice-proof-upload">
                              <span>Ảnh biên lai chuyển khoản</span>
                              <input type="file" name="proof" accept="image/*" required onChange={e => setDepositFile(e.target.files?.[0] || null)} />
                            </label>
                            <button className="btn dark invoice-confirm-payment" disabled={proofBusy || !depositFile}>{proofBusy ? 'Đang gửi...' : 'Xác nhận thanh toán'}</button>
                            <small className="invoice-proof-hint">Ảnh biên lai sẽ được gửi Lễ tân để đối chiếu và duyệt.</small>
                          </form>
                        )}
                      </div>
                    )}
                    {!pendingWithProof && selectedMethod === 'CASH' && (
                      <div className="invoice-cash-confirm">
                        <p>Thanh toán tiền mặt tại quầy. Yêu cầu sẽ được gửi Lễ tân để xác nhận.</p>
                        <div className="payment-method-actions">
                          <button className="btn dark invoice-confirm-payment" type="button" onClick={() => submitPayment('CASH')}>Xác nhận thanh toán</button>
                        </div>
                      </div>
                    )}
                    {selectedMethod && !pendingWithProof && <button className="btn ghost invoice-payment-back" type="button" onClick={() => { setSelectedMethod(''); setShowTransfer(false); setPayQr(null); setDepositFile(null); }}>Đổi phương thức</button>}
                  </div>
                )}
                {!depositSuccess && pendingWithProof && (
                  <div className="invoice-deposit-status pending">Biên lai đã gửi Lễ tân. Đang chờ kiểm tra và duyệt thanh toán.</div>
                )}
              </section>
            );
          })()}
          {invoiceOnly && invoiceStatus !== 'PENDING_PAYMENT' && data.payments?.some(p => p.type === 'DEPOSIT' && p.status === 'SUCCESS') && (
            <section className="invoice-customer-payment is-success">
              <div className="invoice-payment-top">
                <div className="invoice-payment-reference"><small>MÃ ĐẶT PHÒNG</small><b>{booking.booking_code}</b></div>
                <div className="invoice-payment-amount"><small>TIỀN ĐẶT CỌC ĐÃ DUYỆT</small><b>{money(data.invoice.depositTotal)}</b></div>
              </div>
              <div className="invoice-deposit-status success">Thanh toán thành công. Lễ tân đã xác nhận và hóa đơn đã được gửi qua email.</div>
            </section>
          )}

          <div className="invoice-main-grid">
            <section className="invoice-breakdown">
              <div className="invoice-section-title"><span>CHI TIẾT CHI PHÍ</span><small>{data.finalized ? 'Hóa đơn đã chốt' : 'Hóa đơn tạm tính'}</small></div>
              <div className="invoice-line"><span>Giá phòng</span><b>{money(data.invoice.roomTotal)}</b></div>
              {data.services.map(s => (
                <div className="invoice-line" key={s.id}><span>{serviceDisplay(s).name} × {s.quantity}</span><b>{money(s.quantity * s.unit_price)}</b></div>
              ))}
              {data.plannedServices?.length > 0 && <div className="invoice-planned-services"><b>Dịch vụ đã chọn, chờ check-in</b>{data.plannedServices.map(s=><div key={s.id}><span>{serviceDisplay(s).name} × {s.quantity}</span><span>{money(s.quantity*s.unit_price)} · chưa tính vào hóa đơn</span></div>)}</div>}
              {data.invoice.surcharge > 0 && <div className="invoice-line"><span>Phụ phí trả phòng muộn</span><b>{money(data.invoice.surcharge)}</b></div>}
            </section>
            <aside className="invoice-summary">
              <div className="invoice-section-title"><span>TỔNG KẾT THANH TOÁN</span></div>
              <div className="invoice-summary-row"><span>Tổng hóa đơn</span><b>{money(data.invoice.grandTotal)}</b></div>
              <div className="invoice-summary-row paid"><span>Tiền cọc đã trả</span><b>{money(data.invoice.depositTotal)}</b></div>
              <div className="invoice-summary-due"><span>CÒN PHẢI THANH TOÁN</span><b>{money(data.invoice.remainingTotal)}</b></div>
            </aside>
          </div>
          {data.payments.length > 0 && (
            <section className="invoice-history">
              <div className="invoice-section-title"><span>LỊCH SỬ THANH TOÁN</span><small>{data.payments.length} giao dịch</small></div>
              {data.payments.map(p => (
                <div className="invoice-line" key={p.id}>
                  <span>{paymentTypeLabel(p.type)} · {p.provider === 'CASH' ? 'Tiền mặt' : p.provider === 'BANK_TRANSFER' ? 'Chuyển khoản' : p.provider} · {date(p.paid_at || p.created_at)}
                    {p.proof_url && <a href={(import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace('/api','') + p.proof_url} target="_blank" rel="noreferrer" style={{display:'block',marginTop:6}}>🧾 Xem ảnh bill/biên lai</a>}
                  </span>
                  <b>{money(p.amount)} <span className={`status ${(p.status || '').toLowerCase()}`}>{paymentStatusLabel(p.status)}</span></b>
                </div>
              ))}
            </section>
          )}
          {!data.finalized && <p className="empty">* Hóa đơn tạm tính, sẽ chốt chính thức sau khi trả phòng. Sau khi thanh toán được xác nhận, hệ thống sẽ gửi thư điện tử hóa đơn tới địa chỉ của bạn nếu cấu hình gửi thư đã được thiết lập.</p>}
          {!invoiceOnly && <PaymentHoldCountdown seconds={paymentSeconds} active={invoiceStatus === 'PENDING_PAYMENT'} />}



          {!invoiceOnly && invoiceStatus === 'PENDING_PAYMENT' && !data.payments?.some(p => p.type === 'DEPOSIT' && p.status === 'SUCCESS') && (
            <form onSubmit={uploadDepositProof} className="payment-method-box" style={{marginTop:12}}>
              <p><b>Biên lai đặt cọc</b><br/>Nếu bạn đã chuyển khoản, hãy tải <b>ảnh bill/biên lai</b> lên đây để Lễ tân đối chiếu.</p>
              <input type="file" name="proof" accept="image/*" required />
              <button className="btn dark" disabled={proofBusy}>{proofBusy?'Đang gửi…':'Gửi ảnh bill cho Lễ tân'}</button>
            </form>
          )}

          {(!invoiceOnly || invoiceStatus !== 'PENDING_PAYMENT') && canPayDeposit && !showTransfer && !selectedMethod && (
            <div className="payment-method-box">
              <p><b>Thanh toán tiền cọc</b><br />Tiền cọc cần thanh toán: <b>{money(booking.deposit_amount)}</b>. Bạn có thể đóng tab và quay lại mục Phòng của tôi để mở lại khoản thanh toán này.</p>
              <div className="payment-method-actions">
                <button className="btn dark" onClick={() => selectMethod('CASH')}>💵 Tiền mặt</button>
                <button className="btn ghost" onClick={() => selectMethod('BANK_TRANSFER')}>🏦 Chuyển khoản</button>
              </div>
            </div>
          )}

          {!invoiceOnly && canPayDeposit && selectedMethod === 'CASH' && (
            <div className="payment-method-box">
              <p>Bạn chọn <b>thanh toán tiền cọc bằng tiền mặt</b> tại quầy.</p>
              <div className="payment-method-actions">
                <button className="btn dark" onClick={() => submitPayment('CASH')}>✓ Xác nhận thanh toán cọc</button>
                <button className="btn ghost" onClick={() => setSelectedMethod('')}>Quay lại</button>
              </div>
            </div>
          )}

          {!invoiceOnly && canPayDeposit && selectedMethod === 'BANK_TRANSFER' && showTransfer && payQr && (
            <div className="qr">
              <h3>Thanh toán cọc {money(payQr.amount)}</h3>
              <img src={payQr.url} alt="VietQR thanh toán tiền cọc" style={{ width: 220, height: 'auto' }} />
              <p>Ngân hàng: {payQr.bankCode} · STK: {payQr.account}<br />Nội dung: <b>{payQr.bookingCode} {payQr.paymentLabel || 'DAT COC'}</b></p>
              <div className="payment-method-actions" style={{ justifyContent: 'center', marginTop: 14 }}>
                <button className="btn dark" onClick={() => submitPayment('BANK_TRANSFER')}>✓ Đã thanh toán cọc</button>
                <button className="btn ghost" onClick={() => { setSelectedMethod(''); setShowTransfer(false); setPayQr(null); }}>Quay lại</button>
              </div>
              <div className="notice" style={{ marginTop: 12 }}>Bạn có thể đóng tab sau khi xem mã QR. Khi đăng nhập lại, booking này vẫn hiển thị để bạn mở lại thanh toán cọc.</div>
            </div>
          )}

{canChooseMethod && !showTransfer && !selectedMethod && (
            <div className="payment-method-box">
              <p><b>Thanh toán tiền còn lại</b><br />Chọn phương thức thanh toán {money(data.invoice.remainingTotal)}:</p>
              <div className="payment-method-actions">
                <button className="btn dark" onClick={() => selectMethod('CASH')}>💵 Tiền mặt</button>
                <button className="btn ghost" onClick={() => selectMethod('BANK_TRANSFER')}>🏦 Chuyển khoản</button>
              </div>
            </div>
          )}

          {canChooseMethod && selectedMethod === 'CASH' && (
            <div className="payment-method-box">
              <p>Bạn chọn <b>thanh toán tiền mặt</b> tại quầy.</p>
              <div className="payment-method-actions">
                <button className="btn dark" onClick={() => submitPayment('CASH')}>💵 Thanh toán tiền mặt</button>
                <button className="btn ghost" onClick={() => setSelectedMethod('')}>Quay lại</button>
              </div>
            </div>
          )}

          {canChooseMethod && selectedMethod === 'BANK_TRANSFER' && showTransfer && payQr && (
            <div className="qr">
              <h3>Chuyển khoản {money(payQr.amount)}</h3>
              <img src={payQr.url} alt="VietQR chuyển khoản" style={{ width: 220, height: 'auto' }} />
              <p>Ngân hàng: {payQr.bankCode} · STK: {payQr.account}<br />Nội dung: <b>{payQr.bookingCode} {payQr.paymentLabel || 'THANH TOAN'}</b></p>
              <div className="payment-method-actions" style={{ justifyContent: 'center', marginTop: 14 }}>
                <button className="btn dark" onClick={() => submitPayment('BANK_TRANSFER')}>✓ Đã thanh toán</button>
                <button className="btn ghost" onClick={() => { setSelectedMethod(''); setShowTransfer(false); setPayQr(null); }}>Quay lại</button>
              </div>
              <div className="notice" style={{ marginTop: 12 }}>Sau khi bạn bấm “Đã thanh toán”, khoản này sẽ chuyển sang trạng thái chờ duyệt. Lễ tân sẽ kiểm tra và xác nhận thanh toán.</div>
            </div>
          )}

          {methodMsg && <div className="notice">{methodMsg}</div>}
          {hasBalancePayment && <div className="notice">Khoản thanh toán còn lại đang chờ lễ tân xác nhận hoặc đã được xác nhận.</div>}
        </div>
      )}
    </div>
  );
}


function MyRoomsTab({ bookings, profile, onReload, onCancel, onOpenInvoices, msg }) {
  const [expanded, setExpanded] = useState(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const active = bookings.filter(x => ['CONFIRMED','CHECKED_IN'].includes(x.status));
  const past = bookings.filter(x => !['CONFIRMED','CHECKED_IN'].includes(x.status));
  const latest = bookings[0] || null;
  const totalRoomSpend = bookings.reduce((sum, x) => sum + Number(x.room_price || 0), 0);
  const customerName = profile?.full_name || JSON.parse(localStorage.getItem('user') || '{}').fullName || 'Khách hàng';

  const jump = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // Cho phép menu trên header gọi đúng khu vực ngay cả khi dữ liệu đang tải.
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  useEffect(() => {
    const target = window.location.hash?.replace('#', '');
    if (!target) return;
    const timer = window.setTimeout(() => jump(target), 120);
    return () => window.clearTimeout(timer);
  }, [bookings.length, window.location.hash]);

  return (
    <div className="customer-dashboard">
      <aside className="customer-dashboard-side">
        <div className="customer-dashboard-brand"><span className="brand-mark">H</span><span>HERO <i>HOTEL</i></span></div>
        <div className="customer-side-label">KHÁCH HÀNG</div>
        <nav className="customer-side-nav">
          <Link to="/"><span>⌂</span>Trang chủ</Link>
          <button className="active"><span>▣</span>Phòng của tôi</button>
          <button onClick={() => { window.location.href = '/#booking'; }}><span>▤</span>Đặt phòng</button>
          <button onClick={() => jump('my-room-services')}><span>♧</span>Dịch vụ</button>
          <Link to="/account?tab=invoices"><span>▤</span>Hóa đơn</Link>
          <Link to="/account?tab=refunds"><span>↩</span>Hoàn tiền</Link>
          <Link to="/account?tab=history"><span>◷</span>Lịch sử</Link>
          <button onClick={() => { window.location.href = '/#experience'; }}><span>ⓘ</span>Về chúng tôi</button>
        </nav>
        <div className="customer-side-label customer-side-account-label">THÔNG TIN TÀI KHOẢN</div>
        <nav className="customer-side-nav customer-side-account-nav">
          <Link to="/account?tab=profile"><span>♙</span>Hồ sơ</Link>
          <Link to="/account?tab=security"><span>◈</span>Bảo mật</Link>
        </nav>
        <div className="customer-side-help"><b>Hỗ trợ 24/7</b><small>HERO luôn sẵn sàng phục vụ bạn</small><span>1900 1234</span></div>
      </aside>

      <div className="customer-dashboard-main">
        <div className="customer-dashboard-topline">
          <div><span className="eyebrow">TRẢI NGHIỆM CỦA BẠN</span><h2>Xin chào, {customerName}</h2></div>
          <Link className="btn primary customer-book-now" to="/#booking">Đặt phòng ngay <span>→</span></Link>
        </div>

        <section className="customer-welcome-card">
          <div className="customer-welcome-copy"><span className="eyebrow">KHÔNG GIAN LƯU TRÚ CỦA TÔI</span><h1>Phòng của tôi</h1><p>Theo dõi phòng, thời gian lưu trú, thanh toán và hóa đơn trong một màn hình.</p></div>
          <div className="customer-welcome-count"><b>{bookings.length}</b><span>ĐẶT PHÒNG</span></div>
        </section>

        {msg && <div className="notice">{msg}</div>}

        <section className="customer-quick-grid">
          <button className="customer-quick-card" onClick={() => jump('my-room-bookings')}><span className="quick-icon">▣</span><span><b>Đặt phòng của bạn</b><small>Xem và quản lý các đặt phòng hiện có</small></span><strong>→</strong></button>
          <button className="customer-quick-card" onClick={onOpenInvoices}><span className="quick-icon">▤</span><span><b>Thông tin thanh toán</b><small>Xem lịch sử thanh toán và hóa đơn</small></span><strong>→</strong></button>
        </section>

        <section className="customer-content-grid">
          <div className="customer-main-column">
            <div id="my-room-bookings" className="customer-panel customer-recent-panel">
              <div className="customer-panel-head"><div><span className="eyebrow">LỊCH SỬ LƯU TRÚ</span><h3>Đặt phòng gần nhất</h3></div><span>{bookings.length} đặt phòng</span></div>
              {latest ? <div className="customer-feature-booking">
                <div className="customer-booking-room"><div className="customer-room-placeholder">{latest.room_number}</div><div><span className="eyebrow">PHÒNG {latest.room_number}</span><h4>{roomTypeLabel(latest.room_type_name)}</h4><b>{latest.booking_code}</b></div></div>
                <div className="customer-booking-meta"><span>Nhận phòng<b>{date(latest.check_in)}</b></span><span>Trả phòng<b>{date(latest.check_out)}</b></span><span>Trạng thái<b><span className={`status ${(latest.status || '').toLowerCase()}`}>{bookingStatusLabel(latest.status)}</span></b></span><span>Giá phòng<b>{money(latest.room_price)}</b></span></div>
                <div className="customer-booking-actions"><button className="btn dark" onClick={() => setExpanded(expanded === latest.id ? null : latest.id)}>{expanded === latest.id ? 'Thu gọn' : 'Xem chi tiết'} <span>→</span></button>{['PENDING_PAYMENT','CONFIRMED'].includes(latest.status) && <button className="btn ghost" onClick={() => onCancel(latest)}>Hủy đặt phòng</button>}</div>
                {expanded === latest.id && <div className="my-room-detail customer-feature-detail"><p>CCCD: {latest.id_card_number ? `********${String(latest.id_card_number).slice(-4)}` : 'Chưa cập nhật'}</p><InvoiceRow booking={latest} /></div>}
              </div> : <div className="empty">Bạn chưa có đặt phòng nào.</div>}

              {bookings.length > 1 && <div className="customer-booking-history">
                {(showAllHistory ? bookings.slice(1) : bookings.slice(1, 4)).map(x => <div className="customer-history-item" key={x.id}><div><b>Phòng {x.room_number}</b><span>{roomTypeLabel(x.room_type_name)}</span></div><div><b>{x.booking_code}</b><span>{date(x.check_in)} → {date(x.check_out)}</span></div><span className={`status ${(x.status || '').toLowerCase()}`}>{bookingStatusLabel(x.status)}</span><button className="btn ghost" onClick={() => setExpanded(expanded === x.id ? null : x.id)}>{expanded === x.id ? 'Thu gọn' : 'Chi tiết'}</button>{expanded === x.id && <div className="customer-history-detail"><p>CCCD: {x.id_card_number ? `********${String(x.id_card_number).slice(-4)}` : 'Chưa cập nhật'}</p><InvoiceRow booking={x} />{x.status === 'COMPLETED' && <ReviewBox booking={x} onDone={onReload} />}</div>}</div>)}
                {bookings.length > 4 && <button className="customer-history-toggle" onClick={() => setShowAllHistory(v => !v)}>{showAllHistory ? 'Thu gọn lịch sử' : `Xem thêm ${bookings.length - 4} đặt phòng`}</button>}
              </div>}
            </div>

            <div className="customer-stat-grid">
              <div><span>▣</span><small>Tổng số đặt phòng</small><b>{bookings.length}</b><em>Đã đặt tại HERO</em></div>
              <div><span>₫</span><small>Tổng chi tiêu phòng</small><b>{money(totalRoomSpend)}</b><em>Tổng theo dữ liệu đặt phòng</em></div>
              <div><span>●</span><small>Đang lưu trú</small><b>{active.length}</b><em>Đặt phòng đang hoạt động</em></div>
            </div>

            <div id="my-room-services" className="my-rooms-module customer-wide-module"><div className="module-title"><span>♧</span><div><b>Dịch vụ</b><small>Thêm dịch vụ vào đặt phòng đang hoạt động</small></div></div><ServicesTab bookings={bookings} /></div>



          </div>

          <aside className="customer-right-column">
            <div className="customer-panel customer-profile-panel"><div className="customer-panel-head"><div><span className="eyebrow">TÀI KHOẢN</span><h3>Thông tin tài khoản</h3></div></div><div className="customer-avatar">{customerName.charAt(0).toUpperCase()}</div><h4>{customerName}</h4><p>{profile?.email || ''}</p><dl><div><dt>Số điện thoại</dt><dd>{profile?.phone || 'Chưa cập nhật'}</dd></div><div><dt>Địa chỉ</dt><dd>{profile?.address || 'Chưa cập nhật'}</dd></div></dl><Link className="btn ghost customer-profile-edit" to="/account?tab=profile">✎ Chỉnh sửa thông tin</Link></div>
            <div className="customer-panel customer-status-panel"><div className="customer-panel-head"><div><span className="eyebrow">TRẠNG THÁI</span><h3>Đặt phòng của bạn</h3></div></div><div className="customer-status-row"><span>Đang lưu trú</span><b>{active.length}</b></div><div className="customer-status-row"><span>Đã hoàn tất / hủy</span><b>{past.length}</b></div><div className="customer-status-row"><span>Tổng đặt phòng</span><b>{bookings.length}</b></div></div>
          </aside>
        </section>
      </div>
    </div>
  );
}


const SELF_SALARY_RANGES = {
  RECEPTIONIST: '8–10 triệu/tháng',
  STAFF: '6–9 triệu/tháng'
};

function currentVNMonth() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}

function normalizePayrollBank(b) {
  if (!b) return { bankCode: '', bankAccount: '', accountName: '' };
  return {
    bankCode: b.bankCode ?? b.bank_code ?? '',
    bankAccount: b.bankAccount ?? b.bank_account ?? '',
    accountName: b.accountName ?? b.account_name ?? ''
  };
}

export function PayrollTab({ user }) {
  const [month,setMonth]=useState(currentVNMonth());
  const [attendance,setAttendance]=useState([]);
  const [payroll,setPayroll]=useState(null);
  const [bank,setBank]=useState({bankCode:'',bankAccount:'',accountName:''});
  const [msg,setMsg]=useState('');
  const [loading,setLoading]=useState(true);
  const deviceKeyRef = useRef(null);
  if(!deviceKeyRef.current){ deviceKeyRef.current=localStorage.getItem('luxoraAttendanceDevice') || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `dev-${Date.now()}-${Math.random()}`); localStorage.setItem('luxoraAttendanceDevice',deviceKeyRef.current); }
  async function load(){
    setLoading(true); setMsg('');
    try{ const [a,p,b]=await Promise.all([api(`/attendance/me?month=${month}`),api(`/payroll/me?month=${month}`),api('/payroll/account')]); setAttendance(Array.isArray(a) ? a : []);setPayroll(p);setBank(normalizePayrollBank(b)); }
    catch(e){setMsg(e.message)} finally{setLoading(false)}
  }
  useEffect(()=>{load()},[month]);
  async function saveBank(e){e.preventDefault();setMsg('Đang lưu tài khoản nhận lương…');try{const r=await api('/payroll/account',{method:'PATCH',body:JSON.stringify(bank)});setBank(normalizePayrollBank(r));setMsg('Đã lưu tài khoản nhận lương thành công.')}catch(e){setMsg(`Không lưu được: ${e.message}`)}}
  useEffect(()=>{
    const token=new URLSearchParams(window.location.search).get('attendanceToken');
    if(!token || !['STAFF','RECEPTIONIST'].includes(user.role)) return;
    api('/attendance/toggle',{method:'POST',body:JSON.stringify({token,deviceKey:deviceKeyRef.current})}).then(r=>{setMsg(r.message);load();}).catch(e=>setMsg(e.message)).finally(()=>window.history.replaceState({},'',`${window.location.pathname}?tab=attendance`));
  },[]);
  if(loading) return <div className="center-page">Đang tải chấm công và bảng lương…</div>;
  return <div className="payroll-self-page">
    {msg && <div className="notice">{msg}</div>}
    <div className="payroll-self-grid">
      <section className="account-card payroll-self-card"><div className="module-title"><span>◷</span><div><b>Chấm công</b><small>Dùng Camera điện thoại cá nhân quét QR đang hiển thị ở tài khoản Quản lý tại khách sạn.</small></div></div>
        <div className="attendance-scan-guide">
          <b>📱 Cách chấm công</b>
          <span>1. Đến khu vực làm việc tại khách sạn.</span>
          <span>2. Mở <b>Camera</b> trên điện thoại và quét QR chấm công trên màn hình Quản lý.</span>
          <span>3. Mở liên kết HERO hiện ra và đăng nhập đúng tài khoản cá nhân nếu được yêu cầu.</span>
          <span>4. Quét lần đầu để <b>Vào ca</b>, quét lần tiếp theo để <b>Ra ca</b>.</span>
          <small>Mã QR có hiệu lực 10 phút. Sau khi hết hạn, Quản lý sẽ có mã mới.</small>
        </div>
        <label>Tháng<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
        <div className="attendance-today"><b>Hôm nay</b><span>{attendance.find(x=>String(x.work_date).slice(0,10)===new Date().toLocaleDateString('en-CA'))?.clock_in ? 'Đã vào ca' : 'Chưa vào ca'}</span></div>
        <div className="attendance-list">{attendance.length?attendance.map(a=><div className="attendance-item" key={a.id}><div><b>{String(a.work_date).slice(0,10)}</b><span>Vào: {a.clock_in?date(a.clock_in):'—'}</span></div><div><span>Ra: {a.clock_out?date(a.clock_out):'Đang làm'}</span></div></div>):<div className="empty">Chưa có chấm công trong tháng.</div>}</div>
      </section>
      <section className="account-card payroll-self-card"><div className="module-title"><span>₫</span><div><b>Tài khoản nhận lương</b><small>Thông tin để Quản lý/Admin sử dụng khi thanh toán cuối tháng.</small></div></div>
        <div className="salary-reference-self"><span>Mức lương tham khảo theo khảo sát</span><b>{SELF_SALARY_RANGES[user.role] || '—'}</b><small>Đây là khoảng tham khảo theo vị trí, không phải mức lương cố định của từng người.</small></div>
        <form onSubmit={saveBank} className="form-grid"><label>Ngân hàng<input value={bank.bankCode||''} onChange={e=>setBank({...bank,bankCode:e.target.value})} placeholder="MB" required/></label><label>Số tài khoản<input value={bank.bankAccount||''} onChange={e=>setBank({...bank,bankAccount:e.target.value})} required/></label><label className="full">Tên chủ tài khoản<input value={bank.accountName||''} onChange={e=>setBank({...bank,accountName:e.target.value})} required/></label><button className="btn dark" type="submit">Lưu tài khoản nhận lương</button></form>
      </section>
    </div>
    <section className="account-card payroll-self-card"><div className="module-title"><span>▤</span><div><b>Bảng lương tháng {month}</b><small>Chỉ hiển thị bảng lương của tài khoản đang đăng nhập.</small></div></div>
      {payroll ? <div className="payroll-self-summary"><div><small>Ngày công</small><b>{payroll.work_days}</b></div><div><small>Lương thỏa thuận</small><b>{money(payroll.monthly_salary)}</b></div><div><small>Phụ cấp</small><b>{money(Number(payroll.housing_allowance||0)+Number(payroll.transport_allowance||0)+Number(payroll.attendance_bonus||0))}</b></div><div><small>Bảo hiểm</small><b>{money(payroll.insurance_employee)}</b></div><div><small>Thực nhận</small><b>{money(payroll.net_amount || payroll.gross_amount)}</b></div><div><small>Trạng thái</small><b>{payroll.payment_status==='PAID'?'Đã thanh toán':'Chưa thanh toán'}</b></div></div> : <div className="empty">Tháng này chưa được quản lý chốt công hoặc chưa có bảng lương.</div>}
      {payroll && <div className="payroll-detail-lines"><div><span>Phụ cấp nhà ở</span><b>{money(payroll.housing_allowance)}</b></div><div><span>Phụ cấp xăng xe</span><b>{money(payroll.transport_allowance)}</b></div><div><span>Chuyên cần</span><b>{money(payroll.attendance_bonus)}</b></div><div><span>BH nhân viên khấu trừ</span><b>{money(payroll.insurance_employee)}</b></div><div><span>BH khách sạn đóng</span><b>{money(payroll.insurance_employer)}</b></div><div><span>Tổng chi phí khách sạn</span><b>{money(payroll.employer_cost)}</b></div></div>}
    </section>
  </div>;
}


export function StaffHousekeepingTab() {
  const [rooms,setRooms]=useState([]);
  const [msg,setMsg]=useState('');
  const [cleaningRulesEnabled,setCleaningRulesEnabled]=useState(true);
  const [loading,setLoading]=useState(true);
  async function load(){setLoading(true);try{const rows=await api('/reception/housekeeping');setRooms(rows);if(rows.length&&typeof rows[0].cleaning_rules_enabled==='boolean')setCleaningRulesEnabled(rows[0].cleaning_rules_enabled);}catch(e){setMsg(e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  async function complete(room){
    try{await api(`/reception/rooms/${room.id}/cleaning-complete`,{method:'PATCH'});setRooms(list=>list.filter(x=>x.id!==room.id));setMsg(`Phòng ${room.room_number} đã được xác nhận dọn xong.`)}catch(e){setMsg(e.message)}
  }
  if(loading) return <div className="center-page">Đang tải danh sách phòng cần dọn…</div>;
  return <section className="account-card staff-housekeeping-page">
    <div className="module-title"><span>♧</span><div><b>Dọn phòng</b><small>Danh sách phòng chờ dọn sau khi khách trả phòng. {cleaningRulesEnabled?'Khung chuẩn 12:00–14:00.':'Đang ở chế độ kiểm thử, không giới hạn khung 12:00–14:00.'}</small></div></div>
    {msg&&<div className="notice">{msg}</div>}
    <div className="manage-list">{rooms.map(r=><div className="manage-row" key={r.id}>
      <div><b>Phòng {r.room_number} · {roomTypeLabel(r.room_type_name)}</b><span>Bắt đầu dọn: {date(r.cleaning_started_at)}</span></div>
      <span className={r.cleaning_overdue?'status cancelled':'status active'}>{r.cleaning_overdue?'Quá 14:00':'Đang dọn'} · {r.cleaning_minutes||0} phút</span>
      <button className="btn dark" onClick={()=>complete(r)}>Đã dọn xong</button>
    </div>)}{!rooms.length&&<div className="empty">Không có phòng đang chờ dọn.</div>}</div>
  </section>;
}


function CustomerInvoicesTab({ bookings }) {
  return <section className="customer-standalone-page">
    <div className="customer-standalone-head">
      <div><span className="eyebrow">THANH TOÁN</span><h2>Hóa đơn & thanh toán</h2><p>Xem hóa đơn, gửi biên lai và theo dõi trạng thái thanh toán của từng đặt phòng.</p></div>
      <span className="customer-standalone-count">{bookings.length} hóa đơn</span>
    </div>
    {bookings.length ? <div className="customer-invoice-list">
      {bookings.map(x => <div className="customer-invoice-item" key={x.id}>
        <div className="customer-invoice-item-head">
          <div><span className="eyebrow">BOOKING {x.booking_code}</span><b>Phòng {x.room_number} · {roomTypeLabel(x.room_type_name)}</b><small>{date(x.check_in)} → {date(x.check_out)}</small></div>
          <span className={`status ${(x.status || '').toLowerCase()}`}>{bookingStatusLabel(x.status)}</span>
        </div>
        <InvoiceRow booking={x} invoiceOnly />
      </div>)}
    </div> : <div className="empty">Bạn chưa có hóa đơn nào.</div>}
  </section>;
}

function CustomerHistoryTab({ bookings }) {
  return <section className="customer-standalone-page">
    <div className="customer-standalone-head">
      <div><span className="eyebrow">LỊCH SỬ</span><h2>Lịch sử đặt phòng</h2><p>Lịch sử toàn bộ đặt phòng và lưu trú tại HERO.</p></div>
      <span className="customer-standalone-count">{bookings.length} đặt phòng</span>
    </div>
    {bookings.length ? <div className="customer-history-list customer-history-list-standalone">
      {bookings.map(x => <div className="customer-history-row" key={x.id}>
        <div><b>Phòng {x.room_number} · {roomTypeLabel(x.room_type_name)}</b><small>{x.booking_code}</small></div>
        <div><span>{date(x.check_in)} → {date(x.check_out)}</span><small>{money(x.room_price)}</small></div>
        <span className={`status ${(x.status || '').toLowerCase()}`}>{bookingStatusLabel(x.status)}</span>
      </div>)}
    </div> : <div className="empty">Bạn chưa có lịch sử đặt phòng.</div>}
  </section>;
}

function CustomerRefundTab({ bookings }) {
  return <section className="customer-standalone-page">
    <div className="customer-standalone-head">
      <div><span className="eyebrow">HOÀN TIỀN</span><h2>Yêu cầu hoàn tiền</h2><p>Cập nhật thông tin nhận tiền và theo dõi các yêu cầu hoàn tiền cho booking đã hủy.</p><div className="notice">⚠️ <b>Lưu ý hoàn tiền:</b> để nhận tiền hoàn lại, bạn cần nhập đầy đủ <b>ngân hàng, số tài khoản và tên chủ tài khoản</b> vào phần Thông tin hoàn tiền.</div></div>
    </div>
    <RefundRecipientTab bookings={bookings} />
  </section>;
}

export default function Account() {
  const [b, setB] = useState([]);
  const [profile, setProfile] = useState(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isStaff = ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(user.role);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || (new URLSearchParams(window.location.search).get('attendanceToken') && ['STAFF','RECEPTIONIST'].includes(user.role) ? 'attendance' : null);
  const allowedInitialTabs = ['profile','security','attendance','housekeeping','rooms','invoices','refunds','history'];
  const [tab, setTab] = useState(allowedInitialTabs.includes(initialTab) ? initialTab : 'profile');
  const standaloneCustomerTab = !isStaff && ['rooms', 'invoices', 'refunds', 'history'].includes(tab);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('tab') || (params.get('attendanceToken') && ['STAFF','RECEPTIONIST'].includes(user.role) ? 'attendance' : 'profile');
    if (allowedInitialTabs.includes(requested) && requested !== tab) setTab(requested);
  }, [searchParams]);
  const [msg, setMsg] = useState('');

  const load = () => api('/bookings/mine').then(setB);
  useEffect(() => { api('/account/profile').then(setProfile); }, []);
  useEffect(() => { if (!isStaff) load(); }, []);

  async function cancel(x) {
    if (!confirm(`Hủy đặt phòng ${x.booking_code}?`)) return;
    try {
      const updated = await api(`/bookings/${x.booking_code}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Khách tự hủy' }) });
      setB(list => list.map(y => y.id === x.id ? { ...y, ...updated } : y));
      setMsg(updated.refundEligible ? 'Đã hủy đặt phòng. Yêu cầu hoàn cọc đã được gửi để xử lý.' : updated.depositPaid ? 'Đã hủy đặt phòng. Yêu cầu hủy được gửi ngoài thời hạn hoàn cọc nên không phát sinh hoàn tiền.' : 'Đã hủy đặt phòng. Booking chưa có khoản cọc đã xác nhận cần hoàn.');
    } catch (e) { setMsg(e.message); }
  }

  const tabs = [
    ['profile', 'Hồ sơ'],
    ['security', 'Bảo mật'],
    ...(['STAFF','RECEPTIONIST'].includes(user.role) ? [['attendance','Chấm công & lương']] : []),
    ...(user.role === 'STAFF' ? [['housekeeping','Dọn phòng']] : []),
  ];

  if (!profile) return <div className="center-page">Đang tải…</div>;

  return (
    <main className="account">
      {!standaloneCustomerTab && <>
      <div className="section-head"><div><span className="eyebrow">TÀI KHOẢN CỦA TÔI</span><h1>Xin chào, <em>{user.fullName}</em></h1></div></div>

      {isStaff && (
        <div className="notice" style={{ marginBottom: 24 }}>
          Đây là tài khoản nhân viên ({roleLabel(user.role)}).{' '}
          {['RECEPTIONIST', 'MANAGER', 'ADMIN'].includes(user.role) && <>Vào <Link to="/reception">khu vực Lễ tân</Link>{' '}</>}
          {['MANAGER', 'ADMIN'].includes(user.role) && <>hoặc <Link to="/admin">khu vực Quản lý</Link></>}
        </div>
      )}

      <div className="tab-row">
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      </>}

      {tab === 'profile' && <ProfileTab profile={profile} onSaved={setProfile} />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'attendance' && ['STAFF','RECEPTIONIST'].includes(user.role) && <PayrollTab user={user} />}
      {tab === 'housekeeping' && user.role === 'STAFF' && <StaffHousekeepingTab />}

      {tab === 'rooms' && !isStaff && <MyRoomsTab bookings={b} profile={profile} onReload={load} onCancel={cancel} onOpenInvoices={() => navigate('/account?tab=invoices')} msg={msg} />}
      {tab === 'invoices' && !isStaff && <CustomerInvoicesTab bookings={b} />}
      {tab === 'refunds' && !isStaff && <CustomerRefundTab bookings={b} />}
      {tab === 'history' && !isStaff && <CustomerHistoryTab bookings={b} />}
    </main>
  );
}
