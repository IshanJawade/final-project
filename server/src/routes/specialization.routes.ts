import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRoles } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', requireRoles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PATIENT'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const specializations = await prisma.specialization.findMany({
      orderBy: { name: 'asc' }
    });

    res.json({
      data: specializations.map((spec) => ({ id: spec.id, name: spec.name }))
    });
  } catch (err) {
    next(err);
  }
});

export default router;
