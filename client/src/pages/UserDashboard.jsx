import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';
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
  const [recordForm, setRecordForm] = useState({ summary: '', notes: '', medicalProfessionalId: '' });
  const [recordMessage, setRecordMessage] = useState('');
  const [recordError, setRecordError] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);

  const [accessList, setAccessList] = useState([]);
  const [accessForm, setAccessForm] = useState({ professionalId: '' });
  const [accessMessage, setAccessMessage] = useState('');
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    loadProfile();
    loadRecords();
    loadAccess();
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
    } catch (err) {
      setRecordError(err.message);
    }
  }

  async function loadAccess() {
    try {
      const payload = await apiRequest('/api/user/access', { token });
      setAccessList(payload.professionals || []);
    } catch (err) {
      setAccessError(err.message);
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

  const handleRecordSubmit = async (evt) => {
    evt.preventDefault();
    setRecordMessage('');
    setRecordError('');
    try {
      const payload = await apiRequest('/api/records', {
        method: 'POST',
        token,
        body: {
          data: {
            summary: recordForm.summary,
            notes: recordForm.notes,
          },
          medical_professional_id: recordForm.medicalProfessionalId
            ? Number(recordForm.medicalProfessionalId)
            : null,
        },
      });
      setRecordMessage('Record saved.');
      setRecordForm({ summary: '', notes: '', medicalProfessionalId: '' });
      setRecords((prev) => [payload.record, ...prev]);
    } catch (err) {
      setRecordError(err.message);
    }
  };

  const handleGrantAccess = async (evt) => {
    evt.preventDefault();
    setAccessMessage('');
    setAccessError('');
    try {
      await apiRequest('/api/user/access/grant', {
        method: 'POST',
        token,
        body: { medical_professional_id: Number(accessForm.professionalId) },
      });
      setAccessMessage('Access granted.');
      setAccessForm({ professionalId: '' });
      loadAccess();
    } catch (err) {
      setAccessError(err.message);
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
        <h3>Create Record</h3>
        {recordError && <div className="alert alert-error">{recordError}</div>}
        {recordMessage && <div className="alert alert-success">{recordMessage}</div>}
        <form className="form-grid" onSubmit={handleRecordSubmit}>
          <label>
            Summary
            <input
              value={recordForm.summary}
              onChange={(evt) =>
                setRecordForm((prev) => ({ ...prev, summary: evt.target.value }))
              }
              required
            />
          </label>
          <label>
            Notes
            <textarea
              rows="3"
              value={recordForm.notes}
              onChange={(evt) =>
                setRecordForm((prev) => ({ ...prev, notes: evt.target.value }))
              }
              required
            />
          </label>
          <label>
            Medical Professional ID (optional)
            <input
              value={recordForm.medicalProfessionalId}
              onChange={(evt) =>
                setRecordForm((prev) => ({ ...prev, medicalProfessionalId: evt.target.value }))
              }
            />
          </label>
          <button type="submit">Save Record</button>
        </form>
      </div>

      <div className="panel">
        <h3>My Records</h3>
        {records.length === 0 && <p>No records yet.</p>}
        {records.map((rec) => (
          <div key={rec.id} style={{ marginBottom: '12px', borderBottom: '1px solid #ccc', paddingBottom: '8px' }}>
            <div>
              <strong>Record #{rec.id}</strong> • {new Date(rec.created_at).toLocaleString()}
            </div>
            <div>Summary: {rec.data.summary || '(no summary)'}</div>
            <button type="button" onClick={() => setSelectedRecord(rec)}>
              View Details
            </button>
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
        <h3>Manage Access</h3>
        {accessError && <div className="alert alert-error">{accessError}</div>}
        {accessMessage && <div className="alert alert-success">{accessMessage}</div>}
        <form className="form-grid" onSubmit={handleGrantAccess}>
          <label>
            Medical Professional ID
            <input
              value={accessForm.professionalId}
              onChange={(evt) =>
                setAccessForm({ professionalId: evt.target.value })
              }
              required
            />
          </label>
          <button type="submit">Grant Access</button>
        </form>
        <h4>Active Access</h4>
        {accessList.length === 0 && <p>No professionals currently have access.</p>}
        {accessList.length > 0 && (
          <table className="table-like">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Since</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {accessList.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.name}</td>
                  <td>{entry.email}</td>
                  <td>{new Date(entry.access_granted_at).toLocaleString()}</td>
                  <td>
                    <button type="button" onClick={() => handleRevoke(entry.medical_professional_id)}>
                      Revoke
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
