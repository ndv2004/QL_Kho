/*
  08-congno-excel.js
  Xuất Excel báo cáo công nợ khách hàng (ExcelJS)
  - Bố cục gọn, giống mẫu kế toán
  - Chỉ kẻ viền ở bảng hóa đơn và dòng tổng cộng
  - Không dùng cột F
  - Mọi cột A:E có độ rộng bằng nhau
  - Mọi hàng có chiều cao đồng đều, chỉ tiêu đề lớn hơn một chút
  - Trạng thái chỉ hiển thị "Đã trả" cho hóa đơn đã thanh toán; chưa trả để trống
  - Có dòng ngày tháng trước phần Kế toán trưởng
  - Có dòng tổng cộng dưới bảng hóa đơn
*/

(function initCongNoExcelModule() {
  const COMPANY_NAME = 'CÔNG TY TNHH THƯƠNG MẠI VÀ SẢN XUẤT GIẤY QUANG VINH';
  const COMPANY_ADDRESS = 'Số Nhà 19, Ngõ 62, Phố Miêu Nha, TDP Số 2 Miêu Nha, Phường Tây Mỗ, Quận Nam Từ Liêm, Thành Phố Hà Nội';
  const REPORT_TITLE = 'BẢNG KÊ CÔNG NỢ KHÁCH HÀNG';
  const REPORTER_NAME = 'Tạ Khánh Ly';
  const ACCOUNTANT_TITLE = 'KẾ TOÁN TRƯỞNG';
  const FONT_NAME = 'Times New Roman';

  function safeText(value, fallback = '') {
    return String(value ?? fallback).trim();
  }

  function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function pad2(num) {
    return String(num).padStart(2, '0');
  }

  function formatDateOnly(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function formatDateTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function formatMoney(value) {
    return Math.round(safeNumber(value));
  }

  function formatMoneyText(value) {
    return new Intl.NumberFormat('vi-VN').format(formatMoney(value)) + ' VNĐ';
  }

  function excelSafeSheetName(name) {
    const cleaned = safeText(name || 'CongNo')
      .replace(/[\\/?*\[\]:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.slice(0, 31) || 'CongNo';
  }

  function titleCaseAscii(input) {
    const cleaned = safeText(input || 'KhachLe')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim();

    if (!cleaned) return 'KhachLe';

    return cleaned
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  }

  function fileNameFromCustomer(customer, now = new Date()) {
    const customerKey = titleCaseAscii(customer?.name || 'KhachLe');
    return `BangKeCongNo_${customerKey}_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}.xlsx`;
  }

  function ensureExcelJsAvailable() {
    if (typeof ExcelJS === 'undefined' || !ExcelJS.Workbook) {
      throw new Error('Thư viện ExcelJS chưa được tải. Hãy thêm exceljs.min.js vào index.html.');
    }
  }

  function normalizeOrders(orders) {
    return (Array.isArray(orders) ? orders : []).map((o, idx) => ({
      index: idx + 1,
      order_code: safeText(o?.order_code),
      created_date_text: formatDateOnly(o?.created_at),
      total_amount: formatMoney(o?.total_amount),
      is_paid: Boolean(o?.is_paid),
      status_text: o?.is_paid ? 'Đã trả' : '',
    }));
  }

  function calculateSummary(customer, orders) {
    const list = Array.isArray(orders) ? orders : [];
    const totalAmountFromOrders = list.reduce((sum, o) => sum + formatMoney(o?.total_amount), 0);
    const paidFromOrders = list.reduce((sum, o) => sum + (o?.is_paid ? formatMoney(o?.total_amount) : 0), 0);

    const totalAmount = Number.isFinite(Number(customer?.total_amount))
      ? formatMoney(customer.total_amount)
      : totalAmountFromOrders;

    const totalPaid = Number.isFinite(Number(customer?.total_paid))
      ? formatMoney(customer.total_paid)
      : paidFromOrders;

    const totalUnpaid = Number.isFinite(Number(customer?.total_unpaid))
      ? formatMoney(customer.total_unpaid)
      : Math.max(totalAmount - totalPaid, 0);

    return {
      totalAmount,
      totalPaid,
      totalUnpaid,
      countOrders: list.length,
    };
  }

  function setFont(cell, { size = 12, bold = false, italic = false } = {}) {
    cell.font = {
      name: FONT_NAME,
      size,
      bold,
      italic,
    };
  }

  function setAlignment(cell, { horizontal = 'left', vertical = 'middle', wrapText = true } = {}) {
    cell.alignment = {
      horizontal,
      vertical,
      wrapText,
    };
  }

  function setThinBorder(cell) {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  }

  function styleCell(cell, opts = {}) {
    setFont(cell, opts.font || {});
    setAlignment(cell, opts.alignment || {});
    if (opts.border) setThinBorder(cell);
    if (opts.fill) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: opts.fill },
      };
    }
    if (opts.numFmt) cell.numFmt = opts.numFmt;
  }

  function mergeAndSet(sheet, range, value, opts = {}) {
    sheet.mergeCells(range);
    const addr = range.split(':')[0];
    const cell = sheet.getCell(addr);
    cell.value = value;
    styleCell(cell, opts);
    return cell;
  }

  async function buildWorkbook(customer, orders) {
    ensureExcelJsAvailable();

    const safeCustomer = customer || {};
    const normalizedOrders = normalizeOrders(orders);
    const summary = calculateSummary(safeCustomer, normalizedOrders);
    const now = new Date();
    const reportDateText = formatDateTime(now);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = REPORTER_NAME;
    workbook.lastModifiedBy = REPORTER_NAME;
    workbook.created = now;
    workbook.modified = now;
    workbook.company = COMPANY_NAME;
    workbook.subject = 'Báo cáo công nợ khách hàng';
    workbook.title = 'Bảng kê công nợ';
    workbook.keywords = 'công nợ, hóa đơn, khách hàng';
    workbook.category = 'Report';

    const sheet = workbook.addWorksheet(excelSafeSheetName(`Bang ke cong no ${safeCustomer?.name || 'KhachLe'}`), {
      pageSetup: {
        paperSize: 9,
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.3,
          right: 0.3,
          top: 0.35,
          bottom: 0.35,
          header: 0.2,
          footer: 0.2,
        },
      },
      properties: {
        defaultRowHeight: 22,
      },
      views: [{ showGridLines: false }],
    });

    // 5 cột bằng nhau, không dùng cột F
    sheet.columns = [
      { width: 20 },
      { width: 22 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
    ];

    // Header công ty
    mergeAndSet(sheet, 'A1:E1', COMPANY_NAME, {
      font: { size: 14, bold: true },
      alignment: { horizontal: 'left' },
    });
    mergeAndSet(sheet, 'A2:E2', COMPANY_ADDRESS, {
      font: { size: 11, italic: true },
      alignment: { horizontal: 'left' },
    });

    // Tiêu đề
    mergeAndSet(sheet, 'A4:E4', REPORT_TITLE, {
      font: { size: 16, bold: true },
      alignment: { horizontal: 'center' },
    });

    // Thông tin khách hàng
    mergeAndSet(sheet, 'A6:A6', 'Họ và tên', {
      font: { size: 12, bold: true },
      alignment: { horizontal: 'left' },
    });
    mergeAndSet(sheet, 'B6:C6', safeText(safeCustomer.name, '—'), {
      font: { size: 12 },
      alignment: { horizontal: 'left' },
    });
    mergeAndSet(sheet, 'D6:D6', 'Số điện thoại', {
      font: { size: 12, bold: true },
      alignment: { horizontal: 'left' },
    });
    mergeAndSet(sheet, 'E6:E6', safeText(safeCustomer.phone, '—'), {
      font: { size: 12 },
      alignment: { horizontal: 'left' },
    });

    mergeAndSet(sheet, 'A7:A7', 'Địa chỉ', {
      font: { size: 12, bold: true },
      alignment: { horizontal: 'left' },
    });
    mergeAndSet(sheet, 'B7:E7', safeText(safeCustomer.address, '—'), {
      font: { size: 12 },
      alignment: { horizontal: 'left' },
    });

    mergeAndSet(sheet, 'A9:A9', 'Ngày xuất báo cáo', {
      font: { size: 12, bold: true },
      alignment: { horizontal: 'left' },
    });
    mergeAndSet(sheet, 'B9:E9', reportDateText, {
      font: { size: 12 },
      alignment: { horizontal: 'left' },
    });

    // Tổng hợp công nợ
    mergeAndSet(sheet, 'A10:E10', 'TỔNG HỢP CÔNG NỢ', {
      font: { size: 12, bold: true },
      alignment: { horizontal: 'left' },
    });

    const summaryRows = [
      ['Tổng tiền', summary.totalAmount, 'VNĐ'],
      ['Đã trả', summary.totalPaid, 'VNĐ'],
      ['Chưa trả', summary.totalUnpaid, 'VNĐ'],
      ['Số hóa đơn', summary.countOrders, ''],
    ];

    let row = 11;
    for (const [label, value, unit] of summaryRows) {
      mergeAndSet(sheet, `A${row}:A${row}`, label, {
        font: { size: 12, bold: true },
        alignment: { horizontal: 'left' },
      });
      mergeAndSet(sheet, `B${row}:B${row}`, value, {
        font: { size: 12 },
        alignment: { horizontal: 'right' },
        numFmt: '#,##0',
      });
      mergeAndSet(sheet, `C${row}:C${row}`, unit, {
        font: { size: 12 },
        alignment: { horizontal: 'left' },
      });
      row += 1;
    }

    // Danh sách hóa đơn
    mergeAndSet(sheet, 'A15:E15', 'DANH SÁCH HÓA ĐƠN', {
      font: { size: 12, bold: true },
      alignment: { horizontal: 'left' },
    });

    const headerRow = 16;
    const headers = ['STT', 'Mã HD', 'Ngày mua', 'Tổng tiền', 'Trạng thái'];
    const cols = ['A', 'B', 'C', 'D', 'E'];

    headers.forEach((title, idx) => {
      const cell = sheet.getCell(`${cols[idx]}${headerRow}`);
      cell.value = title;
      styleCell(cell, {
        font: { size: 12, bold: true },
        alignment: { horizontal: 'center' },
        border: true,
        fill: 'FFF2F2F2',
      });
    });

    let currentRow = 17;
    normalizedOrders.forEach((o) => {
      sheet.getCell(`A${currentRow}`).value = o.index;
      sheet.getCell(`B${currentRow}`).value = o.order_code;
      sheet.getCell(`C${currentRow}`).value = o.created_date_text;
      sheet.getCell(`D${currentRow}`).value = o.total_amount;
      sheet.getCell(`E${currentRow}`).value = o.status_text;

      styleCell(sheet.getCell(`A${currentRow}`), {
        font: { size: 12 },
        alignment: { horizontal: 'center' },
        border: true,
      });
      styleCell(sheet.getCell(`B${currentRow}`), {
        font: { size: 12 },
        alignment: { horizontal: 'left' },
        border: true,
      });
      styleCell(sheet.getCell(`C${currentRow}`), {
        font: { size: 12 },
        alignment: { horizontal: 'center' },
        border: true,
      });
      styleCell(sheet.getCell(`D${currentRow}`), {
        font: { size: 12 },
        alignment: { horizontal: 'right' },
        border: true,
        numFmt: '#,##0',
      });
      styleCell(sheet.getCell(`E${currentRow}`), {
        font: { size: 12 },
        alignment: { horizontal: 'center' },
        border: true,
      });

      currentRow += 1;
    });

    // Dòng tổng cộng dưới bảng hóa đơn
    const totalRow = currentRow;
    sheet.mergeCells(`A${totalRow}:C${totalRow}`);
    sheet.getCell(`A${totalRow}`).value = `TỔNG CỘNG (${summary.countOrders} hóa đơn)`;
    sheet.getCell(`D${totalRow}`).value = summary.totalAmount;
    sheet.getCell(`E${totalRow}`).value = '';

    for (const c of ['A', 'D', 'E']) {
      styleCell(sheet.getCell(`${c}${totalRow}`), {
        font: { size: 12, bold: true },
        alignment: { horizontal: c === 'D' ? 'right' : 'center' },
        border: true,
        fill: 'FFFCE4D6',
      });
    }
    sheet.getCell(`D${totalRow}`).numFmt = '#,##0';

    // Ghi chú
    const noteRow = totalRow + 2;
    sheet.mergeCells(`A${noteRow}:E${noteRow}`);
    sheet.getCell(`A${noteRow}`).value = 'Ghi chú: Các hóa đơn đã thanh toán và chưa thanh toán được tổng hợp từ hệ thống theo thời điểm xuất báo cáo.';
    styleCell(sheet.getCell(`A${noteRow}`), {
      font: { size: 11, italic: true },
      alignment: { horizontal: 'left' },
    });

    // Phần chữ ký
    const sigDateRow = noteRow + 3;
    const sigTitleRow = noteRow + 4;
    const sigHintRow = noteRow + 5;
    const sigNameRow = noteRow + 10;

    sheet.mergeCells(`C${sigDateRow}:E${sigDateRow}`);
    sheet.getCell(`C${sigDateRow}`).value = `Hà Nội, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
    styleCell(sheet.getCell(`C${sigDateRow}`), {
      font: { size: 12, italic: true },
      alignment: { horizontal: 'center' },
    });

    sheet.mergeCells(`A${sigTitleRow}:B${sigTitleRow}`);
    sheet.mergeCells(`C${sigTitleRow}:E${sigTitleRow}`);
    sheet.getCell(`A${sigTitleRow}`).value = 'Người lập biểu';
    sheet.getCell(`C${sigTitleRow}`).value = ACCOUNTANT_TITLE;
    styleCell(sheet.getCell(`A${sigTitleRow}`), {
      font: { size: 12, bold: true },
      alignment: { horizontal: 'center' },
    });
    styleCell(sheet.getCell(`C${sigTitleRow}`), {
      font: { size: 12, bold: true },
      alignment: { horizontal: 'center' },
    });

    sheet.mergeCells(`A${sigHintRow}:B${sigHintRow}`);
    sheet.mergeCells(`C${sigHintRow}:E${sigHintRow}`);
    sheet.getCell(`A${sigHintRow}`).value = '(Ký và ghi rõ họ tên)';
    sheet.getCell(`C${sigHintRow}`).value = '(Ký và ghi rõ họ tên)';
    styleCell(sheet.getCell(`A${sigHintRow}`), {
      font: { size: 11, italic: true },
      alignment: { horizontal: 'center' },
    });
    styleCell(sheet.getCell(`C${sigHintRow}`), {
      font: { size: 11, italic: true },
      alignment: { horizontal: 'center' },
    });

    sheet.mergeCells(`A${sigNameRow}:B${sigNameRow}`);
    sheet.mergeCells(`C${sigNameRow}:E${sigNameRow}`);
    sheet.getCell(`A${sigNameRow}`).value = REPORTER_NAME;
    sheet.getCell(`C${sigNameRow}`).value = '                 ';
    styleCell(sheet.getCell(`A${sigNameRow}`), {
      font: { size: 12 },
      alignment: { horizontal: 'center' },
    });
    styleCell(sheet.getCell(`C${sigNameRow}`), {
      font: { size: 12 },
      alignment: { horizontal: 'center' },
    });

    // Chiều cao hàng đồng đều
    for (let i = 1; i <= sigNameRow; i += 1) {
      sheet.getRow(i).height = 16;
    }
    sheet.getRow(4).height = 20;
    sheet.getRow(headerRow).height = 18;
    sheet.getRow(totalRow).height = 18;

    return workbook;
  }

  async function triggerDownload(workbook, filename) {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportCongNoExcel(customer, orders) {
    const safeCustomer = customer || {};
    const normalizedOrders = Array.isArray(orders) ? orders : [];

    if (!safeCustomer || !safeCustomer.id) {
      throw new Error('Không có dữ liệu khách hàng để xuất Excel.');
    }

    if (!normalizedOrders.length) {
      throw new Error('Khách hàng này chưa có hóa đơn để xuất.');
    }

    const workbook = await buildWorkbook(safeCustomer, normalizedOrders);
    const filename = fileNameFromCustomer(safeCustomer, new Date());
    await triggerDownload(workbook, filename);
  }

  window.exportCongNoExcel = exportCongNoExcel;
  window.buildCongNoExcelWorkbook = buildWorkbook;
})();
