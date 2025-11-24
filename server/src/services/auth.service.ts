import { authenticator } from 'otplib';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { STAFF_ROLES } from '../constants/roles';
import { verifyPassword, hashPassword } from '../utils/password';
import { ProblemDetails } from '../utils/problem';
import { env } from '../config/env';
import { tokenService } from './token.service';

const sanitizeUser = (user: { id: string; email: string; role: Role; first_name: string; last_name: string; is_active: boolean; two_factor_enabled: boolean }) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  first_name: user.first_name,
  last_name: user.last_name,
  is_active: user.is_active,
  two_factor_enabled: user.two_factor_enabled
});

const ensureNotLocked = (user: { locked_until: Date | null }) => {
  if (user.locked_until && user.locked_until > new Date()) {
    const minutes = Math.ceil((user.locked_until.getTime() - Date.now()) / 60000);
    throw new ProblemDetails({ status: 423, title: `Account locked. Try again in ${minutes} minutes.` });
  }
};

const handleFailedAttempt = async (userId: string, currentAttempts: number) => {
  const nextAttempts = currentAttempts + 1;
  if (nextAttempts >= env.LOCKOUT_THRESHOLD) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failed_login_attempts: 0,
        locked_until: new Date(Date.now() + env.LOCKOUT_DURATION_MINUTES * 60000)
      }
    });
    throw new ProblemDetails({ status: 423, title: 'Account locked due to repeated failures.' });
  }

  await prisma.user.update({ where: { id: userId }, data: { failed_login_attempts: nextAttempts } });
};

const resetLockState = async (userId: string) => {
  await prisma.user.update({
    where: { id: userId },
    data: { failed_login_attempts: 0, locked_until: null }
  });
};

export const authService = {
  async staffLogin(params: { email: string; password: string; totp_code?: string; fingerprintHash: string }) {
    const email = params.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !STAFF_ROLES.includes(user.role as any)) {
      throw new ProblemDetails({ status: 401, title: 'Invalid credentials' });
    }

    if (!user.is_active) {
      throw new ProblemDetails({ status: 403, title: 'Account inactive' });
    }

    ensureNotLocked(user);

    const passwordMatch = await verifyPassword(params.password, user.password_hash);
    if (!passwordMatch) {
      await handleFailedAttempt(user.id, user.failed_login_attempts);
      throw new ProblemDetails({ status: 401, title: 'Invalid credentials' });
    }

    if (user.two_factor_enabled) {
      if (!params.totp_code || !user.totp_secret) {
        throw new ProblemDetails({ status: 401, title: '2FA code required' });
      }
      const valid = authenticator.verify({ token: params.totp_code, secret: user.totp_secret });
      if (!valid) {
        throw new ProblemDetails({ status: 401, title: 'Invalid 2FA code' });
      }
    }

    await resetLockState(user.id);

    const tokens = await tokenService.issueForLogin({ id: user.id, role: user.role }, params.fingerprintHash);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: sanitizeUser(user)
    };
  },

  async patientLogin(params: { identifier: string; password: string; fingerprintHash: string }) {
    const raw = params.identifier.trim();
    const isEmail = raw.includes('@');
    const emailIdentifier = raw.toLowerCase();
    const mrnIdentifier = raw.toUpperCase();
    let user = null;

    if (isEmail) {
      user = await prisma.user.findUnique({ where: { email: emailIdentifier } });
    } else {
      const patientProfile = await prisma.patientProfile.findUnique({
        where: { mrn: mrnIdentifier },
        include: { user: true }
      });
      user = patientProfile?.user || null;
    }

    if (!user || user.role !== 'PATIENT') {
      throw new ProblemDetails({ status: 401, title: 'Invalid credentials' });
    }

    if (!user.is_active) {
      throw new ProblemDetails({ status: 403, title: 'Account inactive' });
    }

    ensureNotLocked(user);

    const passwordMatch = await verifyPassword(params.password, user.password_hash);
    if (!passwordMatch) {
      await handleFailedAttempt(user.id, user.failed_login_attempts);
      throw new ProblemDetails({ status: 401, title: 'Invalid credentials' });
    }

    await resetLockState(user.id);

    const tokens = await tokenService.issueForLogin({ id: user.id, role: user.role }, params.fingerprintHash);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: sanitizeUser(user)
    };
  },

  async patientRegister(params: { mrn: string; last_name: string; dob: string; email: string; password: string; fingerprintHash: string }) {
    const mrn = params.mrn.trim().toUpperCase();
    const lastName = params.last_name.trim().toLowerCase();
    const dobDate = new Date(params.dob);

    const patient = await prisma.patientProfile.findUnique({ where: { mrn } });
    if (!patient) {
      throw new ProblemDetails({ status: 404, title: 'Patient not found' });
    }

    if (patient.userId) {
      throw new ProblemDetails({ status: 400, title: 'Patient already registered' });
    }

    if (patient.last_name.toLowerCase() !== lastName) {
      throw new ProblemDetails({ status: 401, title: 'Verification failed' });
    }

    if (patient.dob.toISOString().split('T')[0] !== params.dob) {
      throw new ProblemDetails({ status: 401, title: 'Verification failed' });
    }

    const emailLower = params.email.toLowerCase();
    const existingEmail = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existingEmail) {
      throw new ProblemDetails({ status: 400, title: 'Email already in use' });
    }

    const hashed = await hashPassword(params.password);

    const user = await prisma.user.create({
      data: {
        email: emailLower,
        password_hash: hashed,
        role: 'PATIENT',
        first_name: patient.first_name,
        last_name: patient.last_name,
        dob: patient.dob,
        phone: patient.phone,
        is_active: true
      }
    });

    await prisma.patientProfile.update({ where: { id: patient.id }, data: { userId: user.id } });

    const tokens = await tokenService.issueForLogin({ id: user.id, role: user.role }, params.fingerprintHash);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: sanitizeUser(user)
    };
  },

  async refreshSession(params: { refreshToken: string; fingerprintHash: string }) {
    const rotated = await tokenService.rotate(params.refreshToken, params.fingerprintHash);
    const dbUser = await prisma.user.findUnique({ where: { id: rotated.user.id } });
    if (!dbUser || !dbUser.is_active) {
      throw new ProblemDetails({ status: 401, title: 'User no longer active' });
    }

    return {
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      user: sanitizeUser(dbUser)
    };
  }
};
