import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminProfessionalsPage() {
  const { token } = useAuth();
  const [pendingProfessionals, setPendingProfessionals] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadPendingProfessionals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPendingProfessionals() {
    try {
      const payload = await apiRequest('/api/admin/pending-professionals', { token });
      setPendingProfessionals(payload.medicalProfessionals || []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  const approveProfessional = async (id) => {
    setMessage('');
    setError('');
    try {
      await apiRequest(`/api/admin/professionals/${id}/approve`, { method: 'POST', token });
      setMessage('Account approved.');
      loadPendingProfessionals();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="panel">
      <h2>Pending Professionals</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {pendingProfessionals.length === 0 && <p className="muted">No pending professionals.</p>}
      {pendingProfessionals.length > 0 && (
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
      )}
    </div>
  );
}
