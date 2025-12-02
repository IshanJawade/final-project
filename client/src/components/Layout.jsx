import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiRequest } from '../api.js';
import { formatDateMMDDYYYY } from '../utils/date.js';

function getNavLinks(role) {
  switch (role) {
    case 'user':
      return [
        { to: '/user/dashboard', label: 'Dashboard' },
        { to: '/user/records', label: 'Records' },
        { to: '/user/access', label: 'Access' },
        { to: '/user/profile', label: 'Profile', icon: 'profile' },
      ];
    case 'medical':
      return [
        { to: '/medical/dashboard', label: 'Dashboard' },
        { to: '/medical/patients', label: 'Patients' },
        { to: '/medical/requests', label: 'Access Requests' },
        { to: '/medical/profile', label: 'Profile', icon: 'profile' },
      ];
    case 'admin':
      return [
        { to: '/admin/dashboard', label: 'Dashboard' },
        { to: '/admin/pending-users', label: 'Users' },
        { to: '/admin/pending-professionals', label: 'Professionals' },
        { to: '/admin/profile', label: 'Profile', icon: 'profile' },
      ];
    default:
      return [];
  }
}

function getFullName(entity) {
  if (!entity) {
    return '';
  }
  const first = entity.first_name || entity.firstName || '';
  const last = entity.last_name || entity.lastName || '';
  const composed = `${first} ${last}`.trim();
  if (composed) {
    return composed;
  }
  return entity.name || '';
}

function getInitialsFromName(name = '') {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }
  const parts = trimmed.split(/\s+/);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
  return initials || trimmed[0].toUpperCase();
}

function ProfileGlyph() {
  return (
    <svg viewBox="0 0 24 24" role="presentation" focusable="false">
      <path d="M12 2a5.25 5.25 0 1 1 0 10.5A5.25 5.25 0 0 1 12 2Zm0 12.5c4.02 0 7.5 2.38 7.5 5.25V22h-15v-2.25c0-2.87 3.48-5.25 7.5-5.25Z" />
    </svg>
  );
}

export default function Layout({ children }) {
  const { token, role, account } = useAuth();
  const [profileSummary, setProfileSummary] = useState(null);

  const navLinks = useMemo(() => (token ? getNavLinks(role) : []), [token, role]);
  const initials = useMemo(() => getInitialsFromName(getFullName(account)), [account]);

  useEffect(() => {
    if (!token) {
      setProfileSummary(null);
      return;
    }

    const endpointMap = {
      user: '/api/user/me',
      medical: '/api/medical/me',
      admin: '/api/admin/me',
    };

    const entityKey = {
      user: 'user',
      medical: 'medicalProfessional',
      admin: 'admin',
    };

    const endpoint = endpointMap[role];
    if (!endpoint) {
      setProfileSummary(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const payload = await apiRequest(endpoint, { token });
        if (cancelled) {
          return;
        }
        const entity = payload?.[entityKey[role]];
        setProfileSummary(entity || null);
      } catch (err) {
        if (!cancelled) {
          setProfileSummary(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, role]);

  const summary = profileSummary || account || null;
  const displayName = getFullName(summary) || summary?.name || 'Account';
  const profileRows = useMemo(() => {
    if (!summary) {
      return [];
    }
    if (role === 'medical') {
      return [
        { label: 'Company', value: summary.company || '—' },
        { label: 'Email', value: summary.email || '—' },
      ];
    }
    if (role === 'user') {
      const displayMuid = summary?.muid && String(summary.muid).trim().length > 0 ? summary.muid : '—';
      const rawDob = summary?.dateOfBirth ?? summary?.date_of_birth ?? null;
      const displayDob = rawDob ? formatDateMMDDYYYY(rawDob) : '—';
      return [
        { label: 'MUID', value: displayMuid || '—' },
        { label: 'Date of Birth', value: displayDob || '—' },
      ];
    }
    return [
      { label: 'Email', value: summary.email || '—' },
      { label: 'Mobile', value: summary.mobile || '—' },
    ];
  }, [summary, role]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <Link to="/">MedSecure Access</Link>
          </div>
          <div className="app-nav-right">
            {!token && (
              <div className="nav-links">
                <NavLink to="/login" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
                  Login
                </NavLink>
                <NavLink
                  to="/register/user"
                  className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                >
                  Register User
                </NavLink>
                <NavLink
                  to="/register/medical"
                  className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                >
                  Register Professional
                </NavLink>
              </div>
            )}
            {token && (
              <>
                <div className="nav-links">
                  {navLinks.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                    >
                      {link.icon === 'profile' && (
                        <span className="nav-link-icon" aria-hidden="true">
                          <ProfileGlyph />
                        </span>
                      )}
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="app-content">
        {token ? (
          <div className="dashboard-grid">
            <aside className="profile-sidebar" aria-label="Account summary">
              <div className="avatar-placeholder" aria-hidden="true">
                <span>{initials !== '?' ? initials : 'Avatar'}</span>
              </div>
              <dl className="profile-meta">
                <div className="profile-meta-row">
                  <dt>Name</dt>
                  <dd>{displayName}</dd>
                </div>
                {profileRows.map((row) => (
                  <div className="profile-meta-row" key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </aside>
            <div className="page-container">{children}</div>
          </div>
        ) : (
          <div className="page-container">{children}</div>
        )}
      </main>
    </div>
  );
}
