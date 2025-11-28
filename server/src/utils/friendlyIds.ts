import { Prisma, PrismaClient } from '@prisma/client';

const pad = (value: number, length = 5) => value.toString().padStart(length, '0');

const nextNumeric = (current: string | null | undefined, prefix: string) => {
  if (!current) {
    return 1;
  }
  const numericPortion = current.toUpperCase().startsWith(prefix)
    ? current.substring(prefix.length)
    : current;
  const parsed = parseInt(numericPortion, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return 1;
  }
  return parsed + 1;
};

type TxClient = PrismaClient | Prisma.TransactionClient;

export const allocatePatientCode = async (tx: TxClient) => {
  const latest = await tx.patientProfile.findFirst({
    select: { patient_code: true },
    orderBy: { patient_code: 'desc' }
  });

  const next = nextNumeric(latest?.patient_code ?? null, 'P');
  return `P${pad(next)}`;
};

export const allocateCaseCode = async (tx: TxClient) => {
  const latest = await tx.case.findFirst({
    select: { case_code: true },
    orderBy: { case_code: 'desc' }
  });

  const next = nextNumeric(latest?.case_code ?? null, 'C');
  return `C${pad(next)}`;
};
