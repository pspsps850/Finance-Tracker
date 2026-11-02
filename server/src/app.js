import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import { errorHandler, notFound } from './middleware/error.js';

import accountsRoutes from './routes/accounts.js';
import budgetRoutes from './routes/budgets.js';
import categoryRoutes from './routes/categories.js';
import debtRoutes from './routes/debts.js';
import goalRoutes from './routes/goals.js';
import reportRoutes from './routes/reports.js';
import subscriptionRoutes from './routes/subscriptions.js';
import transactionRoutes, { transfersRouter } from './routes/transactions.js';

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

app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, authRoutes);

app.use('/api/accounts', accountsRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/transfers', transfersRouter);
app.use('/api/categories', categoryRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/reports', reportRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
