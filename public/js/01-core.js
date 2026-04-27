
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
  qlhoadonFilter: {
  customer_id: 'all',
  status: 'all',
  from: '',
  to: '',
  amount_from: '',
  amount_to: '',
  search: '',
},
  invoiceStatus: 'all',
  orderSort: 'newest',
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

let productSearchRenderTimer = null;

function scheduleProductPageRender() {
  clearTimeout(productSearchRenderTimer);
  const keepValue = $('productSearch')?.value || state.productFilters.search || '';
  productSearchRenderTimer = setTimeout(() => {
    if (state.page !== 'products') return;
    renderProductPage();
    const input = $('productSearch');
    if (input) {
      input.value = keepValue;
      input.focus({ preventScroll: true });
      try {
        input.setSelectionRange(keepValue.length, keepValue.length);
      } catch (_) {}
    }
  }, 280);
}

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

function padDate2(num) {
  return String(num).padStart(2, '0');
}

function formatDateValue(value, withTime = false) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const day = padDate2(d.getDate());
  const month = padDate2(d.getMonth() + 1);
  const year = d.getFullYear();
  if (!withTime) return `${day}/${month}/${year}`;
  const hours = padDate2(d.getHours());
  const minutes = padDate2(d.getMinutes());
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function shortDate(value) {
  return formatDateValue(value, false);
}

function fullDate(value) {
  return formatDateValue(value, true);
}

function toInputDate(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${padDate2(now.getMonth() + 1)}-${padDate2(now.getDate())}`;
  }
  return `${d.getFullYear()}-${padDate2(d.getMonth() + 1)}-${padDate2(d.getDate())}`;
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

function userRole() {
  return state.user?.role || null;
}

function isManager() {
  return userRole() === 'manager';
}

function isStaff() {
  return userRole() === 'staff';
}

function managerPages() {
  return ['dashboard', 'products', 'suppliers', 'customers', 'imports', 'sales', 'qlhoadon', 'reports', 'history'];
}

function staffPages() {
  return ['products', 'imports', 'sales', 'qlhoadon', 'reports'];
}

function firstAccessiblePage() {
  if (!state.user) return 'products';
  return isManager() ? 'dashboard' : 'products';
}

function canAccessPage(page) {
  if (!state.user) return page === 'products';
  if (isManager()) return true;
  return staffPages().includes(page);
}

function canWriteProducts() {
  return isManager();
}

function canWriteImports() {
  return Boolean(state.user);
}

function canWriteSales() {
  return Boolean(state.user);
}

function canViewHistory() {
  return isManager();
}

function navItems() {
  if (!state.user) {
    return [
      ['products', 'bi-box-seam', 'Sản phẩm'],
    ];
  }
  if (isManager()) {
    return [
      ['dashboard', 'bi-speedometer2', 'Dashboard'],
      ['products', 'bi-box-seam', 'Sản phẩm'],
      ['suppliers', 'bi-truck', 'Nhà cung ứng'],
      ['customers', 'bi-people', 'Khách hàng'],
      ['imports', 'bi-arrow-down-circle', 'Nhập kho'],
      ['sales', 'bi-cart-check', 'Đơn hàng'],
      ['qlhoadon', 'bi-receipt', 'Quản lý hóa đơn'],
      ['reports', 'bi-bar-chart', 'Báo cáo'],
      ['history', 'bi-clock-history', 'Lịch sử'],
    ];
  }
  return [
    ['products', 'bi-box-seam', 'Sản phẩm'],
    ['imports', 'bi-arrow-down-circle', 'Nhập kho'],
    ['sales', 'bi-cart-check', 'Đơn hàng'],
    ['qlhoadon', 'bi-receipt', 'Quản lý hóa đơn'],
    ['reports', 'bi-bar-chart', 'Báo cáo'],
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
    ? `Xin chào, ${esc(state.user.full_name || state.user.username)} (${isManager() ? 'Quản lý' : 'Nhân viên'})`
    : 'Chưa đăng nhập';
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

