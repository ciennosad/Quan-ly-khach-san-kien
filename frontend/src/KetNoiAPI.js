const API=import.meta.env.VITE_API_URL||'http://localhost:4000/api';
const API_ORIGIN=API.replace(/\/api\/?$/,'');

export const assetUrl=(value)=>{
  if(!value) return '';
  if(/^https?:\/\//i.test(value)||value.startsWith('data:')) return value;
  return `${API_ORIGIN}${value.startsWith('/')?'':'/'}${value}`;
};

let refreshPromise=null;
function tokenExpiringSoon(token, skewSeconds=20){
  try{
    const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return !payload.exp || payload.exp <= Math.floor(Date.now()/1000)+skewSeconds;
  }catch(_e){ return true; }
}
async function ensureAccessToken(){
  const token=localStorage.getItem('accessToken');
  if(token && !tokenExpiringSoon(token)) return token;
  const ok=await refreshAccessToken();
  return ok ? localStorage.getItem('accessToken') : null;
}
async function refreshAccessToken(){
  const rt=localStorage.getItem('refreshToken');
  if(!rt) return false;
  if(!refreshPromise){
    refreshPromise=(async()=>{
      const r=await fetch(`${API}/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:rt})});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.accessToken) throw new Error(data.message||'Phiên đăng nhập đã hết hạn');
      localStorage.setItem('accessToken',data.accessToken);
      if(data.refreshToken) localStorage.setItem('refreshToken',data.refreshToken);
      return true;
    })().finally(()=>{refreshPromise=null});
  }
  try{return await refreshPromise}catch(e){
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('auth:expired'));
    return false;
  }
}

export async function api(path,options={},retry=true){
  let token=localStorage.getItem('accessToken');
  if(retry && path!=='/auth/login' && path!=='/auth/refresh' && token && tokenExpiringSoon(token)) token=await ensureAccessToken();
  const headers={...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(options.headers||{})};
  if(token) headers.Authorization=`Bearer ${token}`;
  const r=await fetch(`${API}${path}`,{...options,headers});
  const data=await r.json().catch(()=>({}));
  if(r.status===401&&retry&&path!=='/auth/login'&&path!=='/auth/refresh'){
    const ok=await refreshAccessToken();
    if(ok) return api(path,options,false);
  }
  if(!r.ok) throw new Error(data.message||'Có lỗi xảy ra');
  return data;
}

export const logout=async()=>{
  const rt=localStorage.getItem('refreshToken');
  try{if(localStorage.getItem('accessToken')) await api('/auth/logout',{method:'POST',body:JSON.stringify({refreshToken:rt})},false)}catch(_e){}
  localStorage.removeItem('user');localStorage.removeItem('accessToken');localStorage.removeItem('refreshToken');
};
export const money=n=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(Number(n||0));
export const date=v=>v?new Date(v).toLocaleString('vi-VN',{dateStyle:'medium',timeStyle:'short'}):'—';
export const roleLabel=r=>({ADMIN:'Quản trị viên',MANAGER:'Quản lý',RECEPTIONIST:'Lễ tân',STAFF:'Nhân viên',CUSTOMER:'Khách hàng'}[r]||r);
export const bookingStatusLabel=s=>({PENDING_PAYMENT:'Chờ thanh toán',CONFIRMED:'Đã xác nhận',CHECKED_IN:'Đang lưu trú',COMPLETED:'Đã trả phòng',CANCELLED:'Đã hủy'}[s]||s);
const normalizeServiceText=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const serviceNames={
  'dua don san bay':'Đưa đón sân bay',
  'buffet sang':'Buffet sáng',
  'giat say quan ao':'Giặt sấy quần áo',
  'do an nhe va nuoc uong trong phong':'Đồ ăn nhẹ và nước uống trong phòng',
  'nuoc suoi':'Nước suối'
};
const serviceDescriptions={
  'dua don san bay':'Đưa đón sân bay',
  'buffet sang moi ngay':'Buffet sáng mỗi ngày',
  'giat va say quan ao':'Giặt và sấy quần áo',
  'do uong va thuc an nhe trong phong':'Đồ uống và thức ăn nhẹ trong phòng',
  'nuoc suoi cua gia dinh tu sang tao ra':'Nước suối'
};
export const serviceDisplay=service=>({
  ...service,
  name:serviceNames[normalizeServiceText(service?.name)]||service?.name,
  description:serviceDescriptions[normalizeServiceText(service?.description)]||service?.description
});
export const roomTypeLabel=(name,description='')=>{
  const n=`${name||''} ${description||''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const countBeds=value=>[...String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').matchAll(/(\d+)\s*giuong\b/g)].reduce((total,match)=>total+Number(match[1]),0);
  const bedCount=countBeds(name)||countBeds(description);
  if(/phong nhom|group|tap the|dorm/.test(n)) return bedCount?`Phòng nhóm · ${bedCount} giường`:'Phòng nhóm';
  if(/family|gia dinh/.test(n)) return `Phòng gia đình · ${bedCount||1} giường${bedCount===1?' lớn':''}`;
  if(/cao cap|premium|suite|deluxe/.test(n)) return `Phòng cao cấp · ${bedCount||1} giường`;
  if(/standard|phong thuong|single|phong don/.test(n)) return `Phòng thường · ${bedCount||1} giường`;
  if(/twin|double|phong doi/.test(n)) return `Phòng đôi · ${bedCount||2} giường`;
  return name||'Phòng';
};
export const roomTypeTitle=(name,description='')=>roomTypeLabel(name,description).split(' · ')[0];
export const roomTypeBedInfo=(name,description='')=>roomTypeLabel(name,description).split(' · ').slice(1).join(' · ');
export const roomStatusLabel=s=>({AVAILABLE:'Trống',BOOKED:'Đã đặt',OCCUPIED:'Đang sử dụng',CLEANING:'Đang dọn',MAINTENANCE:'Đang bảo trì'}[s]||s);
export const paymentTypeLabel=t=>({DEPOSIT:'Đặt cọc',BALANCE:'Thanh toán còn lại',REFUND:'Hoàn tiền'}[t]||t);
export const paymentStatusLabel=s=>({PENDING:'Đang chờ',SUCCESS:'Thành công',REJECTED:'Từ chối',EXPIRED:'Đã hết hạn'}[s]||s);
