
const state = {
  user: null,
  page: 'dashboard',
  products: [],
  suppliers: [],
  customers: [],
  imports: [],
  orders: [],
  reports: null,
  reportProducts: null,
  dashboard: null,
  productSearch: '',
  invoiceFilter: 'all',
  reportsMonth: new Date().getMonth() + 1,
  reportsYear: new Date().getFullYear(),
  productsSearch: '',
  editingOrder: null,
  charts: {},
};

const pages = {
  dashboard: { title: 'Dashboard', subtitle: 'Tổng quan hệ thống' },
  products: { title: 'Sản phẩm', subtitle: 'Quản lý danh mục và tồn kho' },
  suppliers: { title: 'Nhà cung ứng', subtitle: 'Danh sách nhà cung ứng' },
  customers: { title: 'Khách hàng', subtitle: 'Danh sách khách hàng' },
  imports: { title: 'Nhập kho', subtitle: 'Lịch sử nhập kho theo ngày' },
  sales: { title: 'Bán hàng', subtitle: 'Tạo đơn xuất bán hàng' },
  invoices: { title: 'Hóa đơn', subtitle: 'Danh sách và trạng thái thanh toán' },
  reports: { title: 'Báo cáo / Thống kê', subtitle: 'Thống kê tháng và sản phẩm' },
};

const el = (id) => document.getElementById(id);
const fmtMoney = (value) => new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + ' ₫';
const fmtDate = (value) => value ? new Date(value).toLocaleString('vi-VN') : '';
const fmtDateShort = (value) => value ? new Date(value).toLocaleDateString('vi-VN') : '';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const toastBox = el('toastContainer');

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'Có lỗi xảy ra.');
  }
  return data;
}

function showToast(message, type = 'success') {
  const id = `toast-${Date.now()}`;
  const item = document.createElement('div');
  item.className = 'toast align-items-center';
  item.id = id;
  item.role = 'alert';
  item.ariaLive = 'assertive';
  item.ariaAtomic = 'true';
  item.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <strong class="me-1">${type === 'success' ? 'Thành công' : 'Thông báo'}:</strong>${esc(message)}
      </div>
      <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;
  toastBox.appendChild(item);
  const toast = new bootstrap.Toast(item, { delay: 2600 });
  toast.show();
  item.addEventListener('hidden.bs.toast', () => item.remove());
}

function setPageMeta(page) {
  const meta = pages[page] || pages.dashboard;
  el('pageTitle').textContent = meta.title;
  el('pageSubtitle').textContent = meta.subtitle;
}

function isManager() {
  return !!state.user;
}

function navMarkup() {
  const links = [
    ['dashboard', 'bi-speedometer2', 'Dashboard'],
    ['products', 'bi-box-seam', 'Sản phẩm'],
    ['suppliers', 'bi-truck', 'Nhà cung ứng'],
    ['customers', 'bi-people', 'Khách hàng'],
    ['imports', 'bi-arrow-down-circle', 'Nhập kho'],
    ['sales', 'bi-cart-check', 'Bán hàng'],
    ['invoices', 'bi-receipt', 'Hóa đơn'],
    ['reports', 'bi-bar-chart', 'Báo cáo'],
  ];
  return links
    .filter(([page]) => page === 'dashboard' || isManager() || page === 'products')
    .map(([page, icon, label]) => `
      <a href="#" class="nav-link ${state.page === page ? 'active' : ''}" data-page="${page}">
        <i class="bi ${icon}"></i><span>${label}</span>
      </a>
    `).join('');
}

function renderNav() {
  el('desktopNav').innerHTML = navMarkup();
  el('mobileNav').innerHTML = navMarkup();
  document.querySelectorAll('[data-page]').forEach((node) => {
    node.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(node.dataset.page);
      const sidebar = bootstrap.Offcanvas.getInstance(el('mobileSidebar'));
      if (sidebar) sidebar.hide();
    });
  });
}

function syncAuthUi() {
  const btnLogin = el('btnLogin');
  const btnLogout = el('btnLogout');
  const banner = el('publicBanner');
  if (state.user) {
    btnLogin.classList.add('d-none');
    btnLogout.classList.remove('d-none');
    banner.classList.add('d-none');
    el('desktopUserBox').textContent = `Xin chào, ${state.user.full_name || state.user.username}`;
    el('mobileUserBox').textContent = `Xin chào, ${state.user.full_name || state.user.username}`;
  } else {
    btnLogin.classList.remove('d-none');
    btnLogout.classList.add('d-none');
    banner.classList.remove('d-none');
    el('desktopUserBox').textContent = 'Chưa đăng nhập quản lý';
    el('mobileUserBox').textContent = 'Chưa đăng nhập quản lý';
  }
  renderNav();
}

function navigate(page) {
  state.page = page;
  setPageMeta(page);
  document.querySelectorAll('.page-section').forEach((sec) => sec.classList.add('d-none'));
  el(`${page}Page`).classList.remove('d-none');
  renderNav();
  routeRender(page);
}

function routeRender(page) {
  if (page === 'dashboard') renderDashboard();
  if (page === 'products') renderProducts();
  if (page === 'suppliers') renderSuppliers();
  if (page === 'customers') renderCustomers();
  if (page === 'imports') renderImports();
  if (page === 'sales') renderSales();
  if (page === 'invoices') renderInvoices();
  if (page === 'reports') renderReports();
}

function dashboardCards(data) {
  const s = data.summary || {};
  return `
    <div class="summary-grid mb-4">
      ${statCard('Đơn hàng tháng này', s.total_orders ?? 0, 'bi-receipt')}
      ${statCard('Doanh thu', fmtMoney(s.total_revenue ?? 0), 'bi-cash-stack')}
      ${statCard('Đã thu', fmtMoney(s.total_paid ?? 0), 'bi-wallet2')}
      ${statCard('Chưa thu', fmtMoney(s.total_unpaid ?? 0), 'bi-hourglass-split')}
      ${statCard('Nhập kho', s.total_import_quantity ?? 0, 'bi-arrow-down-circle')}
      ${statCard('Bán ra', s.total_sold_quantity ?? 0, 'bi-cart-check')}
      ${statCard('Tổng sản phẩm', s.total_products ?? 0, 'bi-box-seam')}
      ${statCard('Tồn kho', s.total_stock ?? 0, 'bi-stack')}
    </div>
  `;
}

function statCard(label, value, icon) {
  return `
    <div class="stat-card">
      <div class="d-flex align-items-center justify-content-between gap-2">
        <div class="stat-label">${label}</div>
        <div class="badge badge-soft rounded-pill"><i class="bi ${icon}"></i></div>
      </div>
      <div class="stat-value">${value}</div>
      <div class="stat-foot">Dữ liệu đồng bộ từ Neon PostgreSQL</div>
    </div>
  `;
}

function renderDashboard() {
  if (!isManager()) {
    el('dashboardPage').innerHTML = `
      <div class="panel">
        <div class="section-head">
          <div>
            <h2>Tra cứu sản phẩm</h2>
            <div class="muted">Người xem có thể tìm kiếm sản phẩm mà không cần đăng nhập.</div>
          </div>
        </div>
        <div class="row g-3 align-items-end mb-3">
          <div class="col-12 col-md-6">
            <label class="form-label">Tìm kiếm</label>
            <input class="form-control" id="publicProductSearch" placeholder="Nhập mã hoặc tên sản phẩm">
          </div>
          <div class="col-12 col-md-3">
            <button class="btn btn-pink w-100" id="btnSearchPublic"><i class="bi bi-search me-1"></i>Tìm kiếm</button>
          </div>
        </div>
        <div id="publicProductList"></div>
      </div>
    `;
    el('btnSearchPublic').addEventListener('click', () => {
      state.productsSearch = el('publicProductSearch').value.trim();
      loadProducts().then(() => renderPublicProducts());
    });
    el('publicProductSearch').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        state.productsSearch = e.target.value.trim();
        loadProducts().then(() => renderPublicProducts());
      }
    });
    renderPublicProducts();
    return;
  }

  el('dashboardPage').innerHTML = `
    <div id="dashboardSummary"></div>
    <div class="cards-2 mb-4">
      <div class="panel">
        <div class="section-head">
          <div>
            <h2>Nhóm sản phẩm tồn nhiều</h2>
            <div class="muted">5 sản phẩm có tồn kho cao nhất hiện tại</div>
          </div>
        </div>
        <div id="dashboardProducts"></div>
      </div>
      <div class="panel">
        <div class="section-head">
          <div>
            <h2>Hóa đơn gần đây</h2>
            <div class="muted">5 đơn hàng mới nhất</div>
          </div>
        </div>
        <div id="dashboardOrders"></div>
      </div>
    </div>
  `;
  if (!state.dashboard) {
    loadDashboard();
  } else {
    fillDashboard();
  }
}

async function loadDashboard() {
  try {
    const data = await api('/api/dashboard');
    state.dashboard = data;
    fillDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function fillDashboard() {
  const data = state.dashboard || {};
  el('dashboardSummary').innerHTML = dashboardCards(data);
  const products = data.latest_products || [];
  el('dashboardProducts').innerHTML = products.length ? `
    <div class="list-group">
      ${products.map(p => `
        <div class="list-group-item d-flex justify-content-between align-items-center border-0 px-0 py-3">
          <div>
            <div class="fw-semibold">${esc(p.name)}</div>
            <div class="text-muted small">${esc(p.code)}</div>
          </div>
          <div class="text-end">
            <div class="fw-semibold">${p.current_stock}</div>
            <div class="small text-muted">${fmtMoney(p.sale_price)}</div>
          </div>
        </div>
      `).join('')}
    </div>` : '<div class="text-muted">Chưa có dữ liệu.</div>';
  const orders = data.latest_orders || [];
  el('dashboardOrders').innerHTML = orders.length ? `
    <div class="list-group">
      ${orders.map(o => `
        <div class="list-group-item d-flex justify-content-between align-items-center border-0 px-0 py-3">
          <div>
            <div class="fw-semibold">${esc(o.order_code)}</div>
            <div class="text-muted small">${esc(o.customer_name)} • ${fmtDateShort(o.created_at)}</div>
          </div>
          <div class="text-end">
            <div class="fw-semibold">${fmtMoney(o.total_amount)}</div>
            <span class="badge ${o.is_paid ? 'text-bg-success' : 'text-bg-warning'}">${o.is_paid ? 'Đã trả' : 'Chưa trả'}</span>
          </div>
        </div>
      `).join('')}
    </div>` : '<div class="text-muted">Chưa có hóa đơn.</div>';
}

function renderPublicProducts() {
  const list = state.products || [];
  const q = (state.productsSearch || '').toLowerCase();
  const filtered = list.filter((p) => `${p.code} ${p.name} ${p.supplier_name}`.toLowerCase().includes(q));
  el('publicProductList').innerHTML = filtered.length ? `
    <div class="desktop-table table-wrap">
      <table class="table align-middle">
        <thead>
          <tr>
            <th>Mã SP</th>
            <th>Tên sản phẩm</th>
            <th>Nhà cung ứng</th>
            <th class="text-end">Giá bán</th>
            <th class="text-end">Tồn kho</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(p => `
            <tr>
              <td>${esc(p.code)}</td>
              <td>${esc(p.name)}</td>
              <td>${esc(p.supplier_name || '-')}</td>
              <td class="text-end">${fmtMoney(p.sale_price)}</td>
              <td class="text-end">${p.current_stock}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="mobile-list">
      ${filtered.map(p => `
        <div class="mobile-item">
          <div class="mobile-item-grid">
            <div>
              <div class="mobile-item-title">${esc(p.name)}</div>
              <div class="mobile-item-sub">${esc(p.code)} • ${esc(p.supplier_name || '-')}</div>
            </div>
            <div class="text-end">
              <div class="fw-semibold">${fmtMoney(p.sale_price)}</div>
              <div class="mobile-item-sub">Tồn: ${p.current_stock}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  ` : `<div class="text-muted">Không tìm thấy sản phẩm phù hợp.</div>`;
}

function renderProducts() {
  const canEdit = isManager();
  const items = state.products || [];
  const q = (el('productSearch')?.value || state.productsSearch || '').toLowerCase();
  const filtered = items.filter((p) => `${p.code} ${p.name} ${p.supplier_name}`.toLowerCase().includes(q));
  el('productsPage').innerHTML = `
    <div class="panel">
      <div class="section-head">
        <div>
          <h2>Danh sách sản phẩm</h2>
          <div class="muted">Người thường chỉ xem và tìm kiếm, quản lý có thêm quyền CRUD.</div>
        </div>
        ${canEdit ? `<button class="btn btn-pink" id="btnAddProduct"><i class="bi bi-plus-lg me-1"></i>Thêm sản phẩm</button>` : ''}
      </div>
      <div class="row g-3 align-items-end mb-3">
        <div class="col-12 col-md-5">
          <label class="form-label">Tìm kiếm sản phẩm</label>
          <input class="form-control" id="productSearch" value="${esc(q)}" placeholder="Nhập mã, tên, nhà cung ứng">
        </div>
      </div>
      <div id="productListArea"></div>
    </div>
  `;
  el('productSearch').addEventListener('input', () => renderProducts());
  if (canEdit) {
    el('btnAddProduct').addEventListener('click', () => openProductModal());
  }
  const tableRows = filtered.map((p, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${esc(p.code)}</td>
      <td>${esc(p.name)}</td>
      <td class="text-end">${fmtMoney(p.sale_price)}</td>
      <td class="text-end">${p.current_stock}</td>
      <td>${esc(p.supplier_name || '-')}</td>
      ${canEdit ? `
      <td>
        <div class="table-actions">
          <button class="btn btn-sm btn-outline-primary" data-edit-product="${p.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-delete-product="${p.id}"><i class="bi bi-trash"></i></button>
        </div>
      </td>` : ''}
    </tr>
  `).join('');

  el('productListArea').innerHTML = `
    <div class="desktop-table table-wrap">
      <table class="table align-middle table-hover">
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã SP</th>
            <th>Tên sản phẩm</th>
            <th class="text-end">Giá bán</th>
            <th class="text-end">Tồn kho</th>
            <th>Nhà cung ứng</th>
            ${canEdit ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${tableRows || `<tr><td colspan="${canEdit ? 7 : 6}" class="text-center text-muted py-4">Không có dữ liệu</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="mobile-list">
      ${filtered.map((p) => `
        <div class="mobile-item">
          <div class="mobile-item-grid">
            <div>
              <div class="mobile-item-title">${esc(p.name)}</div>
              <div class="mobile-item-sub">${esc(p.code)} • ${esc(p.supplier_name || '-')}</div>
              <div class="mobile-item-sub">Tồn: ${p.current_stock}</div>
            </div>
            <div class="text-end">
              <div class="fw-semibold">${fmtMoney(p.sale_price)}</div>
              ${canEdit ? `
                <div class="mt-2 d-flex gap-2 justify-content-end">
                  <button class="btn btn-sm btn-outline-primary" data-edit-product="${p.id}"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" data-delete-product="${p.id}"><i class="bi bi-trash"></i></button>
                </div>` : ''}
            </div>
          </div>
        </div>
      `).join('') || '<div class="text-muted">Không có dữ liệu</div>'}
    </div>
  `;

  document.querySelectorAll('[data-edit-product]').forEach((btn) => btn.addEventListener('click', () => openProductModal(filtered.find((x) => String(x.id) === btn.dataset.editProduct))));
  document.querySelectorAll('[data-delete-product]').forEach((btn) => btn.addEventListener('click', () => confirmDelete('product', filtered.find((x) => String(x.id) === btn.dataset.deleteProduct))));
}

function renderSuppliers() {
  const items = state.suppliers || [];
  const canEdit = isManager();
  el('suppliersPage').innerHTML = `
    <div class="panel">
      <div class="section-head">
        <div>
          <h2>Nhà cung ứng</h2>
          <div class="muted">Quản lý danh sách nhà cung ứng đầu vào.</div>
        </div>
        ${canEdit ? `<button class="btn btn-pink" id="btnAddSupplier"><i class="bi bi-plus-lg me-1"></i>Thêm nhà cung ứng</button>` : ''}
      </div>
      <div id="supplierListArea"></div>
    </div>
  `;
  if (canEdit) el('btnAddSupplier').addEventListener('click', () => openSupplierModal());
  el('supplierListArea').innerHTML = `
    <div class="desktop-table table-wrap">
      <table class="table align-middle table-hover">
        <thead><tr><th>STT</th><th>Tên</th><th>SĐT</th><th>Địa chỉ</th>${canEdit ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${items.map((s, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${esc(s.name)}</td>
              <td>${esc(s.phone || '-')}</td>
              <td>${esc(s.address || '-')}</td>
              ${canEdit ? `<td>
                <div class="table-actions">
                  <button class="btn btn-sm btn-outline-primary" data-edit-supplier="${s.id}"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" data-delete-supplier="${s.id}"><i class="bi bi-trash"></i></button>
                </div>
              </td>` : ''}
            </tr>
          `).join('') || `<tr><td colspan="${canEdit ? 5 : 4}" class="text-center text-muted py-4">Không có dữ liệu</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="mobile-list">
      ${items.map((s) => `
        <div class="mobile-item">
          <div class="mobile-item-grid">
            <div>
              <div class="mobile-item-title">${esc(s.name)}</div>
              <div class="mobile-item-sub">${esc(s.phone || '-')}</div>
              <div class="mobile-item-sub">${esc(s.address || '-')}</div>
            </div>
            ${canEdit ? `
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-primary" data-edit-supplier="${s.id}"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger" data-delete-supplier="${s.id}"><i class="bi bi-trash"></i></button>
            </div>` : ''}
          </div>
        </div>
      `).join('') || '<div class="text-muted">Không có dữ liệu</div>'}
    </div>
  `;
  document.querySelectorAll('[data-edit-supplier]').forEach((btn) => btn.addEventListener('click', () => openSupplierModal(items.find((x) => String(x.id) === btn.dataset.editSupplier))));
  document.querySelectorAll('[data-delete-supplier]').forEach((btn) => btn.addEventListener('click', () => confirmDelete('supplier', items.find((x) => String(x.id) === btn.dataset.deleteSupplier))));
}

function renderCustomers() {
  const items = state.customers || [];
  const canEdit = isManager();
  el('customersPage').innerHTML = `
    <div class="panel">
      <div class="section-head">
        <div>
          <h2>Khách hàng</h2>
          <div class="muted">Lưu khách hàng có sẵn hoặc khách lẻ để dùng cho hóa đơn.</div>
        </div>
        ${canEdit ? `<button class="btn btn-pink" id="btnAddCustomer"><i class="bi bi-plus-lg me-1"></i>Thêm khách hàng</button>` : ''}
      </div>
      <div id="customerListArea"></div>
    </div>
  `;
  if (canEdit) el('btnAddCustomer').addEventListener('click', () => openCustomerModal());
  el('customerListArea').innerHTML = `
    <div class="desktop-table table-wrap">
      <table class="table align-middle table-hover">
        <thead><tr><th>STT</th><th>Tên</th><th>SĐT</th><th>Địa chỉ</th><th>Loại</th>${canEdit ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${items.map((c, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${esc(c.name)}</td>
              <td>${esc(c.phone || '-')}</td>
              <td>${esc(c.address || '-')}</td>
              <td><span class="badge ${c.is_walk_in ? 'text-bg-secondary' : 'text-bg-info'}">${c.is_walk_in ? 'Khách lẻ' : 'Khách thường'}</span></td>
              ${canEdit ? `<td>
                <div class="table-actions">
                  <button class="btn btn-sm btn-outline-primary" data-edit-customer="${c.id}"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" data-delete-customer="${c.id}"><i class="bi bi-trash"></i></button>
                </div>
              </td>` : ''}
            </tr>
          `).join('') || `<tr><td colspan="${canEdit ? 6 : 5}" class="text-center text-muted py-4">Không có dữ liệu</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="mobile-list">
      ${items.map((c) => `
        <div class="mobile-item">
          <div class="mobile-item-grid">
            <div>
              <div class="mobile-item-title">${esc(c.name)}</div>
              <div class="mobile-item-sub">${esc(c.phone || '-')}</div>
              <div class="mobile-item-sub">${esc(c.address || '-')}</div>
              <div class="mobile-item-sub">${c.is_walk_in ? 'Khách lẻ' : 'Khách thường'}</div>
            </div>
            ${canEdit ? `
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-primary" data-edit-customer="${c.id}"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger" data-delete-customer="${c.id}"><i class="bi bi-trash"></i></button>
            </div>` : ''}
          </div>
        </div>
      `).join('') || '<div class="text-muted">Không có dữ liệu</div>'}
    </div>
  `;
  document.querySelectorAll('[data-edit-customer]').forEach((btn) => btn.addEventListener('click', () => openCustomerModal(items.find((x) => String(x.id) === btn.dataset.editCustomer))));
  document.querySelectorAll('[data-delete-customer]').forEach((btn) => btn.addEventListener('click', () => confirmDelete('customer', items.find((x) => String(x.id) === btn.dataset.deleteCustomer))));
}

function renderImports() {
  const items = state.imports || [];
  el('importsPage').innerHTML = `
    <div class="panel">
      <div class="section-head">
        <div>
          <h2>Nhập kho</h2>
          <div class="muted">Ghi nhận nhập hàng, không tính tiền, tự động cộng tồn kho.</div>
        </div>
        <button class="btn btn-pink" id="btnAddImport"><i class="bi bi-plus-lg me-1"></i>Nhập kho mới</button>
      </div>
      <div id="importListArea"></div>
    </div>
  `;
  el('btnAddImport').addEventListener('click', () => openImportModal());
  el('importListArea').innerHTML = `
    <div class="desktop-table table-wrap">
      <table class="table align-middle table-hover">
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã phiếu</th>
            <th>Nhà cung ứng</th>
            <th>Số lượng</th>
            <th>Ngày nhập</th>
            <th>Ghi chú</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${items.map((i, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${esc(i.import_code)}</td>
              <td>${esc(i.supplier_name)}</td>
              <td>${i.total_quantity}</td>
              <td>${fmtDate(i.created_at)}</td>
              <td>${esc(i.note || '-')}</td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-sm btn-outline-primary" data-edit-import="${i.id}"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" data-delete-import="${i.id}"><i class="bi bi-trash"></i></button>
                </div>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="7" class="text-center text-muted py-4">Chưa có phiếu nhập.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="mobile-list">
      ${items.map((i) => `
        <div class="mobile-item">
          <div class="mobile-item-grid">
            <div>
              <div class="mobile-item-title">${esc(i.import_code)}</div>
              <div class="mobile-item-sub">${esc(i.supplier_name)}</div>
              <div class="mobile-item-sub">${fmtDate(i.created_at)}</div>
              <div class="mobile-item-sub">${esc(i.note || '-')}</div>
            </div>
            <div class="text-end">
              <div class="fw-semibold">${i.total_quantity}</div>
              <div class="d-flex gap-2 justify-content-end mt-2">
                <button class="btn btn-sm btn-outline-primary" data-edit-import="${i.id}"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger" data-delete-import="${i.id}"><i class="bi bi-trash"></i></button>
              </div>
            </div>
          </div>
        </div>
      `).join('') || '<div class="text-muted">Chưa có phiếu nhập.</div>'}
    </div>
  `;
  document.querySelectorAll('[data-edit-import]').forEach((btn) => btn.addEventListener('click', () => openImportEdit(btn.dataset.editImport)));
  document.querySelectorAll('[data-delete-import]').forEach((btn) => btn.addEventListener('click', () => confirmDeleteImport(items.find((x) => String(x.id) === btn.dataset.deleteImport))));
}


function renderSales() {
  const editing = state.editingOrder;
  el('salesPage').innerHTML = `
    <div class="panel">
      <div class="section-head">
        <div>
          <h2>Bán hàng</h2>
          <div class="muted">Mỗi đơn có thể gồm nhiều sản phẩm, tự kiểm tra tồn kho trước khi lưu.</div>
        </div>
      </div>
      ${editing ? `
        <div class="alert alert-info d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <div class="fw-semibold">Đang sửa hóa đơn ${esc(editing.order_code)}</div>
            <div class="small">Bạn có thể chỉnh khách hàng, số lượng và giá bán rồi lưu lại.</div>
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm" id="btnCancelEditOrder"><i class="bi bi-x-lg me-1"></i>Hủy chỉnh sửa</button>
        </div>
      ` : ''}
      <div id="salesFormArea"></div>
    </div>
  `;
  el('salesFormArea').innerHTML = salesFormHtml(editing);
  bindSalesForm(editing);
  const cancelBtn = el('btnCancelEditOrder');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      state.editingOrder = null;
      renderSales();
    });
  }
}


function renderInvoices() {
  if (!isManager()) {
    el('invoicesPage').innerHTML = `
      <div class="panel">
        <div class="alert alert-warning mb-0">Bạn cần đăng nhập tài khoản quản lý để xem hóa đơn.</div>
      </div>
    `;
    return;
  }

  const items = state.orders || [];
  const filter = state.invoiceFilter || 'all';
  const titleMap = {
    all: 'Tất cả',
    paid: 'Đã trả tiền',
    unpaid: 'Chưa trả tiền',
  };

  el('invoicesPage').innerHTML = `
    <div class="panel">
      <div class="section-head">
        <div>
          <h2>Hóa đơn</h2>
          <div class="muted">Lọc trạng thái, xem chi tiết và cập nhật thanh toán.</div>
        </div>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <select class="form-select form-select-sm" id="invoiceFilterSelect" style="min-width: 190px">
            <option value="all">Tất cả</option>
            <option value="paid">Đã trả tiền</option>
            <option value="unpaid">Chưa trả tiền</option>
          </select>
          <button class="btn btn-soft btn-sm" id="btnReloadInvoices"><i class="bi bi-arrow-clockwise me-1"></i>Tải lại</button>
        </div>
      </div>
      <div class="mb-3 d-flex flex-wrap gap-2 align-items-center">
        <span class="badge badge-soft rounded-pill">Đang xem: ${titleMap[filter] || 'Tất cả'}</span>
        <span class="text-muted small">${items.length} hóa đơn</span>
      </div>
      <div id="invoiceListArea"></div>
    </div>
  `;

  el('invoiceFilterSelect').value = filter;
  el('invoiceFilterSelect').addEventListener('change', async (e) => {
    state.invoiceFilter = e.target.value;
    await loadOrders();
    renderInvoices();
  });

  el('btnReloadInvoices').addEventListener('click', async () => {
    await loadOrders();
    renderInvoices();
    showToast('Đã tải lại hóa đơn.');
  });

  const rows = items.map((o, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${esc(o.order_code)}</td>
      <td>${esc(o.customer_name || '-')}</td>
      <td class="text-end">${fmtMoney(o.total_amount)}</td>
      <td><span class="badge ${o.is_paid ? 'text-bg-success' : 'text-bg-warning'}">${o.is_paid ? 'Đã trả tiền' : 'Chưa trả tiền'}</span></td>
      <td>${fmtDate(o.created_at)}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-sm btn-outline-primary" data-view-order="${o.id}"><i class="bi bi-eye"></i></button>
          ${!o.is_paid ? `<button class="btn btn-sm btn-outline-success" data-pay-order="${o.id}"><i class="bi bi-credit-card"></i></button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  el('invoiceListArea').innerHTML = `
    <div class="desktop-table table-wrap">
      <table class="table align-middle table-hover">
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã hóa đơn</th>
            <th>Khách hàng</th>
            <th class="text-end">Tổng tiền</th>
            <th>Thanh toán</th>
            <th>Ngày tạo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="7" class="text-center text-muted py-4">Chưa có hóa đơn.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="mobile-list">
      ${items.map((o) => `
        <div class="mobile-item">
          <div class="mobile-item-grid">
            <div>
              <div class="mobile-item-title">${esc(o.order_code)}</div>
              <div class="mobile-item-sub">${esc(o.customer_name || '-')}</div>
              <div class="mobile-item-sub">${fmtDateShort(o.created_at)}</div>
              <div class="mobile-item-sub"><span class="badge ${o.is_paid ? 'text-bg-success' : 'text-bg-warning'}">${o.is_paid ? 'Đã trả tiền' : 'Chưa trả tiền'}</span></div>
            </div>
            <div class="text-end">
              <div class="fw-semibold">${fmtMoney(o.total_amount)}</div>
              <div class="d-flex gap-2 justify-content-end mt-2 flex-wrap">
                <button class="btn btn-sm btn-outline-primary" data-view-order="${o.id}"><i class="bi bi-eye"></i></button>
                ${!o.is_paid ? `<button class="btn btn-sm btn-outline-success" data-pay-order="${o.id}"><i class="bi bi-credit-card"></i></button>` : ''}
              </div>
            </div>
          </div>
        </div>
      `).join('') || '<div class="text-muted">Chưa có hóa đơn.</div>'}
    </div>
  `;

  document.querySelectorAll('[data-view-order]').forEach((btn) => btn.addEventListener('click', () => openOrderDetail(Number(btn.dataset.viewOrder))));
  document.querySelectorAll('[data-pay-order]').forEach((btn) => btn.addEventListener('click', () => confirmPay(Number(btn.dataset.payOrder), items.find((x) => String(x.id) === btn.dataset.payOrder)?.order_code || '')));
}

function openPdf(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    state.charts[key] = null;
  }
}

function renderReportsChart(items = []) {
  const canvas = document.getElementById('reportChart');
  if (!canvas || typeof Chart === 'undefined') return;

  destroyChart('reportsChart');

  const top = (items || []).slice(0, 8);
  state.charts.reportsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: top.map((item) => item.name),
      datasets: [
        {
          label: 'Đã bán',
          data: top.map((item) => item.sold_quantity || 0),
        },
        {
          label: 'Tồn cuối kỳ',
          data: top.map((item) => item.ending_stock || 0),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

function renderReports() {
  if (!isManager()) {
    el('reportsPage').innerHTML = `
      <div class="panel">
        <div class="alert alert-warning mb-0">Bạn cần đăng nhập tài khoản quản lý để xem báo cáo.</div>
      </div>
    `;
    return;
  }

  const r = state.reports?.report || {};
  const items = state.reportProducts?.items || [];
  const month = String(state.reportsMonth).padStart(2, '0');
  const year = state.reportsYear;

  el('reportsPage').innerHTML = `
    <div class="panel mb-4">
      <div class="section-head">
        <div>
          <h2>Báo cáo / Thống kê</h2>
          <div class="muted">Lọc theo tháng/năm, xem chart, và xuất PDF nhanh.</div>
        </div>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <button class="btn btn-soft btn-sm" id="btnReloadReports"><i class="bi bi-arrow-clockwise me-1"></i>Tải lại</button>
          <button class="btn btn-outline-primary btn-sm" id="btnPdfMonthly"><i class="bi bi-file-earmark-pdf me-1"></i>PDF tháng</button>
          <button class="btn btn-outline-primary btn-sm" id="btnPdfSummary"><i class="bi bi-file-earmark-pdf me-1"></i>PDF tổng quan</button>
        </div>
      </div>
      <div class="row g-3 align-items-end mb-3">
        <div class="col-6 col-md-2">
          <label class="form-label">Tháng</label>
          <input type="number" min="1" max="12" class="form-control" id="reportMonth" value="${month}">
        </div>
        <div class="col-6 col-md-2">
          <label class="form-label">Năm</label>
          <input type="number" min="2000" max="2100" class="form-control" id="reportYear" value="${year}">
        </div>
      </div>
      <div class="summary-grid mb-4">
        ${statCard('Tổng đơn hàng', r.total_orders ?? 0, 'bi-receipt')}
        ${statCard('Doanh thu', fmtMoney(r.total_revenue ?? 0), 'bi-cash-stack')}
        ${statCard('Đã thu', fmtMoney(r.total_paid ?? 0), 'bi-wallet2')}
        ${statCard('Chưa thu', fmtMoney(r.total_unpaid ?? 0), 'bi-hourglass-split')}
        ${statCard('Tổng nhập kho', r.total_import_quantity ?? 0, 'bi-arrow-down-circle')}
        ${statCard('Tổng bán ra', r.total_sold_quantity ?? 0, 'bi-cart-check')}
        ${statCard('Tồn cuối kỳ', r.ending_stock ?? 0, 'bi-stack')}
        ${statCard('Số sản phẩm', items.length, 'bi-box-seam')}
      </div>
      <div class="cards-2 mb-4">
        <div class="card-soft">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div>
              <div class="fw-semibold">Biểu đồ sản phẩm</div>
              <div class="text-muted small">Top 8 sản phẩm theo số lượng bán và tồn cuối kỳ</div>
            </div>
          </div>
          <div style="min-height: 320px">
            <canvas id="reportChart"></canvas>
          </div>
        </div>
        <div class="card-soft">
          <div class="fw-semibold mb-2">Top thống kê</div>
          <div class="vstack gap-3">
            <div>
              <div class="text-muted small">Bán nhiều nhất</div>
              <div class="fw-semibold">${esc(state.reportProducts?.top_selling?.name || '-')}</div>
              <div class="small text-muted">${state.reportProducts?.top_selling ? `${esc(state.reportProducts.top_selling.code)} • ${state.reportProducts.top_selling.sold_quantity} đã bán` : 'Chưa có dữ liệu'}</div>
            </div>
            <div>
              <div class="text-muted small">Tồn nhiều nhất</div>
              <div class="fw-semibold">${esc(state.reportProducts?.top_stock?.name || '-')}</div>
              <div class="small text-muted">${state.reportProducts?.top_stock ? `${esc(state.reportProducts.top_stock.code)} • ${state.reportProducts.top_stock.ending_stock} tồn` : 'Chưa có dữ liệu'}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="table-wrap desktop-table">
        <table class="table align-middle table-hover">
          <thead>
            <tr>
              <th>Mã SP</th>
              <th>Tên sản phẩm</th>
              <th class="text-end">Đã bán</th>
              <th class="text-end">Tồn cuối kỳ</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((p) => `
              <tr>
                <td>${esc(p.code)}</td>
                <td>${esc(p.name)}</td>
                <td class="text-end">${p.sold_quantity ?? 0}</td>
                <td class="text-end">${p.ending_stock ?? 0}</td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center text-muted py-4">Chưa có dữ liệu.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="mobile-list">
        ${items.map((p) => `
          <div class="mobile-item">
            <div class="mobile-item-grid">
              <div>
                <div class="mobile-item-title">${esc(p.name)}</div>
                <div class="mobile-item-sub">${esc(p.code)}</div>
              </div>
              <div class="text-end">
                <div class="fw-semibold">Đã bán: ${p.sold_quantity ?? 0}</div>
                <div class="mobile-item-sub">Tồn: ${p.ending_stock ?? 0}</div>
              </div>
            </div>
          </div>
        `).join('') || '<div class="text-muted">Chưa có dữ liệu.</div>'}
      </div>
    </div>
  `;

  el('btnReloadReports').addEventListener('click', async () => {
    state.reportsMonth = Number(el('reportMonth').value || month);
    state.reportsYear = Number(el('reportYear').value || year);
    await loadReports();
    renderReports();
    showToast('Đã tải lại báo cáo.');
  });

  el('reportMonth').addEventListener('change', async () => {
    state.reportsMonth = Number(el('reportMonth').value || month);
    state.reportsYear = Number(el('reportYear').value || year);
    await loadReports();
    renderReports();
  });
  el('reportYear').addEventListener('change', async () => {
    state.reportsMonth = Number(el('reportMonth').value || month);
    state.reportsYear = Number(el('reportYear').value || year);
    await loadReports();
    renderReports();
  });

  el('btnPdfMonthly').addEventListener('click', () => {
    const m = String(state.reportsMonth).padStart(2, '0');
    openPdf(`/api/reports/monthly/pdf?month=${m}&year=${state.reportsYear}`);
  });
  el('btnPdfSummary').addEventListener('click', () => {
    openPdf('/api/reports/summary/pdf');
  });

  renderReportsChart(items);
}

function salesFormHtml(editingOrder = null) {
  const customerOptions = (state.customers || []).map(c => `<option value="${c.id}">${esc(c.name)}${c.phone ? ' - ' + esc(c.phone) : ''}</option>`).join('');
  return `
    <form id="saleForm" class="vstack gap-3">
      <div class="cards-3">
        <div>
          <label class="form-label">Chọn khách hàng có sẵn</label>
          <select class="form-select" id="saleCustomerId">
            <option value="">-- Nhập tay hoặc chọn khách hàng --</option>
            ${customerOptions}
          </select>
        </div>
        <div>
          <label class="form-label">Tên khách hàng</label>
          <input class="form-control" id="saleCustomerName" placeholder="Ví dụ: Nguyễn Văn A">
        </div>
        <div>
          <label class="form-label">Số điện thoại</label>
          <input class="form-control" id="saleCustomerPhone" placeholder="Ví dụ: 09xxxxxxxx">
        </div>
      </div>
      <div>
        <label class="form-label">Địa chỉ</label>
        <input class="form-control" id="saleCustomerAddress" placeholder="Địa chỉ khách hàng">
      </div>

      <div class="d-flex justify-content-between align-items-center">
        <div>
          <h5 class="mb-1">Danh sách sản phẩm</h5>
          <div class="text-muted small">Chọn nhiều sản phẩm trong cùng một đơn.</div>
        </div>
        <button type="button" class="btn btn-soft" id="btnAddSaleRow"><i class="bi bi-plus-lg me-1"></i>Thêm dòng</button>
      </div>
      <div id="saleRows"></div>

      <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap">
        <div class="fw-semibold">Tổng tiền: <span id="saleTotal">0 ₫</span></div>
        <button class="btn btn-pink px-4" type="submit"><i class="bi bi-check2-circle me-1"></i>${editingOrder ? 'Lưu thay đổi hóa đơn' : 'Lưu đơn hàng'}</button>
      </div>
    </form>
  `;
}

function saleRowTemplate(index = 0) {
  const productOptions = (state.products || []).map(p => `<option value="${p.id}" data-price="${p.sale_price}" data-stock="${p.current_stock}">${esc(p.code)} - ${esc(p.name)} (Tồn: ${p.current_stock})</option>`).join('');
  return `
    <div class="card-soft sale-row" data-row-index="${index}">
      <div class="row g-3 align-items-end">
        <div class="col-12 col-md-5">
          <label class="form-label">Sản phẩm</label>
          <select class="form-select sale-product" required>
            <option value="">-- Chọn sản phẩm --</option>
            ${productOptions}
          </select>
          <div class="form-text sale-stock-info">Tồn kho: -</div>
        </div>
        <div class="col-6 col-md-2">
          <label class="form-label">Số lượng</label>
          <input class="form-control sale-qty" type="number" min="1" value="1" required>
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label">Giá bán</label>
          <input class="form-control sale-price" type="number" min="0" step="1000" value="0" required>
        </div>
        <div class="col-12 col-md-2 d-flex justify-content-end">
          <button type="button" class="btn btn-outline-danger btn-remove-row w-100"><i class="bi bi-x-lg me-1"></i>Xóa</button>
        </div>
      </div>
    </div>
  `;
}

function bindSalesForm(editingOrder = null) {
  const rows = el('saleRows');
  rows.innerHTML = '';
  const initialItems = editingOrder?.items?.length ? editingOrder.items : [{}];

  initialItems.forEach((item, idx) => {
    rows.insertAdjacentHTML('beforeend', saleRowTemplate(idx));
    const row = rows.lastElementChild;
    attachSaleRowHandlers(row);
    const productSelect = row.querySelector('.sale-product');
    if (item.product_id) {
      productSelect.value = String(item.product_id);
      productSelect.dispatchEvent(new Event('change'));
    }
    row.querySelector('.sale-qty').value = item.quantity ?? 1;
    row.querySelector('.sale-price').value = item.unit_price ?? 0;
  });

  if (editingOrder) {
    el('saleCustomerId').value = editingOrder.customer_id || '';
    el('saleCustomerName').value = editingOrder.customer_name || '';
    el('saleCustomerPhone').value = editingOrder.customer_phone || '';
    el('saleCustomerAddress').value = editingOrder.customer_address || '';
  }

  el('btnAddSaleRow').addEventListener('click', () => {
    const idx = rows.querySelectorAll('.sale-row').length;
    rows.insertAdjacentHTML('beforeend', saleRowTemplate(idx));
    attachSaleRowHandlers(rows.lastElementChild);
    updateSaleTotal();
  });

  el('saleForm').addEventListener('submit', submitSale);
  updateSaleTotal();
}

function attachSaleRowHandlers(row) {
  const productSelect = row.querySelector('.sale-product');
  const qtyInput = row.querySelector('.sale-qty');
  const priceInput = row.querySelector('.sale-price');
  const stockInfo = row.querySelector('.sale-stock-info');
  productSelect.addEventListener('change', () => {
    const opt = productSelect.selectedOptions[0];
    if (opt && opt.value) {
      priceInput.value = opt.dataset.price || 0;
      stockInfo.textContent = `Tồn kho: ${opt.dataset.stock || 0}`;
    } else {
      stockInfo.textContent = 'Tồn kho: -';
      priceInput.value = 0;
    }
    updateSaleTotal();
  });
  qtyInput.addEventListener('input', updateSaleTotal);
  priceInput.addEventListener('input', updateSaleTotal);
  row.querySelector('.btn-remove-row').addEventListener('click', () => {
    if (el('saleRows').querySelectorAll('.sale-row').length > 1) {
      row.remove();
      updateSaleTotal();
    }
  });
}

function updateSaleTotal() {
  let total = 0;
  document.querySelectorAll('.sale-row').forEach((row) => {
    const qty = Number(row.querySelector('.sale-qty').value || 0);
    const price = Number(row.querySelector('.sale-price').value || 0);
    total += qty * price;
  });
  el('saleTotal').textContent = fmtMoney(total);
}

async function submitSale(e) {
  e.preventDefault();
  try {
    const customer_id = el('saleCustomerId').value || null;
    const customer_name = el('saleCustomerName').value.trim();
    const customer_phone = el('saleCustomerPhone').value.trim();
    const customer_address = el('saleCustomerAddress').value.trim();
    const items = [];
    document.querySelectorAll('.sale-row').forEach((row) => {
      const product_id = row.querySelector('.sale-product').value;
      const quantity = row.querySelector('.sale-qty').value;
      const unit_price = row.querySelector('.sale-price').value;
      if (product_id) items.push({ product_id, quantity, unit_price });
    });
    const editing = state.editingOrder;
    const result = await api(editing ? `/api/orders/${editing.id}` : '/api/orders', {
      method: editing ? 'PUT' : 'POST',
      body: JSON.stringify({ customer_id, customer_name, customer_phone, customer_address, items }),
    });
    showToast(editing ? 'Đã cập nhật hóa đơn thành công.' : 'Đã lưu đơn hàng thành công.');
    state.editingOrder = null;
    await refreshAll();
    navigate('invoices');
    return result;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadProducts() {
  const data = await api(`/api/products?q=${encodeURIComponent(state.productsSearch || '')}`);
  state.products = data.products || [];
}

async function loadSuppliers() {
  if (!isManager()) return;
  const data = await api('/api/suppliers');
  state.suppliers = data.suppliers || [];
}

async function loadCustomers() {
  if (!isManager()) return;
  const data = await api('/api/customers');
  state.customers = data.customers || [];
}

async function loadImports() {
  if (!isManager()) return;
  const data = await api('/api/imports');
  state.imports = data.imports || [];
}

async function loadOrders() {
  if (!isManager()) return;
  const data = await api(`/api/orders${state.invoiceFilter !== 'all' ? `?status=${state.invoiceFilter}` : ''}`);
  state.orders = data.orders || [];
}

async function loadReports() {
  if (!isManager()) return;
  const [monthly, products] = await Promise.all([
    api(`/api/reports/monthly?month=${state.reportsMonth}&year=${state.reportsYear}`),
    api(`/api/reports/products?month=${state.reportsMonth}&year=${state.reportsYear}`),
  ]);
  state.reports = monthly;
  state.reportProducts = products;
}

async function refreshAll() {
  await Promise.all([
    loadProducts(),
    isManager() ? loadSuppliers() : Promise.resolve(),
    isManager() ? loadCustomers() : Promise.resolve(),
    isManager() ? loadImports() : Promise.resolve(),
    isManager() ? loadOrders() : Promise.resolve(),
    isManager() ? loadReports() : Promise.resolve(),
    isManager() ? loadDashboard() : Promise.resolve(),
  ]);
  routeRender(state.page);
}

async function loadMe() {
  const data = await api('/api/auth/me');
  state.user = data.user;
  syncAuthUi();
}

function openLoginModal() {
  const modal = el('loginModal');
  el('loginModalContent').innerHTML = `
    <div class="modal-header">
      <div>
        <h5 class="modal-title">Đăng nhập quản lý</h5>
        <div class="text-muted small">Dùng tài khoản mẫu để thử ngay: admin / admin123</div>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <form id="loginForm" class="vstack gap-3">
        <div>
          <label class="form-label">Tên đăng nhập</label>
          <input class="form-control" id="loginUsername" autocomplete="username" required>
        </div>
        <div>
          <label class="form-label">Mật khẩu</label>
          <input class="form-control" id="loginPassword" type="password" autocomplete="current-password" required>
        </div>
        <button class="btn btn-pink w-100" type="submit">Đăng nhập</button>
      </form>
    </div>
  `;
  modal.querySelector('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const username = el('loginUsername').value.trim();
      const password = el('loginPassword').value;
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      state.user = data.user;
      bootstrap.Modal.getInstance(modal).hide();
      showToast('Đăng nhập thành công.');
      syncAuthUi();
      await refreshAll();
      navigate('dashboard');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
  new bootstrap.Modal(modal).show();
}

function openProductModal(product = null) {
  const isEdit = !!product;
  el('entityModalContent').innerHTML = `
    <div class="modal-header">
      <div>
        <h5 class="modal-title">${isEdit ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm'}</h5>
        <div class="text-muted small">Quản lý có thể thêm, sửa, xóa sản phẩm.</div>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <form id="productForm" class="vstack gap-3">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Mã sản phẩm</label>
            <input class="form-control" id="productCode" value="${esc(product?.code || '')}" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">Nhà cung ứng</label>
            <select class="form-select" id="productSupplier">
              <option value="">-- Chọn nhà cung ứng --</option>
              ${(state.suppliers || []).map(s => `<option value="${s.id}" ${String(product?.supplier_id || '') === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div>
          <label class="form-label">Tên sản phẩm</label>
          <input class="form-control" id="productName" value="${esc(product?.name || '')}" required>
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Giá bán</label>
            <input class="form-control" id="productPrice" type="number" min="0" step="1000" value="${product?.sale_price ?? 0}" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">Số lượng tồn</label>
            <input class="form-control" id="productStock" type="number" min="0" value="${product?.current_stock ?? 0}" required>
            <div class="form-text">Nếu thay đổi tồn kho, hệ thống sẽ ghi nhận chênh lệch vào lịch sử.</div>
          </div>
        </div>
        <button class="btn btn-pink" type="submit">${isEdit ? 'Lưu thay đổi' : 'Thêm mới'}</button>
      </form>
    </div>
  `;
  new bootstrap.Modal(el('entityModal')).show();
  el('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = {
        code: el('productCode').value.trim(),
        name: el('productName').value.trim(),
        sale_price: Number(el('productPrice').value),
        current_stock: Number(el('productStock').value),
        supplier_id: el('productSupplier').value || null,
      };
      await api(isEdit ? `/api/products/${product.id}` : '/api/products', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      bootstrap.Modal.getInstance(el('entityModal')).hide();
      showToast(isEdit ? 'Đã cập nhật sản phẩm.' : 'Đã thêm sản phẩm.');
      await refreshAll();
      renderProducts();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function openSupplierModal(supplier = null) {
  const isEdit = !!supplier;
  el('entityModalContent').innerHTML = `
    <div class="modal-header">
      <div>
        <h5 class="modal-title">${isEdit ? 'Cập nhật nhà cung ứng' : 'Thêm nhà cung ứng'}</h5>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <form id="supplierForm" class="vstack gap-3">
        <div>
          <label class="form-label">Tên</label>
          <input class="form-control" id="supplierName" value="${esc(supplier?.name || '')}" required>
        </div>
        <div>
          <label class="form-label">Số điện thoại</label>
          <input class="form-control" id="supplierPhone" value="${esc(supplier?.phone || '')}">
        </div>
        <div>
          <label class="form-label">Địa chỉ</label>
          <textarea class="form-control" id="supplierAddress" rows="3">${esc(supplier?.address || '')}</textarea>
        </div>
        <button class="btn btn-pink" type="submit">${isEdit ? 'Lưu thay đổi' : 'Thêm mới'}</button>
      </form>
    </div>
  `;
  new bootstrap.Modal(el('entityModal')).show();
  el('supplierForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: el('supplierName').value.trim(),
        phone: el('supplierPhone').value.trim(),
        address: el('supplierAddress').value.trim(),
      };
      await api(isEdit ? `/api/suppliers/${supplier.id}` : '/api/suppliers', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      bootstrap.Modal.getInstance(el('entityModal')).hide();
      showToast(isEdit ? 'Đã cập nhật nhà cung ứng.' : 'Đã thêm nhà cung ứng.');
      await refreshAll();
      renderSuppliers();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function openCustomerModal(customer = null) {
  const isEdit = !!customer;
  el('entityModalContent').innerHTML = `
    <div class="modal-header">
      <div>
        <h5 class="modal-title">${isEdit ? 'Cập nhật khách hàng' : 'Thêm khách hàng'}</h5>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <form id="customerForm" class="vstack gap-3">
        <div>
          <label class="form-label">Tên</label>
          <input class="form-control" id="customerName" value="${esc(customer?.name || '')}" required>
        </div>
        <div>
          <label class="form-label">Số điện thoại</label>
          <input class="form-control" id="customerPhone" value="${esc(customer?.phone || '')}">
        </div>
        <div>
          <label class="form-label">Địa chỉ</label>
          <textarea class="form-control" id="customerAddress" rows="3">${esc(customer?.address || '')}</textarea>
        </div>
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="customerWalkIn" ${customer?.is_walk_in ? 'checked' : ''}>
          <label class="form-check-label" for="customerWalkIn">Khách lẻ</label>
        </div>
        <button class="btn btn-pink" type="submit">${isEdit ? 'Lưu thay đổi' : 'Thêm mới'}</button>
      </form>
    </div>
  `;
  new bootstrap.Modal(el('entityModal')).show();
  el('customerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: el('customerName').value.trim(),
        phone: el('customerPhone').value.trim(),
        address: el('customerAddress').value.trim(),
        is_walk_in: el('customerWalkIn').checked,
      };
      await api(isEdit ? `/api/customers/${customer.id}` : '/api/customers', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      bootstrap.Modal.getInstance(el('entityModal')).hide();
      showToast(isEdit ? 'Đã cập nhật khách hàng.' : 'Đã thêm khách hàng.');
      await refreshAll();
      renderCustomers();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function importRowTemplate(index = 0, item = {}) {
  const productOptions = (state.products || []).map(p => `<option value="${p.id}" data-price="${p.sale_price}" data-stock="${p.current_stock}" ${String(item.product_id) === String(p.id) ? 'selected' : ''}>${esc(p.code)} - ${esc(p.name)} (Tồn: ${p.current_stock})</option>`).join('');
  return `
    <div class="card-soft import-row" data-row-index="${index}">
      <div class="row g-3 align-items-end">
        <div class="col-12 col-md-7">
          <label class="form-label">Sản phẩm</label>
          <select class="form-select import-product" required>
            <option value="">-- Chọn sản phẩm --</option>
            ${productOptions}
          </select>
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label">Số lượng</label>
          <input class="form-control import-qty" type="number" min="1" value="${item.quantity || 1}" required>
        </div>
        <div class="col-6 col-md-2 d-flex justify-content-end">
          <button type="button" class="btn btn-outline-danger btn-remove-row w-100"><i class="bi bi-x-lg me-1"></i>Xóa</button>
        </div>
      </div>
    </div>
  `;
}

function openImportModal(importData = null) {
  const supplierOptions = (state.suppliers || []).map(s => `<option value="${s.id}" ${String(importData?.supplier_id) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const initialItems = importData?.items?.length
    ? importData.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity }))
    : [{ product_id: '', quantity: 1 }];
  el('entityModalContent').innerHTML = `
    <div class="modal-header">
      <div>
        <h5 class="modal-title">${importData ? 'Sửa phiếu nhập kho' : 'Nhập kho mới'}</h5>
        <div class="text-muted small">Chọn sản phẩm, số lượng và nhà cung ứng.</div>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <form id="importForm" class="vstack gap-3">
        <div>
          <label class="form-label">Nhà cung ứng</label>
          <select class="form-select" id="importSupplier" required>
            <option value="">-- Chọn nhà cung ứng --</option>
            ${supplierOptions}
          </select>
        </div>
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <label class="form-label mb-0">Danh sách sản phẩm</label>
            <div class="text-muted small">Có thể thêm nhiều dòng nhập trong một phiếu.</div>
          </div>
          <button type="button" class="btn btn-soft" id="btnAddImportRow"><i class="bi bi-plus-lg me-1"></i>Thêm dòng</button>
        </div>
        <div id="importRows"></div>
        <div class="card-soft d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="fw-semibold">Tổng số lượng: <span id="importTotal">0</span></div>
          <div class="text-muted small">Sẽ tự động cộng/trừ tồn kho theo chỉnh sửa.</div>
        </div>
        <div>
          <label class="form-label">Ghi chú</label>
          <textarea class="form-control" id="importNote" rows="3">${esc(importData?.note || '')}</textarea>
        </div>
        <button class="btn btn-pink" type="submit">${importData ? 'Lưu thay đổi' : 'Lưu nhập kho'}</button>
      </form>
    </div>
  `;
  const modal = new bootstrap.Modal(el('entityModal'));
  modal.show();
  const rows = el('importRows');
  const updateImportTotal = () => {
    let total = 0;
    rows.querySelectorAll('.import-row').forEach((row) => {
      total += Number(row.querySelector('.import-qty')?.value || 0);
    });
    const totalEl = el('importTotal');
    if (totalEl) totalEl.textContent = String(total);
  };
  const attachImportRowHandlers = (row) => {
    const productSelect = row.querySelector('.import-product');
    const qtyInput = row.querySelector('.import-qty');
    productSelect?.addEventListener('change', updateImportTotal);
    qtyInput?.addEventListener('input', updateImportTotal);
    row.querySelector('.btn-remove-row')?.addEventListener('click', () => {
      if (rows.querySelectorAll('.import-row').length > 1) {
        row.remove();
        updateImportTotal();
      }
    });
  };
  const addRowElement = (item = { product_id: '', quantity: 1 }) => {
    const index = rows.querySelectorAll('.import-row').length;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = importRowTemplate(index, item).trim();
    const row = wrapper.firstElementChild;
    rows.appendChild(row);
    attachImportRowHandlers(row);
    updateImportTotal();
  };
  initialItems.forEach((item) => addRowElement(item));
  el('btnAddImportRow').addEventListener('click', () => addRowElement());

  el('importForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payloadItems = Array.from(rows.querySelectorAll('.import-row')).map((row) => ({
        product_id: row.querySelector('.import-product').value,
        quantity: Number(row.querySelector('.import-qty').value),
      })).filter((x) => x.product_id && x.quantity > 0);
      if (!payloadItems.length) throw new Error('Vui lòng chọn ít nhất 1 sản phẩm.');
      const payload = {
        supplier_id: el('importSupplier').value,
        items: payloadItems,
        note: el('importNote').value.trim(),
      };
      await api(importData ? `/api/imports/${importData.id}` : '/api/imports', {
        method: importData ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      modal.hide();
      showToast(importData ? 'Đã cập nhật phiếu nhập kho.' : 'Đã lưu phiếu nhập kho.');
      await refreshAll();
      renderImports();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function openImportEdit(id) {
  try {
    const data = await api(`/api/imports/${id}`);
    openImportModal(data.import);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function confirmDeleteImport(item) {
  if (!item) return;
  el('confirmModalContent').innerHTML = `
    <div class="modal-header">
      <h5 class="modal-title">Xác nhận xóa phiếu nhập</h5>
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <p class="mb-0">Bạn có chắc muốn xóa phiếu nhập <strong>${esc(item.import_code)}</strong> không? Hệ thống sẽ tự hoàn tác tồn kho.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-light" data-bs-dismiss="modal">Hủy</button>
      <button class="btn btn-danger" id="btnConfirmDeleteImport">Xóa</button>
    </div>
  `;
  const modal = new bootstrap.Modal(el('confirmModal'));
  modal.show();
  el('btnConfirmDeleteImport').addEventListener('click', async () => {
    try {
      await api(`/api/imports/${item.id}`, { method: 'DELETE' });
      modal.hide();
      showToast('Đã xóa phiếu nhập.');
      await refreshAll();
      renderImports();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function openOrderDetail(id) {
  try {
    const data = await api(`/api/orders/${id}`);
    const o = data.order;
    const items = o.items || [];
    el('detailModalContent').innerHTML = `
      <div class="modal-header">
        <div>
          <h5 class="modal-title">Chi tiết hóa đơn ${esc(o.order_code)}</h5>
          <div class="text-muted small">${fmtDate(o.created_at)}</div>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="cards-2 mb-3">
          <div class="card-soft">
            <div class="text-muted small">Khách hàng</div>
            <div class="fw-semibold">${esc(o.customer_name)}</div>
            <div class="small text-muted">${esc(o.customer_phone || '-')}</div>
            <div class="small text-muted">${esc(o.customer_address || '-')}</div>
          </div>
          <div class="card-soft">
            <div class="text-muted small">Trạng thái</div>
            <div class="mt-1"><span class="badge ${o.is_paid ? 'text-bg-success' : 'text-bg-warning'}">${o.is_paid ? 'Đã trả tiền' : 'Chưa trả tiền'}</span></div>
            <div class="mt-3 text-muted small">Tổng tiền</div>
            <div class="fw-bold fs-4">${fmtMoney(o.total_amount)}</div>
          </div>
        </div>
        <div class="table-wrap mb-3 desktop-table">
          <table class="table align-middle">
            <thead><tr><th>Sản phẩm</th><th class="text-end">SL</th><th class="text-end">Giá</th><th class="text-end">Thành tiền</th></tr></thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${esc(item.product_name)}</td>
                  <td class="text-end">${item.quantity}</td>
                  <td class="text-end">${fmtMoney(item.unit_price)}</td>
                  <td class="text-end">${fmtMoney(item.line_total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="mobile-list">
          ${items.map(item => `
            <div class="mobile-item">
              <div class="mobile-item-grid">
                <div>
                  <div class="mobile-item-title">${esc(item.product_name)}</div>
                  <div class="mobile-item-sub">Số lượng: ${item.quantity}</div>
                  <div class="mobile-item-sub">Đơn giá: ${fmtMoney(item.unit_price)}</div>
                </div>
                <div class="text-end fw-semibold">${fmtMoney(item.line_total)}</div>
              </div>
            </div>
          `).join('') || '<div class="text-muted">Chưa có sản phẩm.</div>'}
        </div>
        <div class="d-flex justify-content-end gap-2 flex-wrap">
          <button class="btn btn-outline-secondary" id="btnEditOrder"><i class="bi bi-pencil me-1"></i>Sửa hóa đơn</button>
          <button class="btn btn-pink ${o.is_paid ? 'd-none' : ''}" id="btnPayNow"><i class="bi bi-credit-card me-1"></i>Cập nhật thanh toán</button>
        </div>
      </div>
    `;
    new bootstrap.Modal(el('detailModal')).show();
    const editBtn = el('btnEditOrder');
    if (editBtn) editBtn.addEventListener('click', () => openOrderEdit(id));
    const payBtn = el('btnPayNow');
    if (payBtn) payBtn.addEventListener('click', () => confirmPay(id, o.order_code));
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function openOrderEdit(id) {
  try {
    const data = await api(`/api/orders/${id}`);
    state.editingOrder = data.order;
    bootstrap.Modal.getInstance(el('detailModal'))?.hide();
    navigate('sales');
    showToast(`Đã mở hóa đơn ${data.order.order_code} để chỉnh sửa.`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function confirmDelete(type, item) {
  if (!item) return;
  const labels = {
    product: 'sản phẩm',
    supplier: 'nhà cung ứng',
    customer: 'khách hàng',
  };
  el('confirmModalContent').innerHTML = `
    <div class="modal-header">
      <h5 class="modal-title">Xác nhận xóa</h5>
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <p class="mb-0">Bạn có chắc muốn xóa ${labels[type] || 'mục này'} <strong>${esc(item.name || item.code || '')}</strong> không?</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-light" data-bs-dismiss="modal">Hủy</button>
      <button class="btn btn-danger" id="btnConfirmDelete">Xóa</button>
    </div>
  `;
  const modal = new bootstrap.Modal(el('confirmModal'));
  modal.show();
  el('btnConfirmDelete').addEventListener('click', async () => {
    try {
      await api(`/api/${type === 'product' ? 'products' : type === 'supplier' ? 'suppliers' : 'customers'}/${item.id}`, {
        method: 'DELETE',
      });
      modal.hide();
      showToast('Đã xóa thành công.');
      await refreshAll();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function confirmPay(id, code) {
  el('confirmModalContent').innerHTML = `
    <div class="modal-header">
      <h5 class="modal-title">Xác nhận thanh toán</h5>
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <p class="mb-0">Đánh dấu hóa đơn <strong>${esc(code)}</strong> là đã trả tiền?</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-light" data-bs-dismiss="modal">Hủy</button>
      <button class="btn btn-pink" id="btnConfirmPay">Xác nhận</button>
    </div>
  `;
  const modal = new bootstrap.Modal(el('confirmModal'));
  modal.show();
  el('btnConfirmPay').addEventListener('click', async () => {
    try {
      await api(`/api/orders/${id}/pay`, { method: 'PUT' });
      modal.hide();
      bootstrap.Modal.getInstance(el('detailModal'))?.hide();
      showToast('Đã cập nhật trạng thái thanh toán.');
      await refreshAll();
      renderInvoices();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function init() {
  el('btnLogin').addEventListener('click', openLoginModal);
  el('btnLogout').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      state.user = null;
      state.dashboard = null;
      syncAuthUi();
      showToast('Đã đăng xuất.');
      await refreshAll();
      navigate('dashboard');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
  el('btnRefresh').addEventListener('click', async () => {
    await refreshAll();
    showToast('Đã tải lại dữ liệu.');
  });

  await loadMe();
  await loadProducts();
  if (isManager()) {
    await Promise.all([loadSuppliers(), loadCustomers(), loadImports(), loadOrders(), loadReports(), loadDashboard()]);
  }
  syncAuthUi();
  navigate('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
