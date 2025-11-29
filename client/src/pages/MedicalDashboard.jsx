import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function MedicalDashboard() {
  const { token } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', mobile: '', address: '', company: '' });
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [patients, setPatients] = useState([]);
  const [patientError, setPatientError] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientRecords, setPatientRecords] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requestStatus, setRequestStatus] = useState('');
  const [requestErrorMsg, setRequestErrorMsg] = useState('');

  const [requests, setRequests] = useState([]);
  const [requestsError, setRequestsError] = useState('');

  const [newRecordForm, setNewRecordForm] = useState({ summary: '', notes: '' });
  const [newRecordMessage, setNewRecordMessage] = useState('');
  const [newRecordError, setNewRecordError] = useState('');

  useEffect(() => {
    loadProfile();
    loadPatients();
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    try {
      const payload = await apiRequest('/api/medical/me', { token });
      setProfile(payload.medicalProfessional);
      setProfileForm({
        name: payload.medicalProfessional.name || '',
        email: payload.medicalProfessional.email || '',
        mobile: payload.medicalProfessional.mobile || '',
        address: payload.medicalProfessional.address || '',
        company: payload.medicalProfessional.company || '',
      });
    } catch (err) {
      setProfileError(err.message);
    }
  }

  async function loadPatients() {
    try {
      const payload = await apiRequest('/api/medical/patients', { token });
      setPatients(payload.patients || []);
      setPatientError('');
    } catch (err) {
      setPatientError(err.message);
    }
  }

  async function loadRequests() {
    try {
      const payload = await apiRequest('/api/medical/access/requests', { token });
      setRequests(payload.requests || []);
      setRequestsError('');
    } catch (err) {
      setRequestsError(err.message);
    }
  }

  async function loadPatientRecords(userId) {
    try {
      const payload = await apiRequest(`/api/medical/patients/${userId}/records`, { token });
      setPatientRecords(payload.records || []);
      setNewRecordError('');
      setNewRecordMessage('');
    } catch (err) {
      setNewRecordError(err.message);
      setPatientRecords([]);
    }
  }

  const handleProfileSubmit = async (evt) => {
    evt.preventDefault();
    setProfileMessage('');
    setProfileError('');
    try {
      const payload = await apiRequest('/api/medical/me', {
        method: 'PUT',
        token,
        body: profileForm,
      });
      setProfile(payload.medicalProfessional);
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
      await apiRequest('/api/medical/me/password', {
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

  const handleSearch = async (evt) => {
    evt.preventDefault();
    setSearchError('');
    setRequestStatus('');
    setRequestErrorMsg('');
    try {
      const payload = await apiRequest(`/api/medical/search-users?query=${encodeURIComponent(searchTerm)}`, {
        token,
      });
      setSearchResults(payload.users || []);
    } catch (err) {
      setSearchError(err.message);
      setSearchResults([]);
    }
  };

  const handleSendRequest = async (userId) => {
    setRequestStatus('');
    setRequestErrorMsg('');
    try {
      await apiRequest('/api/medical/access/request', {
        method: 'POST',
        token,
        body: { user_id: userId, message: requestNote },
      });
      setRequestStatus('Request submitted.');
      setRequestNote('');
      await Promise.all([loadRequests(), loadPatients()]);
    } catch (err) {
      setRequestErrorMsg(err.message);
    }
  };

  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    setNewRecordForm({ summary: '', notes: '' });
    loadPatientRecords(patient.id);
  };

  const handleCreateRecord = async (evt) => {
    evt.preventDefault();
    if (!selectedPatient) return;
    setNewRecordError('');
    setNewRecordMessage('');
    try {
      await apiRequest(`/api/medical/patients/${selectedPatient.id}/records`, {
        method: 'POST',
        token,
        body: { data: { summary: newRecordForm.summary, notes: newRecordForm.notes } },
      });
      setNewRecordMessage('Record saved.');
      setNewRecordForm({ summary: '', notes: '' });
      loadPatientRecords(selectedPatient.id);
    } catch (err) {
      setNewRecordError(err.message);
    }
  };

  return (
    <div className="panel">
      <h2>Medical Professional Dashboard</h2>

      <div className="panel">
        <h3>Profile</h3>
        {profileError && <div className="alert alert-error">{profileError}</div>}
        {profileMessage && <div className="alert alert-success">{profileMessage}</div>}
        <form className="form-grid" onSubmit={handleProfileSubmit}>
          <label>
            Name
            <input
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
              value={profileForm.mobile}
              onChange={(evt) =>
                setProfileForm((prev) => ({ ...prev, mobile: evt.target.value }))
              }
            />
          </label>
          <label>
            Address
            <textarea
              rows="2"
              value={profileForm.address}
              onChange={(evt) =>
                setProfileForm((prev) => ({ ...prev, address: evt.target.value }))
              }
            />
          </label>
          <label>
            Company
            <input
              value={profileForm.company}
              onChange={(evt) =>
                setProfileForm((prev) => ({ ...prev, company: evt.target.value }))
              }
            />
          </label>
          <button type="submit">Save Profile</button>
        </form>
      </div>

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
        <h3>Request Patient Access</h3>
        {searchError && <div className="alert alert-error">{searchError}</div>}
        {requestStatus && <div className="alert alert-success">{requestStatus}</div>}
        {requestErrorMsg && <div className="alert alert-error">{requestErrorMsg}</div>}
        <form className="form-grid" onSubmit={handleSearch}>
          <label>
            Search by Name or MUID
            <input value={searchTerm} onChange={(evt) => setSearchTerm(evt.target.value)} required />
          </label>
          <button type="submit">Search</button>
        </form>
        {searchResults.length > 0 && (
          <div className="panel">
            <h4>Results</h4>
            <label>
              Optional message to patient
              <textarea
                rows="2"
                value={requestNote}
                onChange={(evt) => setRequestNote(evt.target.value)}
              />
            </label>
            <table className="table-like">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>MUID</th>
                  <th>Email</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.muid}</td>
                    <td>{user.email}</td>
                    <td>
                      <button type="button" onClick={() => handleSendRequest(user.id)}>
                        Request Access
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
        <h3>Access Requests</h3>
        {requestsError && <div className="alert alert-error">{requestsError}</div>}
        {requests.length === 0 && <p>No requests yet.</p>}
        {requests.length > 0 && (
          <table className="table-like">
            <thead>
              <tr>
                <th>User</th>
                <th>MUID</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Responded</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id}>
                  <td>{req.name}</td>
                  <td>{req.muid}</td>
                  <td>{req.status}</td>
                  <td>{new Date(req.created_at).toLocaleString()}</td>
                  <td>{req.responded_at ? new Date(req.responded_at).toLocaleString() : '—'}</td>
                  <td>{req.requested_message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h3>My Patients</h3>
        {patientError && <div className="alert alert-error">{patientError}</div>}
        {patients.length === 0 && <p>No patients have granted access.</p>}
        {patients.length > 0 && (
          <table className="table-like">
            <thead>
              <tr>
                <th>Name</th>
                <th>MUID</th>
                <th>Email</th>
                <th>Access Since</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <tr key={patient.id}>
                  <td>{patient.name}</td>
                  <td>{patient.muid}</td>
                  <td>{patient.email}</td>
                  <td>{new Date(patient.access_granted_at).toLocaleString()}</td>
                  <td>
                    {patient.access_expires_at
                      ? new Date(patient.access_expires_at).toLocaleString()
                      : 'No expiry'}
                  </td>
                  <td>
                    <button type="button" onClick={() => handleSelectPatient(patient)}>
                      View Records
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedPatient && (
        <div className="panel">
          <h3>Records for {selectedPatient.name}</h3>
          {newRecordError && <div className="alert alert-error">{newRecordError}</div>}
          {newRecordMessage && <div className="alert alert-success">{newRecordMessage}</div>}
          <form className="form-grid" onSubmit={handleCreateRecord}>
            <label>
              Summary
              <input
                value={newRecordForm.summary}
                onChange={(evt) => setNewRecordForm((prev) => ({ ...prev, summary: evt.target.value }))}
                required
              />
            </label>
            <label>
              Notes
              <textarea
                rows="3"
                value={newRecordForm.notes}
                onChange={(evt) => setNewRecordForm((prev) => ({ ...prev, notes: evt.target.value }))}
                required
              />
            </label>
            <button type="submit">Add Record</button>
          </form>
          {patientRecords.length === 0 && <p>No records available.</p>}
          {patientRecords.map((record) => (
            <div key={record.id} style={{ marginBottom: '12px', borderBottom: '1px solid #ccc', paddingBottom: '8px' }}>
              <div>
                <strong>Record #{record.id}</strong> • {new Date(record.created_at).toLocaleString()}
              </div>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(record.data, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
