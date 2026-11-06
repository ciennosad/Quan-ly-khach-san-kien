import { useEffect, useState } from 'react';
import { api, money, serviceDisplay } from './KetNoiAPI';

function RobotIcon({ size = 26 }) {
  return <svg className="luxora-robot-icon" width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M24 7v5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
    <circle cx="24" cy="5" r="2.2" fill="currentColor"/>
    <rect x="8" y="12" width="32" height="27" rx="8" fill="#F7EFE7" stroke="currentColor" strokeWidth="2.4"/>
    <rect x="14" y="19" width="20" height="11" rx="4" fill="#FFFFFF" stroke="currentColor" strokeWidth="2"/>
    <circle cx="20" cy="24.5" r="2" fill="#7A5336"/>
    <circle cx="28" cy="24.5" r="2" fill="#7A5336"/>
    <path d="M20 34c2.2 1.8 5.8 1.8 8 0" stroke="#7A5336" strokeWidth="2" strokeLinecap="round"/>
    <path d="M8 23H5M40 23h3M13 39v4M35 39v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
  </svg>;
}

export default function ChatBot(){
  const [open,setOpen]=useState(false);
  const [input,setInput]=useState('');
  const [messages,setMessages]=useState([{role:'bot',text:'Xin chào! Mình là trợ lý LUXORA. Bạn có thể hỏi về phòng, sức chứa, giá, dịch vụ hoặc giờ nhận/trả phòng.'}]);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    const openChat=()=>setOpen(true);
    window.addEventListener('luxora:open-chat',openChat);
    return ()=>window.removeEventListener('luxora:open-chat',openChat);
  },[]);
  async function send(text=input){
    const value=String(text||'').trim(); if(!value||loading)return;
    setInput(''); setMessages(m=>[...m,{role:'user',text:value}]); setLoading(true);
    try{
      const history=messages.slice(-8).map(m=>({role:m.role==='bot'?'assistant':'user',content:m.text}));
      const r=await api('/chatbot',{method:'POST',body:JSON.stringify({message:value,history})});
      setMessages(m=>[...m,{role:'bot',text:r.answer,suggestions:r.suggestions||[]}]);
    }catch(e){setMessages(m=>[...m,{role:'bot',text:`Mình chưa thể tra cứu lúc này. ${e.message}`}]);}
    finally{setLoading(false)}
  }
  return <>
    {open && <section className="luxora-chatbot" aria-label="Trợ lý LUXORA">
      <header><div className="chatbot-brand"><span className="chatbot-robot-badge"><RobotIcon size={25}/></span><span><b>Robot LUXORA</b><small>Trợ lý khách sạn · tư vấn phòng & dịch vụ</small></span></div><button onClick={()=>setOpen(false)} aria-label="Đóng">×</button></header>
      <div className="chatbot-body">
        {messages.map((m,i)=><div className={`chat-message ${m.role}`} key={i}><div>{m.text}</div>{m.suggestions?.length>0&&<div className="chat-suggestions">{m.suggestions.map((s,j)=>{const display=serviceDisplay(s);return <div className="chat-suggestion" key={j}><b>{display.name}</b>{s.capacity&&<span>Tối đa {s.capacity} khách</span>}{s.price!=null&&<strong>{money(s.price)}{s.capacity?'/đêm':''}</strong>}{display.description&&<small>{display.description}</small>}</div>})}</div>}</div>)}
        {loading&&<div className="chat-message bot"><div>Đang tra cứu thông tin LUXORA…</div></div>}
      </div>
      <div className="chatbot-quick"><button onClick={()=>send('Nhà tôi có 4 người nên chọn phòng nào?')}>👨‍👩‍👧 4 người</button><button onClick={()=>send('LUXORA có những loại phòng nào?')}>🛏️ Loại phòng</button><button onClick={()=>send('Khách sạn nhận phòng lúc mấy giờ?')}>🕑 Giờ nhận/trả</button></div>
      <form className="chatbot-input" onSubmit={e=>{e.preventDefault();send()}}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Hỏi về khách sạn…"/><button disabled={loading}>➤</button></form>
    </section>}
    <button className={`luxora-chatbot-fab ${open?'active':''}`} onClick={()=>setOpen(v=>!v)} aria-label="Mở chatbot">{open?<span className="chatbot-close">×</span>:<RobotIcon size={32}/>}</button>
  </>;
}
