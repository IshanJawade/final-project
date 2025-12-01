import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateMMDDYYYY } from '../utils/date.js';

export default function UserProfilePage() {
  const { token, clearAuth } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    address: '',
    dateOfBirth: '',
  });
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    try {
      const payload = await apiRequest('/api/user/me', { token });
      setProfile(payload.user);
      setProfileForm({
        firstName: payload.user.first_name || '',
        lastName: payload.user.last_name || '',
        email: payload.user.email || '',
        mobile: payload.user.mobile || '',
        address: payload.user.address || '',
        dateOfBirth: formatDateMMDDYYYY(payload.user.date_of_birth) || '',
      });
      setProfileError('');
    } catch (err) {
      setProfileError(err.message);
    }
  }

  const handleProfileChange = (evt) => {
    const { name, value } = evt.target;
    setProfileForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileSubmit = async (evt) => {
    evt.preventDefault();
    setProfileMessage('');
    setProfileError('');
    try {
      const payload = await apiRequest('/api/user/me', {
        method: 'PUT',
        token,
        body: profileForm,
      });
      setProfile(payload.user);
      setProfileMessage('Profile updated.');
    } catch (err) {
      setProfileError(err.message);
    }
  };

  const handlePasswordSubmit = async (evt) => {
    evt.preventDefault();
    setPasswordMessage('');
    setPasswordError('');
    try {
      await apiRequest('/api/user/me/password', {
        method: 'PUT',
        token,
        body: passwordForm,
      });
      setPasswordMessage('Password updated.');
      setPasswordForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setPasswordError(err.message);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/');
  };

  return (
    <>
      <div className="panel">
        <h2>User Profile</h2>
        {profile && (
          <p>
            <strong>MUID:</strong> {profile.muid}
          </p>
        )}
        {profileError && <div className="alert alert-error">{profileError}</div>}
        {profileMessage && <div className="alert alert-success">{profileMessage}</div>}
        <form className="form-grid" onSubmit={handleProfileSubmit}>
          <label>
            First Name
            <input
              name="firstName"
              value={profileForm.firstName}
              onChange={handleProfileChange}
              required
            />
          </label>
          <label>
            Last Name
            <input
              name="lastName"
              value={profileForm.lastName}
              onChange={handleProfileChange}
              required
            />
          </label>
          <label>
            Date of Birth (MM/DD/YYYY)
            <input
              name="dateOfBirth"
              value={profileForm.dateOfBirth}
              onChange={handleProfileChange}
              placeholder="MM/DD/YYYY"
              required
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              value={profileForm.email}
              onChange={handleProfileChange}
              required
            />
          </label>
          <label>
            Mobile
            <input
              name="mobile"
              value={profileForm.mobile}
              onChange={handleProfileChange}
            />
          </label>
          <label>
            Address
            <textarea
              name="address"
              rows="2"
              value={profileForm.address}
              onChange={handleProfileChange}
            />
          </label>
          <button type="submit">Save Profile</button>
        </form>
      </div>

      <div className="panel">
        <h2>Change Password</h2>
        {passwordError && <div className="alert alert-error">{passwordError}</div>}
        {passwordMessage && <div className="alert alert-success">{passwordMessage}</div>}
        <form className="form-grid" onSubmit={handlePasswordSubmit}>
          <label>
            Current Password
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(evt) =>
                setPasswordForm((prev) => ({ ...prev, currentPassword: evt.target.value }))
              }
              required
            />
          </label>
          <label>
            New Password
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(evt) =>
                setPasswordForm((prev) => ({ ...prev, newPassword: evt.target.value }))
              }
              required
            />
          </label>
          <button type="submit">Update Password</button>
        </form>
      </div>

      <div className="panel profile-logout-panel">
        <div>
          <h2>Session</h2>
          <p className="muted">Sign out when you are done reviewing your records.</p>
        </div>
        <button type="button" className="logout-button" onClick={handleLogout}>
          Log Out
        </button>
      </div>
    </>
  );
}
