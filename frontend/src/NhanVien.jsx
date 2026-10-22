import React from 'react';
import { Link } from 'react-router-dom';
import { StaffHousekeepingTab, PayrollTab } from './TaiKhoan.jsx';

export default function StaffWorkspace({ user }) {
  const isAdminPreview = user?.role === 'ADMIN';
  return <main className="page-shell staff-workspace-page">
    <div className="section-head">
      <div>
        <span className="eyebrow">LUXORA · NHÂN VIÊN</span>
        <h1>Khu vực <em>Nhân viên</em></h1>
        <p className="muted">Giao diện gọn để xử lý công việc hằng ngày, đồng bộ cùng phong cách trang chủ LUXORA.</p>
      </div>
      <Link className="btn ghost" to="/">← Về trang chủ</Link>
    </div>

    {isAdminPreview && <div className="notice staff-preview-notice"><b>Chế độ xem của Quản trị viên:</b> bạn đang xem giao diện Nhân viên. Các chức năng chấm công và bảng lương cá nhân chỉ thao tác bằng tài khoản Nhân viên/Lễ tân; phần dọn phòng vẫn dùng đúng chức năng hiện có.</div>}

    <section className="staff-quick-grid">
      <div className="account-card staff-quick-card"><span>♧</span><div><b>Dọn phòng</b><small>Phòng cần dọn sau khi khách trả phòng</small></div></div>
      <div className="account-card staff-quick-card"><span>◷</span><div><b>Chấm công & lương</b><small>QR chấm công, tài khoản nhận lương và bảng lương</small></div></div>
    </section>

    <StaffHousekeepingTab />

    {!isAdminPreview && <PayrollTab user={user} />}
    {isAdminPreview && <section className="account-card staff-locked-card"><div className="module-title"><span>◷</span><div><b>Chấm công & lương</b><small>Phần này dùng theo tài khoản Nhân viên thực tế.</small></div></div><p>Đăng nhập tài khoản Nhân viên để quét QR chấm công, cập nhật tài khoản nhận lương và xem bảng lương cá nhân.</p></section>}
  </main>;
}
