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
};

module.exports = config;
