import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest, resolveApiUrl } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const display = size < 10 && unitIndex > 0 ? size.toFixed(1) : Math.round(size);
  return `${display} ${units[unitIndex]}`;
}

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

function formatTimestamp(value) {
  if (!value) {
    return 'Unknown time';
  }
  try {
    return timestampFormatter.format(new Date(value));
  } catch (_err) {
    return value;
  }
}

export default function AdminLogsPage() {
  const { token } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [rawLines, setRawLines] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [viewerError, setViewerError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const filteredLines = useMemo(() => {
    if (!activeSearch) {
      return rawLines;
    }
    const needle = activeSearch.toLowerCase();
    return rawLines.filter((line) => line.toLowerCase().includes(needle));
  }, [rawLines, activeSearch]);

  useEffect(() => {
    if (!token) {
      setLogs([]);
      setSelectedDate(null);
      return;
    }

    let cancelled = false;
    async function loadLogs() {
      setLoadingList(true);
      setListError('');
      try {
        const payload = await apiRequest('/api/admin/logs', { token });
        if (cancelled) {
          return;
        }
        const received = Array.isArray(payload?.logs) ? payload.logs : [];
        setLogs(received);
        setSelectedDate((current) => {
          if (!current) {
            return current;
          }
          return received.some((log) => log.date === current) ? current : null;
        });
      } catch (err) {
        if (!cancelled) {
          setLogs([]);
          setSelectedDate(null);
          setListError(err?.message || 'Failed to load logs');
        }
      } finally {
        if (!cancelled) {
          setLoadingList(false);
        }
      }
    }

    loadLogs();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !selectedDate) {
      setRawLines([]);
      setViewerError('');
      setLoadingEntries(false);
      setSearchInput('');
      setActiveSearch('');
      return;
    }

    let cancelled = false;
    setLoadingEntries(true);
    setViewerError('');
    setRawLines([]);
    setSearchInput('');
    setActiveSearch('');

    async function loadEntries() {
      try {
        const payload = await apiRequest(`/api/admin/logs/${selectedDate}?limit=500`, { token });
        if (cancelled) {
          return;
        }
        const received = Array.isArray(payload?.entries) ? payload.entries : [];
        const lines = received.map((entry) => {
          if (entry && typeof entry.raw === 'string') {
            return entry.raw;
          }
          try {
            return JSON.stringify(entry);
          } catch (_err) {
            return String(entry);
          }
        });
        setRawLines(lines);
      } catch (err) {
        if (!cancelled) {
          setRawLines([]);
          setViewerError(err?.message || 'Failed to load log entries');
        }
      } finally {
        if (!cancelled) {
          setLoadingEntries(false);
        }
      }
    }

    loadEntries();
    return () => {
      cancelled = true;
    };
  }, [token, selectedDate]);

  async function handleRefresh() {
    if (!token) {
      return;
    }
    setLoadingList(true);
    setListError('');
    try {
      const payload = await apiRequest('/api/admin/logs', { token });
      const received = Array.isArray(payload?.logs) ? payload.logs : [];
      setLogs(received);
      setSelectedDate((current) => {
        if (!current) {
          return current;
        }
        return received.some((log) => log.date === current) ? current : null;
      });
    } catch (err) {
      setListError(err?.message || 'Failed to load logs');
    } finally {
      setLoadingList(false);
    }
  }

  async function handleDownload(date) {
    if (!token || !date) {
      return;
    }
    try {
      const response = await fetch(resolveApiUrl(`/api/admin/logs/${date}/download`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const contentType = response.headers.get('Content-Type') || '';
        let message = 'Failed to download log';
        if (contentType.includes('application/json')) {
          try {
            const payload = await response.json();
            if (payload?.message) {
              message = payload.message;
            }
          } catch (_err) {
            // ignore parse failure
          }
        } else {
          const text = await response.text();
          if (text) {
            message = text;
          }
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${date}.log`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err?.message || 'Download failed';
      if (selectedDate === date) {
        setViewerError(message);
      } else {
        setListError(message);
      }
    }
  }

  function handleToggleDetails(logDate) {
    if (selectedDate === logDate) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate(logDate);
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    setActiveSearch(searchInput.trim());
  }

  function handleClearSearch() {
    setSearchInput('');
    setActiveSearch('');
  }

  const displayText = useMemo(() => filteredLines.join('\n'), [filteredLines]);
  const noMatches = Boolean(selectedDate && !loadingEntries && filteredLines.length === 0);

  return (
    <div className="panel">
      <header className="panel-header">
        <div>
          <h2>System Logs</h2>
          <p className="muted">Review backend activity. Select a log to open the viewer.</p>
        </div>
        <div className="log-actions">
          <button type="button" onClick={handleRefresh} disabled={loadingList}>
            {loadingList ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>
      {listError && <div className="alert alert-error">{listError}</div>}
      <div className="log-layout">
        <div className="log-list" aria-label="Available log files">
          {logs.length === 0 && !loadingList ? (
            <div className="empty-state">No log files yet</div>
          ) : (
            <ul className="log-list-items">
              {logs.map((log) => {
                const isActive = selectedDate === log.date;
                return (
                  <li key={log.filename}>
                    <div className={`log-list-card ${isActive ? 'active' : ''}`}>
                      <div className="log-card-header">
                        <div className="log-card-info">
                          <h3>{log.filename}</h3>
                          <div className="log-card-meta">
                            <span>{formatBytes(log.sizeBytes)}</span>
                            <span>{formatTimestamp(log.modifiedAt)}</span>
                          </div>
                        </div>
                        <div className="log-card-actions">
                          <span className="log-card-date">{log.date}</span>
                          <div className="log-card-buttons">
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => handleToggleDetails(log.date)}
                              disabled={loadingEntries && !isActive && Boolean(selectedDate)}
                            >
                              {isActive ? 'Close' : 'Details'}
                            </button>
                            <button type="button" onClick={() => handleDownload(log.date)}>
                              Download
                            </button>
                          </div>
                        </div>
                      </div>
                      {isActive && (
                        <div className="log-detail-body" aria-live="polite">
                          {viewerError && <div className="alert alert-error">{viewerError}</div>}
                          {loadingEntries ? (
                            <div className="empty-state">Loading entries...</div>
                          ) : (
                            <>
                              <form className="log-search" onSubmit={handleSearchSubmit}>
                                <label htmlFor="log-search-input">
                                  Search pattern
                                  <input
                                    id="log-search-input"
                                    type="text"
                                    value={searchInput}
                                    onChange={(event) => setSearchInput(event.target.value)}
                                    placeholder="Enter text, then search"
                                    autoComplete="off"
                                  />
                                </label>
                                <button type="submit" disabled={rawLines.length === 0}>
                                  Search
                                </button>
                                <button type="button" onClick={handleClearSearch} disabled={!activeSearch && !searchInput}>
                                  Clear
                                </button>
                              </form>
                              {noMatches ? (
                                <div className="empty-state">
                                  {activeSearch ? 'No lines matched that pattern' : 'No entries to display'}
                                </div>
                              ) : (
                                <textarea
                                  className="log-text-viewer"
                                  value={displayText}
                                  readOnly
                                  spellCheck={false}
                                  aria-label="Log file contents"
                                />
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
