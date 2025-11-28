import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { AppointmentSummary, CaseSummary, DoctorSummary, PatientSummary, SpecializationSummary } from '../types';

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

// Generate simple 1-hour slots from 9 AM to 4 PM for the next 14 days
const generateSimpleSlots = (): HourSlice[] => {
  const slots: HourSlice[] = [];
  const now = new Date();
  const startHour = 9; // 9 AM
  const endHour = 16; // 4 PM (16:00)
  const daysAhead = 14;

  for (let day = 0; day < daysAhead; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() + day);
    date.setHours(0, 0, 0, 0);

    for (let hour = startHour; hour < endHour; hour++) {
      const slotStart = new Date(date);
      slotStart.setHours(hour, 0, 0, 0);

      const slotEnd = new Date(date);
      slotEnd.setHours(hour + 1, 0, 0, 0);

      // Only include future slots
      if (slotStart.getTime() >= now.getTime()) {
        slots.push({
          id: `${date.toISOString().split('T')[0]}-${hour}`,
          start: slotStart.toISOString(),
          end: slotEnd.toISOString()
        });
      }
    }
  }

  return slots;
};

const sliceLabel = (slice: HourSlice) => {
  const start = new Date(slice.start);
  const datePart = start.toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' });
  const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${datePart} at ${startTime}`;
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

  // Generate simple slots (9 AM - 4 PM, 1 hour each, next 14 days)
  const hourlySlices = useMemo(() => generateSimpleSlots(), []);
  const selectedSlice = useMemo(() => hourlySlices.find((slice) => slice.id === selectedSliceId) ?? null, [hourlySlices, selectedSliceId]);

  useEffect(() => {
    if (selectedSliceId && !hourlySlices.some((slice) => slice.id === selectedSliceId)) {
      setSelectedSliceId(null);
    }
  }, [hourlySlices, selectedSliceId]);

  const updateAppointmentMutation = useMutation<{ appointment: AppointmentSummary }, unknown, { appointmentId: string; status: AppointmentSummary['status'] }>({
    mutationFn: ({ appointmentId, status }) => {
      return authedRequest<{ appointment: AppointmentSummary }>(`/appointments/${appointmentId}`, {
        method: 'PATCH',
        body: { status }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && queryItem.queryKey[0] === 'appointments' });
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
      setScheduleMessage(`Created case ${response.case.case_code} and scheduled appointment for ${new Date(response.appointment.start_time).toLocaleString()}.`);
      setSelectedSliceId(null);
      setSelectedCase(null);
      setNewCaseForm({ doctorId: '', summary: '', symptoms_text: '' });
      queryClient.invalidateQueries({ queryKey: ['patient-cases'] });
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && queryItem.queryKey[0] === 'appointments' });
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
      setScheduleMessage(`Scheduled appointment for ${new Date(response.appointment.start_time).toLocaleString()}.`);
      setSelectedSliceId(null);
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && queryItem.queryKey[0] === 'appointments' });
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

  const handleSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setScheduleMessage(null);
    setScheduleError(null);

    if (!selectedSlice) {
      setScheduleError('Select a time slot.');
      return;
    }

    if (selectedCase) {
      // Use existing case
      createAppointmentMutation.mutate({
        caseId: selectedCase.id,
        startIso: selectedSlice.start,
        endIso: selectedSlice.end
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
        startIso: selectedSlice.start,
        endIso: selectedSlice.end
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

          {/* Step 3: Schedule Appointment */}
          {selectedPatient && (selectedCase || newCaseForm.doctorId) ? (
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Step 3: Select Time Slot</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                {selectedCase
                  ? `Select a time slot for ${formatDoctor(selectedCase)}.`
                  : `Select a time slot. A new case will be created with the selected doctor.`}
                {' '}Available slots are 9 AM to 4 PM, 1 hour each.
              </p>
              <form onSubmit={handleSchedule}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                    {hourlySlices.map((slice) => {
                      const isSelected = selectedSliceId === slice.id;
                      return (
                        <button
                          key={slice.id}
                          type="button"
                          className="primary-btn"
                          onClick={() => setSelectedSliceId(slice.id)}
                          style={{
                            background: isSelected
                              ? 'linear-gradient(135deg, rgba(14,165,233,0.35), rgba(34,211,238,0.25))'
                              : 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(34,211,238,0.15))',
                            color: 'var(--text-primary)',
                            padding: '0.75rem 1rem',
                            fontSize: '0.9rem'
                          }}
                        >
                          {sliceLabel(slice)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="form-actions" style={{ marginTop: '1rem' }}>
                    <button
                      className="primary-btn"
                      type="submit"
                      disabled={
                        (createCaseAndAppointmentMutation.isPending || createAppointmentMutation.isPending) ||
                        !selectedSlice ||
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
                </div>
              </form>
              {scheduleError ? <div className="feedback error" style={{ marginTop: '0.75rem' }}>{scheduleError}</div> : null}
              {scheduleMessage ? <div className="feedback success" style={{ marginTop: '0.75rem' }}>{scheduleMessage}</div> : null}
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
