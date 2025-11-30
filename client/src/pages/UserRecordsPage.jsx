import React, { useEffect, useState } from 'react';
import { apiRequest, API_BASE } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function UserRecordsPage() {
  const { token } = useAuth();
  const [records, setRecords] = useState([]);
  const [recordError, setRecordError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRecords() {
    try {
      const payload = await apiRequest('/api/records', { token });
      setRecords(payload.records || []);
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

  return (
    <>
      <div className="panel">
        <h2>My Records</h2>
        {recordError && <div className="alert alert-error">{recordError}</div>}
        {downloadError && <div className="alert alert-error">{downloadError}</div>}
        {records.length === 0 && <p className="muted">No records yet.</p>}
        {records.map((rec) => (
          <div key={rec.id} className="record-card">
            <div>
              <strong>Record #{rec.id}</strong> • {new Date(rec.created_at).toLocaleString()}
            </div>
            <div>Summary: {rec.data.summary || 'No summary provided.'}</div>
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
          <h2>Record Details</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(selectedRecord.data, null, 2)}</pre>
          <button type="button" onClick={() => setSelectedRecord(null)}>
            Close
          </button>
        </div>
      )}
    </>
  );
}
