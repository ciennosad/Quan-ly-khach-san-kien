import React from 'react';
import {useState} from 'react';import {Link,useNavigate} from 'react-router-dom';import {api} from './KetNoiAPI';

export default function ForgotPassword(){
  const nav=useNavigate();
  const [email,setEmail]=useState('');
  const [sent,setSent]=useState(false);
  const [m,setM]=useState('');
  const [busy,setBusy]=useState(false);

  async function go(e){
    e.preventDefault();
    setBusy(true); setM('');
    try{
      // Backend luôn trả về cùng 1 thông báo dù email có tồn tại hay không (tránh lộ
      // thông tin email nào đã đăng ký), nên UI chỉ cần hiển thị thông báo chung.
      await api('/auth/forgot-password',{method:'POST',body:JSON.stringify({email})});
      setSent(true);
    }catch(err){ setM(err.message); }
    finally{ setBusy(false); }
  }

  return <div className="auth-page">
    <div className="auth-art"><div><span className="eyebrow">LUXORA HOTEL</span><h1>Quên mật khẩu?<br/><em>Không sao cả.</em></h1></div></div>
    <div className="auth-box">
      <span className="eyebrow">RESET PASSWORD</span>
      <h2>Quên mật khẩu</h2>
      {sent ? (
        <>
          <p>Nếu thư điện tử <b>{email}</b> tồn tại trong hệ thống, chúng tôi đã gửi một liên kết đặt lại mật khẩu tới hộp thư của bạn. Liên kết có hiệu lực trong 30 phút và chỉ dùng được một lần.</p>
          <div className="auth-links"><Link to="/login">← Quay lại đăng nhập</Link></div>
        </>
      ) : (
        <>
          <p>Nhập địa chỉ thư điện tử đã đăng ký, chúng tôi sẽ gửi liên kết để bạn đặt lại mật khẩu.</p>
          <form onSubmit={go}>
            <label>Thư điện tử<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
            <button className="btn dark" disabled={busy}>{busy?'Đang gửi...':'Gửi liên kết đặt lại mật khẩu'}</button>
          </form>
          <div className="auth-links"><Link to="/login">← Quay lại đăng nhập</Link></div>
        </>
      )}
      {m&&<div className="notice">{m}</div>}
      <button className="back" onClick={()=>nav('/')}>← Về trang chủ</button>
    </div>
  </div>;
}
