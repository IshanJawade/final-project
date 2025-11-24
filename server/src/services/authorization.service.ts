import { prisma } from '../lib/prisma';
import { ProblemDetails } from '../utils/problem';

type Role = 'ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'PATIENT';

const forbidden = (detail: string) => new ProblemDetails({ status: 403, title: 'Forbidden', detail });
const notFound = (detail: string) => new ProblemDetails({ status: 404, title: 'Not Found', detail });

export const authorizationService = {
  async requireDoctorProfile(userId: string) {
    const doctor = await prisma.doctorProfile.findUnique({ where: { userId } });
    if (!doctor) {
      throw forbidden('Doctor profile not found for current user.');
    }
    return doctor;
  },

  async requirePatientProfile(userId: string) {
    const patient = await prisma.patientProfile.findUnique({ where: { userId } });
    if (!patient) {
      throw forbidden('Patient profile not found for current user.');
    }
    return patient;
  },

  async ensureDoctorCaseAccess(userId: string, caseId: string) {
    const doctor = await this.requireDoctorProfile(userId);
    const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) {
      throw notFound('Case not found.');
    }
    if (caseRecord.assignedDoctorId !== doctor.id) {
      throw forbidden('Doctor cannot access this case.');
    }
    return { doctor, caseRecord };
  },

  async ensureDoctorVisitAccess(userId: string, visitId: string) {
    const doctor = await this.requireDoctorProfile(userId);
    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      include: { case: true }
    });
    if (!visit) {
      throw notFound('Visit not found.');
    }
    if (visit.case.assignedDoctorId !== doctor.id) {
      throw forbidden('Doctor cannot access this visit.');
    }
    return { doctor, visit };
  },

  async ensurePatientCaseAccess(userId: string, caseId: string) {
    const patient = await this.requirePatientProfile(userId);
    const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) {
      throw notFound('Case not found.');
    }
    if (caseRecord.patientId !== patient.id) {
      throw forbidden('You do not have access to this case.');
    }
    return { patient, caseRecord };
  },

  async ensurePatientVisitAccess(userId: string, visitId: string) {
    const patient = await this.requirePatientProfile(userId);
    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      include: { case: true }
    });
    if (!visit) {
      throw notFound('Visit not found.');
    }
    if (visit.case.patientId !== patient.id) {
      throw forbidden('You do not have access to this visit.');
    }
    return { patient, visit };
  },

  async ensureStaffCanAccessPatient(role: Role, userId: string, patientId: string) {
    if (role === 'ADMIN') {
      return;
    }
    if (role === 'DOCTOR') {
      const doctor = await this.requireDoctorProfile(userId);
      const caseCount = await prisma.case.count({
        where: { patientId, assignedDoctorId: doctor.id }
      });
      if (caseCount === 0) {
        throw forbidden('Doctor cannot access this patient.');
      }
      return;
    }
    if (role === 'RECEPTIONIST') {
      // Receptionists can view intake-level patient data.
      return;
    }
    if (role === 'PATIENT') {
      const patient = await this.requirePatientProfile(userId);
      if (patient.id !== patientId) {
        throw forbidden('Patients can only access their own records.');
      }
    }
  }
};
