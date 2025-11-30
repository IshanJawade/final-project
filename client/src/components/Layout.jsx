import React, { useMemo } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function getNavLinks(role) {
  switch (role) {
    case 'user':
      return [
        { to: '/user/profile', label: 'Profile' },
        { to: '/user/records', label: 'Records' },
        { to: '/user/access', label: 'Access' },
      ];
    case 'medical':
      return [
        { to: '/medical/profile', label: 'Profile' },
        { to: '/medical/patients', label: 'Patients' },
        { to: '/medical/requests', label: 'Access Requests' },
      ];
    case 'admin':
      return [
        { to: '/admin/profile', label: 'Profile' },
        { to: '/admin/pending-users', label: 'Users' },
        { to: '/admin/pending-professionals', label: 'Professionals' },
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

export default function Layout({ children }) {
  const { token, role, account, clearAuth } = useAuth();
  const navigate = useNavigate();

  const navLinks = useMemo(() => (token ? getNavLinks(role) : []), [token, role]);
  const initials = useMemo(() => getInitials(account?.name), [account]);

  const handleLogout = () => {
    clearAuth();
    navigate('/');
  };

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
                <button type="button" onClick={handleLogout} className="logout-button">
                  Log Out
                </button>
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
