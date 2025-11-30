import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function UserProfilePage() {
  const { token } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', mobile: '', address: '' });
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
        name: payload.user.name || '',
        email: payload.user.email || '',
        mobile: payload.user.mobile || '',
        address: payload.user.address || '',
      });
      setProfileError('');
    } catch (err) {
      setProfileError(err.message);
    }
  }

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
            Name
            <input
              name="name"
              value={profileForm.name}
              onChange={(evt) =>
                setProfileForm((prev) => ({ ...prev, name: evt.target.value }))
              }
              required
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              value={profileForm.email}
              onChange={(evt) =>
                setProfileForm((prev) => ({ ...prev, email: evt.target.value }))
              }
              required
            />
          </label>
          <label>
            Mobile
            <input
              name="mobile"
              value={profileForm.mobile}
              onChange={(evt) =>
                setProfileForm((prev) => ({ ...prev, mobile: evt.target.value }))
              }
            />
          </label>
          <label>
            Address
            <textarea
              name="address"
              rows="2"
              value={profileForm.address}
              onChange={(evt) =>
                setProfileForm((prev) => ({ ...prev, address: evt.target.value }))
              }
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
    </>
  );
}
