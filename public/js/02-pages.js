function renderProductPage() {
  const list = filteredProducts();
  const categories = categoryList();
  const frequentCount = countBy(state.products, (p) => p.is_frequent);
  const lowStockCount = countBy(state.products, (p) => p.current_stock <= 10);
  const totalStock = sumBy(state.products, (p) => p.current_stock);
  const canManage = canWriteProducts();

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
  const canManage = canWriteImports();
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
  const canManage = canWriteSales();
  const canDelete = canWriteSales();
  state.invoiceCustomer = state.invoiceCustomer || 'all';
  const selectedCustomer = String(state.invoiceCustomer);
  const customerOptions = (state.customers || []).map((c) => (
    `<option value="${c.id}" ${String(c.id) === selectedCustomer ? 'selected' : ''}>${esc(c.name)}</option>`
  )).join('');
  const listBase = state.orders.filter((o) => {
    if (selectedCustomer !== 'all' && String(o.customer_id || '') !== selectedCustomer) return false;
    if (state.invoiceStatus === 'paid') return o.is_paid;
    if (state.invoiceStatus === 'unpaid') return !o.is_paid;
    return true;
  });
  const list = listBase.slice().sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return state.orderSort === 'oldest' ? da - db : db - da;
  });
  const totalOrders = list.length;
  const revenue = sumBy(list, (o) => o.total_amount);
  const paid = countBy(list, (o) => o.is_paid);
  const unpaid = totalOrders - paid;

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
          <button class="btn btn-outline-success btn-sm" data-action="toggle-paid" data-id="${o.id}" data-paid="${o.is_paid ? '0' : '1'}">${o.is_paid ? 'Bỏ trả' : 'Đã trả'}</button>
        ` : ''}
        ${canDelete ? `
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
            <button class="btn btn-outline-secondary btn-sm" data-action="view-order" data-id="${o.id}">Chi tiết</button>
            ${canManage ? `
              <button class="btn btn-outline-primary btn-sm" data-action="edit-order" data-id="${o.id}">Sửa</button>
              <button class="btn btn-outline-success btn-sm" data-action="toggle-paid" data-id="${o.id}" data-paid="${o.is_paid ? '0' : '1'}">${o.is_paid ? 'Bỏ trả' : 'Đã trả'}</button>
            ` : ''}
            ${canDelete ? `<button class="btn btn-outline-danger btn-sm" data-action="delete-order" data-id="${o.id}">Xóa</button>` : ''}
          </div>
        </div>
      </div>
    </div>
  `).join('');

  pageContent.innerHTML = `
    <div class="summary-grid mb-4">
      ${cardHtml('Số đơn đang hiển thị', totalOrders, 'Danh sách theo bộ lọc hiện tại')}
      ${cardHtml('Doanh thu', money(revenue), 'Tổng giá trị đơn hiển thị')}
      ${cardHtml('Đã trả', paid, 'Số đơn thanh toán xong')}
      ${cardHtml('Chưa trả', unpaid, 'Số đơn còn nợ')}
    </div>

    <div class="panel mb-4">
      <div class="action-bar justify-content-between align-items-center flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2 flex-wrap">

    <div style="min-width:220px; max-width:320px;">
      <select id="orderCustomerFilter" class="form-select">
        <option value="all" ${selectedCustomer === 'all' ? 'selected' : ''}>Tất cả khách hàng</option>
        ${customerOptions}
      </select>
    </div>

    <div class="chips">
      <button class="chip ${state.invoiceStatus === 'all' ? 'active' : ''}" data-action="set-invoice-filter" data-value="all">Tất cả</button>
      <button class="chip ${state.invoiceStatus === 'paid' ? 'active' : ''}" data-action="set-invoice-filter" data-value="paid">Đã trả tiền</button>
      <button class="chip ${state.invoiceStatus === 'unpaid' ? 'active' : ''}" data-action="set-invoice-filter" data-value="unpaid">Chưa trả tiền</button>
      <button class="chip ${state.orderSort === 'newest' ? 'active' : ''}" data-action="set-order-sort" data-value="newest">Mới nhất</button>
      <button class="chip ${state.orderSort === 'oldest' ? 'active' : ''}" data-action="set-order-sort" data-value="oldest">Cũ nhất</button>
    </div>

  </div>
        <div class="action-bar">
          ${canManage ? `<button class="btn btn-pink" data-action="add-order"><i class="bi bi-plus-lg me-1"></i>Tạo đơn</button>` : ''}
          <button class="btn btn-light" data-action="reload-orders"><i class="bi bi-arrow-clockwise me-1"></i>Làm mới</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="table-wrap">
        <table class="table align-middle table-hover">
          <thead>
            <tr><th>#</th><th>Mã đơn</th><th>Khách hàng</th><th>Ngày tạo</th><th>Tổng tiền</th><th>Thanh toán</th><th class="text-end">Thao tác</th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7" class="text-center text-muted py-4">Chưa có dữ liệu</td></tr>'}</tbody>
        </table>
      </div>
      <div class="mobile-list">${cards || '<div class="text-muted">Chưa có dữ liệu</div>'}</div>
    </div>
  `;
}

function renderInvoicesPage() {
  renderSalesPage();
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
  if (!canAccessPage(page)) {
    page = firstAccessiblePage();
  }

  setTopMeta(
    page === 'dashboard' ? 'Dashboard' :
    page === 'products' ? 'Sản phẩm' :
    page === 'suppliers' ? 'Nhà cung ứng' :
    page === 'customers' ? 'Khách hàng' :
    page === 'imports' ? 'Nhập kho' :
    page === 'sales' ? 'Đơn hàng' :
    page === 'invoices' ? 'Đơn hàng' :
    page === 'reports' ? 'Báo cáo' :
    page === 'qlhoadon' ? 'Quản lý hóa đơn' :
    page === 'history' ? 'Lịch sử chỉnh sửa' :
    'Sản phẩm',
    page === 'dashboard' ? 'Tổng quan hoạt động kho và bán hàng' :
    page === 'products' ? 'Quản lý danh mục, DVT, quy cách và loại sản phẩm' :
    page === 'suppliers' ? 'Quản lý nhà cung ứng' :
    page === 'customers' ? 'Quản lý khách hàng' :
    page === 'imports' ? 'Tạo và chỉnh sửa phiếu nhập kho' :
    page === 'sales' ? 'Tạo, sửa, theo dõi và thanh toán đơn hàng' :
    page === 'invoices' ? 'Tạo, sửa, theo dõi và thanh toán đơn hàng' :
    page === 'reports' ? 'Báo cáo tháng, tổng quan và PDF' :
    page === 'qlhoadon' ? 'Xem, lọc, chỉnh sửa tất cả hóa đơn' :
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
  if (page === 'qlhoadon') {
  renderLoading();
  if (!state.orders.length) await loadOrders();
  renderQLHoaDonPage();
  return;
}
  if (page === 'invoices') {
    state.page = 'sales';
    renderLoading();
    if (!state.orders.length) await loadOrders();
    renderSalesPage();
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

