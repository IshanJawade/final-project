import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function UserAccessPage() {
  const { token } = useAuth();
  const [accessList, setAccessList] = useState([]);
  const [accessMessage, setAccessMessage] = useState('');
  const [accessError, setAccessError] = useState('');

  const [requests, setRequests] = useState([]);
  const [requestError, setRequestError] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [requestExpiry, setRequestExpiry] = useState({});

  useEffect(() => {
    loadRequests();
    loadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAccess() {
    try {
      const payload = await apiRequest('/api/user/access', { token });
      setAccessList(payload.professionals || []);
      setAccessError('');
    } catch (err) {
      setAccessError(err.message);
    }
  }

  async function loadRequests() {
    try {
      const payload = await apiRequest('/api/user/access/requests', { token });
      setRequests(payload.requests || []);
      setRequestError('');
    } catch (err) {
      setRequestError(err.message);
    }
  }

  const handleRevoke = async (professionalId) => {
    setAccessMessage('');
    setAccessError('');
    try {
      await apiRequest('/api/user/access/revoke', {
        method: 'POST',
        token,
        body: { medical_professional_id: professionalId },
      });
      setAccessMessage('Access revoked.');
      loadAccess();
    } catch (err) {
      setAccessError(err.message);
    }
  };

  const handleRequestDecision = async (requestId, decision) => {
    setRequestMessage('');
    setRequestError('');
    try {
      await apiRequest(`/api/user/access/requests/${requestId}/respond`, {
        method: 'POST',
        token,
        body: {
          decision,
          expires_at: requestExpiry[requestId] || null,
        },
      });
      setRequestMessage(decision === 'approve' ? 'Access granted.' : 'Request declined.');
      setRequestExpiry((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      await Promise.all([loadRequests(), loadAccess()]);
    } catch (err) {
      setRequestError(err.message);
    }
  };

  return (
    <>
      <div className="panel">
        <h2>Pending Access Requests</h2>
        {requestError && <div className="alert alert-error">{requestError}</div>}
        {requestMessage && <div className="alert alert-success">{requestMessage}</div>}
        {requests.length === 0 && <p className="muted">No pending requests.</p>}
        {requests.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Professional</th>
                <th>Company</th>
                <th>Message</th>
                <th>Requested</th>
                <th>Access Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id}>
                  <td>{req.name}</td>
                  <td>{req.company || '—'}</td>
                  <td>{req.requested_message || '—'}</td>
                  <td>{new Date(req.created_at).toLocaleString()}</td>
                  <td>
                    <input
                      type="date"
                      value={requestExpiry[req.id] || ''}
                      onChange={(evt) =>
                        setRequestExpiry((prev) => ({ ...prev, [req.id]: evt.target.value }))
                      }
                    />
                  </td>
                  <td className="inline-actions">
                    <button type="button" onClick={() => handleRequestDecision(req.id, 'approve')}>
                      Approve
                    </button>
                    <button type="button" onClick={() => handleRequestDecision(req.id, 'decline')}>
                      Decline
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Active Access</h2>
        {accessError && <div className="alert alert-error">{accessError}</div>}
        {accessMessage && <div className="alert alert-success">{accessMessage}</div>}
        {accessList.length === 0 && <p className="muted">No professionals currently have access.</p>}
        {accessList.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Access Since</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accessList.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.name}</td>
                  <td>{entry.company || '—'}</td>
                  <td>{entry.email}</td>
                  <td>{new Date(entry.access_granted_at).toLocaleString()}</td>
                  <td>
                    {entry.access_expires_at
                      ? new Date(entry.access_expires_at).toLocaleString()
                      : 'No expiry'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button-danger"
                      onClick={() => handleRevoke(entry.medical_professional_id)}
                    >
                      Revoke Access
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}