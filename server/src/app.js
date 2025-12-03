import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import userRoutes from './routes/user.js';
import medicalRoutes from './routes/medical.js';
import recordRoutes from './routes/records.js';
import { authenticateToken } from './middleware/auth.js';
import requestLogger from './middleware/requestLogger.js';
import { logEvent } from './utils/logger.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/records', authenticateToken, recordRoutes);
app.use('/api/user', authenticateToken, userRoutes);
app.use('/api/medical', authenticateToken, medicalRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);

app.use((err, req, res, next) => {
  if (err) {
    console.error('Unhandled error', err);
    logEvent({
      type: 'error',
      message: err.message,
      stack: err.stack,
      path: req.originalUrl || req.url,
      method: req.method,
      userId: req.auth?.id ?? null,
      role: req.auth?.role ?? null,
    });
    return res.status(500).json({ message: 'Internal server error' });
  }
  return next();
});

export default app;
