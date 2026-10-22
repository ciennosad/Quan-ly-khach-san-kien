import {useState} from 'react';import {Link,useNavigate,useSearchParams} from 'react-router-dom';import {api} from './KetNoiAPI';

export default function ResetPassword(){
  const nav=useNavigate();
  const [params]=useSearchParams();
  const token=params.get('token')||'';
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [done,setDone]=useState(false);
  const [m,setM]=useState('');
  const [busy,setBusy]=useState(false);

  async function go(e){
    e.preventDefault();
    setM('');
    if(password.length<8) return setM('Mật khẩu mới phải có ít nhất 8 ký tự');
    if(password!==confirm) return setM('Mật khẩu xác nhận không khớp');
    setBusy(true);
    try{
      await api('/auth/reset-password',{method:'POST',body:JSON.stringify({token,password})});
      setDone(true);
    }catch(err){ setM(err.message); }
    finally{ setBusy(false); }
  }

  if(!token){
    return <div className="auth-page"><div className="auth-art"><div><span className="eyebrow">LUXORA HOTEL</span><h1>Liên kết<br/><em>không hợp lệ.</em></h1></div></div>
      <div className="auth-box"><span className="eyebrow">RESET PASSWORD</span><h2>Thiếu token</h2>
      <p>Liên kết đặt lại mật khẩu không hợp lệ. Vui lòng mở lại liên kết trong thư điện tử, hoặc yêu cầu gửi lại.</p>
      <div className="auth-links"><Link to="/forgot-password">Gửi lại thư điện tử đặt lại mật khẩu</Link></div></div></div>;
  }

  return <div className="auth-page">
    <div className="auth-art"><div><span className="eyebrow">LUXORA HOTEL</span><h1>Đặt mật khẩu<br/><em>mới.</em></h1></div></div>
    <div className="auth-box">
      <span className="eyebrow">RESET PASSWORD</span>
      <h2>Đặt lại mật khẩu</h2>
      {done ? (
        <>
          <p>Đổi mật khẩu thành công! Bạn có thể đăng nhập lại bằng mật khẩu mới.</p>
          <button className="btn dark" onClick={()=>nav('/login')}>Đến trang đăng nhập</button>
        </>
      ) : (
        <>
          <p>Nhập mật khẩu mới cho tài khoản của bạn.</p>
          <form onSubmit={go}>
            <label>Mật khẩu mới<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
            <label>Xác nhận mật khẩu mới<input type="password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
            <button className="btn dark" disabled={busy}>{busy?'Đang lưu...':'Đặt lại mật khẩu'}</button>
          </form>
        </>
      )}
      {m&&<div className="notice">{m}</div>}
      <button className="back" onClick={()=>nav('/')}>← Về trang chủ</button>
    </div>
  </div>;
}
