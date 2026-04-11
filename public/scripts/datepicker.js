'use strict';
// ─── WealthOS Datepicker ───────────────────────────────────────────────────────
// Replaces every .datepicker wrapper's text input with a custom calendar popup.
// The input's .value getter/setter is overridden so it always reads/writes
// YYYY-MM-DD — identical to a native <input type="date"> — requiring zero
// changes in the rest of the codebase.

(function () {
  const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function pad(n)       { return String(n).padStart(2, '0'); }
  function toYMD(y,m,d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

  function parseYMD(s) {
    if (!s) return null;
    const p = s.split('-').map(Number);
    return { y: p[0], m: p[1] - 1, d: p[2] };
  }

  function formatDisplay(s) {
    if (!s) return '';
    const p = parseYMD(s);
    return `${MONTHS[p.m]} ${p.d}, ${p.y}`;
  }

  function init(wrapper) {
    const input = wrapper.querySelector('.datepicker__input');
    const popup = wrapper.querySelector('.datepicker__popup');

    const nativeDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const nativeSet  = nativeDesc.set;

    const today = new Date();
    let selYMD  = null;
    let vy      = today.getFullYear();
    let vm      = today.getMonth();

    // ── Override .value so callers get/set YYYY-MM-DD transparently ────────────
    Object.defineProperty(input, 'value', {
      get() { return selYMD || ''; },
      set(v) {
        selYMD = v || null;
        if (selYMD) { const p = parseYMD(selYMD); vy = p.y; vm = p.m; }
        nativeSet.call(this, formatDisplay(selYMD));
      },
      configurable: true,
    });

    // ── Render calendar grid into popup ─────────────────────────────────────────
    function render() {
      const todayYMD = toYMD(today.getFullYear(), today.getMonth(), today.getDate());
      const first    = new Date(vy, vm, 1).getDay();
      const dim      = new Date(vy, vm + 1, 0).getDate();

      let grid = DAYS.map(d => `<span class="dp__dow">${d}</span>`).join('');
      for (let i = 0; i < first; i++) grid += '<span></span>';
      for (let d = 1; d <= dim; d++) {
        const ymd = toYMD(vy, vm, d);
        const isFuture = ymd > todayYMD;
        let cls = 'dp__day';
        if (ymd === todayYMD) cls += ' dp__day--today';
        if (ymd === selYMD)   cls += ' dp__day--selected';
        if (isFuture)         cls += ' dp__day--future';
        grid += `<span class="${cls}"${isFuture ? '' : ` data-ymd="${ymd}"`}>${d}</span>`;
      }

      popup.innerHTML = `
        <div class="dp__header">
          <button class="dp__nav" data-dir="-1">&#8249;</button>
          <span class="dp__title">${MONTHS[vm]} ${vy}</span>
          <button class="dp__nav" data-dir="1">&#8250;</button>
        </div>
        <div class="dp__grid">${grid}</div>`;

      popup.querySelectorAll('.dp__nav').forEach(btn =>
        btn.addEventListener('click', e => {
          e.stopPropagation();
          vm += +btn.dataset.dir;
          if (vm > 11) { vm = 0;  vy++; }
          if (vm < 0)  { vm = 11; vy--; }
          render();
        })
      );

      popup.querySelectorAll('.dp__day[data-ymd]').forEach(el =>
        el.addEventListener('click', e => {
          e.stopPropagation();
          selYMD = el.dataset.ymd;
          nativeSet.call(input, formatDisplay(selYMD));
          close();
        })
      );
    }

    function open() {
      if (selYMD) { const p = parseYMD(selYMD); vy = p.y; vm = p.m; }
      render();
      popup.hidden = false;
    }
    function close() { popup.hidden = true; }

    input.addEventListener('click', e => {
      e.stopPropagation();
      popup.hidden ? open() : close();
    });

    // Close when clicking anywhere outside this picker
    document.addEventListener('click', () => close());
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.datepicker').forEach(init);
  });
})();
