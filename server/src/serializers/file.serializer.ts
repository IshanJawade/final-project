export type FileRecord = {
  id: string;
  caseId: string;
  visitId: string | null;
  filename: string;
  mimetype: string;
  size_bytes: number;
  checksum_sha256: string;
  created_at: Date;
};

export const serializeFile = (record: FileRecord) => ({
  id: record.id,
  case_id: record.caseId,
  visit_id: record.visitId,
  filename: record.filename,
  mimetype: record.mimetype,
  size_bytes: record.size_bytes,
  checksum_sha256: record.checksum_sha256,
  created_at: record.created_at
});
