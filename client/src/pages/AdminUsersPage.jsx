import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdminDirectory } from '../utils/useAdminDirectory.js';

export default function AdminUsersPage() {
  const { token } = useAuth();
  const [pendingUsers, setPendingUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
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
                  <th>Name</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>Address</th>
                  <th>Registered</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.mobile}</td>
                    <td>{user.address}</td>
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
        <h2>Registered Users</h2>
        {directoryError && <div className="alert alert-error">{directoryError}</div>}
        {directoryLoading && <p className="muted">Loading approved users…</p>}
        {!directoryLoading && approvedUsers.length === 0 && <p className="muted">No approved users yet.</p>}
        {approvedUsers.length > 0 && (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>MUID</th>
                  <th>Birth Year</th>
                </tr>
              </thead>
              <tbody>
                {approvedUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.muid || '—'}</td>
                    <td>{user.year_of_birth || '—'}</td>
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
