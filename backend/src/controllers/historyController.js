'use strict';

const { supabaseAdmin: supabase } = require('../services/supabaseClient');

// GET /api/history?limit=50&offset=0&category=Investment
async function listEvents(req, res, next) {
  try {
    const { limit = 50, offset = 0, category } = req.query;

    let query = supabase
      .from('history_events')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('timestamp', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (category) query = query.eq('category', category);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ success: true, data, meta: { total: count, limit: Number(limit), offset: Number(offset) } });
  } catch (err) {
    next(err);
  }
}

// POST /api/history
async function createEvent(req, res, next) {
  try {
    const { type, category, icon, title, detail, amount } = req.body;

    const { data, error } = await supabase
      .from('history_events')
      .insert({
        user_id: req.user.id,
        type,
        category,
        icon: icon || '•',
        title,
        detail: detail || null,
        amount: amount !== undefined ? amount : null,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/history/:id
async function deleteEvent(req, res, next) {
  try {
    const { id } = req.params;

    const { error, count } = await supabase
      .from('history_events')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    if (count === 0) return res.status(404).json({ success: false, message: 'Event not found.' });

    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/history  (clear all events for the user)
async function clearHistory(req, res, next) {
  try {
    const { error } = await supabase
      .from('history_events')
      .delete()
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

module.exports = { listEvents, createEvent, deleteEvent, clearHistory };
