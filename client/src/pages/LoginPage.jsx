import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [form, setForm] = useState({ identifier: '', password: '', role: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (evt) => {
    const { name, value } = evt.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (evt) => {
    evt.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: {
          identifier: form.identifier,
          password: form.password,
          role: form.role || undefined,
        },
      });
      setAuth({ token: payload.token, role: payload.role, account: payload.account });
      if (payload.role === 'user') {
        navigate('/user/dashboard');
      } else if (payload.role === 'medical') {
        navigate('/medical/profile');
      } else if (payload.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel panel-auth">
      <h2>Sign In</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <form className="form-grid form-stack" onSubmit={handleSubmit}>
        <label>
          Username or Email
          <input
            name="identifier"
            value={form.identifier}
            onChange={handleChange}
            required
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            required
            autoComplete="current-password"
          />
        </label>
        <label>
          Role (optional)
          <select name="role" value={form.role} onChange={handleChange}>
            <option value="">Auto detect</option>
            <option value="user">User</option>
            <option value="medical">Medical Professional</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
