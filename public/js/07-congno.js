/* 07-congno.js
   Màn hình Công nợ khách hàng
   - Tìm kiếm theo tên / số điện thoại
   - Danh sách khách hàng: Họ tên, SĐT, Tổng tiền, Đã trả, Chưa trả, Chi tiết
   - Panel chi tiết ở giữa màn hình (modal): thông tin KH + toàn bộ hóa đơn
   - Lọc hóa đơn theo trạng thái, sắp xếp theo ngày
   - Thanh toán hóa đơn kèm xác nhận và refresh dữ liệu
   - Xuất Excel thông qua 08-congno-excel.js
*/

(function initCongNoModule() {
  const DEFAULT_FILTER = {
    name: '',
    phone: '',
  };

  const DEFAULT_DETAIL_FILTER = {
    status: 'all',
    sort: 'newest',
  };

  state.congno = {
    customers: Array.isArray(state.congno?.customers) ? state.congno.customers : [],
    selectedCustomer: state.congno?.selectedCustomer || null,
    orders: Array.isArray(state.congno?.orders) ? state.congno.orders : [],
    filters: {
      ...DEFAULT_FILTER,
      ...(state.congno?.filters || {}),
    },
    detailFilters: {
      ...DEFAULT_DETAIL_FILTER,
      ...(state.congno?.detailFilters || {}),
    },
    loading: Boolean(state.congno?.loading),
    detailLoading: Boolean(state.congno?.detailLoading),
    loaded: Boolean(state.congno?.loaded),
  };

  function $(id) {
    return document.getElementById(id);
  }

  function normalizeFilters(raw = {}) {
    return {
      name: raw.name ?? '',
      phone: raw.phone ?? '',
    };
  }

  function normalizeDetailFilters(raw = {}) {
    return {
      status: raw.status ?? 'all',
      sort: raw.sort ?? 'newest',
    };
  }

  function currentFilters() {
    state.congno.filters = normalizeFilters(state.congno.filters);
    return state.congno.filters;
  }

  function currentDetailFilters() {
    state.congno.detailFilters = normalizeDetailFilters(state.congno.detailFilters);
    return state.congno.detailFilters;
  }

  function readFiltersFromUI() {
    return normalizeFilters({
      name: $('congnoSearchName')?.value || '',
      phone: $('congnoSearchPhone')?.value || '',
    });
  }

  function setUIFromFilters(filters) {
    if ($('congnoSearchName')) $('congnoSearchName').value = filters.name || '';
    if ($('congnoSearchPhone')) $('congnoSearchPhone').value = filters.phone || '';
  }

  function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function money0(value) {
    return money(safeNumber(value));
  }

  function asDateTime(value) {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  }

  function sortOrders(list, sort) {
    const arr = [...(list || [])];
    arr.sort((a, b) => {
      const da = asDateTime(a.created_at)?.getTime() || 0;
      const db = asDateTime(b.created_at)?.getTime() || 0;
      if (sort === 'oldest') return da - db;
      return db - da;
    });
    return arr;
  }

  function filterOrders(orders, filters) {
    const f = normalizeDetailFilters(filters);
    const list = (orders || []).filter((o) => {
      if (f.status === 'paid' && !o.is_paid) return false;
      if (f.status === 'unpaid' && o.is_paid) return false;
      return true;
    });
    return sortOrders(list, f.sort);
  }

  function summaryStats(list) {
    const totalCustomers = list.length;
    const totalAmount = list.reduce((sum, x) => sum + safeNumber(x.total_amount), 0);
    const totalPaid = list.reduce((sum, x) => sum + safeNumber(x.total_paid), 0);
    const totalUnpaid = list.reduce((sum, x) => sum + safeNumber(x.total_unpaid), 0);
    const debtCustomers = list.reduce((sum, x) => sum + (safeNumber(x.total_unpaid) > 0 ? 1 : 0), 0);

    return { totalCustomers, totalAmount, totalPaid, totalUnpaid, debtCustomers };
  }

  function renderLoadingBox(message = 'Đang tải công nợ...') {
    pageContent.innerHTML = `
      <div class="panel text-center py-5">
        <div class="text-muted">${esc(message)}</div>
      </div>
    `;
  }

  function renderErrorBox(message = 'Không thể tải công nợ.') {
    pageContent.innerHTML = `
      <div class="panel text-center py-5">
        <div class="text-danger fw-semibold">${esc(message)}</div>
      </div>
    `;
  }

  function renderCustomerRows(list) {
    const rows = list.map((c, idx) => {
      const unpaid = safeNumber(c.total_unpaid);
      const paid = safeNumber(c.total_paid);
      const total = safeNumber(c.total_amount);
      const badgeClass = unpaid > 0 ? 'text-bg-danger' : 'text-bg-success';
      const debtLabel = unpaid > 0 ? 'Còn nợ' : 'Đã thanh toán';

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><b>${esc(c.name || '')}</b></td>
          <td>${esc(c.phone || '')}</td>
          <td>${money0(total)}</td>
          <td>${money0(paid)}</td>
          <td>
            <span class="badge ${badgeClass}">${esc(debtLabel)}</span>
            <div class="small text-muted mt-1">${money0(unpaid)}</div>
          </td>
          <td class="table-actions">
            <button class="btn btn-outline-secondary btn-sm" data-congno-action="open-detail" data-id="${c.id}">
              Xem chi tiết
            </button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrap">
        <table class="table align-middle table-hover">
          <thead>
            <tr>
              <th>#</th>
              <th>Họ tên</th>
              <th>Số điện thoại</th>
              <th>Tổng tiền</th>
              <th>Tổng đã trả</th>
              <th>Tổng chưa trả</th>
              <th class="text-end">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="7" class="text-center text-muted py-4">Chưa có dữ liệu</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCustomerCards(list) {
    const cards = list.map((c) => {
      const unpaid = safeNumber(c.total_unpaid);
      const paid = safeNumber(c.total_paid);
      const total = safeNumber(c.total_amount);
      return `
        <div class="mobile-item">
          <div class="mobile-item-grid">
            <div>
              <div class="mobile-item-title">${esc(c.name || '')}</div>
              <div class="mobile-item-sub">SĐT: ${esc(c.phone || '—')}</div>
              <div class="mobile-item-sub">Tổng tiền: <b>${money0(total)}</b></div>
              <div class="mobile-item-sub">Đã trả: <b>${money0(paid)}</b></div>
              <div class="mobile-item-sub">Chưa trả: <b>${money0(unpaid)}</b></div>
            </div>
            <div class="text-end">
              <button class="btn btn-outline-secondary btn-sm" data-congno-action="open-detail" data-id="${c.id}">
                Chi tiết
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `<div class="mobile-list">${cards || '<div class="text-muted">Chưa có dữ liệu</div>'}</div>`;
  }

  function renderSummary(list) {
    const stats = summaryStats(list);
    return `
      <div class="summary-grid mb-4">
        ${cardHtml('Khách hàng', stats.totalCustomers, 'Kết quả đang hiển thị')}
        ${cardHtml('Tổng nợ', money0(stats.totalUnpaid), 'Tổng chưa thu')}
        ${cardHtml('Đã thu', money0(stats.totalPaid), 'Tổng đã thanh toán')}
        ${cardHtml('Đang nợ', stats.debtCustomers, 'Khách hàng còn dư nợ')}
      </div>
    `;
  }

  async function loadCongNoCustomers() {
    state.congno.loading = true;
    try {
      const filters = currentFilters();
      const qs = new URLSearchParams();
      const search = [String(filters.name || '').trim(), String(filters.phone || '').trim()].filter(Boolean).join(' ').trim();
      if (search) qs.set('search', search);

      const res = await api(`/api/congno/customers${qs.toString() ? `?${qs.toString()}` : ''}`);
      state.congno.customers = Array.isArray(res.data) ? res.data : [];
      state.congno.loaded = true;
      return state.congno.customers;
    } finally {
      state.congno.loading = false;
    }
  }

  async function loadCustomerOrders(customerId) {
    const status = String(state.congno.detailFilters?.status || 'all');
    const qs = new URLSearchParams();
    if (status && status !== 'all') qs.set('status', status);

    const res = await api(`/api/congno/customers/${customerId}/orders${qs.toString() ? `?${qs.toString()}` : ''}`);
    state.congno.orders = Array.isArray(res.data) ? res.data : [];
    return state.congno.orders;
  }

  function renderInvoiceRows(list) {
    const rows = list.map((o, idx) => {
      const badgeClass = o.is_paid ? 'text-bg-success' : 'text-bg-warning';
      const badgeLabel = o.is_paid ? 'Đã trả' : 'Chưa trả';
      const actionBtn = o.is_paid
        ? `<button class="btn btn-outline-secondary btn-sm" disabled>Đã trả</button>`
        : `<button class="btn btn-outline-success btn-sm" data-congno-action="pay-order" data-id="${o.id}">Thanh toán</button>`;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><b>${esc(o.order_code || '')}</b></td>
          <td>${shortDate(o.created_at)}${o.created_at ? ` <span class="text-muted">${esc(fullDate(o.created_at).split(' ')[1] || '')}</span>` : ''}</td>
          <td>${money0(o.total_amount)}</td>
          <td><span class="badge ${badgeClass}">${esc(badgeLabel)}</span></td>
          <td class="table-actions">${actionBtn}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrap">
        <table class="table align-middle table-hover">
          <thead>
            <tr>
              <th>#</th>
              <th>Mã HD</th>
              <th>Ngày mua</th>
              <th>Tổng tiền</th>
              <th>Trạng thái</th>
              <th class="text-end">Hành động</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" class="text-center text-muted py-4">Chưa có hóa đơn</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderInvoiceCards(list) {
    const cards = list.map((o) => `
      <div class="mobile-item">
        <div class="mobile-item-grid">
          <div>
            <div class="mobile-item-title">${esc(o.order_code || '')}</div>
            <div class="mobile-item-sub">Ngày mua: ${fullDate(o.created_at)}</div>
            <div class="mobile-item-sub">Tổng tiền: <b>${money0(o.total_amount)}</b></div>
            <div class="mobile-item-sub">
              Trạng thái:
              <span class="badge ${o.is_paid ? 'text-bg-success' : 'text-bg-warning'}">
                ${o.is_paid ? 'Đã trả' : 'Chưa trả'}
              </span>
            </div>
          </div>
          <div class="text-end d-grid gap-2">
            ${o.is_paid
              ? `<button class="btn btn-outline-secondary btn-sm" disabled>Đã trả</button>`
              : `<button class="btn btn-outline-success btn-sm" data-congno-action="pay-order" data-id="${o.id}">Thanh toán</button>`}
          </div>
        </div>
      </div>
    `).join('');

    return `<div class="mobile-list">${cards || '<div class="text-muted">Chưa có hóa đơn</div>'}</div>`;
  }

  function renderDetailFilters() {
    const filters = currentDetailFilters();
    return `
      <div class="panel mb-3">
        <div class="filters-4">
          <div>
            <label class="form-label">Trạng thái</label>
            <select id="congnoDetailStatus" class="form-select">
              <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Tất cả</option>
              <option value="paid" ${filters.status === 'paid' ? 'selected' : ''}>Đã trả</option>
              <option value="unpaid" ${filters.status === 'unpaid' ? 'selected' : ''}>Chưa trả</option>
            </select>
          </div>
          <div>
            <label class="form-label">Sắp xếp</label>
            <select id="congnoDetailSort" class="form-select">
              <option value="newest" ${filters.sort === 'newest' ? 'selected' : ''}>Ngày mới nhất</option>
              <option value="oldest" ${filters.sort === 'oldest' ? 'selected' : ''}>Ngày cũ nhất</option>
            </select>
          </div>
          <button class="btn btn-light" data-congno-action="refresh-detail">
            <i class="bi bi-arrow-clockwise me-1"></i>Làm mới
          </button>
          <button class="btn btn-outline-pink" data-congno-action="close-detail">
            Đóng
          </button>
        </div>
      </div>
    `;
  }

  function renderCustomerDetailBody(customer, orders) {
    const totalAmount = safeNumber(customer?.total_amount);
    const totalPaid = safeNumber(customer?.total_paid);
    const totalUnpaid = safeNumber(customer?.total_unpaid);
    const filteredOrders = filterOrders(orders, state.congno.detailFilters);

    return `
      <div class="panel mb-3">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div>
            <h5 class="mb-1">${esc(customer?.name || '')}</h5>
            <div class="text-muted small">Số điện thoại: ${esc(customer?.phone || '—')}</div>
            <div class="text-muted small">Địa chỉ: ${esc(customer?.address || '—')}</div>
          </div>
          <div class="text-end">
            <div class="small text-muted">Tổng mua</div>
            <div class="fw-bold">${money0(totalAmount)}</div>
          </div>
        </div>
      </div>

      <div class="summary-grid mb-3">
        ${cardHtml('Tổng tiền', money0(totalAmount), 'Tổng giá trị hóa đơn')}
        ${cardHtml('Đã trả', money0(totalPaid), 'Số tiền đã thanh toán')}
        ${cardHtml('Chưa trả', money0(totalUnpaid), 'Số tiền còn nợ')}
        ${cardHtml('Số hóa đơn', orders.length, 'Tổng hóa đơn của khách hàng')}
      </div>

      ${renderDetailFilters()}

      <div class="panel">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h5 class="mb-1">Danh sách hóa đơn</h5>
            <div class="text-muted small">Mã HD, ngày mua, tổng tiền, trạng thái và thao tác thanh toán.</div>
          </div>
        </div>
        ${renderInvoiceRows(filteredOrders)}
        ${renderInvoiceCards(filteredOrders)}
      </div>
    `;
  }

  function openCongNoDetail(customerId) {
    const customer = (state.congno.customers || []).find((x) => String(x.id) === String(customerId));
    if (!customer) {
      toast('Không tìm thấy khách hàng.', 'error');
      return;
    }

    state.congno.selectedCustomer = customer;
    state.congno.orders = [];

    showDetailModal(
      'Chi tiết công nợ',
      `<div class="text-center text-muted py-4">Đang tải chi tiết...</div>`,
      `
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-success" data-congno-action="export-excel">Xuất Excel</button>
          <button type="button" class="btn btn-outline-pink" data-congno-action="refresh-detail">Làm mới</button>
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Đóng</button>
        </div>
      `
    );

    const loadAndRender = async () => {
      try {
        state.congno.detailLoading = true;
        await loadCustomerOrders(customerId);
        const bodyHtml = renderCustomerDetailBody(state.congno.selectedCustomer, state.congno.orders);

        showDetailModal(
          'Chi tiết công nợ',
          bodyHtml,
          `
            <div class="d-flex gap-2 flex-wrap">
              <button class="btn btn-success" data-congno-action="export-excel">Xuất Excel</button>
              <button type="button" class="btn btn-outline-pink" data-congno-action="refresh-detail">Làm mới</button>
              <button type="button" class="btn btn-light" data-bs-dismiss="modal">Đóng</button>
            </div>
          `
        );
      } catch (error) {
        console.error(error);
        showDetailModal(
          'Chi tiết công nợ',
          `<div class="text-center text-danger py-4">${esc(error.message || 'Không thể tải chi tiết công nợ.')}</div>`,
          `<button type="button" class="btn btn-light" data-bs-dismiss="modal">Đóng</button>`
        );
      } finally {
        state.congno.detailLoading = false;
      }
    };

    loadAndRender();
  }

  async function refreshCongNoPage() {
    try {
      await loadCongNoCustomers();
      if (state.page === 'congno') {
        await renderCongNoPage();
      }
    } catch (error) {
      toast(error.message || 'Không thể làm mới công nợ.', 'error');
    }
  }

  async function refreshDetailModal() {
    const customer = state.congno.selectedCustomer;
    if (!customer?.id) return;
    await openCongNoDetail(customer.id);
  }

  async function payOrder(orderId) {
    const customer = state.congno.selectedCustomer;
    const order = (state.congno.orders || []).find((x) => String(x.id) === String(orderId));
    if (!order) return;

    showConfirmModal(
      'Xác nhận thanh toán',
      `
        <div class="mb-2">Bạn có chắc chắn muốn cập nhật hóa đơn này thành <b>Đã trả</b> không?</div>
        <div class="small text-muted">Mã HD: <b>${esc(order.order_code || '')}</b></div>
        <div class="small text-muted">Khách hàng: <b>${esc(customer?.name || order.customer_name || '')}</b></div>
        <div class="small text-muted">Số tiền: <b>${money0(order.total_amount)}</b></div>
      `,
      async () => {
        await api(`/api/congno/orders/${orderId}/pay`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        toast('Đã cập nhật thanh toán thành công.');
        await refreshCongNoPage();
        if (customer?.id) {
          await openCongNoDetail(customer.id);
        }
      }
    );
  }

  async function applySearch() {
    state.congno.filters = readFiltersFromUI();
    state.congno.loaded = false;
    await refreshCongNoPage();
  }

  async function resetSearch() {
    state.congno.filters = { ...DEFAULT_FILTER };
    setUIFromFilters(state.congno.filters);
    state.congno.loaded = false;
    await refreshCongNoPage();
  }

  async function renderCongNoPage() {
    if (!state.user) {
      pageContent.innerHTML = `
        <div class="panel">
          <div class="alert alert-soft mb-0">
            Vui lòng đăng nhập quản lý để xem công nợ khách hàng.
          </div>
        </div>
      `;
      return;
    }

    if (state.page !== 'congno') return;

    if (!state.congno.loaded) {
      renderLoadingBox();
      try {
        await loadCongNoCustomers();
      } catch (error) {
        console.error(error);
        renderErrorBox(error.message || 'Không thể tải công nợ.');
        return;
      }
    }

    if (state.page !== 'congno') return;

    const filters = currentFilters();
    setUIFromFilters(filters);

    const list = [...(state.congno.customers || [])];
    const { totalCustomers, totalUnpaid, totalPaid, debtCustomers } = summaryStats(list);

    const table = renderCustomerRows(list);
    const cards = renderCustomerCards(list);

    pageContent.innerHTML = `
      <div class="summary-grid mb-4">
        ${cardHtml('Khách hàng', totalCustomers, 'Tổng số khách đang theo dõi')}
        ${cardHtml('Tổng công nợ', money0(totalUnpaid), 'Toàn bộ khoản chưa thu')}
        ${cardHtml('Đã thu', money0(totalPaid), 'Toàn bộ khoản đã thanh toán')}
        ${cardHtml('Khách còn nợ', debtCustomers, 'Số khách hàng chưa tất toán')}
      </div>

      <div class="panel mb-4">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h5 class="mb-1">Công nợ khách hàng</h5>
            <div class="text-muted small">Tìm theo tên hoặc số điện thoại để xem toàn bộ hóa đơn và cập nhật thanh toán.</div>
          </div>
          <button class="btn btn-light" data-congno-action="reload-list">
            <i class="bi bi-arrow-clockwise me-1"></i>Làm mới
          </button>
        </div>

        <div class="filters-4">
          <div>
            <label class="form-label">Tên khách hàng</label>
            <input id="congnoSearchName" class="form-control" placeholder="Nhập tên khách hàng" value="${esc(filters.name)}">
          </div>
          <div>
            <label class="form-label">Số điện thoại</label>
            <input id="congnoSearchPhone" class="form-control" placeholder="Nhập số điện thoại" value="${esc(filters.phone)}">
          </div>
          <button class="btn btn-pink" data-congno-action="search">
            <i class="bi bi-search me-1"></i>Tìm kiếm
          </button>
          <button class="btn btn-outline-pink" data-congno-action="reset">
            <i class="bi bi-arrow-counterclockwise me-1"></i>Reset
          </button>
        </div>
      </div>

      <div class="panel">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h5 class="mb-1">Danh sách khách hàng</h5>
            <div class="text-muted small">Họ tên, số điện thoại, tổng tiền, tổng đã trả, tổng chưa trả và xem chi tiết.</div>
          </div>
        </div>
        ${table}
        ${cards}
      </div>
    `;
  }

  async function handleCongNoAction(action, id) {
    if (action === 'search') {
      await applySearch();
      return;
    }

    if (action === 'reset') {
      await resetSearch();
      return;
    }

    if (action === 'reload-list') {
      await refreshCongNoPage();
      return;
    }

    if (action === 'open-detail') {
      if (!id) return;
      state.congno.detailFilters = { ...DEFAULT_DETAIL_FILTER };
      await openCongNoDetail(id);
      return;
    }

    if (action === 'refresh-detail') {
      await refreshDetailModal();
      return;
    }

    if (action === 'close-detail') {
      const modal = $('detailModal');
      if (modal) bootstrap.Modal.getOrCreateInstance(modal).hide();
      return;
    }

    if (action === 'export-excel') {
      if (typeof exportCongNoExcel === 'function') {
        exportCongNoExcel(state.congno.selectedCustomer, state.congno.orders);
      } else {
        toast('Chức năng xuất Excel chưa được tải.', 'error');
      }
      return;
    }

    if (action === 'pay-order') {
      if (!id) return;
      await payOrder(id);
      return;
    }
  }

  function bindEventsOnce() {
    if (window.__congnoEventsBound) return;
    window.__congnoEventsBound = true;

    pageContent.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-congno-action]');
      if (!btn) return;
      e.preventDefault();
      await handleCongNoAction(btn.dataset.congnoAction, btn.dataset.id);
    });

    pageContent.addEventListener('keydown', async (e) => {
      const target = e.target;
      if (!target) return;
      if ((target.id === 'congnoSearchName' || target.id === 'congnoSearchPhone') && e.key === 'Enter') {
        e.preventDefault();
        await applySearch();
      }
    });

    document.addEventListener('change', async (e) => {
      const target = e.target;
      if (!target) return;

      if (target.id === 'congnoDetailStatus') {
        state.congno.detailFilters.status = target.value || 'all';
        await refreshDetailModal();
        return;
      }

      if (target.id === 'congnoDetailSort') {
        state.congno.detailFilters.sort = target.value || 'newest';
        await refreshDetailModal();
        return;
      }
    });

    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-congno-action]');
      if (!btn) return;

      const inModal = btn.closest('#detailModal');
      if (!inModal) return;

      const action = btn.dataset.congnoAction;
      if (action === 'pay-order') {
        await payOrder(btn.dataset.id);
        return;
      }
      if (action === 'refresh-detail') {
        await refreshDetailModal();
        return;
      }
      if (action === 'export-excel') {
        if (typeof exportCongNoExcel === 'function') {
          exportCongNoExcel(state.congno.selectedCustomer, state.congno.orders);
        } else {
          toast('Chức năng xuất Excel chưa được tải.', 'error');
        }
        return;
      }
      if (action === 'close-detail') {
        const modal = $('detailModal');
        if (modal) bootstrap.Modal.getOrCreateInstance(modal).hide();
      }
    });

    document.addEventListener('hidden.bs.modal', async (e) => {
      if (e.target && e.target.id === 'detailModal' && state.page === 'congno') {
        state.congno.detailLoading = false;
      }
    });
  }

  bindEventsOnce();

  window.loadCongNoCustomers = loadCongNoCustomers;
  window.openCongNoDetail = openCongNoDetail;
  window.refreshCongNoPage = refreshCongNoPage;
  window.renderCongNoPage = renderCongNoPage;
})();
