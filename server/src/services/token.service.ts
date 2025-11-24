import jwt, { SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { sha256 } from '../utils/crypto';
import { ProblemDetails } from '../utils/problem';

interface RefreshPayload {
  sub: string;
  role: Role;
  type: 'refresh';
  family: string;
  jti: string;
}

const signAccessToken = (user: { id: string; role: Role }) => {
  const options: SignOptions = { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ sub: user.id, role: user.role, type: 'access' }, env.JWT_ACCESS_SECRET, options);
};

const signRefreshToken = (user: { id: string; role: Role }, family: string, tokenId: string) => {
  const options: SignOptions = { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ sub: user.id, role: user.role, type: 'refresh', family, jti: tokenId }, env.JWT_REFRESH_SECRET, options);
};

const saveTokenRecord = async (params: {
  userId: string;
  token: string;
  familyId: string;
  fingerprintHash: string;
}) => {
  await prisma.refreshToken.create({
    data: {
      userId: params.userId,
      token_hash: sha256(params.token),
      family_id: params.familyId,
      fingerprint_hash: params.fingerprintHash,
      expires_at: new Date(Date.now() + env.REFRESH_TOKEN_TTL_MS)
    }
  });
};

export const tokenService = {
  async issueForLogin(user: { id: string; role: Role }, fingerprintHash: string) {
    const familyId = uuidv4();
    const refreshTokenId = uuidv4();
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user, familyId, refreshTokenId);
    await saveTokenRecord({ userId: user.id, token: refreshToken, familyId, fingerprintHash });
    return { accessToken, refreshToken, familyId };
  },

  async rotate(refreshToken: string, fingerprintHash: string) {
    let payload: RefreshPayload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as RefreshPayload;
    } catch (err) {
      throw new ProblemDetails({ status: 401, title: 'Invalid refresh token' });
    }

    const hashed = sha256(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { token_hash: hashed } });
    if (!stored || stored.revoked_at) {
      throw new ProblemDetails({ status: 401, title: 'Refresh token revoked' });
    }

    if (stored.fingerprint_hash !== fingerprintHash) {
      await prisma.refreshToken.update({
        where: { token_hash: hashed },
        data: { revoked_at: new Date(), revoked_reason: 'fingerprint-mismatch' }
      });
      throw new ProblemDetails({ status: 401, title: 'Fingerprint mismatch' });
    }

    if (stored.expires_at < new Date()) {
      await prisma.refreshToken.update({
        where: { token_hash: hashed },
        data: { revoked_at: new Date(), revoked_reason: 'expired' }
      });
      throw new ProblemDetails({ status: 401, title: 'Refresh token expired' });
    }

    await prisma.refreshToken.update({
      where: { token_hash: hashed },
      data: { revoked_at: new Date(), revoked_reason: 'rotated' }
    });

    const user = { id: payload.sub, role: payload.role };
    const newTokenId = uuidv4();
    const newRefreshToken = signRefreshToken(user, payload.family, newTokenId);
    await saveTokenRecord({ userId: user.id, token: newRefreshToken, familyId: payload.family, fingerprintHash });
    const accessToken = signAccessToken(user);

    return { accessToken, refreshToken: newRefreshToken, familyId: payload.family, user };
  },

  async revokeFamily(familyId: string) {
    await prisma.refreshToken.updateMany({
      where: { family_id: familyId, revoked_at: null },
      data: { revoked_at: new Date(), revoked_reason: 'logout' }
    });
  }
};
