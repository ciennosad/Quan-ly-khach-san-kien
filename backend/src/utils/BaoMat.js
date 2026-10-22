import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');

export function accessToken(user) {
  return jwt.sign(
    { sub:user.id, role:user.role, email:user.email, fullName:user.full_name },
    process.env.JWT_SECRET,
    { expiresIn:'15m' }
  );
}

export function refreshToken(user) {
  return jwt.sign({ sub:user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn:'7d' });
}
