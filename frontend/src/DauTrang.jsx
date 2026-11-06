import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, logout, date } from './KetNoiAPI';

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5v-9Z',
  room: 'M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14M4 12h16M7 8h3M7 16h3',
  booking: 'M6 3v3M18 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  service: 'M4 7h16M5 7l1 13h12l1-13M8 7V5a4 4 0 0 1 8 0v2',
  info: 'M12 17v-5M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  manage: 'M4 5h16v14H4zM8 9h2M14 9h2M8 13h8M8 17h5',
  reception: 'M5 20v-8a7 7 0 0 1 14 0v8M8 20v-4h8v4M9 8a3 3 0 0 1 6 0',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM18 18h2v2h-2zM14 18h2v2h-2z',
  clean: 'M5 20h14M7 20l1-8h8l1 8M9 8h6M10 5h4v3h-4zM12 12v8',
  payment: 'M3 7h18v12H3zM3 10h18M7 15h4',
  id: 'M5 4h14v16H5zM8 8h5M8 12h8M8 16h6',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.2 2.2-2.6-.6-.6-2.6z',
  chart: 'M5 19V9M12 19V5M19 19v-7M3 19h18',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  chevron: 'm7 10 5 5 5-5',
  logout: 'M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-5',
  back: 'M19 12H5M11 6l-6 6 6 6',
};

function Icon({ name, size = 16 }) {
  return <svg className="nav-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] || ICONS.info} /></svg>;
}

function NavItem({ to, icon, children, active, onClick }) {
  return <Link className={`nav-item ${active ? 'active' : ''}`} to={to} onClick={onClick}><Icon name={icon}/><span>{children}</span></Link>;
}

function NavGroup({ label, icon, items, open, onToggle, onNavigate }) {
  return <div className={`nav-group ${open ? 'open' : ''}`}>
    <button className="nav-group-trigger" onClick={onToggle} aria-expanded={open}>
      <Icon name={icon}/><span>{label}</span><Icon name="chevron" size={14}/>
    </button>
    {open && <div className="nav-dropdown">
      {items.map((item, i) => <Link key={`${item.label}-${i}`} to={item.to} onClick={onNavigate} className="nav-dropdown-item">
        <Icon name={item.icon || 'manage'} size={15}/><span>{item.label}</span>
      </Link>)}
    </div>}
  </div>;
}

export default function SiteHeader({ user, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const bellRef = useRef(null);
  const navRef = useRef(null);
  const location = useLocation();
  const nav = useNavigate();

  const loadNotifications = async () => {
    if (!user || !localStorage.getItem('accessToken')) { setItems([]); setUnreadCount(0); return; }
    try {
      const list = await api('/notifications?unread=1');
      setItems(Array.isArray(list) ? list : []);
      setUnreadCount(Array.isArray(list) ? list.length : 0);
    } catch (_) { setItems([]); setUnreadCount(0); }
  };

  useEffect(() => { loadNotifications(); }, [user]);
  useEffect(() => {
    const close = e => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
      if (navRef.current && !navRef.current.contains(e.target)) setOpenGroup(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => { setMenuOpen(false); setBellOpen(false); setOpenGroup(null); }, [location.pathname, location.search]);

  async function openNotification(n) {
    try { await api(`/notifications/${n.id}/read`, { method: 'POST' }); } catch (_) {}
    setItems(list => list.filter(x => x.id !== n.id));
    setUnreadCount(c => Math.max(0, c - 1));
    setBellOpen(false);
    if (n.link) nav(n.link);
  }

  async function markAllRead() {
    if (!items.length) return;
    try { await api('/notifications/read-all', { method: 'POST' }); } catch (_) {}
    setItems([]); setUnreadCount(0);
  }

  async function doLogout() {
    await logout();
    setMenuOpen(false); setBellOpen(false); setOpenGroup(null); setItems([]); setUnreadCount(0);
    onLogout?.(null);
  }

  const isHome = location.pathname === '/';
  const goHomeTop = () => {
    setMenuOpen(false); setOpenGroup(null); setBellOpen(false);
    if (!isHome) {
      nav('/');
      window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' }), 120);
      window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' }), 360);
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  };
  const scrollTo = id => {
    setMenuOpen(false); setOpenGroup(null);
    if (!isHome) { nav('/'); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 80); }
    else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollAccountSection = id => {
    setMenuOpen(false); setOpenGroup(null);
    const target = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nav('/account?tab=rooms#' + id);
    setTimeout(target, 120);
    setTimeout(target, 360);
  };
  const openCustomerTab = tab => {
    setMenuOpen(false); setOpenGroup(null);
    nav(`/account?tab=${tab}`);
  };

  const scrollBooking = () => {
    setMenuOpen(false); setOpenGroup(null);
    const target = () => document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!isHome) { nav('/book'); setTimeout(target, 120); setTimeout(target, 360); }
    else target();
  };

  const go = (to) => { setOpenGroup(null); setMenuOpen(false); return to; };

  const role = user?.role;
  const isDashboardPage = ['/account','/admin','/reception','/notifications','/book'].some(p => location.pathname.startsWith(p));
  const isStaff = ['RECEPTIONIST', 'MANAGER', 'ADMIN', 'STAFF'].includes(role);
  const isReception = ['RECEPTIONIST', 'MANAGER', 'ADMIN'].includes(role);
  const isHousekeepingStaff = role === 'STAFF';
  const isManager = ['MANAGER', 'ADMIN'].includes(role);

  const receptionItems = [
    { label: 'Nhận phòng / Trả phòng', to: '/reception?tab=checkin', icon: 'qr' },
    { label: 'Dọn phòng', to: '/reception?tab=housekeeping', icon: 'clean' },
    ...(['ADMIN','RECEPTIONIST'].includes(role) ? [{ label: 'Duyệt thanh toán', to: '/reception?tab=payments', icon: 'payment' }] : []),
    { label: 'Hóa đơn', to: '/reception?tab=invoice', icon: 'payment' },
  ];
  const adminCoreItems = [
    { label: 'Tổng quan', to: '/admin?tab=dashboard', icon: 'chart' },
    { label: 'Phòng', to: '/admin?tab=rooms', icon: 'room' },
    { label: 'Dịch vụ', to: '/admin?tab=services', icon: 'service' },
    { label: 'Hoàn tiền', to: '/admin?tab=refunds', icon: 'payment' },
    ...(isManager ? [{ label: 'Chấm công & lương', to: '/admin?tab=payroll', icon: 'manage' }] : []),
    { label: 'Mã giảm giá', to: '/admin?tab=discounts', icon: 'booking' },
    ...(user?.role === 'ADMIN' ? [{ label: 'Người dùng', to: '/admin?tab=users', icon: 'user' }] : []),
    { label: 'Nhật ký hoạt động', to: '/admin?tab=logs', icon: 'manage' },
  ];
  const directAdminItems = [
    { label: 'Thanh toán & Thư điện tử', to: '/admin?tab=settings', icon: 'payment' },
    { label: 'Bảo trì', to: '/admin?tab=maintenance', icon: 'wrench' },
    { label: 'Báo cáo', to: '/admin?tab=reports', icon: 'chart' },
  ];

  return <>
    <header className="site-header">
      <Link to="/" className="brand site-brand" onClick={() => { setMenuOpen(false); setOpenGroup(null); }}>
        <span className="brand-mark">L</span><span>LUXORA <i>HOTEL</i></span>
      </Link>

      <nav className="desktop-nav" ref={navRef}>
        <NavItem to="/" icon="home" active={isHome} onClick={e => { e.preventDefault(); goHomeTop(); }}>Trang chủ</NavItem>
        <button className="nav-item" onClick={() => scrollTo('rooms')}><Icon name="room"/><span>Phòng</span></button>
        <button className="nav-item" onClick={() => scrollTo('services')}><Icon name="service"/><span>Dịch vụ</span></button>
        <button className="nav-item" onClick={() => scrollTo('contact')}><Icon name="info"/><span>Liên hệ</span></button>

        {user?.role === 'CUSTOMER' ? <>
          <button className="nav-item" onClick={scrollBooking}><Icon name="booking"/><span>Đặt phòng</span></button>
          <NavItem to="/account?tab=rooms" icon="room" active={location.pathname === '/account' && new URLSearchParams(location.search).get('tab') === 'rooms'}>Phòng của tôi</NavItem>
          <button className="nav-item" onClick={() => openCustomerTab('invoices')}><Icon name="payment"/><span>Hóa đơn</span></button>
          <button className="nav-item" onClick={() => openCustomerTab('refunds')}><Icon name="payment"/><span>Hoàn tiền</span></button>
          <button className="nav-item" onClick={() => openCustomerTab('history')}><Icon name="manage"/><span>Lịch sử</span></button>
        </> : <>
          {(user?.role === 'ADMIN' || user?.role === 'MANAGER') && <NavGroup
            label="Quản lý" icon="manage" items={adminCoreItems.concat(directAdminItems)}
            open={openGroup === 'admin'}
            onToggle={() => setOpenGroup(openGroup === 'admin' ? null : 'admin')}
            onNavigate={() => go('/')}
          />}

          {(user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'RECEPTIONIST') && <NavGroup
            label="Lễ tân" icon="reception"
            items={receptionItems.concat(['RECEPTIONIST','ADMIN'].includes(user?.role) ? [{label:'Chấm công & lương',to:'/account?tab=attendance',icon:'manage'}] : [])}
            open={openGroup === 'reception'}
            onToggle={() => setOpenGroup(openGroup === 'reception' ? null : 'reception')}
            onNavigate={() => go('/')}
          />}

          {user?.role === 'ADMIN' && <NavItem to="/staff" icon="clean" active={location.pathname.startsWith('/staff')}>Nhân viên</NavItem>}

          {user?.role === 'STAFF' && <NavGroup
            label="Nhân viên" icon="clean" items={[
              {label:'Dọn phòng',to:'/account?tab=housekeeping',icon:'clean'},
              {label:'Chấm công & lương',to:'/account?tab=attendance',icon:'manage'}
            ]}
            open={openGroup === 'staff'}
            onToggle={() => setOpenGroup(openGroup === 'staff' ? null : 'staff')}
            onNavigate={() => go('/')}
          />}
        </>}
      </nav>

      <div className="header-actions">
        {user && <div className="notification-wrap" ref={bellRef}>
          <button className={`icon-btn bell-btn ${bellOpen ? 'active' : ''}`} aria-label="Thông báo" onClick={() => { setBellOpen(v => !v); if (!bellOpen) loadNotifications(); }}>
            <Icon name="bell" size={17}/>{unreadCount > 0 && <b>{unreadCount > 99 ? '99+' : unreadCount}</b>}
          </button>
          {bellOpen && <div className="notification-popover">
            <div className="notification-popover-head"><strong>Thông báo</strong>{items.length > 0 && <button onClick={markAllRead}>Đọc tất cả</button>}</div>
            {items.length ? items.slice(0, 8).map(n => <button className="notification-item" key={n.id} onClick={() => openNotification(n)}><span className="notification-item-dot"/><span><strong>{n.title}</strong><small>{n.message}</small><em>{date(n.created_at)}</em></span></button>) : <div className="notification-empty">Không có thông báo mới.</div>}
            <Link className="notification-footer" to="/notifications">Xem tất cả thông báo →</Link>
          </div>}
        </div>}

        {user ? <div className="desktop-account">
          <Link to="/account"><span className="account-avatar"><Icon name="user" size={15}/></span><span className="account-name">{user.fullName || user.email}</span><span className="account-chevron">⌄</span></Link>
          <div className="account-menu">
            {isManager && <Link to="/admin">Quản lý</Link>}
            {isReception && <Link to="/reception">Lễ tân</Link>}
            {role === 'ADMIN' && <Link to="/staff">Nhân viên</Link>}
            <Link to="/account">Tài khoản</Link>
            {['STAFF','RECEPTIONIST'].includes(role) && <Link to="/account?tab=attendance">Chấm công & lương</Link>}
            <button onClick={doLogout}>Đăng xuất</button>
          </div>
        </div> : <Link className="header-login" to="/login">Đăng nhập</Link>}

        <button className="mobile-menu-btn" aria-label="Mở menu" onClick={() => setMenuOpen(true)}><span/><span/><span/></button>
      </div>
    </header>

    {menuOpen && <>
      <button className="mobile-menu-overlay" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}/>
      <aside className="mobile-drawer">
        <div className="drawer-head"><Link to="/" className="brand" onClick={() => setMenuOpen(false)}><span className="brand-mark">L</span><span>LUXORA <i>HOTEL</i></span></Link><button onClick={() => setMenuOpen(false)}>×</button></div>
        <Link to="/" onClick={e => { e.preventDefault(); goHomeTop(); }}><Icon name="home"/>Trang chủ</Link>
        <button onClick={() => scrollTo('rooms')}><Icon name="room"/>Phòng</button>
        <button onClick={() => scrollTo('services')}><Icon name="service"/>Dịch vụ</button>
        <button onClick={() => scrollTo('contact')}><Icon name="info"/>Liên hệ</button>
        {user && <>
          <div className="drawer-section">{role === 'CUSTOMER' ? 'TÀI KHOẢN' : role === 'RECEPTIONIST' ? 'LỄ TÂN' : role === 'MANAGER' ? 'QUẢN LÝ' : role === 'ADMIN' ? 'QUẢN LÝ' : 'NHÂN VIÊN'}</div>
          {(role === 'ADMIN' || role === 'MANAGER') && <div className="drawer-role-links">
            <Link to="/admin" onClick={() => setMenuOpen(false)}><Icon name="manage"/>Quản lý</Link>
            <Link to="/reception" onClick={() => setMenuOpen(false)}><Icon name="reception"/>Lễ tân</Link>
            {role === 'ADMIN' && <Link to="/staff" onClick={() => setMenuOpen(false)}><Icon name="clean"/>Nhân viên</Link>}
          </div>}
          {(role === 'CUSTOMER' ? [
            {label:'Phòng của tôi',to:'/account?tab=rooms',icon:'room'}, {label:'Dịch vụ',to:'/account?tab=rooms#my-room-services',icon:'service'}, {label:'Hồ sơ',to:'/account?tab=profile',icon:'user'},
            {label:'Bảo mật',to:'/account?tab=security',icon:'manage'}
          ] : role === 'RECEPTIONIST' ? receptionItems.concat([{label:'Chấm công & lương',to:'/account?tab=attendance',icon:'manage'}]) : role === 'STAFF' ? [
            {label:'Dọn phòng',to:'/account?tab=housekeeping',icon:'clean'}, {label:'Chấm công & lương',to:'/account?tab=attendance',icon:'manage'}
          ] : role === 'MANAGER' || role === 'ADMIN' ? adminCoreItems.concat(directAdminItems) : []).map(item => <Link key={item.label} to={item.to} onClick={() => setMenuOpen(false)}><Icon name={item.icon}/>{item.label}</Link>)}
          {role === 'MANAGER' && <Link to="/reception" onClick={() => setMenuOpen(false)}><Icon name="reception"/>Lễ tân</Link>}
          {role === 'CUSTOMER' && <>
            <button onClick={scrollBooking}><Icon name="booking"/>Đặt phòng</button>
            <button onClick={() => openCustomerTab('invoices')}><Icon name="payment"/>Hóa đơn</button>
            <button onClick={() => openCustomerTab('refunds')}><Icon name="payment"/>Hoàn tiền</button>
            <button onClick={() => openCustomerTab('history')}><Icon name="manage"/>Lịch sử</button>
          </>}
          <Link to="/notifications" onClick={() => setMenuOpen(false)}><Icon name="bell"/>Thông báo {unreadCount > 0 && <b className="drawer-badge">{unreadCount}</b>}</Link>
          <button onClick={doLogout}><Icon name="logout"/>Đăng xuất</button>
        </>}
        {!user && <Link to="/login" onClick={() => setMenuOpen(false)}>Đăng nhập</Link>}
      </aside>
    </>}
  </>;
}
