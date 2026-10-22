import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, money, date, roleLabel, bookingStatusLabel, roomStatusLabel, paymentTypeLabel, paymentStatusLabel, roomTypeLabel, assetUrl } from './KetNoiAPI';

function uniqueRoomTypes(types){
  const byLabel=new Map();
  for(const type of types){
    const label=roomTypeLabel(type.name,type.description);
    const current=byLabel.get(label);
    const nameKey=String(type.name||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const isCanonical=/(?:1|2|5)\s*giuong|giuong lon/.test(nameKey);
    const currentKey=String(current?.name||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const currentCanonical=/(?:1|2|5)\s*giuong|giuong lon/.test(currentKey);
    if(!current||isCanonical||!currentCanonical) byLabel.set(label,type);
  }
  return [...byLabel.values()];
}
async function downloadFile(path, filename) {
  const token = localStorage.getItem('accessToken');
  const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:4000/api') + path, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    let message = 'Không thể xuất file báo cáo';
    try { const data = await res.json(); message = data.message || message; } catch (_) {}
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function DashboardBarChart({ title, data, labels, valueKey, valueLabel, format='number' }) {
  const rows = (data || []).slice(-12);
  const max = Math.max(1, ...rows.map(r => Number(r[valueKey] || 0)));
  const display = v => format === 'money' ? money(v) : Number(v || 0).toLocaleString('vi-VN');
  return <div className="dashboard-chart">
    <div className="dashboard-chart-head"><b>{title}</b><span>{valueLabel}</span></div>
    {!rows.length ? <div className="empty">Chưa có dữ liệu.</div> : <div className="dashboard-bars">{rows.map((r,i) => {
      const value=Number(r[valueKey]||0);
      return <div className="dashboard-bar-row" key={i}>
        <span>{labels(r)}</span><div className="dashboard-bar-track"><i style={{width:`${value ? Math.max(4, Math.min(100,value/max*100)) : 0}%`}}></i></div><strong>{display(value)}</strong>
      </div>;
    })}</div>}
  </div>;
}

function ReportBarChart({ title, data, labels, valueKeys, valueLabels }) {
  const rows = (data || []).slice(0, 12);
  const max = Math.max(1, ...rows.flatMap(r => valueKeys.map(k => Number(r[k] || 0))));
  if (!rows.length) return <div className="report-chart"><b>{title}</b><div className="empty">Chưa có dữ liệu để vẽ biểu đồ.</div></div>;
  return <div className="report-chart">
    <div className="report-chart-head"><b>{title}</b><div className="report-legend">{valueKeys.map((k,i)=><span key={k}><i className={`legend-dot dot-${i}`} />{valueLabels[i]}</span>)}</div></div>
    <div className="report-bars">
      {rows.map((r,i)=><div className="report-bar-row" key={i}>
        <div className="report-bar-label">{labels(r)}</div>
        <div className="report-bar-track">{valueKeys.map((k,j)=>{const value=Number(r[k]||0); return <div key={k} className={`report-bar bar-${j}`} style={{width:`${Math.max(value ? 3 : 0, Math.min(100, value/max*100))}%`}}><span>{money(value)}</span></div>})}</div>
      </div>)}
    </div>
  </div>;
}

const ROOM_STATUSES = ['AVAILABLE', 'BOOKED', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'];
const ROLES = ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'CUSTOMER'];
const REPORT_KINDS = [['revenue', 'Doanh thu'], ['bookings', 'Đặt phòng'], ['occupancy', 'Công suất phòng'], ['customers', 'Khách hàng'], ['payments', 'Thanh toán'], ['cashPayments', 'Thu tiền mặt'], ['checkinOut', 'Check-in / Check-out']];

// Mức lương tham khảo theo khảo sát của đề tài. Đây là khoảng tham khảo theo tháng,
// không tự động thay thế mức công/ngày thực tế mà Quản lý/Admin thiết lập để tính lương.
const SALARY_RANGES = {
  RECEPTIONIST: { min: 8000000, max: 10000000, label: '8–10 triệu/tháng' },
  STAFF: { min: 6000000, max: 9000000, label: '6–9 triệu/tháng' }
};
function salaryRangeLabel(role) { return SALARY_RANGES[role]?.label || '—'; }
function currentVNMonth() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}

const AUDIT_ACTION_LABELS = {
  PASSWORD_CHANGED: 'Đổi mật khẩu',
  SERVICE_ADDED: 'Thêm dịch vụ vào đặt phòng',
  SERVICE_CREATED: 'Tạo dịch vụ',
  SERVICE_UPDATED: 'Cập nhật dịch vụ',
  SERVICE_DISABLED: 'Ngừng cung cấp dịch vụ',
  BOOKING_CREATED: 'Tạo đặt phòng',
  BOOKING_CANCELLED: 'Hủy đặt phòng',
  PROFILE_UPDATED: 'Cập nhật hồ sơ',
  REFUND_RECIPIENT_UPDATED: 'Cập nhật thông tin nhận hoàn tiền',
  KYC_SUBMITTED: 'Gửi hồ sơ xác minh CCCD',
  KYC_VERIFIED: 'Xác minh CCCD',
  KYC_REJECTED: 'Từ chối xác minh CCCD',
  PAYMENT_PROOF_UPLOADED: 'Tải biên lai thanh toán',
  PAYMENT_METHOD_SELECTED: 'Chọn phương thức thanh toán',
  CHECK_IN: 'Nhận phòng',
  CHECK_OUT: 'Trả phòng',
  ROOM_CLEANING_COMPLETED: 'Hoàn tất dọn phòng',
  ROOM_MAINTENANCE_STARTED: 'Bắt đầu bảo trì phòng',
  ROOM_MAINTENANCE_COMPLETED: 'Hoàn tất bảo trì phòng',
  USER_CREATED: 'Tạo tài khoản',
  USER_STATUS_CHANGED: 'Thay đổi trạng thái tài khoản',
  USER_ROLE_CHANGED: 'Thay đổi quyền tài khoản',
  USER_DELETED: 'Xóa tài khoản',
  DISCOUNT_CREATED: 'Tạo mã giảm giá',
  ROOM_TYPE_CREATED: 'Tạo loại phòng',
  ROOM_TYPE_UPDATED: 'Cập nhật loại phòng',
  ROOM_TYPE_DELETED: 'Xóa loại phòng',
  ROOM_CREATED: 'Tạo phòng',
  ROOM_UPDATED: 'Cập nhật phòng',
  ROOM_DELETED: 'Xóa phòng',
  PAYMENT_CONFIRMED: 'Xác nhận thanh toán',
  PAYMENT_REJECTED: 'Từ chối thanh toán',
  REFUND_APPROVED: 'Duyệt hoàn tiền',
  REFUND_SUCCESS: 'Hoàn tiền thành công',
  REFUND_REJECTED: 'Từ chối hoàn tiền',
  PAYMENT_SETTINGS_UPDATED: 'Cập nhật tài khoản nhận tiền',
  OPERATION_TIME_RULES_UPDATED: 'Bật/tắt giới hạn giờ nhận và trả phòng',
  ATTENDANCE_UPDATED: 'Sửa chấm công',
  PAYROLL_RATE_UPDATED: 'Cập nhật mức công',
  PAYROLL_PACKAGE_UPDATED: 'Cập nhật lương và phụ cấp',
  PAYROLL_MONTH_CLOSED: 'Chốt công tháng',
  PAYROLL_PAID: 'Đánh dấu đã thanh toán lương'
};

const AUDIT_ENTITY_LABELS = {
  USER: 'Tài khoản',
  BOOKING: 'Đặt phòng',
  PAYMENT: 'Thanh toán',
  SERVICE: 'Dịch vụ',
  ROOM: 'Phòng',
  ROOM_TYPE: 'Loại phòng',
  DISCOUNT_CODE: 'Mã giảm giá',
  HOTEL_SETTINGS: 'Cấu hình khách sạn'
};

function auditActionLabel(action='') {
  if (AUDIT_ACTION_LABELS[action]) return AUDIT_ACTION_LABELS[action];
  return String(action || 'Thao tác hệ thống').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
}

function auditEntityLabel(type='') {
  return AUDIT_ENTITY_LABELS[type] || 'Đối tượng hệ thống';
}

function paymentProviderDisplay(provider='') {
  return ({
    BANK_TRANSFER: 'Chuyển khoản ngân hàng',
    CASH: 'Tiền mặt',
    MANUAL: 'Thanh toán thủ công',
    VIETQR: 'Mã QR ngân hàng'
  }[provider] || provider || '—');
}

export default function AdminHome() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [dash, setDash] = useState(null);
  const [dashboardRevenue, setDashboardRevenue] = useState([]);
  const [dashboardFinance, setDashboardFinance] = useState([]);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [searchParams] = useSearchParams();
  const adminTabs = ['dashboard','rooms','services','maintenance','reports', ...(['ADMIN','MANAGER'].includes(user.role) ? ['refunds'] : []), ...(['ADMIN','MANAGER'].includes(user.role) ? ['payroll'] : []), 'discounts','special-prices', ...(['ADMIN','MANAGER'].includes(user.role) ? ['settings'] : []), ...(['ADMIN'].includes(user.role) ? ['users'] : []), 'logs'];
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(adminTabs.includes(initialTab) ? initialTab : 'dashboard');
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (adminTabs.includes(requested) && requested !== tab) setTab(requested);
  }, [searchParams]);

  const [types, setTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [services, setServices] = useState([]);
  const [newService, setNewService] = useState({ name: '', description: '', price: '' });
  const [maintenance, setMaintenance] = useState([]);
  const [newType, setNewType] = useState({ name: '', description: '', capacity: 2, basePrice: '' });
  const [newRoom, setNewRoom] = useState({ roomNumber: '', roomTypeId: '' });
  const [newUser, setNewUser] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [newUserMsg, setNewUserMsg] = useState('');

  const [reportKind, setReportKind] = useState('revenue');
  const [reportData, setReportData] = useState([]);
  const [period, setPeriod] = useState('day');
  const [revenueMonths, setRevenueMonths] = useState('1');
  const [reportMonth, setReportMonth] = useState(currentVNMonth());
  const [financeData, setFinanceData] = useState([]);
  const [reportPayroll, setReportPayroll] = useState({month:'',items:[]});
  const [exportMsg, setExportMsg] = useState('');

  const [refunds, setRefunds] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [specialPrices, setSpecialPrices] = useState([]);
  const [newSpecialPrice, setNewSpecialPrice] = useState({ roomTypeId: '', name: '', dateFrom: '', dateTo: '', price: '' });
  const [newDiscount, setNewDiscount] = useState({ code: '', percentOff: '', amountOff: '', maxUses: '', validFrom: '', validTo: '' });
  const [paymentSettings, setPaymentSettings] = useState({ bank_code: 'VCB', bank_account: '', bank_account_name: 'LUXORA HOTEL', hotel_email: '' });
  const [operationSettings, setOperationSettings] = useState({ time_rules_enabled: true, cleaning_rules_enabled: true });
  const [settingsMsg, setSettingsMsg] = useState('');
  const [reportMsg, setReportMsg] = useState('');
  const [emailTest, setEmailTest] = useState('');
  const [payrollMonth, setPayrollMonth] = useState(currentVNMonth());
  const [payrollData, setPayrollData] = useState({month:'',items:[]});
  const [attendanceData, setAttendanceData] = useState([]);
  const [attendanceQr, setAttendanceQr] = useState(null);
  const [attendanceQrSeconds, setAttendanceQrSeconds] = useState(0);
  const [payrollMsg, setPayrollMsg] = useState('');
  const [editingSalary, setEditingSalary] = useState(null);

  useEffect(() => {
    if (tab !== 'dashboard') return;
    Promise.all([api('/admin/dashboard'), api('/admin/reports/revenue?period=day&months=1'), api('/admin/reports/finance')])
      .then(([d, rev, fin]) => { setDash(d); setDashboardRevenue(Array.isArray(rev) ? rev : []); setDashboardFinance(Array.isArray(fin) ? fin : []); })
      .catch(e => console.error('Không tải được dashboard:', e));
  }, [tab]);
  useEffect(() => { if (tab === 'users') api('/admin/users').then(setUsers); }, [tab]);
  useEffect(() => { if (tab === 'logs') api('/admin/audit-logs').then(setLogs); }, [tab]);
  useEffect(() => { if (tab === 'rooms') { api('/admin/room-types').then(setTypes); api('/rooms').then(setRooms); } }, [tab]);
  useEffect(() => { if (tab === 'services') api('/admin/services').then(setServices); }, [tab]);
  useEffect(() => { if (tab === 'maintenance') api('/admin/maintenance').then(setMaintenance); }, [tab]);
  useEffect(() => { if (tab === 'refunds' && ['ADMIN','MANAGER'].includes(user.role)) api('/admin/refunds').then(setRefunds); }, [tab, user.role]);
  useEffect(() => { if (tab === 'discounts') api('/admin/discount-codes').then(setDiscounts); }, [tab]);
  useEffect(() => { if (tab === 'special-prices') { Promise.all([api('/admin/special-room-prices'), api('/admin/room-types')]).then(([prices, roomTypes]) => { setSpecialPrices(prices); setTypes(roomTypes); }).catch(e => alert(e.message)); } }, [tab]);
  useEffect(() => {
    if (tab !== 'settings') return;
    Promise.all([api('/admin/payment-settings'), api('/admin/operation-settings')])
      .then(([payment, operation]) => { setPaymentSettings(payment); setOperationSettings(operation); })
      .catch(e => setSettingsMsg(e.message || 'Không thể tải cấu hình'));
  }, [tab]);
  useEffect(() => {
    if (tab !== 'payroll' || !['ADMIN','MANAGER'].includes(user.role)) return;
    loadPayroll();
  }, [tab, payrollMonth]);

  useEffect(() => {
    if (tab !== 'payroll' || !attendanceQr?.expiresAt) { setAttendanceQrSeconds(0); return; }
    const update = () => {
      const seconds = Math.max(0, Math.ceil((new Date(attendanceQr.expiresAt).getTime() - Date.now()) / 1000));
      setAttendanceQrSeconds(seconds);
      if (seconds === 0) {
        api(`/attendance/qr?baseUrl=${encodeURIComponent(window.location.origin)}`).then(setAttendanceQr).catch(() => {});
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [tab, attendanceQr?.expiresAt]);
  useEffect(() => {
    if (tab !== 'reports') return;
    let alive = true;
    setReportMsg(''); setReportData([]); setExportMsg('');
    const path = reportKind === 'revenue' ? `/admin/reports/revenue?period=${period}&months=${revenueMonths}` : reportKind === 'cashPayments' ? `/admin/reports/cash-payments?month=${reportMonth}` : `/admin/reports/${reportKind}`;
    Promise.all([
      api(path),
      api('/admin/reports/finance'),
      api(`/admin/payroll?month=${reportMonth}`)
    ]).then(([data, finance, payroll]) => {
      if (!alive) return;
      setReportData(Array.isArray(data) ? data : []);
      setFinanceData(Array.isArray(finance) ? finance : []);
      setReportPayroll(payroll || {month:'',items:[]});
    }).catch(e => { if (alive) setReportMsg(e.message); });
    return () => { alive = false; };
  }, [tab, reportKind, period, revenueMonths, reportMonth]);

  async function toggleActive(u) {
    const updated = await api(`/admin/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !u.is_active }) });
    setUsers(list => list.map(x => x.id === u.id ? updated : x));
  }
  async function changeRole(u, role) {
    const updated = await api(`/admin/users/${u.id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
    setUsers(list => list.map(x => x.id === u.id ? updated : x));
  }
  async function deleteUser(u) {
    if (!confirm(`Xóa hẳn tài khoản ${u.full_name}? Chỉ xóa được nếu tài khoản chưa có hoạt động/đặt phòng nào.`)) return;
    try { await api(`/admin/users/${u.id}`, { method: 'DELETE' }); setUsers(list => list.filter(x => x.id !== u.id)); }
    catch (e) { alert(e.message); }
  }
  async function createUser(e) {
    e.preventDefault();
    setNewUserMsg('');
    try {
      const u = await api('/admin/users', { method: 'POST', body: JSON.stringify(newUser) });
      setUsers(list => [u, ...list]);
      setNewUser({ fullName: '', email: '', phone: '', password: '' });
      setNewUserMsg('Đã tạo tài khoản quản trị viên thành công.');
    } catch (e) { setNewUserMsg(e.message); }
  }

  async function createType(e) {
    e.preventDefault();
    const t = await api('/admin/room-types', { method: 'POST', body: JSON.stringify(newType) });
    setTypes(list => [...list, t]);
    setNewType({ name: '', description: '', capacity: 2, basePrice: '' });
  }
  async function updateTypePrice(t, value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) { alert('Giá phòng phải là số lớn hơn hoặc bằng 0'); return; }
    try {
      const updated = await api(`/admin/room-types/${t.id}`, { method: 'PATCH', body: JSON.stringify({ basePrice: amount }) });
      setTypes(list => list.map(x => x.id === t.id ? { ...x, ...updated } : x));
    } catch (e) { alert(e.message); }
  }
  async function deleteType(id) {
    try { await api(`/admin/room-types/${id}`, { method: 'DELETE' }); setTypes(list => list.filter(t => t.id !== id)); }
    catch (e) { alert(e.message); }
  }
  async function createRoom(e) {
    e.preventDefault();
    const r = await api('/admin/rooms', { method: 'POST', body: JSON.stringify(newRoom) });
    setRooms(list => [...list, { ...r, room_type_name: types.find(t => t.id === newRoom.roomTypeId)?.name, description: types.find(t => t.id === newRoom.roomTypeId)?.description }]);
    setNewRoom({ roomNumber: '', roomTypeId: '' });
  }
  async function updateRoomStatus(r, status) {
    const updated = await api(`/admin/rooms/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    setRooms(list => list.map(x => x.id === r.id ? { ...x, ...updated } : x));
  }
  async function deleteRoom(id) {
    try { await api(`/admin/rooms/${id}`, { method: 'DELETE' }); setRooms(list => list.filter(r => r.id !== id)); }
    catch (e) { alert(e.message); }
  }
  async function uploadImages(roomId, files) {
    const fd = new FormData();
    [...files].forEach(f => fd.append('images', f));
    try{ const updated=await api(`/admin/rooms/${roomId}/images`,{method:'POST',body:fd}); setRooms(list => list.map(r => r.id === roomId ? { ...r, images: updated.images } : r)); }
    catch(err){ alert(err.message); }
  }
  async function setPrimaryRoomImage(room, imageIndex) {
    const images=[...(room.images||[])];
    if(imageIndex<1||imageIndex>=images.length)return;
    images.unshift(images.splice(imageIndex,1)[0]);
    try{const updated=await api(`/admin/rooms/${room.id}/images`,{method:'PUT',body:JSON.stringify({images})});setRooms(list=>list.map(r=>r.id===room.id?{...r,images:updated.images}:r));}
    catch(err){alert(err.message)}
  }
  async function deleteRoomImage(room,imageIndex) {
    if(!window.confirm('Xóa ảnh này khỏi phòng?'))return;
    try{const updated=await api(`/admin/rooms/${room.id}/images/${imageIndex}`,{method:'DELETE'});setRooms(list=>list.map(r=>r.id===room.id?{...r,images:updated.images}:r));}
    catch(err){alert(err.message)}
  }

  async function createService(e) {
    e.preventDefault();
    try { const x=await api('/admin/services',{method:'POST',body:JSON.stringify(newService)}); setServices(list=>[x,...list]); setNewService({name:'',description:'',price:''}); } catch(e){alert(e.message)}
  }
  async function updateService(x, patch) {
    try { const u=await api(`/admin/services/${x.id}`,{method:'PATCH',body:JSON.stringify(patch)}); setServices(list=>list.map(s=>s.id===x.id?u:s)); } catch(e){alert(e.message)}
  }
  async function disableService(x) { if(!confirm(`Tạm ngưng dịch vụ ${x.name}?`))return; await updateService(x,{isActive:false}); }
  async function toggleMaintenance(r) {
    try {
      if(r.status==='MAINTENANCE') { const u=await api(`/admin/maintenance/${r.id}`,{method:'PATCH',body:JSON.stringify({maintenance:false})}); setMaintenance(list=>list.map(x=>x.id===r.id?u:x)); }
      else { const note=prompt(`Lý do bảo trì phòng ${r.room_number}:`); if(note===null)return; const expectedEnd=prompt('Dự kiến hoàn thành (YYYY-MM-DDTHH:mm), có thể để trống:')||''; const u=await api(`/admin/maintenance/${r.id}`,{method:'PATCH',body:JSON.stringify({maintenance:true,note,expectedEnd})}); setMaintenance(list=>list.map(x=>x.id===r.id?u:x)); }
    } catch(e){alert(e.message)}
  }

  async function createDiscount(e) {
    e.preventDefault();
    try {
      const d = await api('/admin/discount-codes', { method: 'POST', body: JSON.stringify(newDiscount) });
      setDiscounts(list => [d, ...list]);
      setNewDiscount({ code: '', percentOff: '', amountOff: '', maxUses: '', validFrom: '', validTo: '' });
    } catch (e) { alert(e.message); }
  }
  async function createSpecialPrice(e) {
    e.preventDefault();
    try {
      const x = await api('/admin/special-room-prices', { method: 'POST', body: JSON.stringify(newSpecialPrice) });
      setSpecialPrices(list => [x, ...list]);
      setNewSpecialPrice({ roomTypeId: '', name: '', dateFrom: '', dateTo: '', price: '' });
    } catch (e) { alert(e.message); }
  }
  async function toggleSpecialPrice(x) {
    try { const u = await api(`/admin/special-room-prices/${x.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !x.is_active }) }); setSpecialPrices(list => list.map(v => v.id === x.id ? u : v)); }
    catch (e) { alert(e.message); }
  }
  async function deleteSpecialPrice(id) {
    if (!confirm('Xóa giá ngày đặc biệt này?')) return;
    try { await api(`/admin/special-room-prices/${id}`, { method: 'DELETE' }); setSpecialPrices(list => list.filter(x => x.id !== id)); } catch (e) { alert(e.message); }
  }

  async function toggleDiscount(d) {
    const updated = await api(`/admin/discount-codes/${d.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !d.is_active }) });
    setDiscounts(list => list.map(x => x.id === d.id ? updated : x));
  }
  async function deleteDiscount(id) {
    if (!confirm('Xóa mã giảm giá này?')) return;
    await api(`/admin/discount-codes/${id}`, { method: 'DELETE' });
    setDiscounts(list => list.filter(x => x.id !== id));
  }

  async function reviewRefund(refund, status) {
    try {
      if (status === 'APPROVED' && refund.refund?.refundMethod === 'BANK_TRANSFER' && !refund.refund?.refundBankAccount) { alert('Khách chưa cung cấp thông tin tài khoản nhận hoàn tiền.'); return; }
      const reason = status === 'REJECTED' ? prompt('Lý do từ chối hoàn tiền:') || '' : '';
      // Nội dung chuyển khoản được hệ thống tự động lấy bằng mã đặt phòng.
      const updated = await api(`/admin/refunds/${refund.id}`, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
      setRefunds(list => list.map(r => r.id === refund.id ? { ...r, ...updated, refund: updated.raw_payload || r.refund } : r));
    } catch (e) { alert(e.message); }
  }

  async function loadPayroll() {
    try {
      const [p,a,q] = await Promise.all([api(`/admin/payroll?month=${payrollMonth}`), api(`/admin/attendance?month=${payrollMonth}`), api(`/attendance/qr?baseUrl=${encodeURIComponent(window.location.origin)}`)]);
      setPayrollData(p); setAttendanceData(a); setAttendanceQr(q);
    } catch (e) { setPayrollMsg(e.message); }
  }
  async function editAttendance(a) {
    const toInput = v => {
      if (!v) return '';
      const d = new Date(v);
      const pad = n => String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const clockIn = prompt(`Giờ vào của ${a.full_name} (${a.work_date})`, toInput(a.clock_in));
    if (clockIn === null) return;
    const clockOut = prompt(`Giờ ra của ${a.full_name} (${a.work_date})`, toInput(a.clock_out));
    if (clockOut === null) return;
    const note = prompt('Lý do/chú thích chỉnh sửa (không bắt buộc):', a.note || '') ?? '';
    try {
      await api(`/admin/attendance/${a.id}`, {method:'PATCH', body:JSON.stringify({clockIn:clockIn || null, clockOut:clockOut || null, note})});
      await loadPayroll();
      setPayrollMsg(`Đã cập nhật chấm công cho ${a.full_name}.`);
    } catch (e) { alert(e.message || 'Không thể sửa chấm công'); }
  }

  function openSalaryEditor(item) {
    setEditingSalary({
      user_id: item.user_id,
      full_name: item.full_name,
      monthlySalary: Number(item.payroll_monthly_salary || item.monthly_salary || 0),
      housingAllowance: Number(item.housing_allowance || 0),
      transportAllowance: Number(item.transport_allowance || 0),
      attendanceBonus: Number(item.attendance_bonus || 0),
      insuranceEmployee: Number(item.insurance_employee || 0),
      insuranceEmployer: Number(item.insurance_employer || 0)
    });
  }
  async function saveSalaryPackage(e) {
    e.preventDefault();
    if (!editingSalary) return;
    try {
      await api(`/admin/payroll/package/${editingSalary.user_id}`, {method:'PATCH', body:JSON.stringify(editingSalary)});
      setEditingSalary(null);
      await loadPayroll();
      setPayrollMsg(`Đã cập nhật lương và phụ cấp cho ${editingSalary.full_name}.`);
    } catch (e) { setPayrollMsg(e.message || 'Không thể cập nhật lương'); }
  }
  async function closePayroll() {
    if (!confirm(`Chốt công tháng ${payrollMonth}? Sau khi chốt, dữ liệu lương của tháng này sẽ được khóa.`)) return;
    setPayrollMsg('');
    try { await api('/admin/payroll/close', {method:'POST', body:JSON.stringify({month:payrollMonth})}); await loadPayroll(); setPayrollMsg(`Đã chốt công tháng ${payrollMonth}.`); }
    catch (e) { setPayrollMsg(e.message); }
  }
  async function payPayroll(item) {
    if (!item.payroll_item_id) return alert('Chưa có bảng lương. Hãy chốt công trước.');
    if (!confirm(`Xác nhận đã chuyển ${money(item.gross_amount)} cho ${item.full_name}?`)) return;
    try { await api(`/admin/payroll/${item.payroll_item_id}/pay`, {method:'POST', body:JSON.stringify({})}); await loadPayroll(); }
    catch (e) { alert(e.message); }
  }

  async function savePaymentSettings(e) {
    e.preventDefault(); setSettingsMsg('');
    try {
      const updated = await api('/admin/payment-settings', { method: 'PATCH', body: JSON.stringify({ bankCode: paymentSettings.bank_code, bankAccount: paymentSettings.bank_account, bankAccountName: paymentSettings.bank_account_name, hotelEmail: paymentSettings.hotel_email }) });
      setPaymentSettings(updated); setSettingsMsg('Đã lưu cấu hình tài khoản nhận tiền. QR của khách sẽ dùng thông tin mới.');
    } catch (e) { setSettingsMsg(e.message); }
  }
  async function toggleTimeRules(enabled) {
    setSettingsMsg('Đang cập nhật chế độ giờ check-in/check-out…');
    try {
      const updated = await api('/admin/operation-settings', { method: 'PATCH', body: JSON.stringify({ timeRulesEnabled: enabled }) });
      setOperationSettings(updated);
      setSettingsMsg(enabled
        ? 'Đã BẬT giới hạn giờ vận hành. Check-in từ 14:00 và check-out đến 12:00.'
        : 'Đã TẮT giới hạn giờ vận hành. Chế độ kiểm thử cho phép Admin/Quản lý test check-in/check-out bất cứ lúc nào.');
    } catch (e) { setSettingsMsg(e.message || 'Không thể thay đổi chế độ giờ'); }
  }

  async function toggleCleaningRules(enabled) {
    setSettingsMsg('Đang cập nhật giới hạn giờ dọn phòng…');
    try {
      const updated = await api('/admin/operation-settings', { method: 'PATCH', body: JSON.stringify({ cleaningRulesEnabled: enabled }) });
      setOperationSettings(updated);
      setSettingsMsg(enabled
        ? 'Đã BẬT giới hạn dọn phòng 12:00–14:00.'
        : 'Đã TẮT giới hạn dọn phòng. Chế độ kiểm thử cho phép xác nhận dọn xong ngoài 12:00–14:00.');
    } catch (e) { setSettingsMsg(e.message || 'Không thể thay đổi giới hạn dọn phòng'); }
  }

  async function sendEmailTest(e) {
    e.preventDefault(); setSettingsMsg('Đang gửi email test…');
    try { const r = await api('/admin/email-test', { method: 'POST', body: JSON.stringify({ to: emailTest }) }); setSettingsMsg(r.message); }
    catch (e) { setSettingsMsg(e.message); }
  }

  const tabs = [
    ['dashboard', 'Tổng quan'],
    ['rooms', 'Phòng'],
    ['services', 'Dịch vụ'],
    ['maintenance', 'Bảo trì'],
    ['reports', 'Báo cáo'],
    ...(user.role === 'ADMIN' || user.role === 'MANAGER' ? [['refunds', 'Hoàn tiền']] : []),
    ...(user.role === 'ADMIN' || user.role === 'MANAGER' ? [['payroll', 'Chấm công & lương']] : []),
    ['discounts', 'Mã giảm giá'],
    ['special-prices', 'Giá ngày đặc biệt'],
    ...(user.role === 'ADMIN' || user.role === 'MANAGER' ? [['settings', 'Thanh toán & Thư điện tử']] : []),
    ...(user.role === 'ADMIN' ? [['users', 'Người dùng']] : []),
    ['logs', 'Nhật ký hoạt động'],
  ];

  return (
    <main className="account admin-workspace">
      <div className="section-head"><div><span className="eyebrow">QUẢN LÝ</span><h1>Khu vực <em>Quản lý</em></h1></div></div>

      <div className="manage-toolbar">
        <div className="manage-toolbar-select">
          <label htmlFor="manage-function">Chức năng quản lý</label>
          <select id="manage-function" value={tab} onChange={(e) => setTab(e.target.value)}>
            {tabs.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="manage-toolbar-actions">
          <button className="text-link" onClick={() => downloadCsv('/admin/export/bookings.csv', 'bookings.csv')}>Xuất danh sách đặt phòng</button>
          {user.role === 'ADMIN' && <button className="text-link" onClick={() => downloadCsv('/admin/export/accounts.csv', 'accounts.csv')}>Xuất danh sách tài khoản</button>}
        </div>
      </div>

      {tab === 'dashboard' && dash && (
        <>
          <div className="stats">
            <div><small>TỔNG ĐẶT PHÒNG</small><b>{dash.bookings}</b></div>
            <div><small>DOANH THU</small><b>{money(dash.revenue)}</b></div>
            <div><small>KHÁCH HÀNG</small><b>{dash.customers}</b></div>
            {dash.rooms.map(r => <div key={r.status}><small>{roomStatusLabel(r.status).toUpperCase()}</small><b>{r.count}</b></div>)}
          </div>
          <div className="dashboard-chart-grid">
            <DashboardBarChart title="Doanh thu 30 ngày gần nhất" data={dashboardRevenue} labels={r => date(r.bucket)} valueKey="total" valueLabel="Doanh thu" format="money" />
            <DashboardBarChart title="Thu – chi theo tháng" data={dashboardFinance} labels={r => date(r.bucket)} valueKey="income" valueLabel="Thu" format="money" />
            <DashboardBarChart title="Chi phí lương theo tháng" data={dashboardFinance} labels={r => date(r.bucket)} valueKey="payroll_expense" valueLabel="Chi lương" format="money" />
            <DashboardBarChart title="Tình trạng phòng" data={dash.rooms} labels={r => roomStatusLabel(r.status)} valueKey="count" valueLabel="Số phòng" />
            <DashboardBarChart title="Trạng thái đặt phòng" data={dash.bookingStatuses || []} labels={r => bookingStatusLabel(r.status)} valueKey="count" valueLabel="Số booking" />
          </div>
        </>
      )}

      {tab === 'rooms' && (
        <>
          <h2>Loại phòng</h2>
          <form onSubmit={createType} className="manage-form">
            <label>Tên loại phòng<input value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })} required /></label>
            <label>Sức chứa<input type="number" min="1" value={newType.capacity} onChange={e => setNewType({ ...newType, capacity: e.target.value })} /></label>
            <label>Giá / đêm<input type="number" min="0" value={newType.basePrice} onChange={e => setNewType({ ...newType, basePrice: e.target.value })} required /></label>
            <label>Mô tả<input value={newType.description} onChange={e => setNewType({ ...newType, description: e.target.value })} /></label>
            <button className="btn dark">Thêm loại phòng</button>
          </form>
          <div className="manage-list">
            {uniqueRoomTypes(types).map(t => (
              <div className="manage-row" key={t.id}>
                <div><b>{roomTypeLabel(t.name,t.description)}</b><span>{t.description} · tối đa {t.capacity} khách</span></div>
                <label style={{display:'flex',alignItems:'center',gap:8,margin:0}}><span style={{whiteSpace:'nowrap'}}>Giá / đêm</span><input type="number" min="0" step="1000" defaultValue={Number(t.base_price)} onBlur={e=>updateTypePrice(t,e.target.value)} /></label>
                <span style={{whiteSpace:'nowrap',fontWeight:700}}>{money(t.base_price)}</span>
                <button type="button" className="btn ghost" onClick={() => { const value=window.prompt(`Nhập giá mới cho ${roomTypeLabel(t.name,t.description)} (đ/đêm):`, String(Number(t.base_price))); if(value!==null) updateTypePrice(t,value); }}>Sửa giá</button>
                <button type="button" className="btn ghost" onClick={() => deleteType(t.id)}>Xóa</button>
              </div>
            ))}
            {!types.length && <div className="empty">Chưa có loại phòng nào.</div>}
          </div>

          <h2 style={{ marginTop: 44 }}>Phòng</h2>
          <form onSubmit={createRoom} className="manage-form">
            <label>Số phòng<input value={newRoom.roomNumber} onChange={e => setNewRoom({ ...newRoom, roomNumber: e.target.value })} required /></label>
            <label>Loại phòng
              <select value={newRoom.roomTypeId} onChange={e => setNewRoom({ ...newRoom, roomTypeId: e.target.value })} required>
                <option value="">-- Chọn --</option>
                {uniqueRoomTypes(types).map(t => <option key={t.id} value={t.id}>{roomTypeLabel(t.name,t.description)}</option>)}
              </select>
            </label>
            <button className="btn dark">Thêm phòng</button>
          </form>
          <div className="manage-list">
            {rooms.map(r => (
              <div className="manage-row admin-room-row" key={r.id}>
                <div className="admin-room-meta">
                  <div className="admin-room-title"><b>Phòng {r.room_number}</b><span>{roomTypeLabel(r.room_type_name,r.description)}</span></div>
                  <label className="admin-room-status">Trạng thái<select value={r.status} onChange={e => updateRoomStatus(r, e.target.value)}>
                    {ROOM_STATUSES.map(s => <option key={s} value={s}>{roomStatusLabel(s)}</option>)}
                  </select></label>
                  <button type="button" className="admin-room-delete" onClick={() => deleteRoom(r.id)}>Xóa phòng</button>
                </div>
                <div className="admin-room-photo-list">
                  {(r.images||[]).map((image,index)=><div className={`admin-room-photo ${index===0?'is-cover':''}`} key={image+index}>
                    <img src={assetUrl(image)} alt={'Ảnh phòng '+(index+1)} loading="lazy" />
                    {index===0 && <span className="admin-room-cover-badge">TRANG CHỦ</span>}
                    <button type="button" className="admin-room-photo-delete" onClick={()=>deleteRoomImage(r,index)} aria-label={'Xóa ảnh '+(index+1)}>×</button>
                  </div>)}
                  <label className="admin-room-add-photo"><span>+</span><b>Thêm ảnh</b><input type="file" multiple accept="image/*" onChange={e=>{uploadImages(r.id,e.target.files);e.target.value='';}} /></label>
                  <small className="admin-room-photo-count">{(r.images||[]).length ? `${(r.images||[]).length} ảnh` : 'Chưa có ảnh'}</small>
                </div>
              </div>
            ))}
            {!rooms.length && <div className="empty">Chưa có phòng nào.</div>}
          </div>
        </>
      )}

      {tab === 'services' && (
        <>
          <h2>Quản lý dịch vụ</h2>
          <p className="muted">Quản lý/Quản trị viên có thể thêm, sửa giá, mô tả và bật/tắt dịch vụ. Khách hàng chỉ nhìn thấy dịch vụ đang bật.</p>
          <form onSubmit={createService} className="manage-form">
            <label>Tên dịch vụ<input value={newService.name} onChange={e=>setNewService({...newService,name:e.target.value})} required placeholder="Ví dụ: Spa" /></label>
            <label>Mô tả<input value={newService.description} onChange={e=>setNewService({...newService,description:e.target.value})} placeholder="Mô tả ngắn" /></label>
            <label>Giá<input type="number" min="0" value={newService.price} onChange={e=>setNewService({...newService,price:e.target.value})} required /></label>
            <button className="btn dark">+ Thêm dịch vụ</button>
          </form>
          <div className="manage-list">
            {services.map(s=><div className="manage-row" key={s.id}>
              <div><b>{s.name}</b><span>{s.description||'Chưa có mô tả'}</span></div>
              <input type="number" min="0" value={s.price} onChange={e=>setServices(list=>list.map(x=>x.id===s.id?{...x,price:e.target.value}:x))} onBlur={()=>updateService(s,{price:Number(s.price)})} />
              <input value={s.description||''} onChange={e=>setServices(list=>list.map(x=>x.id===s.id?{...x,description:e.target.value}:x))} onBlur={()=>updateService(s,{description:s.description})} placeholder="Mô tả" />
              <span className={`status ${s.is_active?'active':'inactive'}`}>{s.is_active?'Đang cung cấp':'Tạm ngưng'}</span>
              <button className="btn ghost" onClick={()=>updateService(s,{isActive:!s.is_active})}>{s.is_active?'Tạm ngưng':'Bật lại'}</button>
            </div>)}
            {!services.length&&<div className="empty">Chưa có dịch vụ nào.</div>}
          </div>
        </>
      )}

      {tab === 'maintenance' && (
        <>
          <h2>Bảo trì phòng</h2>
          <div className="notice">Quản lý/Quản trị viên chọn phòng cần sửa chữa. Phòng bảo trì vẫn được khách nhìn thấy nhưng không thể đặt.</div>
          <div className="manage-list">
            {maintenance.map(r=><div className="manage-row" key={r.id}>
              <div><b>Phòng {r.room_number} · {roomTypeLabel(r.room_type_name,r.description)}</b><span>{r.status==='MAINTENANCE'?(r.maintenance_note||'Đang bảo trì'):'Đang hoạt động'}</span></div>
              {r.status==='MAINTENANCE' && <span>Dự kiến: {r.maintenance_expected_end?date(r.maintenance_expected_end):'Chưa đặt'}</span>}
              <span className={`status ${r.status==='MAINTENANCE'?'inactive':'active'}`}>{r.status==='MAINTENANCE'?'Đang bảo trì':'Đang hoạt động'}</span>
              <button className={`btn ${r.status==='MAINTENANCE'?'ghost':'dark'}`} onClick={()=>toggleMaintenance(r)}>{r.status==='MAINTENANCE'?'Hoàn tất bảo trì':'Đưa vào bảo trì'}</button>
            </div>)}
          </div>
        </>
      )}

      {tab === 'reports' && (
        <div className="admin-report">
          <div className="report-filter-panel">
            <div className="report-filter-head">
              <div>
                <b>Bộ lọc báo cáo</b>
                <span>Chọn loại báo cáo và khoảng thời gian cần xem.</span>
              </div>
              <label className="report-month">Tháng dữ liệu xuất<input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} /></label>
            </div>
            <div className="report-filter-row">
              <label className="report-kind-select-wrap">Loại báo cáo
                <select className="report-kind-select" value={reportKind} onChange={e => setReportKind(e.target.value)}>
                  {REPORT_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </label>
              {reportKind === 'revenue' && <>
                <div className="report-range-control">
                  <span className="revenue-range-label">Khoảng thời gian</span>
                  <div className="revenue-range-buttons" role="group" aria-label="Lọc doanh thu">
                    {[['1','1 tháng'],['3','3 tháng'],['6','6 tháng'],['12','12 tháng']].map(([value,label]) => (
                      <button key={value} className={revenueMonths === value ? 'active' : ''} onClick={() => setRevenueMonths(value)}>{label}</button>
                    ))}
                  </div>
                </div>
                <label className="report-period-wrap">Nhóm dữ liệu
                  <select className="report-period-select" value={period} onChange={e => setPeriod(e.target.value)} aria-label="Cách nhóm doanh thu">
                    <option value="day">Theo ngày</option>
                    <option value="month">Theo tháng</option>
                    <option value="year">Theo năm</option>
                  </select>
                </label>
              </>}
            </div>
          </div>
          <div className="report-export-panel">
            <div>
              <b>Xuất báo cáo Excel</b>
              <span>Chọn tháng dữ liệu ở phía trên rồi chọn loại file cần xuất.</span>
            </div>
            <div className="report-export-actions">
              <button className="btn dark" onClick={async()=>{try{setExportMsg('Đang tạo file Excel tổng hợp…');await downloadFile(`/admin/reports/export.xls?month=${reportMonth}`,`LUXORA-Bao-cao-${reportMonth}.xls`);setExportMsg('Đã tải file Excel tổng hợp.')}catch(e){setExportMsg(e.message)}}}>📊 Xuất Excel báo cáo tổng hợp</button>
              <button className="btn ghost" onClick={async()=>{try{setExportMsg('Đang tạo file Excel chấm công…');await downloadFile(`/admin/reports/attendance.xls?month=${reportMonth}`,`LUXORA-Cham-cong-${reportMonth}.xls`);setExportMsg('Đã tải file Excel chấm công.')}catch(e){setExportMsg(e.message)}}}>🕘 Xuất Excel chấm công</button>
              <button className="btn ghost" onClick={async()=>{try{setExportMsg('Đang tạo file Excel check-in/check-out…');await downloadFile(`/admin/reports/checkin-out.xls?month=${reportMonth}`,`LUXORA-Checkin-Checkout-${reportMonth}.xls`);setExportMsg('Đã tải file Excel check-in/check-out.')}catch(e){setExportMsg(e.message)}}}>🏨 Xuất Excel check-in / check-out</button>
              <button className="btn ghost" onClick={async()=>{try{setExportMsg('Đang tạo file Excel thu tiền mặt…');await downloadFile(`/admin/reports/cash-payments.xls?month=${reportMonth}`,`LUXORA-Tien-mat-${reportMonth}.xls`);setExportMsg('Đã tải file Excel thu tiền mặt.')}catch(e){setExportMsg(e.message)}}}>💵 Xuất Excel thu tiền mặt</button>
            </div>
          </div>
          {reportMsg && <div className="notice error-notice">{reportMsg}</div>}
          {exportMsg && <div className="notice">{exportMsg}</div>}
          <div className="report-charts-grid">
            <ReportBarChart title={`Biểu đồ doanh thu (${period === 'day' ? 'theo ngày' : period === 'month' ? 'theo tháng' : 'theo năm'})`} data={reportKind === 'revenue' ? reportData : []} labels={r=>date(r.bucket)} valueKeys={['total']} valueLabels={['Doanh thu']} />
            <ReportBarChart title="Biểu đồ thu – chi lương" data={financeData} labels={r=>date(r.bucket)} valueKeys={['income','payroll_expense']} valueLabels={['Thu thanh toán','Chi lương']} />
            <ReportBarChart title={`Thanh toán lương ${reportMonth}`} data={reportPayroll.items || []} labels={r=>r.full_name} valueKeys={['gross_amount']} valueLabels={['Lương phải trả']} />
          </div>
          <div className="manage-list">
            {reportKind === 'revenue' && <div className="notice">Lịch sử doanh thu: {revenueMonths} tháng gần nhất · {reportData.length} dòng dữ liệu</div>}
            {reportKind === 'revenue' && reportData.map((r, i) => (
              <div className="manage-row" key={i}><div><b>{date(r.bucket)}</b></div><b>{money(r.total)}</b><span>{r.count} giao dịch</span></div>
            ))}
            {reportKind === 'checkinOut' && reportData.map((r, i) => (
              <div className="manage-row" key={i}>
                <div><b>{r.booking_code}</b><span>{r.customer || '—'} · Phòng {r.room_number || '—'}</span></div>
                <span>Nhận: {date(r.actual_check_in || r.check_in)}</span>
                <span>Trả: {date(r.actual_check_out || r.check_out)}</span>
                <b>{bookingStatusLabel(r.status)}</b>
              </div>
            ))}
            {reportKind === 'bookings' && reportData.map((r, i) => (
              <div className="manage-row" key={i}><div><b>{r.booking_code}</b><span>{r.customer || '—'} · Phòng {r.room_number}</span></div><b>{money(r.invoice_total || r.room_price)}</b><span className={`status ${(r.status || '').toLowerCase()}`}>{bookingStatusLabel(r.status)}</span></div>
            ))}
            {reportKind === 'occupancy' && reportData.map((r, i) => (
              <div className="manage-row" key={i}><div><b>{roomTypeLabel(r.room_type)}</b></div><span>{r.rooms} phòng</span><span>{r.bookings} lượt đặt</span></div>
            ))}
            {reportKind === 'customers' && reportData.map((r, i) => (
              <div className="manage-row" key={i}><div><b>{r.full_name}</b><span>{r.email}</span></div><span>{r.bookings} lượt đặt phòng</span><b>{money(r.total_spent)}</b></div>
            ))}
            {reportKind === 'payments' && reportData.map((r, i) => (
              <div className="manage-row" key={i}><div><b>{r.booking_code}</b><span>{paymentTypeLabel(r.type)} · {paymentProviderDisplay(r.provider)}</span></div><b>{money(r.amount)}</b><span className={`status ${(r.status || '').toLowerCase()}`}>{paymentStatusLabel(r.status)}</span></div>
            ))}
            {reportKind === 'cashPayments' && <div className="notice">Tháng {reportMonth}: {reportData.length} giao dịch tiền mặt thành công · Tổng thu {money(reportData.reduce((sum,r)=>sum+Number(r.amount||0),0))}. Chỉ tính khoản đã xác nhận, không gồm giao dịch chuyển khoản hoặc đang chờ duyệt.</div>}
            {reportKind === 'cashPayments' && reportData.map((r, i) => (
              <div className="manage-row" key={r.id||i}><div><b>{r.booking_code} · Phòng {r.room_number||'—'}</b><span>{r.customer||'Khách chưa có tên'} · {paymentTypeLabel(r.type)} · Lễ tân xác nhận: {r.receptionist||'—'}</span></div><span>{date(r.paid_at||r.created_at)}</span><b>{money(r.amount)}</b><span className="status active">Đã xác nhận tiền mặt</span></div>
            ))}
            {!reportData.length && <div className="empty">Chưa có dữ liệu.</div>}
          </div>
        </div>
      )}

      {tab === 'refunds' && (
        <div className="manage-list refund-list">
          <div className="notice">Chỉ Quản lý/Quản trị viên được duyệt và chuyển hoàn tiền. Lễ tân không có quyền hoàn tiền.</div>
          {refunds.map(r => {
            const info = r.refund || r.raw_payload || {};
            return <div className="manage-row" key={r.id}>
              <div><b>{r.booking_code} · Phòng {r.room_number || '—'}</b><span>{r.customer || '—'} · {info.refundMethod === 'CASH' ? 'Nhận tiền mặt' : 'Chuyển khoản'}</span></div>
              <div><b>{money(r.amount)}</b><span>{info.refundBankCode || ''} {info.refundBankAccount ? `· ${info.refundBankAccount}` : '· Chưa có tài khoản'}</span></div>
              <span className={`status ${(r.status || '').toLowerCase()}`}>{r.status === 'PENDING' ? 'Chờ duyệt' : r.status === 'APPROVED' ? 'Đã duyệt — chờ chuyển' : paymentStatusLabel(r.status)}</span>
              {r.status === 'PENDING' && <><button className="btn dark" onClick={() => reviewRefund(r, 'APPROVED')}>Duyệt hoàn tiền</button><button className="btn ghost" onClick={() => reviewRefund(r, 'REJECTED')}>Từ chối</button></>}
              {r.status === 'APPROVED' && info.refundMethod === 'BANK_TRANSFER' && r.refund_qr_url && <div className="refund-qr-card"><b>Quét QR bằng ứng dụng ngân hàng của khách sạn</b><img src={r.refund_qr_url} alt="QR nhận hoàn tiền"/><div>Ngân hàng: <b>{info.refundBankCode}</b><br/>STK: <b>{info.refundBankAccount}</b><br/>Chủ TK: <b>{info.refundAccountName}</b><br/>Nội dung chuyển khoản: <b>PHONG {r.room_number || '—'}</b></div><button className="btn dark" onClick={() => reviewRefund(r, 'SUCCESS')}>Đã chuyển tiền — xác nhận</button></div>}
              {r.status === 'APPROVED' && info.refundMethod === 'CASH' && <button className="btn dark" onClick={() => reviewRefund(r, 'SUCCESS')}>Đã trả tiền mặt — xác nhận</button>}
            </div>;
          })}
          {!refunds.length && <div className="empty">Không có yêu cầu hoàn tiền nào.</div>}
        </div>
      )}

      {tab === 'payroll' && (
        <div className="manage-list payroll-page">
          <div className="payroll-toolbar">
            <label>Tháng<input type="month" value={payrollMonth} onChange={e => setPayrollMonth(e.target.value)} /></label>
            <button className="btn dark" onClick={loadPayroll}>Làm mới</button>
            <button className="btn ghost" onClick={closePayroll}>Chốt công tháng</button>
          </div>
          <div className="attendance-qr-panel">
            <div className="attendance-qr-visual">
              {attendanceQr?.qrDataUrl ? <img src={attendanceQr.qrDataUrl} alt="QR chấm công LUXORA" /> : <div className="attendance-qr-loading">Đang tạo QR…</div>}
              {attendanceQr?.qrDataUrl && <a className="btn dark attendance-qr-download" href={attendanceQr.qrDataUrl} download="LUXORA-QR-cham-cong.png">Tải QR xuống</a>}
            </div>
            <div className="attendance-qr-info">
              <span className="eyebrow">QR CHẤM CÔNG</span>
              <h3>Quét bằng điện thoại</h3>
              <p>Đặt mã QR trên màn hình lớn tại quầy hoặc khu vực chấm công. Lễ tân/Nhân viên dùng Camera điện thoại để quét, mở liên kết LUXORA và đăng nhập tài khoản cá nhân.</p>
              <div className="attendance-qr-timer"><b>{attendanceQrSeconds > 0 ? `Còn ${Math.floor(attendanceQrSeconds / 60)}:${String(attendanceQrSeconds % 60).padStart(2,'0')}` : 'Đang tạo mã mới…'}</b><span>Mỗi mã có hiệu lực 10 phút</span></div>
              <div className="attendance-qr-steps"><span><b>1</b> Mở Camera</span><span><b>2</b> Quét QR</span><span><b>3</b> Đăng nhập</span><span><b>4</b> Tự động chấm vào/ra</span></div>
              <small className="attendance-qr-note">Mã được thiết kế với vùng trắng và mức sửa lỗi phù hợp để camera điện thoại dễ nhận hơn.</small>
            </div>
          </div>
          {payrollMsg && <div className="notice">{payrollMsg}</div>}
          <div className="payroll-section"><div className="module-title"><span>◷</span><div><b>Chấm công</b><small>Nhân viên/lễ tân quét QR bằng điện thoại cá nhân để vào/ra ca.</small></div></div>
            <div className="manage-list">{attendanceData.length ? attendanceData.map(a => <div className="manage-row" key={a.id}><div><b>{a.full_name}</b><span>{a.work_date} · {roleLabel(a.role)}</span></div><div><span>Vào: {a.clock_in ? date(a.clock_in) : '—'}</span><span>Ra: {a.clock_out ? date(a.clock_out) : 'Đang làm'}</span></div><span>{a.clock_in && a.clock_out ? `${Math.max(0,(new Date(a.clock_out)-new Date(a.clock_in))/3600000).toFixed(2)} giờ` : '—'}</span><button className="btn ghost" onClick={() => editAttendance(a)}>Sửa chấm công</button></div>) : <div className="empty">Chưa có dữ liệu chấm công trong tháng này.</div>}</div>
          </div>
          <div className="payroll-section"><div className="module-title"><span>₫</span><div><b>Bảng lương</b><small>Quản lý/Admin nhập mức lương đã thỏa thuận khi tuyển dụng, phụ cấp và bảo hiểm; chấm công được lưu riêng để đối chiếu trước khi chốt.</small></div></div>
            <div className="salary-range-note">
              <b>Mức lương tham khảo theo khảo sát</b>
              <span>Lễ tân: <strong>8–10 triệu/tháng</strong></span>
              <span>Nhân viên dọn phòng: <strong>6–9 triệu/tháng</strong></span>
              <small>Khoảng trên chỉ dùng làm thông tin tham khảo; mức công/ngày thực tế do Quản lý/Admin thiết lập theo nhân sự và thỏa thuận của khách sạn.</small>
            </div>
            <div className="manage-list">{payrollData.items.length ? payrollData.items.map(item => <div className="payroll-card" key={item.user_id}>
              <div><b>{item.full_name}</b><span>{roleLabel(item.role)}</span><small>Mức tham khảo: {salaryRangeLabel(item.role)}</small></div>
              <div><span>Ngày công: <b>{item.work_days ?? 0}</b></span><span>Tổng giờ: <b>{Number(item.total_hours||0).toFixed(2)}</b></span></div>
              <div><span>Lương thỏa thuận: <b>{money(item.payroll_monthly_salary || item.monthly_salary)}</b></span><span>Phụ cấp: <b>{money(Number(item.housing_allowance||0)+Number(item.transport_allowance||0)+Number(item.attendance_bonus||0))}</b></span><span>Thực nhận: <b>{money(item.net_amount || item.gross_amount)}</b></span></div>
              <div><span>Nhà ở: {money(item.housing_allowance)} · Xăng xe: {money(item.transport_allowance)} · Chuyên cần: {money(item.attendance_bonus)}</span><span>BH nhân viên: {money(item.insurance_employee)} · BH khách sạn: {money(item.insurance_employer)}</span><span>{item.bank_code ? `${item.bank_code} · ${item.bank_account} · ${item.account_name}` : 'Chưa khai báo tài khoản nhận lương'}</span><span className={`status ${(item.payment_status||'UNPAID').toLowerCase()}`}>{item.payment_status === 'PAID' ? 'Đã thanh toán' : item.period_status === 'CLOSED' ? 'Chưa thanh toán' : 'Chưa chốt công'}</span></div>
              <div className="payroll-actions"><button className="btn ghost" onClick={() => openSalaryEditor(item)}>Sửa mức lương</button>{item.payment_status !== 'PAID' && item.period_status === 'CLOSED' && <button className="btn dark" onClick={() => payPayroll(item)}>Thanh toán {money(item.net_amount || item.gross_amount)}</button>}</div>
            </div>) : <div className="empty">Chưa có nhân viên/lễ tân hoặc chưa có dữ liệu bảng lương.</div>}</div>
          </div>
        </div>
      )}

      {editingSalary && <div className="payroll-modal-backdrop" onMouseDown={() => setEditingSalary(null)}><form className="payroll-modal" onSubmit={saveSalaryPackage} onMouseDown={e=>e.stopPropagation()}>
        <div className="payroll-modal-head"><div><span className="eyebrow">HỒ SƠ LƯƠNG</span><h3>{editingSalary.full_name}</h3><small>Thay đổi mức lương và phụ cấp cho nhân viên/lễ tân. Mức mới áp dụng cho các kỳ chưa chốt; kỳ đã chốt vẫn giữ nguyên số liệu lịch sử.</small></div><button type="button" className="btn ghost" onClick={()=>setEditingSalary(null)}>Đóng</button></div>
        <div className="payroll-edit-grid">
          <label>Lương thỏa thuận / tháng<input type="number" min="0" step="1000" value={editingSalary.monthlySalary} onChange={e=>setEditingSalary({...editingSalary,monthlySalary:e.target.value})} /></label>
          <label>Phụ cấp nhà ở<input type="number" min="0" step="1000" value={editingSalary.housingAllowance} onChange={e=>setEditingSalary({...editingSalary,housingAllowance:e.target.value})} /></label>
          <label>Phụ cấp xăng xe<input type="number" min="0" step="1000" value={editingSalary.transportAllowance} onChange={e=>setEditingSalary({...editingSalary,transportAllowance:e.target.value})} /></label>
          <label>Chuyên cần<input type="number" min="0" step="1000" value={editingSalary.attendanceBonus} onChange={e=>setEditingSalary({...editingSalary,attendanceBonus:e.target.value})} /></label>
          <label>BH nhân viên khấu trừ<input type="number" min="0" step="1000" value={editingSalary.insuranceEmployee} onChange={e=>setEditingSalary({...editingSalary,insuranceEmployee:e.target.value})} /></label>
          <label>BH khách sạn đóng<input type="number" min="0" step="1000" value={editingSalary.insuranceEmployer} onChange={e=>setEditingSalary({...editingSalary,insuranceEmployer:e.target.value})} /></label>
        </div>
        <div className="payroll-preview"><div><span>Tổng thu nhập</span><b>{money(Number(editingSalary.monthlySalary||0)+Number(editingSalary.housingAllowance||0)+Number(editingSalary.transportAllowance||0)+Number(editingSalary.attendanceBonus||0))}</b></div><div><span>BH nhân viên</span><b>{money(editingSalary.insuranceEmployee)}</b></div><div><span>Thực nhận</span><b>{money(Math.max(0,Number(editingSalary.monthlySalary||0)+Number(editingSalary.housingAllowance||0)+Number(editingSalary.transportAllowance||0)+Number(editingSalary.attendanceBonus||0)-Number(editingSalary.insuranceEmployee||0)))}</b></div><div><span>Chi phí khách sạn</span><b>{money(Number(editingSalary.monthlySalary||0)+Number(editingSalary.housingAllowance||0)+Number(editingSalary.transportAllowance||0)+Number(editingSalary.attendanceBonus||0)+Number(editingSalary.insuranceEmployer||0))}</b></div></div>
        <div className="payroll-modal-actions"><button type="button" className="btn ghost" onClick={()=>setEditingSalary(null)}>Hủy</button><button type="submit" className="btn dark">Lưu mức lương</button></div>
      </form></div>}

      {tab === 'special-prices' && (
        <>
          <div className="section-head"><div><span className="eyebrow">GIÁ PHÒNG</span><h2>Giá ngày lễ / ngày đặc biệt</h2><p className="muted">Giá đặc biệt được áp dụng cho khách đặt mới trong đúng khoảng ngày. Booking đã tạo trước đó vẫn giữ nguyên giá đã chốt.</p></div></div>
          <form onSubmit={createSpecialPrice} className="manage-form">
            <label>Loại phòng<select value={newSpecialPrice.roomTypeId} onChange={e=>setNewSpecialPrice({...newSpecialPrice,roomTypeId:e.target.value})} required><option value="">-- Chọn loại phòng --</option>{uniqueRoomTypes(types).map(t=><option key={t.id} value={t.id}>{roomTypeLabel(t.name,t.description)}</option>)}</select></label>
            <label>Tên đợt giá<input value={newSpecialPrice.name} onChange={e=>setNewSpecialPrice({...newSpecialPrice,name:e.target.value})} placeholder="Ví dụ: Giá lễ 30/4 - 1/5" required /></label>
            <label>Từ ngày<input type="date" value={newSpecialPrice.dateFrom} onChange={e=>setNewSpecialPrice({...newSpecialPrice,dateFrom:e.target.value})} required /></label>
            <label>Đến ngày<input type="date" value={newSpecialPrice.dateTo} onChange={e=>setNewSpecialPrice({...newSpecialPrice,dateTo:e.target.value})} required /></label>
            <label>Giá / đêm<input type="number" min="0" step="1000" value={newSpecialPrice.price} onChange={e=>setNewSpecialPrice({...newSpecialPrice,price:e.target.value})} required /></label>
            <button className="btn dark">Thêm giá đặc biệt</button>
          </form>
          <div className="manage-list">
            {specialPrices.map(x=><div className="manage-row" key={x.id}>
              <div><b>{x.name}</b><span>{roomTypeLabel(x.room_type_name)} · {String(x.date_from).slice(0,10)} → {String(x.date_to).slice(0,10)}</span></div>
              <b>{money(x.price)} / đêm</b>
              <span className={`status ${x.is_active?'success':'muted'}`}>{x.is_active?'Đang áp dụng':'Đã tắt'}</span>
              <button className="btn ghost" onClick={()=>toggleSpecialPrice(x)}>{x.is_active?'Tắt':'Bật'}</button>
              <button className="btn ghost" onClick={()=>deleteSpecialPrice(x.id)}>Xóa</button>
            </div>)}
            {!specialPrices.length && <div className="empty">Chưa có giá ngày đặc biệt.</div>}
          </div>
          <div className="notice" style={{marginTop:16}}>Nếu một đêm nằm trong khoảng giá đặc biệt, hệ thống lấy giá đặc biệt của đêm đó. Các đêm còn lại dùng giá phòng gốc. Không cho tạo hai khoảng giá đang bật bị chồng ngày cho cùng loại phòng.</div>
        </>
      )}

      {tab === 'settings' && (
        <>
          <div className="settings-grid">
            <section className="settings-card settings-time-card">
              <span className="eyebrow">VẬN HÀNH</span><h2>Giới hạn giờ nhận / trả phòng</h2>
              <p>Bật khi LUXORA chạy thật. Khi bật, hệ thống áp dụng check-in từ <b>14:00</b> và check-out đến <b>12:00</b>. Khi tắt, Admin và Quản lý có thể kiểm thử check-in/check-out bất cứ lúc nào.</p>
              <div className="time-mode-row">
                <div>
                  <strong>{operationSettings.time_rules_enabled ? 'ĐANG BẬT — CHẾ ĐỘ CHẠY THẬT' : 'ĐANG TẮT — CHẾ ĐỘ KIỂM THỬ'}</strong>
                  <small>{operationSettings.time_rules_enabled ? 'Khách sạn đang áp dụng đúng khung giờ 14:00 / 12:00.' : 'Chỉ dùng để test nghiệp vụ. Nên bật lại trước khi mở website cho khách.'}</small>
                </div>
                <button type="button" className={`time-toggle ${operationSettings.time_rules_enabled ? 'on' : 'off'}`} onClick={() => toggleTimeRules(!operationSettings.time_rules_enabled)} aria-pressed={operationSettings.time_rules_enabled}>
                  <span className="time-toggle-knob" />
                  <span>{operationSettings.time_rules_enabled ? 'BẬT' : 'TẮT'}</span>
                </button>
              </div>
              <div className="notice">Khuyến nghị: <b>BẬT</b> khi triển khai chính thức; <b>TẮT</b> chỉ trong lúc kiểm thử.</div>
            </section>
            <section className="settings-card settings-time-card">
              <span className="eyebrow">VẬN HÀNH</span><h2>Giới hạn giờ dọn phòng</h2>
              <p>Bật khi LUXORA chạy thật để chỉ cho phép xác nhận <b>Đã dọn xong</b> trong khung <b>12:00–14:00</b>. Tắt khi cần kiểm thử nghiệp vụ ngoài khung giờ này.</p>
              <div className="time-mode-row">
                <div>
                  <strong>{operationSettings.cleaning_rules_enabled ? 'ĐANG BẬT — CHẾ ĐỘ CHẠY THẬT' : 'ĐANG TẮT — CHẾ ĐỘ KIỂM THỬ'}</strong>
                  <small>{operationSettings.cleaning_rules_enabled ? 'Nhân viên/Lễ tân chỉ xác nhận dọn xong từ 12:00 đến trước 14:00.' : 'Chỉ dùng để test. Nhân viên/Lễ tân không có quyền tự thay đổi chế độ này.'}</small>
                </div>
                <button type="button" className={`time-toggle ${operationSettings.cleaning_rules_enabled ? 'on' : 'off'}`} onClick={() => toggleCleaningRules(!operationSettings.cleaning_rules_enabled)} aria-pressed={operationSettings.cleaning_rules_enabled}>
                  <span className="time-toggle-knob" />
                  <span>{operationSettings.cleaning_rules_enabled ? 'BẬT' : 'TẮT'}</span>
                </button>
              </div>
              <div className="notice">Quản lý/Admin là người duy nhất được bật/tắt giới hạn này.</div>
            </section>
            <section className="settings-card">
              <span className="eyebrow">THANH TOÁN</span><h2>Tài khoản nhận chuyển khoản</h2>
              <p>Quản trị viên hoặc Quản lý nhập thông tin tại đây. Khi khách chọn chuyển khoản, hệ thống sẽ tự tạo VietQR theo tài khoản này.</p>
              <form onSubmit={savePaymentSettings} className="manage-form settings-form">
                <label>Ngân hàng / mã BIN<input value={paymentSettings.bank_code} onChange={e => setPaymentSettings({...paymentSettings,bank_code:e.target.value})} placeholder="VCB" required /></label>
                <label>Số tài khoản<input value={paymentSettings.bank_account} onChange={e => setPaymentSettings({...paymentSettings,bank_account:e.target.value})} placeholder="0123456789" required /></label>
                <label>Tên tài khoản<input value={paymentSettings.bank_account_name} onChange={e => setPaymentSettings({...paymentSettings,bank_account_name:e.target.value})} placeholder="LUXORA HOTEL" required /></label>
                <label>Thư điện tử khách sạn<input type="email" value={paymentSettings.hotel_email||''} onChange={e => setPaymentSettings({...paymentSettings,hotel_email:e.target.value})} placeholder="billing@luxora.vn" /></label>
                <button className="btn dark">Lưu cấu hình</button>
              </form>
            </section>
            <section className="settings-card">
              <span className="eyebrow">CẤU HÌNH GỬI THƯ</span><h2>Kiểm tra gửi thư</h2>
              <p>Nhập địa chỉ thư điện tử nhận thử để kiểm tra việc gửi thư trước khi gửi hóa đơn thật.</p>
              <form onSubmit={sendEmailTest} className="manage-form settings-form">
                <label>Địa chỉ thư điện tử nhận thử<input type="email" value={emailTest} onChange={e => setEmailTest(e.target.value)} placeholder="khachhang@luxora.vn" required /></label>
                <button className="btn dark">Gửi thư kiểm tra</button>
              </form>
              {settingsMsg && <div className="notice">{settingsMsg}</div>}
            </section>
          </div>
        </>
      )}

      {tab === 'discounts' && (
        <>
          <form onSubmit={createDiscount} className="manage-form">
            <label>Mã giảm giá<input value={newDiscount.code} onChange={e => setNewDiscount({ ...newDiscount, code: e.target.value })} placeholder="VD: SUMMER10" required /></label>
            <label>% giảm<input type="number" min="1" max="100" value={newDiscount.percentOff} onChange={e => setNewDiscount({ ...newDiscount, percentOff: e.target.value, amountOff: '' })} /></label>
            <label>Hoặc số tiền giảm<input type="number" min="0" value={newDiscount.amountOff} onChange={e => setNewDiscount({ ...newDiscount, amountOff: e.target.value, percentOff: '' })} /></label>
            <label>Giới hạn lượt dùng<input type="number" min="1" value={newDiscount.maxUses} onChange={e => setNewDiscount({ ...newDiscount, maxUses: e.target.value })} placeholder="Không giới hạn" /></label>
            <label>Hiệu lực từ<input type="date" value={newDiscount.validFrom} onChange={e => setNewDiscount({ ...newDiscount, validFrom: e.target.value })} /></label>
            <label>Đến<input type="date" value={newDiscount.validTo} onChange={e => setNewDiscount({ ...newDiscount, validTo: e.target.value })} /></label>
            <button className="btn dark">Tạo mã</button>
          </form>
          <div className="manage-list">
            {discounts.map(d => (
              <div className="manage-row" key={d.id}>
                <div>
                  <b>{d.code}</b>
                  <span>{d.percent_off ? `Giảm ${d.percent_off}%` : `Giảm ${money(d.amount_off)}`} · Đã dùng {d.used_count}{d.max_uses ? `/${d.max_uses}` : ''}</span>
                </div>
                <span>{d.valid_from ? date(d.valid_from) : 'Không giới hạn'} → {d.valid_to ? date(d.valid_to) : 'Không giới hạn'}</span>
                <span className={`status ${d.is_active ? 'active' : 'inactive'}`}>{d.is_active ? 'Đang bật' : 'Đã tắt'}</span>
                <button className="btn ghost" onClick={() => toggleDiscount(d)}>{d.is_active ? 'Tắt' : 'Bật'}</button>
                <button className="btn ghost" onClick={() => deleteDiscount(d.id)}>Xóa</button>
              </div>
            ))}
            {!discounts.length && <div className="empty">Chưa có mã giảm giá nào.</div>}
          </div>
        </>
      )}

      {tab === 'users' && (
        <>
          <h2>Tạo tài khoản quản trị viên</h2>
          <p className="muted" style={{ marginTop: -14, marginBottom: 18, maxWidth: 620 }}>
            Chỉ tạo được tài khoản quyền <b>quản trị viên</b> ở đây. Với Lễ tân/Quản lý: để người đó tự
            đăng ký một tài khoản bình thường, sau đó chọn đúng tài khoản trong danh sách bên
            dưới rồi đổi quyền (role) tương ứng — tránh phải cấp phát mật khẩu tạm cho nhân
            viên, và khi thay đổi nhân sự chỉ cần đổi lại role.
          </p>
          <form onSubmit={createUser} className="manage-form">
            <label>Họ tên<input value={newUser.fullName} onChange={e => setNewUser({ ...newUser, fullName: e.target.value })} required /></label>
            <label>Thư điện tử<input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required /></label>
            <label>Số điện thoại<input value={newUser.phone} onChange={e => setNewUser({ ...newUser, phone: e.target.value })} /></label>
            <label>Mật khẩu (tối thiểu 8 ký tự)<input type="password" minLength={8} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required /></label>
            <button className="btn dark">Tạo tài khoản quản trị viên</button>
            {newUserMsg && <span className="notice" style={{ marginTop: 0 }}>{newUserMsg}</span>}
          </form>

          <h2 style={{ marginTop: 44 }}>Danh sách tài khoản</h2>
          <div className="manage-list">
            {users.map(u => (
              <div className="manage-row" key={u.id}>
                <div><b>{u.full_name}</b><span>{u.email} · {u.phone || '—'}</span></div>
                <select value={u.role} onChange={e => changeRole(u, e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
                <button className="btn ghost" onClick={() => toggleActive(u)}>{u.is_active ? 'Khóa' : 'Mở khóa'}</button>
                <button className="btn ghost" onClick={() => deleteUser(u)}>Xóa</button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'logs' && (
        <div className="manage-list">
          {logs.map(l => (
            <div className="manage-row" key={l.id}>
              <div>
                <b>{auditActionLabel(l.action)}</b>
                <span>{l.actor_name || 'Hệ thống'} · {auditEntityLabel(l.entity_type)}{l.entity_id ? ` · Mã: ${l.entity_id}` : ''}</span>
              </div>
              <span>{date(l.created_at)}</span>
            </div>
          ))}
          {!logs.length && <div className="empty">Chưa có nhật ký nào.</div>}
        </div>
      )}
    </main>
  );
}
