import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRoles } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validateResource';
import { CreatePatientSchema, PatientSearchQuerySchema, PatientSearchQueryInput } from '../schemas/patient.schema';
import { serializePatientForRole } from '../serializers/patient.serializer';
import { generateMrn } from '../utils/mrn';
import { ProblemDetails } from '../utils/problem';
import { authorizationService } from '../services/authorization.service';
import { auditService } from '../services/audit.service';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requireRoles('ADMIN', 'RECEPTIONIST', 'DOCTOR'),
  validateQuery(PatientSearchQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as unknown as PatientSearchQueryInput;
      const where: any = {};
      if (filters.query) {
        where.OR = [
          { first_name: { contains: filters.query, mode: 'insensitive' } },
          { last_name: { contains: filters.query, mode: 'insensitive' } },
          { mrn: { contains: filters.query.toUpperCase() } }
        ];
      }
      if (filters.dob) {
        where.dob = new Date(filters.dob);
      }
      if (filters.mrn) {
        where.mrn = filters.mrn.toUpperCase();
      }

      if (req.user?.role === 'DOCTOR') {
        const doctor = await authorizationService.requireDoctorProfile(req.user.id);
        where.cases = { some: { assignedDoctorId: doctor.id } };
      }

      const patients = await prisma.patientProfile.findMany({
        where,
        take: filters.limit,
        orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }]
      });

      res.json({
        data: patients.map((patient) => serializePatientForRole(patient as any, req.user!.role, req.user!.id))
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/',
  requireRoles('ADMIN', 'RECEPTIONIST'),
  validateBody(CreatePatientSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mrn = generateMrn();
      const dobDate = new Date(req.body.dob);
      const patient = await prisma.patientProfile.create({
        data: {
          mrn,
          first_name: req.body.first_name,
          last_name: req.body.last_name,
          phone: req.body.phone ?? null,
          dob: dobDate
        }
      });

      await auditService.record({
        actorUserId: req.user?.id,
        action: 'PATIENT_CREATE',
        resourceType: 'PatientProfile',
        resourceId: patient.id,
        after: patient,
        ip: req.ipAddress,
        userAgent: req.headers['user-agent'] as string,
        requestId: req.requestId
      });

      res.status(201).json({ patient: serializePatientForRole(patient as any, req.user!.role, req.user!.id) });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patient = await prisma.patientProfile.findUnique({ where: { id: req.params.id } });
    if (!patient) {
      throw new ProblemDetails({ status: 404, title: 'Patient not found' });
    }

    const role = req.user?.role;
    if (!role) {
      throw new ProblemDetails({ status: 401, title: 'Not authenticated' });
    }

    if (role === 'ADMIN' || role === 'RECEPTIONIST') {
      // allowed
    } else if (role === 'DOCTOR') {
      await authorizationService.ensureStaffCanAccessPatient('DOCTOR', req.user!.id, patient.id);
    } else if (role === 'PATIENT') {
      if (patient.userId !== req.user!.id) {
        throw new ProblemDetails({ status: 403, title: 'Forbidden' });
      }
    } else {
      throw new ProblemDetails({ status: 403, title: 'Forbidden' });
    }

    res.json({ patient: serializePatientForRole(patient as any, role, req.user!.id) });
  } catch (err) {
    next(err);
  }
});

export default router;
