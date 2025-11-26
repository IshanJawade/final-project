import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { requestContext } from './middleware/requestContext';
import { requestLogger } from './middleware/logger';
import { fingerprint } from './middleware/fingerprint';
import { enforceHttps } from './middleware/httpsOnly';
import authRoutes from './routes/auth.routes';
import patientRoutes from './routes/patient.routes';
import caseRoutes from './routes/case.routes';
import visitRoutes from './routes/visit.routes';
import appointmentRoutes from './routes/appointment.routes';
import doctorRoutes from './routes/doctor.routes';
import specializationRoutes from './routes/specialization.routes';
import fileRoutes from './routes/file.routes';
import { problemResponder } from './utils/problem';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    hsts: env.NODE_ENV === 'production' ? undefined : false,
    crossOriginResourcePolicy: { policy: 'same-site' }
  })
);
app.use(cors({ origin: true, credentials: true }));

if (env.HTTPS_ONLY) {
  app.use(enforceHttps);
}

app.use(requestContext);
app.use(requestLogger);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(fingerprint);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/patients', patientRoutes);
app.use('/cases', caseRoutes);
app.use('/', visitRoutes);
app.use('/', appointmentRoutes);
app.use('/doctors', doctorRoutes);
app.use('/specializations', specializationRoutes);
app.use('/', fileRoutes);

app.use((_req, res) => {
  res.status(404).json({
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: 'Route not found'
  });
});

app.use(problemResponder);

export default app;
