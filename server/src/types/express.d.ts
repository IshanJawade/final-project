declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      role: import('@prisma/client').Role;
      isTwoFactorVerified?: boolean;
    };
    requestId?: string;
    fingerprintHash?: string;
    ipAddress?: string;
  }
}

export {};
