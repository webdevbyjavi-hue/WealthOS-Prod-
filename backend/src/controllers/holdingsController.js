'use strict';

/**
 * Generic CRUD controller factory for all WealthOS asset categories.
 *
 * Each category maps 1-to-1 with a Supabase table of the same name.
 * Every table is expected to have:
 *   - id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
 *   - user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
 *   - created_at  timestamptz DEFAULT now()
 *   - updated_at  timestamptz DEFAULT now()
 *   … plus category-specific columns (see SQL schema in README or migrations)
 *
 * Row Level Security (RLS) must be enabled on every table with a policy that
 * restricts rows to the authenticated user: user_id = auth.uid()
 *
 * Usage:
 *   const { list, create, update, remove } = holdingsController('stocks');
 */

const { supabase } = require('../services/supabaseClient');

function holdingsController(table) {
  // GET /api/:category
  async function list(req, res, next) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/:category
  async function create(req, res, next) {
    try {
      const payload = { ...req.body, user_id: req.user.id };

      const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  // PUT /api/:category/:id
  async function update(req, res, next) {
    try {
      const { id } = req.params;
      const updates = { ...req.body, updated_at: new Date().toISOString() };

      // Prevent caller from overriding ownership
      delete updates.user_id;

      const { data, error } = await supabase
        .from(table)
        .update(updates)
        .eq('id', id)
        .eq('user_id', req.user.id) // RLS double-check
        .select()
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, message: 'Record not found.' });

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  // DELETE /api/:category/:id
  async function remove(req, res, next) {
    try {
      const { id } = req.params;

      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('user_id', req.user.id);

      if (error) throw error;
      if (count === 0) return res.status(404).json({ success: false, message: 'Record not found.' });

      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  }

  return { list, create, update, remove };
}

module.exports = holdingsController;
