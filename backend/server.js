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
const { pricesRouter, portfolioRouter } = require('./src/routes/pricesRoutes');
const lookupRoutes         = require('./src/routes/lookupRoutes');
const exchangeRateRoutes   = require('./src/routes/exchangeRateRoutes');
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
app.use('/api/lookup',          authMiddleware, lookupRoutes);
app.use('/api/exchange-rates',  authMiddleware, exchangeRateRoutes);
app.use('/api/accounts',   authMiddleware, accountsRoutes);
app.use('/api/history',    authMiddleware, historyRoutes);
app.use('/api/assets',     authMiddleware, assetsRoutes);
app.use('/api/snapshots',  authMiddleware, snapshotsRoutes);
app.use('/api/portfolios', authMiddleware, portfoliosRoutes);
app.use('/api/prices',     authMiddleware, pricesRouter);
app.use('/api/portfolio',  authMiddleware, portfolioRouter);
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

// ─── Daily exchange-rate cron job ────────────────────────────────────────────
// Runs at 22:00 UTC Mon–Fri — 1 hour before the snapshot cron.
// Fetches USD/MXN from Twelve Data once and caches it in `exchange_rates`.
// All user requests that day read from the DB; zero extra API calls.
if (config.nodeEnv !== 'test') {
  const { runExchangeRateUpdate } = require('./src/services/exchangeRateService');

  cron.schedule('0 22 * * 1-5', async () => {
    console.log('[cron] Fetching daily USD/MXN exchange rate...');
    try {
      const { date, rate } = await runExchangeRateUpdate();
      console.log(`[cron] USD/MXN rate cached for ${date}: ${rate}`);
    } catch (err) {
      console.error('[cron] Exchange rate update failed:', err.message);
    }
  }, { timezone: 'UTC' });

  console.log('[WealthOS API] Daily exchange-rate cron scheduled: 22:00 UTC Mon–Fri');
}

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

// ─── Daily account balance snapshot cron ─────────────────────────────────────
// Runs at midnight UTC every day (all days — account balances don't follow
// market hours). Captures every user's account balance for trend tracking.
if (config.nodeEnv !== 'test') {
  const { snapshotAllAccounts } = require('./src/services/accountSnapshotService');

  cron.schedule('0 0 * * *', async () => {
    console.log('[cron] Starting daily account balance snapshot...');
    try {
      const result = await snapshotAllAccounts();
      console.log(`[cron] Account snapshot complete — ${result.count} account(s) for ${result.date}`);
    } catch (err) {
      console.error('[cron] Account snapshot failed:', err.message);
    }
  }, { timezone: 'UTC' });

  console.log('[WealthOS API] Daily account balance snapshot cron scheduled: 00:00 UTC daily');
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`[WealthOS API] Running in ${config.nodeEnv} mode on port ${config.port}`);
});

module.exports = app; // export for testing
