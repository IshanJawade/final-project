import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRoles } from '../middleware/auth';
import { validateQuery } from '../middleware/validateResource';
import { DoctorListQuerySchema, DoctorListQueryInput } from '../schemas/doctor.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requireRoles('ADMIN', 'RECEPTIONIST', 'DOCTOR'),
  validateQuery(DoctorListQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as DoctorListQueryInput;

      const doctors = await prisma.doctorProfile.findMany({
        where: {
          ...(query.specialization
            ? {
                specialization: {
                  name: { equals: query.specialization, mode: 'insensitive' }
                }
              }
            : {}),
          ...(query.include_inactive
            ? {}
            : {
                user: {
                  is_active: true
                }
              })
        },
        include: {
          user: true,
          specialization: true
        },
        orderBy: {
          user: {
            last_name: 'asc'
          }
        },
        take: query.limit
      });

      res.json({
        data: doctors.map((doctor) => ({
          id: doctor.id,
          user_id: doctor.userId,
          first_name: doctor.user.first_name,
          last_name: doctor.user.last_name,
          specialization_id: doctor.specializationId,
          specialization: doctor.specialization?.name ?? null,
          license_number: doctor.license_number ?? null,
          is_active: doctor.user.is_active
        }))
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
