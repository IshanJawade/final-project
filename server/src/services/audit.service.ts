import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';

type AuditOutcome = 'SUCCESS' | 'DENY' | 'ERROR';

export interface AuditRecordInput {
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  outcome?: AuditOutcome;
}

const ensureLogDir = async () => {
  await fs.mkdir(env.LOG_DIR, { recursive: true });
};

const DEFAULT_OUTCOME: AuditOutcome = 'SUCCESS';

const auditFilePathForDate = (date: Date) => {
  const day = date.toISOString().split('T')[0];
  return path.join(env.LOG_DIR, `${day}.audit.log`);
};

export const auditService = {
  async record(entry: AuditRecordInput) {
    const timestamp = new Date();
    const logPayload = {
      timestamp: timestamp.toISOString(),
      actor_user_id: entry.actorUserId ?? null,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
      request_id: entry.requestId ?? null,
      outcome: entry.outcome ?? DEFAULT_OUTCOME
    };

    await prisma.auditLog.create({
      data: {
        actor_user_id: entry.actorUserId,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId,
        before_json: (entry.before as any) ?? undefined,
        after_json: (entry.after as any) ?? undefined,
        ip: entry.ip,
        user_agent: entry.userAgent,
        request_id: entry.requestId,
        outcome: entry.outcome ?? DEFAULT_OUTCOME
      }
    });

    try {
      await ensureLogDir();
      const filePath = auditFilePathForDate(timestamp);
      await fs.appendFile(filePath, `${JSON.stringify(logPayload)}\n`, { encoding: 'utf8' });
    } catch (err) {
      console.error('Failed to append audit log file', err);
    }
  }
};
