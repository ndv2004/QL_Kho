function searchProducts(query = '') {
  const q = String(query || '').trim().toLowerCase();
  const products = Array.isArray(state.products) ? state.products : [];

  const ranked = products
    .map((p) => {
      const haystack = [
        p.code,
        p.name,
        p.category_name || p.category,
        p.unit,
        p.specification,
        p.notes,
        p.supplier_name,
        p.barcode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      let score = 0;
      if (!q) {
        score = (p.is_frequent ? 1000 : 0) + (Number(p.current_stock || 0) / 1000000);
      } else if (haystack.includes(q)) {
        if (String(p.code || '').toLowerCase() === q) score = 100;
        else if (String(p.code || '').toLowerCase().startsWith(q)) score = 95;
        else if (String(p.name || '').toLowerCase().startsWith(q)) score = 90;
        else score = 70;
        if (p.is_frequent) score += 5;
      }
      return score > 0 || !q ? { p, score } : null;
    })
    .filter(Boolean);

  ranked.sort((a, b) => (
    b.score - a.score
    || Number(b.p.is_frequent) - Number(a.p.is_frequent)
    || String(a.p.category || '').localeCompare(String(b.p.category || ''), 'vi')
    || String(a.p.code || '').localeCompare(String(b.p.code || ''), 'vi')
  ));

  return ranked.map((x) => x.p);
}

function productPickerDisplayText(product) {
  if (!product) return '';
  return `${product.code} - ${product.name}`;
}

function productPickerMetaText(product) {
  if (!product) return '';
  return [product.category || '—', product.unit || '—', product.specification || '—'].join(' • ');
}

const globalProductPickerState = {
  open: false,
  type: 'order',
  row: null,
  trigger: null,
  query: '',
  results: [],
  activeIndex: -1,
};

function globalProductPickerNodes() {
  return {
    backdrop: $('globalProductPickerBackdrop'),
    root: $('globalProductPicker'),
    search: $('globalProductSearch'),
    list: $('globalProductList'),
    title: $('globalProductPickerTitle'),
    subtitle: $('globalProductPickerSubtitle'),
  };
}

function setGlobalPickerActiveIndex(index, { scrollIntoView = true } = {}) {
  const nodes = globalProductPickerNodes();
  const listItems = nodes.list ? [...nodes.list.querySelectorAll('[data-picker-index]')] : [];
  if (!listItems.length) {
    globalProductPickerState.activeIndex = -1;
    return;
  }

  const clamped = Math.max(0, Math.min(index, listItems.length - 1));
  globalProductPickerState.activeIndex = clamped;

  listItems.forEach((item) => {
    item.classList.toggle('is-active', Number(item.dataset.pickerIndex) === clamped);
  });

  if (scrollIntoView) {
    listItems[clamped]?.scrollIntoView({ block: 'nearest' });
  }
}

function renderGlobalProductPickerList(query = globalProductPickerState.query) {
  const nodes = globalProductPickerNodes();
  if (!nodes.list || !globalProductPickerState.row) return;

  const selectedId = String(globalProductPickerState.row.querySelector('[data-role="product"]')?.value || '');
  const results = searchProducts(query).slice(0, 120);
  globalProductPickerState.query = query;
  globalProductPickerState.results = results;

  if (!results.length) {
    nodes.list.innerHTML = '<div class="global-product-empty">Không tìm thấy sản phẩm phù hợp.</div>';
    globalProductPickerState.activeIndex = -1;
    return;
  }

  nodes.list.innerHTML = results.map((p, idx) => `
    <button type="button"
            class="global-product-card ${String(p.id) === selectedId ? 'is-selected' : ''}"
            data-id="${p.id}"
            data-picker-index="${idx}"
            onclick="selectGlobalProductFromButton(this, event)"
            onmouseenter="setGlobalPickerActiveIndex(${idx}, { scrollIntoView: false })">
      <div class="global-product-top">
        <span class="global-product-code">${esc(p.code)}</span>
        <span class="global-product-name">${esc(p.name)}</span>
      </div>
      <div class="global-product-meta">
        <span>Loại: <b>${esc(p.category || '—')}</b></span>
        <span>DVT: <b>${esc(p.unit || '—')}</b></span>
        <span>Quy cách: <b>${esc(p.specification || '—')}</b></span>
        <span>Tồn: <b>${esc(p.current_stock)}</b></span>
        <span>Giá: <b>${money(p.sale_price)}</b></span>
      </div>
      ${p.is_frequent ? '<span class="global-product-tag">Hay dùng</span>' : ''}
    </button>
  `).join('');

  const selectedIndex = results.findIndex((p) => String(p.id) === selectedId);
  setGlobalPickerActiveIndex(selectedIndex >= 0 ? selectedIndex : 0, { scrollIntoView: false });
}

async function refreshGlobalProductPicker() {
  await loadProducts();
  if (globalProductPickerState.open) {
    renderGlobalProductPickerList(globalProductPickerState.query);
  }
}

function openGlobalProductPicker(trigger, type = 'order', event = null) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const row = trigger?.closest(type === 'import' ? '[data-role="import-row"]' : '[data-role="order-row"]');
  if (!row) return;

  const nodes = globalProductPickerNodes();
  if (!nodes.root || !nodes.backdrop) return;

  globalProductPickerState.open = true;
  globalProductPickerState.type = type;
  globalProductPickerState.row = row;
  globalProductPickerState.trigger = trigger;
  globalProductPickerState.query = '';
  globalProductPickerState.results = [];
  globalProductPickerState.activeIndex = -1;

  nodes.backdrop.classList.remove('d-none');
  nodes.root.classList.remove('d-none');
  document.body.classList.add('global-picker-open');

  if (nodes.title) nodes.title.textContent = 'Chọn sản phẩm';
  if (nodes.subtitle) nodes.subtitle.textContent = 'Gõ mã, tên, loại, DVT hoặc quy cách để lọc nhanh. Chọn bằng click hoặc phím Enter.';

  if (nodes.search) {
    nodes.search.value = '';
    nodes.search.setAttribute('aria-label', 'Tìm sản phẩm');
  }

  renderGlobalProductPickerList('');

  requestAnimationFrame(() => {
    nodes.search?.focus({ preventScroll: true });
    nodes.search?.select?.();
  });
}

function closeGlobalProductPicker() {
  const nodes = globalProductPickerNodes();
  nodes.backdrop?.classList.add('d-none');
  nodes.root?.classList.add('d-none');
  document.body.classList.remove('global-picker-open');

  globalProductPickerState.open = false;
  globalProductPickerState.query = '';
  globalProductPickerState.results = [];
  globalProductPickerState.activeIndex = -1;
  globalProductPickerState.row = null;
  globalProductPickerState.trigger = null;
}

function filterGlobalProductPicker(input) {
  if (!globalProductPickerState.open) return;
  renderGlobalProductPickerList(String(input?.value || ''));
}

function moveGlobalProductPickerActive(delta) {
  if (!globalProductPickerState.results.length) return;
  const next = globalProductPickerState.activeIndex < 0 ? 0 : globalProductPickerState.activeIndex + delta;
  setGlobalPickerActiveIndex(next);
}

function applyProductToRow(row, product, type) {
  if (!row || !product) return;

  const hidden = row.querySelector('[data-role="product"]');
  const display = row.querySelector('[data-role="product_display"]');
  const stockNode = row.querySelector('[data-role="stock"]');
  const priceNode = row.querySelector('[data-role="unit_price"]');

  if (hidden) hidden.value = product.id;
  if (display) display.value = productPickerDisplayText(product);
  if (stockNode) stockNode.textContent = `Tồn kho: ${product.current_stock}`;

  if (type === 'order' && priceNode && (!priceNode.value || Number(priceNode.value) <= 0)) {
    priceNode.value = product.sale_price || 0;
  }

  if (type === 'order') updateOrderTotal();
  if (type === 'import') updateImportTotal();
}

function selectGlobalProduct(productId) {
  const product = productById(productId);
  if (!product || !globalProductPickerState.row) return;
  applyProductToRow(globalProductPickerState.row, product, globalProductPickerState.type);
  closeGlobalProductPicker();
}

function selectGlobalProductFromButton(btn, event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  selectGlobalProduct(btn?.dataset?.id);
}

function handleGlobalProductPickerKeydown(input, event) {
  event?.stopPropagation?.();

  if (event.key === 'Escape') {
    event.preventDefault();
    closeGlobalProductPicker();
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveGlobalProductPickerActive(1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveGlobalProductPickerActive(-1);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const active = globalProductPickerState.results[globalProductPickerState.activeIndex] || globalProductPickerState.results[0];
    if (active) selectGlobalProduct(active.id);
  }
}

function syncPickerRow(row, type) {
  const productId = row?.querySelector('[data-role="product"]')?.value;
  const product = productById(productId);
  if (!row) return;

  const stockNode = row.querySelector('[data-role="stock"]');
  const displayNode = row.querySelector('[data-role="product_display"]');
  const priceNode = row.querySelector('[data-role="unit_price"]');

  if (stockNode) stockNode.textContent = `Tồn kho: ${product ? product.current_stock : '-'}`;
  if (displayNode && product) displayNode.value = productPickerDisplayText(product);
  if (type === 'order' && priceNode && product && !priceNode.value) {
    priceNode.value = product.sale_price || 0;
  }
}

function buildPickerRow(type, item = {}) {
  const product = productById(item.product_id) || null;
  const display = product ? productPickerDisplayText(product) : '';
  const price = item.unit_price ?? product?.sale_price ?? 0;

  return type === 'import' ? `
    <div class="line-item-row line-item-import" data-role="import-row">
      <div class="line-item-cell line-item-product product-picker">
        <label class="form-label">Sản phẩm</label>
        <input type="hidden" data-role="product" value="${item.product_id || ''}">
        <input type="text"
               class="form-control product-picker-display"
               data-role="product_display"
               value="${esc(display)}"
               placeholder="Bấm để chọn sản phẩm..."
               readonly
               onclick="openGlobalProductPicker(this, 'import', event)"
               onfocus="openGlobalProductPicker(this, 'import', event)">
        <div class="row-note" data-role="stock">Tồn kho: ${product ? product.current_stock : '-'}</div>
      </div>
      <div class="line-item-cell line-item-qty">
        <label class="form-label">Số lượng</label>
        <input type="number" min="1" class="form-control" data-role="quantity" value="${item.quantity || 1}" oninput="updateImportTotal()">
      </div>
      <div class="line-item-cell line-item-actions">
        <label class="form-label d-block d-md-none">&nbsp;</label>
        <button type="button" class="btn btn-outline-danger w-100" onclick="removeImportRow(this)">
          <i class="bi bi-x-lg me-1"></i>Xóa
        </button>
      </div>
    </div>
  ` : `
    <div class="line-item-row line-item-order" data-role="order-row">
      <div class="line-item-cell line-item-product product-picker">
        <label class="form-label">Sản phẩm</label>
        <input type="hidden" data-role="product" value="${item.product_id || ''}">
        <input type="text"
               class="form-control product-picker-display"
               data-role="product_display"
               value="${esc(display)}"
               placeholder="Bấm để chọn sản phẩm..."
               readonly
               onclick="openGlobalProductPicker(this, 'order', event)"
               onfocus="openGlobalProductPicker(this, 'order', event)">
        <div class="row-note" data-role="stock">Tồn kho: ${product ? product.current_stock : '-'}</div>
      </div>
      <div class="line-item-cell line-item-qty">
        <label class="form-label">Số lượng</label>
        <input type="number" min="1" class="form-control" data-role="quantity" value="${item.quantity || 1}" oninput="updateOrderTotal()">
      </div>
      <div class="line-item-cell line-item-price">
        <label class="form-label">Giá bán</label>
        <input type="number" min="0" class="form-control" data-role="unit_price" value="${price}" oninput="updateOrderTotal()">
      </div>
      <div class="line-item-cell line-item-actions">
        <label class="form-label d-block d-md-none">&nbsp;</label>
        <button type="button" class="btn btn-outline-danger w-100" onclick="removeOrderRow(this)">
          <i class="bi bi-x-lg me-1"></i>Xóa
        </button>
      </div>
    </div>
  `;
}

function importRowHtml(item = {}) {
  return buildPickerRow('import', item);
}

function orderRowHtml(item = {}) {
  return buildPickerRow('order', item);
}

function orderRowCount() {
  return $('orderRows')?.querySelectorAll('[data-role="order-row"]').length || 0;
}

function importRowCount() {
  return $('importRows')?.querySelectorAll('[data-role="import-row"]').length || 0;
}

function addOrderRow(item = {}) {
  const wrap = $('orderRows');
  if (!wrap) return;
  wrap.insertAdjacentHTML('beforeend', orderRowHtml(item));
  updateOrderTotal();
  syncAllOrderRows();
}

function addImportRow(item = {}) {
  const wrap = $('importRows');
  if (!wrap) return;
  wrap.insertAdjacentHTML('beforeend', importRowHtml(item));
  updateImportTotal();
}

function removeOrderRow(btn) {
  const row = btn.closest('[data-role="order-row"]');
  if (row) row.remove();
  if (!orderRowCount()) addOrderRow();
  updateOrderTotal();
}

function removeImportRow(btn) {
  const row = btn.closest('[data-role="import-row"]');
  if (row) row.remove();
  if (!importRowCount()) addImportRow();
  updateImportTotal();
}

function syncImportRow(input) {
  const row = input.closest('[data-role="import-row"]');
  if (!row) return;
  syncPickerRow(row, 'import');
}

function syncOrderRow(input) {
  const row = input.closest('[data-role="order-row"]');
  if (!row) return;
  syncPickerRow(row, 'order');
  updateOrderTotal();
}

function syncAllOrderRows() {
  $('orderRows')?.querySelectorAll('[data-role="order-row"] [data-role="product_display"]').forEach((el) => syncOrderRow(el));
}

function updateImportTotal() {
  const total = [...($('importRows')?.querySelectorAll('[data-role="import-row"]') || [])]
    .reduce((sum, row) => sum + Number(row.querySelector('[data-role="quantity"]')?.value || 0), 0);
  const node = $('importQtyTotal');
  if (node) node.textContent = total;
}

function updateOrderTotal() {
  const total = [...($('orderRows')?.querySelectorAll('[data-role="order-row"]') || [])]
    .reduce((sum, row) => {
      const qty = Number(row.querySelector('[data-role="quantity"]')?.value || 0);
      const price = Number(row.querySelector('[data-role="unit_price"]')?.value || 0);
      return sum + qty * price;
    }, 0);
  const node = $('orderTotal');
  if (node) node.textContent = money(total);
}

function openProductMenu(trigger, type, event) {
  return openGlobalProductPicker(trigger, type, event);
}

function filterProductMenu(input) {
  return filterGlobalProductPicker(input);
}

function handleProductMenuKeydown(input, type, event) {
  return handleGlobalProductPickerKeydown(input, event);
}

function pickProductFromMenu(btn, event) {
  return selectGlobalProductFromButton(btn, event);
}

window.openGlobalProductPicker = openGlobalProductPicker;
window.closeGlobalProductPicker = closeGlobalProductPicker;
window.filterGlobalProductPicker = filterGlobalProductPicker;
window.renderGlobalProductPickerList = renderGlobalProductPickerList;
window.refreshGlobalProductPicker = refreshGlobalProductPicker;
window.selectGlobalProduct = selectGlobalProduct;
window.selectGlobalProductFromButton = selectGlobalProductFromButton;
window.handleGlobalProductPickerKeydown = handleGlobalProductPickerKeydown;
window.searchProducts = searchProducts;
window.productPickerDisplayText = productPickerDisplayText;
window.productPickerMetaText = productPickerMetaText;
window.openProductMenu = openProductMenu;
window.filterProductMenu = filterProductMenu;
window.handleProductMenuKeydown = handleProductMenuKeydown;
window.pickProductFromMenu = pickProductFromMenu;


function bindGlobalProductPickerEvents() {
  const backdrop = $('globalProductPickerBackdrop');
  const closeBtn = $('globalPickerClose');
  const refreshBtn = $('globalPickerRefresh');
  const search = $('globalProductSearch');
  const root = $('globalProductPicker');

  backdrop?.addEventListener('click', () => closeGlobalProductPicker());
  closeBtn?.addEventListener('click', () => closeGlobalProductPicker());
  refreshBtn?.addEventListener('click', async () => {
    try {
      refreshBtn.disabled = true;
      await refreshGlobalProductPicker();
    } finally {
      refreshBtn.disabled = false;
    }
  });

  search?.addEventListener('input', (e) => filterGlobalProductPicker(e.target));
  search?.addEventListener('keydown', (e) => handleGlobalProductPickerKeydown(search, e));
  root?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeGlobalProductPicker();
    }
  });
}

bindGlobalProductPickerEvents();
