/* 05-qlhoadon.js
   Trang Quản lý hóa đơn
   - Lọc theo khách hàng / trạng thái / ngày / số tiền / tìm kiếm
   - Xem / sửa / đổi trạng thái thanh toán / xóa
   - Tái sử dụng openOrderModal, openOrderDetail từ 03-forms.js
*/

(function initQLHoaDonModule() {
  const DEFAULT_FILTER = {
    customer_id: 'all',
    status: 'all',
    from: '',
    to: '',
    amount_from: '',
    amount_to: '',
    search: '',
  };

  state.qlhoadonFilter = {
    ...DEFAULT_FILTER,
    ...(state.qlhoadonFilter || {}),
  };

  state.qlhoadonOrders = Array.isArray(state.qlhoadonOrders)
    ? state.qlhoadonOrders
    : [];
  state.qlhoadonLoaded = Boolean(state.qlhoadonLoaded);
  state.qlhoadonLoading = Boolean(state.qlhoadonLoading);

  function $(id) {
    return document.getElementById(id);
  }

  function escapeDateToInput(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function normalizeFilters(raw = {}) {
    return {
      customer_id: raw.customer_id ?? 'all',
      status: raw.status ?? 'all',
      from: raw.from ?? '',
      to: raw.to ?? '',
      amount_from: raw.amount_from ?? '',
      amount_to: raw.amount_to ?? '',
      search: raw.search ?? '',
    };
  }

  function currentFilters() {
    state.qlhoadonFilter = normalizeFilters(state.qlhoadonFilter);
    return state.qlhoadonFilter;
  }

  function readFiltersFromUI() {
    return normalizeFilters({
      customer_id: $('qlCustomer')?.value || 'all',
      status: $('qlStatus')?.value || 'all',
      from: $('qlFrom')?.value || '',
      to: $('qlTo')?.value || '',
      amount_from: $('qlAmountFrom')?.value || '',
      amount_to: $('qlAmountTo')?.value || '',
      search: $('qlSearch')?.value || '',
    });
  }

  function setUIFromFilters(filters) {
    if ($('qlCustomer')) $('qlCustomer').value = filters.customer_id || 'all';
    if ($('qlStatus')) $('qlStatus').value = filters.status || 'all';
    if ($('qlFrom')) $('qlFrom').value = filters.from || '';
    if ($('qlTo')) $('qlTo').value = filters.to || '';
    if ($('qlAmountFrom')) $('qlAmountFrom').value = filters.amount_from || '';
    if ($('qlAmountTo')) $('qlAmountTo').value = filters.amount_to || '';
    if ($('qlSearch')) $('qlSearch').value = filters.search || '';
  }

  function customerOptionsHtml(selectedId = 'all') {
    return (state.customers || [])
      .map((c) => `
        <option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>
          ${esc(c.name)}
        </option>
      `)
      .join('');
  }

  function matchesText(value, query) {
    return String(value || '').toLowerCase().includes(String(query || '').trim().toLowerCase());
  }

  function filterOrdersClientSide(orders, filters) {
    const f = normalizeFilters(filters);

    return (orders || []).filter((o) => {
      const q = String(f.search || '').trim().toLowerCase();
      if (q) {
        const haystack = [
          o.order_code,
          o.customer_name,
          o.customer_phone,
          o.customer_address,
          o.note,
        ].join(' ').toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      if (f.customer_id !== 'all' && String(o.customer_id || '') !== String(f.customer_id)) {
        return false;
      }

      if (f.status === 'paid' && !o.is_paid) return false;
      if (f.status === 'unpaid' && o.is_paid) return false;

      if (f.from) {
        const from = new Date(f.from);
        if (new Date(o.created_at) < from) return false;
      }

      if (f.to) {
        const to = new Date(f.to);
        to.setHours(23, 59, 59, 999);
        if (new Date(o.created_at) > to) return false;
      }

      if (f.amount_from !== '' && f.amount_from !== null && f.amount_from !== undefined) {
        if (Number(o.total_amount || 0) < Number(f.amount_from)) return false;
      }

      if (f.amount_to !== '' && f.amount_to !== null && f.amount_to !== undefined) {
        if (Number(o.total_amount || 0) > Number(f.amount_to)) return false;
      }

      return true;
    });
  }

  function renderSummaryCards(list) {
    const totalOrders = list.length;
    const revenue = list.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const paid = list.reduce((sum, o) => sum + (o.is_paid ? 1 : 0), 0);
    const unpaid = totalOrders - paid;

    return `
      <div class="summary-grid mb-4">
        ${cardHtml('Số đơn hiển thị', totalOrders, 'Kết quả theo bộ lọc hiện tại')}
        ${cardHtml('Doanh thu', money(revenue), 'Tổng tiền của danh sách đang xem')}
        ${cardHtml('Đã trả', paid, 'Số đơn đã thanh toán')}
        ${cardHtml('Chưa trả', unpaid, 'Số đơn chưa thanh toán')}
      </div>
    `;
  }

  function renderLoadingBox(message = 'Đang tải hóa đơn...') {
    pageContent.innerHTML = `
      <div class="panel text-center py-5">
        <div class="text-muted">${esc(message)}</div>
      </div>
    `;
  }

  function renderErrorBox(message = 'Không thể tải hóa đơn.') {
    pageContent.innerHTML = `
      <div class="panel text-center py-5">
        <div class="text-danger fw-semibold">${esc(message)}</div>
      </div>
    `;
  }

  async function loadQLHoaDonOrders() {
    state.qlhoadonLoading = true;
    try {
      const res = await api('/api/orders');
      state.qlhoadonOrders = Array.isArray(res.data) ? res.data : [];
      state.qlhoadonLoaded = true;
      return state.qlhoadonOrders;
    } finally {
      state.qlhoadonLoading = false;
    }
  }

  function orderActionButtons(order) {
    const canManage = true;
    return `
      <button class="btn btn-outline-secondary btn-sm" data-action="ql-view-order" data-id="${order.id}">Xem</button>
      <button class="btn btn-outline-primary btn-sm" data-action="ql-edit-order" data-id="${order.id}">Sửa</button>
      <button class="btn btn-outline-success btn-sm" data-action="ql-toggle-paid" data-id="${order.id}" data-paid="${order.is_paid ? '0' : '1'}">
        ${order.is_paid ? 'Bỏ trả' : 'Đã trả'}
      </button>
      <button class="btn btn-outline-danger btn-sm" data-action="ql-delete-order" data-id="${order.id}">Xóa</button>
    `;
  }

  function renderOrdersTable(list) {
    const rows = list.map((o, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><b>${esc(o.order_code)}</b></td>
        <td>${esc(o.customer_name || '')}</td>
        <td>${shortDate(o.created_at)}</td>
        <td>${money(o.total_amount)}</td>
        <td>
          <span class="badge ${o.is_paid ? 'text-bg-success' : 'text-bg-warning'}">
            ${o.is_paid ? 'Đã trả' : 'Chưa trả'}
          </span>
        </td>
        <td class="table-actions">
          ${orderActionButtons(o)}
        </td>
      </tr>
    `).join('');

    return `
      <div class="table-wrap">
        <table class="table align-middle table-hover">
          <thead>
            <tr>
              <th>#</th>
              <th>Mã đơn</th>
              <th>Khách hàng</th>
              <th>Ngày tạo</th>
              <th>Tổng tiền</th>
              <th>Thanh toán</th>
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

  function renderOrdersCards(list) {
    const cards = list.map((o) => `
      <div class="mobile-item">
        <div class="mobile-item-grid">
          <div>
            <div class="mobile-item-title">${esc(o.order_code)} • ${esc(o.customer_name || '')}</div>
            <div class="mobile-item-sub">Ngày: ${shortDate(o.created_at)} • Tổng: <b>${money(o.total_amount)}</b></div>
            <div class="mobile-item-sub">
              Trạng thái:
              <span class="badge ${o.is_paid ? 'text-bg-success' : 'text-bg-warning'}">
                ${o.is_paid ? 'Đã trả' : 'Chưa trả'}
              </span>
            </div>
          </div>
          <div class="text-end d-grid gap-2">
            <button class="btn btn-outline-secondary btn-sm" data-action="ql-view-order" data-id="${o.id}">Xem</button>
            <button class="btn btn-outline-primary btn-sm" data-action="ql-edit-order" data-id="${o.id}">Sửa</button>
            <button class="btn btn-outline-success btn-sm" data-action="ql-toggle-paid" data-id="${o.id}" data-paid="${o.is_paid ? '0' : '1'}">
              ${o.is_paid ? 'Bỏ trả' : 'Đã trả'}
            </button>
            <button class="btn btn-outline-danger btn-sm" data-action="ql-delete-order" data-id="${o.id}">Xóa</button>
          </div>
        </div>
      </div>
    `).join('');

    return `<div class="mobile-list">${cards || '<div class="text-muted">Chưa có dữ liệu</div>'}</div>`;
  }

  async function ensureDataLoaded() {
    if (state.qlhoadonLoading) return;

    if (!state.qlhoadonLoaded) {
      renderLoadingBox();
      try {
        await loadQLHoaDonOrders();
      } catch (error) {
        console.error(error);
        renderErrorBox(error.message || 'Không thể tải hóa đơn.');
        return;
      }
    }

    if (!Array.isArray(state.customers) || !state.customers.length) {
      try {
        await loadCustomers();
      } catch (_) {}
    }
  }

  async function refreshPageAfterAction() {
    try {
      await loadQLHoaDonOrders();
      if (state.page === 'qlhoadon') {
        await renderQLHoaDonPage();
      }
    } catch (error) {
      toast(error.message || 'Không thể làm mới danh sách hóa đơn.', 'error');
    }
  }

  async function applySearch() {
    state.qlhoadonFilter = readFiltersFromUI();
    state.qlhoadonLoaded = false;
    await loadQLHoaDonOrders();
    await renderQLHoaDonPage();
  }

  async function resetSearch() {
    state.qlhoadonFilter = { ...DEFAULT_FILTER };
    setUIFromFilters(state.qlhoadonFilter);
    state.qlhoadonLoaded = false;
    await loadQLHoaDonOrders();
    await renderQLHoaDonPage();
  }

  async function handleOrderAction(action, id, btn) {
    const order = (state.qlhoadonOrders || []).find((x) => String(x.id) === String(id));
    if (!order) return;

    if (action === 'ql-view-order') {
      openOrderDetail(order);
      return;
    }

    if (action === 'ql-edit-order') {
      openOrderModal(order);
      return;
    }

    if (action === 'ql-toggle-paid') {
      const paid = btn.dataset.paid === '1';
      const label = paid ? 'đánh dấu là đã trả tiền' : 'bỏ trạng thái đã trả tiền';
      showConfirmModal(
        'Xác nhận thanh toán',
        `<div>Bạn có chắc muốn <b>${label}</b> cho hóa đơn <b>${esc(order.order_code)}</b>?</div>`,
        async () => {
          await api(`/api/orders/${id}/pay`, {
            method: 'PUT',
            body: JSON.stringify({ is_paid: paid }),
          });
          toast('Đã cập nhật trạng thái thanh toán.');
          await refreshPageAfterAction();
        }
      );
      return;
    }

    if (action === 'ql-delete-order') {
      showConfirmModal(
        'Xóa hóa đơn',
        `<div>Bạn có chắc chắn muốn xóa hóa đơn <b>${esc(order.order_code)}</b>?</div>`,
        async () => {
          await api(`/api/orders/${id}`, { method: 'DELETE', body: '{}' });
          toast('Đã xóa hóa đơn.');
          await refreshPageAfterAction();
        }
      );
    }
  }

  async function renderQLHoaDonPage() {
    if (!state.user) {
      pageContent.innerHTML = `
        <div class="panel">
          <div class="alert alert-soft mb-0">
            Bạn đang ở chế độ xem công khai. Vui lòng đăng nhập để quản lý hóa đơn.
          </div>
        </div>
      `;
      return;
    }

    if (state.page !== 'qlhoadon') return;

    await ensureDataLoaded();
    if (state.page !== 'qlhoadon') return;

    const filters = currentFilters();
    setUIFromFilters(filters);

    const list = filterOrdersClientSide(state.qlhoadonOrders || [], filters);

    const customerOptions = customerOptionsHtml(filters.customer_id);

    const summary = renderSummaryCards(list);
    const table = renderOrdersTable(list);
    const cards = renderOrdersCards(list);

    pageContent.innerHTML = `
      ${summary}

      <div class="panel mb-4">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h5 class="mb-1">Quản lý hóa đơn</h5>
            <div class="text-muted small">Lọc nhanh, xem nhanh, sửa nhanh, thanh toán nhanh.</div>
          </div>
        </div>

        <div class="ql-filter-box">

          <!-- HÀNG 1 -->
          <div class="ql-filter-row">
            
            <div class="ql-field ql-search">
              <input id="qlSearch" class="form-control"
                placeholder="🔍 Mã đơn, tên khách, SĐT, ghi chú..."
                value="${esc(filters.search)}">
            </div>

            <div class="ql-field">
              <select id="qlCustomer" class="form-select">
                <option value="all">Tất cả khách</option>
                ${customerOptions}
              </select>
            </div>

            <div class="ql-field">
              <select id="qlStatus" class="form-select">
                <option value="all">Tất cả</option>
                <option value="paid">Đã trả</option>
                <option value="unpaid">Chưa trả</option>
              </select>
            </div>

          </div>

          <!-- HÀNG 2 -->
          <div class="ql-filter-row">

            <div class="ql-field">
              <input id="qlFrom" type="date" class="form-control" value="${filters.from}">
            </div>

            <div class="ql-field">
              <input id="qlTo" type="date" class="form-control" value="${filters.to}">
            </div>

            <div class="ql-field">
              <input id="qlAmountFrom" type="number" min="0" class="form-control"
                placeholder="Từ tiền" value="${filters.amount_from}">
            </div>

            <div class="ql-field">
              <input id="qlAmountTo" type="number" min="0" class="form-control"
                placeholder="Đến tiền" value="${filters.amount_to}">
            </div>

            <!-- ACTION -->
            <div class="ql-actions">
              <button class="btn btn-pink" data-action="ql-search">
                Tìm
                <img src="/img/image (1).png" alt="icon" style="width: 18px; height: 18px; margin-left: 5px; vertical-align: middle;">
              </button>
              
              <button class="btn btn-outline-pink" data-action="ql-reset">
                ↻ Reset
              </button>
            </div>

          </div>

        </div>
        </div>
      </div>

      <div class="panel">
        ${table}
        ${cards}
      </div>
    `;

    if (!window.__qlhoadonEventsBound) {
      window.__qlhoadonEventsBound = true;

      pageContent.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;

        if (action === 'ql-search') {
          await applySearch();
          return;
        }

        if (action === 'ql-reset') {
          await resetSearch();
          return;
        }

        if (action === 'ql-view-order' || action === 'ql-edit-order' || action === 'ql-toggle-paid' || action === 'ql-delete-order') {
          await handleOrderAction(action, btn.dataset.id, btn);
          return;
        }
      });

      pageContent.addEventListener('keydown', async (e) => {
        const target = e.target;
        if (!target) return;

        if (['qlSearch', 'qlCustomer', 'qlStatus', 'qlFrom', 'qlTo', 'qlAmountFrom', 'qlAmountTo'].includes(target.id) && e.key === 'Enter') {
          e.preventDefault();
          await applySearch();
        }
      });

      document.addEventListener('hidden.bs.modal', async (e) => {
        if (e.target && e.target.id === 'formModal' && state.page === 'qlhoadon') {
          await refreshPageAfterAction();
        }
      });
    }
  }

  window.renderQLHoaDonPage = renderQLHoaDonPage;
  window.loadQLHoaDonOrders = loadQLHoaDonOrders;
  window.refreshQLHoaDonPage = refreshPageAfterAction;
})();