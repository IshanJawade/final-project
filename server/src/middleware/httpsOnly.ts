import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

export const enforceHttps = (req: Request, res: Response, next: NextFunction) => {
  if (!env.HTTPS_ONLY) {
    return next();
  }
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (!isSecure) {
    return res.status(400).json({
      type: 'about:blank',
      title: 'HTTPS required',
      status: 400,
      detail: 'Use HTTPS for all requests.'
    });
  }
  next();
};
