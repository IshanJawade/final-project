import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdminDirectory } from '../utils/useAdminDirectory.js';

export default function AdminProfessionalsPage() {
  const { token } = useAuth();
  const [pendingProfessionals, setPendingProfessionals] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const {
    professionals: approvedProfessionals,
    loading: directoryLoading,
    error: directoryError,
    refresh,
  } = useAdminDirectory({ includeStats: false, includeLists: true });

  useEffect(() => {
    if (token) {
      loadPendingProfessionals();
    }
  }, [token]);

  async function loadPendingProfessionals() {
    try {
      const payload = await apiRequest('/api/admin/pending-professionals', { token });
      setPendingProfessionals(payload.medicalProfessionals || []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  const toggleDeleteMode = () => {
    setMessage('');
    setError('');
    if (deleteMode) {
      setDeleteMode(false);
      setSelectedIds(new Set());
      return;
    }
    const confirmed = window.confirm('Are you sure you want to enable delete mode?');
    if (confirmed) {
      setDeleteMode(true);
      setSelectedIds(new Set());
    }
  };

  const toggleSelection = (id, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const bulkDeleteProfessionals = async () => {
    if (selectedIds.size === 0) {
      setError('Select at least one professional to delete.');
      return;
    }
    if (!window.confirm('Delete selected professionals permanently? This action cannot be undone.')) {
      return;
    }
    setMessage('');
    setError('');
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => apiRequest(`/api/admin/professionals/${id}`, { method: 'DELETE', token }))
      );
      setMessage('Selected professionals deleted.');
      setSelectedIds(new Set());
      setDeleteMode(false);
      await Promise.all([loadPendingProfessionals(), refresh()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const allProfessionalIds = useMemo(() => approvedProfessionals.map((pro) => pro.id), [approvedProfessionals]);

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(new Set(allProfessionalIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const approveProfessional = async (id) => {
    setMessage('');
    setError('');
    try {
      await apiRequest(`/api/admin/professionals/${id}/approve`, { method: 'POST', token });
      setMessage('Account approved.');
      await Promise.all([loadPendingProfessionals(), refresh()]);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="panel-section">
      <div className="panel">
        <h2>Pending Professionals</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}
        {pendingProfessionals.length === 0 && <p className="muted">No pending professionals.</p>}
        {pendingProfessionals.length > 0 && (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>Company</th>
                  <th>Requested</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingProfessionals.map((pro) => (
                  <tr key={pro.id}>
                    <td>{pro.username}</td>
                    <td>{pro.name}</td>
                    <td>{pro.email}</td>
                    <td>{pro.mobile}</td>
                    <td>{pro.company}</td>
                    <td>{new Date(pro.created_at).toLocaleString()}</td>
                    <td>
                      <button type="button" onClick={() => approveProfessional(pro.id)}>
                        Approve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <header className="panel-header">
          <div>
            <h2>Medical Professionals</h2>
          </div>
          <div className="panel-actions">
            {deleteMode ? (
              <div className="action-toggle-group">
                <button type="button" onClick={toggleDeleteMode}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button-danger"
                  onClick={bulkDeleteProfessionals}
                >
                  Delete Selected
                </button>
              </div>
            ) : (
              <button type="button" onClick={toggleDeleteMode}>
                Delete
              </button>
            )}
          </div>
        </header>
        {directoryError && <div className="alert alert-error">{directoryError}</div>}
        {directoryLoading && <p className="muted">Loading approved professionals…</p>}
        {!directoryLoading && approvedProfessionals.length === 0 && (
          <p className="muted">No approved medical professionals yet.</p>
        )}
        {approvedProfessionals.length > 0 && (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  {deleteMode && (
                    <th className="centered-col">
                      <input
                        type="checkbox"
                        aria-label="Select all professionals"
                        checked={selectedIds.size === allProfessionalIds.length && allProfessionalIds.length > 0}
                        onChange={(event) => toggleSelectAll(event.target.checked)}
                      />
                    </th>
                  )}
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                </tr>
              </thead>
              <tbody>
                {approvedProfessionals.map((pro) => (
                  <tr key={pro.id}>
                    {deleteMode && (
                      <td className="centered-col">
                        <input
                          type="checkbox"
                          aria-label={`Select ${pro.email}`}
                          checked={selectedIds.has(pro.id)}
                          onChange={(event) => toggleSelection(pro.id, event.target.checked)}
                        />
                      </td>
                    )}
                    <td>{pro.name}</td>
                    <td>{pro.email}</td>
                    <td>{pro.company || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
