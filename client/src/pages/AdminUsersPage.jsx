import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminUsersPage() {
  const { token } = useAuth();
  const [pendingUsers, setPendingUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadPendingUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      loadPendingUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="panel">
      <h2>Pending Users</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {pendingUsers.length === 0 && <p className="muted">No pending users.</p>}
      {pendingUsers.length > 0 && (
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
      )}
    </div>
  );
}
