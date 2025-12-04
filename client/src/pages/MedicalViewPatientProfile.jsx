import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE, apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateMMDDYYYY } from '../utils/date.js';
import { jsPDF } from 'jspdf';

const MAX_FILES = 5;
const DAY_IN_MS = 1000 * 60 * 60 * 24;

export default function MedicalViewPatientProfile() {
  const { token } = useAuth();
  const { patientId } = useParams();

  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [patient, setPatient] = useState(null);
  const [accessInfo, setAccessInfo] = useState(null);

  const [patientRecords, setPatientRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [newRecordError, setNewRecordError] = useState('');
  const [newRecordMessage, setNewRecordMessage] = useState('');
  const [attachmentError, setAttachmentError] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState(new Set());

  const [newRecordForm, setNewRecordForm] = useState({ summary: '', notes: '' });
  const [newRecordFiles, setNewRecordFiles] = useState([]);
  const fileInputRef = useRef(null);
  const activeRecordsRequestRef = useRef(null);

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

  const formatDateTime = useCallback(
    (value, fallback = 'N/A') => {
      if (!value) {
        return fallback;
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return fallback;
      }
      return dateTimeFormatter.format(date);
    },
    [dateTimeFormatter]
  );

  const resetRecordState = useCallback(() => {
    setPatientRecords([]);
    setRecordsLoading(false);
    setRecordError('');
    setNewRecordError('');
    setNewRecordMessage('');
    setAttachmentError('');
    setNewRecordForm({ summary: '', notes: '' });
    setNewRecordFiles([]);
    setSelectedRecordIds(new Set());
    activeRecordsRequestRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const loadPatientRecords = useCallback(
    async (userId) => {
      if (!userId) {
        return;
      }
      const requestKey = String(userId);
      activeRecordsRequestRef.current = requestKey;
      setRecordsLoading(true);
      try {
        const payload = await apiRequest(`/api/medical/patients/${userId}/records`, { token });
        const recordsWithNumbers = (payload.records || []).map((record, index, arr) => ({
          ...record,
          displayNumber: arr.length - index,
        }));
        if (activeRecordsRequestRef.current !== requestKey) {
          return;
        }
        setPatientRecords(recordsWithNumbers);
        setSelectedRecordIds(new Set());
        setRecordError('');
        setAttachmentError('');
      } catch (err) {
        if (activeRecordsRequestRef.current !== requestKey) {
          return;
        }
        setRecordError(err.message);
        setPatientRecords([]);
        setSelectedRecordIds(new Set());
        setAttachmentError('');
      } finally {
        if (activeRecordsRequestRef.current === requestKey) {
          setRecordsLoading(false);
        }
      }
    },
    [token]
  );

  useEffect(() => {
    resetRecordState();

    const parsedId = Number(patientId);
    if (!Number.isInteger(parsedId)) {
      setProfileLoading(false);
      setProfileError('Invalid patient identifier.');
      setPatient(null);
      setAccessInfo(null);
      return;
    }

    let ignore = false;

    async function fetchProfile() {
      setProfileLoading(true);
      setProfileError('');
      try {
        const payload = await apiRequest(`/api/medical/patients/${parsedId}/profile`, { token });
        if (ignore) {
          return;
        }
        setPatient(payload.patient || null);
        setAccessInfo(payload.access || null);
        loadPatientRecords(parsedId);
      } catch (err) {
        if (ignore) {
          return;
        }
        setProfileError(err.message);
        setPatient(null);
        setAccessInfo(null);
      } finally {
        if (!ignore) {
          setProfileLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      ignore = true;
      activeRecordsRequestRef.current = null;
    };
  }, [patientId, token, loadPatientRecords, resetRecordState]);

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

  const handleCreateRecord = async (evt) => {
    evt.preventDefault();
    if (!patient) {
      return;
    }
    setNewRecordError('');
    setNewRecordMessage('');
    try {
      const formData = new FormData();
      formData.append('summary', newRecordForm.summary);
      formData.append('notes', newRecordForm.notes);
      newRecordFiles.forEach((file) => {
        formData.append('files', file);
      });

      await apiRequest(`/api/medical/patients/${patient.id}/records`, {
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
      loadPatientRecords(patient.id);
    } catch (err) {
      setNewRecordError(err.message);
    }
  };

  const toggleRecordSelection = (recordId, checked) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(recordId);
      } else {
        next.delete(recordId);
      }
      return next;
    });
  };

  const toggleSelectAll = (checked) => {
    if (!checked) {
      setSelectedRecordIds(new Set());
      return;
    }
    const allIds = patientRecords.map((record) => record.id);
    setSelectedRecordIds(new Set(allIds));
  };

  const buildSelectedRecords = () => {
    if (selectedRecordIds.size === 0) {
      return [];
    }
    const selected = patientRecords.filter((record) => selectedRecordIds.has(record.id));
    return selected.sort((a, b) => (b.displayNumber || 0) - (a.displayNumber || 0));
  };

  const downloadRecordsAsJson = () => {
    const records = buildSelectedRecords();
    if (records.length === 0) {
      return;
    }

    const payload = {
      patient: {
        id: patient?.id ?? null,
        name: patient?.name ?? null,
        muid: patient?.muid ?? null,
      },
      exportedAt: new Date().toISOString(),
      records,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const fileName = `patient-${patient?.muid || patient?.id || 'records'}-records.json`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadRecordsAsPdf = () => {
    const records = buildSelectedRecords();
    if (records.length === 0) {
      return;
    }

    const doc = new jsPDF();
    const leftMargin = 14;
    const rightMargin = 196;
    const lineHeight = 7;
    let y = 18;

    const addNewPageIfNeeded = (requiredSpace = 0) => {
      if (y + requiredSpace > 280) {
        doc.addPage();
        y = 18;
      }
    };

    doc.setFontSize(16);
    const title = `Patient Records for ${patient?.name || patient?.muid || 'Patient'}`;
    const wrappedTitle = doc.splitTextToSize(title, rightMargin - leftMargin);
    wrappedTitle.forEach((line) => {
      doc.text(line, leftMargin, y);
      y += lineHeight;
    });

    doc.setFontSize(11);
    const metaLines = [
      `Exported: ${formatDateTime(new Date().toISOString())}`,
      `Total Records: ${records.length}`,
    ];
    metaLines.forEach((line) => {
      doc.text(line, leftMargin, y);
      y += lineHeight;
    });
    y += lineHeight;

    records.forEach((record, index) => {
      addNewPageIfNeeded(40);
      doc.setFontSize(13);
      doc.text(`Record #${record.displayNumber ?? record.id}`, leftMargin, y);
      y += lineHeight;

      doc.setFontSize(11);
      const recordMeta = [
        `Created: ${formatDateTime(record.created_at)}`,
        `Updated: ${formatDateTime(record.updated_at)}`,
        `Uploaded By: ${record.uploaded_by?.name || 'N/A'}`,
      ];
      recordMeta.forEach((line) => {
        addNewPageIfNeeded(lineHeight);
        doc.text(line, leftMargin, y);
        y += lineHeight;
      });

      const summaryHeader = 'Summary:';
      const summaryLines = doc.splitTextToSize(
        record.data?.summary || 'No summary provided.',
        rightMargin - leftMargin
      );
      addNewPageIfNeeded(lineHeight * (summaryLines.length + 2));
      doc.setFont('helvetica', 'bold');
      doc.text(summaryHeader, leftMargin, y);
      doc.setFont('helvetica', 'normal');
      y += lineHeight;
      summaryLines.forEach((line) => {
        doc.text(line, leftMargin, y);
        y += lineHeight;
      });

      const notesHeader = 'Notes:';
      const notesLines = doc.splitTextToSize(
        record.data?.notes || 'No notes provided.',
        rightMargin - leftMargin
      );
      addNewPageIfNeeded(lineHeight * (notesLines.length + 2));
      doc.setFont('helvetica', 'bold');
      doc.text(notesHeader, leftMargin, y);
      doc.setFont('helvetica', 'normal');
      y += lineHeight;
      notesLines.forEach((line) => {
        doc.text(line, leftMargin, y);
        y += lineHeight;
      });

      addNewPageIfNeeded(lineHeight * 4);
      doc.setFont('helvetica', 'bold');
      doc.text('Attachments:', leftMargin, y);
      doc.setFont('helvetica', 'normal');
      y += lineHeight;
      if (Array.isArray(record.files) && record.files.length > 0) {
        record.files.forEach((file) => {
          addNewPageIfNeeded(lineHeight);
          doc.text(`- ${file.file_name}`, leftMargin + 4, y);
          y += lineHeight;
        });
      } else {
        doc.text('No files uploaded', leftMargin + 4, y);
        y += lineHeight;
      }

      if (index !== records.length - 1) {
        y += lineHeight * 2;
      }
    });

    const fileName = `patient-${patient?.muid || patient?.id || 'records'}-records.pdf`;
    doc.save(fileName);
  };

  const initials = useMemo(() => {
    const source = (patient?.name || '').trim();
    if (source) {
      const chars = source
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => (part && part[0] ? part[0].toUpperCase() : ''))
        .join('')
        .trim();
      if (chars) {
        return chars;
      }
    }
    if (patient?.email) {
      const first = String(patient.email).trim().charAt(0).toUpperCase();
      if (first) {
        return first;
      }
    }
    if (patient?.muid) {
      const first = String(patient.muid).trim().charAt(0).toUpperCase();
      if (first) {
        return first;
      }
    }
    return '?';
  }, [patient]);

  const formattedDob = useMemo(() => {
    if (!patient?.date_of_birth) {
      return 'N/A';
    }
    const formatted = formatDateMMDDYYYY(patient.date_of_birth);
    return formatted || 'N/A';
  }, [patient]);

  const daysRemaining = useMemo(() => {
    if (!accessInfo || !accessInfo.expires_at) {
      return null;
    }
    if (typeof accessInfo.days_remaining === 'number') {
      return accessInfo.days_remaining;
    }
    const expiry = new Date(accessInfo.expires_at);
    if (Number.isNaN(expiry.getTime())) {
      return null;
    }
    const diff = Math.ceil((expiry.getTime() - Date.now()) / DAY_IN_MS);
    return Math.max(diff, 0);
  }, [accessInfo]);

  const accessSummary = useMemo(() => {
    if (!accessInfo) {
      return 'Access information unavailable.';
    }
    if (!accessInfo.expires_at) {
      return 'Access does not expire.';
    }
    if (daysRemaining === null) {
      return 'Access expiry unknown.';
    }
    if (daysRemaining === 0) {
      return 'Access expires today.';
    }
    if (daysRemaining === 1) {
      return '1 day of access remaining.';
    }
    return `${daysRemaining} days of access remaining.`;
  }, [accessInfo, daysRemaining]);

  return (
    <>
      <div className="panel">
        <header className="panel-header">
          <div>
            <h2>Patient Profile</h2>
            {patient && <p className="muted">MUID: {patient.muid}</p>}
          </div>
        </header>
        {profileError && <div className="alert alert-error">{profileError}</div>}
        {profileLoading && <p className="muted">Loading patient profile...</p>}
        {!profileLoading && !patient && !profileError && (
          <p className="muted">Patient details are unavailable.</p>
        )}
        {!profileLoading && patient && (
          <div className="dashboard-grid" style={{ gap: '48px', alignItems: 'flex-start' }}>
            <div className="profile-sidebar" style={{ position: 'static', marginTop: 0 }}>
              <div className="avatar-placeholder" aria-hidden="true">
                <span>{initials !== '?' ? initials : 'Avatar'}</span>
              </div>
              <dl className="profile-meta">
                <div className="profile-meta-row">
                  <dt>Name</dt>
                  <dd>{patient.name || 'N/A'}</dd>
                </div>
                <div className="profile-meta-row">
                  <dt>Date of Birth</dt>
                  <dd>{formattedDob}</dd>
                </div>
                <div className="profile-meta-row">
                  <dt>Year of Birth</dt>
                  <dd>{patient.year_of_birth || 'N/A'}</dd>
                </div>
                <div className="profile-meta-row">
                  <dt>Email</dt>
                  <dd>{patient.email || 'N/A'}</dd>
                </div>
                <div className="profile-meta-row">
                  <dt>Mobile</dt>
                  <dd>{patient.mobile || 'N/A'}</dd>
                </div>
                <div className="profile-meta-row">
                  <dt>Address</dt>
                  <dd>{patient.address || 'N/A'}</dd>
                </div>
              </dl>
            </div>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <div className="panel" style={{ margin: 0 }}>
                <h3 style={{ marginTop: 0 }}>Access Overview</h3>
                <p>{accessSummary}</p>
                <dl className="profile-meta" style={{ marginTop: '24px' }}>
                  <div className="profile-meta-row">
                    <dt>Access Granted</dt>
                    <dd>{formatDateTime(accessInfo?.granted_at) || 'N/A'}</dd>
                  </div>
                  <div className="profile-meta-row">
                    <dt>Access Expires</dt>
                    <dd>{formatDateTime(accessInfo?.expires_at, 'No expiry')}</dd>
                  </div>
                </dl>
              </div>
              <div className="panel" style={{ marginTop: '24px' }}>
                <h3 style={{ marginTop: 0 }}>Account History</h3>
                <dl className="profile-meta" style={{ marginTop: '16px' }}>
                  <div className="profile-meta-row">
                    <dt>Created</dt>
                    <dd>{formatDateTime(patient.created_at)}</dd>
                  </div>
                  <div className="profile-meta-row">
                    <dt>Last Updated</dt>
                    <dd>{formatDateTime(patient.updated_at)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <header className="panel-header" style={{ marginBottom: '16px' }}>
          <div>
            <h2 style={{ marginBottom: '8px' }}>Patient Records</h2>
            <p className="muted" style={{ margin: 0 }}>Select records to download as PDF or JSON.</p>
          </div>
        </header>
        {recordError && <div className="alert alert-error">{recordError}</div>}
        {newRecordError && <div className="alert alert-error">{newRecordError}</div>}
        {newRecordMessage && <div className="alert alert-success">{newRecordMessage}</div>}
        {attachmentError && <div className="alert alert-error">{attachmentError}</div>}
        <form
          className="form-grid record-form-grid"
          onSubmit={handleCreateRecord}
          encType="multipart/form-data"
        >
          <label className="summary-field">
            Summary
            <input
              value={newRecordForm.summary}
              onChange={(evt) =>
                setNewRecordForm((prev) => ({ ...prev, summary: evt.target.value }))
              }
              required
            />
          </label>
          <label className="notes-field">
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
          <label className="attachments-field">
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
            <div className="record-files attachments-files">
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
          <button type="submit" className="record-submit" disabled={!patient}>
            Add Record
          </button>
        </form>
        {recordsLoading && <p className="muted">Loading records...</p>}
        {!recordsLoading && patientRecords.length === 0 && (
          <p className="muted">No records available.</p>
        )}
        {!recordsLoading && patientRecords.length > 0 && (
          <div
            className="record-actions"
            style={{
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={
                    patientRecords.length > 0 && selectedRecordIds.size === patientRecords.length
                  }
                  onChange={(evt) => toggleSelectAll(evt.target.checked)}
                />
                <span>Select all records</span>
              </label>
              {selectedRecordIds.size > 0 && (
                <span className="muted">{selectedRecordIds.size} selected</span>
              )}
            </div>
            <div
              className="panel-actions"
              style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
            >
              <button
                type="button"
                className="button-secondary"
                onClick={downloadRecordsAsPdf}
                disabled={selectedRecordIds.size === 0}
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={downloadRecordsAsJson}
                disabled={selectedRecordIds.size === 0}
              >
                Download JSON
              </button>
            </div>
          </div>
        )}
        {!recordsLoading &&
          patientRecords.map((record) => (
            <div key={record.id} className="record-card">
              <div className="record-header" style={{ alignItems: 'flex-start', gap: '12px' }}>
                <div className="record-title" style={{ gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={selectedRecordIds.has(record.id)}
                      onChange={(evt) => toggleRecordSelection(record.id, evt.target.checked)}
                    />
                    <span>
                      <strong>Record #{record.displayNumber ?? record.id}</strong>
                    </span>
                  </label>
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
    </>
  );
}
