'use strict';

const { supabaseAdmin: supabase } = require('../services/supabaseClient');

// ─── Accounts ─────────────────────────────────────────────────────────────────

// GET /api/accounts
async function listAccounts(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// POST /api/accounts
async function createAccount(req, res, next) {
  try {
    const { name, bank, country, type, currency, balance, fx_rate, notes } = req.body;

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        user_id: req.user.id,
        name,
        bank,
        country: country || null,
        type: type || null,
        currency: currency || 'MXN',
        balance,
        fx_rate: fx_rate || 1,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// PUT /api/accounts/:id
async function updateAccount(req, res, next) {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.user_id;

    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Account not found.' });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/accounts/:id
async function deleteAccount(req, res, next) {
  try {
    const { id } = req.params;

    const { error, count } = await supabase
      .from('accounts')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    if (count === 0) return res.status(404).json({ success: false, message: 'Account not found.' });

    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

// ─── Transactions (cash flows tied to an account) ─────────────────────────────

// GET /api/accounts/:id/transactions
async function listTransactions(req, res, next) {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('account_id', id)
      .eq('user_id', req.user.id)
      .order('date', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// POST /api/accounts/:id/transactions
async function createTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const { type, amount, currency, fx_rate, description, date, category } = req.body;

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: req.user.id,
        account_id: id,
        type,
        amount,
        currency: currency || 'MXN',
        fx_rate: fx_rate || 1,
        description: description || null,
        category: category || null,
        date: date || new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// PUT /api/accounts/:id/transactions/:txId
async function updateTransaction(req, res, next) {
  try {
    const { txId } = req.params;
    const { type, amount, currency, fx_rate, description, category, date } = req.body;

    const { data, error } = await supabase
      .from('transactions')
      .update({
        type,
        amount,
        currency:    currency    || 'MXN',
        fx_rate:     fx_rate     || 1,
        description: description || null,
        category:    category    || null,
        date:        date        || new Date().toISOString().split('T')[0],
      })
      .eq('id', txId)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Transaction not found.' });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/accounts/:id/transactions/:txId
async function deleteTransaction(req, res, next) {
  try {
    const { txId } = req.params;

    const { error, count } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('id', txId)
      .eq('user_id', req.user.id);

    if (error) throw error;
    if (count === 0) return res.status(404).json({ success: false, message: 'Transaction not found.' });

    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

// ─── Account Balance Snapshots ────────────────────────────────────────────────

// GET /api/accounts/snapshots
// Returns all snapshots for this user from the past year, oldest first.
async function listAccountSnapshots(req, res, next) {
  try {
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const fromStr = yearAgo.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('account_balance_snapshots')
      .select('*')
      .eq('user_id', req.user.id)
      .gte('date', fromStr)
      .order('date', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// POST /api/accounts/snapshots
// Upserts today's balance for every account belonging to this user.
async function snapshotAccounts(req, res, next) {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, balance, fx_rate')
      .eq('user_id', req.user.id);

    if (error) throw error;
    if (!accounts?.length) return res.json({ success: true, data: { count: 0, date: today } });

    const rows = accounts.map(a => ({
      user_id:     req.user.id,
      account_id:  a.id,
      date:        today,
      balance:     parseFloat(a.balance)   || 0,
      balance_mxn: (parseFloat(a.balance) || 0) * (parseFloat(a.fx_rate) || 1),
      fx_rate:     parseFloat(a.fx_rate)   || 1,
    }));

    const { error: upsertErr } = await supabase
      .from('account_balance_snapshots')
      .upsert(rows, { onConflict: 'account_id,date' });

    if (upsertErr) throw upsertErr;
    res.json({ success: true, data: { count: rows.length, date: today } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  listAccountSnapshots,
  snapshotAccounts,
};
