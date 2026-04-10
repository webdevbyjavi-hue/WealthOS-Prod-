'use strict';

/**
 * numberFormat.js
 * ───────────────
 * Adds automatic comma formatting to every `input.form-input[type="number"]`.
 *
 * How it works:
 *   1. Converts each target input from type="number" to type="text" so the
 *      browser allows displaying a formatted string (e.g. "1,234.56").
 *   2. Adds inputmode="decimal" so mobile devices still show the numeric keyboard.
 *   3. Listens for user input and re-formats the value with thousand-separators
 *      while keeping the cursor in the right place.
 *   4. Overrides the element's .value getter so all existing JS that reads
 *      parseFloat(el.value) or parseInt(el.value) receives a comma-free string —
 *      no changes needed in any other file.
 *   5. Overrides the .value setter so edit-mode pre-population (el.value = 1234)
 *      automatically displays as "1,234".
 */

(function () {
  // Capture the native getter/setter before we override anything
  const nativeDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  function nativeGet(el) { return nativeDescriptor.get.call(el); }
  function nativeSet(el, v) { nativeDescriptor.set.call(el, v); }

  /** Remove all commas from a string. */
  function strip(str) {
    return str.replace(/,/g, '');
  }

  /**
   * Add thousand-separators to the integer part of a numeric string.
   * Leaves the decimal part untouched.
   * Examples:  "1234567.89" → "1,234,567.89"
   *            "-9876"      → "-9,876"
   *            "0.00001"    → "0.00001"
   */
  function addCommas(str) {
    const [intPart, ...rest] = str.split('.');
    const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return rest.length ? formatted + '.' + rest.join('') : formatted;
  }

  /**
   * Format the displayed value and restore the cursor position,
   * accounting for any commas that were inserted or removed.
   */
  function formatOnInput(input) {
    const raw     = nativeGet(input);
    const cleaned = strip(raw);

    // Allow partial / transitional states while typing
    // e.g. "-", ".", "1.", "1,2" mid-entry
    if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return;

    // Reject anything that isn't a valid partial number
    if (!/^-?\d*\.?\d*$/.test(cleaned)) {
      // Strip invalid characters and re-format
      const sanitised = cleaned.replace(/[^\d.-]/g, '');
      nativeSet(input, addCommas(sanitised));
      return;
    }

    const formatted = addCommas(cleaned);
    if (formatted === raw) return; // nothing changed

    // Count commas before cursor in both old and new strings to shift cursor correctly
    const pos = input.selectionStart;
    const commasBefore = (raw.slice(0, pos).match(/,/g) || []).length;

    nativeSet(input, formatted);

    // Recalculate: after formatting, how many commas are before the same logical position?
    const strippedPos   = pos - commasBefore; // position in the stripped string
    const newFormatted  = nativeGet(input);
    let   commasInserted = 0;
    let   counted        = 0;
    for (let i = 0; i < newFormatted.length; i++) {
      if (newFormatted[i] === ',') { commasInserted++; continue; }
      counted++;
      if (counted === strippedPos) { commasInserted = i + 1 - strippedPos; break; }
    }
    const newPos = strippedPos + commasInserted;
    input.setSelectionRange(newPos, newPos);
  }

  /** Hook a single input element. */
  function hook(input) {
    // Switch to text so the browser allows comma characters in the display value
    input.setAttribute('type', 'text');
    input.setAttribute('inputmode', 'decimal');

    // Format on every keystroke
    input.addEventListener('input', () => formatOnInput(input));

    // Format initial value if one is already set (e.g. value="1" on the FX rate input)
    const initial = strip(nativeGet(input));
    if (initial !== '') nativeSet(input, addCommas(initial));

    // Override .value so external JS always sees a comma-free string
    Object.defineProperty(input, 'value', {
      configurable: true,
      enumerable:   true,

      // Getter: strip commas → parseFloat / parseInt work unchanged
      get() {
        return strip(nativeGet(input));
      },

      // Setter: format on assignment → edit-mode pre-population looks nice
      set(v) {
        const str = String(v ?? '');
        if (str === '') { nativeSet(input, ''); return; }
        const cleaned = strip(str);
        nativeSet(input, /^-?\d*\.?\d*$/.test(cleaned) ? addCommas(cleaned) : cleaned);
      },
    });
  }

  function init() {
    // Select only number inputs; exclude date, text, select, etc.
    document.querySelectorAll('input.form-input[type="number"]').forEach(hook);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
