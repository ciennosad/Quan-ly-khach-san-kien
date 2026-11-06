import React from 'react';
import {useEffect,useState} from 'react';
import {api,money,assetUrl,roomTypeLabel,roomTypeTitle,roomTypeBedInfo,serviceDisplay} from './KetNoiAPI';
import ChatBot from './ChatBot.jsx';
import {Link} from 'react-router-dom';
import {getRoomGallery} from './AnhPhongMacDinh';

function isoDateLocal(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

const demoImage=(i)=>`https://images.unsplash.com/photo-${[
'1566665797739-1674de7a421a','1582719478250-c89cae4dc85b','1564501049412-61c2a3083791','1578683010236-d716f9a3f461','1590490360182-c33d57733427'
][i%5]}?auto=format&fit=crop&w=1200&q=80`;

const hotelHeroImage='https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=2200&q=90';
const fmtDT=v=>v?new Date(v).toLocaleString('vi-VN',{dateStyle:'short',timeStyle:'short'}):'';

// Trạng thái phòng thực tế = trạng thái vật lý (do lễ tân cập nhật: đang dọn/bảo trì) ƯU
// TIÊN hơn, còn lại thì suy ra từ chính lịch đặt phòng (booking) ngay lúc này — KHÔNG chỉ
// dựa vào cột "status" tĩnh của phòng, vì cột đó chỉ được lễ tân đổi thủ công lúc check-in,
// nên 1 phòng vừa được khách đặt (chưa tới giờ nhận phòng) vẫn bị hiện nhầm "Trống" nếu chỉ
// nhìn vào status. upcoming_bookings do backend trả kèm mỗi phòng (xem GET /rooms).
function roomDisplayStatus(r){
  if(r.status==='MAINTENANCE') return {label:'Đang bảo trì',cls:'maintenance'};
  if(r.status==='CLEANING') return {label:'Đang dọn phòng',cls:'cleaning'};
  const now=new Date();
  const current=(r.upcoming_bookings||[]).find(b=>new Date(b.checkIn)<=now && new Date(b.checkOut)>now);
  if(current) return {label:`Đang có khách đến ${fmtDT(current.checkOut)}`,cls:'occupied'};
  return {label:'Trống — nhận phòng ngay',cls:'available'};
}

function CalendarPicker({label,value,onChange,blocked,minimum,otherValue,open,setOpen}){
 const initial=value?new Date(`${value}T12:00:00`):new Date();
 const [cursor,setCursor]=useState(new Date(initial.getFullYear(),initial.getMonth(),1));
 const first=new Date(cursor.getFullYear(),cursor.getMonth(),1);
 const start=(first.getDay()+6)%7;
 const days=new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate();
 const cells=[];
 for(let i=0;i<start;i++) cells.push(null);
 for(let d=1;d<=days;d++) cells.push(new Date(cursor.getFullYear(),cursor.getMonth(),d));
 const min=minimum?new Date(`${minimum}T00:00:00`):new Date(new Date().toLocaleDateString('en-CA')+'T00:00:00');
 const blockedSet=blocked||new Set();
 return <div className="calendar-field">
   <label>{label}</label>
   <button type="button" className={`calendar-input ${open?'open':''}`} onClick={()=>{setCursor(new Date((value||minimum||new Date().toISOString().slice(0,10))+'T12:00:00'));setOpen(!open)}}>{value?new Date(`${value}T12:00:00`).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}):'Chọn ngày'}</button>
   {open && <div className="calendar-popover">
     <div className="calendar-head"><button type="button" onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()-1,1))}>‹</button><b>{cursor.toLocaleDateString('vi-VN',{month:'long',year:'numeric'})}</b><button type="button" onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+1,1))}>›</button></div>
     <div className="calendar-week">{['T2','T3','T4','T5','T6','T7','CN'].map(x=><span key={x}>{x}</span>)}</div>
     <div className="calendar-grid">{cells.map((d,i)=>{if(!d)return <span key={i}/>;const iso=isoDateLocal(d);const disabled=d<min||blockedSet.has(iso)||(otherValue&&label.toLowerCase().includes('trả')&&iso<=otherValue);const selected=iso===value;return <button type="button" key={iso} disabled={disabled} className={`${selected?'selected ':''}${disabled?'disabled':''}`} onClick={()=>{onChange(iso);setOpen(false)}}>{d.getDate()}</button>})}</div>
     <small className="calendar-note"><span className="calendar-dot white"/> Còn phòng <span className="calendar-dot gray"/> Hết phòng</small>
   </div>}
 </div>;
}

function App({user,setUser}){
 const [rooms,setRooms]=useState([]); const [services,setServices]=useState([]);
 const [search,setSearch]=useState({checkIn:'',checkOut:'',guests:2}); const [loading,setLoading]=useState(true); const [blocked,setBlocked]=useState(new Set()); const [blockedCheckout,setBlockedCheckout]=useState(new Set()); const [openCalendar,setOpenCalendar]=useState('');
 const load=async(shouldScroll=false)=>{setLoading(true);try{if((search.checkIn&&!search.checkOut)||(!search.checkIn&&search.checkOut)){throw new Error('Vui lòng chọn cả ngày nhận và ngày trả phòng')}if(search.checkIn&&search.checkOut&&new Date(`${search.checkIn}T14:00:00+07:00`)>=new Date(`${search.checkOut}T12:00:00+07:00`)) throw new Error('Ngày trả phòng phải sau ngày nhận phòng');const q=new URLSearchParams();if(search.checkIn)q.set('checkIn',`${search.checkIn}T14:00:00+07:00`);if(search.checkOut)q.set('checkOut',`${search.checkOut}T12:00:00+07:00`);q.set('guests',String(search.guests));setRooms(await api('/rooms?'+q.toString()));setServices(await api('/services'));if(shouldScroll) document.getElementById('rooms')?.scrollIntoView({behavior:'smooth', block:'start'});}catch(e){setRooms([]);alert(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load(false)},[]);
  useEffect(()=>{if(search.checkOut&&blockedCheckout.has(search.checkOut))setSearch(s=>({...s,checkOut:''}))},[blockedCheckout]);
 useEffect(()=>{let active=true;(async()=>{try{const today=isoDateLocal();const end=new Date();end.setDate(end.getDate()+120);const q=new URLSearchParams({from:today,to:isoDateLocal(end)});if(search.checkIn)q.set('checkIn',search.checkIn);const r=await api('/availability/calendar?'+q.toString());if(!active)return;setBlocked(new Set(r.blocked||[]));setBlockedCheckout(new Set(r.blockedCheckout||[]));}catch(_){if(!active)return;setBlocked(new Set());setBlockedCheckout(new Set())}})();return()=>{active=false}},[search.checkIn]);
 const setDate=(key,value)=>setSearch(s=>({...s,[key]:value,...(key==='checkIn'&&s.checkOut&&value>=s.checkOut?{checkOut:''}:{})}));
 return <div className="app-shell"><div className="app-main"><main>
    <section className="hero luxora-home-hero" id="experience"><div className="hero-copy"><span className="eyebrow">HERO HOTEL · TRẢI NGHIỆM LƯU TRÚ</span><h1>Nghỉ ngơi theo<br/><em>cách của bạn.</em></h1><p>Tìm căn phòng phù hợp, chọn ngày còn phòng và đặt chỗ đơn giản trong vài bước.</p><div className="hero-actions"><a className="btn primary" href="#rooms">Khám phá phòng <span>→</span></a><a className="text-link" href="#services">Xem dịch vụ</a></div></div><div className="hero-photo"><img src={hotelHeroImage} alt="Không gian HERO"/><div className="photo-card"><b>4.9</b><span>★★★★★</span><small>Khách đánh giá</small></div></div></section>
    <section id="booking" className="luxora-search-card luxora-search-card-compact"><div className="luxora-search-fields">
      <CalendarPicker label="Ngày nhận · 14:00" value={search.checkIn} onChange={v=>setDate('checkIn',v)} blocked={blocked} minimum={isoDateLocal()} open={openCalendar==='in'} setOpen={v=>setOpenCalendar(v?'in':'')} />
      <CalendarPicker label="Ngày trả · 12:00" value={search.checkOut} onChange={v=>setDate('checkOut',v)} blocked={blockedCheckout} minimum={search.checkIn||isoDateLocal()} otherValue={search.checkIn} open={openCalendar==='out'} setOpen={v=>setOpenCalendar(v?'out':'')} />
      <div className="search-select"><label>Số khách/phòng</label><select value={search.guests} onChange={e=>setSearch({...search,guests:Number(e.target.value)})}>{[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} khách/phòng</option>)}</select></div>
      <button className="btn dark search-submit" onClick={()=>load(true)}>Tìm phòng</button>
    </div></section>
    <section id="rooms" className="section"><div className="section-head"><div><span className="eyebrow">PHÒNG CỦA CHÚNG TÔI</span><h2>Không gian để bạn<br/><em>thực sự thư giãn.</em></h2></div><span className="muted">Phòng được thiết kế để cân bằng<br/>sự riêng tư và tiện nghi.</span></div>
     {loading?<div className="loader">Đang tải phòng…</div>:rooms.length===0?<div className="empty">{search.checkIn&&search.checkOut?`Không có phòng còn trống phù hợp cho ${search.guests} khách/phòng trong khoảng ngày đã chọn.`:`Chưa có phòng phù hợp với số khách/phòng này.`}</div>:<div className="room-grid">{rooms.map((r,i)=>{
       const st=roomDisplayStatus(r); const roomGallery=getRoomGallery(r); const upcoming=(r.upcoming_bookings||[]).filter(b=>new Date(b.checkOut)>new Date());
       return <article className="room" key={r.id}><div className="room-img"><img src={assetUrl(roomGallery[0])||demoImage(i)} alt={roomTypeLabel(r.room_type_name,r.description)}/><span className={`tag tag-${st.cls}`}>{st.label}</span></div><div className="room-body"><div><h3>{roomTypeTitle(r.room_type_name,r.description)}</h3>{roomTypeBedInfo(r.room_type_name,r.description)&&<small className="room-bed-info">{roomTypeBedInfo(r.room_type_name,r.description)}</small>}<p>{r.description}</p></div><div className="room-meta"><b>{money(r.base_price)}</b><span>/ đêm · tối đa {r.capacity} khách</span></div><div className="amenities">{(r.amenities||[]).slice(0,4).map(x=><span key={x}>✦ {x}</span>)}</div>{upcoming.length>0&&<div className="room-schedule"><small>Lịch đã có khách đặt:</small>{upcoming.slice(0,3).map((b,j)=><span key={j}>{fmtDT(b.checkIn)} → {fmtDT(b.checkOut)}</span>)}</div>}{r.status==='MAINTENANCE'?<div className="room-link"><span style={{color:'#8a6b3d'}}>🔧 {r.maintenance_note||'Phòng đang được bảo trì'}</span><span>Không thể đặt</span></div>:<Link className="room-link" to={user?`/book/${r.id}`:'/login'}>Đặt phòng <span>↗</span></Link>}</div></article>
     })}</div>}
    </section>
    <section className="home-highlights" aria-label="Ưu điểm HERO">
      <article><b>ĐA DẠNG</b><span>Không gian phù hợp từng chuyến đi</span></article>
      <article><b>THUẬN TIỆN</b><span>Đặt phòng nhanh, xác nhận rõ ràng</span></article>
      <article><b>CHU ĐÁO</b><span>Dịch vụ đồng hành trong kỳ nghỉ</span></article>
      <article><b>AN TÂM</b><span>Hỗ trợ khách hàng mỗi ngày</span></article>
    </section>    <section id="services" className="services"><div><span className="eyebrow">DỊCH VỤ</span><h2>Mọi thứ bạn cần,<br/><em>ngay trong tầm tay.</em></h2></div><div className="service-list">{services.map((s,i)=>{const display=serviceDisplay(s);return <div className="service" key={s.id}><span>0{i+1}</span><div><h3>{display.name}</h3><p>{display.description}</p></div><b>{money(s.price)}</b></div>})}{user&&<Link className="btn primary" style={{display:'inline-block',marginTop:20}} to="/account?tab=rooms#my-room-services">Chọn dịch vụ cho đặt phòng →</Link>}</div></section>
    <section className="hotel-overview">
      <div className="hotel-overview-heading"><span className="eyebrow">TRẢI NGHIỆM HERO</span><h2>Không gian nghỉ dưỡng<br/><em>dành riêng cho bạn</em></h2></div>
      <div className="hotel-overview-grid">
        <article><img src="https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=900&q=85" alt="Không gian hồ bơi và khu nghỉ dưỡng"/><h3>Thư giãn giữa thiên nhiên</h3><p>Tận hưởng khoảng thời gian nghỉ ngơi thật trọn vẹn.</p></article>
        <article><img src="https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=85" alt="Phòng nghỉ tiện nghi tại khách sạn"/><h3>Phòng tiện nghi</h3><p>Không gian được chăm chút để bạn thoải mái nghỉ ngơi.</p></article>
        <article><img src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=85" alt="Không gian nhà hàng khách sạn"/><h3>Dịch vụ chu đáo</h3><p>Đội ngũ HERO luôn sẵn sàng hỗ trợ bạn.</p></article>
      </div>
    </section>    <section className="quote"><span>“</span><p>Chúng tôi không chỉ cung cấp một căn phòng. Chúng tôi tạo ra một khoảng thời gian mà bạn muốn nhớ.</p><small>— HERO HOTEL</small></section>
       <section id="contact" className="home-contact">
      <div><span className="eyebrow">LIÊN HỆ HERO</span><h2>Bạn cần chúng tôi<br/><em>hỗ trợ điều gì?</em></h2></div>
      <div className="home-contact-copy"><p>Trò chuyện với trợ lý HERO để được tư vấn về phòng nghỉ, giá phòng, dịch vụ và thời gian lưu trú.</p><button type="button" className="btn primary" onClick={()=>window.dispatchEvent(new Event('luxora:open-chat'))}>Trò chuyện với HERO <span>→</span></button></div>
    </section></main><footer className="luxora-footer"><div className="luxora-footer-main"><div className="luxora-footer-brand"><div className="brand"><span className="brand-mark">H</span><span>HERO <i>HOTEL</i></span></div><p>Không gian nghỉ dưỡng riêng tư, dịch vụ tận tâm và đặt phòng thuận tiện.</p></div><div className="luxora-footer-contact"><span className="eyebrow">LIÊN HỆ KHÁCH SẠN</span><b>Dương Đình Kiền</b><a href="tel:0379887282">Điện thoại: 0379 887 282</a><a href="mailto:kienduon757@gmail.com">Email: kienduon757@gmail.com</a></div></div><div className="luxora-footer-bottom"><span>© 2026 HERO HOTEL</span><span>Hệ thống quản lý đặt phòng khách sạn</span></div></footer></div><ChatBot/></div>
}

export default App;

