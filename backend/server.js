'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');

const config = require('./src/config');
const authMiddleware = require('./src/middlewares/authMiddleware');
const { errorMiddleware, notFoundMiddleware } = require('./src/middlewares/errorMiddleware');

// ─── Route imports ────────────────────────────────────────────────────────────
const authRoutes    = require('./src/routes/authRoutes');
const accountsRoutes = require('./src/routes/accountsRoutes');
const historyRoutes  = require('./src/routes/historyRoutes');
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
app.use('/api/accounts',  authMiddleware, accountsRoutes);
app.use('/api/history',   authMiddleware, historyRoutes);
app.use('/api/stocks',    authMiddleware, stocksRouter);
app.use('/api/bonos',     authMiddleware, bonosRouter);
app.use('/api/fondos',    authMiddleware, fondosRouter);
app.use('/api/fibras',    authMiddleware, fibrasRouter);
app.use('/api/retiro',    authMiddleware, retiroRouter);
app.use('/api/bienes',    authMiddleware, bienesRouter);
app.use('/api/crypto',    authMiddleware, cryptoRouter);

// ─── 404 & global error handler ───────────────────────────────────────────────
app.use(notFoundMiddleware);
app.use(errorMiddleware);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`[WealthOS API] Running in ${config.nodeEnv} mode on port ${config.port}`);
});

module.exports = app; // export for testing
