import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdminDirectory } from '../utils/useAdminDirectory.js';
import { formatDateMMDDYYYY } from '../utils/date.js';

export default function AdminUsersPage() {
  const { token } = useAuth();
  const [pendingUsers, setPendingUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const { users: approvedUsers, loading: directoryLoading, error: directoryError, refresh } = useAdminDirectory({
    includeStats: false,
    includeLists: true,
  });

  useEffect(() => {
    if (token) {
      loadPendingUsers();
    }
  }, [token]);

  async function loadPendingUsers() {
    try {
      const payload = await apiRequest('/api/admin/pending-users', { token });
      setPendingUsers(payload.users || []);
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

  const bulkDeleteUsers = async () => {
    if (selectedIds.size === 0) {
      setError('Select at least one user to delete.');
      return;
    }
    if (!window.confirm('Delete selected users permanently? This action cannot be undone.')) {
      return;
    }
    setMessage('');
    setError('');
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => apiRequest(`/api/admin/users/${id}`, { method: 'DELETE', token }))
      );
      setMessage('Selected users deleted.');
      setSelectedIds(new Set());
      setDeleteMode(false);
      await Promise.all([loadPendingUsers(), refresh()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const allApprovedIds = useMemo(() => approvedUsers.map((user) => user.id), [approvedUsers]);

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(new Set(allApprovedIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const approveUser = async (id) => {
    setMessage('');
    setError('');
    try {
      await apiRequest(`/api/admin/users/${id}/approve`, { method: 'POST', token });
      setMessage('Account approved.');
      await Promise.all([loadPendingUsers(), refresh()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const getFirstName = (record) => {
    if (record?.first_name) return record.first_name;
    if (record?.name) {
      const parts = record.name.trim().split(/\s+/);
      return parts[0] || '—';
    }
    return '—';
  };

  const getLastName = (record) => {
    if (record?.last_name) return record.last_name;
    if (record?.name) {
      const parts = record.name.trim().split(/\s+/);
      if (parts.length > 1) {
        return parts.slice(1).join(' ');
      }
    }
    return '—';
  };

  const formatDob = (value) => formatDateMMDDYYYY(value) || '—';

  return (
    <div className="panel-section">
      <div className="panel">
        <h2>Pending Users</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}
        {pendingUsers.length === 0 && <p className="muted">No pending users.</p>}
        {pendingUsers.length > 0 && (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>First Name</th>
                  <th>Last Name</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>Address</th>
                  <th>Date of Birth</th>
                  <th>Registered</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{getFirstName(user)}</td>
                    <td>{getLastName(user)}</td>
                    <td>{user.email}</td>
                    <td>{user.mobile}</td>
                    <td>{user.address}</td>
                    <td>{formatDob(user.date_of_birth)}</td>
                    <td>{new Date(user.created_at).toLocaleString()}</td>
                    <td>
                      <button type="button" onClick={() => approveUser(user.id)}>
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
            <h2>Registered Users</h2>
          </div>
          <div className="panel-actions">
            {deleteMode ? (
              <div className="action-toggle-group">
                <button type="button" onClick={toggleDeleteMode}>
                  Cancel
                </button>
                <button type="button" className="button-danger" onClick={bulkDeleteUsers}>
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
        {directoryLoading && <p className="muted">Loading approved users…</p>}
        {!directoryLoading && approvedUsers.length === 0 && <p className="muted">No approved users yet.</p>}
        {approvedUsers.length > 0 && (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  {deleteMode && (
                    <th className="centered-col">
                      <input
                        type="checkbox"
                        aria-label="Select all users"
                        checked={selectedIds.size === allApprovedIds.length && allApprovedIds.length > 0}
                        onChange={(event) => toggleSelectAll(event.target.checked)}
                      />
                    </th>
                  )}
                  <th>First Name</th>
                  <th>Last Name</th>
                  <th>Email</th>
                  <th>MUID</th>
                  <th>Date of Birth</th>
                </tr>
              </thead>
              <tbody>
                {approvedUsers.map((user) => (
                  <tr key={user.id}>
                    {deleteMode && (
                      <td className="centered-col">
                        <input
                          type="checkbox"
                          aria-label={`Select ${user.email}`}
                          checked={selectedIds.has(user.id)}
                          onChange={(event) => toggleSelection(user.id, event.target.checked)}
                        />
                      </td>
                    )}
                    <td>{getFirstName(user)}</td>
                    <td>{getLastName(user)}</td>
                    <td>{user.email}</td>
                    <td>{user.muid || '—'}</td>
                    <td>{formatDob(user.date_of_birth)}</td>
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
