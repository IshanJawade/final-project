import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE, apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function MedicalPatientsPage() {
  const { token } = useAuth();
  const [patients, setPatients] = useState([]);
  const [patientError, setPatientError] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientRecords, setPatientRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [newRecordForm, setNewRecordForm] = useState({ summary: '', notes: '' });
  const [newRecordFiles, setNewRecordFiles] = useState([]);
  const [newRecordMessage, setNewRecordMessage] = useState('');
  const [newRecordError, setNewRecordError] = useState('');
  const [attachmentError, setAttachmentError] = useState('');
  const fileInputRef = useRef(null);
  const activeRecordsRequestRef = useRef(null);
  const MAX_FILES = 5;

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
    activeRecordsRequestRef.current = userId;
    setRecordsLoading(true);
    try {
      const payload = await apiRequest(`/api/medical/patients/${userId}/records`, { token });
      const recordsWithNumbers = (payload.records || []).map((record, index, arr) => ({
        ...record,
        displayNumber: arr.length - index,
      }));
      if (activeRecordsRequestRef.current !== userId) {
        return;
      }
      setPatientRecords(recordsWithNumbers);
      setNewRecordError('');
      setAttachmentError('');
    } catch (err) {
      if (activeRecordsRequestRef.current !== userId) {
        return;
      }
      setNewRecordError(err.message);
      setPatientRecords([]);
      setAttachmentError('');
    } finally {
      if (activeRecordsRequestRef.current === userId) {
        setRecordsLoading(false);
      }
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

  const resetRecordState = useCallback(() => {
    setNewRecordForm({ summary: '', notes: '' });
    setNewRecordFiles([]);
    setNewRecordMessage('');
    setNewRecordError('');
    setAttachmentError('');
    setPatientRecords([]);
    setRecordsLoading(false);
    activeRecordsRequestRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleTogglePatient = (patient) => {
    if (selectedPatient?.id === patient.id) {
      resetRecordState();
      setSelectedPatient(null);
      return;
    }

    resetRecordState();
    setSelectedPatient(patient);
    loadPatientRecords(patient.id);
  };

  const handleCreateRecord = async (evt) => {
    evt.preventDefault();
    if (!selectedPatient) return;
    setNewRecordError('');
    setNewRecordMessage('');
    try {
      const formData = new FormData();
      formData.append('summary', newRecordForm.summary);
      formData.append('notes', newRecordForm.notes);
      newRecordFiles.forEach((file) => {
        formData.append('files', file);
      });

      await apiRequest(`/api/medical/patients/${selectedPatient.id}/records`, {
        method: 'POST',
        token,
        body: formData,
      });
      setNewRecordMessage('Record saved.');
      setNewRecordForm({ summary: '', notes: '' });
      setNewRecordFiles([]);
      setAttachmentError('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      loadPatientRecords(selectedPatient.id);
    } catch (err) {
      setNewRecordError(err.message);
    }
  };

  const openBlobInNewTab = (blob, fileName) => {
    const objectUrl = URL.createObjectURL(blob);
    const newWindow = window.open(objectUrl, '_blank');
    if (!newWindow) {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  };

  const handleOpenAttachment = async (downloadUrl, fileName) => {
    setAttachmentError('');
    try {
      const response = await fetch(`${API_BASE}${downloadUrl}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Unable to open file');
      }
      const blob = await response.blob();
      openBlobInNewTab(blob, fileName);
    } catch (err) {
      setAttachmentError(err.message || 'Unable to open file');
    }
  };

  const handleFileSelection = (evt) => {
    const files = evt.target.files ? Array.from(evt.target.files) : [];
    if (files.length === 0) {
      return;
    }
    setNewRecordFiles((prev) => {
      const combined = [...prev, ...files];
      if (combined.length > MAX_FILES) {
        setAttachmentError(`You can upload up to ${MAX_FILES} files per record.`);
        return prev;
      }
      setAttachmentError('');
      return combined;
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveSelectedFile = (index) => {
    setNewRecordFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  useEffect(() => {
    if (!selectedPatient) {
      return;
    }

    const updatedPatient = patients.find((patient) => patient.id === selectedPatient.id);
    if (!updatedPatient) {
      resetRecordState();
      setSelectedPatient(null);
      return;
    }

    if (updatedPatient !== selectedPatient) {
      setSelectedPatient(updatedPatient);
    }
  }, [patients, selectedPatient, resetRecordState]);

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
                {patients.map((patient) => {
                  const isExpanded = selectedPatient?.id === patient.id;
                  return (
                    <Fragment key={patient.id}>
                      <tr>
                        <td>{patient.name}</td>
                        <td>{patient.muid}</td>
                        <td className="date-cell">
                          {patient.access_expires_at
                            ? formatDateTime(patient.access_expires_at, 'No expiry')
                            : 'No expiry'}
                        </td>
                        <td className="actions-cell">
                          <button type="button" onClick={() => handleTogglePatient(patient)}>
                            {isExpanded ? 'Hide Records' : 'View Records'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="patient-details-row">
                          <td colSpan={4}>
                            <div className="panel" style={{ marginTop: '16px' }}>
                              <h2 style={{ marginTop: 0 }}>Records for {patient.name}</h2>
                              {newRecordError && <div className="alert alert-error">{newRecordError}</div>}
                              {newRecordMessage && <div className="alert alert-success">{newRecordMessage}</div>}
                              {attachmentError && <div className="alert alert-error">{attachmentError}</div>}
                              <form
                                className="form-grid"
                                onSubmit={handleCreateRecord}
                                encType="multipart/form-data"
                              >
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
                                <label>
                                  Attachments
                                  <input
                                    type="file"
                                    multiple
                                    accept=".pdf,image/*"
                                    ref={fileInputRef}
                                    onChange={handleFileSelection}
                                  />
                                  <small className="muted">You can upload up to {MAX_FILES} files.</small>
                                </label>
                                {newRecordFiles.length > 0 && (
                                  <div className="record-files" style={{ marginTop: '4px' }}>
                                    {newRecordFiles.map((file, index) => (
                                      <div key={`${file.name}-${index}`} className="record-file-item">
                                        <span
                                          style={{
                                            flex: '1 1 auto',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                          }}
                                        >
                                          {file.name}
                                        </span>
                                        <button
                                          type="button"
                                          className="link-button"
                                          onClick={() => handleRemoveSelectedFile(index)}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <button type="submit">Add Record</button>
                              </form>
                              {recordsLoading && <p className="muted">Loading records...</p>}
                              {!recordsLoading && patientRecords.length === 0 && (
                                <p className="muted">No records available.</p>
                              )}
                              {!recordsLoading &&
                                patientRecords.map((record) => (
                                  <div key={record.id} className="record-card">
                                    <div className="record-header">
                                      <div className="record-title">
                                        <strong>Record #{record.displayNumber ?? record.id}</strong>
                                        {record.uploaded_by?.name && (
                                          <span className="record-creator">{record.uploaded_by.name}</span>
                                        )}
                                      </div>
                                      <div className="record-date">{formatDateTime(record.created_at)}</div>
                                    </div>
                                    <div className="text-single-line">
                                      <strong>Summary:</strong> {record.data?.summary ?? 'No summary provided.'}
                                    </div>
                                    <div className="text-two-lines">
                                      <strong>Notes:</strong> {record.data?.notes ?? 'No notes provided.'}
                                    </div>
                                    <div className="muted" style={{ marginTop: '8px' }}>Files</div>
                                    {record.files?.length > 0 ? (
                                      <div className="record-files">
                                        {record.files.map((file) => (
                                          <div key={file.id} className="record-file-item">
                                            <button
                                              type="button"
                                              className="link-button"
                                              onClick={() => handleOpenAttachment(file.download_url, file.file_name)}
                                            >
                                              {file.file_name}
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="muted" style={{ fontStyle: 'italic' }}>No files uploaded</div>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
