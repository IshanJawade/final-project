import { NextFunction, Request, Response } from 'express';
import { sha256 } from '../utils/crypto';

export const fingerprint = (req: Request, _res: Response, next: NextFunction) => {
  const explicit = req.headers['x-device-fingerprint'] as string | undefined;
  const base = explicit || `${req.ipAddress || req.socket.remoteAddress || 'unknown'}::${req.headers['user-agent'] || 'unknown'}`;
  req.fingerprintHash = sha256(base);
  next();
};
