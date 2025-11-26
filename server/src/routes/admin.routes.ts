import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRoles } from '../middleware/auth';
import { validateBody } from '../middleware/validateResource';
import { CreateStaffSchema, CreateStaffInput } from '../schemas/admin.schema';
import { ProblemDetails } from '../utils/problem';
import { hashPassword } from '../utils/password';
import { auditService } from '../services/audit.service';

const router = Router();

router.use(authenticate);
router.use(requireRoles('ADMIN'));

const sanitizeStaff = (payload: {
  user: {
    id: string;
    email: string;
    role: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    dob: Date | null;
    is_active: boolean;
  };
  doctorProfile?: {
    id: string;
    specializationId: string | null;
    license_number: string | null;
    specializationName?: string | null;
  } | null;
}) => {
  const { user, doctorProfile } = payload;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    first_name: user.first_name,
    last_name: user.last_name,
    phone: user.phone,
    dob: user.dob ? user.dob.toISOString().split('T')[0] : null,
    is_active: user.is_active,
    doctor_profile: doctorProfile
      ? {
          id: doctorProfile.id,
          specialization_id: doctorProfile.specializationId,
          specialization_name: doctorProfile.specializationName ?? null,
          license_number: doctorProfile.license_number
        }
      : null
  };
};

router.post('/staff', validateBody(CreateStaffSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as CreateStaffInput;
    const email = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ProblemDetails({ status: 409, title: 'Email already registered' });
    }

    let specializationName: string | null = null;
    if (body.role === 'DOCTOR') {
      const specialization = await prisma.specialization.findUnique({ where: { id: body.specialization_id! } });
      if (!specialization) {
        throw new ProblemDetails({ status: 400, title: 'Specialization not found' });
      }
      specializationName = specialization.name;
    }

    const passwordHash = await hashPassword(body.password);
    const dob = new Date(body.dob);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          password_hash: passwordHash,
          role: body.role,
          first_name: body.first_name,
          last_name: body.last_name,
          dob,
          phone: body.phone ?? null,
          is_active: true
        }
      });

      if (body.role === 'DOCTOR') {
        const doctorProfile = await tx.doctorProfile.create({
          data: {
            userId: user.id,
            specializationId: body.specialization_id!,
            license_number: body.license_number ?? null
          }
        });

        return {
          user,
          doctorProfile: {
            id: doctorProfile.id,
            specializationId: doctorProfile.specializationId,
            license_number: doctorProfile.license_number,
            specializationName
          }
        };
      }

      return { user, doctorProfile: null };
    });

    const sanitized = sanitizeStaff(result);

    await auditService.record({
      actorUserId: req.user!.id,
      action: 'STAFF_CREATE',
      resourceType: 'User',
      resourceId: result.user.id,
      after: sanitized,
      ip: req.ipAddress,
      userAgent: req.headers['user-agent'] as string,
      requestId: req.requestId
    });

    res.status(201).json({ staff: sanitized });
  } catch (err) {
    next(err);
  }
});

export default router;
