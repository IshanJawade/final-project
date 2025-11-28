import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { AppointmentSummary, AvailabilitySlot, CaseSummary, DoctorSummary, PatientSummary, SpecializationSummary } from '../types';

const describeError = (error: unknown) => {
  if (error instanceof ApiError) {
    return error.detail || `Request failed (${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error occurred.';
};

const formatDateTime = (iso: string) => {
  const dt = new Date(iso);
  return dt.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
};

const patientLabel = (appointment: AppointmentSummary) => {
  if (appointment.patient) {
    const { patient_code, first_name, last_name } = appointment.patient;
    return `${patient_code} · ${first_name} ${last_name}`.trim();
  }
  return 'Restricted';
};

const formatDoctor = (caseRecord: CaseSummary | null) => {
  if (!caseRecord?.assigned_doctor) {
    return 'Unassigned';
  }
  const { first_name, last_name, specialization } = caseRecord.assigned_doctor;
  const name = `${first_name} ${last_name}`.trim();
  return specialization ? `${name} (${specialization})` : name;
};

const normalizeCode = (value: string) => value.trim().toUpperCase();

type HourSlice = {
  id: string;
  start: string;
  end: string;
};

// Generate calendar days for next 3 days
const generateCalendarDays = () => {
  const days: Date[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < 3; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    days.push(date);
  }
  
  return days;
};

// Generate time slots from 10 AM to 5 PM
const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let hour = 10; hour < 17; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`);
  }
  return slots;
};

// Check if a slot is available
const isSlotAvailable = (
  date: Date,
  hour: number,
  availabilitySlots: AvailabilitySlot[],
  appointments: AppointmentSummary[]
): { available: boolean; booked: boolean; hasAppointment: boolean } => {
  const slotStart = new Date(date);
  slotStart.setHours(hour, 0, 0, 0);
  const slotEnd = new Date(date);
  slotEnd.setHours(hour + 1, 0, 0, 0);

  // Check if slot is in the past
  if (slotStart.getTime() < Date.now()) {
    return { available: false, booked: false, hasAppointment: false };
  }

  // Check if there's an appointment at this time (only future appointments)
  const now = Date.now();
  const hasAppointment = appointments.some((apt) => {
    const aptStart = new Date(apt.start_time);
    const aptEnd = new Date(apt.end_time);
    return (
      aptStart.getTime() >= now && // Only consider future appointments
      aptStart.getTime() < slotEnd.getTime() &&
      aptEnd.getTime() > slotStart.getTime() &&
      apt.status === 'SCHEDULED'
    );
  });

  if (hasAppointment) {
    return { available: false, booked: true, hasAppointment: true };
  }

  // Check if slot is in doctor's availability and not booked
  const matchingSlot = availabilitySlots.find((slot) => {
    const slotStartTime = new Date(slot.start_time);
    const slotEndTime = new Date(slot.end_time);
    return (
      slotStartTime.getTime() <= slotStart.getTime() &&
      slotEndTime.getTime() >= slotEnd.getTime()
    );
  });

  // If slot is booked in availability, mark it as booked
  if (matchingSlot && matchingSlot.is_booked) {
    return { available: false, booked: true, hasAppointment: false };
  }

  // If slot exists in availability and is not booked, it's available
  const isInAvailability = matchingSlot !== undefined && !matchingSlot.is_booked;

  return { available: isInAvailability, booked: false, hasAppointment: false };
};

const formatPatientName = (patient: PatientSummary) => `${patient.first_name} ${patient.last_name}`.trim();

export const AppointmentsPage = () => {
  const { authedRequest, user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'ALL' | AppointmentSummary['status']>('ALL');
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  
  // Step 1: Patient search/selection
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [newPatientForm, setNewPatientForm] = useState({
    first_name: '',
    last_name: '',
    dob: '',
    phone: ''
  });
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  
  // Step 2: Case selection/creation
  const [selectedCase, setSelectedCase] = useState<CaseSummary | null>(null);
  const [newCaseForm, setNewCaseForm] = useState({
    doctorId: '',
    summary: '',
    symptoms_text: ''
  });
  const [selectedSpecialization, setSelectedSpecialization] = useState('');
  
  // Step 3: Appointment scheduling
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<{
    show: boolean;
    patientName: string;
    doctorName: string;
    appointmentTime: string;
  } | null>(null);

  const params = useMemo(() => {
    const query = new URLSearchParams({ limit: '50' });
    if (statusFilter !== 'ALL') {
      query.set('status', statusFilter);
    }
    if (upcomingOnly) {
      query.set('from', new Date().toISOString());
    }
    return query.toString();
  }, [statusFilter, upcomingOnly]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['appointments', params],
    queryFn: () => authedRequest<{ data: AppointmentSummary[] }>(`/appointments?${params}`)
  });

  const appointments = data?.data ?? [];
  const errorMessage = error instanceof Error ? error.message : 'Failed to load appointments.';

  const canSchedule = user.role === 'ADMIN' || user.role === 'RECEPTIONIST';
  const isDoctor = user.role === 'DOCTOR';
  
  // Get doctor's own profile ID if user is a doctor
  const doctorOwnProfileQuery = useQuery({
    queryKey: ['doctor-own-profile', user.id],
    queryFn: async () => {
      const doctors = await authedRequest<{ data: DoctorSummary[] }>('/doctors?limit=100');
      const ownProfile = doctors.data.find((d) => d.user_id === user.id);
      return ownProfile;
    },
    enabled: isDoctor
  });

  const doctorOwnId = doctorOwnProfileQuery.data?.id;
  
  // Patient search
  const patientSearchParams = useMemo(() => {
    const params = new URLSearchParams({ limit: '20' });
    if (patientSearchQuery.trim()) {
      params.set('query', patientSearchQuery.trim());
    }
    return params.toString();
  }, [patientSearchQuery]);

  const patientSearchQuery_result = useQuery({
    queryKey: ['patient-search', patientSearchParams],
    queryFn: () => authedRequest<{ data: PatientSummary[] }>(`/patients?${patientSearchParams}`),
    enabled: canSchedule && patientSearchQuery.trim().length >= 2
  });

  const searchResults = patientSearchQuery_result.data?.data ?? [];

  // Get all cases for selected patient (open and closed)
  const patientCasesQuery = useQuery({
    queryKey: ['patient-cases', selectedPatient?.id],
    queryFn: () => authedRequest<{ data: CaseSummary[] }>(`/cases?patient_id=${encodeURIComponent(selectedPatient!.id)}&limit=100`),
    enabled: canSchedule && Boolean(selectedPatient)
  });

  const patientCases = patientCasesQuery.data?.data ?? [];
  const openCases = patientCases.filter((c) => c.status === 'OPEN');
  const closedCases = patientCases.filter((c) => c.status === 'CLOSED');

  // Get specializations and doctors
  const specializationsQuery = useQuery({
    queryKey: ['specializations'],
    queryFn: () => authedRequest<{ data: SpecializationSummary[] }>('/specializations'),
    enabled: canSchedule
  });

  const doctorsQuery = useQuery({
    queryKey: ['doctors', selectedSpecialization],
    queryFn: () => {
      const params = selectedSpecialization ? `?specialization=${encodeURIComponent(selectedSpecialization)}&limit=100` : '?limit=100';
      return authedRequest<{ data: DoctorSummary[] }>(`/doctors${params}`);
    },
    enabled: canSchedule
  });

  const specializations = specializationsQuery.data?.data ?? [];
  const doctors = (doctorsQuery.data?.data ?? []).filter((d) => d.is_active);

  useEffect(() => {
    setSelectedSliceId(null);
    setScheduleMessage(null);
    setScheduleError(null);
  }, [selectedCase?.id]);

  // Get doctor availability for calendar
  const doctorIdForAvailability = isDoctor
    ? doctorOwnId
    : selectedCase?.assigned_doctor?.id || (newCaseForm.doctorId || null);
  const availabilityRange = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setDate(to.getDate() + 3);
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const doctorAvailabilityQuery = useQuery({
    queryKey: ['doctor-availability', doctorIdForAvailability, availabilityRange],
    queryFn: () =>
      authedRequest<{ data: AvailabilitySlot[] }>(
        `/doctors/${doctorIdForAvailability}/availability?from=${encodeURIComponent(availabilityRange.from)}&to=${encodeURIComponent(availabilityRange.to)}&include_booked=true`
      ),
    enabled: Boolean(doctorIdForAvailability)
  });

  const doctorAvailability = doctorAvailabilityQuery.data?.data ?? [];

  // Get doctor's appointments for calendar
  const doctorAppointmentsQuery = useQuery({
    queryKey: ['doctor-appointments', doctorIdForAvailability, availabilityRange],
    queryFn: () =>
      authedRequest<{ data: AppointmentSummary[] }>(
        `/appointments?doctor_id=${encodeURIComponent(doctorIdForAvailability!)}&from=${encodeURIComponent(availabilityRange.from)}&to=${encodeURIComponent(availabilityRange.to)}&limit=200`
      ),
    enabled: Boolean(doctorIdForAvailability)
  });

  const doctorAppointments = doctorAppointmentsQuery.data?.data ?? [];

  const calendarDays = useMemo(() => generateCalendarDays(), []);
  const timeSlots = useMemo(() => generateTimeSlots(), []);

  // Parse selected slot ID (format: YYYY-MM-DD@HH)
  const selectedSlot = useMemo(() => {
    if (!selectedSliceId) return null;
    // Split on '@' to separate date and hour
    const [dateStr, hourStr] = selectedSliceId.split('@');
    if (!dateStr || !hourStr) return null;
    const date = new Date(dateStr + 'T00:00:00'); // Add time to avoid timezone issues
    const hour = parseInt(hourStr, 10);
    if (isNaN(hour)) return null;
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(date);
    end.setHours(hour + 1, 0, 0, 0);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [selectedSliceId]);

  const updateAppointmentMutation = useMutation<{ appointment: AppointmentSummary }, unknown, { appointmentId: string; status: AppointmentSummary['status'] }>({
    mutationFn: ({ appointmentId, status }) => {
      return authedRequest<{ appointment: AppointmentSummary }>(`/appointments/${appointmentId}`, {
        method: 'PATCH',
        body: { status }
      });
    },
    onSuccess: () => {
      // Invalidate all appointment-related queries
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && (queryItem.queryKey[0] === 'appointments' || queryItem.queryKey[0] === 'doctor-appointments') });
      // Also invalidate availability queries since slots get marked as booked
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && queryItem.queryKey[0] === 'doctor-availability' });
    }
  });

  // Create new patient mutation
  const createPatientMutation = useMutation<{ patient: PatientSummary }, unknown, typeof newPatientForm>({
    mutationFn: async (payload) => {
      const phone = payload.phone.trim();
      return authedRequest<{ patient: PatientSummary }>('/patients', {
        method: 'POST',
        body: {
          first_name: payload.first_name.trim(),
          last_name: payload.last_name.trim(),
          dob: payload.dob,
          phone: phone.length ? phone : undefined
        }
      });
    },
    onSuccess: (response) => {
      setSelectedPatient(response.patient);
      setShowNewPatientForm(false);
      setNewPatientForm({ first_name: '', last_name: '', dob: '', phone: '' });
      setPatientSearchQuery('');
      queryClient.invalidateQueries({ queryKey: ['patient-search'] });
      queryClient.invalidateQueries({ queryKey: ['patient-cases'] });
    },
    onError: (err) => {
      setScheduleError(describeError(err));
    }
  });

  // Create case and appointment in one go
  const createCaseAndAppointmentMutation = useMutation<
    { case: CaseSummary; appointment: AppointmentSummary },
    unknown,
    { patientId: string; doctorId: string; summary?: string; symptoms_text?: string; startIso: string; endIso: string }
  >({
    mutationFn: async ({ patientId, doctorId, summary, symptoms_text, startIso, endIso }) => {
      // First create the case
      const caseResponse = await authedRequest<{ case: CaseSummary }>('/cases', {
        method: 'POST',
        body: {
          patient_id: patientId,
          assigned_doctor_id: doctorId,
          summary: summary || undefined,
          symptoms_text: symptoms_text || undefined
        }
      });

      // Then create the appointment
      const appointmentResponse = await authedRequest<{ appointment: AppointmentSummary }>('/appointments', {
        method: 'POST',
        body: {
          case_id: caseResponse.case.id,
          start_time: startIso,
          end_time: endIso
        }
      });

      return {
        case: caseResponse.case,
        appointment: appointmentResponse.appointment
      };
    },
    onSuccess: (response) => {
      setScheduleError(null);
      setScheduleMessage(null);
      
      // Get patient name
      const patientName = selectedPatient 
        ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
        : response.appointment.patient 
        ? `${response.appointment.patient.first_name} ${response.appointment.patient.last_name}`
        : 'Unknown Patient';
      
      // Get doctor name
      const doctorName = response.appointment.doctor
        ? `Dr. ${response.appointment.doctor.first_name} ${response.appointment.doctor.last_name}`
        : 'Unknown Doctor';
      
      // Format appointment time
      const appointmentTime = new Date(response.appointment.start_time).toLocaleString([], {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // Show confirmation modal
      setConfirmationModal({
        show: true,
        patientName,
        doctorName,
        appointmentTime
      });
      
      // Invalidate all appointment-related queries
      queryClient.invalidateQueries({ queryKey: ['patient-cases'] });
      // Invalidate appointment queries - this will refresh both the list and doctor's calendar
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && (queryItem.queryKey[0] === 'appointments' || queryItem.queryKey[0] === 'doctor-appointments') });
      // Also invalidate availability queries since slots get marked as booked
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && queryItem.queryKey[0] === 'doctor-availability' });
      // Force refetch to ensure immediate update
      queryClient.refetchQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && (queryItem.queryKey[0] === 'doctor-appointments' || queryItem.queryKey[0] === 'doctor-availability') });
    },
    onError: (err) => {
      setScheduleMessage(null);
      setScheduleError(describeError(err));
    }
  });

  // Create appointment for existing case
  const createAppointmentMutation = useMutation<{ appointment: AppointmentSummary }, unknown, { caseId: string; startIso: string; endIso: string }>({
    mutationFn: (payload) => {
      return authedRequest<{ appointment: AppointmentSummary }>('/appointments', {
        method: 'POST',
        body: {
          case_id: payload.caseId,
          start_time: payload.startIso,
          end_time: payload.endIso
        }
      });
    },
    onSuccess: (response) => {
      setScheduleError(null);
      setScheduleMessage(null);
      
      // Get patient name
      const patientName = selectedPatient 
        ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
        : response.appointment.patient 
        ? `${response.appointment.patient.first_name} ${response.appointment.patient.last_name}`
        : 'Unknown Patient';
      
      // Get doctor name
      const doctorName = response.appointment.doctor
        ? `Dr. ${response.appointment.doctor.first_name} ${response.appointment.doctor.last_name}`
        : 'Unknown Doctor';
      
      // Format appointment time
      const appointmentTime = new Date(response.appointment.start_time).toLocaleString([], {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // Show confirmation modal
      setConfirmationModal({
        show: true,
        patientName,
        doctorName,
        appointmentTime
      });
      
      // Invalidate all appointment-related queries
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && (queryItem.queryKey[0] === 'appointments' || queryItem.queryKey[0] === 'doctor-appointments') });
      // Also invalidate availability queries since slots get marked as booked
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && queryItem.queryKey[0] === 'doctor-availability' });
      // Force refetch to ensure immediate update
      queryClient.refetchQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && (queryItem.queryKey[0] === 'doctor-appointments' || queryItem.queryKey[0] === 'doctor-availability') });
    },
    onError: (err) => {
      setScheduleMessage(null);
      setScheduleError(describeError(err));
    }
  });

  const handleCreatePatient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createPatientMutation.mutate(newPatientForm);
  };

  const handleCloseConfirmation = () => {
    setConfirmationModal(null);
    // Reset form state
    setSelectedSliceId(null);
    setSelectedCase(null);
    setSelectedPatient(null);
    setNewCaseForm({ doctorId: '', summary: '', symptoms_text: '' });
    setSelectedSpecialization('');
    setPatientSearchQuery('');
    setShowNewPatientForm(false);
  };

  const handleSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setScheduleMessage(null);
    setScheduleError(null);

    if (!selectedSlot) {
      setScheduleError('Select a time slot.');
      return;
    }

    if (!selectedSlot) {
      setScheduleError('Select a time slot.');
      return;
    }

    if (selectedCase) {
      // Use existing case
      createAppointmentMutation.mutate({
        caseId: selectedCase.id,
        startIso: selectedSlot.start,
        endIso: selectedSlot.end
      });
    } else {
      // Create new case and appointment
      if (!selectedPatient) {
        setScheduleError('Please select a patient first.');
        return;
      }
      if (!newCaseForm.doctorId) {
        setScheduleError('Please select a doctor for the case.');
        return;
      }
      createCaseAndAppointmentMutation.mutate({
        patientId: selectedPatient.id,
        doctorId: newCaseForm.doctorId,
        summary: newCaseForm.summary.trim() || undefined,
        symptoms_text: newCaseForm.symptoms_text.trim() || undefined,
        startIso: selectedSlot.start,
        endIso: selectedSlot.end
      });
    }
  };

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(event.target.value as typeof statusFilter);
  };

  const handleUpcomingToggle = (event: ChangeEvent<HTMLInputElement>) => {
    setUpcomingOnly(event.target.checked);
  };

  return (
    <div>
      <div className="page-heading">
        <h1>Appointments</h1>
        <span>Doctor capacity and live queue health</span>
      </div>

      {/* Doctor Calendar View */}
      {isDoctor && doctorOwnId ? (
        <section className="panel" style={{ marginBottom: '1.25rem' }}>
          <header className="form-panel-header">
            <div>
              <h2>My Appointment Calendar</h2>
              <p>View your scheduled appointments for the next 3 days (10 AM - 5 PM)</p>
            </div>
          </header>

          {doctorAvailabilityQuery.isLoading || doctorAppointmentsQuery.isLoading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading calendar...</p>
              ) : (
                <div
                  style={{
                    overflowX: 'auto',
                    overflowY: 'visible',
                    marginTop: '1rem',
                    maxWidth: '100%',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '0.5rem',
                    position: 'relative'
                  }}
                  role="region"
                  aria-label="Doctor appointment calendar"
                >
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        background: 'var(--bg-primary)',
                        margin: 0
                      }}
                      role="grid"
                      aria-label="Appointment calendar"
                    >
                      <thead>
                        <tr role="row">
                          <th
                            role="columnheader"
                            scope="col"
                            style={{
                              padding: '0.75rem',
                              textAlign: 'left',
                              background: 'var(--bg-soft)',
                              border: '1px solid var(--border-soft)',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              position: 'sticky',
                              left: 0,
                              zIndex: 10,
                              minWidth: '80px'
                            }}
                          >
                            Time
                          </th>
                          {calendarDays.map((day) => (
                            <th
                              key={day.toISOString()}
                              role="columnheader"
                              scope="col"
                              style={{
                                padding: '0.75rem',
                                textAlign: 'center',
                                background: 'var(--bg-soft)',
                                border: '1px solid var(--border-soft)',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                minWidth: '120px'
                              }}
                            >
                              <div>{day.toLocaleDateString([], { weekday: 'short' })}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                {day.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {timeSlots.map((timeSlot, timeIndex) => {
                          const hour = 10 + timeIndex;
                          return (
                            <tr key={timeSlot} role="row">
                              <th
                                role="rowheader"
                                scope="row"
                                style={{
                                  padding: '0.75rem',
                                  background: 'var(--bg-soft)',
                                  border: '1px solid var(--border-soft)',
                                  fontSize: '0.85rem',
                                  fontWeight: 600,
                                  position: 'sticky',
                                  left: 0,
                                  zIndex: 5,
                                  minWidth: '80px'
                                }}
                              >
                                {timeSlot}
                              </th>
                              {calendarDays.map((day) => {
                                const slotStatus = isSlotAvailable(day, hour, doctorAvailability, doctorAppointments);
                                // Create slot start/end times properly
                                const slotStart = new Date(day);
                                slotStart.setHours(hour, 0, 0, 0);
                                const slotEnd = new Date(day);
                                slotEnd.setHours(hour + 1, 0, 0, 0);
                                const isPast = slotStart.getTime() < Date.now();
                                
                                // Find appointment that overlaps with this slot (show all appointments in doctor's calendar)
                                const appointmentAtSlot = doctorAppointments.find((apt) => {
                                  const aptStart = new Date(apt.start_time);
                                  const aptEnd = new Date(apt.end_time);
                                  
                                  // Check if appointment overlaps with the slot (any overlap counts)
                                  const overlaps = aptStart.getTime() < slotEnd.getTime() && aptEnd.getTime() > slotStart.getTime();
                                  
                                  return overlaps;
                                });

                                const dateLabel = day.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                                const slotLabel = `${dateLabel} at ${timeSlot}`;
                                const ariaLabel = appointmentAtSlot
                                  ? `${slotLabel} - Appointment with ${appointmentAtSlot.patient ? `${appointmentAtSlot.patient.first_name} ${appointmentAtSlot.patient.last_name}` : 'patient'}, Case ${appointmentAtSlot.case_code}`
                                  : `${slotLabel} - ${isPast ? 'Past' : slotStatus.available ? 'Available' : 'Not available'}`;

                                let cellStyle: Record<string, string | number> = {
                                  padding: '0.5rem',
                                  border: '1px solid var(--border-soft)',
                                  textAlign: 'center',
                                  background: isPast
                                    ? 'var(--bg-soft)'
                                    : appointmentAtSlot
                                    ? 'rgba(14,165,233,0.2)'
                                    : slotStatus.available
                                    ? 'rgba(34,197,94,0.1)'
                                    : 'rgba(148,163,184,0.05)',
                                  minWidth: '120px'
                                };

                                return (
                                  <td key={day.toISOString()} role="gridcell" style={cellStyle} aria-label={ariaLabel}>
                                    {isPast ? (
                                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Past</span>
                                    ) : appointmentAtSlot ? (
                                      <div style={{ fontSize: '0.75rem' }}>
                                        <div style={{ fontWeight: 600, color: '#0ea5e9', marginBottom: '0.25rem' }}>
                                          {appointmentAtSlot.patient
                                            ? `${appointmentAtSlot.patient.first_name} ${appointmentAtSlot.patient.last_name}`
                                            : 'Appointment'}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                          {appointmentAtSlot.case_code}
                                        </div>
                                      </div>
                                    ) : slotStatus.available ? (
                                      <span style={{ color: '#22c55e', fontSize: '0.75rem' }}>Available</span>
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {canSchedule ? (
        <section className="panel" style={{ marginBottom: '1.25rem' }}>
          <header className="form-panel-header">
            <div>
              <h2>Schedule Appointment</h2>
              <p>Search for patient, select or create case, then schedule appointment.</p>
            </div>
          </header>

          {/* Step 1: Patient Search/Selection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Step 1: Find or Create Patient</h3>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <input
                type="text"
                value={patientSearchQuery}
                onChange={(e) => setPatientSearchQuery(e.target.value)}
                placeholder="Search by patient name, MRN, or code..."
                style={{ flex: 1, borderRadius: '0.5rem', border: '1px solid var(--border-soft)', padding: '0.75rem' }}
              />
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowNewPatientForm(!showNewPatientForm)}
              >
                {showNewPatientForm ? 'Cancel' : '+ New Patient'}
                  </button>
                </div>

            {showNewPatientForm ? (
              <form onSubmit={handleCreatePatient} className="form-grid" style={{ marginTop: '0.75rem', padding: '1rem', background: 'var(--bg-soft)', borderRadius: '0.5rem' }}>
                <label>
                  First Name
                  <input
                    required
                    value={newPatientForm.first_name}
                    onChange={(e) => setNewPatientForm((prev) => ({ ...prev, first_name: e.target.value }))}
                  />
                </label>
                <label>
                  Last Name
                  <input
                    required
                    value={newPatientForm.last_name}
                    onChange={(e) => setNewPatientForm((prev) => ({ ...prev, last_name: e.target.value }))}
                  />
                </label>
                <label>
                  Date of Birth
                  <input
                    required
                    type="date"
                    value={newPatientForm.dob}
                    onChange={(e) => setNewPatientForm((prev) => ({ ...prev, dob: e.target.value }))}
                  />
                </label>
                <label>
                  Phone (optional)
                  <input
                    value={newPatientForm.phone}
                    onChange={(e) => setNewPatientForm((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </label>
                <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                  <button className="primary-btn" type="submit" disabled={createPatientMutation.isPending}>
                    {createPatientMutation.isPending ? 'Creating...' : 'Create Patient'}
                  </button>
                </div>
            </form>
            ) : null}

            {patientSearchQuery_result.isLoading ? (
              <p style={{ color: 'var(--text-muted)' }}>Searching...</p>
            ) : searchResults.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                {searchResults.map((patient) => (
                  <div
                    key={patient.id}
                    onClick={() => {
                      setSelectedPatient(patient);
                      setSelectedCase(null);
                      setPatientSearchQuery('');
                    }}
                    style={{
                      padding: '0.75rem',
                      border: `2px solid ${selectedPatient?.id === patient.id ? 'var(--accent-strong)' : 'var(--border-soft)'}`,
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      background: selectedPatient?.id === patient.id ? 'rgba(14,165,233,0.1)' : 'transparent'
                    }}
                  >
                    <strong>{patient.patient_code}</strong> · {patient.first_name} {patient.last_name} · MRN: {patient.mrn}
                  </div>
                ))}
                </div>
            ) : patientSearchQuery.trim().length >= 2 ? (
              <p style={{ color: 'var(--text-muted)' }}>No patients found. Create a new patient.</p>
            ) : null}

            {selectedPatient ? (
              <div className="panel" style={{ marginTop: '0.75rem', borderStyle: 'dashed', background: 'rgba(34,197,94,0.1)' }}>
                <strong>Selected:</strong> {selectedPatient.patient_code} · {selectedPatient.first_name} {selectedPatient.last_name}
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setSelectedPatient(null);
                    setSelectedCase(null);
                  }}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Change
                </button>
              </div>
              ) : null}
            </div>

          {/* Step 2: Case Selection/Creation */}
          {selectedPatient ? (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Step 2: Select or Create Case</h3>
              
              {patientCasesQuery.isLoading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading cases...</p>
              ) : (
                <>
                  {openCases.length > 0 ? (
                    <div style={{ marginBottom: '1rem' }}>
                      <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Open Cases:</strong>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {openCases.map((caseRecord) => (
                          <div
                            key={caseRecord.id}
                            onClick={() => {
                              setSelectedCase(caseRecord);
                              setNewCaseForm({ doctorId: '', summary: '', symptoms_text: '' });
                            }}
                            style={{
                              padding: '0.75rem',
                              border: `2px solid ${selectedCase?.id === caseRecord.id ? 'var(--accent-strong)' : 'var(--border-soft)'}`,
                              borderRadius: '0.5rem',
                              cursor: 'pointer',
                              background: selectedCase?.id === caseRecord.id ? 'rgba(14,165,233,0.1)' : 'transparent'
                            }}
                          >
                            <strong>{caseRecord.case_code}</strong> · {formatDoctor(caseRecord)}
                            {caseRecord.summary ? <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>{caseRecord.summary}</div> : null}
                        </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {closedCases.length > 0 ? (
                    <details style={{ marginBottom: '1rem' }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                        Closed Cases ({closedCases.length})
                      </summary>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {closedCases.map((caseRecord) => (
                          <div
                            key={caseRecord.id}
                            style={{
                              padding: '0.75rem',
                              border: '1px solid var(--border-soft)',
                              borderRadius: '0.5rem',
                              opacity: 0.6
                            }}
                          >
                            <strong>{caseRecord.case_code}</strong> · {formatDoctor(caseRecord)}
                          </div>
                  ))}
                </div>
                    </details>
                  ) : null}

                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-soft)', borderRadius: '0.5rem' }}>
                    <strong style={{ display: 'block', marginBottom: '0.75rem' }}>Or Create New Case:</strong>
                    <div className="form-grid">
                <label>
                        Filter by Specialization
                        <select
                          value={selectedSpecialization}
                          onChange={(e) => {
                            setSelectedSpecialization(e.target.value);
                            setNewCaseForm((prev) => ({ ...prev, doctorId: '' }));
                          }}
                        >
                          <option value="">All Specializations</option>
                          {specializations.map((spec) => (
                            <option key={spec.id} value={spec.name}>
                              {spec.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Assign Doctor
                        <select
                          value={newCaseForm.doctorId}
                          onChange={(e) => setNewCaseForm((prev) => ({ ...prev, doctorId: e.target.value }))}
                          required={!selectedCase}
                        >
                          <option value="">Select doctor...</option>
                          {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.first_name} {doctor.last_name}
                        {doctor.specialization ? ` · ${doctor.specialization}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                        Summary (optional)
                        <input
                          value={newCaseForm.summary}
                          onChange={(e) => setNewCaseForm((prev) => ({ ...prev, summary: e.target.value }))}
                    placeholder="Brief reason for visit"
                  />
                </label>
                      <label>
                        Symptoms (optional)
                        <textarea
                          rows={2}
                          value={newCaseForm.symptoms_text}
                          onChange={(e) => setNewCaseForm((prev) => ({ ...prev, symptoms_text: e.target.value }))}
                          placeholder="Initial symptoms or complaints"
                        />
                      </label>
                </div>
                    {selectedCase ? (
                      <div className="panel" style={{ marginTop: '0.75rem', borderStyle: 'dashed', background: 'rgba(34,197,94,0.1)' }}>
                        <strong>Using existing case:</strong> {selectedCase.case_code} · {formatDoctor(selectedCase)}
          </div>
                    ) : newCaseForm.doctorId ? (
                      <div className="panel" style={{ marginTop: '0.75rem', borderStyle: 'dashed', background: 'rgba(14,165,233,0.1)' }}>
                        <strong>Will create new case</strong> with selected doctor
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* Step 3: Schedule Appointment - Calendar View */}
          {selectedPatient && (selectedCase || newCaseForm.doctorId) ? (
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Step 3: Select Time Slot</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                {selectedCase
                  ? `Select a time slot for ${formatDoctor(selectedCase)}.`
                  : `Select a time slot. A new case will be created with the selected doctor.`}
                {' '}Available slots are 10 AM to 5 PM, 1 hour each.
              </p>

              {doctorAvailabilityQuery.isLoading || doctorAppointmentsQuery.isLoading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading calendar...</p>
              ) : doctorAvailability.length === 0 && !doctorAvailabilityQuery.isLoading ? (
                <div className="panel" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #dc2626' }}>
                  <p style={{ color: '#dc2626', margin: 0 }}>
                    <strong>No availability slots found.</strong> The doctor may not have set their availability yet.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSchedule}>
                  {/* Selected Slot Display */}
                  {selectedSliceId ? (
                    <div
                      className="panel"
                      style={{
                        marginBottom: '1rem',
                        background: 'rgba(14,165,233,0.1)',
                        border: '2px solid var(--accent-strong)',
                        padding: '1rem'
                      }}
                    >
                      <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--accent-strong)' }}>
                        Selected Appointment Time:
                      </strong>
                      <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                        {(() => {
                          const [dateStr, hourStr] = selectedSliceId.split('@');
                          if (!dateStr || !hourStr) return 'Invalid selection';
                          const date = new Date(dateStr + 'T00:00:00');
                          const hour = parseInt(hourStr, 10);
                          if (isNaN(hour)) return 'Invalid selection';
                          const dateFormatted = date.toLocaleDateString([], {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                          });
                          const timeFormatted = `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:00`;
                          return `${dateFormatted} at ${timeFormatted}`;
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="panel"
                      style={{
                        marginBottom: '1rem',
                        background: 'var(--bg-soft)',
                        padding: '0.75rem',
                        textAlign: 'center',
                        color: 'var(--text-muted)'
                      }}
                    >
                      Click on an available time slot below to select your appointment time
                    </div>
                  )}

                  <div
                    style={{
                      overflowX: 'auto',
                      overflowY: 'visible',
                      marginBottom: '1rem',
                      maxWidth: '100%',
                      border: '1px solid var(--border-soft)',
                      borderRadius: '0.5rem',
                      position: 'relative'
                    }}
                    role="region"
                    aria-label="Appointment scheduling calendar"
                  >
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        background: 'var(--bg-primary)',
                        margin: 0
                      }}
                      role="grid"
                      aria-label="Time slots and availability calendar"
                    >
                      <thead>
                        <tr role="row">
                          <th
                            role="columnheader"
                            scope="col"
                            style={{
                              padding: '0.75rem',
                              textAlign: 'left',
                              background: 'var(--bg-soft)',
                              border: '1px solid var(--border-soft)',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              position: 'sticky',
                              left: 0,
                              zIndex: 10,
                              minWidth: '80px'
                            }}
                          >
                            Time
                          </th>
                          {calendarDays.map((day) => (
                            <th
                              key={day.toISOString()}
                              role="columnheader"
                              scope="col"
                              style={{
                                padding: '0.75rem',
                                textAlign: 'center',
                                background: 'var(--bg-soft)',
                                border: '1px solid var(--border-soft)',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                minWidth: '120px'
                              }}
                            >
                              <div>{day.toLocaleDateString([], { weekday: 'short' })}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                {day.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {timeSlots.map((timeSlot, timeIndex) => {
                          const hour = 10 + timeIndex;
                          return (
                            <tr key={timeSlot} role="row">
                              <th
                                role="rowheader"
                                scope="row"
                              style={{
                                  padding: '0.75rem',
                                  background: 'var(--bg-soft)',
                                  border: '1px solid var(--border-soft)',
                                  fontSize: '0.85rem',
                                  fontWeight: 600,
                                  position: 'sticky',
                                  left: 0,
                                  zIndex: 5,
                                  minWidth: '80px'
                                }}
                              >
                                {timeSlot}
                              </th>
                              {calendarDays.map((day) => {
                                // Use '@' separator to avoid conflicts with date format
                                const dateStr = day.toISOString().split('T')[0];
                                const slotId = `${dateStr}@${hour}`;
                                const slotStatus = isSlotAvailable(day, hour, doctorAvailability, doctorAppointments);
                                const isSelected = selectedSliceId === slotId;
                                const slotStart = new Date(day);
                                slotStart.setHours(hour, 0, 0, 0);
                                const isPast = slotStart.getTime() < Date.now();
                                const isClickable = slotStatus.available && !isPast;

                                let cellStyle: Record<string, string | number> = {
                                  padding: '0.75rem',
                                  border: '1px solid var(--border-soft)',
                                  textAlign: 'center',
                                  cursor: isClickable ? 'pointer' : 'default',
                                  background: isPast
                                    ? 'var(--bg-soft)'
                                    : slotStatus.hasAppointment
                                    ? 'rgba(239,68,68,0.15)'
                                    : slotStatus.booked
                                    ? 'rgba(148,163,184,0.15)'
                                    : slotStatus.available
                                    ? isSelected
                                      ? 'rgba(14,165,233,0.3)'
                                      : 'rgba(34,197,94,0.1)'
                                    : 'rgba(148,163,184,0.05)',
                                  borderColor: isSelected ? 'var(--accent-strong)' : 'var(--border-soft)',
                                  borderWidth: isSelected ? '2px' : '1px',
                                  transition: 'all 0.2s',
                                  minWidth: '120px'
                                };


                                const dateLabel = day.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                                const slotLabel = `${dateLabel} at ${timeSlot}`;
                                const ariaLabel = isPast
                                  ? `${slotLabel} - Past slot`
                                  : slotStatus.hasAppointment
                                  ? `${slotLabel} - Booked appointment`
                                  : slotStatus.available
                                  ? `${slotLabel} - Available${isSelected ? ' (Selected)' : ''}`
                                  : `${slotLabel} - Not available`;

                                return (
                                  <td
                                    key={day.toISOString()}
                                    role="gridcell"
                                    style={{
                                      padding: '0.5rem',
                                      border: '1px solid var(--border-soft)',
                                      textAlign: 'center',
                                      minWidth: '120px',
                                      verticalAlign: 'middle'
                                    }}
                                  >
                                    {isPast ? (
                                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Past</span>
                                    ) : slotStatus.hasAppointment ? (
                                      <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600 }}>Booked</span>
                                    ) : slotStatus.available ? (
                            <button
                              type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          console.log('Slot clicked:', slotId);
                                          setSelectedSliceId(slotId);
                                        }}
                              className="primary-btn"
                              style={{
                                          width: '100%',
                                          padding: '0.75rem 0.5rem',
                                          border: isSelected ? '2px solid var(--accent-strong)' : '2px solid #22c55e',
                                          borderRadius: '0.5rem',
                                background: isSelected
                                            ? 'var(--accent-strong)' 
                                            : '#22c55e',
                                          color: 'white',
                                          fontSize: '0.9rem',
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          transition: 'all 0.2s',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '0.25rem',
                                          boxShadow: isSelected 
                                            ? '0 2px 8px rgba(14,165,233,0.3)' 
                                            : '0 2px 4px rgba(34,197,94,0.2)',
                                          position: 'relative',
                                          zIndex: 1
                                        }}
                                        onMouseEnter={(e) => {
                                          if (!isSelected) {
                                            e.currentTarget.style.background = '#16a34a';
                                            e.currentTarget.style.transform = 'scale(1.05)';
                                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(34,197,94,0.3)';
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (!isSelected) {
                                            e.currentTarget.style.background = '#22c55e';
                                            e.currentTarget.style.transform = 'scale(1)';
                                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(34,197,94,0.2)';
                                          }
                                        }}
                                        aria-label={ariaLabel}
                                        aria-pressed={isSelected}
                                      >
                                        {isSelected ? '✓ Selected' : '✓ Available'}
                            </button>
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                                    )}
                                  </td>
                          );
                        })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                      </div>

                  <div className="form-actions" style={{ marginTop: '1rem' }}>
                      <button
                        className="primary-btn"
                        type="submit"
                      disabled={
                        (createCaseAndAppointmentMutation.isPending || createAppointmentMutation.isPending) ||
                        !selectedSlot ||
                        (!selectedCase && !newCaseForm.doctorId)
                      }
                    >
                      {(createCaseAndAppointmentMutation.isPending || createAppointmentMutation.isPending)
                        ? 'Scheduling...'
                        : selectedCase
                        ? 'Schedule Appointment'
                        : 'Create Case & Schedule Appointment'}
                      </button>
                  </div>
                </form>
              )}

              {scheduleError ? <div className="feedback error" style={{ marginTop: '0.75rem' }}>{scheduleError}</div> : null}
              {scheduleMessage ? <div className="feedback success" style={{ marginTop: '0.75rem' }}>{scheduleMessage}</div> : null}
              
              {/* Confirmation Modal */}
              {confirmationModal?.show ? (
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'var(--bg-base)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '1rem'
                  }}
                  onClick={() => {
                    // Close modal when clicking outside
                    handleCloseConfirmation();
                  }}
                >
                  <div
                    className="panel"
                    style={{
                      maxWidth: '500px',
                      width: '100%',
                      padding: '2rem',
                      background: 'var(--bg-panel)',
                      borderRadius: '0.75rem',
                      boxShadow: 'var(--shadow-soft)',
                      border: '2px solid var(--border-soft)'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h2 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--accent-strong)' }}>
                      ✓ Appointment Scheduled Successfully
                    </h2>
                    
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-soft)', borderRadius: '0.5rem', border: '1px solid var(--border-soft)' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 500 }}>Patient</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {confirmationModal.patientName}
                        </div>
                      </div>
                      
                      <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-soft)', borderRadius: '0.5rem', border: '1px solid var(--border-soft)' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 500 }}>Doctor</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {confirmationModal.doctorName}
                        </div>
                      </div>
                      
                      <div style={{ padding: '1rem', background: 'var(--bg-soft)', borderRadius: '0.5rem', border: '1px solid var(--border-soft)' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 500 }}>Appointment Time</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {confirmationModal.appointmentTime}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={handleCloseConfirmation}
                        style={{
                          padding: '0.75rem 2rem',
                          fontSize: '1rem',
                          fontWeight: 600
                        }}
                      >
                        Okay
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : selectedPatient ? (
            <p style={{ color: 'var(--text-muted)' }}>Select an existing case or create a new one to continue.</p>
          ) : null}
        </section>
      ) : null}

      <article className="panel" style={{ marginBottom: '1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
          Status filter
          <select value={statusFilter} onChange={handleStatusChange} style={{ borderRadius: '0.9rem', border: '1px solid var(--border-soft)', padding: '0.6rem 0.9rem' }}>
            <option value="ALL">All statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="NO_SHOW">No-show</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={upcomingOnly} onChange={handleUpcomingToggle} /> Upcoming only
        </label>
      </article>

      <article className="panel table-card">
        <table>
          <thead>
            <tr>
              <th>Case</th>
              <th>Start</th>
              <th>End</th>
              <th>Doctor</th>
              <th>Patient</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem' }}>
                  Loading appointment board...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: '#dc2626' }}>
                  {errorMessage}
                </td>
              </tr>
            ) : appointments.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem' }}>
                  No appointments match the current filters.
                </td>
              </tr>
            ) : (
              appointments.map((appointment) => (
                <tr key={appointment.id}>
                  <td>{appointment.case_code}</td>
                  <td>{formatDateTime(appointment.start_time)}</td>
                  <td>{formatDateTime(appointment.end_time)}</td>
                  <td>{`${appointment.doctor.first_name} ${appointment.doctor.last_name}`}</td>
                  <td>{patientLabel(appointment)}</td>
                  <td>
                    {canSchedule || user.role === 'DOCTOR' ? (
                      <select
                        value={appointment.status}
                        onChange={(e) => {
                          updateAppointmentMutation.mutate({
                            appointmentId: appointment.id,
                            status: e.target.value as AppointmentSummary['status']
                          });
                        }}
                        disabled={updateAppointmentMutation.isPending}
                        style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '0.25rem',
                          border: '1px solid var(--border-soft)',
                          fontSize: '0.85rem'
                        }}
                      >
                        <option value="SCHEDULED">SCHEDULED</option>
                        <option value="COMPLETED">COMPLETED</option>
                        <option value="CANCELLED">CANCELLED</option>
                        <option value="NO_SHOW">NO_SHOW</option>
                      </select>
                    ) : (
                    <span className="status-pill" style={{ fontSize: '0.7rem' }}>
                      {appointment.status}
                    </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </div>
  );
};
