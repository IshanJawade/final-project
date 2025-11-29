import React, { useEffect, useState } from 'react';
import { apiRequest, API_BASE } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function UserDashboard() {
  const { token } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', mobile: '', address: '' });
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [records, setRecords] = useState([]);
  const [recordError, setRecordError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);

  const [accessList, setAccessList] = useState([]);
  const [accessMessage, setAccessMessage] = useState('');
  const [accessError, setAccessError] = useState('');

  const [requests, setRequests] = useState([]);
  const [requestError, setRequestError] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [requestExpiry, setRequestExpiry] = useState({});

  useEffect(() => {
    loadProfile();
    loadRecords();
    loadAccess();
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    try {
      const payload = await apiRequest('/api/user/me', { token });
      setProfile(payload.user);
      setProfileForm({
        name: payload.user.name || '',
        email: payload.user.email || '',
        mobile: payload.user.mobile || '',
        address: payload.user.address || '',
      });
    } catch (err) {
      setProfileError(err.message);
    }
  }

  async function loadRecords() {
    try {
      const payload = await apiRequest('/api/records', { token });
      setRecords(payload.records || []);
      setRecordError('');
    } catch (err) {
      setRecordError(err.message);
    }
  }

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

  const handleProfileSubmit = async (evt) => {
    evt.preventDefault();
    setProfileMessage('');
    setProfileError('');
    try {
      const payload = await apiRequest('/api/user/me', {
        method: 'PUT',
        token,
        body: profileForm,
      });
      setProfile(payload.user);
      setProfileMessage('Profile updated.');
    } catch (err) {
      setProfileError(err.message);
    }
  };

  const handlePasswordSubmit = async (evt) => {
    evt.preventDefault();
    setPasswordMessage('');
    setPasswordError('');
    try {
      await apiRequest('/api/user/me/password', {
        method: 'PUT',
        token,
        body: passwordForm,
      });
      setPasswordMessage('Password updated.');
      setPasswordForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setPasswordError(err.message);
    }
  };

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
    <div className="panel">
      <h2>User Dashboard</h2>

      {profile && (
        <div className="panel">
          <h3>Profile</h3>
          <p>
            <strong>MUID:</strong> {profile.muid}
          </p>
          {profileError && <div className="alert alert-error">{profileError}</div>}
          {profileMessage && <div className="alert alert-success">{profileMessage}</div>}
          <form className="form-grid" onSubmit={handleProfileSubmit}>
            <label>
              Name
              <input
                name="name"
                value={profileForm.name}
                onChange={(evt) =>
                  setProfileForm((prev) => ({ ...prev, name: evt.target.value }))
                }
                required
              />
            </label>
            <label>
              Email
              <input
                name="email"
                type="email"
                value={profileForm.email}
                onChange={(evt) =>
                  setProfileForm((prev) => ({ ...prev, email: evt.target.value }))
                }
                required
              />
            </label>
            <label>
              Mobile
              <input
                name="mobile"
                value={profileForm.mobile}
                onChange={(evt) =>
                  setProfileForm((prev) => ({ ...prev, mobile: evt.target.value }))
                }
              />
            </label>
            <label>
              Address
              <textarea
                name="address"
                rows="2"
                value={profileForm.address}
                onChange={(evt) =>
                  setProfileForm((prev) => ({ ...prev, address: evt.target.value }))
                }
              />
            </label>
            <button type="submit">Save Profile</button>
          </form>
        </div>
      )}

      <div className="panel">
        <h3>Change Password</h3>
        {passwordError && <div className="alert alert-error">{passwordError}</div>}
        {passwordMessage && <div className="alert alert-success">{passwordMessage}</div>}
        <form className="form-grid" onSubmit={handlePasswordSubmit}>
          <label>
            Current Password
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(evt) =>
                setPasswordForm((prev) => ({ ...prev, currentPassword: evt.target.value }))
              }
              required
            />
          </label>
          <label>
            New Password
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(evt) =>
                setPasswordForm((prev) => ({ ...prev, newPassword: evt.target.value }))
              }
              required
            />
          </label>
          <button type="submit">Update Password</button>
        </form>
      </div>

      <div className="panel">
        <h3>My Records</h3>
        {recordError && <div className="alert alert-error">{recordError}</div>}
        {downloadError && <div className="alert alert-error">{downloadError}</div>}
        {records.length === 0 && <p>No records yet.</p>}
        {records.map((rec) => (
          <div key={rec.id} style={{ marginBottom: '12px', borderBottom: '1px solid #ccc', paddingBottom: '8px' }}>
            <div>
              <strong>Record #{rec.id}</strong> • {new Date(rec.created_at).toLocaleString()}
            </div>
            <div>Summary: {rec.data.summary || '(no summary)'}</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button type="button" onClick={() => setSelectedRecord(rec)}>
                View Details
              </button>
              <button type="button" onClick={() => handleDownload(rec.id)}>
                Download JSON
              </button>
            </div>
          </div>
        ))}
        {selectedRecord && (
          <div className="panel">
            <h4>Record Details</h4>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(selectedRecord.data, null, 2)}
            </pre>
            <button type="button" onClick={() => setSelectedRecord(null)}>
              Close
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Pending Access Requests</h3>
        {requestError && <div className="alert alert-error">{requestError}</div>}
        {requestMessage && <div className="alert alert-success">{requestMessage}</div>}
        {requests.length === 0 && <p>No pending requests.</p>}
        {requests.length > 0 && (
          <table className="table-like">
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
                  <td>{req.company}</td>
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
                  <td style={{ display: 'flex', gap: '8px' }}>
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
        <h3>Active Access</h3>
        {accessError && <div className="alert alert-error">{accessError}</div>}
        {accessMessage && <div className="alert alert-success">{accessMessage}</div>}
        {accessList.length === 0 && <p>No professionals currently have access.</p>}
        {accessList.length > 0 && (
          <table className="table-like">
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
                    <button type="button" onClick={() => handleRevoke(entry.medical_professional_id)}>
                      Revoke Access
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
