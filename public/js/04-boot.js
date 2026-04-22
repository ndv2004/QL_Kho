
async function afterLogin() {
  await Promise.all([loadProducts(), loadSuppliers(), loadCustomers()]);
  renderNav();
  const page = firstAccessiblePage();
  state.page = page;
  await navigate(page);
}

async function boot() {
  renderNav();
  initModalHandlers();
  await fetchMe();
  await loadProducts();
  if (state.user) {
    await Promise.all([loadSuppliers(), loadCustomers()]);
    const page = firstAccessiblePage();
    state.page = page;
    renderNav();
    await navigate(page);
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
