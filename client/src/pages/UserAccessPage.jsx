import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function UserAccessPage() {
  const { token } = useAuth();
  const [accessList, setAccessList] = useState([]);
  const [accessMessage, setAccessMessage] = useState('');
  const [accessError, setAccessError] = useState('');
  const [revokeMode, setRevokeMode] = useState(false);
  const [selectedAccessIds, setSelectedAccessIds] = useState(new Set());
  const professionalIdSet = useMemo(
    () => new Set(accessList.map((entry) => entry.medical_professional_id)),
    [accessList]
  );

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

  const toggleRevokeMode = () => {
    setAccessMessage('');
    setAccessError('');
    if (revokeMode) {
      setRevokeMode(false);
      setSelectedAccessIds(new Set());
      return;
    }
    const confirmed = window.confirm('Enable revoke mode to remove access for multiple professionals?');
    if (confirmed) {
      setRevokeMode(true);
      setSelectedAccessIds(new Set());
    }
  };

  const toggleSelection = (professionalId, checked) => {
    setSelectedAccessIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(professionalId);
      } else {
        next.delete(professionalId);
      }
      return next;
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedAccessIds(new Set(professionalIdSet));
    } else {
      setSelectedAccessIds(new Set());
    }
  };

  const bulkRevokeAccess = async () => {
    if (selectedAccessIds.size === 0) {
      setAccessError('Select at least one professional to revoke access.');
      return;
    }
    if (!window.confirm('Revoke access for selected professionals?')) {
      return;
    }
    try {
      setAccessMessage('');
      setAccessError('');
      await Promise.all(
        Array.from(selectedAccessIds).map((professionalId) =>
          apiRequest('/api/user/access/revoke', {
            method: 'POST',
            token,
            body: { medical_professional_id: professionalId },
          })
        )
      );
      setAccessMessage('Selected access revoked.');
      setSelectedAccessIds(new Set());
      setRevokeMode(false);
      await loadAccess();
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
        <header className="panel-header">
          <div>
            <h2>Active Access</h2>
          </div>
          <div className="panel-actions">
            {revokeMode ? (
              <div className="action-toggle-group">
                <button type="button" onClick={toggleRevokeMode}>
                  Cancel
                </button>
                <button type="button" className="button-danger" onClick={bulkRevokeAccess}>
                  Revoke Selected
                </button>
              </div>
            ) : (
              <button type="button" onClick={toggleRevokeMode}>
                Revoke Access
              </button>
            )}
          </div>
        </header>
        {accessError && <div className="alert alert-error">{accessError}</div>}
        {accessMessage && <div className="alert alert-success">{accessMessage}</div>}
        {accessList.length === 0 && <p className="muted">No professionals currently have access.</p>}
        {accessList.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                {revokeMode && (
                  <th className="centered-col">
                    <input
                      type="checkbox"
                      aria-label="Select all professionals"
                      checked={
                        professionalIdSet.size > 0 &&
                        selectedAccessIds.size === professionalIdSet.size
                      }
                      onChange={(event) => toggleSelectAll(event.target.checked)}
                    />
                  </th>
                )}
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Access Since</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {accessList.map((entry) => (
                <tr key={entry.id}>
                  {revokeMode && (
                    <td className="centered-col">
                      <input
                        type="checkbox"
                        aria-label={`Select ${entry.name}`}
                        checked={selectedAccessIds.has(entry.medical_professional_id)}
                        onChange={(event) => toggleSelection(entry.medical_professional_id, event.target.checked)}
                      />
                    </td>
                  )}
                  <td>{entry.name}</td>
                  <td>{entry.company || '—'}</td>
                  <td>{entry.email}</td>
                  <td>{new Date(entry.access_granted_at).toLocaleString()}</td>
                  <td>
                    {entry.access_expires_at
                      ? new Date(entry.access_expires_at).toLocaleString()
                      : 'No expiry'}
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