'use strict';

require('dotenv').config();

function require_env(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  supabase: {
    url: require_env('SUPABASE_URL'),
    anonKey: require_env('SUPABASE_ANON_KEY'),
    serviceRoleKey: require_env('SUPABASE_SERVICE_ROLE_KEY'),
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5500')
      .split(',')
      .map((o) => o.trim()),
  },

  // Optional: Alpha Vantage API key for live price fetching.
  // If absent, the snapshot service will skip fetching and log a warning.
  alphaVantageKey: process.env.ALPHA_VANTAGE_API_KEY || null,

  // Optional: Banxico BMX token for government bond rate lookups.
  // Get a token at: https://www.banxico.org.mx/SieAPIRest/service/v1/token
  banxicoToken: process.env.BANXICO_BMX_TOKEN || null,
};

module.exports = config;
