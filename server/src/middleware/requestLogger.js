import { logEvent } from '../utils/logger.js';

function countFiles(props) {
  if (!props) {
    return 0;
  }
  if (Array.isArray(props)) {
    return props.length;
  }
  if (typeof props === 'object') {
    return Object.values(props).reduce((total, value) => {
      if (Array.isArray(value)) {
        return total + value.length;
      }
      if (value) {
        return total + 1;
      }
      return total;
    }, 0);
  }
  return 0;
}

export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const entry = {
      type: 'request',
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs,
      ip: req.ip,
      userId: req.auth?.id ?? null,
      role: req.auth?.role ?? null,
    };

    const ua = req.get('user-agent');
    if (ua) {
      entry.userAgent = ua;
    }

    const queryKeys = req.query && typeof req.query === 'object' ? Object.keys(req.query) : [];
    if (queryKeys.length > 0) {
      entry.queryKeys = queryKeys;
    }

    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      const bodyKeys = Object.keys(req.body);
      if (bodyKeys.length > 0) {
        entry.bodyKeys = bodyKeys;
      }
    }

    const fileCount = countFiles(req.files || (req.file ? [req.file] : null));
    if (fileCount > 0) {
      entry.fileCount = fileCount;
    }

    const ref = req.get('referer') || req.get('referrer');
    if (ref) {
      entry.referrer = ref;
    }

    logEvent(entry);
  });

  next();
}

export default requestLogger;
