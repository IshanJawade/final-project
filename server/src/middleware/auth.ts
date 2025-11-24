import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import { ProblemDetails } from '../utils/problem';

interface AccessPayload {
  sub: string;
  role: Role;
  type: 'access';
}

export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new ProblemDetails({ status: 401, title: 'Missing Authorization header' }));
  }

  const token = header.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    next(new ProblemDetails({ status: 401, title: 'Invalid or expired access token' }));
  }
};

export const requireRoles = (...roles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ProblemDetails({ status: 401, title: 'Not authenticated' }));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ProblemDetails({ status: 403, title: 'Insufficient role' }));
    }
    next();
  };
};
