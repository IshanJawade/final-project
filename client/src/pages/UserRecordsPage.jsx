import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest, API_BASE } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function UserRecordsPage() {
  const { token } = useAuth();
  const [records, setRecords] = useState([]);
  const [recordError, setRecordError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);

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

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRecords() {
    try {
      const payload = await apiRequest('/api/records', { token });
      const recordsWithNumbers = (payload.records || []).map((record, index, arr) => ({
        ...record,
        displayNumber: arr.length - index,
      }));
      setRecords(recordsWithNumbers);
      setRecordError('');
    } catch (err) {
      setRecordError(err.message);
    }
  }

  const handleDownload = async (recordId) => {
    setDownloadError('');
    try {
      const response = await fetch(`${API_BASE}/api/records/${recordId}/download`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Download failed');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `record-${recordId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err.message);
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

  const handleOpenFile = async (downloadUrl, fileName) => {
    setDownloadError('');
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
      setDownloadError(err.message || 'Unable to open file');
    }
  };

  return (
    <>
      <div className="panel">
        <h2>My Records</h2>
        {recordError && <div className="alert alert-error">{recordError}</div>}
        {downloadError && <div className="alert alert-error">{downloadError}</div>}
        {records.length === 0 && <p className="muted">No records yet.</p>}
        {records.map((rec) => (
          <div key={rec.id} className="record-card">
            <div className="record-header">
              <div className="record-title">
                <strong>Record #{rec.displayNumber ?? rec.id}</strong>
                {rec.uploaded_by?.name && (
                  <span className="record-creator">{rec.uploaded_by.name}</span>
                )}
              </div>
              <div className="record-date">{formatDateTime(rec.created_at)}</div>
            </div>
            <div className="text-single-line">
              <strong>Summary:</strong> {rec.data?.summary ?? 'No summary provided.'}
            </div>
            <div className="text-two-lines">
              <strong>Notes:</strong> {rec.data?.notes ?? 'No notes provided.'}
            </div>
            <div className="muted" style={{ marginTop: '8px' }}>Files</div>
            {rec.files?.length > 0 ? (
              <div className="record-files">
                {rec.files.map((file) => (
                  <div key={file.id} className="record-file-item">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => handleOpenFile(file.download_url, file.file_name)}
                    >
                      {file.file_name}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ fontStyle: 'italic' }}>No files uploaded</div>
            )}
            <div className="record-actions">
              <button type="button" onClick={() => setSelectedRecord(rec)}>
                View Details
              </button>
              <button type="button" onClick={() => handleDownload(rec.id)}>
                Download JSON
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedRecord && (
        <div className="panel">
          <div className="record-header" style={{ marginBottom: '16px' }}>
            <div className="record-title">
              <strong>Record #{selectedRecord.displayNumber ?? selectedRecord.id}</strong>
              {selectedRecord.uploaded_by?.name && (
                <span className="record-creator">{selectedRecord.uploaded_by.name}</span>
              )}
            </div>
            <div className="record-date">{formatDateTime(selectedRecord.created_at)}</div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>Summary:</strong> {selectedRecord.data?.summary ?? 'No summary provided.'}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>Notes:</strong>
            <p style={{ marginTop: '6px', whiteSpace: 'pre-wrap' }}>
              {selectedRecord.data?.notes ?? 'No notes provided.'}
            </p>
          </div>
          <div className="muted" style={{ marginBottom: '6px' }}>Files</div>
          {selectedRecord.files?.length > 0 ? (
            <div className="record-files" style={{ marginBottom: '16px' }}>
              {selectedRecord.files.map((file) => (
                <div key={file.id} className="record-file-item">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => handleOpenFile(file.download_url, file.file_name)}
                  >
                    {file.file_name}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ fontStyle: 'italic', marginBottom: '16px' }}>
              No files uploaded
            </div>
          )}
          <div className="record-actions">
            <button type="button" onClick={() => setSelectedRecord(null)}>
              Close
            </button>
            <button type="button" onClick={() => handleDownload(selectedRecord.id)}>
              Download JSON
            </button>
          </div>
        </div>
      )}
    </>
  );
}
