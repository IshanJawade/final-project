import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_EXTENSION = '.log';

function normalizeValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  const stringValue = String(value).trim();
  if (stringValue.length === 0) {
    return '';
  }
  return stringValue.replace(/\s+/g, '_');
}

function formatActor(event = {}) {
  const actorSource = (event && typeof event.actor === 'object' && event.actor) || {};
  const roleToken = normalizeValue(actorSource.role ?? event.role ?? event.userRole);
  const idToken = normalizeValue(
    actorSource.id ?? actorSource.userId ?? event.userId ?? event.userID ?? event.id
  );
  const usernameToken = normalizeValue(
    actorSource.username ??
      actorSource.name ??
      actorSource.label ??
      event.username ??
      event.userName ??
      event.actorName ??
      event.label
  );

  let result = '';
  if (roleToken) {
    result = roleToken;
  }
  if (idToken) {
    result = result ? `${result}#${idToken}` : `user#${idToken}`;
  }
  if (usernameToken) {
    result = result ? `${result}@${usernameToken}` : `user@${usernameToken}`;
  }

  return result || 'system';
}

function formatAction(event = {}) {
  const actionToken = normalizeValue(event.action);
  if (actionToken) {
    return actionToken.toUpperCase();
  }

  const methodToken = normalizeValue(event.method);
  if (methodToken) {
    return `HTTP_${methodToken.toUpperCase()}`;
  }

  const typeToken = normalizeValue(event.type);
  if (typeToken) {
    return typeToken.replace(/[^0-9A-Z._-]+/gi, '_').toUpperCase();
  }

  return 'EVENT';
}

function formatTarget(event = {}) {
  const explicit = normalizeValue(event.performedOn);
  if (explicit) {
    return explicit;
  }

  const { target } = event;
  if (typeof target === 'string') {
    const token = normalizeValue(target);
    if (token) {
      return token;
    }
  } else if (target && typeof target === 'object') {
    const parts = Object.entries(target).reduce((acc, [key, value]) => {
      const normalizedKey = normalizeValue(key.replace(/Id$/i, ''));
      const normalizedValue = normalizeValue(value);
      if (!normalizedKey || !normalizedValue) {
        return acc;
      }
      acc.push(`${normalizedKey}/${normalizedValue}`);
      return acc;
    }, []);
    if (parts.length > 0) {
      return parts.join(',');
    }
  }

  const pathToken = normalizeValue(event.path ?? event.endpoint ?? event.resource);
  if (pathToken) {
    const statusToken = normalizeValue(event.status);
    return statusToken ? `${pathToken}#${statusToken}` : pathToken;
  }

  const messageToken = normalizeValue(event.message ?? event.detail);
  if (messageToken) {
    return messageToken;
  }

  return '-';
}

function serializeLogLine(event = {}) {
  let timestampValue = event.timestamp ? new Date(event.timestamp) : new Date();
  if (!(timestampValue instanceof Date) || Number.isNaN(timestampValue.getTime())) {
    timestampValue = new Date();
  }
  const timestamp = timestampValue.toISOString();
  const actorToken = formatActor(event);
  const actionToken = formatAction(event);
  const targetToken = formatTarget(event);
  return `${timestamp} ${actorToken} ${actionToken} ${targetToken}`;
}

function parseStructuredLog(line) {
  if (typeof line !== 'string' || line.trim() === '') {
    return null;
  }
  const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
  if (!match) {
    return null;
  }
  const [, timestamp, actor, action, target] = match;
  return {
    timestamp,
    actor,
    action,
    target,
    raw: line,
  };
}

function sanitizeLogDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid log date format');
  }
  return date;
}

async function ensureLogDir() {
  await fs.promises.mkdir(LOG_DIR, { recursive: true });
}

function getLogPathForDate(dateString) {
  return path.join(LOG_DIR, `${dateString}${LOG_EXTENSION}`);
}

export async function logEvent(event = {}) {
  const line = serializeLogLine(event);
  const dateKey = line.slice(0, 10);

  try {
    await ensureLogDir();
    await fs.promises.appendFile(getLogPathForDate(dateKey), `${line}\n`, 'utf8');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log entry', err);
  }
}

export async function listLogFiles() {
  await ensureLogDir();
  const files = await fs.promises.readdir(LOG_DIR);
  const logFiles = files.filter((file) => file.endsWith(LOG_EXTENSION));
  const detailed = await Promise.all(
    logFiles.map(async (file) => {
      const stats = await fs.promises.stat(path.join(LOG_DIR, file));
      return {
        date: file.replace(LOG_EXTENSION, ''),
        filename: file,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    })
  );

  return detailed.sort((a, b) => b.date.localeCompare(a.date));
}

export async function readLogEntries(date, { limit = 200 } = {}) {
  const dateKey = sanitizeLogDate(date);
  const filePath = getLogPathForDate(dateKey);
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    if (!raw) {
      return [];
    }
    const lines = raw.split('\n').filter(Boolean);
    const sliceStart = limit ? Math.max(0, lines.length - limit) : 0;
    return lines.slice(sliceStart).map((line) => {
      const structured = parseStructuredLog(line);
      if (structured) {
        return structured;
      }
      if (line.startsWith('{')) {
        try {
          const parsedLegacy = JSON.parse(line);
          if (parsedLegacy && typeof parsedLegacy === 'object') {
            return { ...parsedLegacy, raw: line };
          }
        } catch (err) {
          // fall through
        }
      }
      return { timestamp: null, raw: line };
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export function createLogStream(date) {
  try {
    const dateKey = sanitizeLogDate(date);
    const filePath = getLogPathForDate(dateKey);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.createReadStream(filePath);
  } catch (err) {
    return null;
  }
}

export function getLogDirPath() {
  return LOG_DIR;
}
