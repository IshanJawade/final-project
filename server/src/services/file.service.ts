import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
import { sha256 } from '../utils/crypto';
import { ProblemDetails } from '../utils/problem';

const ALLOWED_EXTENSIONS = new Set(['pdf', 'txt', 'png', 'jpg', 'jpeg']);
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'text/plain', 'image/png', 'image/jpeg']);
const FALLBACK_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg'
};

const sanitizeFileName = (name: string) => {
  const base = path.parse(name).base;
  return base.replace(/[^a-zA-Z0-9_.-]/g, '_');
};

const ensureStorageRoot = async () => {
  await fs.mkdir(env.FILE_STORAGE_DIR, { recursive: true });
};

const antivirusScanStub = async (_buffer: Buffer, _filename: string) => {
  return true;
};

const buildSignature = (payload: string) => {
  return crypto.createHmac('sha256', env.FILE_SIGNING_SECRET).update(payload).digest('hex');
};

const dynamicImport = new Function('specifier', 'return import(specifier);') as <T>(specifier: string) => Promise<T>;

let fileTypeFromBufferRef: typeof import('file-type').fileTypeFromBuffer | null = null;

const detectFileType = async (buffer: Buffer) => {
  if (!fileTypeFromBufferRef) {
    const mod = await dynamicImport<typeof import('file-type')>('file-type');
    fileTypeFromBufferRef = mod.fileTypeFromBuffer ?? null;
  }
  if (!fileTypeFromBufferRef) {
    throw new ProblemDetails({ status: 500, title: 'File type detector unavailable' });
  }
  return fileTypeFromBufferRef(buffer);
};

export const fileService = {
  async validateBuffer(buffer: Buffer, originalName: string) {
    if (!buffer || buffer.length === 0) {
      throw new ProblemDetails({ status: 400, title: 'Empty file upload' });
    }

    if (buffer.length > env.FILE_MAX_BYTES) {
      throw new ProblemDetails({ status: 413, title: 'File exceeds maximum size limit' });
    }

    const cleanedName = sanitizeFileName(originalName);
    const ext = path.extname(cleanedName).replace('.', '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new ProblemDetails({ status: 400, title: 'File extension not allowed' });
    }

    const detected = await detectFileType(buffer);
    if (detected) {
      if (!ALLOWED_EXTENSIONS.has(detected.ext) || !ALLOWED_MIME_TYPES.has(detected.mime)) {
        throw new ProblemDetails({ status: 400, title: 'File content type not allowed' });
      }
      if (detected.ext !== ext) {
        throw new ProblemDetails({ status: 400, title: 'File extension does not match content' });
      }
    }

    const mime = detected?.mime ?? FALLBACK_MIME_BY_EXTENSION[ext];

    if (!mime || !ALLOWED_MIME_TYPES.has(mime)) {
      throw new ProblemDetails({ status: 400, title: 'Unsupported MIME type' });
    }

    const scanPassed = await antivirusScanStub(buffer, cleanedName);
    if (!scanPassed) {
      throw new ProblemDetails({ status: 400, title: 'File failed antivirus scan' });
    }

    return {
      cleanedName,
      extension: ext,
      mime
    };
  },

  async storeLocal(params: { storageKey: string; buffer: Buffer }) {
    await ensureStorageRoot();
    const absolutePath = path.join(env.FILE_STORAGE_DIR, params.storageKey);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, params.buffer);
  },

  async store(params: { buffer: Buffer; originalName: string; caseId: string }) {
    const { cleanedName, mime } = await this.validateBuffer(params.buffer, params.originalName);
    const checksum = sha256(params.buffer);
    const storageKey = path.posix.join(params.caseId, `${crypto.randomUUID()}-${cleanedName}`);

    if (env.FILE_STORAGE_DRIVER !== 'local') {
      throw new ProblemDetails({ status: 500, title: 'S3 storage driver not yet configured' });
    }

    await this.storeLocal({ storageKey, buffer: params.buffer });

    return {
      storageKey,
      checksum,
      filename: cleanedName,
      mimetype: mime,
      size: params.buffer.length
    };
  },

  generateSignedUrl(file: { id: string; storage_key: string }) {
    const expiresAt = Date.now() + env.FILE_DOWNLOAD_TTL_MS;
    const payload = `${file.id}:${file.storage_key}:${expiresAt}`;
    const signature = buildSignature(payload);
    const relativeUrl = `/files/${file.id}/stream?expires=${expiresAt}&signature=${signature}`;
    return {
      url: relativeUrl,
      expires_at: new Date(expiresAt).toISOString()
    };
  },

  verifySignature(file: { id: string; storage_key: string }, expires: number, signature: string) {
    const payload = `${file.id}:${file.storage_key}:${expires}`;
    const expected = buildSignature(payload);
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  },

  resolveLocalPath(storageKey: string) {
    return path.join(env.FILE_STORAGE_DIR, storageKey);
  }
};
