import jwt from 'jsonwebtoken';

export function auth(req,res,next) {
  const h=req.headers.authorization||'';
  const token=h.startsWith('Bearer ')?h.slice(7):null;
  if(!token) return res.status(401).json({message:'Vui lòng đăng nhập'});
  try { req.user=jwt.verify(token,process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({message:'Phiên đăng nhập đã hết hạn'}); }
}

export const roles = (...allowed) => (req,res,next) => {
  if(!allowed.includes(req.user?.role)) return res.status(403).json({message:'Bạn không có quyền thực hiện thao tác này'});
  next();
};
