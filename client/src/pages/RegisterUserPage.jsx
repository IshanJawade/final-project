import React, { useState } from 'react';
import { apiRequest } from '../api.js';

const initialState = {
  name: '',
  yearOfBirth: '',
  email: '',
  mobile: '',
  address: '',
  password: '',
};

export default function RegisterUserPage() {
  const [form, setForm] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (evt) => {
    const { name, value } = evt.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (evt) => {
    evt.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest('/api/auth/register/user', {
        method: 'POST',
        body: {
          ...form,
          yearOfBirth: Number(form.yearOfBirth),
        },
      });
      setSuccess('Registration submitted. An admin will review your account.');
      setForm(initialState);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <h2>User Registration</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Full Name
          <input name="name" value={form.name} onChange={handleChange} required />
        </label>
        <label>
          Year of Birth
          <input
            name="yearOfBirth"
            value={form.yearOfBirth}
            onChange={handleChange}
            type="number"
            required
            min="1900"
            max="2025"
          />
        </label>
        <label>
          Email
          <input name="email" type="email" value={form.email} onChange={handleChange} required />
        </label>
        <label>
          Mobile
          <input name="mobile" value={form.mobile} onChange={handleChange} />
        </label>
        <label>
          Address
          <textarea name="address" value={form.address} onChange={handleChange} rows="2" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Submitting…' : 'Register'}
        </button>
      </form>
    </div>
  );
}
