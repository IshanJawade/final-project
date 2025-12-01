import React, { useMemo, useState } from 'react';
import { apiRequest } from '../api.js';
import { formatDateMMDDYYYY } from '../utils/date.js';

const initialState = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
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

  const maxDob = useMemo(() => new Date().toISOString().slice(0, 10), []);

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
      const payload = {
        ...form,
        dateOfBirth: formatDateMMDDYYYY(form.dateOfBirth),
      };
      await apiRequest('/api/auth/register/user', {
        method: 'POST',
        body: payload,
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
    <div className="panel panel-auth">
      <h2>User Registration</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <form className="form-grid form-stack" onSubmit={handleSubmit}>
        <label>
          First Name
          <input name="firstName" value={form.firstName} onChange={handleChange} required />
        </label>
        <label>
          Last Name
          <input name="lastName" value={form.lastName} onChange={handleChange} required />
        </label>
        <label>
          Date of Birth
          <input
            type="date"
            name="dateOfBirth"
            value={form.dateOfBirth}
            onChange={handleChange}
            max={maxDob}
            required
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
