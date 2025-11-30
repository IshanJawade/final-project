import React from 'react';
import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="panel">
      <h2>Welcome</h2>
      <p>
        This pilot system gives patients direct control over who can view their medical records. Admins
        review all accounts, and medical professionals only see records when granted access.
      </p>
      <p>Get started by creating an account or signing in.</p>
      <div className="home-actions">
        <Link to="/login">Login</Link>
        <Link to="/register/user">User Registration</Link>
        <Link to="/register/medical">Professional Registration</Link>
      </div>
    </div>
  );
}
