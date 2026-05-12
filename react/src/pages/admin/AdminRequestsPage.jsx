import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import styles from './AdminRequestsPage.module.css';

const CO_COLORS = ['#c9a84c', '#4a9fd4', '#22a66a', '#e8a020', '#9b59b6', '#e05c4b'];
const PRIO_LABEL = { urgent: '🔴 Urgente', high: '🟠 Alta', normal: '🔵 Normal', low: '⚪ Baja', medium: '🟡 Media' };
const PRIO_BADGE = { urgent: 'bErr', high: 'bWarn', normal: 'bInfo', medium: 'bGold', low: 'bN' };
const TYPE_ICO = { credit_note: '🧾', collections_followup: '📞', certificate: '📄', general_query: '💬' };

function hexToRgb(hex) {
  if (!hex || hex.startsWith('var')) return '150,150,150';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [companies, setCompanies] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('todas');
  const [filterCo, setFilterCo] = useState('todas');

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentReq, setCurrentReq] = useState(null);
  const [notes, setNotes] = useState('');
  const [noteMsg, setNoteMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rc, rreq] = await Promise.all([
        supabase.from('companies').select('id, name').order('name'),
        supabase
          .from('operational_requests')
          .select('id, title, description, status, priority, requested_at, company_id, created_by_user_id, metadata, operational_request_types(id, code, name)')
          .order('requested_at', { ascending: false }),
      ]);

      if (rc.error) throw rc.error;
      const cosMap = {};
      if (rc.data) {
        rc.data.forEach((c, i) => {
          cosMap[c.id] = { id: c.id, name: c.name, color: CO_COLORS[i % CO_COLORS.length] };
        });
        setCompanies(cosMap);
      }

      if (rreq.error) throw rreq.error;
      setRequests(rreq.data || []);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredRequests = requests.filter((r) => {
    const q = searchQuery.toLowerCase();
    const coName = (companies[r.company_id]?.name || '').toLowerCase();
    const matchQ = !q || r.title.toLowerCase().includes(q) || coName.includes(q);
    const matchCo = filterCo === 'todas' || r.company_id === filterCo;
    const matchS = filterStatus === 'todas' || r.status === filterStatus;
    return matchQ && matchCo && matchS;
  });

  const stats = {
    total: requests.length,
    open: requests.filter((r) => r.status === 'open').length,
    progress: requests.filter((r) => r.status === 'in_progress').length,
    resolved: requests.filter((r) => r.status === 'resolved').length,
  };

  const updateStatusInline = async (id, newStatus) => {
    const { error } = await supabase.from('operational_requests').update({ status: newStatus }).eq('id', id);
    if (error) {
      alert('Error: ' + error.message);
      return;
    }
    setRequests(requests.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
    if (currentReq?.id === id) {
      setCurrentReq({ ...currentReq, status: newStatus });
    }
  };

  const deleteRequestById = async (id, title) => {
    if (!window.confirm(`¿Eliminar "${title}"?`)) return;
    const { error } = await supabase.from('operational_requests').delete().eq('id', id);
    if (error) {
      alert('Error: ' + error.message);
      return;
    }
    setRequests(requests.filter((r) => r.id !== id));
    if (currentReq?.id === id) closeDrawer();
  };

  const openDrawer = (req) => {
    setCurrentReq(req);
    setNotes(req.metadata?.internal_notes || '');
    setNoteMsg({ text: '', type: '' });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => {
      setCurrentReq(null);
    }, 280);
  };

  const saveNotes = async () => {
    if (!currentReq) return;
    const metadata = { ...(currentReq.metadata || {}), internal_notes: notes.trim() };
    const { error } = await supabase.from('operational_requests').update({ metadata }).eq('id', currentReq.id);

    if (error) {
      setNoteMsg({ text: '❌ ' + error.message, type: 'err' });
    } else {
      setNoteMsg({ text: '✅ Notas guardadas', type: 'ok' });
      setCurrentReq({ ...currentReq, metadata });
      setRequests(requests.map((r) => (r.id === currentReq.id ? { ...r, metadata } : r)));
      setTimeout(() => setNoteMsg({ text: '', type: '' }), 3000);
    }
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className={styles.app}>
      {/* SIDEBAR PLACEHOLDER */}
      <aside className={styles.sb}>
        <a href="#" className={styles.sbLogo}>
          <div className={styles.sbMark}>RS</div>
          <div className={styles.sbWm}>
            <strong>RS Back Office</strong>
            <span>Admin</span>
          </div>
          <div className={styles.adminPill}>ADMIN</div>
        </a>
        <div className={styles.sbNav}>
          <div className={styles.sbLbl}>Principal</div>
          <a href="/admin/tasks" className={styles.sbLink}>
            <span className={styles.sbIcon}>✅</span> Tareas
          </a>
          <a href="/admin/task-templates" className={styles.sbLink}>
            <span className={styles.sbIcon}>📋</span> Plantillas
          </a>
          <a href="#" className={`${styles.sbLink} ${styles.sbLinkActive}`}>
            <span className={styles.sbIcon}>📥</span> Solicitudes
            {stats.open > 0 && <span className={styles.sbBadgeN}>{stats.open}</span>}
          </a>
        </div>
      </aside>

      {/* MAIN */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.tbLeft}>
            <div className={styles.tbBc}>
              Admin / <span>Solicitudes</span>
            </div>
            <div className={styles.tbTitle}>Solicitudes operativas</div>
          </div>
          <div className={styles.tbRight}>
            <div className={styles.tbDate}>
              {new Date().toLocaleDateString('es-CO', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
            <div className={styles.tbAv}>RS</div>
          </div>
        </header>

        <div className={styles.content}>
          <div className={styles.page}>
            {/* KPI ROW */}
            <div className={styles.statsRow}>
              <div className={styles.statCard} style={{ '--sc': '#c9a84c' }}>
                <div className={styles.statLbl}>Total</div>
                <div className={styles.statVal}>{stats.total}</div>
                <div className={styles.statSub}>todas las solicitudes</div>
              </div>
              <div className={styles.statCard} style={{ '--sc': '#e8a020' }}>
                <div className={styles.statLbl}>Abiertas</div>
                <div className={styles.statVal} style={{ color: '#e8a020' }}>
                  {stats.open}
                </div>
                <div className={styles.statSub}>esperan atención</div>
              </div>
              <div className={styles.statCard} style={{ '--sc': '#4a9fd4' }}>
                <div className={styles.statLbl}>En proceso</div>
                <div className={styles.statVal} style={{ color: '#4a9fd4' }}>
                  {stats.progress}
                </div>
                <div className={styles.statSub}>siendo gestionadas</div>
              </div>
              <div className={styles.statCard} style={{ '--sc': '#22a66a' }}>
                <div className={styles.statLbl}>Resueltas</div>
                <div className={styles.statVal} style={{ color: '#22a66a' }}>
                  {stats.resolved}
                </div>
                <div className={styles.statSub}>completadas</div>
              </div>
            </div>

            {/* TOOLBAR */}
            <div className={styles.toolbar}>
              <div className={styles.searchBox}>
                <span style={{ color: 'rgba(255,255,255,.25)', fontSize: '.82rem' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Buscar solicitud, empresa…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className={styles.tbSep}></div>
              <button
                className={`${styles.btnG} ${filterStatus === 'todas' ? styles.btnGOn : ''}`}
                onClick={() => setFilterStatus('todas')}
              >
                Todas
              </button>
              <button
                className={`${styles.btnG} ${filterStatus === 'open' ? styles.btnGOn : ''}`}
                onClick={() => setFilterStatus('open')}
              >
                🟡 Abiertas
              </button>
              <button
                className={`${styles.btnG} ${filterStatus === 'in_progress' ? styles.btnGOn : ''}`}
                onClick={() => setFilterStatus('in_progress')}
              >
                🔵 En proceso
              </button>
              <button
                className={`${styles.btnG} ${filterStatus === 'resolved' ? styles.btnGOn : ''}`}
                onClick={() => setFilterStatus('resolved')}
              >
                🟢 Resueltas
              </button>
              <button
                className={`${styles.btnG} ${filterStatus === 'closed' ? styles.btnGOn : ''}`}
                onClick={() => setFilterStatus('closed')}
              >
                ⚫ Cerradas
              </button>
            </div>

            {/* FILTRO POR EMPRESA */}
            <div className={styles.coFilterRow}>
              <span style={{ fontSize: '.67rem', color: 'rgba(255,255,255,.25)', whiteSpace: 'nowrap' }}>Por empresa:</span>
              <div
                className={`${styles.coChip} ${filterCo === 'todas' ? styles.coChipOn : ''}`}
                onClick={() => setFilterCo('todas')}
              >
                Todas
              </div>
              {Object.values(companies).map((c) => (
                <div
                  key={c.id}
                  className={`${styles.coChip} ${filterCo === c.id ? styles.coChipOn : ''}`}
                  onClick={() => setFilterCo(c.id)}
                >
                  <span className={styles.coChipDot} style={{ background: c.color }}></span>
                  {c.name}
                </div>
              ))}
            </div>

            {/* TABLA */}
            <div className={styles.tableWrap}>
              <div className={styles.tableHd}>
                <h3>Solicitudes</h3>
                <span>{loading ? 'cargando…' : `${filteredRequests.length} solicitud${filteredRequests.length !== 1 ? 'es' : ''}`}</span>
              </div>
              <table className={styles.tbl}>
                <thead>
                  <tr>
                    <th>Solicitud</th>
                    <th>Empresa</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Prioridad</th>
                    <th>Fecha</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <>
                      <tr><td colSpan="7"><div className={styles.sk} style={{ height: '14px', margin: '.5rem 1rem', width: '60%' }}></div></td></tr>
                      <tr><td colSpan="7"><div className={styles.sk} style={{ height: '14px', margin: '.5rem 1rem', width: '80%' }}></div></td></tr>
                      <tr><td colSpan="7"><div className={styles.sk} style={{ height: '14px', margin: '.5rem 1rem', width: '50%' }}></div></td></tr>
                    </>
                  ) : error ? (
                    <tr>
                      <td colSpan="7" style={{ color: '#e05c4b', padding: '1.2rem', fontSize: '.8rem' }}>
                        ⚠️ Error: {error}
                      </td>
                    </tr>
                  ) : filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan="7">
                        <div className={styles.emptyState}>
                          <div className={styles.emptyStateIcon}>📝</div>
                          <h3>Sin solicitudes</h3>
                          <p>No hay solicitudes que coincidan con los filtros.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((r) => {
                      const coInfo = companies[r.company_id];
                      const coName = coInfo?.name || 'Sin empresa';
                      const coColor = coInfo?.color || 'rgba(255,255,255,.25)';
                      const ini = coName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                      const ico = TYPE_ICO[r.operational_request_types?.code] || '📋';
                      const typeName = r.operational_request_types?.name || '—';

                      return (
                        <tr key={r.id}>
                          <td>
                            <div className={styles.tdW}>
                              {ico} {r.title}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                              <div
                                style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '6px',
                                  background: `rgba(${hexToRgb(coColor)},.15)`,
                                  color: coColor,
                                  fontSize: '.55rem',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {ini}
                              </div>
                              <span
                                style={{
                                  fontSize: '.75rem',
                                  color: 'rgba(255,255,255,.5)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '130px',
                                }}
                              >
                                {coName}
                              </span>
                            </div>
                          </td>
                          <td className={styles.tdM}>{typeName}</td>
                          <td>
                            <select
                              className={styles.stSel}
                              value={r.status}
                              onChange={(e) => updateStatusInline(r.id, e.target.value)}
                            >
                              <option value="open">🟡 Abierta</option>
                              <option value="in_progress">🔵 En proceso</option>
                              <option value="resolved">🟢 Resuelta</option>
                              <option value="closed">⚫ Cerrada</option>
                            </select>
                          </td>
                          <td>
                            <span className={`${styles.badge} ${styles[PRIO_BADGE[r.priority] || 'bN']}`}>
                              {PRIO_LABEL[r.priority] || r.priority || '—'}
                            </span>
                          </td>
                          <td className={styles.tdM}>{fmtDate(r.requested_at)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className={styles.actBtn} onClick={() => openDrawer(r)} title="Ver detalle">
                              👁
                            </button>
                            <button
                              className={`${styles.actBtn} ${styles.actBtnDel}`}
                              onClick={() => deleteRequestById(r.id, r.title)}
                              title="Eliminar"
                            >
                              🗑
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* DRAWER DETALLE */}
      {drawerOpen && (
        <>
          <div className={`${styles.drawerOverlay} ${styles.drawerOpen}`} onClick={closeDrawer}></div>
          <div className={`${styles.drawer} ${styles.drawerOpen}`}>
            <div className={styles.drawerHd}>
              <h3>Detalle solicitud</h3>
              <button className={styles.modalClose} onClick={closeDrawer}>
                ✕
              </button>
            </div>
            <div className={styles.drawerBody}>
              <div className={styles.sectionTitle}>Información</div>
              <div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLbl}>Empresa</span>
                  <span className={`${styles.infoVal} ${styles.infoValGold}`}>
                    {companies[currentReq?.company_id]?.name || '—'}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLbl}>Tipo</span>
                  <span className={styles.infoVal}>
                    {currentReq?.operational_request_types?.name || '—'}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLbl}>Prioridad</span>
                  <span className={styles.infoVal}>
                    {PRIO_LABEL[currentReq?.priority] || currentReq?.priority || '—'}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLbl}>Fecha solicitud</span>
                  <span className={styles.infoVal}>{fmtDate(currentReq?.requested_at)}</span>
                </div>
              </div>

              <div className={styles.sectionTitle}>Descripción del cliente</div>
              <div
                style={{
                  fontSize: '.8rem',
                  color: 'rgba(255,255,255,.5)',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  background: '#1a2230',
                  borderRadius: '10px',
                  padding: '.75rem .9rem',
                  border: '1px solid rgba(255,255,255,.07)',
                }}
              >
                {currentReq?.description || 'Sin descripción.'}
              </div>

              <div className={styles.sectionTitle}>Cambiar estado</div>
              <select
                className={styles.stSel}
                style={{ width: '100%', padding: '.55rem .85rem', fontSize: '.8rem' }}
                value={currentReq?.status || 'open'}
                onChange={(e) => updateStatusInline(currentReq.id, e.target.value)}
              >
                <option value="open">🟡 Abierta</option>
                <option value="in_progress">🔵 En proceso</option>
                <option value="resolved">🟢 Resuelta</option>
                <option value="closed">⚫ Cerrada</option>
              </select>

              <div className={styles.sectionTitle}>Notas internas</div>
              <textarea
                className={styles.noteArea}
                placeholder="Notas visibles solo para el equipo RS…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              ></textarea>
              {noteMsg.text && (
                <div
                  style={{
                    fontSize: '.74rem',
                    marginTop: '.4rem',
                    color: noteMsg.type === 'err' ? '#e05c4b' : '#22a66a',
                  }}
                >
                  {noteMsg.text}
                </div>
              )}
            </div>
            <div className={styles.drawerFt}>
              <button
                className={styles.btnDanger}
                onClick={() => deleteRequestById(currentReq.id, currentReq.title)}
              >
                🗑 Eliminar
              </button>
              <button className={styles.btnS} onClick={closeDrawer}>
                Cerrar
              </button>
              <button className={styles.btnP} onClick={saveNotes}>
                Guardar notas
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
