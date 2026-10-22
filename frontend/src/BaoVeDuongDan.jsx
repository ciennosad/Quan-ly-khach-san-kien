import { Navigate, useLocation } from 'react-router-dom';

// Bọc quanh 1 route để kiểm tra: đã đăng nhập chưa, và có đúng quyền (role) không.
// Khi mở từ QR chấm công mà chưa đăng nhập, giữ nguyên đường dẫn + token để
// sau khi đăng nhập hệ thống tự quay lại trang chấm công và ghi nhận vào/ra ca.
export default function ProtectedRoute({ user, allowedRoles, children }) {
  const location = useLocation();
  if (!user) {
    const returnTo = `${location.pathname}${location.search}${location.hash || ''}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
