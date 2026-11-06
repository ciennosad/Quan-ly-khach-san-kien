import React from 'react';
import {useState} from 'react';import {Link,useNavigate,useSearchParams} from 'react-router-dom';import {api} from './KetNoiAPI';
export default function Login({onLogin}){const nav=useNavigate();const [searchParams]=useSearchParams();const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [m,setM]=useState('');
async function go(e){e.preventDefault();try{const d=await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem('accessToken',d.accessToken);localStorage.setItem('refreshToken',d.refreshToken);localStorage.setItem('user',JSON.stringify(d.user));onLogin(d.user);const rawReturn=searchParams.get('returnTo')||'/';const target=(rawReturn.startsWith('/')&&!rawReturn.startsWith('//'))?rawReturn:'/';nav(target)}catch(e){setM(e.message)}}
return <div className="auth-page auth-page-card">
  <div className="auth-box auth-card">
    <div className="auth-card-image"><img src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1000&q=85" alt="Không gian LUXORA HOTEL"/><div className="auth-card-brand"><span className="brand-mark">L</span><span>LUXORA <i>HOTEL</i></span></div></div>
    <div className="auth-card-content">
      <span className="eyebrow">CHÀO MỪNG TRỞ LẠI</span><h2>Đăng nhập</h2><p>Truy cập thông tin đặt phòng và quản lý kỳ lưu trú của bạn.</p>
      <form onSubmit={go}><label>Thư điện tử<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Mật khẩu<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="btn dark">Đăng nhập</button></form>
      {m&&<div className="notice">{m}</div>}
      <div className="auth-links"><Link to="/register">Chưa có tài khoản? Đăng ký</Link><Link to="/forgot-password">Quên mật khẩu?</Link></div>
      <button className="back" onClick={()=>nav('/')}>← Về trang chủ</button>
    </div>
  </div>
</div>}
