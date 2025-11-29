import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children }) {
  const { token, role, account, clearAuth } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuth();
    navigate('/');
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Medical Access Control MVP</h1>
        <nav className="app-nav">
          <Link to="/">Home</Link>
          {!token && <Link to="/login">Login</Link>}
          {!token && <Link to="/register/user">Register User</Link>}
          {!token && <Link to="/register/medical">Register Professional</Link>}
          {token && role === 'user' && <Link to="/dashboard/user">User Dashboard</Link>}
          {token && role === 'medical' && <Link to="/dashboard/medical">Professional Dashboard</Link>}
          {token && role === 'admin' && <Link to="/dashboard/admin">Admin Dashboard</Link>}
          {token && (
            <button type="button" onClick={handleLogout}>
              Log Out
            </button>
          )}
        </nav>
        {token && account && (
          <div style={{ marginTop: '8px', fontSize: '14px' }}>
            Signed in as <strong>{account.name}</strong> ({role})
          </div>
        )}
      </header>
      <main className="app-content">{children}</main>
    </div>
  );
}
