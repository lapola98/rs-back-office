/* ── Admin Sidebar compartido ── */
function renderSidebar() {
  const currentPage = location.pathname.split('/').pop();
  console.log('currentPage:', currentPage);

  const links = [
    { section: 'Principal' },
    { href: 'admin-dashboard.html',      icon: '🏠', label: 'Dashboard' },
    { href: 'admin-companies.html',      icon: '🏢', label: 'Empresas',      badge: '<span class="sb-count" id="sb-co">—</span>' },
    { href: 'admin-onboarding.html',     icon: '🚀', label: 'Onboarding',    badge: '<span class="sb-badge-n" id="sb-ob" style="display:none">!</span>' },
    { href: 'admin-tasks.html',          icon: '✅', label: 'Tareas',        badge: '<span class="sb-badge-n" id="sb-tn">!</span>' },
    { href: 'admin-documents.html',      icon: '📁', label: 'Documentos',    badge: '<span class="sb-count" id="sb-dc">—</span>' },
    { href: 'admin-requests.html',       icon: '📝', label: 'Solicitudes',   badge: '<span class="sb-badge-n" id="sb-rq" style="display:none">!</span>' },
    { divider: true },
    { section: 'Módulos' },
    { href: 'admin-collections.html',    icon: '💰', label: 'Cobranza' },
    { href: '#',                         icon: '🧾', label: 'Facturación y Cartera' },
    { href: '#',                         icon: '📋', label: 'Contabilidad' },
    { href: '#',                         icon: '🏦', label: 'Tesorería' },
    { href: '#',                         icon: '👥', label: 'Gestión de Personal' },
    { divider: true },
    { section: 'Sistema' },
    { href: '#',                         icon: '👤', label: 'Usuarios' },
    { href: '#',                         icon: '⚙️', label: 'Configuración' },
    { href: '../index.html',             icon: '🌐', label: 'Ver sitio web' },
  ];

  const navHTML = links.map(item => {
    if (item.divider) return `<div class="sb-div"></div>`;
    if (item.section) return `<div class="sb-lbl">${item.section}</div>`;
    if (item.onlyOn && !item.onlyOn.includes(currentPage)) return '';
    const isActive = item.href === currentPage ? ' active' : '';
    const indent   = item.onlyOn ? ' style="padding-left:2.2rem"' : '';
    return `<a href="${item.href}" class="sb-link${isActive}"${indent}>
      <span class="sb-icon">${item.icon}</span>
      ${item.label}
      ${item.badge || ''}
    </a>`;
  }).join('');

  const html = `
    <a href="admin-dashboard.html" class="sb-logo">
      <div class="sb-mark">RS</div>
      <div class="sb-wm"><strong>RS Back Office</strong><span>Panel admin</span></div>
      <span class="admin-pill">⚙ Admin</span>
    </a>
    <nav class="sb-nav">${navHTML}</nav>
    <div class="sb-foot">
      <div class="u-pill">
        <div class="u-av" id="uAv">—</div>
        <div style="flex:1;min-width:0">
          <span class="u-name" id="uName">Cargando…</span>
          <span class="u-role">Administrador RS</span>
        </div>
        <button class="u-out" onclick="signOut()" title="Cerrar sesión">⎋</button>
      </div>
    </div>
  `;

  const el = document.getElementById('sidebar');
  if (el) el.innerHTML = html;
}

renderSidebar();