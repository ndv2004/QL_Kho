function buildSupplierSelect(selectedId = '', includePlaceholder = true) {
  const options = (state.suppliers || []).map((s) => `<option value="${s.id}" ${String(s.id) === String(selectedId) ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  return includePlaceholder ? `<option value="">-- Chọn nhà cung ứng --</option>${options}` : options;
}

function buildCustomerSelect(selectedId = '', includePlaceholder = true) {
  const options = (state.customers || []).map((c) => `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return includePlaceholder ? `<option value="">-- Nhập tay hoặc chọn khách hàng --</option>${options}` : options;
}

function buildPickerRow(type, item = {}) {
  const product = productById(item.product_id) || null;
  const display = product ? productPickerDisplayText(product) : '';
  const price = item.unit_price ?? product?.sale_price ?? 0;

  return type === 'import' ? `
    <div class="line-item-row line-item-import" data-role="import-row">
      <div class="line-item-cell line-item-product product-picker">
        <label class="form-label">Sản phẩm</label>
        <div class="line-item-product-body">
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
        <div class="line-item-product-body">
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
  const productId = row.querySelector('[data-role="product"]')?.value;
  const product = productById(productId);
  const stockNode = row.querySelector('[data-role="stock"]');
  const displayNode = row.querySelector('[data-role="product_display"]');
  if (stockNode) stockNode.textContent = `Tồn kho: ${product ? product.current_stock : '-'}`;
  if (displayNode && product) displayNode.value = productPickerDisplayText(product);
}

function syncOrderRow(input) {
  const row = input.closest('[data-role="order-row"]');
  if (!row) return;
  const productId = row.querySelector('[data-role="product"]')?.value;
  const product = productById(productId);
  const stockNode = row.querySelector('[data-role="stock"]');
  const displayNode = row.querySelector('[data-role="product_display"]');
  const priceNode = row.querySelector('[data-role="unit_price"]');
  if (stockNode) stockNode.textContent = `Tồn kho: ${product ? product.current_stock : '-'}`;
  if (displayNode && product) displayNode.value = productPickerDisplayText(product);
  if (priceNode && product && !priceNode.value) priceNode.value = product.sale_price || 0;
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

function collectValidImportItems() {
  return [...($('importRows')?.querySelectorAll('[data-role="import-row"]') || [])]
    .map((row) => ({
      product_id: row.querySelector('[data-role="product"]')?.value || '',
      quantity: Number(row.querySelector('[data-role="quantity"]')?.value || 0),
    }))
    .filter((item) => item.product_id && item.quantity > 0);
}

function collectValidOrderItems() {
  return [...($('orderRows')?.querySelectorAll('[data-role="order-row"]') || [])]
    .map((row) => ({
      product_id: row.querySelector('[data-role="product"]')?.value || '',
      quantity: Number(row.querySelector('[data-role="quantity"]')?.value || 0),
      unit_price: Number(row.querySelector('[data-role="unit_price"]')?.value || 0),
    }))
    .filter((item) => item.product_id && item.quantity > 0);
}

function openProductModal(product = null) {
  const editing = !!product;
  showFormModal(editing ? 'Sửa sản phẩm' : 'Thêm sản phẩm', `
    <div class="field-row">
      <div class="mb-3">
        <label class="form-label">Mã sản phẩm</label>
        <input class="form-control" id="product_code" value="${esc(product?.code || '')}" required>
      </div>
      <div class="mb-3">
        <label class="form-label">Tên sản phẩm</label>
        <input class="form-control" id="product_name" value="${esc(product?.name || '')}" required>
      </div>
    </div>
    <div class="field-row-3">
      <div class="mb-3">
        <label class="form-label">Loại sản phẩm</label>
        <input class="form-control" id="product_category" value="${esc(product?.category || '')}" placeholder="BÌA MÀU">
      </div>
      <div class="mb-3">
        <label class="form-label">Đơn vị (DVT)</label>
        <input class="form-control" id="product_unit" value="${esc(product?.unit || '')}" placeholder="tập / quyển / ream / bộ / cái">
      </div>
      <div class="mb-3">
        <label class="form-label">Quy cách</label>
        <input class="form-control" id="product_spec" value="${esc(product?.specification || '')}" placeholder="50 tờ/q, 100 tờ/tập...">
      </div>
    </div>
    <div class="field-row">
      <div class="mb-3">
        <label class="form-label">Giá bán</label>
        <input type="number" min="0" class="form-control" id="product_price" value="${Number(product?.sale_price || 0)}">
      </div>
      <div class="mb-3">
        <label class="form-label">Số lượng tồn</label>
        <input type="number" min="0" class="form-control" id="product_stock" value="${Number(product?.current_stock || 0)}">
      </div>
    </div>
    <div class="field-row">
      <div class="mb-3">
        <label class="form-label">Nhà cung ứng</label>
        <select class="form-select" id="product_supplier">
          ${buildSupplierSelect(product?.supplier_id)}
        </select>
      </div>
      <div class="mb-3 d-flex align-items-end">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="product_frequent" ${product?.is_frequent ? 'checked' : ''}>
          <label class="form-check-label" for="product_frequent">Hàng thường xuyên dùng</label>
        </div>
      </div>
    </div>
  `, async () => {
    const body = {
      code: $('product_code').value.trim(),
      name: $('product_name').value.trim(),
      category: $('product_category').value.trim(),
      unit: $('product_unit').value.trim(),
      specification: $('product_spec').value.trim(),
      sale_price: $('product_price').value,
      current_stock: $('product_stock').value,
      supplier_id: $('product_supplier').value || null,
      is_frequent: $('product_frequent').checked,
    };
    const url = editing ? `/api/products/${product.id}` : '/api/products';
    const method = editing ? 'PUT' : 'POST';
    await api(url, { method, body: JSON.stringify(body) });
    toast(editing ? 'Đã cập nhật sản phẩm.' : 'Đã thêm sản phẩm.');
    bootstrap.Modal.getOrCreateInstance($('formModal')).hide();
    await loadProducts();
    renderNav();
    if (state.page === 'products') renderProductPage();
    state.dashboard = null;
  }, 'modal-lg');
}

function openSupplierModal(supplier = null) {
  const editing = !!supplier;
  showFormModal(editing ? 'Sửa nhà cung ứng' : 'Thêm nhà cung ứng', `
    <div class="mb-3">
      <label class="form-label">Tên nhà cung ứng</label>
      <input class="form-control" id="supplier_name" value="${esc(supplier?.name || '')}" required>
    </div>
    <div class="field-row">
      <div class="mb-3">
        <label class="form-label">Số điện thoại</label>
        <input class="form-control" id="supplier_phone" value="${esc(supplier?.phone || '')}">
      </div>
      <div class="mb-3">
        <label class="form-label">Địa chỉ</label>
        <input class="form-control" id="supplier_address" value="${esc(supplier?.address || '')}">
      </div>
    </div>
  `, async () => {
    const body = {
      name: $('supplier_name').value.trim(),
      phone: $('supplier_phone').value.trim(),
      address: $('supplier_address').value.trim(),
    };
    const url = editing ? `/api/suppliers/${supplier.id}` : '/api/suppliers';
    const method = editing ? 'PUT' : 'POST';
    await api(url, { method, body: JSON.stringify(body) });
    toast(editing ? 'Đã cập nhật nhà cung ứng.' : 'Đã thêm nhà cung ứng.');
    bootstrap.Modal.getOrCreateInstance($('formModal')).hide();
    await loadSuppliers();
    renderSuppliersPage();
    state.dashboard = null;
  }, 'modal-lg');
}

function openCustomerModal(customer = null) {
  const editing = !!customer;
  showFormModal(editing ? 'Sửa khách hàng' : 'Thêm khách hàng', `
    <div class="mb-3">
      <label class="form-label">Tên khách hàng</label>
      <input class="form-control" id="customer_name" value="${esc(customer?.name || '')}" required>
    </div>
    <div class="field-row">
      <div class="mb-3">
        <label class="form-label">Số điện thoại</label>
        <input class="form-control" id="customer_phone" value="${esc(customer?.phone || '')}">
      </div>
      <div class="mb-3">
        <label class="form-label">Địa chỉ</label>
        <input class="form-control" id="customer_address" value="${esc(customer?.address || '')}">
      </div>
    </div>
    <div class="form-check">
      <input class="form-check-input" type="checkbox" id="customer_walkin" ${customer?.is_walk_in ? 'checked' : ''}>
      <label class="form-check-label" for="customer_walkin">Khách nhập tay / khách lẻ</label>
    </div>
  `, async () => {
    const body = {
      name: $('customer_name').value.trim(),
      phone: $('customer_phone').value.trim(),
      address: $('customer_address').value.trim(),
      is_walk_in: $('customer_walkin').checked,
    };
    const url = editing ? `/api/customers/${customer.id}` : '/api/customers';
    const method = editing ? 'PUT' : 'POST';
    await api(url, { method, body: JSON.stringify(body) });
    toast(editing ? 'Đã cập nhật khách hàng.' : 'Đã thêm khách hàng.');
    bootstrap.Modal.getOrCreateInstance($('formModal')).hide();
    await loadCustomers();
    renderCustomersPage();
    state.dashboard = null;
  }, 'modal-lg');
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
  const productId = row?.querySelector('[data-role="product"]')?.value;
  const product = productById(productId);
  if (!row) return;
  const stockNode = row.querySelector('[data-role="stock"]');
  const displayNode = row.querySelector('[data-role="product_display"]');
  if (stockNode) stockNode.textContent = `Tồn kho: ${product ? product.current_stock : '-'}`;
  if (displayNode && product) displayNode.value = productPickerDisplayText(product);
}

function syncOrderRow(input) {
  const row = input.closest('[data-role="order-row"]');
  const productId = row?.querySelector('[data-role="product"]')?.value;
  const product = productById(productId);
  if (!row) return;
  const stockNode = row.querySelector('[data-role="stock"]');
  const priceNode = row.querySelector('[data-role="unit_price"]');
  const displayNode = row.querySelector('[data-role="product_display"]');
  if (stockNode) stockNode.textContent = `Tồn kho: ${product ? product.current_stock : '-'}`;
  if (displayNode && product) displayNode.value = productPickerDisplayText(product);
  if (priceNode && product && !priceNode.value) {
    priceNode.value = product.sale_price || 0;
  }
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

function collectValidImportItems() {
  return [...($('importRows')?.querySelectorAll('[data-role="import-row"]') || [])]
    .map((row) => ({
      product_id: row.querySelector('[data-role="product"]')?.value || '',
      quantity: Number(row.querySelector('[data-role="quantity"]')?.value || 0),
    }))
    .filter((item) => item.product_id && item.quantity > 0);
}

function collectValidOrderItems() {
  return [...($('orderRows')?.querySelectorAll('[data-role="order-row"]') || [])]
    .map((row) => ({
      product_id: row.querySelector('[data-role="product"]')?.value || '',
      quantity: Number(row.querySelector('[data-role="quantity"]')?.value || 0),
      unit_price: Number(row.querySelector('[data-role="unit_price"]')?.value || 0),
    }))
    .filter((item) => item.product_id && item.quantity > 0);
}

function openImportModal(item = null) {
  const editing = !!item;
  const body = `
    <input type="hidden" id="importId" value="${editing ? item.id : ''}">
    <div class="field-row">
      <div class="mb-3">
        <label class="form-label">Nhà cung ứng</label>
        <select class="form-select" id="importSupplier">${buildSupplierSelect(item?.supplier_id)}</select>
      </div>
      <div class="mb-3">
        <label class="form-label">Ngày nhập</label>
        <input type="date" class="form-control" id="importDate" value="${toInputDate(item?.created_at)}">
      </div>
    </div>
    <div class="mb-3">
      <label class="form-label">Ghi chú</label>
      <textarea class="form-control" id="importNote" placeholder="Ghi chú nếu cần">${esc(item?.note || '')}</textarea>
    </div>
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0">Danh sách sản phẩm</h6>
      <button type="button" class="btn btn-soft btn-sm" onclick="addImportRow()"><i class="bi bi-plus-lg me-1"></i>Thêm dòng</button>
    </div>
    <div class="entry-table-head line-item-head line-item-head-import">
      <div>Sản phẩm</div><div>Số lượng</div><div></div>
    </div>
    <div id="importRows" class="item-row-scroll item-row-grid-shell"></div>
    <div class="d-flex justify-content-between align-items-center mt-3">
      <div class="text-muted small">Nhập kho không cần tính tiền. Hệ thống sẽ tự cộng tồn kho.</div>
      <div class="fw-bold">Tổng số lượng: <span id="importQtyTotal">0</span></div>
    </div>
  `;
  showFormModal(editing ? 'Sửa phiếu nhập kho' : 'Thêm phiếu nhập kho', body, async () => {
    const items = collectValidImportItems();
    if (!items.length) throw new Error('Vui lòng chọn ít nhất một sản phẩm hợp lệ.');
    const payload = {
      supplier_id: $('importSupplier').value,
      created_at: $('importDate').value,
      note: $('importNote').value,
      items,
    };
    const url = editing ? `/api/imports/${item.id}` : '/api/imports';
    const method = editing ? 'PUT' : 'POST';
    await api(url, { method, body: JSON.stringify(payload) });
    toast(editing ? 'Đã cập nhật phiếu nhập.' : 'Đã tạo phiếu nhập.');
    bootstrap.Modal.getOrCreateInstance($('formModal')).hide();
    await loadImports();
    if (state.page === 'imports') renderImportsPage();
    if (state.page === 'dashboard') { state.dashboard = null; await loadDashboard(); renderDashboardPage(); }
  }, 'modal-xl');

  const rows = $('importRows');
  rows.innerHTML = '';
  if (editing && item.items?.length) {
    item.items.forEach((x) => addImportRow({ product_id: x.product_id, quantity: x.quantity }));
  } else {
    addImportRow();
  }
  updateImportTotal();
}

function openOrderModal(order = null) {
  const editing = !!order;
  const body = `
    <input type="hidden" id="orderId" value="${editing ? order.id : ''}">
    <div class="field-row-3">
      <div class="mb-3">
        <label class="form-label">Khách hàng có sẵn</label>
        <select class="form-select" id="orderCustomerSelect">
          ${buildCustomerSelect(order?.customer_id)}
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label">Ngày tạo</label>
        <input type="date" class="form-control" id="orderDate" value="${toInputDate(order?.created_at)}">
      </div>
      <div class="mb-3 d-flex align-items-end">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="orderPaid" ${order?.is_paid ? 'checked' : ''}>
          <label class="form-check-label" for="orderPaid">Đã trả tiền</label>
        </div>
      </div>
    </div>
    <div class="field-row-3">
      <div class="mb-3">
        <label class="form-label">Tên khách hàng</label>
        <input class="form-control" id="orderCustomerName" value="${esc(order?.customer_name || '')}" placeholder="Nhập tay nếu chưa có trong danh sách">
      </div>
      <div class="mb-3">
        <label class="form-label">Số điện thoại</label>
        <input class="form-control" id="orderCustomerPhone" value="${esc(order?.customer_phone || '')}">
      </div>
      <div class="mb-3">
        <label class="form-label">Địa chỉ</label>
        <input class="form-control" id="orderCustomerAddress" value="${esc(order?.customer_address || '')}">
      </div>
    </div>
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0">Danh sách sản phẩm</h6>
      <button type="button" class="btn btn-soft btn-sm" onclick="addOrderRow()"><i class="bi bi-plus-lg me-1"></i>Thêm dòng</button>
    </div>
    <div class="entry-table-head line-item-head line-item-head-order">
      <div>Sản phẩm</div><div>Số lượng</div><div>Giá bán</div><div></div>
    </div>
    <div id="orderRows" class="item-row-scroll item-row-grid-shell"></div>
    <div class="d-flex justify-content-between align-items-center mt-3">
      <div class="text-muted small">Bán hàng sẽ kiểm tra tồn kho trước khi lưu.</div>
      <div class="fw-bold">Tổng tiền: <span id="orderTotal">0 ₫</span></div>
    </div>
  `;
  showFormModal(editing ? 'Sửa hóa đơn' : 'Tạo hóa đơn', body, async () => {
    const items = collectValidOrderItems();
    if (!items.length) throw new Error('Vui lòng chọn ít nhất một sản phẩm hợp lệ.');
    const select = $('orderCustomerSelect');
    const payload = {
      customer_id: select.value || null,
      customer_name: $('orderCustomerName').value.trim(),
      customer_phone: $('orderCustomerPhone').value.trim(),
      customer_address: $('orderCustomerAddress').value.trim(),
      created_at: $('orderDate').value,
      is_paid: $('orderPaid').checked,
      items,
    };
    const url = editing ? `/api/orders/${order.id}` : '/api/orders';
    const method = editing ? 'PUT' : 'POST';
    await api(url, { method, body: JSON.stringify(payload) });
    toast(editing ? 'Đã cập nhật hóa đơn.' : 'Đã tạo hóa đơn.');
    bootstrap.Modal.getOrCreateInstance($('formModal')).hide();
    await loadOrders();
    if (state.page === 'sales' || state.page === 'invoices') renderSalesPage();
    if (state.page === 'dashboard') { state.dashboard = null; await loadDashboard(); renderDashboardPage(); }
  }, 'modal-xl');

  const rowsBox = $('orderRows');
  rowsBox.innerHTML = '';
  if (editing && order.items?.length) {
    order.items.forEach((x) => addOrderRow({ product_id: x.product_id, quantity: x.quantity, unit_price: x.unit_price }));
  } else {
    addOrderRow();
  }
  updateOrderTotal();

  $('orderCustomerSelect').addEventListener('change', (e) => {
    const c = state.customers.find((x) => String(x.id) === String(e.target.value));
    if (c) {
      $('orderCustomerName').value = c.name || '';
      $('orderCustomerPhone').value = c.phone || '';
      $('orderCustomerAddress').value = c.address || '';
    }
  });
}

function openOrderDetail(order) {
  const items = (order.items || []).map((x) => `
    <tr>
      <td>${esc(x.product_code)}</td>
      <td>${esc(x.product_name)}</td>
      <td>${esc(x.category)}</td>
      <td>${x.quantity}</td>
      <td>${money(x.unit_price)}</td>
      <td>${money(x.line_total)}</td>
    </tr>
  `).join('');

  const footer = isManager() ? `
    <button class="btn btn-light" data-action="edit-order" data-id="${order.id}"><i class="bi bi-pencil me-1"></i>Sửa hóa đơn</button>
    <button class="btn btn-outline-success" data-action="toggle-paid" data-id="${order.id}" data-paid="${order.is_paid ? '0' : '1'}">${order.is_paid ? 'Bỏ trả' : 'Cập nhật thanh toán'}</button>
    <button class="btn btn-outline-danger" data-action="delete-order" data-id="${order.id}"><i class="bi bi-trash me-1"></i>Xóa</button>
  ` : '';

  showDetailModal(`Hóa đơn ${order.order_code}`, `
    <div class="field-row mb-3">
      <div class="panel">
        <div class="kpi-title mb-2">Thông tin chung</div>
        <div class="small text-muted">Mã hóa đơn</div>
        <div class="fw-bold mb-2">${esc(order.order_code)}</div>
        <div class="small text-muted">Khách hàng</div>
        <div class="fw-bold mb-2">${esc(order.customer_name || '')}</div>
        <div class="small text-muted">Ngày tạo</div>
        <div class="fw-bold mb-2">${fullDate(order.created_at)}</div>
        <div class="small text-muted">Thanh toán</div>
        <div class="fw-bold">${order.is_paid ? '<span class="badge text-bg-success">Đã trả tiền</span>' : '<span class="badge text-bg-warning">Chưa trả tiền</span>'}</div>
      </div>
      <div class="panel">
        <div class="kpi-title mb-2">Tổng tiền</div>
        <div class="stat-value">${money(order.total_amount)}</div>
        <div class="stat-foot">Số lượng sản phẩm: ${sumBy(order.items || [], (x) => x.quantity)}</div>
      </div>
    </div>
    <div class="panel">
      <h6 class="mb-3">Chi tiết sản phẩm</h6>
      <div class="table-wrap">
        <table class="table align-middle table-hover">
          <thead><tr><th>Mã</th><th>Tên</th><th>Loại</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
          <tbody>${items || '<tr><td colspan="6" class="text-center text-muted py-4">Chưa có sản phẩm</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `, footer);
}

async function saveFormModal() {
  if (state.formSubmit) {
    await state.formSubmit();
  }
}

function initModalHandlers() {
  $('formModalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await saveFormModal();
    } catch (err) {
      toast(err.message || 'Có lỗi xảy ra.', 'error');
    }
  });

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const body = {
        username: e.target.username.value.trim(),
        password: e.target.password.value,
      };
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      state.user = res.data;
      toast('Đăng nhập thành công.');
      bootstrap.Modal.getOrCreateInstance($('loginModal')).hide();
      await afterLogin();
    } catch (err) {
      toast(err.message || 'Đăng nhập không thành công.', 'error');
    }
  });

  $('btnLogin').addEventListener('click', showLoginModal);

  $('btnLogout').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' });
    } catch {}
    state.user = null;
    state.suppliers = [];
    state.customers = [];
    state.imports = [];
    state.orders = [];
    state.dashboard = null;
    state.reports = null;
    state.logs = [];
    state.page = 'products';
    renderNav();
    toast('Đã đăng xuất.');
    await navigate('products');
  });

  $('btnReload').addEventListener('click', async () => {
    if (state.page === 'products') {
      await loadProducts();
      renderProductPage();
      return;
    }
    if (!state.user) {
      await navigate('products');
      return;
    }
    if (state.page === 'dashboard') {
      state.dashboard = null;
      await loadDashboard();
      renderDashboardPage();
      return;
    }
    if (state.page === 'suppliers') {
      await loadSuppliers();
      renderSuppliersPage();
      return;
    }
    if (state.page === 'customers') {
      await loadCustomers();
      renderCustomersPage();
      return;
    }
    if (state.page === 'imports') {
      await loadImports();
      renderImportsPage();
      return;
    }
    if (state.page === 'sales' || state.page === 'invoices') {
      await loadOrders();
      if (state.page === 'sales') renderSalesPage(); else renderInvoicesPage();
      return;
    }
    if (state.page === 'reports') {
      state.reports = null;
      await loadReports();
      renderReportsPage();
      return;
    }
    if (state.page === 'history') {
      await loadLogs();
      renderLogsPage();
      return;
    }
  });

  $('pageContent').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    try {
      if (action === 'set-product-category') {
        state.productFilters.category = btn.dataset.value;
        renderProductPage();
        return;
      }
      if (action === 'reload-products') {
        await loadProducts();
        renderProductPage();
        return;
      }
      if (action === 'add-product') return openProductModal();
      if (action === 'edit-product') return openProductModal(state.products.find((x) => String(x.id) === String(id)));
      if (action === 'delete-product') {
        const product = state.products.find((x) => String(x.id) === String(id));
        return showConfirmModal('Xóa sản phẩm', `<div>Bạn có chắc chắn muốn xóa <b>${esc(product?.name || '')}</b>?</div>`, async () => {
          await api(`/api/products/${id}`, { method: 'DELETE', body: '{}' });
          toast('Đã xóa sản phẩm.');
          await loadProducts();
          renderProductPage();
          state.dashboard = null;
        });
      }

      if (action === 'add-supplier') return openSupplierModal();
      if (action === 'edit-supplier') return openSupplierModal(state.suppliers.find((x) => String(x.id) === String(id)));
      if (action === 'delete-supplier') {
        const supplier = state.suppliers.find((x) => String(x.id) === String(id));
        return showConfirmModal('Xóa nhà cung ứng', `<div>Bạn có chắc chắn muốn xóa <b>${esc(supplier?.name || '')}</b>?</div>`, async () => {
          await api(`/api/suppliers/${id}`, { method: 'DELETE', body: '{}' });
          toast('Đã xóa nhà cung ứng.');
          await loadSuppliers();
          renderSuppliersPage();
          state.dashboard = null;
        });
      }

      if (action === 'add-customer') return openCustomerModal();
      if (action === 'edit-customer') return openCustomerModal(state.customers.find((x) => String(x.id) === String(id)));
      if (action === 'delete-customer') {
        const customer = state.customers.find((x) => String(x.id) === String(id));
        return showConfirmModal('Xóa khách hàng', `<div>Bạn có chắc chắn muốn xóa <b>${esc(customer?.name || '')}</b>?</div>`, async () => {
          await api(`/api/customers/${id}`, { method: 'DELETE', body: '{}' });
          toast('Đã xóa khách hàng.');
          await loadCustomers();
          renderCustomersPage();
          state.dashboard = null;
        });
      }

      if (action === 'add-import') return openImportModal();
      if (action === 'edit-import') {
        const existing = state.imports.find((x) => String(x.id) === String(id));
        return openImportModal(existing);
      }
      if (action === 'delete-import') {
        const existing = state.imports.find((x) => String(x.id) === String(id));
        return showConfirmModal('Xóa phiếu nhập', `<div>Bạn có chắc chắn muốn xóa <b>${esc(existing?.import_code || '')}</b>?</div>`, async () => {
          await api(`/api/imports/${id}`, { method: 'DELETE', body: '{}' });
          toast('Đã xóa phiếu nhập.');
          await loadImports();
          renderImportsPage();
          state.dashboard = null;
          state.reports = null;
        });
      }
      if (action === 'filter-imports') {
        state.importRange.from = $('importFrom')?.value || '';
        state.importRange.to = $('importTo')?.value || '';
        await loadImports();
        renderImportsPage();
        return;
      }

      if (action === 'add-order') return openOrderModal();
      if (action === 'edit-order') {
        const existing = state.orders.find((x) => String(x.id) === String(id));
        return openOrderModal(existing);
      }
      if (action === 'view-order') {
        const existing = state.orders.find((x) => String(x.id) === String(id));
        if (!existing) return;
        return openOrderDetail(existing);
      }
      if (action === 'toggle-paid') {
        const paid = btn.dataset.paid === '1';
        const label = paid ? 'đánh dấu là đã trả tiền' : 'bỏ trạng thái đã trả tiền';
        return showConfirmModal('Xác nhận thanh toán', `<div>Bạn có chắc muốn <b>${label}</b> cho hóa đơn <b>${esc(state.orders.find((x) => String(x.id) === String(id))?.order_code || '')}</b>?</div>`, async () => {
          await api(`/api/orders/${id}/pay`, {
            method: 'PUT',
            body: JSON.stringify({ is_paid: paid }),
          });
          toast('Đã cập nhật trạng thái thanh toán.');
          await loadOrders();
          if (state.page === 'sales' || state.page === 'invoices') renderSalesPage();
          if (state.page === 'dashboard') { state.dashboard = null; await loadDashboard(); renderDashboardPage(); }
        });
      }
      if (action === 'delete-order') {
        const existing = state.orders.find((x) => String(x.id) === String(id));
        return showConfirmModal('Xóa đơn hàng', `<div>Bạn có chắc chắn muốn xóa <b>${esc(existing?.order_code || '')}</b>?</div>`, async () => {
          await api(`/api/orders/${id}`, { method: 'DELETE', body: '{}' });
          toast('Đã xóa đơn hàng.');
          await loadOrders();
          if (state.page === 'sales' || state.page === 'invoices') renderSalesPage();
          state.dashboard = null;
        });
      }
      if (action === 'set-invoice-filter') {
        state.invoiceStatus = btn.dataset.value;
        await loadOrders();
        renderSalesPage();
        return;
      }
      if (action === 'set-order-sort') {
        state.orderSort = btn.dataset.value || 'newest';
        renderSalesPage();
        return;
      }

      if (action === 'load-reports') {
        state.reportMonth = String(Number($('reportMonth').value || state.reportMonth)).padStart(2, '0');
        state.reportYear = String(Number($('reportYear').value || state.reportYear));
        state.reports = null;
        await loadReports();
        renderReportsPage();
        return;
      }
      if (action === 'download-monthly-pdf') {
        const q = new URLSearchParams({ month: state.reportMonth, year: state.reportYear });
        window.open(`/reports/monthly/preview?${q.toString()}`, '_blank');
        return;
      }
      if (action === 'download-summary-pdf') {
        window.open('/reports/summary/preview', '_blank');
        return;
      }

      if (action === 'open-products') {
        await navigate('products');
        return;
      }
      if (action === 'open-imports') {
        await navigate('imports');
        return;
      }
      if (action === 'open-invoices') {
        await navigate('invoices');
        return;
      }
    } catch (err) {
      toast(err.message || 'Có lỗi xảy ra.', 'error');
    }
  });

  $('pageContent').addEventListener('input', (e) => {
    const target = e.target;
    if (!target) return;
    if (target.id === 'productSearch') {
      state.productFilters.search = target.value;
      scheduleProductPageRender();
      return;
    }
    if (target.id === 'productCategory') {
      state.productFilters.category = target.value;
      renderProductPage();
      return;
    }
    if (target.id === 'productFrequent') {
      state.productFilters.frequent = target.value;
      renderProductPage();
      return;
    }
    if (target.closest('[data-role="order-row"]') || target.closest('[data-role="import-row"]')) {
      updateOrderTotal();
      updateImportTotal();
      return;
    }
    if (target.id === 'reportMonth' || target.id === 'reportYear') {
      return;
    }
  });

  $('pageContent').addEventListener('keydown', (e) => {
    const target = e.target;
    if (target && target.id === 'productSearch' && e.key === 'Enter') {
      e.preventDefault();
    }
    if (target && target.matches && target.matches('[data-role="product_searchbox"]') && e.key === 'Enter') {
      e.preventDefault();
    }
  });

  $('pageContent').addEventListener('change', (e) => {
    const target = e.target;
    if (!target) return;
    if (target.id === 'productSearch' || target.id === 'productCategory' || target.id === 'productFrequent') {
      return;
    }
  });

  $('pageContent').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
  });

}

function updateOrderTotal() {
  const rows = $('orderRows');
  if (!rows) return;
  const total = [...rows.querySelectorAll('[data-role="order-row"]')].reduce((sum, row) => {
    const qty = Number(row.querySelector('[data-role="quantity"]')?.value || 0);
    const price = Number(row.querySelector('[data-role="unit_price"]')?.value || 0);
    return sum + qty * price;
  }, 0);
  const node = $('orderTotal');
  if (node) node.textContent = money(total);
}

function updateImportTotal() {
  const rows = $('importRows');
  if (!rows) return;
  const total = [...rows.querySelectorAll('[data-role="import-row"]')].reduce((sum, row) => {
    return sum + Number(row.querySelector('[data-role="quantity"]')?.value || 0);
  }, 0);
  const node = $('importQtyTotal');
  if (node) node.textContent = total;
}

