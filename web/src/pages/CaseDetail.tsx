import { FormEvent, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { CaseDetail, VisitSummary, PrescriptionSummary, FileSummary } from '../types';

const describeError = (error: unknown) => {
  if (error instanceof ApiError) {
    return error.detail || `Request failed (${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error occurred.';
};

export const CaseDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { authedRequest, user } = useAuth();
  const queryClient = useQueryClient();

  const [showVisitForm, setShowVisitForm] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [editingPrescriptionVisitId, setEditingPrescriptionVisitId] = useState<string | null>(null);
  const [showFileUpload, setShowFileUpload] = useState(false);

  const caseQuery = useQuery({
    queryKey: ['case-detail', id],
    queryFn: () => authedRequest<{ case: CaseDetail }>(`/cases/${id}`)
  });

  const visitsQuery = useQuery({
    queryKey: ['case-visits', id],
    queryFn: () => authedRequest<{ data: VisitSummary[] }>(`/cases/${id}/visits?limit=100`),
    enabled: Boolean(id)
  });

  const filesQuery = useQuery({
    queryKey: ['case-files', id],
    queryFn: () => authedRequest<{ data: FileSummary[] }>(`/cases/${id}/files`),
    enabled: Boolean(id)
  });

  const caseRecord = caseQuery.data?.case;
  const visits = visitsQuery.data?.data ?? [];
  const files = filesQuery.data?.data ?? [];

  const isDoctor = user.role === 'DOCTOR';
  const isAdmin = user.role === 'ADMIN';
  const canEdit = isDoctor || isAdmin;
  const canClose = isDoctor && caseRecord?.status === 'OPEN' && caseRecord?.assigned_doctor?.id;

  // Visit form state
  const [visitForm, setVisitForm] = useState({
    visit_datetime: new Date().toISOString().slice(0, 16),
    vitals: JSON.stringify({}, null, 2),
    notes: ''
  });

  // Prescription form state
  const [prescriptionForm, setPrescriptionForm] = useState({
    medication_name: '',
    dosage: '',
    frequency: '',
    route: '',
    duration: '',
    notes: ''
  });

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileVisitId, setFileVisitId] = useState<string | null>(null);

  const createVisitMutation = useMutation<{ visit: VisitSummary }, unknown, typeof visitForm>({
    mutationFn: async (payload) => {
      let vitalsParsed: Record<string, unknown> = {};
      try {
        vitalsParsed = JSON.parse(payload.vitals);
      } catch {
        vitalsParsed = {};
      }
      return authedRequest<{ visit: VisitSummary }>(`/cases/${id}/visits`, {
        method: 'POST',
        body: {
          visit_datetime: payload.visit_datetime,
          vitals: vitalsParsed,
          notes: payload.notes
        }
      });
    },
    onSuccess: () => {
      setShowVisitForm(false);
      setVisitForm({
        visit_datetime: new Date().toISOString().slice(0, 16),
        vitals: JSON.stringify({}, null, 2),
        notes: ''
      });
      queryClient.invalidateQueries({ queryKey: ['case-visits', id] });
      queryClient.invalidateQueries({ queryKey: ['case-detail', id] });
    }
  });

  const updateVisitMutation = useMutation<{ visit: VisitSummary }, unknown, { visitId: string; data: Partial<typeof visitForm> }>({
    mutationFn: async ({ visitId, data }) => {
      const body: Record<string, unknown> = {};
      if (data.visit_datetime) body.visit_datetime = data.visit_datetime;
      if (data.notes !== undefined) body.notes = data.notes;
      if (data.vitals) {
        try {
          body.vitals = JSON.parse(data.vitals);
        } catch {
          body.vitals = {};
        }
      }
      return authedRequest<{ visit: VisitSummary }>(`/visits/${visitId}`, {
        method: 'PATCH',
        body
      });
    },
    onSuccess: () => {
      setEditingVisitId(null);
      queryClient.invalidateQueries({ queryKey: ['case-visits', id] });
    }
  });

  const upsertPrescriptionMutation = useMutation<{ prescription: PrescriptionSummary }, unknown, { visitId: string; data: typeof prescriptionForm }>({
    mutationFn: async ({ visitId, data }) => {
      return authedRequest<{ prescription: PrescriptionSummary }>(`/visits/${visitId}/prescription`, {
        method: 'PUT',
        body: {
          medication_name: data.medication_name,
          dosage: data.dosage,
          frequency: data.frequency,
          route: data.route,
          duration: data.duration,
          notes: data.notes || undefined
        }
      });
    },
    onSuccess: () => {
      setEditingPrescriptionVisitId(null);
      setPrescriptionForm({
        medication_name: '',
        dosage: '',
        frequency: '',
        route: '',
        duration: '',
        notes: ''
      });
      queryClient.invalidateQueries({ queryKey: ['case-visits', id] });
    }
  });

  const closeCaseMutation = useMutation<{ case: CaseDetail }, unknown, { summary?: string }>({
    mutationFn: async (payload) => {
      return authedRequest<{ case: CaseDetail }>(`/cases/${id}/close`, {
        method: 'POST',
        body: payload
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
    }
  });

  const fileUploadMutation = useMutation<{ file: FileSummary }, unknown, FormData>({
    mutationFn: async (formData) => {
      return authedRequest<{ file: FileSummary }>('/files', {
        method: 'POST',
        body: formData
      });
    },
    onSuccess: () => {
      setShowFileUpload(false);
      setSelectedFile(null);
      setFileVisitId(null);
      queryClient.invalidateQueries({ queryKey: ['case-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['case-files', id] });
    }
  });

  const handleCreateVisit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createVisitMutation.mutate(visitForm);
  };

  const handleUpdateVisit = (event: FormEvent<HTMLFormElement>, visitId: string) => {
    event.preventDefault();
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) return;
    updateVisitMutation.mutate({ visitId, data: visitForm });
  };

  const handleUpsertPrescription = (event: FormEvent<HTMLFormElement>, visitId: string) => {
    event.preventDefault();
    upsertPrescriptionMutation.mutate({ visitId, data: prescriptionForm });
  };

  const handleCloseCase = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    closeCaseMutation.mutate({
      summary: (formData.get('summary') as string) || undefined
    });
  };

  const handleFileUpload = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('case_id', id!);
    if (fileVisitId) {
      formData.append('visit_id', fileVisitId);
    }

    fileUploadMutation.mutate(formData);
  };

  const handleDownloadFile = async (fileId: string) => {
    try {
      const response = await authedRequest<{ url: string; expires_at: string }>(`/files/${fileId}/download`);
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
      const fullUrl = response.url.startsWith('http') ? response.url : `${apiBaseUrl}${response.url}`;
      window.open(fullUrl, '_blank');
    } catch (err) {
      alert(describeError(err));
    }
  };

  const startEditingVisit = (visit: VisitSummary) => {
    setEditingVisitId(visit.id);
    setVisitForm({
      visit_datetime: new Date(visit.visit_datetime).toISOString().slice(0, 16),
      vitals: JSON.stringify(visit.vitals, null, 2),
      notes: visit.notes
    });
  };

  const startEditingPrescription = (visit: VisitSummary) => {
    if (visit.prescription) {
      setEditingPrescriptionVisitId(visit.id);
      setPrescriptionForm({
        medication_name: visit.prescription.medication_name,
        dosage: visit.prescription.dosage,
        frequency: visit.prescription.frequency,
        route: visit.prescription.route,
        duration: visit.prescription.duration,
        notes: visit.prescription.notes || ''
      });
    } else {
      setEditingPrescriptionVisitId(visit.id);
      setPrescriptionForm({
        medication_name: '',
        dosage: '',
        frequency: '',
        route: '',
        duration: '',
        notes: ''
      });
    }
  };

  if (caseQuery.isLoading) {
    return (
      <div>
        <div className="page-heading">
          <h1>Case Details</h1>
        </div>
        <article className="panel">Loading case details...</article>
      </div>
    );
  }

  if (caseQuery.isError || !caseRecord) {
    return (
      <div>
        <div className="page-heading">
          <h1>Case Details</h1>
        </div>
        <article className="panel">
          <p className="feedback error">{describeError(caseQuery.error)}</p>
          <button className="primary-btn" onClick={() => navigate('/cases')}>
            Back to Cases
          </button>
        </article>
      </div>
    );
  }

  return (
    <div>
      <div className="page-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Case {caseRecord.case_code}</h1>
            <span>Status: {caseRecord.status}</span>
          </div>
          <button className="ghost-btn" onClick={() => navigate('/cases')}>
            ← Back
          </button>
        </div>
      </div>

      <article className="panel" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginTop: 0 }}>Case Information</h2>
        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          <div>
            <strong>Patient:</strong>{' '}
            {caseRecord.patient
              ? `${caseRecord.patient.first_name} ${caseRecord.patient.last_name} (${caseRecord.patient.patient_code})`
              : 'N/A'}
          </div>
          <div>
            <strong>Assigned Doctor:</strong>{' '}
            {caseRecord.assigned_doctor
              ? `${caseRecord.assigned_doctor.first_name} ${caseRecord.assigned_doctor.last_name}`
              : 'Unassigned'}
          </div>
          <div>
            <strong>Created:</strong> {new Date(caseRecord.created_at).toLocaleString()}
          </div>
          {caseRecord.closed_at ? (
            <div>
              <strong>Closed:</strong> {new Date(caseRecord.closed_at).toLocaleString()}
            </div>
          ) : null}
        </div>
        {caseRecord.summary ? (
          <div style={{ marginTop: '1rem' }}>
            <strong>Summary:</strong>
            <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>{caseRecord.summary}</p>
          </div>
        ) : null}
        {caseRecord.symptoms_text ? (
          <div style={{ marginTop: '1rem' }}>
            <strong>Symptoms:</strong>
            <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>{caseRecord.symptoms_text}</p>
          </div>
        ) : null}
      </article>

      {canEdit && caseRecord.status === 'OPEN' ? (
        <article className="panel" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>Actions</h2>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!showVisitForm ? (
              <button className="primary-btn" onClick={() => setShowVisitForm(true)}>
                Add Visit
              </button>
            ) : null}
            {!showFileUpload ? (
              <button className="primary-btn" onClick={() => setShowFileUpload(true)}>
                Upload File
              </button>
            ) : null}
            {canClose ? (
              <button
                className="primary-btn"
                onClick={() => {
                  if (confirm('Are you sure you want to close this case? This action cannot be undone.')) {
                    closeCaseMutation.mutate({});
                  }
                }}
                disabled={closeCaseMutation.isPending}
              >
                {closeCaseMutation.isPending ? 'Closing...' : 'Close Case'}
              </button>
            ) : null}
          </div>

          {showVisitForm ? (
            <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--border-soft)', borderRadius: '0.5rem' }}>
              <h3 style={{ marginTop: 0 }}>Create Visit</h3>
              <form onSubmit={handleCreateVisit} className="form-grid">
                <label>
                  Visit Date & Time
                  <input
                    type="datetime-local"
                    required
                    value={visitForm.visit_datetime}
                    onChange={(e) => setVisitForm((prev) => ({ ...prev, visit_datetime: e.target.value }))}
                  />
                </label>
                <label>
                  Vitals (JSON)
                  <textarea
                    rows={4}
                    value={visitForm.vitals}
                    onChange={(e) => setVisitForm((prev) => ({ ...prev, vitals: e.target.value }))}
                    placeholder='{"blood_pressure": "120/80", "temperature": "98.6"}'
                  />
                </label>
                <label>
                  Notes
                  <textarea
                    rows={4}
                    required
                    value={visitForm.notes}
                    onChange={(e) => setVisitForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </label>
                <div className="form-actions">
                  <button className="primary-btn" type="submit" disabled={createVisitMutation.isPending}>
                    {createVisitMutation.isPending ? 'Creating...' : 'Create Visit'}
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => setShowVisitForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
              {createVisitMutation.isError ? (
                <div className="feedback error" style={{ marginTop: '0.75rem' }}>
                  {describeError(createVisitMutation.error)}
                </div>
              ) : null}
            </div>
          ) : null}

          {showFileUpload ? (
            <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--border-soft)', borderRadius: '0.5rem' }}>
              <h3 style={{ marginTop: 0 }}>Upload File</h3>
              <form onSubmit={handleFileUpload} className="form-grid">
                <label>
                  File
                  <input
                    type="file"
                    required
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    accept=".pdf,.txt,.png,.jpg,.jpeg"
                  />
                </label>
                {visits.length > 0 ? (
                  <label>
                    Link to Visit (optional)
                    <select value={fileVisitId || ''} onChange={(e) => setFileVisitId(e.target.value || null)}>
                      <option value="">Case-level file</option>
                      {visits.map((visit) => (
                        <option key={visit.id} value={visit.id}>
                          Visit #{visit.visit_number} - {new Date(visit.visit_datetime).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="form-actions">
                  <button className="primary-btn" type="submit" disabled={fileUploadMutation.isPending || !selectedFile}>
                    {fileUploadMutation.isPending ? 'Uploading...' : 'Upload'}
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => setShowFileUpload(false)}>
                    Cancel
                  </button>
                </div>
              </form>
              {fileUploadMutation.isError ? (
                <div className="feedback error" style={{ marginTop: '0.75rem' }}>
                  {describeError(fileUploadMutation.error)}
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      ) : null}

      <article className="panel" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginTop: 0 }}>Visits ({visits.length})</h2>
        {visitsQuery.isLoading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading visits...</p>
        ) : visits.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No visits recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {visits.map((visit) => (
              <div key={visit.id} style={{ padding: '1rem', border: '1px solid var(--border-soft)', borderRadius: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                  <div>
                    <strong>Visit #{visit.visit_number}</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {new Date(visit.visit_datetime).toLocaleString()}
                    </div>
                  </div>
                  {canEdit && caseRecord.status === 'OPEN' && editingVisitId !== visit.id ? (
                    <button className="ghost-btn" onClick={() => startEditingVisit(visit)}>
                      Edit
                    </button>
                  ) : null}
                </div>

                {editingVisitId === visit.id ? (
                  <form onSubmit={(e) => handleUpdateVisit(e, visit.id)} className="form-grid">
                    <label>
                      Visit Date & Time
                      <input
                        type="datetime-local"
                        required
                        value={visitForm.visit_datetime}
                        onChange={(e) => setVisitForm((prev) => ({ ...prev, visit_datetime: e.target.value }))}
                      />
                    </label>
                    <label>
                      Vitals (JSON)
                      <textarea
                        rows={4}
                        value={visitForm.vitals}
                        onChange={(e) => setVisitForm((prev) => ({ ...prev, vitals: e.target.value }))}
                      />
                    </label>
                    <label>
                      Notes
                      <textarea
                        rows={4}
                        required
                        value={visitForm.notes}
                        onChange={(e) => setVisitForm((prev) => ({ ...prev, notes: e.target.value }))}
                      />
                    </label>
                    <div className="form-actions">
                      <button className="primary-btn" type="submit" disabled={updateVisitMutation.isPending}>
                        {updateVisitMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                      <button type="button" className="ghost-btn" onClick={() => setEditingVisitId(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div style={{ marginTop: '0.75rem' }}>
                      <strong>Vitals:</strong>
                      <pre style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--bg-soft)', borderRadius: '0.25rem', fontSize: '0.85rem' }}>
                        {JSON.stringify(visit.vitals, null, 2)}
                      </pre>
                    </div>
                    <div style={{ marginTop: '0.75rem' }}>
                      <strong>Notes:</strong>
                      <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{visit.notes}</p>
                    </div>
                  </>
                )}

                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>Prescription</strong>
                    {canEdit && caseRecord.status === 'OPEN' && editingPrescriptionVisitId !== visit.id ? (
                      <button className="ghost-btn" onClick={() => startEditingPrescription(visit)}>
                        {visit.prescription ? 'Edit' : 'Add'}
                      </button>
                    ) : null}
                  </div>

                  {editingPrescriptionVisitId === visit.id ? (
                    <form onSubmit={(e) => handleUpsertPrescription(e, visit.id)} className="form-grid" style={{ marginTop: '0.75rem' }}>
                      <label>
                        Medication Name
                        <input
                          required
                          value={prescriptionForm.medication_name}
                          onChange={(e) => setPrescriptionForm((prev) => ({ ...prev, medication_name: e.target.value }))}
                        />
                      </label>
                      <label>
                        Dosage
                        <input
                          required
                          value={prescriptionForm.dosage}
                          onChange={(e) => setPrescriptionForm((prev) => ({ ...prev, dosage: e.target.value }))}
                        />
                      </label>
                      <label>
                        Frequency
                        <input
                          required
                          value={prescriptionForm.frequency}
                          onChange={(e) => setPrescriptionForm((prev) => ({ ...prev, frequency: e.target.value }))}
                        />
                      </label>
                      <label>
                        Route
                        <input
                          required
                          value={prescriptionForm.route}
                          onChange={(e) => setPrescriptionForm((prev) => ({ ...prev, route: e.target.value }))}
                        />
                      </label>
                      <label>
                        Duration
                        <input
                          required
                          value={prescriptionForm.duration}
                          onChange={(e) => setPrescriptionForm((prev) => ({ ...prev, duration: e.target.value }))}
                        />
                      </label>
                      <label>
                        Notes
                        <textarea
                          rows={2}
                          value={prescriptionForm.notes}
                          onChange={(e) => setPrescriptionForm((prev) => ({ ...prev, notes: e.target.value }))}
                        />
                      </label>
                      <div className="form-actions">
                        <button className="primary-btn" type="submit" disabled={upsertPrescriptionMutation.isPending}>
                          {upsertPrescriptionMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" className="ghost-btn" onClick={() => setEditingPrescriptionVisitId(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : visit.prescription ? (
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-soft)', borderRadius: '0.25rem' }}>
                      <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                        <div>
                          <strong>Medication:</strong> {visit.prescription.medication_name}
                        </div>
                        <div>
                          <strong>Dosage:</strong> {visit.prescription.dosage}
                        </div>
                        <div>
                          <strong>Frequency:</strong> {visit.prescription.frequency}
                        </div>
                        <div>
                          <strong>Route:</strong> {visit.prescription.route}
                        </div>
                        <div>
                          <strong>Duration:</strong> {visit.prescription.duration}
                        </div>
                        {visit.prescription.notes ? (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <strong>Notes:</strong> {visit.prescription.notes}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)' }}>No prescription recorded.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="panel">
        <h2 style={{ marginTop: 0 }}>Files ({files.length})</h2>
        {filesQuery.isLoading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading files...</p>
        ) : files.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No files uploaded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {files.map((file) => (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem',
                  border: '1px solid var(--border-soft)',
                  borderRadius: '0.25rem'
                }}
              >
                <div>
                  <strong>{file.filename}</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {file.mimetype} • {(file.size_bytes / 1024).toFixed(2)} KB
                    {file.visitId ? ` • Linked to visit` : ' • Case-level'}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    Uploaded {new Date(file.created_at).toLocaleString()}
                  </div>
                </div>
                <button className="primary-btn" onClick={() => handleDownloadFile(file.id)}>
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
};

