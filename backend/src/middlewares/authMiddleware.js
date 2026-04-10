'use strict';

const { supabase } = require('../services/supabaseClient');

/**
 * Protect a route by verifying the Supabase JWT from the Authorization header.
 *
 * Expects:  Authorization: Bearer <access_token>
 * On success: attaches req.user (Supabase user object) and calls next().
 * On failure: responds 401.
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing or malformed Authorization header.' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }

  req.user = data.user;
  next();
}

module.exports = authMiddleware;
