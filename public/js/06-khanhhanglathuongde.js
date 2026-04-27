/* 06-Khachhanglathuongde.js
   Bản thay thế hoàn chỉnh cho QL hóa đơn
   - 1 ngày  -> from = to = ngày đó
   - 1 số tiền -> amount_from = amount_to = số đó
   - Giữ nguyên logic cũ của hệ thống
   - Tái sử dụng openOrderModal, openOrderDetail, showConfirmModal, api, toast
*/

(function initKhachHangLaThuongDeCompleteModule() {
  if (window.__qlhoadonV3Initialized) return;
  window.__qlhoadonV3Initialized = true;

  const DEFAULT_FILTER = {
    customer_id: 'all',
    status: 'all',
    search: '',
    date: '',
    amount: '',
    from: '',
    to: '',
    amount_from: '',
    amount_to: '',
  };

  state.qlhoadonFilter = normalizeFilters(state.qlhoadonFilter || DEFAULT_FILTER);
  state.qlhoadonOrders = Array.isArray(state.qlhoadonOrders) ? state.qlhoadonOrders : [];
  state.qlhoadonLoaded = Boolean(state.qlhoadonLoaded);
  state.qlhoadonLoading = Boolean(state.qlhoadonLoading);

  function $(id) {
    return document.getElementById(id);
  }

  function injectStyles() {
    if ($('qlhoadon-v3-style')) return;

    const style = document.createElement('style');
    style.id = 'qlhoadon-v3-style';
    style.textContent = `
      .qlhoadon-page {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .qlhoadon-filter-box {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .qlhoadon-filter-row {
        display: grid;
        gap: 12px;
        align-items: end;
      }

      .qlhoadon-filter-row.top {
        grid-template-columns: 2fr 1fr 1fr auto;
      }

      .qlhoadon-filter-row.bottom {
        grid-template-columns: 1fr 1fr auto;
      }

      .qlhoadon-field {
        min-width: 0;
      }

      .qlhoadon-field .form-control,
      .qlhoadon-field .form-select {
        height: 48px;
        border-radius: 14px;
      }

      .qlhoadon-field .form-label {
        font-weight: 700;
        margin-bottom: .4rem;
      }

      .qlhoadon-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
      }

      .qlhoadon-note {
        font-size: .84rem;
        color: #8d7d8d;
        margin-top: 6px;
        line-height: 1.3;
      }

      .qlhoadon-summary-row {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .qlhoadon-card {
        border: 1px solid rgba(234,220,234,.9);
        border-radius: 20px;
        background: #fff;
        box-shadow: 0 12px 30px rgba(197, 149, 183, .12);
        padding: 18px;
      }

      .qlhoadon-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .qlhoadon-toolbar h5 {
        margin: 0;
      }

      .qlhoadon-toolbar .text-muted {
        margin-top: 4px;
      }

      .qlhoadon-badge-soft {
        background: #fde9f4;
        color: #9a4b7b;
        border: 1px solid #f3c7e1;
      }

      .qlhoadon-btn-primary {
        background: linear-gradient(135deg, #ea8ec7, #f3b3d9);
        color: #fff;
        border: none;
        font-weight: 700;
      }

      .qlhoadon-btn-primary:hover {
        filter: brightness(.97);
        color: #fff;
      }

      .qlhoadon-btn-outline {
        border: 1px solid #f0b7d9;
        color: #a24d7e;
        background: #fff;
        font-weight: 700;
      }

      .qlhoadon-btn-outline:hover {
        background: #fff0f7;
        color: #8d386f;
      }

      .qlhoadon-page .table-actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      @media (max-width: 1199.98px) {
        .qlhoadon-summary-row {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 991.98px) {
        .qlhoadon-filter-row.top,
        .qlhoadon-filter-row.bottom {
          grid-template-columns: 1fr 1fr;
        }

        .qlhoadon-actions {
          justify-content: flex-start;
          grid-column: 1 / -1;
        }
      }

      @media (max-width: 767.98px) {
        .qlhoadon-summary-row {
          grid-template-columns: 1fr;
        }

        .qlhoadon-filter-row.top,
        .qlhoadon-filter-row.bottom {
          grid-template-columns: 1fr;
        }

        .qlhoadon-actions {
          justify-content: space-between;
        }

        .qlhoadon-card {
          padding: 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeFilters(raw = {}) {
    const date = raw.date ?? '';
    const amount = raw.amount ?? '';

    const from = raw.from ?? (date || '');
    const to = raw.to ?? (date || '');
    const amount_from = raw.amount_from ?? (amount !== '' ? amount : '');
    const amount_to = raw.amount_to ?? (amount !== '' ? amount : '');

    return {
      customer_id: raw.customer_id ?? 'all',
      status: raw.status ?? 'all',
      search: raw.search ?? '',
      date: date || (from && to && String(from) === String(to) ? from : ''),
      amount: amount !== undefined && amount !== null ? String(amount) : '',
      from,
      to,
      amount_from,
      amount_to,
    };
  }

  function currentFilters() {
    state.qlhoadonFilter = normalizeFilters(state.qlhoadonFilter);
    return state.qlhoadonFilter;
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

  function readFiltersFromUI() {
    const date = $('qlDateSingle')?.value || '';
    const amount = $('qlAmountSingle')?.value || '';

    return normalizeFilters({
      customer_id: $('qlCustomer')?.value || 'all',
      status: $('qlStatus')?.value || 'all',
      search: $('qlSearch')?.value || '',
      date,
      amount,
      from: date,
      to: date,
      amount_from: amount,
      amount_to: amount,
    });
  }

  function setUIFromFilters(filters) {
    const f = normalizeFilters(filters);

    if ($('qlCustomer')) $('qlCustomer').value = f.customer_id || 'all';
    if ($('qlStatus')) $('qlStatus').value = f.status || 'all';
    if ($('qlSearch')) $('qlSearch').value = f.search || '';
    if ($('qlDateSingle')) $('qlDateSingle').value = f.date || f.from || f.to || '';
    if ($('qlAmountSingle')) {
      const amountValue =
        f.amount !== ''
          ? f.amount
          : (String(f.amount_from ?? '') === String(f.amount_to ?? '') ? String(f.amount_from ?? '') : '');
      $('qlAmountSingle').value = amountValue;
    }
  }

  function sameLocalDate(dateValue, inputDate) {
    if (!dateValue || !inputDate) return false;
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return false;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}` === inputDate;
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

      const exactDate = f.date || (f.from && f.to && String(f.from) === String(f.to) ? f.from : '');
      if (exactDate && !sameLocalDate(o.created_at, exactDate)) return false;

      const exactAmount =
        f.amount !== ''
          ? f.amount
          : (String(f.amount_from ?? '') === String(f.amount_to ?? '') ? String(f.amount_from ?? '') : '');
      if (exactAmount !== '' && Number(o.total_amount || 0) !== Number(exactAmount)) return false;

      return true;
    });
  }

  function renderSummaryCards(list) {
    const totalOrders = list.length;
    const revenue = list.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const paid = list.reduce((sum, o) => sum + (o.is_paid ? 1 : 0), 0);
    const unpaid = totalOrders - paid;

    return `
      <div class="qlhoadon-summary-row">
        ${cardHtml('Số đơn hiển thị', totalOrders, 'Kết quả theo bộ lọc hiện tại')}
        ${cardHtml('Doanh thu', money(revenue), 'Tổng tiền của danh sách đang xem')}
        ${cardHtml('Đã trả', paid, 'Số đơn đã thanh toán')}
        ${cardHtml('Chưa trả', unpaid, 'Số đơn chưa thanh toán')}
      </div>
    `;
  }

  function renderLoadingBox(message = 'Đang tải hóa đơn...') {
    pageContent.innerHTML = `
      <div class="qlhoadon-page">
        <div class="panel text-center py-5">
          <div class="text-muted">${esc(message)}</div>
        </div>
      </div>
    `;
  }

  function renderErrorBox(message = 'Không thể tải hóa đơn.') {
    pageContent.innerHTML = `
      <div class="qlhoadon-page">
        <div class="panel text-center py-5">
          <div class="text-danger fw-semibold">${esc(message)}</div>
        </div>
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
            ${o.note ? `<div class="mobile-item-sub">Ghi chú: ${esc(o.note)}</div>` : ''}
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
    await renderQLHoaDonPage();
  }

  async function resetSearch() {
    state.qlhoadonFilter = { ...DEFAULT_FILTER };
    setUIFromFilters(state.qlhoadonFilter);
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
      const confirmText = paid
        ? 'đánh dấu là đã trả tiền'
        : 'bỏ trạng thái đã trả tiền';

      showConfirmModal(
        'Xác nhận thanh toán',
        `<div>Bạn có chắc muốn <b>${confirmText}</b> cho hóa đơn <b>${esc(order.order_code)}</b>?</div>`,
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
          await api(`/api/orders/${id}`, { method: 'DELETE' });
          toast('Đã xóa hóa đơn.');
          await refreshPageAfterAction();
        }
      );
    }
  }

  async function renderQLHoaDonPage() {
    injectStyles();

    if (!state.user) {
      pageContent.innerHTML = `
        <div class="qlhoadon-page">
          <div class="panel">
            <div class="alert alert-soft mb-0">
              Bạn đang ở chế độ xem công khai. Vui lòng đăng nhập để quản lý hóa đơn.
            </div>
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
      <div class="qlhoadon-page">
        ${summary}

        <div class="panel qlhoadon-card">
          <div class="qlhoadon-toolbar mb-3">
            <div>
              <h5>Quản lý hóa đơn</h5>
              <div class="text-muted small">Lọc nhanh, xem nhanh, sửa nhanh, thanh toán nhanh.</div>
            </div>
          </div>

          <div class="qlhoadon-filter-box">
            <div class="qlhoadon-filter-row top">
              <div class="qlhoadon-field">
                <label class="form-label">Tìm</label>
                <input id="qlSearch" class="form-control" placeholder="Mã đơn, tên khách, SĐT, ghi chú..." value="${esc(filters.search)}">
              </div>

              <div class="qlhoadon-field">
                <label class="form-label">Tên khách hàng</label>
                <select id="qlCustomer" class="form-select">
                  <option value="all">Tất cả khách</option>
                  ${customerOptions}
                </select>
              </div>

              <div class="qlhoadon-field">
                <label class="form-label">Trạng thái</label>
                <select id="qlStatus" class="form-select">
                  <option value="all">Tất cả</option>
                  <option value="paid" ${filters.status === 'paid' ? 'selected' : ''}>Đã trả</option>
                  <option value="unpaid" ${filters.status === 'unpaid' ? 'selected' : ''}>Chưa trả</option>
                </select>
              </div>

            </div>

            <div class="qlhoadon-filter-row bottom">
              <div class="qlhoadon-field">
                <label class="form-label">Chọn ngày</label>
                <input id="qlDateSingle" type="date" class="form-control" value="${esc(filters.date || filters.from || filters.to || '')}">
              </div>

              <div class="qlhoadon-field">
                <label class="form-label">Lọc theo giá tiền</label>
                <input id="qlAmountSingle" type="number" min="0" class="form-control" placeholder="Nhập số tiền" value="${esc(
                  filters.amount !== ''
                    ? filters.amount
                    : (String(filters.amount_from ?? '') === String(filters.amount_to ?? '') ? String(filters.amount_from ?? '') : '')
                )}">
              </div>

              <div class="qlhoadon-actions">
                <button class="btn qlhoadon-btn-primary" data-action="ql-search" type="button">Tìm
                  <img src="/img/image (1).png" alt="icon" style="width: 18px; height: 18px; margin-left: 5px; vertical-align: middle;">
                </button>
                <button class="btn qlhoadon-btn-outline" data-action="ql-reset" type="button">Làm mới</button>
              </div>
            </div>
          </div>
        </div>

        <div class="panel qlhoadon-card">
          ${table}
          ${cards}
        </div>
      </div>
    `;

    if (!window.__qlhoadonV3Bound) {
      window.__qlhoadonV3Bound = true;

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

        if (['ql-view-order', 'ql-edit-order', 'ql-toggle-paid', 'ql-delete-order'].includes(action)) {
          await handleOrderAction(action, btn.dataset.id, btn);
        }
      });

      pageContent.addEventListener('keydown', async (e) => {
        const target = e.target;
        if (!target) return;

        if (
          ['qlSearch', 'qlCustomer', 'qlStatus', 'qlDateSingle', 'qlAmountSingle'].includes(target.id)
          && e.key === 'Enter'
        ) {
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