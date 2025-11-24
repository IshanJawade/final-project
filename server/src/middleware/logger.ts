import { NextFunction, Request, Response } from 'express';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, originalUrl } = req;
  res.on('finish', () => {
    const duration = Date.now() - start;
    const payload = {
      ts: new Date().toISOString(),
      requestId: req.requestId,
      method,
      url: originalUrl,
      status: res.statusCode,
      duration_ms: duration
    };
    console.log(JSON.stringify(payload));
  });
  next();
};
