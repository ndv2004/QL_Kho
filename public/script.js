
const state = {
  user: null,
  page: 'products',
  products: [],
  suppliers: [],
  customers: [],
  imports: [],
  orders: [],
  dashboard: null,
  reports: null,
  logs: [],
  productFilters: {
    search: '',
    category: 'all',
    frequent: 'all',
  },
  invoiceStatus: 'all',
  importRange: {
    from: '',
    to: '',
  },
  reportMonth: String(new Date().getMonth() + 1).padStart(2, '0'),
  reportYear: String(new Date().getFullYear()),
  formSubmit: null,
  charts: {
    dashboard: null,
    report: null,
  },
  modalContext: null,
};

const $ = (id) => document.getElementById(id);
const pageContent = $('pageContent');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

function money(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + ' ₫';
}

function shortDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('vi-VN');
}

function fullDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('vi-VN');
}

function toInputDate(value) {
  if (!value) {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function toast(message, type = 'success') {
  const box = $('toastContainer');
  const node = document.createElement('div');
  node.className = 'toast align-items-center';
  node.role = 'alert';
  node.ariaLive = 'assertive';
  node.ariaAtomic = 'true';
  node.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <strong class="me-1">${type === 'success' ? 'Thành công' : 'Thông báo'}:</strong>${esc(message)}
      </div>
      <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;
  box.appendChild(node);
  const t = new bootstrap.Toast(node, { delay: 2500 });
  t.show();
  node.addEventListener('hidden.bs.toast', () => node.remove());
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (res.headers.get('content-type')?.includes('application/pdf')) {
    return res;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const message = data.message || 'Có lỗi xảy ra.';
    if (res.status === 401) {
      throw new Error('Cần đăng nhập quản lý.');
    }
    throw new Error(message);
  }
  return data;
}

function isManager() {
  return !!state.user;
}

function managerPages() {
  return ['dashboard', 'products', 'suppliers', 'customers', 'imports', 'sales', 'invoices', 'reports', 'history'];
}

function navItems() {
  if (!state.user) {
    return [
      ['products', 'bi-box-seam', 'Sản phẩm'],
    ];
  }
  return [
    ['dashboard', 'bi-speedometer2', 'Dashboard'],
    ['products', 'bi-box-seam', 'Sản phẩm'],
    ['suppliers', 'bi-truck', 'Nhà cung ứng'],
    ['customers', 'bi-people', 'Khách hàng'],
    ['imports', 'bi-arrow-down-circle', 'Nhập kho'],
    ['sales', 'bi-cart-check', 'Bán hàng'],
    ['invoices', 'bi-receipt', 'Hóa đơn'],
    ['reports', 'bi-bar-chart', 'Báo cáo'],
    ['history', 'bi-clock-history', 'Lịch sử'],
  ];
}

function bindNavLinks(root) {
  root.querySelectorAll('[data-page]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(link.dataset.page);
      const off = bootstrap.Offcanvas.getInstance($('mobileSidebar'));
      if (off) off.hide();
    });
  });
}

function renderNav() {
  const html = navItems().map(([page, icon, label]) => `
    <a href="#" class="nav-link ${state.page === page ? 'active' : ''}" data-page="${page}">
      <i class="bi ${icon}"></i><span>${label}</span>
    </a>
  `).join('');

  $('desktopNav').innerHTML = html;
  $('mobileNav').innerHTML = html;
  bindNavLinks($('desktopNav'));
  bindNavLinks($('mobileNav'));

  const userBox = state.user
    ? `Xin chào, ${esc(state.user.full_name || state.user.username)}`
    : 'Chưa đăng nhập quản lý';
  $('desktopUserBox').textContent = userBox;
  $('mobileUserBox').textContent = userBox;

  $('btnLogin').classList.toggle('d-none', !!state.user);
  $('btnLogout').classList.toggle('d-none', !state.user);
  $('publicBanner').classList.toggle('d-none', !!state.user);
}

function setTopMeta(title, subtitle) {
  $('pageTitle').textContent = title;
  $('pageSubtitle').textContent = subtitle;
}

function showLoginModal() {
  $('loginForm').reset();
  bootstrap.Modal.getOrCreateInstance($('loginModal')).show();
}

function showFormModal(title, bodyHtml, submitHandler, size = 'modal-xl') {
  $('formModalTitle').textContent = title;
  $('formModalBody').innerHTML = bodyHtml;
  state.formSubmit = submitHandler;
  const dlg = $('formModal').querySelector('.modal-dialog');
  dlg.className = `modal-dialog modal-dialog-centered modal-dialog-scrollable ${size}`;
  bootstrap.Modal.getOrCreateInstance($('formModal')).show();
}

function showDetailModal(title, bodyHtml, footerHtml = '') {
  $('detailModalTitle').textContent = title;
  $('detailModalBody').innerHTML = bodyHtml;
  $('detailModalFooter').innerHTML = footerHtml;
  bootstrap.Modal.getOrCreateInstance($('detailModal')).show();
}

function showConfirmModal(title, bodyHtml, okHandler) {
  $('confirmTitle').textContent = title;
  $('confirmBody').innerHTML = bodyHtml;
  const ok = $('confirmOk');
  ok.onclick = async () => {
    try {
      await okHandler();
      bootstrap.Modal.getOrCreateInstance($('confirmModal')).hide();
    } catch (e) {
      toast(e.message || 'Có lỗi xảy ra.', 'error');
    }
  };
  bootstrap.Modal.getOrCreateInstance($('confirmModal')).show();
}

function refreshCurrentPage() {
  state.dashboard = null;
  state.reports = null;
  if (state.page === 'dashboard' && !state.user) {
    state.page = 'products';
  }
  routeRender(state.page);
}

async function navigate(page) {
  if (managerPages().includes(page) && !state.user) {
    state.page = 'products';
    renderNav();
    setTopMeta('Sản phẩm', 'Xem và tìm kiếm sản phẩm');
    showLoginModal();
    await routeRender('products');
    return;
  }
  state.page = page;
  renderNav();
  await routeRender(page);
}

async function fetchMe() {
  try {
    const res = await api('/api/auth/me');
    state.user = res.data || null;
  } catch {
    state.user = null;
  }
}

async function loadProducts() {
  const res = await api('/api/products');
  state.products = res.data || [];
  return state.products;
}

async function loadSuppliers() {
  if (!state.user) return [];
  const res = await api('/api/suppliers');
  state.suppliers = res.data || [];
  return state.suppliers;
}

async function loadCustomers() {
  if (!state.user) return [];
  const res = await api('/api/customers');
  state.customers = res.data || [];
  return state.customers;
}

async function loadImports() {
  const qs = new URLSearchParams();
  if (state.importRange.from) qs.set('from', state.importRange.from);
  if (state.importRange.to) qs.set('to', state.importRange.to);
  const res = await api(`/api/imports${qs.toString() ? '?' + qs.toString() : ''}`);
  state.imports = res.data || [];
  return state.imports;
}

async function loadOrders() {
  const qs = new URLSearchParams();
  if (state.invoiceStatus !== 'all') qs.set('status', state.invoiceStatus);
  const res = await api(`/api/orders${qs.toString() ? '?' + qs.toString() : ''}`);
  state.orders = res.data || [];
  return state.orders;
}

async function loadLogs() {
  const res = await api('/api/logs?limit=200');
  state.logs = res.data || [];
  return state.logs;
}

async function loadDashboard() {
  const res = await api('/api/dashboard');
  state.dashboard = res.data || null;
  return state.dashboard;
}

async function loadReports() {
  const qs = new URLSearchParams({ month: state.reportMonth, year: state.reportYear });
  const [monthly, products] = await Promise.all([
    api(`/api/reports/monthly?${qs.toString()}`),
    api(`/api/reports/products?${qs.toString()}`),
  ]);
  state.reports = {
    monthly: monthly.data,
    products: products.data,
  };
  return state.reports;
}

function categoryList() {
  const set = new Set(state.products.map((p) => p.category).filter(Boolean));
  return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'))];
}

function filteredProducts() {
  const s = state.productFilters.search.trim().toLowerCase();
  return state.products.filter((p) => {
    if (state.productFilters.category !== 'all' && p.category !== state.productFilters.category) return false;
    if (state.productFilters.frequent === 'true' && !p.is_frequent) return false;
    if (state.productFilters.frequent === 'false' && p.is_frequent) return false;
    if (!s) return true;
    const hay = [p.code, p.name, p.category, p.unit, p.specification, p.supplier_name].join(' ').toLowerCase();
    return hay.includes(s);
  });
}

function productLabel(p) {
  return `${p.code} - ${p.name} (Tồn: ${p.current_stock})`;
}

function supplierName(id) {
  return state.suppliers.find((s) => String(s.id) === String(id))?.name || '';
}

function customerName(id) {
  return state.customers.find((c) => String(c.id) === String(id))?.name || '';
}

function productById(id) {
  return state.products.find((p) => String(p.id) === String(id));
}

function countBy(arr, fn) {
  return arr.reduce((sum, item) => sum + (fn(item) ? 1 : 0), 0);
}

function sumBy(arr, fn) {
  return arr.reduce((sum, item) => sum + Number(fn(item) || 0), 0);
}

function cardHtml(label, value, foot = '') {
  return `<div class="stat-card">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value">${esc(value)}</div>
    ${foot ? `<div class="stat-foot">${esc(foot)}</div>` : ''}
  </div>`;
}

function renderProductPage() {
  const list = filteredProducts();
  const categories = categoryList();
  const frequentCount = countBy(state.products, (p) => p.is_frequent);
  const lowStockCount = countBy(state.products, (p) => p.current_stock <= 10);
  const totalStock = sumBy(state.products, (p) => p.current_stock);
  const canManage = isManager();

  const filterOptions = categories.map((c) => `<option value="${esc(c)}" ${state.productFilters.category === c ? 'selected' : ''}>${c === 'all' ? 'Tất cả loại' : esc(c)}</option>`).join('');
  const tableRows = list.map((p, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><b>${esc(p.code)}</b></td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.category)}</td>
      <td>${esc(p.unit)}</td>
      <td>${esc(p.specification)}</td>
      <td>${money(p.sale_price)}</td>
      <td><span class="badge ${p.current_stock <= 10 ? 'text-bg-danger' : 'text-bg-light'}">${p.current_stock}</span></td>
      <td>${esc(p.supplier_name || supplierName(p.supplier_id))}</td>
      <td>${p.is_frequent ? '<span class="badge badge-soft">Hay dùng</span>' : '-'}</td>
      <td class="table-actions">
        ${canManage ? `
          <button class="btn btn-outline-primary btn-sm" data-action="edit-product" data-id="${p.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm" data-action="delete-product" data-id="${p.id}"><i class="bi bi-trash"></i></button>
        ` : ''}
      </td>
    </tr>
  `).join('');

  const mobileCards = list.map((p) => `
    <div class="mobile-item">
      <div class="mobile-item-grid">
        <div>
          <div class="mobile-item-title">${esc(p.name)}</div>
          <div class="mobile-item-sub">${esc(p.code)} • ${esc(p.category)} • ${esc(p.unit)} • ${esc(p.specification)}</div>
          <div class="mobile-item-sub mt-2">Giá bán: <b>${money(p.sale_price)}</b></div>
          <div class="mobile-item-sub">Tồn kho: <b>${p.current_stock}</b></div>
          <div class="mobile-item-sub">Nhà cung ứng: ${esc(p.supplier_name || supplierName(p.supplier_id))}</div>
          <div class="mobile-item-sub">Hàng hay dùng: ${p.is_frequent ? 'Có' : 'Không'}</div>
        </div>
        <div class="text-end">
          <span class="badge ${p.current_stock <= 10 ? 'text-bg-danger' : 'text-bg-light'} mb-2">${p.current_stock}</span>
          ${canManage ? `
            <div class="d-grid gap-2">
              <button class="btn btn-outline-primary btn-sm" data-action="edit-product" data-id="${p.id}">Sửa</button>
              <button class="btn btn-outline-danger btn-sm" data-action="delete-product" data-id="${p.id}">Xóa</button>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `).join('');

  pageContent.innerHTML = `
    <div class="summary-grid mb-4">
      ${cardHtml('Tổng sản phẩm', state.products.length, 'Danh mục đã chuẩn hóa theo loại sản phẩm')}
      ${cardHtml('Hàng hay dùng', frequentCount, 'Các mặt hàng thường giao dịch')}
      ${cardHtml('Tồn kho thấp', lowStockCount, 'Sản phẩm cần chú ý')}
      ${cardHtml('Tổng tồn kho', totalStock, 'Tổng số lượng hiện tại')}
    </div>

    <div class="panel mb-4">
      <div class="filters">
        <div>
          <label class="form-label">Tìm sản phẩm</label>
          <input id="productSearch" class="form-control" value="${esc(state.productFilters.search)}" placeholder="Tìm theo mã, tên, loại...">
        </div>
        <div>
          <label class="form-label">Loại sản phẩm</label>
          <select id="productCategory" class="form-select">${filterOptions}</select>
        </div>
        <div>
          <label class="form-label">Hàng hay dùng</label>
          <select id="productFrequent" class="form-select">
            <option value="all" ${state.productFilters.frequent === 'all' ? 'selected' : ''}>Tất cả</option>
            <option value="true" ${state.productFilters.frequent === 'true' ? 'selected' : ''}>Chỉ hàng hay dùng</option>
            <option value="false" ${state.productFilters.frequent === 'false' ? 'selected' : ''}>Không phải hàng hay dùng</option>
          </select>
        </div>
        <button class="btn btn-light" data-action="reload-products"><i class="bi bi-arrow-clockwise"></i></button>
        ${canManage ? `<button class="btn btn-pink" data-action="add-product"><i class="bi bi-plus-lg me-1"></i>Thêm sản phẩm</button>` : ''}
      </div>
    </div>

    <div class="panel">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div>
          <h5 class="mb-1">Danh sách sản phẩm</h5>
          <div class="text-muted small">Người thường chỉ xem và tìm kiếm. Quản lý có thể thêm/sửa/xóa.</div>
        </div>
        <div class="chips">
          ${categories.map((c) => `<button class="chip ${state.productFilters.category === c ? 'active' : ''}" data-action="set-product-category" data-value="${esc(c)}">${c === 'all' ? 'Tất cả' : esc(c)}</button>`).join('')}
        </div>
      </div>

      <div class="table-wrap">
        <table class="table align-middle table-hover">
          <thead>
            <tr>
              <th>#</th><th>Mã</th><th>Tên sản phẩm</th><th>Loại</th><th>DVT</th><th>Quy cách</th><th>Giá bán</th><th>Tồn</th><th>Nhà cung ứng</th><th>Hay dùng</th><th class="text-end">Thao tác</th>
            </tr>
          </thead>
          <tbody>${tableRows || `<tr><td colspan="11" class="text-center text-muted py-4">Chưa có dữ liệu</td></tr>`}</tbody>
        </table>
      </div>

      <div class="mobile-list">${mobileCards || '<div class="text-muted">Chưa có dữ liệu</div>'}</div>
    </div>
  `;
}

function renderDashboardPage() {
  if (!state.user) {
    pageContent.innerHTML = `
      <div class="panel">
        <div class="alert alert-soft mb-0">Bạn đang ở chế độ xem công khai. Chỉ có thể xem và tìm kiếm sản phẩm.</div>
      </div>
    `;
    return;
  }

  const d = state.dashboard;
  if (!d) {
    pageContent.innerHTML = `<div class="panel text-center text-muted py-5">Đang tải dashboard...</div>`;
    return;
  }

  const labels = (d.monthly_series || []).map((x) => {
    const [y, m] = x.label.split('-');
    return `${m}/${y}`;
  });
  const revenue = (d.monthly_series || []).map((x) => Number(x.revenue || 0));
  const orders = (d.monthly_series || []).map((x) => Number(x.orders || 0));

  const lowStockHtml = (d.low_stock || []).map((x) => `
    <div class="kpi-item">
      <div class="kpi-title">${esc(x.code)} - ${esc(x.name)}</div>
      <div class="kpi-sub">Tồn: <b>${x.current_stock}</b> • Loại: ${esc(x.category)} • ${esc(x.unit)} • ${esc(x.specification)}</div>
    </div>
  `).join('') || '<div class="text-muted">Không có dữ liệu</div>';

  const recentLogs = (d.recent_logs || []).map((x) => `
    <div class="kpi-item">
      <div class="kpi-title">${esc(x.action)} • ${esc(x.entity_type)} #${esc(x.entity_id ?? '')}</div>
      <div class="kpi-sub">${fullDate(x.created_at)} • ${esc(x.actor_name || 'Hệ thống')}</div>
    </div>
  `).join('') || '<div class="text-muted">Chưa có lịch sử</div>';

  const recentOrders = (d.recent_orders || []).map((x) => `
    <div class="kpi-item">
      <div class="kpi-title">${esc(x.order_code)} • ${esc(x.customer_name || '')}</div>
      <div class="kpi-sub">${fullDate(x.created_at)} • ${money(x.total_amount)} • ${x.is_paid ? 'Đã trả' : 'Chưa trả'}</div>
    </div>
  `).join('') || '<div class="text-muted">Chưa có hóa đơn</div>';

  const recentImports = (d.recent_imports || []).map((x) => `
    <div class="kpi-item">
      <div class="kpi-title">${esc(x.import_code)} • ${esc(x.supplier_name || '')}</div>
      <div class="kpi-sub">${fullDate(x.created_at)}</div>
    </div>
  `).join('') || '<div class="text-muted">Chưa có phiếu nhập</div>';

  pageContent.innerHTML = `
    <div class="summary-grid mb-4">
      ${cardHtml('Sản phẩm', d.counts.products || 0, 'Danh mục hàng hóa hiện có')}
      ${cardHtml('Nhà cung ứng', d.counts.suppliers || 0, 'Danh sách nhà cung cấp')}
      ${cardHtml('Khách hàng', d.counts.customers || 0, 'Khách có sẵn + khách nhập tay')}
      ${cardHtml('Tổng tồn kho', d.counts.stock_total || 0, 'Số lượng hiện tại trong kho')}
    </div>

    <div class="summary-grid mb-4">
      ${cardHtml('Đơn nhập', d.counts.imports || 0, 'Số phiếu nhập kho')}
      ${cardHtml('Hóa đơn', d.counts.orders || 0, 'Số đơn bán hàng')}
      ${cardHtml('Đã trả', d.counts.paid_orders || 0, 'Hóa đơn đã thanh toán')}
      ${cardHtml('Doanh thu', money(d.counts.revenue_total || 0), 'Tổng doanh thu toàn hệ thống')}
    </div>

    <div class="grid-main mb-4">
      <div class="panel">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 class="mb-1">Doanh thu & số đơn 6 tháng gần nhất</h5>
            <div class="text-muted small">Biểu đồ giúp theo dõi nhịp bán hàng.</div>
          </div>
        </div>
        <div class="chart-box"><canvas id="dashboardChart"></canvas></div>
      </div>
      <div class="panel">
        <h5 class="mb-3">Hàng tồn thấp</h5>
        <div class="kpi-list">${lowStockHtml}</div>
      </div>
    </div>

    <div class="cards-2">
      <div class="panel">
        <h5 class="mb-3">Đơn hàng gần đây</h5>
        <div class="kpi-list">${recentOrders}</div>
      </div>
      <div class="panel">
        <h5 class="mb-3">Phiếu nhập gần đây</h5>
        <div class="kpi-list">${recentImports}</div>
      </div>
    </div>

    <div class="panel mt-4">
      <h5 class="mb-3">Lịch sử thao tác gần đây</h5>
      <div class="kpi-list">${recentLogs}</div>
    </div>
  `;

  if (state.charts.dashboard) {
    state.charts.dashboard.destroy();
  }
  const ctx = $('dashboardChart');
  if (ctx && labels.length) {
    state.charts.dashboard = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Doanh thu',
            data: revenue,
            tension: 0.35,
          },
          {
            label: 'Số đơn',
            data: orders,
            tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }
}

function renderSimpleEntityPage(title, subtitle, items, columns, options = {}) {
  const canManage = isManager();
  const tableRows = items.map((item, idx) => columns.table(item, idx, canManage)).join('');
  const cards = items.map((item, idx) => columns.card(item, idx, canManage)).join('');
  pageContent.innerHTML = `
    <div class="panel mb-4">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
        <div>
          <h5 class="mb-1">${esc(title)}</h5>
          <div class="text-muted small">${esc(subtitle)}</div>
        </div>
        ${canManage ? `<button class="btn btn-pink" data-action="${options.addAction || ''}"><i class="bi bi-plus-lg me-1"></i>${esc(options.addLabel || 'Thêm mới')}</button>` : ''}
      </div>
    </div>
    <div class="panel">
      <div class="table-wrap">
        <table class="table align-middle table-hover">
          <thead><tr>${options.headers || ''}</tr></thead>
          <tbody>${tableRows || `<tr><td colspan="${options.colspan || 5}" class="text-center text-muted py-4">Chưa có dữ liệu</td></tr>`}</tbody>
        </table>
      </div>
      <div class="mobile-list">${cards || '<div class="text-muted">Chưa có dữ liệu</div>'}</div>
    </div>
  `;
}

function renderSuppliersPage() {
  renderSimpleEntityPage(
    'Nhà cung ứng',
    'Quản lý danh sách nhà cung cấp.',
    state.suppliers,
    {
      table: (s, idx, canManage) => `
        <tr>
          <td>${idx + 1}</td>
          <td><b>${esc(s.name)}</b></td>
          <td>${esc(s.phone || '')}</td>
          <td>${esc(s.address || '')}</td>
          <td>${fullDate(s.created_at)}</td>
          <td class="table-actions">${canManage ? `
            <button class="btn btn-outline-primary btn-sm" data-action="edit-supplier" data-id="${s.id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline-danger btn-sm" data-action="delete-supplier" data-id="${s.id}"><i class="bi bi-trash"></i></button>
          ` : ''}</td>
        </tr>
      `,
      card: (s, idx, canManage) => `
        <div class="mobile-item">
          <div class="mobile-item-grid">
            <div>
              <div class="mobile-item-title">${esc(s.name)}</div>
              <div class="mobile-item-sub">${esc(s.phone || 'Không có SĐT')}</div>
              <div class="mobile-item-sub">${esc(s.address || 'Không có địa chỉ')}</div>
            </div>
            <div class="text-end">
              ${canManage ? `
                <div class="d-grid gap-2">
                  <button class="btn btn-outline-primary btn-sm" data-action="edit-supplier" data-id="${s.id}">Sửa</button>
                  <button class="btn btn-outline-danger btn-sm" data-action="delete-supplier" data-id="${s.id}">Xóa</button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `,
    },
    {
      addAction: 'add-supplier',
      addLabel: 'Thêm nhà cung ứng',
      headers: '<th>#</th><th>Tên</th><th>SĐT</th><th>Địa chỉ</th><th>Ngày tạo</th><th class="text-end">Thao tác</th>',
      colspan: 6,
    }
  );
}

function renderCustomersPage() {
  renderSimpleEntityPage(
    'Khách hàng',
    'Danh sách khách hàng có sẵn và khách nhập tay.',
    state.customers,
    {
      table: (c, idx, canManage) => `
        <tr>
          <td>${idx + 1}</td>
          <td><b>${esc(c.name)}</b> ${c.is_walk_in ? '<span class="badge badge-soft ms-1">Nhập tay</span>' : ''}</td>
          <td>${esc(c.phone || '')}</td>
          <td>${esc(c.address || '')}</td>
          <td>${fullDate(c.created_at)}</td>
          <td class="table-actions">${canManage ? `
            <button class="btn btn-outline-primary btn-sm" data-action="edit-customer" data-id="${c.id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline-danger btn-sm" data-action="delete-customer" data-id="${c.id}"><i class="bi bi-trash"></i></button>
          ` : ''}</td>
        </tr>
      `,
      card: (c, idx, canManage) => `
        <div class="mobile-item">
          <div class="mobile-item-grid">
            <div>
              <div class="mobile-item-title">${esc(c.name)} ${c.is_walk_in ? '<span class="badge badge-soft ms-1">Nhập tay</span>' : ''}</div>
              <div class="mobile-item-sub">${esc(c.phone || 'Không có SĐT')}</div>
              <div class="mobile-item-sub">${esc(c.address || 'Không có địa chỉ')}</div>
            </div>
            <div class="text-end">
              ${canManage ? `
                <div class="d-grid gap-2">
                  <button class="btn btn-outline-primary btn-sm" data-action="edit-customer" data-id="${c.id}">Sửa</button>
                  <button class="btn btn-outline-danger btn-sm" data-action="delete-customer" data-id="${c.id}">Xóa</button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `,
    },
    {
      addAction: 'add-customer',
      addLabel: 'Thêm khách hàng',
      headers: '<th>#</th><th>Tên</th><th>SĐT</th><th>Địa chỉ</th><th>Ngày tạo</th><th class="text-end">Thao tác</th>',
      colspan: 6,
    }
  );
}

function importSummary(importItem) {
  const count = importItem.items?.length || 0;
  const qty = sumBy(importItem.items || [], (x) => x.quantity);
  return `${importItem.import_code} • ${importItem.supplier_name || ''} • ${count} dòng • ${qty} sản phẩm`;
}

function renderImportsPage() {
  const canManage = isManager();
  const totalQty = sumBy(state.imports, (x) => sumBy(x.items || [], (y) => y.quantity));
  const filterFrom = state.importRange.from || '';
  const filterTo = state.importRange.to || '';

  const rows = state.imports.map((imp, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><b>${esc(imp.import_code)}</b></td>
      <td>${esc(imp.supplier_name || '')}</td>
      <td>${shortDate(imp.created_at)}</td>
      <td>${sumBy(imp.items || [], (x) => x.quantity)}</td>
      <td>${esc(imp.note || '')}</td>
      <td class="table-actions">${canManage ? `
        <button class="btn btn-outline-primary btn-sm" data-action="edit-import" data-id="${imp.id}"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger btn-sm" data-action="delete-import" data-id="${imp.id}"><i class="bi bi-trash"></i></button>
      ` : ''}</td>
    </tr>
  `).join('');

  const cards = state.imports.map((imp) => `
    <div class="mobile-item">
      <div class="mobile-item-grid">
        <div>
          <div class="mobile-item-title">${esc(imp.import_code)}</div>
          <div class="mobile-item-sub">${esc(imp.supplier_name || '')}</div>
          <div class="mobile-item-sub">Ngày: ${shortDate(imp.created_at)} • SL: ${sumBy(imp.items || [], (x) => x.quantity)}</div>
          <div class="mobile-item-sub">${esc(imp.note || '')}</div>
        </div>
        <div class="text-end">
          ${canManage ? `
            <div class="d-grid gap-2">
              <button class="btn btn-outline-primary btn-sm" data-action="edit-import" data-id="${imp.id}">Sửa</button>
              <button class="btn btn-outline-danger btn-sm" data-action="delete-import" data-id="${imp.id}">Xóa</button>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `).join('');

  pageContent.innerHTML = `
    <div class="summary-grid mb-4">
      ${cardHtml('Phiếu nhập', state.imports.length, 'Số phiếu đang hiển thị')}
      ${cardHtml('Tổng số lượng', totalQty, 'Cộng tất cả dòng nhập')}
      ${cardHtml('Từ ngày', filterFrom || '—', 'Lọc lịch sử nhập kho')}
      ${cardHtml('Đến ngày', filterTo || '—', 'Lọc theo ngày')}
    </div>

    <div class="panel mb-4">
      <div class="filters-4">
        <div>
          <label class="form-label">Từ ngày</label>
          <input id="importFrom" type="date" class="form-control" value="${esc(filterFrom)}">
        </div>
        <div>
          <label class="form-label">Đến ngày</label>
          <input id="importTo" type="date" class="form-control" value="${esc(filterTo)}">
        </div>
        <button class="btn btn-light" data-action="filter-imports"><i class="bi bi-funnel me-1"></i>Lọc</button>
        ${canManage ? `<button class="btn btn-pink" data-action="add-import"><i class="bi bi-plus-lg me-1"></i>Thêm phiếu nhập</button>` : ''}
      </div>
    </div>

    <div class="panel">
      <div class="table-wrap">
        <table class="table align-middle table-hover">
          <thead>
            <tr>
              <th>#</th><th>Mã phiếu</th><th>Nhà cung ứng</th><th>Ngày</th><th>Số lượng</th><th>Ghi chú</th><th class="text-end">Thao tác</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7" class="text-center text-muted py-4">Chưa có dữ liệu</td></tr>'}</tbody>
        </table>
      </div>
      <div class="mobile-list">${cards || '<div class="text-muted">Chưa có dữ liệu</div>'}</div>
    </div>
  `;
}

function renderSalesPage() {
  const canManage = isManager();
  const totalOrders = state.orders.length;
  const revenue = sumBy(state.orders, (o) => o.total_amount);
  const paid = countBy(state.orders, (o) => o.is_paid);
  const unpaid = totalOrders - paid;
  const list = state.orders.slice(0, 10);

  const rows = list.map((o, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><b>${esc(o.order_code)}</b></td>
      <td>${esc(o.customer_name || '')}</td>
      <td>${shortDate(o.created_at)}</td>
      <td>${money(o.total_amount)}</td>
      <td><span class="badge ${o.is_paid ? 'text-bg-success' : 'text-bg-warning'}">${o.is_paid ? 'Đã trả' : 'Chưa trả'}</span></td>
      <td class="table-actions">
        <button class="btn btn-outline-secondary btn-sm" data-action="view-order" data-id="${o.id}"><i class="bi bi-eye"></i></button>
        ${canManage ? `
          <button class="btn btn-outline-primary btn-sm" data-action="edit-order" data-id="${o.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm" data-action="delete-order" data-id="${o.id}"><i class="bi bi-trash"></i></button>
        ` : ''}
      </td>
    </tr>
  `).join('');

  const cards = list.map((o) => `
    <div class="mobile-item">
      <div class="mobile-item-grid">
        <div>
          <div class="mobile-item-title">${esc(o.order_code)} • ${esc(o.customer_name || '')}</div>
          <div class="mobile-item-sub">Ngày: ${shortDate(o.created_at)} • Tổng: <b>${money(o.total_amount)}</b></div>
          <div class="mobile-item-sub">Trạng thái: <span class="badge ${o.is_paid ? 'text-bg-success' : 'text-bg-warning'}">${o.is_paid ? 'Đã trả' : 'Chưa trả'}</span></div>
        </div>
        <div class="text-end">
          <div class="d-grid gap-2">
            <button class="btn btn-outline-secondary btn-sm" data-action="view-order" data-id="${o.id}">Xem</button>
            ${canManage ? `
              <button class="btn btn-outline-primary btn-sm" data-action="edit-order" data-id="${o.id}">Sửa</button>
              <button class="btn btn-outline-danger btn-sm" data-action="delete-order" data-id="${o.id}">Xóa</button>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `).join('');

  pageContent.innerHTML = `
    <div class="summary-grid mb-4">
      ${cardHtml('Hóa đơn gần đây', totalOrders, '10 đơn mới nhất đang hiển thị')}
      ${cardHtml('Doanh thu', money(revenue), 'Tổng doanh thu trong danh sách')}
      ${cardHtml('Đã trả', paid, 'Số hóa đơn đã thanh toán')}
      ${cardHtml('Chưa trả', unpaid, 'Số hóa đơn chưa thanh toán')}
    </div>

    <div class="panel mb-4">
      <div class="action-bar">
        ${canManage ? `<button class="btn btn-pink" data-action="add-order"><i class="bi bi-plus-lg me-1"></i>Tạo hóa đơn</button>` : ''}
        <button class="btn btn-light" data-action="reload-orders"><i class="bi bi-arrow-clockwise me-1"></i>Làm mới</button>
      </div>
    </div>

    <div class="panel">
      <div class="table-wrap">
        <table class="table align-middle table-hover">
          <thead>
            <tr><th>#</th><th>Mã hóa đơn</th><th>Khách hàng</th><th>Ngày tạo</th><th>Tổng tiền</th><th>Thanh toán</th><th class="text-end">Thao tác</th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7" class="text-center text-muted py-4">Chưa có dữ liệu</td></tr>'}</tbody>
        </table>
      </div>
      <div class="mobile-list">${cards || '<div class="text-muted">Chưa có dữ liệu</div>'}</div>
    </div>
  `;
}

function renderInvoicesPage() {
  const canManage = isManager();
  const list = state.orders;
  const rows = list.map((o, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><b>${esc(o.order_code)}</b></td>
      <td>${esc(o.customer_name || '')}</td>
      <td>${money(o.total_amount)}</td>
      <td><span class="badge ${o.is_paid ? 'text-bg-success' : 'text-bg-warning'}">${o.is_paid ? 'Đã trả tiền' : 'Chưa trả tiền'}</span></td>
      <td>${shortDate(o.created_at)}</td>
      <td class="table-actions">
        <button class="btn btn-outline-secondary btn-sm" data-action="view-order" data-id="${o.id}"><i class="bi bi-eye"></i></button>
        ${canManage ? `
          <button class="btn btn-outline-primary btn-sm" data-action="edit-order" data-id="${o.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-success btn-sm" data-action="toggle-paid" data-id="${o.id}" data-paid="${o.is_paid ? '0' : '1'}">${o.is_paid ? 'Bỏ trả' : 'Đã trả'}</button>
          <button class="btn btn-outline-danger btn-sm" data-action="delete-order" data-id="${o.id}"><i class="bi bi-trash"></i></button>
        ` : ''}
      </td>
    </tr>
  `).join('');

  const cards = list.map((o) => `
    <div class="mobile-item">
      <div class="mobile-item-grid">
        <div>
          <div class="mobile-item-title">${esc(o.order_code)} • ${esc(o.customer_name || '')}</div>
          <div class="mobile-item-sub">${shortDate(o.created_at)} • ${money(o.total_amount)}</div>
          <div class="mobile-item-sub">
            <span class="badge ${o.is_paid ? 'text-bg-success' : 'text-bg-warning'}">${o.is_paid ? 'Đã trả tiền' : 'Chưa trả tiền'}</span>
          </div>
        </div>
        <div class="text-end">
          <div class="d-grid gap-2">
            <button class="btn btn-outline-secondary btn-sm" data-action="view-order" data-id="${o.id}">Chi tiết</button>
            ${canManage ? `
              <button class="btn btn-outline-primary btn-sm" data-action="edit-order" data-id="${o.id}">Sửa</button>
              <button class="btn btn-outline-success btn-sm" data-action="toggle-paid" data-id="${o.id}" data-paid="${o.is_paid ? '0' : '1'}">${o.is_paid ? 'Bỏ trả' : 'Đã trả'}</button>
              <button class="btn btn-outline-danger btn-sm" data-action="delete-order" data-id="${o.id}">Xóa</button>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `).join('');

  pageContent.innerHTML = `
    <div class="summary-grid mb-4">
      ${cardHtml('Số hóa đơn', list.length, 'Danh sách đang hiển thị')}
      ${cardHtml('Doanh thu', money(sumBy(list, (x) => x.total_amount)), 'Tổng giá trị các hóa đơn')}
      ${cardHtml('Đã trả', countBy(list, (x) => x.is_paid), 'Số hóa đơn thanh toán xong')}
      ${cardHtml('Chưa trả', countBy(list, (x) => !x.is_paid), 'Số hóa đơn còn nợ')}
    </div>

    <div class="panel mb-4">
      <div class="chips">
        <button class="chip ${state.invoiceStatus === 'all' ? 'active' : ''}" data-action="set-invoice-filter" data-value="all">Tất cả</button>
        <button class="chip ${state.invoiceStatus === 'paid' ? 'active' : ''}" data-action="set-invoice-filter" data-value="paid">Đã trả tiền</button>
        <button class="chip ${state.invoiceStatus === 'unpaid' ? 'active' : ''}" data-action="set-invoice-filter" data-value="unpaid">Chưa trả tiền</button>
      </div>
    </div>

    <div class="panel">
      <div class="table-wrap">
        <table class="table align-middle table-hover">
          <thead>
            <tr><th>#</th><th>Mã hóa đơn</th><th>Khách hàng</th><th>Tổng tiền</th><th>Thanh toán</th><th>Ngày tạo</th><th class="text-end">Thao tác</th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7" class="text-center text-muted py-4">Chưa có dữ liệu</td></tr>'}</tbody>
        </table>
      </div>
      <div class="mobile-list">${cards || '<div class="text-muted">Chưa có dữ liệu</div>'}</div>
    </div>
  `;
}

function renderLogsPage() {
  const rows = state.logs.map((x, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${esc(x.action)}</td>
      <td>${esc(x.entity_type)}</td>
      <td>${esc(x.entity_id ?? '')}</td>
      <td>${esc(x.actor_name || 'Hệ thống')}</td>
      <td>${fullDate(x.created_at)}</td>
      <td>${esc(logSummary(x))}</td>
    </tr>
  `).join('');

  const cards = state.logs.map((x) => `
    <div class="mobile-item">
      <div class="mobile-item-title">${esc(x.action)} • ${esc(x.entity_type)} #${esc(x.entity_id ?? '')}</div>
      <div class="mobile-item-sub">${fullDate(x.created_at)} • ${esc(x.actor_name || 'Hệ thống')}</div>
      <div class="mobile-item-sub">${esc(logSummary(x))}</div>
    </div>
  `).join('');

  pageContent.innerHTML = `
    <div class="panel mb-4">
      <h5 class="mb-1">Lịch sử chỉnh sửa</h5>
      <div class="text-muted small">Theo dõi mọi thao tác tạo / sửa / xóa / thanh toán để đối chiếu khi cần.</div>
    </div>
    <div class="panel">
      <div class="table-wrap">
        <table class="table align-middle table-hover">
          <thead><tr><th>#</th><th>Hành động</th><th>Bảng</th><th>ID</th><th>Người thao tác</th><th>Thời gian</th><th>Mô tả</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="text-center text-muted py-4">Chưa có dữ liệu</td></tr>'}</tbody>
        </table>
      </div>
      <div class="mobile-list">${cards || '<div class="text-muted">Chưa có dữ liệu</div>'}</div>
    </div>
  `;
}

function logSummary(x) {
  try {
    const oldData = x.old_data || {};
    const newData = x.new_data || {};
    if (x.action === 'UPDATE' && x.entity_type === 'orders') {
      return `Cập nhật hóa đơn ${x.entity_id} (${oldData.customer_name || ''} → ${newData.customer_name || oldData.customer_name || ''})`;
    }
    if (x.action === 'UPDATE' && x.entity_type === 'imports') {
      return `Cập nhật phiếu nhập ${x.entity_id}`;
    }
    if (x.action === 'CREATE' && x.entity_type === 'orders') {
      return `Tạo hóa đơn ${newData.order_code || ''}`;
    }
    if (x.action === 'CREATE' && x.entity_type === 'imports') {
      return `Tạo phiếu nhập ${newData.import_code || ''}`;
    }
    if (x.action === 'DELETE') {
      return `Xóa ${x.entity_type} #${x.entity_id}`;
    }
    return `${x.action} ${x.entity_type} #${x.entity_id}`;
  } catch {
    return '';
  }
}

function renderReportsPage() {
  if (!state.user) {
    pageContent.innerHTML = `<div class="panel">Cần đăng nhập quản lý để xem báo cáo.</div>`;
    return;
  }

  if (!state.reports) {
    pageContent.innerHTML = `<div class="panel text-center text-muted py-5">Đang tải báo cáo...</div>`;
    return;
  }

  const monthly = state.reports.monthly;
  const products = state.reports.products;
  const topSold = monthly.top_sold || [];
  const topStock = monthly.top_stock || [];
  const byProduct = monthly.by_product || [];

  pageContent.innerHTML = `
    <div class="panel mb-4">
      <div class="filters-4">
        <div>
          <label class="form-label">Tháng</label>
          <input id="reportMonth" type="number" min="1" max="12" class="form-control" value="${esc(state.reportMonth)}">
        </div>
        <div>
          <label class="form-label">Năm</label>
          <input id="reportYear" type="number" min="2020" class="form-control" value="${esc(state.reportYear)}">
        </div>
        <button class="btn btn-light" data-action="load-reports"><i class="bi bi-funnel me-1"></i>Lọc</button>
        <div class="action-bar">
          <button class="btn btn-outline-pink" data-action="download-monthly-pdf"><i class="bi bi-file-earmark-pdf me-1"></i>PDF tháng</button>
          <button class="btn btn-pink" data-action="download-summary-pdf"><i class="bi bi-file-earmark-pdf-fill me-1"></i>PDF tổng quan</button>
        </div>
      </div>
    </div>

    <div class="summary-grid mb-4">
      ${cardHtml('Tổng đơn hàng', monthly.total_orders || 0, 'Trong tháng đã chọn')}
      ${cardHtml('Tổng doanh thu', money(monthly.total_revenue || 0), 'Doanh thu trong tháng')}
      ${cardHtml('Đã thu', money(monthly.total_paid || 0), 'Tổng tiền đã thanh toán')}
      ${cardHtml('Chưa thu', money(monthly.total_unpaid || 0), 'Tổng tiền chưa thanh toán')}
    </div>

    <div class="summary-grid mb-4">
      ${cardHtml('Nhập kho', monthly.total_import_qty || 0, 'Tổng số lượng nhập')}
      ${cardHtml('Bán ra', monthly.total_sold_qty || 0, 'Tổng số lượng xuất bán')}
      ${cardHtml('Tồn kho cuối tháng', monthly.ending_stock || 0, 'Ước tính theo lịch sử giao dịch')}
      ${cardHtml('Tháng báo cáo', monthly.month_label || `${state.reportMonth}/${state.reportYear}`, 'Bộ lọc hiện tại')}
    </div>

    <div class="grid-main mb-4">
      <div class="panel">
        <h5 class="mb-3">Top sản phẩm bán chạy</h5>
        <div class="chart-small"><canvas id="reportChart"></canvas></div>
      </div>
      <div class="panel">
        <h5 class="mb-3">Top tồn kho hiện tại</h5>
        <div class="kpi-list">
          ${(topStock || []).slice(0, 8).map((r) => `
            <div class="kpi-item">
              <div class="kpi-title">${esc(r.code)} - ${esc(r.name)}</div>
              <div class="kpi-sub">Tồn: <b>${r.current_stock}</b> • ${esc(r.category)} • ${esc(r.unit)} • ${esc(r.specification)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="cards-2 mb-4">
      <div class="panel">
        <h5 class="mb-3">Top bán trong tháng</h5>
        <div class="kpi-list">
          ${(topSold || []).slice(0, 10).map((r) => `
            <div class="kpi-item">
              <div class="kpi-title">${esc(r.code)} - ${esc(r.name)}</div>
              <div class="kpi-sub">Bán: <b>${r.sold_qty}</b> • Tồn: ${r.current_stock}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="panel">
        <h5 class="mb-3">Từng sản phẩm đã bán</h5>
        <div class="table-wrap">
          <table class="table align-middle table-hover">
            <thead><tr><th>Mã</th><th>Tên</th><th>Đã bán</th><th>Tồn</th></tr></thead>
            <tbody>
              ${(byProduct || []).slice(0, 20).map((r) => `
                <tr>
                  <td>${esc(r.code)}</td>
                  <td>${esc(r.name)}</td>
                  <td>${r.sold_qty}</td>
                  <td>${r.current_stock}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  if (state.charts.report) {
    state.charts.report.destroy();
  }
  const ctx = $('reportChart');
  if (ctx) {
    state.charts.report = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topSold.slice(0, 10).map((x) => x.code),
        datasets: [{
          label: 'Số lượng bán',
          data: topSold.slice(0, 10).map((x) => Number(x.sold_qty || 0)),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }
}

window.renderProductsPage = renderProductPage;

function renderPublicPrompt() {
  pageContent.innerHTML = `
    <div class="panel">
      <div class="alert alert-soft mb-0">
        Bạn đang xem chế độ công khai. Chỉ có thể tìm kiếm và xem danh sách sản phẩm.
      </div>
    </div>
  `;
}

function renderLoading(text = 'Đang tải...') {
  pageContent.innerHTML = `<div class="panel text-center text-muted py-5">${esc(text)}</div>`;
}

async function routeRender(page) {
  setTopMeta(
    page === 'dashboard' ? 'Dashboard' :
    page === 'products' ? 'Sản phẩm' :
    page === 'suppliers' ? 'Nhà cung ứng' :
    page === 'customers' ? 'Khách hàng' :
    page === 'imports' ? 'Nhập kho' :
    page === 'sales' ? 'Bán hàng' :
    page === 'invoices' ? 'Hóa đơn' :
    page === 'reports' ? 'Báo cáo' :
    page === 'history' ? 'Lịch sử chỉnh sửa' :
    'Sản phẩm',
    page === 'dashboard' ? 'Tổng quan hoạt động kho và bán hàng' :
    page === 'products' ? 'Quản lý danh mục, DVT, quy cách và loại sản phẩm' :
    page === 'suppliers' ? 'Quản lý nhà cung ứng' :
    page === 'customers' ? 'Quản lý khách hàng' :
    page === 'imports' ? 'Tạo và chỉnh sửa phiếu nhập kho' :
    page === 'sales' ? 'Tạo, sửa và theo dõi hóa đơn bán hàng' :
    page === 'invoices' ? 'Danh sách hóa đơn và trạng thái thanh toán' :
    page === 'reports' ? 'Báo cáo tháng, tổng quan và PDF' :
    page === 'history' ? 'Lịch sử chỉnh sửa và thao tác' :
    'Quản lý kho'
  );

  if (page === 'products') {
    renderProductPage();
    return;
  }
  if (!state.user) {
    renderPublicPrompt();
    return;
  }

  if (page === 'dashboard') {
    renderLoading();
    if (!state.dashboard) await loadDashboard();
    renderDashboardPage();
    return;
  }
  if (page === 'suppliers') {
    renderLoading();
    if (!state.suppliers.length) await loadSuppliers();
    renderSuppliersPage();
    return;
  }
  if (page === 'customers') {
    renderLoading();
    if (!state.customers.length) await loadCustomers();
    renderCustomersPage();
    return;
  }
  if (page === 'imports') {
    renderLoading();
    if (!state.suppliers.length) await loadSuppliers();
    if (!state.imports.length) await loadImports();
    renderImportsPage();
    return;
  }
  if (page === 'sales') {
    renderLoading();
    if (!state.orders.length) await loadOrders();
    renderSalesPage();
    return;
  }
  if (page === 'invoices') {
    renderLoading();
    if (!state.orders.length) await loadOrders();
    renderInvoicesPage();
    return;
  }
  if (page === 'reports') {
    renderLoading();
    if (!state.reports) await loadReports();
    renderReportsPage();
    return;
  }
  if (page === 'history') {
    renderLoading();
    if (!state.logs.length) await loadLogs();
    renderLogsPage();
    return;
  }
  renderPublicPrompt();
}

function renderProductFiltersToInputs() {
  const search = $('productSearch');
  if (search) search.value = state.productFilters.search;
  const category = $('productCategory');
  if (category) category.value = state.productFilters.category;
  const frequent = $('productFrequent');
  if (frequent) frequent.value = state.productFilters.frequent;
}

function updateProductFiltersFromInputs() {
  state.productFilters.search = $('productSearch')?.value || '';
  state.productFilters.category = $('productCategory')?.value || 'all';
  state.productFilters.frequent = $('productFrequent')?.value || 'all';
}

function productSearchText(product) {
  return [
    product.code,
    product.name,
    product.category_name || product.category,
    product.unit,
    product.specification,
    product.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buildProductSelect(selectedId = '', includePlaceholder = true, keyword = '') {
  const search = String(keyword || '').trim().toLowerCase();
  let list = state.products.slice();

  if (search) {
    list = list.filter((p) => productSearchText(p).includes(search));
  }

  const selected = state.products.find((p) => String(p.id) === String(selectedId));
  if (selected && !list.some((p) => String(p.id) === String(selected.id))) {
    list = [selected, ...list];
  }

  const options = list.map((p) => `
    <option value="${p.id}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>
      ${esc(productLabel(p))}
    </option>
  `).join('');
  return includePlaceholder ? `<option value="">-- Chọn sản phẩm --</option>${options}` : options;
}

function filterProductSelect(input) {
  const row = input.closest('[data-role="product-picker"]');
  if (!row) return;
  const select = row.querySelector('[data-role="product"]');
  if (!select) return;
  const selectedId = select.value;
  select.innerHTML = buildProductSelect(selectedId, true, input.value);
  if (selectedId) select.value = selectedId;
}

function syncProductFilter(select) {
  const row = select.closest('[data-role="product-picker"]');
  if (!row) return;
  const filter = row.querySelector('[data-role="product-filter"]');
  if (filter && select.value) {
    const product = productById(select.value);
    filter.value = product ? productLabel(product) : '';
  }
}


function buildSupplierSelect(selectedId = '', includePlaceholder = true) {
  const options = state.suppliers.map((s) => `<option value="${s.id}" ${String(s.id) === String(selectedId) ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  return includePlaceholder ? `<option value="">-- Chọn nhà cung ứng --</option>${options}` : options;
}

function buildCustomerSelect(selectedId = '', includePlaceholder = true) {
  const options = state.customers.map((c) => `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return includePlaceholder ? `<option value="">-- Nhập tay hoặc chọn khách hàng --</option>${options}` : options;
}

function importRowHtml(item = {}) {
  const product = productById(item.product_id) || state.products[0] || {};
  return `
    <div class="item-row" data-role="import-row">
      <div class="item-row-grid-3">
        <div>
          <label class="form-label">Sản phẩm</label>
          <div class="product-picker" data-role="product-picker">
            <input
              type="search"
              class="form-control form-control-sm product-filter"
              data-role="product-filter"
              placeholder="Gõ mã hoặc tên để lọc..."
              oninput="filterProductSelect(this)"
              autocomplete="off"
            >
            <select class="form-select" data-role="product" onchange="syncImportRow(this)">
              ${buildProductSelect(item.product_id)}
            </select>
          </div>
          <div class="row-note" data-role="stock">Tồn kho: ${product.current_stock ?? '-'}</div>
        </div>
        <div>
          <label class="form-label">Số lượng</label>
          <input type="number" min="1" class="form-control" data-role="quantity" value="${item.quantity || 1}" oninput="updateImportTotal()">
        </div>
        <div>
          <label class="form-label d-block">&nbsp;</label>
          <button type="button" class="btn btn-outline-danger w-100" onclick="removeImportRow(this)">
            <i class="bi bi-x-lg me-1"></i>Xóa
          </button>
        </div>
      </div>
    </div>
  `;
}

function orderRowHtml(item = {}) {
  const product = productById(item.product_id) || state.products[0] || {};
  const price = item.unit_price ?? product.sale_price ?? 0;
  return `
    <div class="item-row" data-role="order-row">
      <div class="item-row-grid">
        <div>
          <label class="form-label">Sản phẩm</label>
          <div class="product-picker" data-role="product-picker">
            <input
              type="search"
              class="form-control form-control-sm product-filter"
              data-role="product-filter"
              placeholder="Gõ mã hoặc tên để lọc..."
              oninput="filterProductSelect(this)"
              autocomplete="off"
            >
            <select class="form-select" data-role="product" onchange="syncOrderRow(this)">
              ${buildProductSelect(item.product_id)}
            </select>
          </div>
          <div class="row-note" data-role="stock">Tồn kho: ${product.current_stock ?? '-'}</div>
        </div>
        <div>
          <label class="form-label">Số lượng</label>
          <input type="number" min="1" class="form-control" data-role="quantity" value="${item.quantity || 1}" oninput="updateOrderTotal()">
        </div>
        <div>
          <label class="form-label">Giá bán</label>
          <input type="number" min="0" class="form-control" data-role="unit_price" value="${price}" oninput="updateOrderTotal()">
        </div>
        <div>
          <label class="form-label d-block">&nbsp;</label>
          <button type="button" class="btn btn-outline-danger w-100" onclick="removeOrderRow(this)">
            <i class="bi bi-x-lg me-1"></i>Xóa
          </button>
        </div>
      </div>
    </div>
  `;
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

function syncImportRow(select) {
  const row = select.closest('[data-role="import-row"]');
  const product = productById(select.value);
  if (!row) return;
  const stockNode = row.querySelector('[data-role="stock"]');
  const filterNode = row.querySelector('[data-role="product-filter"]');
  if (stockNode) stockNode.textContent = `Tồn kho: ${product ? product.current_stock : '-'}`;
  if (filterNode) {
    filterNode.value = '';
  }
}

function syncOrderRow(select) {
  const row = select.closest('[data-role="order-row"]');
  const product = productById(select.value);
  if (!row) return;
  const stockNode = row.querySelector('[data-role="stock"]');
  const priceNode = row.querySelector('[data-role="unit_price"]');
  const filterNode = row.querySelector('[data-role="product-filter"]');
  if (stockNode) stockNode.textContent = `Tồn kho: ${product ? product.current_stock : '-'}`;
  if (priceNode && product && !priceNode.value) {
    priceNode.value = product.sale_price || 0;
  }
  if (filterNode) {
    filterNode.value = '';
  }
  updateOrderTotal();
}

function syncAllOrderRows() {
  $('orderRows')?.querySelectorAll('select[data-role="product"]').forEach((sel) => syncOrderRow(sel));
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
    <div id="importRows" class="item-row-scroll"></div>
    <div class="d-flex justify-content-between align-items-center mt-3">
      <div class="text-muted small">Nhập kho không cần tính tiền. Hệ thống sẽ tự cộng tồn kho.</div>
      <div class="fw-bold">Tổng số lượng: <span id="importQtyTotal">0</span></div>
    </div>
  `;
  showFormModal(editing ? 'Sửa phiếu nhập kho' : 'Thêm phiếu nhập kho', body, async () => {
    const rows = [...$('importRows').querySelectorAll('[data-role="import-row"]')].map((row) => ({
      product_id: row.querySelector('[data-role="product"]').value,
      quantity: row.querySelector('[data-role="quantity"]').value,
    }));
    const payload = {
      supplier_id: $('importSupplier').value,
      created_at: $('importDate').value,
      note: $('importNote').value,
      items: rows,
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
    <div id="orderRows" class="item-row-scroll"></div>
    <div class="d-flex justify-content-between align-items-center mt-3">
      <div class="text-muted small">Bán hàng sẽ kiểm tra tồn kho trước khi lưu.</div>
      <div class="fw-bold">Tổng tiền: <span id="orderTotal">0 ₫</span></div>
    </div>
  `;
  showFormModal(editing ? 'Sửa hóa đơn' : 'Tạo hóa đơn', body, async () => {
    const rows = [...$('orderRows').querySelectorAll('[data-role="order-row"]')].map((row) => ({
      product_id: row.querySelector('[data-role="product"]').value,
      quantity: row.querySelector('[data-role="quantity"]').value,
      unit_price: row.querySelector('[data-role="unit_price"]').value,
    }));
    const select = $('orderCustomerSelect');
    const payload = {
      customer_id: select.value || null,
      customer_name: $('orderCustomerName').value.trim(),
      customer_phone: $('orderCustomerPhone').value.trim(),
      customer_address: $('orderCustomerAddress').value.trim(),
      created_at: $('orderDate').value,
      is_paid: $('orderPaid').checked,
      items: rows,
    };
    const url = editing ? `/api/orders/${order.id}` : '/api/orders';
    const method = editing ? 'PUT' : 'POST';
    await api(url, { method, body: JSON.stringify(payload) });
    toast(editing ? 'Đã cập nhật hóa đơn.' : 'Đã tạo hóa đơn.');
    bootstrap.Modal.getOrCreateInstance($('formModal')).hide();
    await loadOrders();
    if (state.page === 'sales') renderSalesPage();
    if (state.page === 'invoices') renderInvoicesPage();
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
        await api(`/api/orders/${id}/pay`, {
          method: 'PUT',
          body: JSON.stringify({ is_paid: paid }),
        });
        toast('Đã cập nhật trạng thái thanh toán.');
        await loadOrders();
        if (state.page === 'invoices') renderInvoicesPage();
        if (state.page === 'sales') renderSalesPage();
        if (state.page === 'dashboard') { state.dashboard = null; await loadDashboard(); renderDashboardPage(); }
        return;
      }
      if (action === 'delete-order') {
        const existing = state.orders.find((x) => String(x.id) === String(id));
        return showConfirmModal('Xóa hóa đơn', `<div>Bạn có chắc chắn muốn xóa <b>${esc(existing?.order_code || '')}</b>?</div>`, async () => {
          await api(`/api/orders/${id}`, { method: 'DELETE', body: '{}' });
          toast('Đã xóa hóa đơn.');
          await loadOrders();
          if (state.page === 'invoices') renderInvoicesPage();
          if (state.page === 'sales') renderSalesPage();
          state.dashboard = null;
        });
      }
      if (action === 'set-invoice-filter') {
        state.invoiceStatus = btn.dataset.value;
        await loadOrders();
        renderInvoicesPage();
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
        window.open(`/api/reports/monthly/pdf?${q.toString()}`, '_blank');
        return;
      }
      if (action === 'download-summary-pdf') {
        window.open('/api/reports/summary/pdf', '_blank');
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
      renderProductPage();
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

async function afterLogin() {
  await Promise.all([loadProducts(), loadSuppliers(), loadCustomers()]);
  renderNav();
  if (state.page === 'products') {
    renderProductPage();
    return;
  }
  await navigate('dashboard');
}

async function boot() {
  renderNav();
  initModalHandlers();
  await fetchMe();
  await loadProducts();
  if (state.user) {
    await Promise.all([loadSuppliers(), loadCustomers()]);
    state.page = 'dashboard';
    renderNav();
    await navigate('dashboard');
  } else {
    state.page = 'products';
    renderNav();
    await navigate('products');
  }
}

window.addImportRow = addImportRow;
window.removeImportRow = removeImportRow;
window.addOrderRow = addOrderRow;
window.removeOrderRow = removeOrderRow;
window.syncImportRow = syncImportRow;
window.syncOrderRow = syncOrderRow;
window.updateImportTotal = updateImportTotal;
window.updateOrderTotal = updateOrderTotal;

boot().catch((err) => {
  console.error(err);
  toast(err.message || 'Ứng dụng gặp lỗi khi khởi động.', 'error');
});



function searchProducts(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];

  const scored = state.products.map((p) => {
    const fields = [
      p.code,
      p.name,
      p.category,
      p.unit,
      p.specification,
      productLabel(p),
    ].map((v) => String(v || '').toLowerCase());

    let score = 0;
    for (const field of fields) {
      if (!field) continue;
      if (field === q) score = Math.max(score, 100);
      else if (field.startsWith(q)) score = Math.max(score, 90);
      else if (field.includes(q)) score = Math.max(score, 70);
    }
    return { p, score };
  }).filter((x) => x.score > 0);

  scored.sort((a, b) => b.score - a.score || String(a.p.code).localeCompare(String(b.p.code), 'vi'));
  return scored.map((x) => x.p);
}

function renderProductPickerMenu(type, query = '') {
  const matches = searchProducts(query).slice(0, 12);
  if (!matches.length) {
    return `<div class="product-search-empty">Không tìm thấy sản phẩm phù hợp.</div>`;
  }
  return matches.map((p) => `
    <button type="button" class="product-search-item" data-id="${p.id}" onclick="pickProductFromMenu(this, '${type}')">
      <div class="fw-semibold">${esc(p.code)} - ${esc(p.name)}</div>
      <div class="small text-muted">${esc(p.category || '—')} • ${esc(p.unit || '—')} • ${esc(p.specification || '—')} • Tồn: ${p.current_stock}</div>
    </button>
  `).join('');
}

function applyProductToRow(row, product, type) {
  if (!row || !product) return;
  const hidden = row.querySelector('[data-role="product"]');
  const input = row.querySelector('[data-role="product_search"]');
  const stockNode = row.querySelector('[data-role="stock"]');
  const priceNode = row.querySelector('[data-role="unit_price"]');
  if (hidden) hidden.value = product.id;
  if (input) input.value = `${product.code} - ${product.name}`;
  if (stockNode) stockNode.textContent = `Tồn kho: ${product.current_stock}`;
  if (type === 'order' && priceNode && (!priceNode.value || Number(priceNode.value) <= 0)) {
    priceNode.value = product.sale_price || 0;
  }
  const menu = row.querySelector('[data-role="product_menu"]');
  if (menu) menu.classList.add('d-none');
  if (type === 'order') updateOrderTotal();
  if (type === 'import') updateImportTotal();
}

function openProductMenu(row, type, query = '') {
  const menu = row.querySelector('[data-role="product_menu"]');
  if (!menu) return;
  const matches = searchProducts(query).slice(0, 12);
  menu.innerHTML = query ? renderProductPickerMenu(type, query) : '';
  menu.classList.toggle('d-none', !query || !matches.length);
}

function syncImportRow(input) {
  const row = input.closest('[data-role="import-row"]');
  if (!row) return;
  const hidden = row.querySelector('[data-role="product"]');
  const stockNode = row.querySelector('[data-role="stock"]');
  const query = String(input.value || '').trim();
  const selected = hidden?.value ? productById(hidden.value) : null;

  if (!query) {
    if (hidden) hidden.value = '';
    if (stockNode) stockNode.textContent = 'Tồn kho: -';
    const menu = row.querySelector('[data-role="product_menu"]');
    if (menu) menu.classList.add('d-none');
    return;
  }

  if (selected) {
    const hay = `${selected.code} ${selected.name} ${selected.category || ''} ${selected.unit || ''} ${selected.specification || ''}`.toLowerCase();
    if (!hay.includes(query.toLowerCase())) {
      if (hidden) hidden.value = '';
      if (stockNode) stockNode.textContent = 'Tồn kho: -';
    } else {
      if (stockNode) stockNode.textContent = `Tồn kho: ${selected.current_stock}`;
    }
  } else if (stockNode) {
    stockNode.textContent = 'Tồn kho: -';
  }

  openProductMenu(row, 'import', query);
}

function syncOrderRow(input) {
  const row = input.closest('[data-role="order-row"]');
  if (!row) return;
  const hidden = row.querySelector('[data-role="product"]');
  const stockNode = row.querySelector('[data-role="stock"]');
  const priceNode = row.querySelector('[data-role="unit_price"]');
  const query = String(input.value || '').trim();
  const selected = hidden?.value ? productById(hidden.value) : null;

  if (!query) {
    if (hidden) hidden.value = '';
    if (stockNode) stockNode.textContent = 'Tồn kho: -';
    const menu = row.querySelector('[data-role="product_menu"]');
    if (menu) menu.classList.add('d-none');
    updateOrderTotal();
    return;
  }

  if (selected) {
    const hay = `${selected.code} ${selected.name} ${selected.category || ''} ${selected.unit || ''} ${selected.specification || ''}`.toLowerCase();
    if (!hay.includes(query.toLowerCase())) {
      if (hidden) hidden.value = '';
      if (stockNode) stockNode.textContent = 'Tồn kho: -';
    } else {
      if (stockNode) stockNode.textContent = `Tồn kho: ${selected.current_stock}`;
      if (priceNode && !priceNode.value) {
        priceNode.value = selected.sale_price || 0;
      }
    }
  } else if (stockNode) {
    stockNode.textContent = 'Tồn kho: -';
  }

  openProductMenu(row, 'order', query);
  updateOrderTotal();
}

function handleProductComboKeydown(input, type, event) {
  const row = input.closest(type === 'import' ? '[data-role="import-row"]' : '[data-role="order-row"]');
  if (!row) return;
  const menu = row.querySelector('[data-role="product_menu"]');
  const items = [...(menu?.querySelectorAll('.product-search-item') || [])];

  if (event.key === 'Escape') {
    if (menu) menu.classList.add('d-none');
    return;
  }

  if (event.key === 'Enter') {
    if (items.length) {
      event.preventDefault();
      items[0].click();
    }
    return;
  }

  if (event.key === 'ArrowDown' && items.length) {
    event.preventDefault();
    items[0].focus();
  }
}

function pickProductFromMenu(btn, type) {
  const row = btn.closest(type === 'import' ? '[data-role="import-row"]' : '[data-role="order-row"]');
  const product = productById(btn.dataset.id);
  if (!row || !product) return;
  applyProductToRow(row, product, type);
}

function syncAllOrderRows() {
  document.querySelectorAll('[data-role="order-row"] [data-role="product_search"]').forEach((input) => syncOrderRow(input));
}

// Replace row templates with searchable combobox inputs.
function importRowHtml(item = {}) {
  const product = productById(item.product_id) || null;
  const value = product ? `${product.code} - ${product.name}` : '';
  return `
    <div class="item-row" data-role="import-row">
      <div class="item-row-grid-import">
        <div class="product-search-wrap">
          <label class="form-label">Sản phẩm</label>
          <input type="hidden" data-role="product" value="${item.product_id || ''}">
          <input type="search" class="form-control product-search-input" data-role="product_search" value="${esc(value)}" placeholder="Gõ mã hoặc tên để lọc, rồi chọn..." autocomplete="off" oninput="syncImportRow(this)" onfocus="syncImportRow(this)" onkeydown="handleProductComboKeydown(this, 'import', event)">
          <div class="product-search-menu d-none" data-role="product_menu"></div>
          <div class="row-note" data-role="stock">Tồn kho: ${product ? product.current_stock : '-'}</div>
        </div>
        <div>
          <label class="form-label">Số lượng</label>
          <input type="number" min="1" class="form-control" data-role="quantity" value="${item.quantity || 1}" oninput="updateImportTotal()">
        </div>
        <div>
          <label class="form-label d-block">&nbsp;</label>
          <button type="button" class="btn btn-outline-danger w-100" onclick="removeImportRow(this)">
            <i class="bi bi-x-lg me-1"></i>Xóa
          </button>
        </div>
      </div>
    </div>
  `;
}

function orderRowHtml(item = {}) {
  const product = productById(item.product_id) || null;
  const value = product ? `${product.code} - ${product.name}` : '';
  const price = item.unit_price ?? product?.sale_price ?? 0;
  return `
    <div class="item-row" data-role="order-row">
      <div class="item-row-grid-order">
        <div class="product-search-wrap">
          <label class="form-label">Sản phẩm</label>
          <input type="hidden" data-role="product" value="${item.product_id || ''}">
          <input type="search" class="form-control product-search-input" data-role="product_search" value="${esc(value)}" placeholder="Gõ mã hoặc tên để lọc, rồi chọn..." autocomplete="off" oninput="syncOrderRow(this)" onfocus="syncOrderRow(this)" onkeydown="handleProductComboKeydown(this, 'order', event)">
          <div class="product-search-menu d-none" data-role="product_menu"></div>
          <div class="row-note" data-role="stock">Tồn kho: ${product ? product.current_stock : '-'}</div>
        </div>
        <div>
          <label class="form-label">Số lượng</label>
          <input type="number" min="1" class="form-control" data-role="quantity" value="${item.quantity || 1}" oninput="updateOrderTotal()">
        </div>
        <div>
          <label class="form-label">Giá bán</label>
          <input type="number" min="0" class="form-control" data-role="unit_price" value="${price}" oninput="updateOrderTotal()">
        </div>
        <div>
          <label class="form-label d-block">&nbsp;</label>
          <button type="button" class="btn btn-outline-danger w-100" onclick="removeOrderRow(this)">
            <i class="bi bi-x-lg me-1"></i>Xóa
          </button>
        </div>
      </div>
    </div>
  `;
}

// Hide menus when clicking outside the picker.
document.addEventListener('click', (e) => {
  if (e.target.closest('.product-search-wrap')) return;
  document.querySelectorAll('.product-search-menu').forEach((menu) => menu.classList.add('d-none'));
});

window.syncImportRow = syncImportRow;
window.syncOrderRow = syncOrderRow;
window.pickProductFromMenu = pickProductFromMenu;
window.handleProductComboKeydown = handleProductComboKeydown;
window.importRowHtml = importRowHtml;
window.orderRowHtml = orderRowHtml;
window.searchProducts = searchProducts;
