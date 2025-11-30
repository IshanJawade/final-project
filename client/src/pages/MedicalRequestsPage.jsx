import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function MedicalRequestsPage() {
  const { token } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState('');

  const [requestNote, setRequestNote] = useState('');
  const [requestStatus, setRequestStatus] = useState('');
  const [requestErrorMsg, setRequestErrorMsg] = useState('');

  const [requests, setRequests] = useState([]);
  const [requestsError, setRequestsError] = useState('');

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRequests() {
    try {
      const payload = await apiRequest('/api/medical/access/requests', { token });
      setRequests(payload.requests || []);
      setRequestsError('');
    } catch (err) {
      setRequestsError(err.message);
    }
  }

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
      setSearchResults([]);
      await loadRequests();
    } catch (err) {
      setRequestErrorMsg(err.message);
    }
  };

  return (
    <>
      <div className="panel">
        <h2>Request Patient Access</h2>
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
            <h3>Results</h3>
            <label>
              Optional message to patient
              <textarea
                rows="2"
                value={requestNote}
                onChange={(evt) => setRequestNote(evt.target.value)}
              />
            </label>
            <table className="table">
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
        <h2>Access Requests</h2>
        {requestsError && <div className="alert alert-error">{requestsError}</div>}
        {requests.length === 0 && <p className="muted">No requests yet.</p>}
        {requests.length > 0 && (
          <table className="table">
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
                  <td>
                    <span className={`pill ${(req.status || '').toLowerCase()}`}>
                      {req.status}
                    </span>
                  </td>
                  <td>{new Date(req.created_at).toLocaleString()}</td>
                  <td>{req.responded_at ? new Date(req.responded_at).toLocaleString() : '—'}</td>
                  <td>{req.requested_message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
