import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, requireRoles } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validateResource';
import {
  CaseListQuerySchema,
  CloseCaseSchema,
  CreateCaseSchema,
  UpdateCaseSchema,
  CaseListQueryInput
} from '../schemas/case.schema';
import { ProblemDetails } from '../utils/problem';
import { serializeCaseForRole } from '../serializers/case.serializer';
import { authorizationService } from '../services/authorization.service';
import { auditService } from '../services/audit.service';
import { allocateCaseCode } from '../utils/friendlyIds';

const router = Router();

router.use(authenticate);

const CASE_INCLUDE = {
  patient: true,
  assignedDoctor: {
    include: {
      user: true,
      specialization: true
    }
  },
  _count: { select: { visits: true } }
} as const;

type CaseWithRelations = Prisma.CaseGetPayload<{ include: typeof CASE_INCLUDE }>;

const CASE_CODE_REGEX = /^c\d{5,}$/i;

const normalizeCaseCode = (code: string) => code.trim().toUpperCase();

const loadCaseOrThrow = async (identifier: string): Promise<CaseWithRelations> => {
  const isCode = CASE_CODE_REGEX.test(identifier);
  const where: Prisma.CaseWhereUniqueInput = isCode
    ? { case_code: normalizeCaseCode(identifier) }
    : { id: identifier };

  const record = await prisma.case.findUnique({
    where,
    include: CASE_INCLUDE
  });
  if (!record) {
    throw new ProblemDetails({ status: 404, title: 'Case not found' });
  }
  return record;
};

const buildCaseFilters = async (
  role: string,
  userId: string,
  filters: CaseListQueryInput,
  options: { patientIdOverride?: string; caseCode?: string } = {}
) => {
  const where: Record<string, unknown> = {};

  if (options.caseCode) {
    where.case_code = normalizeCaseCode(options.caseCode);
  }

  if (filters.status) {
    where.status = filters.status;
  }

  const requestedPatientId = options.patientIdOverride ?? filters.patient_id;

  if (role === 'ADMIN') {
    if (requestedPatientId) {
      where.patientId = requestedPatientId;
    }
    if (filters.doctor_id) {
      where.assignedDoctorId = filters.doctor_id;
    }
    return where;
  }

  if (role === 'DOCTOR') {
    const doctor = await authorizationService.requireDoctorProfile(userId);
    where.assignedDoctorId = doctor.id;
    if (requestedPatientId) {
      where.patientId = requestedPatientId;
    }
    return where;
  }

  if (role === 'RECEPTIONIST') {
    if (options.caseCode) {
      if (requestedPatientId) {
        where.patientId = requestedPatientId;
      }
      return where;
    }

    if (!requestedPatientId) {
      throw new ProblemDetails({ status: 400, title: 'patient_id is required for receptionist searches' });
    }
    where.patientId = requestedPatientId;
    return where;
  }

  if (role === 'PATIENT') {
    const patient = await authorizationService.requirePatientProfile(userId);
    where.patientId = patient.id;
    return where;
  }

  throw new ProblemDetails({ status: 403, title: 'Forbidden' });
};

router.get(
  '/',
  requireRoles('ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PATIENT'),
  validateQuery(CaseListQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as unknown as CaseListQueryInput;
      const caseCode = filters.case_code ? normalizeCaseCode(filters.case_code) : undefined;

      let patientIdOverride: string | undefined;
      if (filters.patient_code) {
        const patient = await prisma.patientProfile.findUnique({ where: { patient_code: filters.patient_code.toUpperCase() } });
        if (!patient) {
          return res.json({ data: [] });
        }
        patientIdOverride = patient.id;
      }

      const where = await buildCaseFilters(req.user!.role, req.user!.id, filters, { patientIdOverride, caseCode });

      const cases = await prisma.case.findMany({
        where,
        include: CASE_INCLUDE,
        orderBy: { created_at: 'desc' },
        take: filters.limit
      });

      res.json({
        data: cases.map((record: any) => serializeCaseForRole(record, req.user!.role, req.user!.id))
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/',
  requireRoles('ADMIN', 'DOCTOR', 'RECEPTIONIST'),
  validateBody(CreateCaseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { patient_id, assigned_doctor_id, summary, symptoms_text } = req.body;

      const patient = await prisma.patientProfile.findUnique({ where: { id: patient_id } });
      if (!patient) {
        throw new ProblemDetails({ status: 404, title: 'Patient not found' });
      }

      const doctor = await prisma.doctorProfile.findUnique({
        where: { id: assigned_doctor_id },
        include: { user: true, specialization: true }
      });
      if (!doctor) {
        throw new ProblemDetails({ status: 404, title: 'Assigned doctor not found' });
      }
      if (!doctor.user.is_active) {
        throw new ProblemDetails({ status: 400, title: 'Assigned doctor is inactive' });
      }

      if (req.user!.role === 'DOCTOR') {
        const doctorProfile = await authorizationService.requireDoctorProfile(req.user!.id);
        if (doctorProfile.id !== doctor.id) {
          throw new ProblemDetails({ status: 403, title: 'Doctors may only assign cases to themselves' });
        }
      }

      const created = await prisma.$transaction(async (tx) => {
        const case_code = await allocateCaseCode(tx);
        return tx.case.create({
          data: {
            case_code,
            patientId: patient.id,
            assignedDoctorId: doctor.id,
            summary: summary ?? null,
            symptoms_text: symptoms_text ?? null,
            created_by_user_id: req.user!.id
          },
          include: CASE_INCLUDE
        });
      });

      await auditService.record({
        actorUserId: req.user!.id,
        action: 'CASE_CREATE',
        resourceType: 'Case',
        resourceId: created.id,
        after: created,
        ip: req.ipAddress,
        userAgent: req.headers['user-agent'] as string,
        requestId: req.requestId
      });

      res.status(201).json({ case: serializeCaseForRole(created as any, req.user!.role, req.user!.id) });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:id',
  requireRoles('ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PATIENT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const caseRecord = await loadCaseOrThrow(req.params.id);
      const role = req.user!.role;

      if (role === 'DOCTOR') {
        const doctor = await authorizationService.requireDoctorProfile(req.user!.id);
        if (caseRecord.assignedDoctor?.id !== doctor.id) {
          throw new ProblemDetails({ status: 403, title: 'Doctor cannot access this case.' });
        }
      } else if (role === 'PATIENT') {
        const patient = await authorizationService.requirePatientProfile(req.user!.id);
        if (caseRecord.patient?.id !== patient.id) {
          throw new ProblemDetails({ status: 403, title: 'Patient cannot access this case.' });
        }
      } else if (role === 'RECEPTIONIST') {
        // Receptionists can view intake-level case metadata only (serializer limits data exposure).
      } else if (role !== 'ADMIN') {
        throw new ProblemDetails({ status: 403, title: 'Forbidden' });
      }

      res.json({ case: serializeCaseForRole(caseRecord as any, role, req.user!.id) });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id',
  requireRoles('ADMIN', 'DOCTOR'),
  validateBody(UpdateCaseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await loadCaseOrThrow(req.params.id);
      if (existing.status === 'CLOSED') {
        throw new ProblemDetails({ status: 409, title: 'Case already closed' });
      }

      if (req.user!.role === 'DOCTOR') {
        const doctor = await authorizationService.requireDoctorProfile(req.user!.id);
        if (existing.assignedDoctor?.id !== doctor.id) {
          throw new ProblemDetails({ status: 403, title: 'Doctor cannot modify this case.' });
        }
        if (req.body.assigned_doctor_id && req.body.assigned_doctor_id !== doctor.id) {
          throw new ProblemDetails({ status: 403, title: 'Doctors cannot reassign cases.' });
        }
      }

      let newDoctorId = existing.assignedDoctor?.id;
      if (req.body.assigned_doctor_id && req.user!.role === 'ADMIN') {
        const reassignedDoctor = await prisma.doctorProfile.findUnique({
          where: { id: req.body.assigned_doctor_id },
          include: { user: true, specialization: true }
        });
        if (!reassignedDoctor) {
          throw new ProblemDetails({ status: 404, title: 'Assigned doctor not found' });
        }
        newDoctorId = reassignedDoctor.id;
      }

      const data: Record<string, unknown> = {};
      if (req.body.summary !== undefined) {
        data.summary = req.body.summary;
      }
      if (req.body.symptoms_text !== undefined) {
        data.symptoms_text = req.body.symptoms_text;
      }
      if (newDoctorId && newDoctorId !== existing.assignedDoctor?.id) {
        data.assignedDoctorId = newDoctorId;
      }

      const updated = await prisma.case.update({
        where: { id: existing.id },
        data,
        include: CASE_INCLUDE
      });

      await auditService.record({
        actorUserId: req.user!.id,
        action: 'CASE_UPDATE',
        resourceType: 'Case',
        resourceId: existing.id,
        before: existing,
        after: updated,
        ip: req.ipAddress,
        userAgent: req.headers['user-agent'] as string,
        requestId: req.requestId
      });

      res.json({ case: serializeCaseForRole(updated as any, req.user!.role, req.user!.id) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/close',
  requireRoles('DOCTOR'),
  validateBody(CloseCaseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await loadCaseOrThrow(req.params.id);
      if (existing.status === 'CLOSED') {
        throw new ProblemDetails({ status: 409, title: 'Case already closed' });
      }

      const doctor = await authorizationService.requireDoctorProfile(req.user!.id);
      if (existing.assignedDoctor?.id !== doctor.id) {
        throw new ProblemDetails({ status: 403, title: 'Doctor cannot close this case.' });
      }

      const visitCount = await prisma.visit.count({ where: { caseId: existing.id } });
      if (visitCount === 0) {
        throw new ProblemDetails({ status: 409, title: 'At least one visit is required before closing the case.' });
      }

      const data: Record<string, unknown> = {
        status: 'CLOSED',
        closed_at: new Date(),
        closed_by_doctor_id: doctor.id
      };
      if (req.body.summary !== undefined) {
        data.summary = req.body.summary;
      }

      const updated = await prisma.case.update({
        where: { id: existing.id },
        data,
        include: CASE_INCLUDE
      });

      await auditService.record({
        actorUserId: req.user!.id,
        action: 'CASE_CLOSE',
        resourceType: 'Case',
        resourceId: existing.id,
        before: existing,
        after: updated,
        ip: req.ipAddress,
        userAgent: req.headers['user-agent'] as string,
        requestId: req.requestId
      });

      res.json({ case: serializeCaseForRole(updated as any, req.user!.role, req.user!.id) });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
