import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'Authorization header missing' });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Invalid authorization format' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = { id: payload.id, role: payload.role };
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireRole(role) {
  return function roleGuard(req, res, next) {
    if (!req.auth || req.auth.role !== role) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    return next();
  };
}

export const requireUser = requireRole('user');
export const requireMedicalProfessional = requireRole('medical');
export const requireAdmin = requireRole('admin');
