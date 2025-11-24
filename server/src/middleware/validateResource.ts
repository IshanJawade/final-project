import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';
import { ProblemDetails } from '../utils/problem';

export const validateBody = (schema: ZodTypeAny) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err: any) {
      next(
        new ProblemDetails({
          status: 400,
          title: 'Invalid request body',
          detail: err.errors?.map((e: any) => e.message).join(', ') || 'Validation failed'
        })
      );
    }
  };
};

export const validateQuery = (schema: ZodTypeAny) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (err: any) {
      next(
        new ProblemDetails({
          status: 400,
          title: 'Invalid query parameters',
          detail: err.errors?.map((e: any) => e.message).join(', ') || 'Validation failed'
        })
      );
    }
  };
};
