import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRoles } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validateResource';
import { CreateStaffSchema, CreateStaffInput, AuditLogQuerySchema, AuditLogQueryInput } from '../schemas/admin.schema';
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

router.get('/dashboard-metrics', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [patientsTotal, doctorsTotal, receptionistsTotal, openCasesTotal, appointmentsToday] = await Promise.all([
      prisma.patientProfile.count(),
      prisma.user.count({ where: { role: 'DOCTOR' } }),
      prisma.user.count({ where: { role: 'RECEPTIONIST' } }),
      prisma.case.count({ where: { status: 'OPEN' } }),
      prisma.appointment.count({
        where: {
          start_time: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999))
          }
        }
      })
    ]);

    res.json({
      patients_total: patientsTotal,
      doctors_total: doctorsTotal,
      receptionists_total: receptionistsTotal,
      open_cases_total: openCasesTotal,
      appointments_today: appointmentsToday
    });
  } catch (err) {
    next(err);
  }
});

router.get('/audit', validateQuery(AuditLogQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = req.query as unknown as AuditLogQueryInput;
    const where: Record<string, unknown> = {};

    if (filters.actor) {
      where.actor_user_id = filters.actor;
    }
    if (filters.resource_type) {
      where.resource_type = filters.resource_type;
    }
    if (filters.from || filters.to) {
      const range: Record<string, Date> = {};
      if (filters.from) {
        range.gte = new Date(filters.from);
      }
      if (filters.to) {
        range.lte = new Date(filters.to);
      }
      where.timestamp = range;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters.limit
    });

    const actorIds = logs.map((log) => log.actor_user_id).filter((id): id is string => Boolean(id));
    const actors = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true
      }
    });

    const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

    res.json({
      data: logs.map((log) => ({
        id: log.id,
        timestamp: log.timestamp.toISOString(),
        actor: log.actor_user_id && actorMap.has(log.actor_user_id)
          ? {
              id: actorMap.get(log.actor_user_id)!.id,
              email: actorMap.get(log.actor_user_id)!.email,
              first_name: actorMap.get(log.actor_user_id)!.first_name,
              last_name: actorMap.get(log.actor_user_id)!.last_name,
              role: actorMap.get(log.actor_user_id)!.role
            }
          : null,
        action: log.action,
        resource_type: log.resource_type,
        resource_id: log.resource_id,
        before_json: log.before_json,
        after_json: log.after_json,
        ip: log.ip,
        user_agent: log.user_agent,
        request_id: log.request_id,
        outcome: log.outcome
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dryRun = req.query.dry_run === 'true';
    // TODO: Implement bulk import logic
    // For now, return a placeholder response
    res.json({
      dry_run: dryRun,
      message: 'Bulk import endpoint is not yet implemented',
      report: {
        patients: { created: 0, errors: [] },
        doctors: { created: 0, errors: [] },
        receptionists: { created: 0, errors: [] },
        specializations: { created: 0, errors: [] },
        availability_slots: { created: 0, errors: [] }
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
