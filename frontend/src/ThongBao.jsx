import React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, date } from './KetNoiAPI';

export default function Notifications() {
  const [items, setItems] = useState([]);
  const nav = useNavigate();

  const load = () => api('/notifications').then(setItems);
  useEffect(() => { load(); }, []);

  async function open(n) {
    if (!n.is_read) await api(`/notifications/${n.id}/read`, { method: 'POST' });
    setItems(list => list.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    if (n.link) nav(n.link);
  }

  async function markAllRead() {
    await api('/notifications/read-all', { method: 'POST' });
    setItems(list => list.map(x => ({ ...x, is_read: true })));
  }

  const unread = items.filter(n => !n.is_read).length;

  return (
    <main className="account">
      <div className="section-head"><div><span className="eyebrow">THÔNG BÁO</span><h1>Thông báo <em>của bạn</em></h1></div></div>

      {unread > 0 && (
        <div className="tab-row">
          <button className="text-link" onClick={markAllRead}>Đánh dấu tất cả đã đọc ({unread})</button>
        </div>
      )}

      <div className="manage-list">
        {items.map(n => (
          <div className={`manage-row notif-row${n.is_read ? '' : ' unread'}`} key={n.id} onClick={() => open(n)} style={{ cursor: n.link ? 'pointer' : 'default' }}>
            <div>
              <b>{n.title}</b>
              <span>{n.message}</span>
            </div>
            <span>{date(n.created_at)}</span>
            {!n.is_read && <span className="dot" />}
          </div>
        ))}
        {!items.length && <div className="empty">Bạn chưa có thông báo nào.</div>}
      </div>
    </main>
  );
}
