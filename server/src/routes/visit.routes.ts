import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRoles } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validateResource';
import {
  CreateVisitSchema,
  UpdateVisitSchema,
  UpsertPrescriptionSchema,
  VisitListQuerySchema,
  VisitListQueryInput
} from '../schemas/visit.schema';
import { ProblemDetails } from '../utils/problem';
import { authorizationService } from '../services/authorization.service';
import { auditService } from '../services/audit.service';
import { serializePrescription, serializeVisitForRole, VisitWithRelations } from '../serializers/visit.serializer';

const router = Router();

router.use(authenticate);

const VISIT_INCLUDE = {
  case: {
    include: {
      patient: true,
      assignedDoctor: {
        include: { user: true }
      }
    }
  },
  prescription: true
} as const;

const loadVisitOrThrow = async (visitId: string) => {
  const visit = await prisma.visit.findUnique({ where: { id: visitId }, include: VISIT_INCLUDE });
  if (!visit) {
    throw new ProblemDetails({ status: 404, title: 'Visit not found' });
  }
  return visit as VisitWithRelations;
};

const ensureCaseOpen = (status: string) => {
  if (status === 'CLOSED') {
    throw new ProblemDetails({ status: 409, title: 'Case is closed' });
  }
};

const ensureVisitAccess = (visit: VisitWithRelations, role: string, userId: string) => {
  if (role === 'ADMIN') {
    return;
  }
  if (role === 'DOCTOR' && visit.case.assignedDoctor?.userId === userId) {
    return;
  }
  if (role === 'PATIENT' && visit.case.patient.userId === userId) {
    return;
  }
  throw new ProblemDetails({ status: 403, title: 'Forbidden' });
};

router.get(
  '/cases/:caseId/visits',
  requireRoles('ADMIN', 'DOCTOR', 'PATIENT'),
  validateQuery(VisitListQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const caseId = req.params.caseId;
      const role = req.user!.role;
      if (role === 'DOCTOR') {
        await authorizationService.ensureDoctorCaseAccess(req.user!.id, caseId);
      } else if (role === 'PATIENT') {
        await authorizationService.ensurePatientCaseAccess(req.user!.id, caseId);
      }

      const { limit } = req.query as unknown as VisitListQueryInput;
      const visits = await prisma.visit.findMany({
        where: { caseId },
        include: VISIT_INCLUDE,
        orderBy: { visit_number: 'desc' },
        take: limit
      });

      res.json({
        data: visits.map((visit: any) => serializeVisitForRole(visit as VisitWithRelations, role, req.user!.id))
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/cases/:caseId/visits',
  requireRoles('DOCTOR'),
  validateBody(CreateVisitSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { doctor, caseRecord } = await authorizationService.ensureDoctorCaseAccess(req.user!.id, req.params.caseId);
      ensureCaseOpen(caseRecord.status);

      const visitCount = await prisma.visit.count({ where: { caseId: caseRecord.id } });
      const visit = await prisma.visit.create({
        data: {
          caseId: caseRecord.id,
          visit_number: visitCount + 1,
          visit_datetime: new Date(req.body.visit_datetime),
          vitals: req.body.vitals,
          notes: req.body.notes,
          created_by_doctor_id: doctor.id
        },
        include: VISIT_INCLUDE
      });

      await auditService.record({
        actorUserId: req.user!.id,
        action: 'VISIT_CREATE',
        resourceType: 'Visit',
        resourceId: visit.id,
        after: visit,
        ip: req.ipAddress,
        userAgent: req.headers['user-agent'] as string,
        requestId: req.requestId
      });

      res.status(201).json({ visit: serializeVisitForRole(visit as VisitWithRelations, req.user!.role, req.user!.id) });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/visits/:visitId', requireRoles('ADMIN', 'DOCTOR', 'PATIENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const visit = await loadVisitOrThrow(req.params.visitId);
    ensureVisitAccess(visit, req.user!.role, req.user!.id);
    res.json({ visit: serializeVisitForRole(visit, req.user!.role, req.user!.id) });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/visits/:visitId',
  requireRoles('ADMIN', 'DOCTOR'),
  validateBody(UpdateVisitSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const visit = await loadVisitOrThrow(req.params.visitId);
      ensureCaseOpen(visit.case.status);

      if (req.user!.role === 'DOCTOR' && visit.case.assignedDoctor?.userId !== req.user!.id) {
        throw new ProblemDetails({ status: 403, title: 'Doctor cannot modify this visit' });
      }

      const data: Record<string, unknown> = {};
      if (req.body.visit_datetime !== undefined) {
        data.visit_datetime = new Date(req.body.visit_datetime);
      }
      if (req.body.vitals !== undefined) {
        data.vitals = req.body.vitals;
      }
      if (req.body.notes !== undefined) {
        data.notes = req.body.notes;
      }

      const updated = await prisma.visit.update({
        where: { id: visit.id },
        data,
        include: VISIT_INCLUDE
      });

      await auditService.record({
        actorUserId: req.user!.id,
        action: 'VISIT_UPDATE',
        resourceType: 'Visit',
        resourceId: visit.id,
        before: visit,
        after: updated,
        ip: req.ipAddress,
        userAgent: req.headers['user-agent'] as string,
        requestId: req.requestId
      });

      res.json({ visit: serializeVisitForRole(updated as VisitWithRelations, req.user!.role, req.user!.id) });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/visits/:visitId/prescription',
  requireRoles('ADMIN', 'DOCTOR', 'PATIENT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const visit = await loadVisitOrThrow(req.params.visitId);
      ensureVisitAccess(visit, req.user!.role, req.user!.id);
      if (!visit.prescription) {
        throw new ProblemDetails({ status: 404, title: 'Prescription not found' });
      }
      res.json({ prescription: serializePrescription(visit.prescription) });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/visits/:visitId/prescription',
  requireRoles('DOCTOR'),
  validateBody(UpsertPrescriptionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const visit = await loadVisitOrThrow(req.params.visitId);
      ensureCaseOpen(visit.case.status);

      const doctor = await authorizationService.requireDoctorProfile(req.user!.id);
      if (visit.case.assignedDoctor?.id !== doctor.id) {
        throw new ProblemDetails({ status: 403, title: 'Doctor cannot manage this prescription' });
      }

      let action = 'PRESCRIPTION_CREATE';
      const existing = await prisma.prescription.findUnique({ where: { visitId: visit.id } });
      let prescription;

      if (existing) {
        prescription = await prisma.prescription.update({
          where: { visitId: visit.id },
          data: {
            medication_name: req.body.medication_name,
            dosage: req.body.dosage,
            frequency: req.body.frequency,
            route: req.body.route,
            duration: req.body.duration,
            notes: req.body.notes ?? null
          }
        });
        action = 'PRESCRIPTION_UPDATE';
      } else {
        prescription = await prisma.prescription.create({
          data: {
            visitId: visit.id,
            medication_name: req.body.medication_name,
            dosage: req.body.dosage,
            frequency: req.body.frequency,
            route: req.body.route,
            duration: req.body.duration,
            notes: req.body.notes ?? null,
            created_by_doctor_id: doctor.id
          }
        });
      }

      await auditService.record({
        actorUserId: req.user!.id,
        action,
        resourceType: 'Prescription',
        resourceId: prescription.id,
        before: existing ?? undefined,
        after: prescription,
        ip: req.ipAddress,
        userAgent: req.headers['user-agent'] as string,
        requestId: req.requestId
      });

      res.json({ prescription: serializePrescription(prescription) });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
