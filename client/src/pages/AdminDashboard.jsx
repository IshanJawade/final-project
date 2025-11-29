import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminDashboard() {
  const { token } = useAuth();
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingProfessionals, setPendingProfessionals] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    try {
      const [usersPayload, professionalsPayload] = await Promise.all([
        apiRequest('/api/admin/pending-users', { token }),
        apiRequest('/api/admin/pending-professionals', { token }),
      ]);
      setPendingUsers(usersPayload.users || []);
      setPendingProfessionals(professionalsPayload.medicalProfessionals || []);
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
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const approveProfessional = async (id) => {
    setMessage('');
    setError('');
    try {
      await apiRequest(`/api/admin/professionals/${id}/approve`, { method: 'POST', token });
      setMessage('Account approved.');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="panel">
      <h2>Admin Dashboard</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="panel">
        <h3>Pending Users</h3>
        {pendingUsers.length === 0 && <p>No pending users.</p>}
        {pendingUsers.length > 0 && (
          <table className="table-like">
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

      <div className="panel">
        <h3>Pending Professionals</h3>
        {pendingProfessionals.length === 0 && <p>No pending professionals.</p>}
        {pendingProfessionals.length > 0 && (
          <table className="table-like">
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
        )}
      </div>
    </div>
  );
}
