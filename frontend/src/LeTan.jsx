import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useSearchParams } from 'react-router-dom';
import { api, money, date, bookingStatusLabel, paymentTypeLabel, roomTypeLabel } from './KetNoiAPI';

// Mỗi lần mở camera tạo 1 id riêng biệt (không dùng lại 1 id cố định) để tránh xung đột
// DOM khi component được mount/unmount nhanh (ví dụ React StrictMode ở môi trường dev sẽ
// mount rồi unmount rồi mount lại) — đây chính là nguyên nhân gây màn hình trắng trước đây.
let scannerInstanceCounter = 0;
let activeQrScannerRecord = null;

function QrScannerBox({ onScan, onClose }) {
  const boxId = useRef(`qr-reader-box-${Date.now()}-${scannerInstanceCounter++}`).current;
  const scannerRef = useRef(null);
  const mountedRef = useRef(true);
  const [cameraError, setCameraError] = useState('');
  const scanHandledRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    let started = false;
    const qr = new Html5Qrcode(boxId, { verbose: false });
    scannerRef.current = qr;
    const record = { qr, boxId };

    const run = async () => {
      // React StrictMode có thể mount/unmount nhanh trong môi trường dev. Luôn dừng
      // scanner cũ trước khi tạo scanner mới để màn hình không xuất hiện 2 camera.
      if (activeQrScannerRecord && activeQrScannerRecord.qr !== qr) {
        const old = activeQrScannerRecord.qr;
        activeQrScannerRecord = null;
        try { await old.stop(); } catch (_) {}
        try { await old.clear(); } catch (_) {}
      }
      if (disposed) return;
      activeQrScannerRecord = record;

      const success = (text) => {
        if (scanHandledRef.current || disposed) return;
        scanHandledRef.current = true;
        onScanRef.current(text);
      };

      try {
        await qr.start(
          { facingMode: { exact: 'environment' } },
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 4 / 3 },
          success
        );
        started = true;
      } catch (firstErr) {
        // Một số trình duyệt không hỗ trợ exact facingMode; thử camera sau theo cách mềm hơn.
        try {
          if (disposed) return;
          await qr.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 4 / 3 },
            success
          );
          started = true;
        } catch (err) {
          if (mountedRef.current && !disposed) setCameraError('Không mở được camera. Vui lòng cấp quyền camera cho trình duyệt hoặc thử lại.');
          console.error('[QR] start() lỗi:', err || firstErr);
        }
      }
    };

    run();

    return () => {
      disposed = true;
      mountedRef.current = false;
      (async () => {
        // Chỉ cleanup scanner do chính instance này sở hữu.
        if (activeQrScannerRecord?.qr === qr) activeQrScannerRecord = null;
        try { if (started) await qr.stop(); } catch (_) {}
        try { await qr.clear(); } catch (_) {}
      })();
    };
  }, []);

  return (
    <div className="qr-scan-box">
      <div id={boxId} className="qr-reader-single" />
      {cameraError && <div className="notice">{cameraError}</div>}
      <button className="btn ghost" style={{ marginTop: 14 }} onClick={onClose}>Đóng camera</button>
    </div>
  );
}

export default function Reception() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  // "Duyệt thanh toán" chỉ dành cho Lễ tân + Admin (Quản lý không quản lý phần này nữa,
  // theo đúng phân quyền: Admin quản lý toàn bộ phần việc của Lễ tân và Quản lý).
  const canApprovePayments = ['ADMIN', 'RECEPTIONIST'].includes(user.role);

  const [code, setCode] = useState('');
  const [booking, setBooking] = useState(null);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [surcharge, setSurcharge] = useState(0);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutInvoice, setCheckoutInvoice] = useState(null);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState('CASH');
  const [pending, setPending] = useState([]);
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const receptionTabs = ['checkin','housekeeping','payments','invoice'];
  const [tab, setTab] = useState(receptionTabs.includes(initialTab) ? initialTab : 'checkin');
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (receptionTabs.includes(requested) && requested !== tab) setTab(requested);
  }, [searchParams]);
  const [scanning, setScanning] = useState(false);
  const [scanHistory, setScanHistory] = useState([]);
  const [housekeeping, setHousekeeping] = useState([]);
  const [cleaningRulesEnabled, setCleaningRulesEnabled] = useState(true);
  const [invoiceCode, setInvoiceCode] = useState('');
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoiceBookings, setInvoiceBookings] = useState([]);
  const [invoiceMsg, setInvoiceMsg] = useState('');
  const [invoiceCatalog, setInvoiceCatalog] = useState([]);
  const [addingInvoiceService, setAddingInvoiceService] = useState('');
  const [invoiceServiceQuantities, setInvoiceServiceQuantities] = useState({});
  const [overdueCheckins, setOverdueCheckins] = useState([]);
  const [noShowBusy, setNoShowBusy] = useState('');
  const [noShowClock, setNoShowClock] = useState(Date.now());
  useEffect(() => {
    if (tab !== 'checkin') return;
    loadOverdueCheckins();
    const refreshTimer=setInterval(loadOverdueCheckins,60000);
    const clockTimer=setInterval(()=>setNoShowClock(Date.now()),1000);
    return ()=>{clearInterval(refreshTimer);clearInterval(clockTimer);};
  }, [tab]);
  useEffect(() => { if (tab === 'payments') loadPending(); }, [tab]);
  useEffect(() => { if (tab === 'housekeeping') loadHousekeeping(); }, [tab]);
  useEffect(() => { if (tab === 'invoice') { setInvoiceData(null); setInvoiceMsg(''); loadActiveInvoices(); api('/services').then(setInvoiceCatalog).catch(() => setInvoiceCatalog([])); } }, [tab]);
  function loadPending() { api('/admin/payments/pending').then(setPending); }
  async function loadHousekeeping() { try { const rows = await api('/reception/housekeeping'); setHousekeeping(rows); if (rows.length && typeof rows[0].cleaning_rules_enabled === 'boolean') setCleaningRulesEnabled(rows[0].cleaning_rules_enabled); } catch(e) { setMsg(e.message); } }

  async function find(e, overrideCode) {
    e?.preventDefault?.();
    const searchCode = overrideCode ?? code;
    setMsg(''); setBooking(null); setCheckoutInvoice(null); setSurcharge(0);
    try {
      const found = await api(`/bookings/${encodeURIComponent(searchCode)}`);
      setBooking(found);
      if(found.status==='CHECKED_IN') setCheckoutInvoice(await api(`/bookings/${encodeURIComponent(searchCode)}/invoice`));
    }
    catch (e) { setMsg(e.message); }
  }

  // Ghi lại lịch sử mỗi lần quét (thành công lẫn thất bại) — hiển thị ngay dưới khung camera
  // để lễ tân biết mình vừa quét được gì, khi nào, kết quả ra sao.
  function pushHistory(entry) {
    setScanHistory(list => [{ ...entry, at: new Date().toISOString() }, ...list].slice(0, 20));
  }

  async function handleScan(text, errorMsg) {
    setScanning(false);
    if (!text) {
      setMsg(errorMsg || 'Không đọc được mã QR');
      pushHistory({ code: 'QR booking', result: 'error', detail: errorMsg || 'Không đọc được mã QR' });
      return;
    }
    let bookingCode = text;
    let token = '';
    try {
      const parsed = JSON.parse(text);
      bookingCode = parsed.bookingCode || text;
      token = parsed.token || '';
    } catch { /* QR chỉ chứa text thuần, không phải JSON */ }
    setCode(bookingCode);
    setMsg('Đang xác minh mã QR booking…');
    try {
      if(token) await api('/reception/qr-verify',{method:'POST',body:JSON.stringify({bookingCode,token})});
      const found=await api(`/bookings/${encodeURIComponent(bookingCode)}`);
      setBooking(found);
      if(found.status==='CONFIRMED'){
        const checkedIn=await checkIn(bookingCode,found);
        if(checkedIn) pushHistory({code:`Phòng ${found.room_number}`,result:'ok',detail:'Check-in thành công'});
        else pushHistory({code:`Phòng ${found.room_number}`,result:'error',detail:'Không thể check-in booking này'});
      }else if(found.status==='CHECKED_IN'){
        const detail=`Phòng ${found.room_number} đã được check-in trước đó`;
        setMsg(detail);
        pushHistory({code:`Phòng ${found.room_number}`,result:'error',detail});
      }else{
        const detail=`Không thể check-in: booking đang ở trạng thái ${bookingStatusLabel(found.status)}`;
        setMsg(detail);
        pushHistory({code:`Phòng ${found.room_number}`,result:'error',detail});
      }
    }catch(e){
      setMsg(e.message);
      pushHistory({code:'QR booking',result:'error',detail:e.message});
    }
  }

  async function checkIn(bookingCode=code, bookingInfo=booking) {
    if(checkInBusy) return null;
    setCheckInBusy(true);
    try {
      const r=await api('/reception/check-in',{method:'POST',body:JSON.stringify({bookingCode})});
      const updatedBooking={...(bookingInfo||{}),...r,services:(bookingInfo?.services||[]).map(s=>s.status==='RESERVED'?{...s,status:'PENDING'}:s)};
      setBooking(updatedBooking);
      await loadOverdueCheckins();
      try {
        setCheckoutInvoice(await api(`/bookings/${encodeURIComponent(bookingCode)}/invoice`));
        setMsg(`Check-in thành công${r.activatedServices?.length?` · đã thêm ${r.activatedServices.length} dịch vụ khách chọn vào hóa đơn`:''}`);
      }catch { setMsg('Check-in thành công nhưng chưa tải được hóa đơn. Bạn có thể mở lại mục Hóa đơn.'); }
      return updatedBooking;
    }catch(e){setMsg(e.message);return null;}
    finally{setCheckInBusy(false);}
  }

  async function collectCheckoutPayment() {
    if(checkoutBusy || booking?.status!=='CHECKED_IN' || checkoutRemaining<=0) return;
    const methodLabel=checkoutPaymentMethod==='CASH'?'tiền mặt':'chuyển khoản đã kiểm tra';
    if(!window.confirm(`Xác nhận khách đã thanh toán đủ ${money(checkoutRemaining)} bằng ${methodLabel}?`)) return;
    setCheckoutBusy(true);
    try {
      const r=await api('/reception/payments/collect',{method:'POST',body:JSON.stringify({bookingCode:code,surcharge,method:checkoutPaymentMethod})});
      setMsg(r.message);
      setCheckoutInvoice(await api(`/bookings/${encodeURIComponent(code)}/invoice`));
    } catch(e) { setMsg(e.message); }
    finally { setCheckoutBusy(false); }
  }

  async function checkOut() {
    if (checkoutBusy || booking?.status !== 'CHECKED_IN') return;
    setCheckoutBusy(true);
    try {
      const r = await api('/reception/check-out', { method: 'POST', body: JSON.stringify({ bookingCode: code, surcharge }) });
      setBooking(b => ({ ...b, ...r.booking }));
      setMsg(`Trả phòng thành công. Tổng hóa đơn: ${money(r.invoice.grandTotal)} — Còn lại: ${money(r.invoice.remainingTotal)}`);
    } catch (e) { setMsg(e.message); } finally { setCheckoutBusy(false); }
  }

  async function loadActiveInvoices() {
    try { setInvoiceBookings(await api('/reception/invoices/active')); }
    catch(e) { setInvoiceMsg(e.message); }
  }
  async function loadOverdueCheckins() {
    try { setOverdueCheckins(await api('/reception/bookings/overdue-checkin')); }
    catch(e) { setMsg(e.message); }
  }
  async function confirmNoShow(item) {
    if(!window.confirm(`Xác nhận khách phòng ${item.room_number} không đến? Booking sẽ bị hủy, phòng được mở lại và tiền cọc không được hoàn.`)) return;
    setNoShowBusy(item.id);
    try {
      await api(`/reception/bookings/${encodeURIComponent(item.id)}/no-show`,{method:'POST'});
      setOverdueCheckins(list=>list.filter(row=>row.id!==item.id));
      if(booking?.id===item.id){setBooking(null);setCheckoutInvoice(null);setCode('');}
      setMsg(`Đã xác nhận khách phòng ${item.room_number} không đến. Phòng đã được mở lại; tiền cọc không hoàn.`);
    } catch(e) { setMsg(e.message); await loadOverdueCheckins(); }
    finally { setNoShowBusy(''); }
  }
  function noShowCountdown(item) {
    const checkInTime=new Date(item.check_in).getTime();
    const confirmationTime=checkInTime+60*60*1000;
    const remaining=confirmationTime-noShowClock;
    const formatDuration=milliseconds=>{
      const duration=Math.max(0,Math.floor(milliseconds/1000));
      const hours=Math.floor(duration/3600);
      const minutes=Math.floor((duration%3600)/60);
      const seconds=duration%60;
      return [hours,minutes,seconds].map(value=>String(value).padStart(2,'0')).join(':');
    };
    return remaining>0?{ready:false,text:`Quá giờ nhận phòng · còn ${formatDuration(remaining)} đến mốc xác nhận`}:{ready:true,text:`Đã quá giờ nhận phòng ${formatDuration(noShowClock-checkInTime)}`};
  }
  async function loadInvoice(codeToLoad) {
    const c=String(codeToLoad||'').trim();
    if(!c) return;
    setInvoiceMsg('');
    try { setInvoiceData(await api(`/bookings/${encodeURIComponent(c)}/invoice`)); setInvoiceCode(c); }
    catch(e) { setInvoiceData(null); setInvoiceMsg(e.message); }
  }
  async function editInvoiceService(service, action) {
    if(!invoiceData) return;
    try {
      if(action==='cancel' && !window.confirm(`Xác nhận bỏ dịch vụ “${service.name}” khỏi hóa đơn?`)) return;
      const payload=action==='cancel'?{status:'CANCELLED',reason:'Khách không sử dụng dịch vụ'}:{quantity:Number(action)};
      await api(`/reception/invoices/${encodeURIComponent(invoiceData.booking.booking_code)}/services/${service.id}`,{method:'PATCH',body:JSON.stringify(payload)});
      await loadInvoice(invoiceData.booking.booking_code);
      setInvoiceMsg(action==='cancel'?'Đã bỏ dịch vụ khỏi hóa đơn.':'Đã cập nhật số lượng dịch vụ và tổng tiền.');
    } catch(e) { setInvoiceMsg(e.message); }
  }
  async function addInvoiceService(service) {
    if (!invoiceData || addingInvoiceService) return;
    const quantity = Number(invoiceServiceQuantities[service.id] || 1);
    setAddingInvoiceService(service.id);
    try {
      await api('/reception/services', { method: 'POST', body: JSON.stringify({ bookingId: invoiceData.booking.id, serviceId: service.id, quantity }) });
      await loadInvoice(invoiceData.booking.booking_code);
      setInvoiceMsg(`Đã thêm dịch vụ “${service.name}” vào hóa đơn.`);
    } catch (e) { setInvoiceMsg(e.message); }
    finally { setAddingInvoiceService(''); }
  }

  async function confirmPayment(p) {
    await api(`/admin/payments/${p.id}/confirm`, { method: 'POST' });
    setPending(list => list.filter(x => x.id !== p.id));
  }
  async function rejectPayment(p) {
    const reason = prompt('Lý do từ chối (không khớp số tiền/nội dung...)') || '';
    await api(`/admin/payments/${p.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
    setPending(list => list.filter(x => x.id !== p.id));
  }


  async function cleaningComplete(room) {
    try { await api(`/reception/rooms/${room.id}/cleaning-complete`,{method:'PATCH'}); setHousekeeping(list=>list.filter(x=>x.id!==room.id)); setMsg(`Phòng ${room.room_number} đã được xác nhận dọn xong.`); }
    catch(e){setMsg(e.message)}
  }

  const apiOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace('/api', '');
  const checkoutPaid = (checkoutInvoice?.payments||[]).filter(p=>p.status==='SUCCESS'&&['DEPOSIT','BALANCE'].includes(p.type)).reduce((sum,p)=>sum+Number(p.amount||0),0);
  const checkoutPaymentPending = (checkoutInvoice?.payments||[]).some(p=>p.type==='BALANCE'&&p.status==='PENDING');
  const checkoutGrandTotal = checkoutInvoice ? Number(checkoutInvoice.invoice.roomTotal||0)+Number(checkoutInvoice.invoice.serviceTotal||0)+Number(surcharge||0) : 0;
  const checkoutRemaining = Math.max(0,checkoutGrandTotal-checkoutPaid);

  return (
    <main className="account">
      <div className="section-head"><div><span className="eyebrow">LỄ TÂN</span><h1>Khu vực <em>Lễ tân</em></h1></div></div>

      <div className="workspace-picker">
        <label htmlFor="reception-function-picker">CHỨC NĂNG LỄ TÂN</label>
        <select id="reception-function-picker" value={tab} onChange={e => setTab(e.target.value)}>
          <option value="checkin">Nhận phòng / Trả phòng</option>
          <option value="housekeeping">Dọn phòng{housekeeping.length > 0 ? ` (${housekeeping.length})` : ''}</option>
          {canApprovePayments && <option value="payments">Duyệt thanh toán{pending.length > 0 ? ` (${pending.length})` : ''}</option>}
          <option value="invoice">Hóa đơn</option>
        </select>
      </div>

      {tab === 'checkin' && (
        <>
          <form onSubmit={find} className="reception-search">
            <label>Mã đặt phòng
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="VD: BK-20260916-0001" required />
            </label>
            <button className="btn dark">Tìm đặt phòng</button>
            <button type="button" className="btn ghost" onClick={() => setScanning(s => !s)}>{scanning ? 'Tắt camera' : 'Quét QR bằng camera'}</button>
          </form>

          <details className="reception-no-show-section">
            <summary><span>Khách chưa nhận phòng</span><span>{overdueCheckins.length} booking</span></summary>
            <div className="reception-no-show-content">
              <div className="reception-no-show-heading"><p>Booking đã xác nhận cọc, chưa check-in và đã đến giờ nhận phòng.</p><button type="button" className="btn ghost" onClick={loadOverdueCheckins}>Làm mới</button></div>
              {!overdueCheckins.length&&<div className="empty">Hiện không có khách đã cọc nào quá giờ nhận phòng.</div>}
              {overdueCheckins.map(item=>{const countdown=noShowCountdown(item);return <article className="reception-no-show-card" key={item.id}>
                <div className="reception-no-show-main"><b>Phòng {item.room_number}</b><span>Khách: {item.full_name||'Chưa có tên khách'}</span><span>Ngày nhận: {date(item.check_in)} · Ngày trả: {date(item.check_out)}</span><strong>Đã xác nhận cọc · {money(item.paid_deposit)}</strong></div>
                <div className="reception-no-show-action"><span className={countdown.ready?'is-overdue':'is-waiting'}>{countdown.text}</span><button type="button" className="btn ghost" disabled={!countdown.ready||noShowBusy===item.id} onClick={()=>confirmNoShow(item)}>{noShowBusy===item.id?'Đang xử lý…':countdown.ready?'Xác nhận khách không đến':'Có thể xác nhận sau 1 giờ'}</button><small>Hủy booking, mở lại phòng và không hoàn cọc.</small></div>
              </article>})}
            </div>
          </details>

          {scanning && <QrScannerBox onScan={handleScan} onClose={() => setScanning(false)} />}

          {scanHistory.length > 0 && (
            <div className="manage-list" style={{ marginTop: 14 }}>
              <div className="side-label" style={{ margin: '0 0 8px' }}>LỊCH SỬ QUÉT GẦN ĐÂY</div>
              {scanHistory.map((h, i) => (
                <div className="manage-row" key={i}>
                  <div><b>{h.code}</b><span>{new Date(h.at).toLocaleTimeString('vi-VN')}</span></div>
                  <span className={`status ${h.result === 'ok' ? 'confirmed' : 'cancelled'}`}>{h.result === 'ok' ? 'Thành công' : 'Lỗi'}</span>
                  <span>{h.detail}</span>
                </div>
              ))}
            </div>
          )}

          {msg && <div className="notice">{msg}</div>}

          {booking && (
            <div className="booking-list">
              <div className="booking-row">
                <div>
                  <b>{booking.booking_code}</b>
                  <span>Khách: {booking.full_name || '—'} · Phòng {booking.room_number} · {roomTypeLabel(booking.room_type_name)}</span>
                  <span>CCCD: {booking.id_card_number || 'Chưa cung cấp'} · Ngày cấp: {booking.id_card_issue_date ? new Date(`${String(booking.id_card_issue_date).slice(0,10)}T00:00:00`).toLocaleDateString('vi-VN') : 'Chưa có'}</span>
                </div>
                <div>
                  <span>{date(booking.check_in)} → {date(booking.check_out)}</span>
                  <b>{money(booking.room_price)}</b>
                </div>
                <span className={`status ${booking.status?.toLowerCase()}`}>{bookingStatusLabel(booking.status)}</span>
              </div>

              {booking.services?.some(s=>s.status==='RESERVED') && <div className="notice" style={{margin:'0 0 14px'}}>
                <b>Dịch vụ khách đã chọn trước (chưa tính vào hóa đơn):</b>
                {booking.services.filter(s=>s.status==='RESERVED').map(s=><div key={s.id}>{s.name} × {s.quantity} · {money(Number(s.unit_price)*Number(s.quantity))}</div>)}
                <small>Khi bấm “Nhận phòng”, các dịch vụ này sẽ được thêm vào hóa đơn.</small>
              </div>}

              <div className="reception-actions">
                {booking.status === 'PENDING_PAYMENT' && <span className="notice">Đặt phòng đang chờ xác nhận tiền cọc{canApprovePayments ? ' — xem tab "Duyệt thanh toán".' : '.'}</span>}
                {booking.status === 'CONFIRMED' && <button className="btn dark" onClick={()=>checkIn()} disabled={checkInBusy}>{checkInBusy?'Đang check-in…':'Nhận phòng'}</button>}
                {booking.status === 'CHECKED_IN' && (
                  <>
                    <label>Phụ phí trả phòng muộn
                      <input type="number" min="0" value={surcharge} onChange={e => setSurcharge(e.target.value)} />
                    </label>
                    {checkoutInvoice && <div className="notice" style={{width:'100%',margin:'0 0 12px'}}>
                      <b>Thanh toán khi trả phòng</b>
                      <div>Tổng hóa đơn: {money(checkoutGrandTotal)} · Đã thanh toán: {money(checkoutPaid)}</div>
                      {checkoutRemaining>0 && checkoutPaymentPending ? <div>Có khoản thanh toán đang chờ xác nhận. Vui lòng xử lý trong mục <b>Duyệt thanh toán</b>, sau đó tìm lại booking để cập nhật.</div> : checkoutRemaining>0 ? <>
                        <div><b>Còn phải thu: {money(checkoutRemaining)}</b></div>
                        <label>Phương thức đã nhận
                          <select value={checkoutPaymentMethod} onChange={e=>setCheckoutPaymentMethod(e.target.value)}>
                            <option value="CASH">Tiền mặt tại quầy</option>
                            <option value="BANK_TRANSFER">Chuyển khoản (đã kiểm tra)</option>
                          </select>
                        </label>
                        <button type="button" className="btn ghost" onClick={collectCheckoutPayment} disabled={checkoutBusy}>
                          {checkoutBusy?'Đang ghi nhận…':`Xác nhận đã thu ${money(checkoutRemaining)}`}
                        </button>
                      </> : <div>Đã thanh toán đủ. Có thể hoàn tất trả phòng.</div>}
                    </div>}
                    <button className="btn dark" onClick={checkOut} disabled={checkoutBusy || !checkoutInvoice || checkoutRemaining>0}>{checkoutBusy ? 'Đang xử lý…' : 'Trả phòng'}</button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'housekeeping' && (
        <div className="manage-list">
          <div className="notice">{cleaningRulesEnabled ? <>Khung dọn phòng chuẩn là <b>12:00–14:00</b>. Không tự động mở phòng nếu nhân viên chưa xác nhận dọn xong.</> : <>Đang ở <b>chế độ kiểm thử</b>: có thể xác nhận dọn xong ngoài khung 12:00–14:00. Chế độ này chỉ do Quản lý/Admin điều chỉnh.</>}</div>
          {housekeeping.map(r=><div className="manage-row" key={r.id}>
            <div><b>Phòng {r.room_number} · {roomTypeLabel(r.room_type_name)}</b><span>Bắt đầu dọn: {date(r.cleaning_started_at)}</span></div>
            <span className={r.cleaning_overdue?'status cancelled':'status active'}>{r.cleaning_overdue?'Quá 14:00':'Đang dọn'} · {r.cleaning_minutes||0} phút</span>
            <button className="btn dark" onClick={()=>cleaningComplete(r)}>Đã dọn xong</button>
          </div>)}
          {!housekeeping.length && <div className="empty">Không có phòng đang dọn.</div>}
        </div>
      )}

      {tab === 'payments' && canApprovePayments && (
        <div className="manage-list">
          {pending.map(p => (
            <div className="manage-row" key={p.id}>
              <div>
                <b>{p.booking_code}</b>
                <span>{p.customer || '—'} · {paymentTypeLabel(p.type)} · {date(p.created_at)}</span>
              </div>
              <b>{money(p.amount)}</b>
              {p.proof_url ? (
                <a href={apiOrigin + p.proof_url} target="_blank" rel="noreferrer">
                  <img src={apiOrigin + p.proof_url} alt="Biên lai" style={{ height: 60 }}
                    onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'inline'; }} />
                  <span style={{ display: 'none' }}>Xem biên lai ↗</span>
                </a>
              ) : <span className="muted">Không có ảnh biên lai (khai báo {p.provider === 'CASH' ? 'tiền mặt' : 'chuyển khoản'})</span>}
              <button className="btn dark" onClick={() => confirmPayment(p)}>Xác nhận</button>
              <button className="btn ghost" onClick={() => rejectPayment(p)}>Từ chối</button>
            </div>
          ))}
          {!pending.length && <div className="empty">Không có thanh toán nào đang chờ duyệt.</div>}
        </div>
      )}

      {tab === 'invoice' && (
        <div className="account-card">
          <div className="module-title"><span>▤</span><div><b>Hóa đơn khách đang lưu trú</b><small>Chỉ hiển thị booking đã check-in và chưa trả phòng. Chọn một booking để xem hóa đơn.</small></div><button type="button" className="btn ghost" onClick={loadActiveInvoices}>Làm mới</button></div>
          {invoiceMsg && <div className="notice">{invoiceMsg}</div>}
          <div className="manage-list" style={{marginTop:14}}>
            {invoiceBookings.map(b=><div className="manage-row" key={b.id}>
              <div><b>Phòng {b.room_number} · {b.booking_code}</b><span>{b.full_name||'Khách chưa có tên'} · Nhận: {date(b.actual_check_in||b.check_in)} · Trả dự kiến: {date(b.check_out)}</span></div>
              <button type="button" className="btn dark" onClick={()=>loadInvoice(b.booking_code)}>{invoiceCode===b.booking_code?'Đang xem hóa đơn':'Xem hóa đơn'}</button>
            </div>)}
            {!invoiceBookings.length && <div className="empty">Hiện không có booking nào đang lưu trú (đã check-in).</div>}
          </div>
          {invoiceData && <div className="invoice-box invoice-card" style={{marginTop:18}}>
            <div className="invoice-head"><div><span className="eyebrow">LUXORA HOTEL</span><h3>HÓA ĐƠN LƯU TRÚ</h3><span>{invoiceData.booking.booking_code} · Phòng {invoiceData.booking.room_number} · {invoiceData.booking.full_name||'—'}</span><small style={{display:'block',marginTop:6}}>📞 {invoiceData.booking.customer_phone||invoiceData.booking.phone||'Chưa có số điện thoại'}</small></div><div className="invoice-total"><small>TỔNG CỘNG</small><b>{money(invoiceData.invoice.grandTotal)}</b></div></div>
            <div className="invoice-line"><span>Giá phòng</span><b>{money(invoiceData.invoice.roomTotal)}</b></div>
            {invoiceData.services.map(sv=><div className="invoice-line" key={sv.id}><span>{sv.name}<small style={{display:'block'}}>Đơn giá: {money(sv.unit_price)} · Số lượng: {sv.quantity}</small></span><b>{money(Number(sv.quantity)*Number(sv.unit_price))}</b><div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}><button type="button" className="btn ghost" disabled={Number(sv.quantity)<=1} onClick={()=>editInvoiceService(sv,Number(sv.quantity)-1)} aria-label={`Giảm số lượng ${sv.name}`}>−</button><b>{sv.quantity}</b><button type="button" className="btn ghost" disabled={Number(sv.quantity)>=50} onClick={()=>editInvoiceService(sv,Number(sv.quantity)+1)} aria-label={`Tăng số lượng ${sv.name}`}>+</button><button type="button" className="btn ghost" onClick={()=>editInvoiceService(sv,'cancel')}>Bỏ dịch vụ</button></div></div>)}
            {!invoiceData.services.length && <div className="empty">Chưa có dịch vụ phát sinh trong hóa đơn.</div>}
            {!!invoiceCatalog.length && <section className="reception-invoice-services"><b>Dịch vụ có thể thêm</b><small>Chưa thêm sẽ hiển thị mờ; dịch vụ đã có trong hóa đơn sẽ hiện rõ.</small>{invoiceCatalog.map(service=>{const added=invoiceData.services.some(item=>item.service_id===service.id);return <div className={`reception-invoice-service ${added?'is-added':'is-available'}`} key={service.id}><span><b>{service.name}</b><small>{service.description||'Dịch vụ tại khách sạn'}</small></span><strong>{money(service.price)}</strong>{added?<b className="reception-invoice-service-state">Đã thêm</b>:<><input aria-label={`Số lượng ${service.name}`} type="number" min="1" max="50" value={invoiceServiceQuantities[service.id]||1} onChange={e=>setInvoiceServiceQuantities(current=>({...current,[service.id]:e.target.value}))}/><button type="button" className="btn ghost" disabled={addingInvoiceService===service.id} onClick={()=>addInvoiceService(service)}>{addingInvoiceService===service.id?'Đang thêm…':'Thêm'}</button></>}</div>})}</section>}
            {invoiceData.invoice.surcharge>0&&<div className="invoice-line"><span>Phụ phí</span><b>{money(invoiceData.invoice.surcharge)}</b></div>}
            <div className="invoice-line"><span>Đã thanh toán / tiền cọc</span><b>{money(invoiceData.invoice.depositTotal)}</b></div>
            <div className="invoice-line total"><span>Tổng hóa đơn</span><b>{money(invoiceData.invoice.grandTotal)}</b></div><div className="invoice-line total"><span>Còn phải trả</span><b>{money(invoiceData.invoice.remainingTotal)}</b></div>
          </div>}
        </div>
      )}

    </main>
  );
}
