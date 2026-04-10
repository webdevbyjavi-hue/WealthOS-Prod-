'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const cron    = require('node-cron');

const config = require('./src/config');
const authMiddleware = require('./src/middlewares/authMiddleware');
const { errorMiddleware, notFoundMiddleware } = require('./src/middlewares/errorMiddleware');

// ─── Route imports ────────────────────────────────────────────────────────────
const authRoutes       = require('./src/routes/authRoutes');
const accountsRoutes   = require('./src/routes/accountsRoutes');
const historyRoutes    = require('./src/routes/historyRoutes');
const assetsRoutes     = require('./src/routes/assetsRoutes');
const snapshotsRoutes  = require('./src/routes/snapshotsRoutes');
const portfoliosRoutes = require('./src/routes/portfoliosRoutes');
const lookupRoutes     = require('./src/routes/lookupRoutes');
const {
  stocksRouter,
  bonosRouter,
  fondosRouter,
  fibrasRouter,
  retiroRouter,
  bienesRouter,
  cryptoRouter,
} = require('./src/routes/holdingsRoutes');

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();

// ─── Security & logging ───────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (e.g. curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (config.cors.origins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed.`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ─── Health check (no auth) ───────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', env: config.nodeEnv } });
});

// ─── Public routes ────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ─── Protected routes (require valid Supabase JWT) ────────────────────────────
app.use('/api/lookup',     authMiddleware, lookupRoutes);
app.use('/api/accounts',   authMiddleware, accountsRoutes);
app.use('/api/history',    authMiddleware, historyRoutes);
app.use('/api/assets',     authMiddleware, assetsRoutes);
app.use('/api/snapshots',  authMiddleware, snapshotsRoutes);
app.use('/api/portfolios', authMiddleware, portfoliosRoutes);
app.use('/api/stocks',     authMiddleware, stocksRouter);
app.use('/api/bonos',      authMiddleware, bonosRouter);
app.use('/api/fondos',     authMiddleware, fondosRouter);
app.use('/api/fibras',     authMiddleware, fibrasRouter);
app.use('/api/retiro',     authMiddleware, retiroRouter);
app.use('/api/bienes',     authMiddleware, bienesRouter);
app.use('/api/crypto',     authMiddleware, cryptoRouter);

// ─── 404 & global error handler ───────────────────────────────────────────────
app.use(notFoundMiddleware);
app.use(errorMiddleware);

// ─── Daily snapshot cron job ──────────────────────────────────────────────────
// Runs at 23:00 UTC (6:00 PM EST / 7:00 PM EDT) Monday–Friday.
// This gives ~2 hours after US market close (4 PM EST) for post-close data
// to be published by the price API before we snapshot.
//
// Cron format: minute hour dom month dow
//   "0 23 * * 1-5" = top of 11 PM UTC, Mon–Fri
if (config.nodeEnv !== 'test') {
  const { runSnapshots } = require('./src/services/snapshotService');

  cron.schedule('0 23 * * 1-5', async () => {
    console.log('[cron] Starting scheduled daily snapshot run...');
    try {
      const result = await runSnapshots();
      console.log(
        `[cron] Snapshot run complete — ${result.succeeded}/${result.total} succeeded.`
      );
    } catch (err) {
      console.error('[cron] Snapshot run failed:', err.message);
    }
  }, { timezone: 'UTC' });

  console.log('[WealthOS API] Daily snapshot cron scheduled: 23:00 UTC Mon–Fri');
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`[WealthOS API] Running in ${config.nodeEnv} mode on port ${config.port}`);
});

module.exports = app; // export for testing
