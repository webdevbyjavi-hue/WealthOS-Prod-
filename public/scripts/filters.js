/* ══════════════════════════════════════════════════════════════
   WealthOS — Shared Filter State (persists via localStorage)
══════════════════════════════════════════════════════════════ */

const WOS_FILTERS = (() => {
  const KEY_PERIOD    = 'wealthos_filter_period';
  const KEY_DATE_FROM = 'wealthos_filter_date_from';
  const KEY_DATE_TO   = 'wealthos_filter_date_to';

  function get() {
    return {
      period:   localStorage.getItem(KEY_PERIOD)    || 'ytd',
      dateFrom: localStorage.getItem(KEY_DATE_FROM) || '',
      dateTo:   localStorage.getItem(KEY_DATE_TO)   || '',
    };
  }

  function save(period, dateFrom, dateTo) {
    localStorage.setItem(KEY_PERIOD,    period);
    localStorage.setItem(KEY_DATE_FROM, dateFrom || '');
    localStorage.setItem(KEY_DATE_TO,   dateTo   || '');
  }

  function getDateRange() {
    const { period, dateFrom, dateTo } = get();
    const now      = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let from = null, to = todayEnd;

    if (period === 'week') {
      const day      = now.getDay();
      const daysToMon = day === 0 ? 6 : day - 1;
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMon);
    } else if (period === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'ytd') {
      from = new Date(now.getFullYear(), 0, 1);
    } else if (period === 'custom') {
      from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
      to   = dateTo   ? new Date(dateTo   + 'T23:59:59') : todayEnd;
    }
    return { period, from, to, dateFrom, dateTo };
  }

  function getDays() {
    const { from, to } = getDateRange();
    if (!from) return 365;
    return Math.max(1, Math.ceil((to - from) / 86400000));
  }

  function restoreUI(pillPrefix, customRangeId, dateFromId, dateToId) {
    const { period, dateFrom, dateTo } = get();
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('filter-pill--active'));
    const btn = document.getElementById(pillPrefix + period);
    if (btn) btn.classList.add('filter-pill--active');
    const rangeEl = document.getElementById(customRangeId);
    if (rangeEl) rangeEl.classList.toggle('filter-custom-range--disabled', period !== 'custom');
    if (period === 'custom') {
      const fromEl = document.getElementById(dateFromId);
      const toEl   = document.getElementById(dateToId);
      if (fromEl) fromEl.value = dateFrom;
      if (toEl)   toEl.value   = dateTo;
    }
    return { period, dateFrom, dateTo };
  }

  return { get, save, getDateRange, getDays, restoreUI };
})();
