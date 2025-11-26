import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { FileUploadSchema } from '../schemas/file.schema';
import { ProblemDetails } from '../utils/problem';
import { authorizationService } from '../services/authorization.service';
import { fileService } from '../services/file.service';
import { auditService } from '../services/audit.service';
import { serializeFile } from '../serializers/file.serializer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.FILE_MAX_BYTES }
});

const router = Router();

const assertFileReadAccess = async (req: Request, fileRecord: any) => {
  const role = req.user?.role;
  if (!role) {
    throw new ProblemDetails({ status: 401, title: 'Not authenticated' });
  }

  if (role === 'ADMIN') {
    return;
  }

  if (role === 'DOCTOR') {
    const doctor = await authorizationService.requireDoctorProfile(req.user!.id);
    if (fileRecord.case.assignedDoctorId !== doctor.id) {
      throw new ProblemDetails({ status: 403, title: 'Doctor cannot access this file' });
    }
    return;
  }

  if (role === 'RECEPTIONIST') {
    return;
  }

  if (role === 'PATIENT') {
    const patient = await authorizationService.requirePatientProfile(req.user!.id);
    if (fileRecord.case.patientId !== patient.id) {
      throw new ProblemDetails({ status: 403, title: 'Patient cannot access this file' });
    }
    return;
  }

  throw new ProblemDetails({ status: 403, title: 'Forbidden' });
};

router.post(
  '/files',
  authenticate,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { file: uploadedFile } = req as Request & { file?: Express.Multer.File };
      if (!uploadedFile) {
        throw new ProblemDetails({ status: 400, title: 'File is required' });
      }

      const body = {
        case_id: req.body.case_id,
        visit_id: req.body.visit_id || undefined,
        category: req.body.category || undefined
      };

      const parsed = FileUploadSchema.safeParse(body);
      if (!parsed.success) {
        throw new ProblemDetails({ status: 400, title: 'Invalid upload payload', detail: parsed.error.message });
      }

      const payload = parsed.data;

      const caseRecord = await prisma.case.findUnique({
        where: { id: payload.case_id },
        include: {
          patient: true,
          assignedDoctor: true
        }
      });

      if (!caseRecord) {
        throw new ProblemDetails({ status: 404, title: 'Case not found' });
      }

      if (payload.visit_id) {
        const visit = await prisma.visit.findUnique({ where: { id: payload.visit_id } });
        if (!visit || visit.caseId !== caseRecord.id) {
          throw new ProblemDetails({ status: 400, title: 'Visit does not belong to case' });
        }
      }

      const role = req.user?.role;
      if (!role) {
        throw new ProblemDetails({ status: 401, title: 'Not authenticated' });
      }

      if (role === 'DOCTOR') {
        const doctor = await authorizationService.requireDoctorProfile(req.user!.id);
        if (caseRecord.assignedDoctorId !== doctor.id) {
          throw new ProblemDetails({ status: 403, title: 'Doctor cannot upload to this case' });
        }
      } else if (role === 'ADMIN') {
        // allowed
      } else if (role === 'RECEPTIONIST') {
        if (payload.visit_id) {
          throw new ProblemDetails({ status: 403, title: 'Receptionists cannot upload visit files' });
        }
        if (payload.category !== 'intake') {
          throw new ProblemDetails({ status: 400, title: 'Receptionist uploads must specify intake category' });
        }
      } else {
        throw new ProblemDetails({ status: 403, title: 'Forbidden' });
      }

      const stored = await fileService.store({
        buffer: uploadedFile.buffer,
        originalName: uploadedFile.originalname,
        caseId: caseRecord.id
      });

      const saved = await prisma.file.create({
        data: {
          caseId: caseRecord.id,
          visitId: payload.visit_id ?? null,
          uploader_user_id: req.user!.id,
          filename: stored.filename,
          mimetype: stored.mimetype,
          size_bytes: stored.size,
          storage_key: stored.storageKey,
          checksum_sha256: stored.checksum
        }
      });

      await auditService.record({
        actorUserId: req.user!.id,
        action: 'FILE_UPLOAD',
        resourceType: 'File',
        resourceId: saved.id,
        after: saved,
        ip: req.ipAddress,
        userAgent: req.headers['user-agent'] as string,
        requestId: req.requestId
      });

      res.status(201).json({ file: serializeFile(saved) });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/files/:id/meta', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fileRecord = await prisma.file.findUnique({
      where: { id: req.params.id },
      include: {
        case: true
      }
    });

    if (!fileRecord) {
      throw new ProblemDetails({ status: 404, title: 'File not found' });
    }

    await assertFileReadAccess(req, fileRecord);

    res.json({ file: serializeFile(fileRecord) });
  } catch (err) {
    next(err);
  }
});

router.get('/files/:id/download', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fileRecord = await prisma.file.findUnique({
      where: { id: req.params.id },
      include: {
        case: true
      }
    });

    if (!fileRecord) {
      throw new ProblemDetails({ status: 404, title: 'File not found' });
    }

    await assertFileReadAccess(req, fileRecord);

    const signed = fileService.generateSignedUrl(fileRecord);

    await auditService.record({
      actorUserId: req.user!.id,
      action: 'FILE_SIGNED_URL',
      resourceType: 'File',
      resourceId: fileRecord.id,
      before: null,
      after: { expires_at: signed.expires_at },
      ip: req.ipAddress,
      userAgent: req.headers['user-agent'] as string,
      requestId: req.requestId
    });

    res.json(signed);
  } catch (err) {
    next(err);
  }
});

router.get('/files/:id/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { expires, signature } = req.query;
    if (!expires || !signature) {
      throw new ProblemDetails({ status: 400, title: 'Missing signature parameters' });
    }

    const expiresMs = Number(expires);
    if (Number.isNaN(expiresMs)) {
      throw new ProblemDetails({ status: 400, title: 'Invalid expires parameter' });
    }

    if (expiresMs < Date.now()) {
      throw new ProblemDetails({ status: 410, title: 'Signed URL expired' });
    }

    const fileRecord = await prisma.file.findUnique({ where: { id: req.params.id } });
    if (!fileRecord) {
      throw new ProblemDetails({ status: 404, title: 'File not found' });
    }

    const valid = fileService.verifySignature(fileRecord, expiresMs, String(signature));
    if (!valid) {
      throw new ProblemDetails({ status: 403, title: 'Invalid signature' });
    }

    const absolutePath = fileService.resolveLocalPath(fileRecord.storage_key);
    if (!fs.existsSync(absolutePath)) {
      throw new ProblemDetails({ status: 404, title: 'File missing from storage' });
    }

    res.setHeader('Content-Type', fileRecord.mimetype);
    res.setHeader('Content-Length', fileRecord.size_bytes.toString());
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileRecord.filename)}"`);

    await auditService.record({
      actorUserId: undefined,
      action: 'FILE_DOWNLOAD',
      resourceType: 'File',
      resourceId: fileRecord.id,
      before: null,
      after: { via_signed_url: true },
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string,
      requestId: req.requestId
    });

    fs.createReadStream(absolutePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
