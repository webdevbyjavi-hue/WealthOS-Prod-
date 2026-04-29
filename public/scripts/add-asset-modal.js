/* ══════════════════════════════════════════════════════════════
   WealthOS — Shared Add-Asset Modal
   Single source of truth for the "Add / Edit Position" UI.
   Injected into both index.html and holdings.html at parse time.
   Page-specific save / interaction logic is supplied via callbacks:
     window._openTypeModal(type, editId) — per-type opener (holdings.js)
     window._wosAddAsset(type)           — save dispatcher (each page)
     window._onAssetModalClose()         — reset editing-id state (holdings.js)
     window._onAssetTypeSelected(type)   — post-type-change hook (e.g. load catalog)
   Interaction stubs below are no-ops; holdings.js overrides them.
══════════════════════════════════════════════════════════════ */

// ─── Modal HTML ───────────────────────────────────────────────────────────────
(function () {
  const html = `
<div class="modal-overlay" id="asset-modal-overlay" onclick="closeAssetModal(event)">
  <div class="modal modal--wide">
    <div class="modal__header">
      <h2 class="modal__title" id="asset-modal-title">Agregar Activo</h2>
      <button class="modal__close" onclick="closeAssetModal()">✕</button>
    </div>
    <div class="modal__body modal__body--scrollable">

      <div class="form-group">
        <label class="form-label">Tipo de Activo</label>
        <select class="form-input" id="asset-type-select" onchange="onAssetTypeChange(this.value)">
          <option value="">— Select type —</option>
          <option value="stocks">Stocks / ETFs</option>
          <option value="bonos">Bonos Gubernamentales</option>
          <option value="fondos">Fondos de Inversión</option>
          <option value="fibras">Fibras</option>
          <option value="retiro">Fondos para el Retiro</option>
          <option value="crypto">Cryptos</option>
          <option value="bienes">Bienes y Raíces</option>
        </select>
      </div>

      <!-- ── STOCKS ──────────────────────────────────────────── -->
      <div id="asset-fields-stocks" class="asset-fields" style="display:none">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Ticker Symbol</label>
            <input class="form-input" id="si-ticker" type="text" placeholder="e.g. AAPL" />
          </div>
          <div class="form-group">
            <label class="form-label">Purchase Date</label>
            <div class="datepicker">
              <input class="form-input datepicker__input" id="si-fecha" type="text" readonly placeholder="Select date…" autocomplete="off" />
              <div class="datepicker__popup" hidden></div>
            </div>
          </div>
        </div>
        <div id="si-lookup-wrapper" class="form-group" style="margin-bottom:1rem;display:none">
          <button class="btn btn--ghost btn--lookup" id="si-lookup-btn" onclick="lookupStockTicker()" style="width:100%">Refresh Prices</button>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Company Name</label>
            <input class="form-input" id="si-name" type="text" placeholder="e.g. Apple Inc." />
          </div>
        </div>
        <div class="form-row form-row--aligned">
          <div class="form-group">
            <label class="form-label">Shares Owned</label>
            <input class="form-input" id="si-shares" type="number" placeholder="0" min="0" step="0.001" />
          </div>
          <div class="form-group">
            <label class="form-label">Avg Buy Price ($)</label>
            <input class="form-input" id="si-cost" type="number" min="0" step="0.0001" />
          </div>
          <div class="form-group">
            <label class="form-label">Current Price (MXN)</label>
            <input class="form-input" id="si-price" type="number" placeholder="0.00" min="0" step="0.01" />
          </div>
        </div>
      </div>

      <!-- ── BONOS GUBERNAMENTALES ───────────────────────────── -->
      <div id="asset-fields-bonos" class="asset-fields" style="display:none">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tipo de Instrumento</label>
            <select class="form-input" id="bi-tipo" onchange="onBonoTipoChange(this.value)"></select>
          </div>
          <div class="form-group">
            <label class="form-label">Plazo</label>
            <select class="form-input" id="bi-plazo" onchange="onBonoPlazoChange(this.value)"></select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label class="form-label">Descripción</label>
            <input class="form-input" id="bi-descripcion" type="text" readonly placeholder="Se llena automáticamente al seleccionar tipo y plazo" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tasa de Interés (%)</label>
            <div class="input-lookup-row">
              <input class="form-input" id="bi-tasa" type="number" placeholder="0.00" min="0" step="0.0001" />
              <button class="btn btn--ghost btn--lookup" id="bi-lookup-btn" onclick="lookupBonoTasa()">Lookup</button>
            </div>
            <span class="form-hint" id="bi-tasa-ref" style="display:none"></span>
          </div>
          <div class="form-group">
            <label class="form-label">Serie Banxico</label>
            <input class="form-input" id="bi-serie-banxico" type="text" readonly placeholder="SF00000" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Monto Invertido (MXN)</label>
            <input class="form-input" id="bi-monto" type="number" placeholder="0.00" min="0" step="0.01" />
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de Compra</label>
            <div class="datepicker">
              <input class="form-input datepicker__input" id="bi-fecha" type="text" readonly placeholder="Seleccionar fecha…" autocomplete="off" />
              <div class="datepicker__popup" hidden></div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── FONDOS DE INVERSIÓN ─────────────────────────────── -->
      <div id="asset-fields-fondos" class="asset-fields" style="display:none">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Clave del Fondo</label>
            <input class="form-input" id="fi-clave" type="text" placeholder="e.g. GBMRV1" />
          </div>
          <div class="form-group">
            <label class="form-label">Nombre del Fondo</label>
            <input class="form-input" id="fi-nombre" type="text" placeholder="e.g. GBM Renta Variable" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Operadora</label>
            <input class="form-input" id="fi-operadora" type="text" placeholder="e.g. GBM" />
          </div>
          <div class="form-group">
            <label class="form-label">Tipo de Fondo</label>
            <select class="form-input" id="fi-tipo">
              <option value="Renta Variable">Renta Variable</option>
              <option value="Renta Fija">Renta Fija</option>
              <option value="Patrimonial">Patrimonial</option>
              <option value="Internacional">Internacional</option>
              <option value="Especializado">Especializado</option>
            </select>
          </div>
        </div>
        <div class="form-row form-row--aligned">
          <div class="form-group">
            <label class="form-label">Unidades</label>
            <input class="form-input" id="fi-unidades" type="number" placeholder="0" min="0" step="0.001" />
          </div>
          <div class="form-group">
            <label class="form-label">Precio de Compra (MXN)</label>
            <input class="form-input" id="fi-compra" type="number" placeholder="0.0000" min="0" step="0.0001" />
          </div>
          <div class="form-group">
            <label class="form-label">NAV Actual (MXN)</label>
            <input class="form-input" id="fi-nav" type="number" placeholder="0.0000" min="0" step="0.0001" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Rendimiento Anual (%)</label>
            <input class="form-input" id="fi-rendimiento" type="number" placeholder="0.00" min="0" step="0.01" />
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de Compra</label>
            <div class="datepicker">
              <input class="form-input datepicker__input" id="fi-fecha" type="text" readonly placeholder="Select date…" autocomplete="off" />
              <div class="datepicker__popup" hidden></div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── FIBRAS ──────────────────────────────────────────── -->
      <div id="asset-fields-fibras" class="asset-fields" style="display:none">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Ticker</label>
            <div class="input-lookup-row">
              <input class="form-input" id="fbi-ticker" type="text" placeholder="e.g. FUNO11" />
              <button class="btn btn--ghost btn--lookup" id="fbi-lookup-btn" onclick="lookupFibraTicker()">Lookup</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Nombre</label>
            <input class="form-input" id="fbi-nombre" type="text" placeholder="e.g. Fibra Uno" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Sector</label>
            <select class="form-input" id="fbi-sector">
              <option value="Diversificado">Diversificado</option>
              <option value="Industrial">Industrial</option>
              <option value="Comercial">Comercial</option>
              <option value="Oficinas">Oficinas</option>
              <option value="Hotelero">Hotelero</option>
              <option value="Residencial">Residencial</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Certificados (CBFIs)</label>
            <input class="form-input" id="fbi-certificados" type="number" placeholder="0" min="1" step="1" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Precio de Compra (MXN)</label>
            <input class="form-input" id="fbi-compra" type="number" placeholder="0.0000" min="0" step="0.0001" />
          </div>
          <div class="form-group">
            <label class="form-label">Precio Actual (MXN)</label>
            <input class="form-input" id="fbi-actual" type="number" placeholder="0.0000" min="0" step="0.0001" />
          </div>
        </div>
        <div class="form-row form-row--aligned">
          <div class="form-group">
            <label class="form-label">Distribución Anual por CBFI (MXN)</label>
            <input class="form-input" id="fbi-distribucion" type="number" placeholder="0.00" min="0" step="0.01" />
          </div>
          <div class="form-group">
            <label class="form-label">Rendimiento Total (%)</label>
            <input class="form-input" id="fbi-rendimiento" type="number" placeholder="0.00" step="0.01" />
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de Compra</label>
            <div class="datepicker">
              <input class="form-input datepicker__input" id="fbi-fecha" type="text" readonly placeholder="Select date…" autocomplete="off" />
              <div class="datepicker__popup" hidden></div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── FONDOS PARA EL RETIRO ───────────────────────────── -->
      <div id="asset-fields-retiro" class="asset-fields" style="display:none">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tipo</label>
            <select class="form-input" id="ri-tipo">
              <option value="PPR">PPR</option>
              <option value="Afore">Afore</option>
              <option value="Plan Empresarial">Plan Empresarial</option>
              <option value="Pensión IMSS">Pensión IMSS</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Nombre / Fondo</label>
            <input class="form-input" id="ri-nombre" type="text" placeholder="e.g. PPR GBM Crecimiento" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Institución</label>
            <input class="form-input" id="ri-institucion" type="text" placeholder="e.g. GBM, Profuturo, BBVA" />
          </div>
          <div class="form-group">
            <label class="form-label">Subcuenta</label>
            <select class="form-input" id="ri-subcuenta">
              <option value="Retiro">Retiro</option>
              <option value="Cesantía y Vejez">Cesantía y Vejez</option>
              <option value="Voluntario">Voluntario</option>
              <option value="Empresarial">Empresarial</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Saldo Actual (MXN)</label>
            <input class="form-input" id="ri-saldo" type="number" placeholder="0.00" min="0" step="0.01" />
          </div>
          <div class="form-group">
            <label class="form-label">Aportaciones Mensuales (MXN)</label>
            <input class="form-input" id="ri-aportacion-ytd" type="number" placeholder="0.00" min="0" step="0.01" />
          </div>
        </div>
        <div class="form-row form-row--aligned">
          <div class="form-group">
            <label class="form-label">Rendimiento Anual (%)</label>
            <input class="form-input" id="ri-rendimiento" type="number" placeholder="0.00" step="0.01" />
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de Retiro</label>
            <div class="datepicker" data-allow-future>
              <input class="form-input datepicker__input" id="ri-fecha-retiro" type="text" readonly placeholder="Select date…" autocomplete="off" />
              <div class="datepicker__popup" hidden></div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de Inicio</label>
            <div class="datepicker">
              <input class="form-input datepicker__input" id="ri-fecha" type="text" readonly placeholder="Select date…" autocomplete="off" />
              <div class="datepicker__popup" hidden></div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── CRYPTOS ─────────────────────────────────────────── -->
      <div id="asset-fields-crypto" class="asset-fields" style="display:none">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Symbol</label>
            <input class="form-input" id="ci-symbol" type="text" placeholder="e.g. BTC" />
          </div>
          <div class="form-group">
            <label class="form-label">Purchase Date</label>
            <div class="datepicker">
              <input class="form-input datepicker__input" id="ci-fecha" type="text" readonly placeholder="Select date…" autocomplete="off" />
              <div class="datepicker__popup" hidden></div>
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Coin Name</label>
            <input class="form-input" id="ci-name" type="text" placeholder="e.g. Bitcoin" />
          </div>
        </div>
        <div class="form-row form-row--aligned">
          <div class="form-group">
            <label class="form-label">Price (MXN)</label>
            <input class="form-input" id="ci-price" type="number" placeholder="0.00" min="0" step="0.01" oninput="onCryptoPriceInput()" />
          </div>
          <div class="form-group">
            <label class="form-label">Amount (tokens)</label>
            <input class="form-input" id="ci-amount" type="number" placeholder="0" min="0" step="0.00000001" oninput="onCryptoAmountInput()" />
          </div>
          <div class="form-group">
            <label class="form-label">Purchase Amount (MXN)</label>
            <input class="form-input" id="ci-purchase-amount" type="number" placeholder="0.00" min="0" step="0.01" oninput="onCryptoPurchaseAmountInput()" />
          </div>
        </div>
      </div>

      <!-- ── BIENES Y RAÍCES ─────────────────────────────────── -->
      <div id="asset-fields-bienes" class="asset-fields" style="display:none">
        <div class="form-row form-row--aligned">
          <div class="form-group">
            <label class="form-label">Nombre / Descripción</label>
            <input class="form-input" id="bri-nombre" type="text" placeholder="e.g. Casa Pedregal" />
          </div>
          <div class="form-group">
            <label class="form-label">Tipo</label>
            <select class="form-input" id="bri-tipo">
              <option value="Casa">Casa</option>
              <option value="Departamento">Departamento</option>
              <option value="Local Comercial">Local Comercial</option>
              <option value="Terreno">Terreno</option>
              <option value="Bodega">Bodega</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Ubicación</label>
            <input class="form-input" id="bri-ubicacion" type="text" placeholder="e.g. CDMX – Polanco" />
          </div>
        </div>
        <div class="modal__section-label">Precio de Adquisición</div>
        <div class="form-row form-row--aligned">
          <div class="form-group">
            <label class="form-label">Precio de Compra (MXN)</label>
            <input class="form-input" id="bri-precio" type="number" placeholder="0.00" min="0" step="1" />
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de Compra</label>
            <div class="datepicker">
              <input class="form-input datepicker__input" id="bri-fecha" type="text" readonly placeholder="Select date…" autocomplete="off" />
              <div class="datepicker__popup" hidden></div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Plusvalía Anual (%)</label>
            <input class="form-input" id="bri-plusvalia" type="number" placeholder="e.g. 8.0" min="0" step="0.1" />
          </div>
        </div>
        <div class="modal__section-label">Gastos de Adquisición</div>
        <div class="form-row form-row--aligned">
          <div class="form-group">
            <label class="form-label">Gastos Notariales (MXN)</label>
            <input class="form-input" id="bri-notariales" type="number" placeholder="0.00" min="0" step="1" />
          </div>
          <div class="form-group">
            <label class="form-label">Escrituración / Registro (MXN)</label>
            <input class="form-input" id="bri-escrituracion" type="number" placeholder="0.00" min="0" step="1" />
          </div>
          <div class="form-group">
            <label class="form-label">Impuesto de Adquisición / ISABI (MXN)</label>
            <input class="form-input" id="bri-isabi" type="number" placeholder="0.00" min="0" step="1" />
          </div>
          <div class="form-group">
            <label class="form-label">Comisión Agente / Otros (MXN)</label>
            <input class="form-input" id="bri-otros" type="number" placeholder="0.00" min="0" step="1" />
          </div>
        </div>
        <div class="modal__section-label">Financiamiento e Ingresos</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Saldo Hipotecario Actual (MXN)</label>
            <input class="form-input" id="bri-hipoteca" type="number" placeholder="0.00" min="0" step="1" />
          </div>
          <div class="form-group">
            <label class="form-label">Renta Mensual (MXN)</label>
            <input class="form-input" id="bri-renta" type="number" placeholder="0.00" min="0" step="1" />
          </div>
        </div>
      </div>

      <div class="modal__actions" id="asset-modal-actions" style="display:none">
        <button class="btn btn--ghost" onclick="closeAssetModal()">Cancelar</button>
        <button class="btn btn--primary" id="asset-modal-save-btn" onclick="saveAssetModal()">Guardar Posición</button>
      </div>

    </div>
  </div>
</div>`;

  const el = document.createElement('div');
  el.innerHTML = html.trim();
  document.body.appendChild(el.firstElementChild);
}());

// ─── Titles ───────────────────────────────────────────────────────────────────
const _ASSET_TITLES = {
  stocks: { add: 'Add Stock / ETF',             edit: 'Edit Stock / ETF'           },
  bonos:  { add: 'Agregar Bono Gubernamental',   edit: 'Editar Bono Gubernamental'  },
  fondos: { add: 'Agregar Fondo de Inversión',   edit: 'Editar Fondo de Inversión'  },
  fibras: { add: 'Agregar Fibra',                edit: 'Editar Fibra'               },
  retiro: { add: 'Agregar Fondo de Retiro',      edit: 'Editar Fondo de Retiro'     },
  crypto: { add: 'Add Coin',                     edit: 'Edit Coin'                  },
  bienes: { add: 'Agregar Propiedad',            edit: 'Editar Propiedad'           },
};

// ─── Open (public entry-point) ────────────────────────────────────────────────
function openAssetModal(type, editId) {
  // If the page registered a per-type opener (e.g. holdings.js), delegate to it
  // so the full async pre-fill / catalog logic runs before the overlay appears.
  if (window._openTypeModal) {
    window._openTypeModal(type, editId || null);
    return;
  }
  _openAssetModalRaw(type, !!editId);
}

// Low-level open — called by page-specific openers AFTER they've pre-filled fields.
function _openAssetModalRaw(type, isEdit) {
  const typeEl = document.getElementById('asset-type-select');
  if (typeEl) typeEl.value = type || '';

  document.querySelectorAll('.asset-fields').forEach(el => { el.style.display = 'none'; });
  const actionsEl = document.getElementById('asset-modal-actions');

  if (type) {
    const section = document.getElementById('asset-fields-' + type);
    if (section) {
      section.style.display      = 'flex';
      section.style.flexDirection = 'column';
      section.style.gap          = '16px';
    }
    if (actionsEl) actionsEl.style.display = 'flex';

    const t = _ASSET_TITLES[type];
    const titleEl = document.getElementById('asset-modal-title');
    if (titleEl && t) titleEl.textContent = isEdit ? t.edit : t.add;

    const saveBtn = document.getElementById('asset-modal-save-btn');
    if (saveBtn) saveBtn.textContent = isEdit ? 'Guardar Cambios' : 'Guardar Posición';
  } else {
    if (actionsEl) actionsEl.style.display = 'none';
  }

  document.getElementById('asset-modal-overlay').classList.add('modal-overlay--visible');
}

// ─── Close ────────────────────────────────────────────────────────────────────
function closeAssetModal(e) {
  if (e && e.target !== document.getElementById('asset-modal-overlay')) return;
  if (window._onAssetModalClose) window._onAssetModalClose();
  document.getElementById('asset-modal-overlay').classList.remove('modal-overlay--visible');
  document.querySelectorAll('#asset-modal-overlay input').forEach(el => {
    el.value = '';
    delete el.dataset.usd;
  });
  document.querySelectorAll('#asset-modal-overlay select').forEach(el => { el.selectedIndex = 0; });
  document.querySelectorAll('.asset-fields').forEach(el => { el.style.display = 'none'; });
  const actionsEl = document.getElementById('asset-modal-actions');
  if (actionsEl) actionsEl.style.display = 'none';
  const titleEl = document.getElementById('asset-modal-title');
  if (titleEl) titleEl.textContent = 'Agregar Activo';
}

// ─── Type-selector change ─────────────────────────────────────────────────────
function onAssetTypeChange(val) {
  document.querySelectorAll('.asset-fields').forEach(el => { el.style.display = 'none'; });
  const actionsEl = document.getElementById('asset-modal-actions');
  if (!val) { if (actionsEl) actionsEl.style.display = 'none'; return; }

  const section = document.getElementById('asset-fields-' + val);
  if (section) {
    section.style.display      = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap          = '16px';
    if (actionsEl) actionsEl.style.display = 'flex';
  }
  const t = _ASSET_TITLES[val];
  const titleEl = document.getElementById('asset-modal-title');
  if (titleEl && t) titleEl.textContent = t.add;

  if (window._onAssetTypeSelected) window._onAssetTypeSelected(val);
}

// ─── Save ─────────────────────────────────────────────────────────────────────
function saveAssetModal() {
  const type = document.getElementById('asset-type-select').value;
  if (window._wosAddAsset) window._wosAddAsset(type);
}

// ─── Interaction stubs (overridden by holdings.js) ────────────────────────────
function onBonoTipoChange(v)           {}
function onBonoPlazoChange(v)          {}
function lookupBonoTasa()              {}
function lookupStockTicker()           {}
function lookupFibraTicker()           {}
function onCryptoPriceInput()          {}
function onCryptoAmountInput()         {}
function onCryptoPurchaseAmountInput() {}
