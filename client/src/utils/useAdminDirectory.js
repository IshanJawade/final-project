import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

function shouldLoad(option) {
  return option === true || option === undefined;
}

export function useAdminDirectory({ includeStats = true, includeLists = true } = {}) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [professionals, setProfessionals] = useState([]);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const promises = [];

      if (shouldLoad(includeStats)) {
        promises.push(
          apiRequest('/api/admin/stats', { token }).then((payload) => {
            setStats(payload?.stats || null);
          })
        );
      }

      if (shouldLoad(includeLists)) {
        promises.push(
          apiRequest('/api/admin/users', { token }).then((payload) => {
            setUsers(payload?.users || []);
          })
        );
        promises.push(
          apiRequest('/api/admin/professionals', { token }).then((payload) => {
            setProfessionals(payload?.medicalProfessionals || []);
          })
        );
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }
    } catch (err) {
      setError(err.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, [includeLists, includeStats, token]);

  useEffect(() => {
    if (token) {
      load();
    }
  }, [load, token]);

  return {
    stats,
    users,
    professionals,
    loading,
    error,
    refresh: load,
  };
}
