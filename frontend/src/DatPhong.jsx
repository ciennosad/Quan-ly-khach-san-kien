import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, money, assetUrl, roomTypeLabel, roomTypeTitle, roomTypeBedInfo, serviceDisplay } from './KetNoiAPI';
import { getRoomGallery } from './AnhPhongMacDinh';

function isoDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function dateFromIso(value){ return value ? new Date(`${value}T12:00:00`) : new Date(); }
function startOfMonth(d){ return new Date(d.getFullYear(),d.getMonth(),1,12); }
function CalendarPicker({label,value,min,otherValue,blockedSet,onChange,open,setOpen}){
  const today=useMemo(()=>{ const d=new Date(); d.setHours(12,0,0,0); return d; },[]);
  const [cursor,setCursor]=useState(()=>startOfMonth(value?dateFromIso(value):today));
  useEffect(()=>{ if(value) setCursor(startOfMonth(dateFromIso(value))); },[value]);
  const monthStart=startOfMonth(cursor);
  const firstDay=(monthStart.getDay()+6)%7;
  const daysInMonth=new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let n=1;n<=daysInMonth;n++) cells.push(new Date(cursor.getFullYear(),cursor.getMonth(),n,12));
  const minDate=dateFromIso(min||isoDate(today));
  const monthLabel=cursor.toLocaleDateString('vi-VN',{month:'long',year:'numeric'});
  return <div className="booking-calendar-field">
    <label>{label}</label>
    <button type="button" className={`booking-calendar-input ${open?'open':''}`} onClick={()=>setOpen(!open)}>
      <span>{value?dateFromIso(value).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}):'Chọn ngày'}</span><span className="booking-calendar-chevron">⌄</span>
    </button>
    {open && <div className="booking-calendar-popover">
      <div className="booking-calendar-head">
        <button type="button" aria-label="Tháng trước" disabled={monthStart<=startOfMonth(minDate)} onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()-1,1,12))}>‹</button>
        <b>{monthLabel}</b>
        <button type="button" aria-label="Tháng sau" onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+1,1,12))}>›</button>
      </div>
      <div className="booking-calendar-week">{['T2','T3','T4','T5','T6','T7','CN'].map(x=><span key={x}>{x}</span>)}</div>
      <div className="booking-calendar-grid">
        {cells.map((d,i)=>{
          if(!d) return <span key={`blank-${i}`} className="calendar-empty-cell" aria-hidden="true"/>;
          const iso=isoDate(d);
          const past=d<minDate;
          const checkoutInvalid=otherValue && label.toLowerCase().includes('trả') && iso<=otherValue;
          const disabled=past||blockedSet.has(iso)||checkoutInvalid;
          const selected=iso===value;
          return <button key={iso} type="button" disabled={disabled} className={`${selected?'selected ':''}${disabled?'disabled':''}`} onClick={()=>{onChange(iso);setOpen(false)}}>{d.getDate()}</button>;
        })}
      </div>
      <div className="booking-calendar-legend"><span><i className="white"/> Còn phòng</span><span><i className="gray"/> Hết phòng</span><span><i className="chosen"/> Đã chọn</span></div>
    </div>}
  </div>;
}

export default function Booking() {
  const { id } = useParams(); const nav = useNavigate();
  const [room, setRoom] = useState(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [selectedServices, setSelectedServices] = useState({});
  const [form, setForm] = useState({ checkIn: '', checkOut: '', guests: 1, depositAmount: 0, discountCode: '', paymentMethod: 'BANK_TRANSFER', customerPhone: '' });
  const [phoneLoaded, setPhoneLoaded] = useState(false);
  const [calendarBlocked, setCalendarBlocked] = useState(new Set());
  const [calendarBlockedCheckout, setCalendarBlockedCheckout] = useState(new Set());
  const [openCalendar, setOpenCalendar] = useState('');
  const [discountPreview, setDiscountPreview] = useState(null);
  const [qr, setQr] = useState('');
  const [booking, setBooking] = useState(null);
  const [bookingServices, setBookingServices] = useState([]);
  const [payQr, setPayQr] = useState(null);
  const [proofSent, setProofSent] = useState(false);
  const [msg, setMsg] = useState('');
  const [pricing, setPricing] = useState(null);
  const [roomPricing, setRoomPricing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api('/rooms').then(x => setRoom(x.find(r => r.id === id))) }, [id]);
  useEffect(() => { api('/services').then(setServices).catch(() => setServices([])); }, []);
  useEffect(() => { api('/account/profile').then(p => { setForm(f => ({ ...f, customerPhone: p.phone || '' })); setPhoneLoaded(true); }).catch(() => setPhoneLoaded(true)); }, []);
  useEffect(() => {
    if(!room) return;
    let active=true;
    (async()=>{
      try{
        const today=isoDate(new Date());
        const end=new Date(); end.setDate(end.getDate()+180);
        const q=new URLSearchParams({from:today,to:isoDate(end),guests:String(Number(form.guests)||1),roomId:id});
        if(form.checkIn)q.set('checkIn',form.checkIn);
        const r=await api('/availability/calendar?'+q.toString());
        if(!active)return;
        setCalendarBlocked(new Set(r.blocked||[]));
        setCalendarBlockedCheckout(new Set(r.blockedCheckout||[]));
      }catch(_){if(active){setCalendarBlocked(new Set());setCalendarBlockedCheckout(new Set());}}
    })();
    return()=>{active=false};
  },[room,id,form.guests,form.checkIn]);
  useEffect(()=>{if(form.checkOut&&calendarBlockedCheckout.has(form.checkOut))setForm(f=>({...f,checkOut:''}))},[calendarBlockedCheckout]);
  useEffect(() => {
    if(!form.checkIn || !form.checkOut) { setRoomPricing(null); return; }
    let alive=true;
    api(`/rooms/${encodeURIComponent(id)}/pricing?checkIn=${encodeURIComponent(form.checkIn+'T14:00:00+07:00')}&checkOut=${encodeURIComponent(form.checkOut+'T12:00:00+07:00')}`)
      .then(x=>{ if(alive) setRoomPricing(x); }).catch(()=>{ if(alive) setRoomPricing(null); });
    return ()=>{alive=false};
  },[id,form.checkIn,form.checkOut]);
  if (!room) return <div className="center-page">Đang tải…</div>;

  const roomImages = getRoomGallery(room);
  const hasUploadedRoomImages = Array.isArray(room.images) && room.images.some(Boolean);
  const moveGallery = (step) => setGalleryIndex(index => (index + step + roomImages.length) % roomImages.length);

  async function checkDiscount() {
    setDiscountPreview(null);
    if (!form.discountCode.trim()) return;
    try {
      const d = await api(`/discount-codes/${encodeURIComponent(form.discountCode.trim())}/check`);
      setDiscountPreview({
        code: d.code,
        percentOff: Number(d.percent_off || 0),
        amountOff: Number(d.amount_off || 0),
        label: d.percent_off ? `Giảm ${d.percent_off}% giá phòng` : `Giảm ${money(d.amount_off)}`
      });
    } catch (e) { setDiscountPreview({ error: e.message }); }
  }

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setMsg('');
    if (!form.checkIn || !form.checkOut) { setMsg('Vui lòng chọn ngày nhận và ngày trả phòng.'); return; }
    const inDate = new Date(`${form.checkIn}T14:00:00+07:00`);
    const outDate = new Date(`${form.checkOut}T12:00:00+07:00`);
    if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime()) || inDate >= outDate) { setMsg('Ngày trả phòng phải sau ngày nhận phòng.'); return; }
    if (inDate < new Date()) { setMsg('Ngày nhận phòng không được ở trong quá khứ.'); return; }
    const guestCount = Number(form.guests);
    const normalizedPhone = String(form.customerPhone || '').replace(/[ .-]/g,'').trim();
    if (!normalizedPhone) { setMsg('Vui lòng nhập số điện thoại để hoàn tất đặt phòng.'); return; }
    if (!/^(?:\+84|0)\d{8,10}$/.test(normalizedPhone)) { setMsg('Số điện thoại không hợp lệ.'); return; }
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > Number(room.capacity)) {
      setMsg(`Số khách phải từ 1 đến ${room.capacity}.`);
      return;
    }
    if (Object.values(selectedServices).some(x => !Number.isInteger(Number(x.quantity)) || Number(x.quantity)<1 || Number(x.quantity)>50)) {
      setMsg('Số lượng mỗi dịch vụ phải từ 1 đến 50.');
      return;
    }
    const nights = Math.ceil((outDate-inDate)/(24*60*60*1000));
    const baseTotal = Number(roomPricing?.total ?? (Number(room.base_price) * nights));
    const discountAmount = discountPreview && !discountPreview.error
      ? (discountPreview.percentOff > 0 ? Math.round(baseTotal * discountPreview.percentOff / 100) : Math.min(baseTotal, discountPreview.amountOff))
      : 0;
    const finalPrice = Math.max(0, baseTotal - discountAmount);
    const deposit = Math.round(finalPrice * 0.10);
    setSubmitting(true);
    try {
      // datetime-local không có timezone; giữ đúng giờ người dùng chọn khi gửi API.
      const payload = {
        roomId: id,
        checkIn: `${form.checkIn}T14:00:00+07:00`,
        checkOut: `${form.checkOut}T12:00:00+07:00`,
        guests: guestCount,
        depositAmount: deposit,
        paymentMethod: deposit > 0 ? form.paymentMethod : 'BANK_TRANSFER',
        discountCode: form.discountCode?.trim() || '',
        customerPhone: normalizedPhone,
        services: services.filter(s => Number(selectedServices[s.id]?.quantity) > 0).map(s => ({ serviceId: s.id, quantity: Number(selectedServices[s.id].quantity) }))
      };
      const x = await api('/bookings', { method: 'POST', body: JSON.stringify(payload) });
      setPricing(x.pricing);
      setBookingServices(x.services || []);
      setQr(x.qrDataUrl); setBooking(x.booking);
      setMsg(`Đặt phòng thành công: ${x.booking.booking_code}`);
      if (deposit > 0 && form.paymentMethod === 'BANK_TRANSFER') setPayQr(await api(`/bookings/${x.booking.booking_code}/vietqr`));
    } catch (e) { setMsg(e.message); }
    finally { setSubmitting(false); }
  }

  async function uploadProof(e) {
    e.preventDefault();
    const file = e.target.proof.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append('proof', file);
    try{ await api(`/bookings/${booking.booking_code}/payment-proof`,{method:'POST',body:fd}); setProofSent(true); }
    catch(err){ setMsg(err.message); }
  }

  return (
    <div className="booking-page">
      <div className="booking-card">
        <button className="back" onClick={() => nav(-1)}>← Quay lại</button>
        <div className="booking-layout">
          <section className="room-gallery" aria-label="Thư viện ảnh phòng">
            {roomImages.length ? <>
            <button type="button" className="room-gallery-main" onClick={() => setGalleryOpen(true)} aria-label="Phóng to ảnh phòng">
              <img src={assetUrl(roomImages[galleryIndex])} alt={`${roomTypeLabel(room.room_type_name,room.description)} - ảnh ${galleryIndex + 1}`} />
              {roomImages.length > 1 && <><span className="room-gallery-arrow prev" onClick={e=>{e.stopPropagation();moveGallery(-1);}} aria-label="Ảnh trước">‹</span><span className="room-gallery-arrow next" onClick={e=>{e.stopPropagation();moveGallery(1);}} aria-label="Ảnh tiếp">›</span></>}
              <span className="room-gallery-count">{galleryIndex + 1} / {roomImages.length}</span>
            </button>
            <div className="room-gallery-thumbs">{roomImages.map((image,index)=><button type="button" key={image} className={galleryIndex===index?'active':''} onClick={()=>setGalleryIndex(index)} aria-label={`Xem ảnh ${index+1}`}><img src={assetUrl(image)} alt="" /></button>)}</div>
            </> : <div className="room-gallery-empty">Chưa có ảnh thực tế cho phòng này. Vui lòng liên hệ khách sạn để xem thêm thông tin.</div>}
          </section>
          <div>
            <span className="eyebrow">ĐẶT PHÒNG CỦA BẠN</span>
            <h1>{roomTypeTitle(room.room_type_name,room.description)}</h1>
            {roomTypeBedInfo(room.room_type_name,room.description) && <small className="booking-room-bed-info">{roomTypeBedInfo(room.room_type_name,room.description)}</small>}
            <p>{room.description}</p>
            <h3>{money(roomPricing?.nightlyRates?.[0]?.price ?? room.base_price)} <small>/ đêm</small></h3>
            {roomPricing?.nightlyRates?.some(x=>x.isSpecial) && <div className="notice" style={{margin:'10px 0'}}>Giá phòng đang áp dụng <b>giá ngày đặc biệt</b> cho một hoặc nhiều đêm trong kỳ lưu trú.</div>}

            {!booking && (
              <form onSubmit={submit}>
                <CalendarPicker label="Ngày nhận phòng" value={form.checkIn} min={isoDate(new Date())} blockedSet={calendarBlocked} onChange={v => setForm({ ...form, checkIn: v, checkOut: form.checkOut && form.checkOut <= v ? '' : form.checkOut })} open={openCalendar==='in'} setOpen={v=>setOpenCalendar(v?'in':'')} />
                <CalendarPicker label="Ngày trả phòng" value={form.checkOut} min={form.checkIn || isoDate(new Date())} otherValue={form.checkIn} blockedSet={calendarBlockedCheckout} onChange={v => setForm({ ...form, checkOut: v })} open={openCalendar==='out'} setOpen={v=>setOpenCalendar(v?'out':'')} />
                <div className="notice" style={{gridColumn:'1/-1'}}>Giờ nhận phòng cố định <b>14:00</b> · giờ trả phòng tối đa <b>12:00</b>. Dọn phòng được tính trong khung <b>12:00–14:00</b>.</div>
                <label>Số khách<input type="number" min="1" max={room.capacity} required value={form.guests} onChange={e => setForm({ ...form, guests: Number(e.target.value) })} /></label>
                <label>Số điện thoại *<input type="tel" inputMode="tel" required value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} placeholder="0901234567" /></label>
                {services.length > 0 && <section className="booking-service-picker" style={{gridColumn:'1/-1'}}>
                  <div><b>Chọn dịch vụ cho kỳ lưu trú <small>(tùy chọn)</small></b><p>Dịch vụ được lưu là dự kiến và chỉ tính vào hóa đơn khi Lễ tân xác nhận nhận phòng.</p></div>
                  <div className="booking-service-options">{services.map(s => {
                    const chosen=!!selectedServices[s.id];
                    const display=serviceDisplay(s);
                    return <label className={`booking-service-option ${chosen?'selected':''}`} key={s.id}>
                      <input type="checkbox" checked={chosen} onChange={e => setSelectedServices(current => { const next={...current}; if(e.target.checked) next[s.id]={quantity:1}; else delete next[s.id]; return next; })} />
                      <span><b>{display.name}</b><small>{display.description||'Dịch vụ tại khách sạn'}</small></span><strong>{money(s.price)}</strong>
                      {chosen && <input className="booking-service-quantity" aria-label={`Số lượng ${display.name}`} type="number" min="1" max="50" value={selectedServices[s.id].quantity} onChange={e => setSelectedServices(current => ({...current,[s.id]:{quantity:e.target.value}}))} />}
                    </label>;
                  })}</div>
                  {Object.keys(selectedServices).length>0 && <small className="booking-service-footnote">Đã chọn {Object.keys(selectedServices).length} dịch vụ dự kiến. Số tiền chưa cộng vào tiền cọc hoặc hóa đơn trước check-in.</small>}
                </section>}
                {form.checkIn && form.checkOut && new Date(`${form.checkOut}T12:00:00+07:00`)>new Date(`${form.checkIn}T14:00:00+07:00`) && (()=>{const n=Math.ceil((new Date(`${form.checkOut}T12:00:00+07:00`)-new Date(`${form.checkIn}T14:00:00+07:00`))/(24*60*60*1000));const base=Number(roomPricing?.total ?? (Number(room.base_price)*n));const disc=discountPreview&&!discountPreview.error?(discountPreview.percentOff>0?Math.round(base*discountPreview.percentOff/100):Math.min(base,discountPreview.amountOff)):0;const final=Math.max(0,base-disc);const d=Math.round(final*0.10);return <div className="deposit-summary"><span>Tiền cọc bắt buộc · 10%</span><b>{money(d)}</b><small>{disc>0?`Tổng sau giảm giá: ${money(final)} · `:''}Tính tự động · Không cần nhập tay</small></div>})()}
                {<label>Phương thức thanh toán cọc
                  <select value={form.paymentMethod} onChange={e => setForm({...form,paymentMethod:e.target.value})}>
                    <option value="BANK_TRANSFER">🏦 Chuyển khoản / VietQR</option>
                    <option value="CASH">💵 Tiền mặt tại quầy</option>
                  </select>
                </label>}
                <label>Mã giảm giá (nếu có)
                  <input value={form.discountCode} onChange={e => setForm({ ...form, discountCode: e.target.value })} onBlur={checkDiscount} placeholder="VD: SUMMER10" />
                </label>
                {discountPreview && <p className="notice" style={{ padding: '8px 0' }}>{discountPreview.error || discountPreview.label}</p>}
                {form.checkIn && form.checkOut && new Date(`${form.checkOut}T12:00:00+07:00`)>new Date(`${form.checkIn}T14:00:00+07:00`) && (()=>{const n=Math.ceil((new Date(`${form.checkOut}T12:00:00+07:00`)-new Date(`${form.checkIn}T14:00:00+07:00`))/(24*60*60*1000));const base=Number(roomPricing?.total ?? (Number(room.base_price)*n));const disc=discountPreview&&!discountPreview.error?(discountPreview.percentOff>0?Math.round(base*discountPreview.percentOff/100):Math.min(base,discountPreview.amountOff)):0;const final=Math.max(0,base-disc);return <div className="booking-estimate"><span>Tạm tính</span><b>{money(final)}</b><small>{n} đêm · {form.guests} khách{disc>0?` · Đã giảm ${money(disc)}`:''}</small></div>})()}
                <button className="btn dark" disabled={submitting || !phoneLoaded}>{submitting ? 'Đang tạo đặt phòng…' : 'Xác nhận đặt phòng'}</button>
              </form>
            )}

            {msg && <div className="notice">{msg}</div>}
            {pricing && <div className="booking-estimate"><span>Tổng sau giảm giá</span><b>{money(pricing.finalPrice)}</b><small>{pricing.nights} đêm · {pricing.guestCount || form.guests} khách · Còn lại sau cọc {money(pricing.remaining)}</small></div>}
            {bookingServices.length>0 && <div className="invoice-planned-services"><b>Dịch vụ đã đăng ký · chờ Lễ tân check-in</b>{bookingServices.map(s=><div key={s.id}><span>{serviceDisplay(s).name} × {s.quantity}</span><span>{money(Number(s.unit_price)*Number(s.quantity))} · chưa cộng vào hóa đơn</span></div>)}</div>}
            {booking && Number(booking.deposit_amount) > 0 && form.paymentMethod === 'CASH' && <div className="notice">Bạn đã chọn <b>tiền mặt tại quầy</b>. Đặt phòng đang chờ nhân viên xác nhận khoản cọc khi bạn thanh toán trực tiếp.</div>}

            {qr && (
              <div className="qr">
                <img src={qr} />
                <p>Giữ mã QR này để lễ tân xác thực đặt phòng.</p>
              </div>
            )}

            {payQr && !proofSent && (
              <div className="qr">
                <h3>Chuyển khoản đặt cọc {money(payQr.amount)}</h3>
                <img src={payQr.url} alt="VietQR chuyển khoản" style={{ width: 220, height: 'auto' }} />
                <p>Ngân hàng: {payQr.bankCode} · STK: {payQr.account}<br />Nội dung chuyển khoản: <b>{payQr.bookingCode} {payQr.paymentLabel || 'DAT COC'}</b></p>
                <form onSubmit={uploadProof} style={{ marginTop: 18, display: 'grid', gap: 14, justifyItems: 'center' }}>
                  <label style={{ textAlign: 'center' }}>Sau khi chuyển khoản, tải lên ảnh biên lai
                    <input type="file" name="proof" accept="image/*" required style={{ display: 'block', marginTop: 8 }} />
                  </label>
                  <button className="btn dark">Gửi biên lai cho lễ tân xác nhận</button>
                </form>
              </div>
            )}

            {proofSent && (
              <div className="notice">
                Đã gửi biên lai. Đặt phòng sẽ được xác nhận sau khi lễ tân/quản lý đối chiếu với ngân hàng — vui lòng không chuyển khoản nhiều lần.
              </div>
            )}
          </div>
        </div>
      </div>
      {galleryOpen && <div className="room-gallery-lightbox" role="dialog" aria-modal="true" aria-label="Ảnh phòng" onClick={()=>setGalleryOpen(false)}>
        <button type="button" className="room-gallery-close" onClick={()=>setGalleryOpen(false)} aria-label="Đóng">×</button>
        {roomImages.length>1&&<button type="button" className="room-gallery-lightbox-arrow prev" onClick={e=>{e.stopPropagation();moveGallery(-1);}} aria-label="Ảnh trước">‹</button>}
        <img src={assetUrl(roomImages[galleryIndex])} alt={`${roomTypeLabel(room.room_type_name,room.description)} - ảnh ${galleryIndex+1}`} onClick={e=>e.stopPropagation()} />
        {roomImages.length>1&&<button type="button" className="room-gallery-lightbox-arrow next" onClick={e=>{e.stopPropagation();moveGallery(1);}} aria-label="Ảnh tiếp">›</button>}
        <span>{galleryIndex+1} / {roomImages.length}</span>
      </div>}
    </div>
  );
}
