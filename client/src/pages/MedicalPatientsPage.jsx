import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateMMDDYYYY } from '../utils/date.js';

export default function MedicalPatientsPage() {
  const { token } = useAuth();
  const [patients, setPatients] = useState([]);
  const [patientError, setPatientError] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedPatientProfile, setSelectedPatientProfile] = useState(null);
  const [selectedPatientAccess, setSelectedPatientAccess] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const activeProfileRequestRef = useRef(null);

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    []
  );

  useEffect(() => {
    loadPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPatients() {
    try {
      const payload = await apiRequest('/api/medical/patients', { token });
      setPatients(payload.patients || []);
      setPatientError('');
    } catch (err) {
      setPatientError(err.message);
      setPatients([]);
    }
  }
  const formatDateTime = useCallback(
    (value, fallback = 'N/A') => {
      if (!value) {
        return fallback;
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return fallback;
      }
      return dateTimeFormatter.format(date);
    },
    [dateTimeFormatter]
  );

  const resetProfileState = useCallback(() => {
    setSelectedPatientProfile(null);
    setSelectedPatientAccess(null);
    setProfileError('');
    setProfileLoading(false);
    activeProfileRequestRef.current = null;
  }, []);

  const loadPatientProfile = useCallback(
    async (userId) => {
      activeProfileRequestRef.current = userId;
      setProfileLoading(true);
      setProfileError('');
      try {
        const payload = await apiRequest(`/api/medical/patients/${userId}/profile`, { token });
        if (activeProfileRequestRef.current !== userId) {
          return;
        }
        setSelectedPatientProfile(payload.patient || null);
        setSelectedPatientAccess(payload.access || null);
      } catch (err) {
        if (activeProfileRequestRef.current !== userId) {
          return;
        }
        setProfileError(err.message);
        setSelectedPatientProfile(null);
        setSelectedPatientAccess(null);
      } finally {
        if (activeProfileRequestRef.current === userId) {
          setProfileLoading(false);
        }
      }
    },
    [token]
  );

  const handleTogglePatient = (patient) => {
    if (selectedPatient?.id === patient.id) {
      resetProfileState();
      setSelectedPatient(null);
      return;
    }

    setSelectedPatient(patient);
    resetProfileState();
    loadPatientProfile(patient.id);
  };

  useEffect(() => {
    if (!selectedPatient) {
      return;
    }

    const updatedPatient = patients.find((patient) => patient.id === selectedPatient.id);
    if (!updatedPatient) {
      resetProfileState();
      setSelectedPatient(null);
      return;
    }

    if (updatedPatient !== selectedPatient) {
      setSelectedPatient(updatedPatient);
    }
  }, [patients, selectedPatient, resetProfileState]);

  const initials = useMemo(() => {
    const source = (selectedPatientProfile?.name || selectedPatient?.name || '').trim();
    if (source) {
      const chars = source
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => (part && part[0] ? part[0].toUpperCase() : ''))
        .join('')
        .trim();
      if (chars) {
        return chars;
      }
    }
    const fallbackEmail = (selectedPatientProfile?.email || selectedPatient?.email || '').trim();
    if (fallbackEmail) {
      return fallbackEmail.charAt(0).toUpperCase();
    }
    const fallbackMuid = (selectedPatientProfile?.muid || selectedPatient?.muid || '').trim();
    if (fallbackMuid) {
      return fallbackMuid.charAt(0).toUpperCase();
    }
    return '?';
  }, [selectedPatientProfile, selectedPatient]);

  const formattedDob = useMemo(() => {
    if (!selectedPatientProfile?.date_of_birth) {
      return 'N/A';
    }
    const formatted = formatDateMMDDYYYY(selectedPatientProfile.date_of_birth);
    return formatted || 'N/A';
  }, [selectedPatientProfile]);

  const daysRemaining = useMemo(() => {
    if (!selectedPatientAccess || !selectedPatientAccess.expires_at) {
      return null;
    }
    if (typeof selectedPatientAccess.days_remaining === 'number') {
      return selectedPatientAccess.days_remaining;
    }
    const expiry = new Date(selectedPatientAccess.expires_at);
    if (Number.isNaN(expiry.getTime())) {
      return null;
    }
    const diff = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return Math.max(diff, 0);
  }, [selectedPatientAccess]);

  const accessSummary = useMemo(() => {
    if (!selectedPatientAccess) {
      return 'Access information unavailable.';
    }
    if (!selectedPatientAccess.expires_at) {
      return 'Access does not expire.';
    }
    if (daysRemaining === null) {
      return 'Access expiry unknown.';
    }
    if (daysRemaining === 0) {
      return 'Access expires today.';
    }
    if (daysRemaining === 1) {
      return '1 day of access remaining.';
    }
    return `${daysRemaining} days of access remaining.`;
  }, [selectedPatientAccess, daysRemaining]);

  return (
    <>
      <div className="panel">
        <h2>My Patients</h2>
        {patientError && <div className="alert alert-error">{patientError}</div>}
        {patients.length === 0 && <p className="muted">No patients have granted access.</p>}
        {patients.length > 0 && (
          <div className="table-wrapper">
            <table className="table table-patients">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>MUID</th>
                  <th>Expires</th>
                  <th className="actions-col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => {
                  const isExpanded = selectedPatient?.id === patient.id;
                  return (
                    <Fragment key={patient.id}>
                      <tr>
                        <td>{patient.name}</td>
                        <td>{patient.muid}</td>
                        <td className="date-cell">
                          {patient.access_expires_at
                            ? formatDateTime(patient.access_expires_at, 'No expiry')
                            : 'No expiry'}
                        </td>
                        <td className="actions-cell">
                          <button type="button" onClick={() => handleTogglePatient(patient)}>
                            {isExpanded ? 'Hide Details' : 'View Records'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="patient-details-row">
                          <td colSpan={4}>
                            <div className="panel" style={{ marginTop: '16px' }}>
                              <header className="panel-header" style={{ marginBottom: '16px' }}>
                                <div>
                                  <h2 style={{ marginTop: 0, marginBottom: '4px' }}>Patient Snapshot</h2>
                                  <p className="muted" style={{ margin: 0 }}>MUID: {patient.muid}</p>
                                </div>
                                <Link
                                  to={`/medical/patients/${patient.id}/profile`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="button-secondary"
                                >
                                  View Profile
                                </Link>
                              </header>
                              {profileError && <div className="alert alert-error">{profileError}</div>}
                              {profileLoading && <p className="muted">Loading patient details...</p>}
                              {!profileLoading && !selectedPatientProfile && !profileError && (
                                <p className="muted">Patient details are unavailable.</p>
                              )}
                              {!profileLoading && selectedPatientProfile && (
                                <div
                                  className="dashboard-grid"
                                  style={{ gap: '40px', alignItems: 'stretch', marginTop: '8px' }}
                                >
                                  <div className="profile-sidebar" style={{ position: 'static', marginTop: 0 }}>
                                    <div className="avatar-placeholder" aria-hidden="true">
                                      <span>{initials !== '?' ? initials : 'Avatar'}</span>
                                    </div>
                                    <dl className="profile-meta">
                                      <div className="profile-meta-row">
                                        <dt>Name</dt>
                                        <dd>{selectedPatientProfile.name || 'N/A'}</dd>
                                      </div>
                                      <div className="profile-meta-row">
                                        <dt>Date of Birth</dt>
                                        <dd>{formattedDob}</dd>
                                      </div>
                                      <div className="profile-meta-row">
                                        <dt>Year of Birth</dt>
                                        <dd>{selectedPatientProfile.year_of_birth || 'N/A'}</dd>
                                      </div>
                                      <div className="profile-meta-row">
                                        <dt>Email</dt>
                                        <dd>{selectedPatientProfile.email || 'N/A'}</dd>
                                      </div>
                                      <div className="profile-meta-row">
                                        <dt>Mobile</dt>
                                        <dd>{selectedPatientProfile.mobile || 'N/A'}</dd>
                                      </div>
                                      <div className="profile-meta-row">
                                        <dt>Address</dt>
                                        <dd>{selectedPatientProfile.address || 'N/A'}</dd>
                                      </div>
                                    </dl>
                                  </div>
                                  <div
                                    style={{
                                      flex: '1 1 auto',
                                      minWidth: 0,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '24px',
                                    }}
                                  >
                                    <div
                                      style={{
                                        border: '1px solid var(--border)',
                                        borderRadius: '12px',
                                        background: 'var(--surface)',
                                        boxShadow: 'var(--shadow-soft)',
                                        padding: '24px',
                                      }}
                                    >
                                      <h3 style={{ margin: '0 0 16px 0' }}>Access Overview</h3>
                                      <p>{accessSummary}</p>
                                      <dl className="profile-meta" style={{ marginTop: '16px' }}>
                                        <div className="profile-meta-row">
                                          <dt>Access Granted</dt>
                                          <dd>{formatDateTime(selectedPatientAccess?.granted_at)}</dd>
                                        </div>
                                        <div className="profile-meta-row">
                                          <dt>Access Expires</dt>
                                          <dd>{formatDateTime(selectedPatientAccess?.expires_at, 'No expiry')}</dd>
                                        </div>
                                      </dl>
                                    </div>
                                    <div
                                      style={{
                                        border: '1px solid var(--border)',
                                        borderRadius: '12px',
                                        background: 'var(--surface)',
                                        boxShadow: 'var(--shadow-soft)',
                                        padding: '24px',
                                      }}
                                    >
                                      <h3 style={{ margin: '0 0 16px 0' }}>Account History</h3>
                                      <dl className="profile-meta" style={{ marginTop: '16px' }}>
                                        <div className="profile-meta-row">
                                          <dt>Created</dt>
                                          <dd>{formatDateTime(selectedPatientProfile.created_at)}</dd>
                                        </div>
                                        <div className="profile-meta-row">
                                          <dt>Last Updated</dt>
                                          <dd>{formatDateTime(selectedPatientProfile.updated_at)}</dd>
                                        </div>
                                      </dl>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
