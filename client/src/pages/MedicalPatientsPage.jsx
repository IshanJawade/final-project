import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function MedicalPatientsPage() {
  const { token } = useAuth();
  const [patients, setPatients] = useState([]);
  const [patientError, setPatientError] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientRecords, setPatientRecords] = useState([]);

  const [newRecordForm, setNewRecordForm] = useState({ summary: '', notes: '' });
  const [newRecordMessage, setNewRecordMessage] = useState('');
  const [newRecordError, setNewRecordError] = useState('');

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    []
  );

  useEffect(() => {
    loadPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPatients() {
    try {
      const payload = await apiRequest('/api/medical/patients', { token });
      setPatients(payload.patients || []);
      setPatientError('');
    } catch (err) {
      setPatientError(err.message);
      setPatients([]);
    }
  }

  async function loadPatientRecords(userId) {
    try {
      const payload = await apiRequest(`/api/medical/patients/${userId}/records`, { token });
      setPatientRecords(payload.records || []);
      setNewRecordError('');
    } catch (err) {
      setNewRecordError(err.message);
      setPatientRecords([]);
    }
  }

  const formatDateTime = (value, fallback = '—') => {
    if (!value) {
      return fallback;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return fallback;
    }
    return dateTimeFormatter.format(date);
  };

  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    setNewRecordForm({ summary: '', notes: '' });
    setNewRecordMessage('');
    setNewRecordError('');
    loadPatientRecords(patient.id);
  };

  const handleCreateRecord = async (evt) => {
    evt.preventDefault();
    if (!selectedPatient) return;
    setNewRecordError('');
    setNewRecordMessage('');
    try {
      await apiRequest(`/api/medical/patients/${selectedPatient.id}/records`, {
        method: 'POST',
        token,
        body: { data: { summary: newRecordForm.summary, notes: newRecordForm.notes } },
      });
      setNewRecordMessage('Record saved.');
      setNewRecordForm({ summary: '', notes: '' });
      loadPatientRecords(selectedPatient.id);
    } catch (err) {
      setNewRecordError(err.message);
    }
  };

  return (
    <>
      <div className="panel">
        <h2>My Patients</h2>
        {patientError && <div className="alert alert-error">{patientError}</div>}
        {patients.length === 0 && <p className="muted">No patients have granted access.</p>}
        {patients.length > 0 && (
          <div className="table-wrapper">
            <table className="table table-patients">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>MUID</th>
                  <th>Expires</th>
                  <th className="actions-col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <tr key={patient.id}>
                    <td>{patient.name}</td>
                    <td>{patient.muid}</td>
                    <td className="date-cell">
                      {patient.access_expires_at
                        ? formatDateTime(patient.access_expires_at, 'No expiry')
                        : 'No expiry'}
                    </td>
                    <td className="actions-cell">
                      <button type="button" onClick={() => handleSelectPatient(patient)}>
                        View Records
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedPatient && (
        <div className="panel">
          <h2>Records for {selectedPatient.name}</h2>
          {newRecordError && <div className="alert alert-error">{newRecordError}</div>}
          {newRecordMessage && <div className="alert alert-success">{newRecordMessage}</div>}
          <form className="form-grid" onSubmit={handleCreateRecord}>
            <label>
              Summary
              <input
                value={newRecordForm.summary}
                onChange={(evt) =>
                  setNewRecordForm((prev) => ({ ...prev, summary: evt.target.value }))
                }
                required
              />
            </label>
            <label>
              Notes
              <textarea
                rows="3"
                value={newRecordForm.notes}
                onChange={(evt) =>
                  setNewRecordForm((prev) => ({ ...prev, notes: evt.target.value }))
                }
                required
              />
            </label>
            <button type="submit">Add Record</button>
          </form>
          {patientRecords.length === 0 && <p className="muted">No records available.</p>}
          {patientRecords.map((record) => (
            <div key={record.id} className="record-card">
              <div>
                <strong>Record #{record.id}</strong> • {new Date(record.created_at).toLocaleString()}
              </div>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(record.data, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
