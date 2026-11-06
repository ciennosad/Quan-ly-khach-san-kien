import React from 'react';
import {Routes,Route} from 'react-router-dom';
import App from './UngDung.jsx';import Login from './DangNhap.jsx';import Register from './DangKy.jsx';import ForgotPassword from './QuenMatKhau.jsx';import ResetPassword from './DatLaiMatKhau.jsx';import Booking from './DatPhong.jsx';import Account from './TaiKhoan.jsx';
import AdminHome from './TrangQuanTri.jsx';import Reception from './LeTan.jsx';import StaffWorkspace from './NhanVien.jsx';import ProtectedRoute from './BaoVeDuongDan.jsx';import Notifications from './ThongBao.jsx';import SiteHeader from './DauTrang.jsx';

export default function RouterApp({user,onLogin}){
  const shell = (element) => <><SiteHeader user={user} onLogout={onLogin}/><div className="page-with-header">{element}</div></>;
  return <Routes>
    <Route path="/" element={shell(<App user={user} setUser={onLogin}/> )}/>
    <Route path="/login" element={<Login onLogin={onLogin}/>}/>
    <Route path="/register" element={<Register onLogin={onLogin}/>}/>
    <Route path="/forgot-password" element={<ForgotPassword/>}/>
    <Route path="/reset-password" element={<ResetPassword/>}/>
    <Route path="/book" element={shell(<App user={user} setUser={onLogin}/> )}/>
    <Route path="/book/:id" element={shell(<ProtectedRoute user={user} allowedRoles={['CUSTOMER']}><Booking/></ProtectedRoute>)}/>
    <Route path="/account" element={shell(<ProtectedRoute user={user}><Account/></ProtectedRoute>)}/>
    <Route path="/notifications" element={shell(<ProtectedRoute user={user}><Notifications/></ProtectedRoute>)}/>
    <Route path="/reception" element={shell(<ProtectedRoute user={user} allowedRoles={['RECEPTIONIST','MANAGER','ADMIN']}><Reception/></ProtectedRoute>)}/>
    <Route path="/staff" element={shell(<ProtectedRoute user={user} allowedRoles={['STAFF','ADMIN']}><StaffWorkspace user={user}/></ProtectedRoute>)}/>
    <Route path="/admin" element={shell(<ProtectedRoute user={user} allowedRoles={['MANAGER','ADMIN']}><AdminHome/></ProtectedRoute>)}/>
    <Route path="*" element={<App user={user} setUser={onLogin}/>}/>
  </Routes>
}
