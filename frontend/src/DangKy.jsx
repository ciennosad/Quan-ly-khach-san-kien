import {useState} from 'react';import {Link,useNavigate} from 'react-router-dom';import {api} from './KetNoiAPI';

// Trang đăng ký công khai — MỌI người dùng mới (kể cả người sẽ trở thành lễ tân/quản lý
// sau này) đều tự tạo tài khoản ở đây với quyền mặc định là "Khách hàng". Sau khi đăng ký,
// nếu người đó cần làm nhân viên, Admin vào tab "Người dùng" đổi quyền cho đúng tài khoản
// này — không cấp phát mật khẩu tạm cho nhân viên nữa.
export default function Register({onLogin}){
  const nav=useNavigate();
  const [form,setForm]=useState({fullName:'',email:'',phone:'',password:'',confirm:''});
  const [m,setM]=useState('');
  const [busy,setBusy]=useState(false);

  async function go(e){
    e.preventDefault();
    setM('');
    if(form.password.length<8) return setM('Mật khẩu phải có ít nhất 8 ký tự');
    if(form.password!==form.confirm) return setM('Mật khẩu xác nhận không khớp');
    setBusy(true);
    try{
      await api('/auth/register',{method:'POST',body:JSON.stringify({fullName:form.fullName,email:form.email,phone:form.phone,password:form.password})});
      const d=await api('/auth/login',{method:'POST',body:JSON.stringify({email:form.email,password:form.password})});
      localStorage.setItem('accessToken',d.accessToken);
      localStorage.setItem('user',JSON.stringify(d.user));
      onLogin(d.user);
      nav('/');
    }catch(err){ setM(err.message); }
    finally{ setBusy(false); }
  }

  return <div className="auth-page auth-page-card">
    <div className="auth-box auth-card auth-card-register">
      <div className="auth-card-image"><img src="https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1000&q=85" alt="Phòng nghỉ LUXORA HOTEL"/><div className="auth-card-brand"><span className="brand-mark">L</span><span>LUXORA <i>HOTEL</i></span></div></div>
      <div className="auth-card-content">
        <span className="eyebrow">CHÀO MỪNG BẠN</span>
        <h2>Đăng ký</h2>
        <p>Tạo tài khoản để đặt phòng và quản lý kỳ lưu trú của bạn.</p>
        <form onSubmit={go}>
          <label>Họ và tên<input required value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/></label>
          <label>Thư điện tử<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
          <label>Số điện thoại<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
          <label>Mật khẩu<input type="password" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>
          <label>Xác nhận mật khẩu<input type="password" required value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})}/></label>
          <button className="btn dark" disabled={busy}>{busy?'Đang tạo tài khoản...':'Đăng ký'}</button>
        </form>
        <div className="auth-links"><Link to="/login">Đã có tài khoản? Đăng nhập</Link></div>
        {m&&<div className="notice">{m}</div>}
        <button className="back" onClick={()=>nav('/')}>← Về trang chủ</button>
      </div>
    </div>
  </div>;
}
