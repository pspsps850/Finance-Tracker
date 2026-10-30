import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import { errorHandler, notFound } from './middleware/error.js';

const app = express();

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, authRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
