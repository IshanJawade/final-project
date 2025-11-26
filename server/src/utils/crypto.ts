import crypto from 'crypto';

export const sha256 = (data: string | Buffer) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};
