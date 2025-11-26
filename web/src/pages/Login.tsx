import { FormEvent, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';

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
              <label>
                <span>MRN or Email</span>
                <input type="text" value={patientIdentifier} onChange={(event) => setPatientIdentifier(event.target.value)} placeholder="MRN-XXXX or email" required disabled={isSubmitting} />
              </label>
              <label>
                <span>Password</span>
                <input type="password" value={patientPassword} onChange={(event) => setPatientPassword(event.target.value)} placeholder="Enter password" required disabled={isSubmitting} />
              </label>
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
      </div>
    </div>
  );
};
