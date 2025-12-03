import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_EXTENSION = '.log';

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
  const timestamp = new Date().toISOString();
  const dateKey = timestamp.slice(0, 10);
  const entry = {
    timestamp,
    ...event,
  };

  try {
    await ensureLogDir();
    await fs.promises.appendFile(getLogPathForDate(dateKey), `${JSON.stringify(entry)}\n`, 'utf8');
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
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === 'object') {
          return { ...parsed, raw: line };
        }
      } catch (err) {
        // fall through to raw return
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
