import { FormEvent, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ApiError, apiRequest } from '../lib/api';

const STAFF_MODE = 'staff';
const PATIENT_MODE = 'patient';

export const LoginPage = () => {
  const { loginStaff, loginPatient } = useAuth();
  const [mode, setMode] = useState<typeof STAFF_MODE | typeof PATIENT_MODE>(STAFF_MODE);
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffTotp, setStaffTotp] = useState('');

  const [patientIdentifier, setPatientIdentifier] = useState('');
  const [patientPassword, setPatientPassword] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    mrn: '',
    last_name: '',
    dob: '',
    email: '',
    password: ''
  });
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);
  const [isRegistering, setRegistering] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === STAFF_MODE) {
        await loginStaff({ email: staffEmail, password: staffPassword, totp_code: staffTotp || undefined });
      } else {
        await loginPatient({ identifier: patientIdentifier, password: patientPassword });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail ?? err.message);
      } else {
        setError('Unable to sign in. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRegisterError(null);
    setRegisterMessage(null);
    setRegistering(true);

    try {
      const response = await apiRequest<{ access_token: string; expires_in: number; user: unknown }>('/auth/patient/register', {
        method: 'POST',
        body: {
          mrn: registerForm.mrn.trim().toUpperCase(),
          last_name: registerForm.last_name.trim(),
          dob: registerForm.dob,
          email: registerForm.email.trim().toLowerCase(),
          password: registerForm.password
        }
      });
      setRegisterMessage('Registration successful! Redirecting...');
      // The auth context should handle the response automatically via cookies
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      if (err instanceof ApiError) {
        setRegisterError(err.detail ?? err.message);
      } else {
        setRegisterError('Registration failed. Please try again.');
      }
    } finally {
      setRegistering(false);
    }
  };

  // Quick login handlers for testing
  const handleQuickLogin = async (email: string, password: string, isPatient: boolean = false) => {
    setError(null);
    setSubmitting(true);
    try {
      if (isPatient) {
        await loginPatient({ identifier: email, password });
      } else {
        await loginStaff({ email, password });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail ?? err.message);
      } else {
        setError('Quick login failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <header>
          <h1>Medical Records Command</h1>
          <p>Authenticate to continue into the HIPAA-controlled environment.</p>
        </header>
        <div className="auth-toggle">
          <button type="button" className={mode === STAFF_MODE ? 'active' : ''} onClick={() => setMode(STAFF_MODE)} disabled={isSubmitting}>
            Staff Login
          </button>
          <button type="button" className={mode === PATIENT_MODE ? 'active' : ''} onClick={() => setMode(PATIENT_MODE)} disabled={isSubmitting}>
            Patient Login
          </button>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === STAFF_MODE ? (
            <>
              <label>
                <span>Email</span>
                <input type="email" value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} placeholder="drhouse@example.com" required disabled={isSubmitting} />
              </label>
              <label>
                <span>Password</span>
                <input type="password" value={staffPassword} onChange={(event) => setStaffPassword(event.target.value)} placeholder="Enter password" required disabled={isSubmitting} />
              </label>
              <label>
                <span>2FA Code (if enabled)</span>
                <input type="text" value={staffTotp} onChange={(event) => setStaffTotp(event.target.value)} placeholder="Optional" maxLength={6} disabled={isSubmitting} />
              </label>
            </>
          ) : (
            <>
              {!showRegister ? (
                <>
                  <label>
                    <span>MRN or Email</span>
                    <input type="text" value={patientIdentifier} onChange={(event) => setPatientIdentifier(event.target.value)} placeholder="MRN-XXXX or email" required disabled={isSubmitting} />
                  </label>
                  <label>
                    <span>Password</span>
                    <input type="password" value={patientPassword} onChange={(event) => setPatientPassword(event.target.value)} placeholder="Enter password" required disabled={isSubmitting} />
                  </label>
                  <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setShowRegister(true)}
                      disabled={isSubmitting}
                      style={{ fontSize: '0.85rem' }}
                    >
                      New patient? Register here
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Patient Registration</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Verify your identity using your MRN, last name, and date of birth to create your account.
                  </p>
                  <form onSubmit={handleRegister}>
                    <label>
                      <span>MRN</span>
                      <input
                        type="text"
                        value={registerForm.mrn}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, mrn: e.target.value }))}
                        placeholder="MRN-XXXX"
                        required
                        disabled={isRegistering}
                      />
                    </label>
                    <label>
                      <span>Last Name</span>
                      <input
                        type="text"
                        value={registerForm.last_name}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, last_name: e.target.value }))}
                        required
                        disabled={isRegistering}
                      />
                    </label>
                    <label>
                      <span>Date of Birth</span>
                      <input
                        type="date"
                        value={registerForm.dob}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, dob: e.target.value }))}
                        required
                        disabled={isRegistering}
                      />
                    </label>
                    <label>
                      <span>Email</span>
                      <input
                        type="email"
                        value={registerForm.email}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, email: e.target.value }))}
                        required
                        disabled={isRegistering}
                      />
                    </label>
                    <label>
                      <span>Password</span>
                      <input
                        type="password"
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, password: e.target.value }))}
                        minLength={8}
                        required
                        disabled={isRegistering}
                      />
                    </label>
                    {registerError ? <div className="auth-error">{registerError}</div> : null}
                    {registerMessage ? <div style={{ color: 'var(--accent-strong)', fontSize: '0.9rem' }}>{registerMessage}</div> : null}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                      <button type="submit" className="auth-submit" disabled={isRegistering} style={{ flex: 1 }}>
                        {isRegistering ? 'Registering...' : 'Register'}
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          setShowRegister(false);
                          setRegisterError(null);
                          setRegisterMessage(null);
                        }}
                        disabled={isRegistering}
                      >
                        Back
                      </button>
                    </div>
                  </form>
                </>
              )}
            </>
          )}

          {error ? <div className="auth-error">{error}</div> : null}

          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <footer>
          <small>Security monitoring active • Device fingerprint bound per session.</small>
        </footer>

        {/* Quick Login Buttons for Testing */}
        <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(234,179,8,0.1)', borderRadius: '0.5rem', border: '1px dashed rgba(234,179,8,0.3)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
            🧪 Testing Quick Login
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@example.com', 'Admin!234', false)}
              disabled={isSubmitting}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.85rem',
                background: 'var(--accent-strong)',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1
              }}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('drhouse@example.com', 'Doctor!234', false)}
              disabled={isSubmitting}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.85rem',
                background: 'var(--accent-strong)',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1
              }}
            >
              Doctor
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('frontdesk@example.com', 'Reception!234', false)}
              disabled={isSubmitting}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.85rem',
                background: 'var(--accent-strong)',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1
              }}
            >
              Receptionist
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('patient@example.com', 'Patient!234', true)}
              disabled={isSubmitting}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.85rem',
                background: 'var(--accent-strong)',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1
              }}
            >
              Patient
            </button>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>
            Remove before production
          </div>
        </div>
      </div>
    </div>
  );
};
