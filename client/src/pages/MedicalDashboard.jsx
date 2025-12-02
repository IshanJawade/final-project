import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

const CARD_CONFIG = [
  {
    key: 'activeAccess',
    label: 'Active Patient Access',
    subtext: 'Patients with current permissions',
  },
  {
    key: 'pendingRequests',
    label: 'Pending Access Requests',
    subtext: 'Awaiting patient approval',
  },
  {
    key: 'recordsAuthored',
    label: 'Records Authored',
    subtext: 'Encrypted notes you created',
  },
];

export default function MedicalDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const payload = await apiRequest('/api/medical/dashboard', { token });
        if (!cancelled) {
          setStats(payload?.stats || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load dashboard');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const formatter = useMemo(() => new Intl.NumberFormat(), []);
  const cards = useMemo(() => {
    if (!stats) {
      return [];
    }
    return CARD_CONFIG.map(({ key, label, subtext }) => ({
      label,
      subtext,
      value: formatter.format(stats[key] || 0),
    }));
  }, [formatter, stats]);

  return (
    <div className="panel">
      <h2>Practice Overview</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="muted">Loading professional dashboard…</p>}
      {!loading && cards.length === 0 && <p className="muted">No activity yet. Request access to begin.</p>}
      {cards.length > 0 && (
        <div className="stat-grid">
          {cards.map((card) => (
            <div key={card.label} className="stat-card">
              <span className="stat-card-title">{card.label}</span>
              <span className="stat-card-value">{card.value}</span>
              <span className="stat-card-subtext">{card.subtext}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
