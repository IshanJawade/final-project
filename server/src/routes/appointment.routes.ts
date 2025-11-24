import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRoles } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validateResource';
import {
  AppointmentListQuerySchema,
  AvailabilityQuerySchema,
  CreateAppointmentSchema,
  UpdateAppointmentSchema,
  AppointmentListQueryInput,
  AvailabilityQueryInput
} from '../schemas/appointment.schema';
import { ProblemDetails } from '../utils/problem';
import { serializeAppointmentForRole, AppointmentWithRelations } from '../serializers/appointment.serializer';
import { authorizationService } from '../services/authorization.service';
import { auditService } from '../services/audit.service';

const router = Router();

router.use(authenticate);

const APPOINTMENT_INCLUDE = {
  doctor: {
    include: {
      user: true,
      specialization: true
    }
  },
  patient: true,
  case: true
} as const;

const loadAppointmentOrThrow = async (appointmentId: string) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: APPOINTMENT_INCLUDE
  });
  if (!appointment) {
    throw new ProblemDetails({ status: 404, title: 'Appointment not found' });
  }
  return appointment as AppointmentWithRelations;
};

const ensureAppointmentAccess = (appointment: AppointmentWithRelations, role: string, userId: string) => {
  if (role === 'ADMIN' || role === 'RECEPTIONIST') {
    return;
  }
  if (role === 'DOCTOR' && appointment.doctor.userId === userId) {
    return;
  }
  if (role === 'PATIENT' && appointment.patient.userId === userId) {
    return;
  }
  throw new ProblemDetails({ status: 403, title: 'Forbidden' });
};

const buildAppointmentFilters = async (role: string, userId: string, query: AppointmentListQueryInput) => {
  const where: Record<string, unknown> = {};

  if (query.status) {
    where.status = query.status;
  }
  if (query.case_id) {
    where.caseId = query.case_id;
  }
  if (query.doctor_id) {
    where.doctorId = query.doctor_id;
  }
  if (query.patient_id) {
    where.patientId = query.patient_id;
  }
  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) {
      range.gte = new Date(query.from);
    }
    if (query.to) {
      range.lte = new Date(query.to);
    }
    where.start_time = range;
  }

  if (role === 'ADMIN' || role === 'RECEPTIONIST') {
    return where;
  }

  if (role === 'DOCTOR') {
    const doctor = await authorizationService.requireDoctorProfile(userId);
    where.doctorId = doctor.id;
    return where;
  }

  if (role === 'PATIENT') {
    const patient = await authorizationService.requirePatientProfile(userId);
    where.patientId = patient.id;
    return where;
  }

  throw new ProblemDetails({ status: 403, title: 'Forbidden' });
};

const assertNoConflicts = async (
  doctorId: string,
  patientId: string,
  start: Date,
  end: Date,
  excludeAppointmentId?: string
) => {
  const baseWhere = {
    start_time: { lt: end },
    end_time: { gt: start },
    status: 'SCHEDULED' as const,
    ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {})
  };

  const doctorConflict = await prisma.appointment.findFirst({
    where: {
      doctorId,
      ...baseWhere
    }
  });

  if (doctorConflict) {
    throw new ProblemDetails({ status: 409, title: 'Doctor has a conflicting appointment' });
  }

  const patientConflict = await prisma.appointment.findFirst({
    where: {
      patientId,
      ...baseWhere
    }
  });

  if (patientConflict) {
    throw new ProblemDetails({ status: 409, title: 'Patient has a conflicting appointment' });
  }
};

const markAvailabilitySlot = async (doctorId: string, start: Date, end: Date, isBooked: boolean) => {
  const slot = await prisma.availabilitySlot.findFirst({
    where: {
      doctorId,
      start_time: { lte: start },
      end_time: { gte: end }
    },
    orderBy: { start_time: 'asc' }
  });

  if (slot && slot.is_booked !== isBooked) {
    await prisma.availabilitySlot.update({ where: { id: slot.id }, data: { is_booked: isBooked } });
  }
};

router.get(
  '/doctors/:doctorId/availability',
  requireRoles('ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PATIENT'),
  validateQuery(AvailabilityQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doctor = await prisma.doctorProfile.findUnique({ where: { id: req.params.doctorId } });
      if (!doctor) {
        throw new ProblemDetails({ status: 404, title: 'Doctor not found' });
      }

      if (req.user!.role === 'DOCTOR') {
        const doctorProfile = await authorizationService.requireDoctorProfile(req.user!.id);
        if (doctorProfile.id !== doctor.id) {
          throw new ProblemDetails({ status: 403, title: 'Doctors may only view their availability' });
        }
      }

      const params = req.query as unknown as AvailabilityQueryInput;
      const from = params.from ? new Date(params.from) : new Date();
      const to = params.to ? new Date(params.to) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const slots = await prisma.availabilitySlot.findMany({
        where: {
          doctorId: doctor.id,
          start_time: { gte: from },
          end_time: { lte: to },
          ...(params.include_booked ? {} : { is_booked: false })
        },
        orderBy: { start_time: 'asc' }
      });

      res.json({ data: slots });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/appointments',
  requireRoles('ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PATIENT'),
  validateQuery(AppointmentListQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as unknown as AppointmentListQueryInput;
      const where = await buildAppointmentFilters(req.user!.role, req.user!.id, filters);

      const appointments = await prisma.appointment.findMany({
        where,
        include: APPOINTMENT_INCLUDE,
        orderBy: { start_time: 'asc' },
        take: filters.limit
      });

      res.json({ data: appointments.map((appt: any) => serializeAppointmentForRole(appt as AppointmentWithRelations, req.user!.role, req.user!.id)) });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/appointments/:id',
  requireRoles('ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PATIENT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointment = await loadAppointmentOrThrow(req.params.id);
      ensureAppointmentAccess(appointment, req.user!.role, req.user!.id);
      res.json({ appointment: serializeAppointmentForRole(appointment, req.user!.role, req.user!.id) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/appointments',
  requireRoles('ADMIN', 'RECEPTIONIST', 'DOCTOR'),
  validateBody(CreateAppointmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const start = new Date(req.body.start_time);
      const end = new Date(req.body.end_time);

      const caseRecord = await prisma.case.findUnique({
        where: { id: req.body.case_id },
        include: {
          patient: true,
          assignedDoctor: true
        }
      });

      if (!caseRecord) {
        throw new ProblemDetails({ status: 404, title: 'Case not found' });
      }

      if (caseRecord.status === 'CLOSED') {
        throw new ProblemDetails({ status: 409, title: 'Cannot schedule against a closed case' });
      }

      if (!caseRecord.assignedDoctorId) {
        throw new ProblemDetails({ status: 400, title: 'Case does not have an assigned doctor' });
      }

      if (req.user!.role === 'DOCTOR') {
        const doctor = await authorizationService.requireDoctorProfile(req.user!.id);
        if (doctor.id !== caseRecord.assignedDoctorId) {
          throw new ProblemDetails({ status: 403, title: 'Doctor cannot schedule for this case' });
        }
      }

      await assertNoConflicts(caseRecord.assignedDoctorId, caseRecord.patientId, start, end);

      const appointment = await prisma.appointment.create({
        data: {
          caseId: caseRecord.id,
          doctorId: caseRecord.assignedDoctorId,
          patientId: caseRecord.patientId,
          start_time: start,
          end_time: end,
          status: 'SCHEDULED',
          created_by_user_id: req.user!.id
        },
        include: APPOINTMENT_INCLUDE
      });

      await markAvailabilitySlot(caseRecord.assignedDoctorId, start, end, true);

      await auditService.record({
        actorUserId: req.user!.id,
        action: 'APPOINTMENT_CREATE',
        resourceType: 'Appointment',
        resourceId: appointment.id,
        after: appointment,
        ip: req.ipAddress,
        userAgent: req.headers['user-agent'] as string,
        requestId: req.requestId
      });

      res.status(201).json({ appointment: serializeAppointmentForRole(appointment as AppointmentWithRelations, req.user!.role, req.user!.id) });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/appointments/:id',
  requireRoles('ADMIN', 'RECEPTIONIST', 'DOCTOR'),
  validateBody(UpdateAppointmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await loadAppointmentOrThrow(req.params.id);
      ensureAppointmentAccess(existing, req.user!.role, req.user!.id);

      const data: Record<string, unknown> = {};
      let start = existing.start_time;
      let end = existing.end_time;
      const timesChanged = Boolean(req.body.start_time || req.body.end_time);

      if (req.body.start_time) {
        start = new Date(req.body.start_time);
        data.start_time = start;
      }
      if (req.body.end_time) {
        end = new Date(req.body.end_time);
        data.end_time = end;
      }

      if (start >= end) {
        throw new ProblemDetails({ status: 400, title: 'end_time must be after start_time' });
      }

      if (req.body.status) {
        data.status = req.body.status;
      }

      if (existing.case.status === 'CLOSED' && timesChanged) {
        throw new ProblemDetails({ status: 409, title: 'Cannot reschedule appointments for closed cases' });
      }

      if (timesChanged) {
        await assertNoConflicts(existing.doctorId, existing.patientId, start, end, existing.id);
      }

      const updated = await prisma.appointment.update({
        where: { id: existing.id },
        data,
        include: APPOINTMENT_INCLUDE
      });

      if (timesChanged) {
        await markAvailabilitySlot(existing.doctorId, existing.start_time, existing.end_time, false);
        await markAvailabilitySlot(existing.doctorId, start, end, true);
      }

      if (req.body.status === 'CANCELLED') {
        await markAvailabilitySlot(existing.doctorId, start, end, false);
      }

      await auditService.record({
        actorUserId: req.user!.id,
        action: 'APPOINTMENT_UPDATE',
        resourceType: 'Appointment',
        resourceId: existing.id,
        before: existing,
        after: updated,
        ip: req.ipAddress,
        userAgent: req.headers['user-agent'] as string,
        requestId: req.requestId
      });

      res.json({ appointment: serializeAppointmentForRole(updated as AppointmentWithRelations, req.user!.role, req.user!.id) });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
