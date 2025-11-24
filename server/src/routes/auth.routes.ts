import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { validateBody } from '../middleware/validateResource';
import { PatientLoginSchema, PatientRegisterSchema, StaffLoginSchema } from '../schemas/auth.schema';
import { authService } from '../services/auth.service';
import { env } from '../config/env';
import { ProblemDetails } from '../utils/problem';
import { tokenService } from '../services/token.service';

const router = Router();
const REFRESH_COOKIE_NAME = 'mrs_refresh_token';

type CookieOptions = Parameters<typeof router['use']>[1];

const buildCookieOptions = (maxAge?: number) => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE_FLAG,
  sameSite: env.COOKIE_SAME_SITE,
  path: '/',
  maxAge: maxAge ?? env.REFRESH_TOKEN_TTL_MS,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
});

const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(REFRESH_COOKIE_NAME, token, buildCookieOptions());
};

const clearRefreshCookie = (res: Response) => {
  res.clearCookie(REFRESH_COOKIE_NAME, buildCookieOptions(0));
};

const ensureFingerprint = (hash?: string) => {
  if (!hash) {
    throw new ProblemDetails({ status: 400, title: 'Missing device fingerprint' });
  }
  return hash;
};

router.post('/staff/login', validateBody(StaffLoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fingerprintHash = ensureFingerprint(req.fingerprintHash);
    const result = await authService.staffLogin({ ...req.body, fingerprintHash });
    setRefreshCookie(res, result.refreshToken);
    res.json({
      access_token: result.accessToken,
      expires_in: Math.floor(env.ACCESS_TOKEN_TTL_MS / 1000),
      user: result.user
    });
  } catch (err) {
    next(err);
  }
});

router.post('/patient/login', validateBody(PatientLoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fingerprintHash = ensureFingerprint(req.fingerprintHash);
    const result = await authService.patientLogin({ ...req.body, fingerprintHash });
    setRefreshCookie(res, result.refreshToken);
    res.json({
      access_token: result.accessToken,
      expires_in: Math.floor(env.ACCESS_TOKEN_TTL_MS / 1000),
      user: result.user
    });
  } catch (err) {
    next(err);
  }
});

router.post('/patient/register', validateBody(PatientRegisterSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fingerprintHash = ensureFingerprint(req.fingerprintHash);
    const result = await authService.patientRegister({ ...req.body, fingerprintHash });
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({
      access_token: result.accessToken,
      expires_in: Math.floor(env.ACCESS_TOKEN_TTL_MS / 1000),
      user: result.user
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fingerprintHash = ensureFingerprint(req.fingerprintHash);
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      throw new ProblemDetails({ status: 401, title: 'Missing refresh token' });
    }
    const result = await authService.refreshSession({ refreshToken, fingerprintHash });
    setRefreshCookie(res, result.refreshToken);
    res.json({
      access_token: result.accessToken,
      expires_in: Math.floor(env.ACCESS_TOKEN_TTL_MS / 1000),
      user: result.user
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { family: string };
      await tokenService.revokeFamily(payload.family);
    } catch (err) {
      // ignore invalid token
    }
  }
  clearRefreshCookie(res);
  res.status(204).send();
});

export default router;
