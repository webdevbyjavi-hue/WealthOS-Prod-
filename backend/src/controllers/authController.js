'use strict';

const { supabase } = require('../services/supabaseClient');

// POST /api/auth/signup
async function signup(req, res, next) {
  try {
    const { email, password, first_name, last_name } = req.body;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: (first_name || '').trim(), last_name: (last_name || '').trim() },
      },
    });
    if (error) return res.status(400).json({ success: false, message: error.message });

    res.status(201).json({ success: true, data: { user: data.user, session: data.session } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/signin
async function signin(req, res, next) {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ success: false, message: error.message });

    res.json({ success: true, data: { user: data.user, session: data.session } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/signout
async function signout(req, res, next) {
  try {
    const token = req.headers.authorization?.slice(7);
    if (token) {
      // Invalidate the session on Supabase side
      await supabase.auth.admin?.signOut(token).catch(() => null);
    }
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/reset-password
async function resetPassword(req, res, next) {
  try {
    const { email } = req.body;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL,
    });
    if (error) return res.status(400).json({ success: false, message: error.message });

    res.json({ success: true, data: { message: 'Password reset email sent.' } });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me  (protected)
async function me(req, res) {
  // req.user is set by authMiddleware
  res.json({ success: true, data: { user: req.user } });
}

module.exports = { signup, signin, signout, resetPassword, me };
