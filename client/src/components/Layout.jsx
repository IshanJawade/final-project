import React, { useMemo } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function getNavLinks(role) {
  switch (role) {
    case 'user':
      return [
        { to: '/user/records', label: 'Records' },
        { to: '/user/access', label: 'Access' },
        { to: '/user/profile', label: 'Profile', icon: 'profile' },
      ];
    case 'medical':
      return [
        { to: '/medical/patients', label: 'Patients' },
        { to: '/medical/requests', label: 'Access Requests' },
        { to: '/medical/profile', label: 'Profile', icon: 'profile' },
      ];
    case 'admin':
      return [
        { to: '/admin/pending-users', label: 'Users' },
        { to: '/admin/pending-professionals', label: 'Professionals' },
        { to: '/admin/profile', label: 'Profile', icon: 'profile' },
      ];
    default:
      return [];
  }
}

function getInitials(name = '') {
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

  const navLinks = useMemo(() => (token ? getNavLinks(role) : []), [token, role]);
  const initials = useMemo(() => getInitials(account?.name), [account]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <Link to="/">Medical Access Control MVP</Link>
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
                <div className="profile-chip">
                  <div className="profile-icon">{initials}</div>
                  <div className="profile-details">
                    <span className="profile-name">{account?.name || 'Account'}</span>
                    <span className="profile-role">{role}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="app-content">
        <div className="page-container">{children}</div>
      </main>
    </div>
  );
}
