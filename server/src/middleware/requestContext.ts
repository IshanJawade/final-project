import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const requestContext = (req: Request, _res: Response, next: NextFunction) => {
  req.requestId = uuidv4();
  req.ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  next();
};
