import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdminDirectory } from '../utils/useAdminDirectory.js';

export default function AdminProfessionalsPage() {
  const { token } = useAuth();
  const [pendingProfessionals, setPendingProfessionals] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
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
        <h2>Medical Professionals</h2>
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
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                </tr>
              </thead>
              <tbody>
                {approvedProfessionals.map((pro) => (
                  <tr key={pro.id}>
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
