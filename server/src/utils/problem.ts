import { Request, Response, NextFunction } from 'express';

export class ProblemDetails extends Error {
  public status: number;
  public type: string;
  public detail: string;
  public title: string;

  constructor(opts: { status: number; title: string; detail?: string; type?: string }) {
    super(opts.detail || opts.title);
    this.status = opts.status;
    this.title = opts.title;
    this.detail = opts.detail || opts.title;
    this.type = opts.type || 'about:blank';
  }
}

export const problemResponder = (err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || (err instanceof ProblemDetails ? err.status : 500);
  const title = err.title || 'Internal Server Error';
  const detail = err.detail || err.message || 'Unexpected error';
  const type = err.type || 'about:blank';

  if (process.env.NODE_ENV !== 'test') {
    console.error('ProblemDetails', {
      requestId: (req as any).requestId,
      status,
      title,
      detail,
      stack: err.stack
    });
  }

  res.status(status).json({
    type,
    title,
    status,
    detail,
    instance: req.originalUrl,
    request_id: (req as any).requestId
  });
};
