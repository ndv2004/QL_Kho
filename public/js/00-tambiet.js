/* 00-tambiet.js
   Backup database:
   - Chỉ hiện khi đã đăng nhập
   - Bấm nút => mở pane giữa màn hình
   - Xác nhận => gọi API /api/database/export
   - Tải file ZIP về máy
*/

(function () {
  if (window.__databaseBackupBound) return;
  window.__databaseBackupBound = true;

  const BTN_ID = 'btnExportDatabase';
  const OVERLAY_ID = 'dbExportOverlay';
  const DIALOG_ID = 'dbExportDialog';
  const STYLE_ID = 'dbExportStyle';

  let loggedIn = false;
  let exporting = false;

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[m]));
  }

  function fileName() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `database_backup_${yyyy}${mm}${dd}.zip`;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, .55);
        backdrop-filter: blur(4px);
        z-index: 3000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }

      #${OVERLAY_ID}.show {
        display: flex;
      }

      #${DIALOG_ID} {
        width: min(860px, 100%);
        background: #fff;
        border-radius: 28px;
        box-shadow: 0 30px 90px rgba(0,0,0,.28);
        overflow: hidden;
        transform: scale(.98);
        animation: dbFadeIn .18s ease forwards;
      }

      @keyframes dbFadeIn {
        to { transform: scale(1); }
      }

      .db-head {
        padding: 26px 28px 18px;
        border-bottom: 1px solid #f3d7e6;
        background: linear-gradient(180deg, #fff, #fff7fb);
      }

      .db-title {
        margin: 0;
        font-size: 1.6rem;
        font-weight: 900;
        color: #b03b78;
        letter-spacing: .01em;
      }

      .db-body {
        padding: 24px 28px 20px;
      }

      .db-text {
        font-size: 1.03rem;
        line-height: 1.8;
        color: #374151;
        margin: 0 0 16px;
      }

      .db-note {
        background: #fff1f7;
        border: 1px solid #f5bfd7;
        color: #a33b74;
        border-radius: 18px;
        padding: 16px 18px;
        font-size: 1rem;
        line-height: 1.8;
      }

      .db-note p {
        margin: 0 0 10px;
      }

      .db-note p:last-child {
        margin-bottom: 0;
      }

      .db-foot {
        padding: 18px 28px 26px;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        flex-wrap: wrap;
        border-top: 1px solid #f3d7e6;
        background: #fff;
      }

      .db-btn {
        border: 0;
        border-radius: 14px;
        padding: 12px 18px;
        font-weight: 800;
        cursor: pointer;
        min-width: 130px;
        font-size: .96rem;
      }

      .db-btn.gray {
        background: #f1e7ed;
        color: #7a3f63;
      }

      .db-btn.pink {
        background: linear-gradient(180deg, #f48fb1, #e91e63);
        color: #fff;
        box-shadow: 0 10px 20px rgba(233, 30, 99, .22);
      }

      .db-btn.pink:disabled {
        opacity: .65;
        cursor: not-allowed;
      }

      .db-btn:active {
        transform: translateY(1px);
      }

      @media (max-width: 640px) {
        #${DIALOG_ID} {
          width: 100%;
          border-radius: 22px;
        }

        .db-head, .db-body, .db-foot {
          padding-left: 16px;
          padding-right: 16px;
        }

        .db-title {
          font-size: 1.25rem;
        }

        .db-btn {
          flex: 1 1 100%;
          min-width: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePane() {
    if (document.getElementById(OVERLAY_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    overlay.innerHTML = `
      <div id="${DIALOG_ID}" role="dialog" aria-modal="true" aria-labelledby="dbExportTitle">
        <div class="db-head">
          <h2 id="dbExportTitle" class="db-title">Xuất toàn bộ dữ liệu SQL</h2>
        </div>

        <div class="db-body">
          <p class="db-text">
            Hệ thống sẽ đóng gói toàn bộ database thành một file ZIP gồm
            <b>schema.sql</b>, các file <b>.csv</b> theo từng bảng và
            <b>metadata.json</b>.
          </p>

          <div class="db-note">
            <p>Việc sao lưu sẽ đảm bảo rằng sẽ không bị mất dữ liệu nếu bị tấn công.</p>
            <p>Và sau này không còn dùng nữa muốn chuyển sang cái mới sẽ không bị mất mát dữ liệu.</p>
          </div>
        </div>

        <div class="db-foot">
          <button type="button" class="db-btn gray" data-db-action="close">Hủy</button>
          <button type="button" class="db-btn pink" id="dbExportConfirmBtn" data-db-action="confirm">
            Xuất ngay
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePane();
    });
  }

  function getAuthUser() {
    if (window.state?.user) return window.state.user;
    return null;
  }

  async function syncAuth() {
    const cached = getAuthUser();
    if (cached) {
      loggedIn = true;
    } else {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const json = await res.json();
          loggedIn = Boolean(json?.data);
        } else {
          loggedIn = false;
        }
      } catch {
        loggedIn = false;
      }
    }

    const btn = document.getElementById(BTN_ID);
    if (btn) btn.classList.toggle('d-none', !loggedIn);

    if (!loggedIn) closePane();
  }

  function openPane() {
    ensurePane();
    document.getElementById(OVERLAY_ID)?.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closePane() {
    document.getElementById(OVERLAY_ID)?.classList.remove('show');
    document.body.style.overflow = '';
  }

  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function exportDatabase() {
    if (exporting) return;

    await syncAuth();
    if (!loggedIn) {
      alert('Bạn cần đăng nhập trước khi xuất dữ liệu.');
      return;
    }

    const btn = document.getElementById('dbExportConfirmBtn');
    exporting = true;

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Đang xuất...';
    }

    try {
      const res = await fetch('/api/database/export', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/zip' },
      });

      if (!res.ok) {
        let msg = 'Không thể xuất dữ liệu.';
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const body = await res.json();
            msg = body?.message || msg;
          } else {
            const text = await res.text();
            if (text) msg = text;
          }
        } catch {}
        throw new Error(msg);
      }

      const blob = await res.blob();
      downloadBlob(blob);
      closePane();
    } catch (err) {
      alert(err?.message || 'Không thể xuất dữ liệu.');
    } finally {
      exporting = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Xuất ngay';
      }
    }
  }

  function bindEvents() {
    document.addEventListener('click', (e) => {
      const exportBtn = e.target.closest(`#${BTN_ID}`);
      if (exportBtn) {
        e.preventDefault();
        openPane();
        return;
      }

      const actionBtn = e.target.closest('[data-db-action]');
      if (!actionBtn) return;

      const action = actionBtn.getAttribute('data-db-action');
      if (action === 'close') closePane();
      if (action === 'confirm') exportDatabase();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePane();
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('#btnLogin') || e.target.closest('#btnLogout')) {
        setTimeout(syncAuth, 500);
      }
    });

    window.addEventListener('focus', syncAuth);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) syncAuth();
    });
  }

  async function init() {
    injectStyles();
    ensurePane();
    bindEvents();
    await syncAuth();
  }

  window.openDatabaseExportPane = openPane;
  window.closeDatabaseExportPane = closePane;
  window.exportDatabaseBackup = exportDatabase;
  window.refreshDatabaseExportAuth = syncAuth;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    setTimeout(init, 0);
  }
})();