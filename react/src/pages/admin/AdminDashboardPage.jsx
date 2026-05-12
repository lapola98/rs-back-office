import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useSEO } from '../../hooks/useSEO';
import styles from './AdminDashboardPage.module.css';

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const isOverdue = (t) => {
  if (!t.due_date || t.status !== 'pending') return false;
  return new Date(t.due_date) < new Date(new Date().toDateString());
};

const prioBadge = (t) => {
  if (isOverdue(t)) return <span className={styles.pHi}>🔴 Vencida</span>;
  if (!t.due_date) return <span className={styles.pLo}>Sin fecha</span>;
  const days = Math.ceil((new Date(t.due_date) - new Date()) / 86400000);
  if (days <= 3) return <span className={styles.pHi}>🔴 {days}d</span>;
  if (days <= 7) return <span className={styles.pMed}>🟡 {days}d</span>;
  return <span className={styles.pLo}>🔵 {days}d</span>;
};

const statusBadge = (s) => {
  const m = {
    active: ['bOk', 'Activa'],
    inactive: ['bN', 'Inactiva'],
    pending: ['bWarn', 'Pendiente'],
    overdue: ['bErr', 'En mora']
  };
  const [c, l] = m[s] || ['bN', s || '—'];
  return <span className={`${styles.badge} ${styles[c]}`}>{l}</span>;
};

const docBadge = (s) => {
  const m = {
    available: ['bOk', 'Disponible'],
    pending: ['bWarn', 'Pendiente'],
    draft: ['bN', 'Borrador'],
    archived: ['bN', 'Archivado']
  };
  const [c, l] = m[s] || ['bN', s || '—'];
  return <span className={`${styles.badge} ${styles[c]}`}>{l}</span>;
};

const Sparkline = ({ vals, isHi = false }) => {
  const max = Math.max(...vals, 1);
  return (
    <div className={styles.sparkline}>
      {vals.map((v, i) => (
        <div
          key={i}
          className={`${styles.sp} ${i === vals.length - 1 || isHi ? styles.spHi : ''}`}
          style={{ height: `${Math.max(4, Math.round((v / max) * 28))}px` }}
        ></div>
      ))}
    </div>
  );
};

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  useSEO({
    title: 'Dashboard Administrativo',
    description: 'Panel de control de RS Back Office para la gestión de clientes, tareas y documentos.',
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [data, setData] = useState({
    companies: [],
    tasks: [],
    documents: [],
    dashboards: [],
    profiles: [],
    requests: []
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        navigate('/login');
        return;
      }
      setUser(session.user);

      const [r1, r2, r3, r4, r5, r6] = await Promise.all([
        supabase.from('companies').select('id, name, status, billing_module, accounting_module, treasury_module, hr_module, created_at').order('created_at', { ascending: false }),
        supabase.from('tasks').select('id, title, status, due_date, company_id, companies(name)').order('due_date', { ascending: true }).limit(60),
        supabase.from('documents').select('id, title, category, status, created_at, storage_path, company_id, companies(name)').order('created_at', { ascending: false }).limit(20),
        supabase.from('embedded_dashboards').select('id, title, tool, active, company_id, companies(name)').eq('active', true),
        supabase.from('profiles').select('id, full_name, role, company_id'),
        supabase.from('operational_requests').select('id, title, status, priority, requested_at, company_id, operational_request_types(name)').in('status', ['open', 'in_progress']).order('requested_at', { ascending: false }).limit(10),
      ]);

      if (r1.error) throw new Error('companies: ' + r1.error.message);
      if (r2.error) throw new Error('tasks: ' + r2.error.message);
      if (r3.error) throw new Error('documents: ' + r3.error.message);
      if (r4.error) throw new Error('embedded_dashboards: ' + r4.error.message);
      if (r5.error) throw new Error('profiles: ' + r5.error.message);
      if (r6.error) throw new Error('requests: ' + r6.error.message);

      setData({
        companies: r1.data || [],
        tasks: r2.data || [],
        documents: r3.data || [],
        dashboards: r4.data || [],
        profiles: r5.data || [],
        requests: r6.data || []
      });
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const completeTask = async (id) => {
    const { error: err } = await supabase.from('tasks').update({ status: 'completed' }).eq('id', id);
    if (err) {
      alert('Error: ' + err.message);
      return;
    }
    setData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? { ...t, status: 'completed' } : t)
    }));
  };

  const c = data.companies;
  const t = data.tasks;
  const d = data.documents;
  const dh = data.dashboards;

  const activeCos = c.filter(x => x.status === 'active').length;
  const pendingTasks = t.filter(x => x.status === 'pending').length;
  const overdueTasks = t.filter(x => isOverdue(x) && x.status === 'pending').length;

  const ovTasks = t.filter(x => isOverdue(x) && x.status === 'pending');
  const upTasks = t.filter(x => !isOverdue(x) && x.status === 'pending');
  const topTasks = [...ovTasks, ...upTasks].slice(0, 7);

  const topCos = c.slice(0, 8);
  const topDocs = d.slice(0, 8);

  const reqs = data.requests;
  const openReqs = reqs.filter(r => r.status === 'open').length;
  const progReqs = reqs.filter(r => r.status === 'in_progress').length;

  const catIcon = { invoice: '📕', report: '📗', contract: '📘', payroll: '📙' };
  const ST = { open: 'bWarn', in_progress: 'bInfo', resolved: 'bOk', closed: 'bN' };
  const SL = { open: 'Abierta', in_progress: 'En proceso', resolved: 'Resuelta', closed: 'Cerrada' };

  const cosMap = {};
  c.forEach(x => { cosMap[x.id] = x.name; });

  const pct = (f) => Math.round((c.filter(x => x[f]).length / Math.max(c.length, 1)) * 100);

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';

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
          <a href="/admin/dashboard" className={`${styles.sbLink} ${styles.sbLinkActive}`}>
            <span className={styles.sbIcon}>📊</span> Dashboard
          </a>
          <a href="/admin/tasks" className={styles.sbLink}>
            <span className={styles.sbIcon}>✅</span> Tareas
          </a>
          <a href="/admin/task-templates" className={styles.sbLink}>
            <span className={styles.sbIcon}>📋</span> Plantillas
          </a>
          <a href="/admin/requests" className={styles.sbLink}>
            <span className={styles.sbIcon}>📥</span> Solicitudes
          </a>
          <a href="/admin/documents" className={styles.sbLink}>
            <span className={styles.sbIcon}>📁</span> Documentos
          </a>
        </div>
      </aside>

      {/* MAIN */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <div className={styles.tbBc}>Admin / <span>Dashboard</span></div>
            <div className={styles.tbTitle}>{greeting} — Vista general</div>
          </div>
          <div className={styles.tbRight}>
            <div className={styles.connPill}>
              <span className={`${styles.connDot} ${loading ? styles.cLoading : error ? styles.cErr : styles.cOk}`}></span>
              <span>{loading ? 'Conectando…' : error ? 'Sin conexión' : 'Conectado'}</span>
            </div>
            <div className={styles.tbDate}>
              {new Date().toLocaleDateString('es-CO', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
            <button className={styles.tbIco} onClick={loadData} title="Actualizar datos">🔄</button>
            <div className={styles.tbAv}>{user?.email?.slice(0, 2).toUpperCase() || '—'}</div>
          </div>
        </header>

        <div className={styles.content}>
          <div className={styles.page}>

            {error && (
              <div className={styles.errBar}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
                <p><strong>Error:</strong> <span>{error}</span></p>
                <button onClick={loadData}>Reintentar</button>
                <button onClick={() => setError(null)} style={{ marginLeft: '.3rem' }}>✕</button>
              </div>
            )}

            {overdueTasks > 0 && (
              <div className={styles.alertW}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
                <p><strong>{overdueTasks} tareas vencidas</strong> requieren atención inmediata.</p>
                <a href="/admin/tasks">Revisar →</a>
                <button onClick={(e) => e.target.parentElement.style.display = 'none'}>✕</button>
              </div>
            )}

            {/* STATS ROW */}
            <div className={styles.statsRow}>
              {loading ? (
                <>
                  <div className={styles.sk} style={{ height: '110px', borderRadius: '14px' }}></div>
                  <div className={styles.sk} style={{ height: '110px', borderRadius: '14px' }}></div>
                  <div className={styles.sk} style={{ height: '110px', borderRadius: '14px' }}></div>
                  <div className={styles.sk} style={{ height: '110px', borderRadius: '14px' }}></div>
                </>
              ) : (
                <>
                  <div className={styles.statCard} style={{ '--kc': '#c9a84c', '--kic': 'rgba(201,168,76,.12)' }}>
                    <div className={styles.sTop}>
                      <div className={styles.sIcon}>🏢</div>
                      <Sparkline vals={[Math.max(0, c.length - 3), Math.max(0, c.length - 2), Math.max(0, c.length - 1), c.length, c.length]} />
                    </div>
                    <div className={styles.sLbl}>Empresas activas</div>
                    <div className={styles.sVal}>{activeCos}</div>
                    <div className={styles.sSub}>{c.length} total en Supabase</div>
                  </div>
                  <div className={styles.statCard} style={{ '--kc': overdueTasks > 0 ? '#e05c4b' : '#22a66a', '--kic': overdueTasks > 0 ? 'rgba(224,92,75,.12)' : 'rgba(34,166,106,.12)' }}>
                    <div className={styles.sTop}>
                      <div className={styles.sIcon}>✅</div>
                      <Sparkline vals={[10, 8, 12, pendingTasks, pendingTasks]} isHi={overdueTasks > 0} />
                    </div>
                    <div className={styles.sLbl}>Tareas pendientes</div>
                    <div className={styles.sVal}>{pendingTasks}</div>
                    <div className={styles.sSub}>
                      {overdueTasks > 0 ? <span className={styles.hi}>{overdueTasks} vencida{overdueTasks !== 1 ? 's' : ''}</span> : <span className={styles.ok}>Al día ✓</span>}
                    </div>
                  </div>
                  <div className={styles.statCard} style={{ '--kc': '#4a9fd4', '--kic': 'rgba(74,159,212,.12)' }}>
                    <div className={styles.sTop}>
                      <div className={styles.sIcon}>📁</div>
                      <Sparkline vals={[Math.max(0, d.length - 4), Math.max(0, d.length - 2), Math.max(0, d.length - 1), d.length, d.length]} />
                    </div>
                    <div className={styles.sLbl}>Documentos</div>
                    <div className={styles.sVal}>{d.length}</div>
                    <div className={styles.sSub}>Últimos 20 registros</div>
                  </div>
                  <div className={styles.statCard} style={{ '--kc': '#22a66a', '--kic': 'rgba(34,166,106,.12)' }}>
                    <div className={styles.sTop}>
                      <div className={styles.sIcon}>📊</div>
                      <Sparkline vals={[dh.length, dh.length, dh.length, dh.length, dh.length]} />
                    </div>
                    <div className={styles.sLbl}>Dashboards BI activos</div>
                    <div className={styles.sVal}>{dh.length}</div>
                    <div className={styles.sSub}><span className={styles.ok}>{dh.length} publicado{dh.length !== 1 ? 's' : ''}</span></div>
                  </div>
                </>
              )}
            </div>

            <div className={styles.col6040}>
              {/* COMPANIES CARD */}
              <div className={styles.card}>
                <div className={styles.cardHd}>
                  <div>
                    <div className={styles.stag}>Supabase · companies</div>
                    <div className={styles.cardTitle}>Empresas clientes</div>
                    <div className={styles.cardSub}>
                      {loading ? 'Cargando…' : `${c.length} empresa${c.length !== 1 ? 's' : ''} · ${activeCos} activa${activeCos !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                    <button className={styles.btnG} onClick={loadData}>🔄</button>
                    <button className={styles.cardLnk} onClick={() => navigate('/admin/companies')}>Ver todas →</button>
                  </div>
                </div>
                {loading ? (
                  <div><div className={styles.sk} style={{ height: '16px', borderRadius: '4px', marginBottom: '.55rem' }}></div><div className={styles.sk} style={{ height: '16px', borderRadius: '4px', width: '72%', marginBottom: '.55rem' }}></div><div className={styles.sk} style={{ height: '16px', borderRadius: '4px', width: '52%' }}></div></div>
                ) : topCos.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,.25)' }}>
                    <div style={{ fontSize: '1.8rem', opacity: .25, marginBottom: '.5rem' }}>🏢</div>
                    <div style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.5)' }}>Sin empresas</div>
                    <div style={{ fontSize: '.72rem', marginTop: '.2rem', lineHeight: 1.6 }}>Aún no hay registros en la tabla companies.</div>
                  </div>
                ) : (
                  <table className={styles.tbl}>
                    <thead><tr><th>Empresa</th><th>Módulos</th><th>Estado</th><th>Creada</th><th></th></tr></thead>
                    <tbody>
                      {topCos.map(co => (
                        <tr key={co.id}>
                          <td><div className={styles.tdW}>{co.name}</div></td>
                          <td>
                            <div className={styles.modDots}>
                              <div className={`${styles.modDot} ${co.billing_module ? styles.modDotOn : ''}`} title="Facturación"></div>
                              <div className={`${styles.modDot} ${co.accounting_module ? styles.modDotOn : ''}`} title="Contabilidad"></div>
                              <div className={`${styles.modDot} ${co.treasury_module ? styles.modDotOn : ''}`} title="Tesorería"></div>
                              <div className={`${styles.modDot} ${co.hr_module ? styles.modDotOn : ''}`} title="Personal"></div>
                            </div>
                          </td>
                          <td>{statusBadge(co.status)}</td>
                          <td className={styles.tdM}>{fmtDate(co.created_at)}</td>
                          <td><button className={styles.actBtn} onClick={() => navigate('/admin/companies')}>👁</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* TASKS CARD */}
              <div className={styles.card}>
                <div className={styles.cardHd}>
                  <div>
                    <div className={styles.stag}>Supabase · tasks</div>
                    <div className={styles.cardTitle}>Tareas urgentes</div>
                    <div className={styles.cardSub}>
                      {loading ? 'Cargando…' : `${pendingTasks} pendiente${pendingTasks !== 1 ? 's' : ''} · ${ovTasks.length} vencida${ovTasks.length !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                  <button className={styles.cardLnk} onClick={() => navigate('/admin/tasks')}>Ver todas →</button>
                </div>
                {loading ? (
                  <div><div className={styles.sk} style={{ height: '16px', borderRadius: '4px', marginBottom: '.55rem' }}></div><div className={styles.sk} style={{ height: '16px', borderRadius: '4px', width: '68%', marginBottom: '.55rem' }}></div><div className={styles.sk} style={{ height: '16px', borderRadius: '4px', width: '48%' }}></div></div>
                ) : topTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#22a66a' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '.5rem' }}>✅</div>
                    <div style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.5)', fontWeight: 500 }}>Todo al día</div>
                    <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.25)', marginTop: '.2rem' }}>Sin tareas pendientes</div>
                  </div>
                ) : (
                  topTasks.map(task => (
                    <div key={task.id} className={`${styles.taskItem} ${task.status === 'completed' ? styles.taskItemDone : ''}`}>
                      <div className={`${styles.tChk} ${task.status === 'completed' ? styles.tChkOn : ''}`} onClick={() => completeTask(task.id)}>
                        {task.status === 'completed' ? '✓' : ''}
                      </div>
                      <div className={styles.tBody}>
                        <div className={styles.tTitle}>{task.title}</div>
                        <div className={styles.tMeta}>
                          {prioBadge(task)}
                          {task.due_date && <span>📅 {fmtDate(task.due_date)}</span>}
                          {task.companies && <span>🏢 {task.companies.name}</span>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={styles.col2}>
              {/* DOCUMENTS CARD */}
              <div className={styles.card}>
                <div className={styles.cardHd}>
                  <div>
                    <div className={styles.stag}>Supabase · documents</div>
                    <div className={styles.cardTitle}>Documentos recientes</div>
                    <div className={styles.cardSub}>
                      {loading ? 'Cargando…' : `${d.length} documento${d.length !== 1 ? 's' : ''} cargados`}
                    </div>
                  </div>
                  <button className={styles.cardLnk} onClick={() => navigate('/admin/documents')}>Ver todos →</button>
                </div>
                {loading ? (
                  <div><div className={styles.sk} style={{ height: '16px', borderRadius: '4px', marginBottom: '.55rem' }}></div><div className={styles.sk} style={{ height: '16px', borderRadius: '4px', width: '68%', marginBottom: '.55rem' }}></div><div className={styles.sk} style={{ height: '16px', borderRadius: '4px', width: '48%' }}></div></div>
                ) : topDocs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,.25)' }}>
                    <div style={{ fontSize: '1.8rem', opacity: .25, marginBottom: '.5rem' }}>📁</div>
                    <div style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.5)' }}>Sin documentos</div>
                    <div style={{ fontSize: '.72rem', marginTop: '.2rem', lineHeight: 1.6 }}>Aún no hay documentos en la tabla documents.</div>
                  </div>
                ) : (
                  topDocs.map(doc => (
                    <div key={doc.id} className={styles.docItem} onClick={() => navigate('/admin/documents')}>
                      <div className={styles.docIcon}>{catIcon[doc.category] || '📄'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.79rem', fontWeight: 500, color: 'rgba(255,255,255,.88)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</div>
                        <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.25)', marginTop: '.1rem' }}>{doc.companies ? doc.companies.name : '—'} · {doc.category || 'General'}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.3rem', flexShrink: 0 }}>
                        {docBadge(doc.status)}
                        <span style={{ fontSize: '.62rem', color: 'rgba(255,255,255,.25)' }}>{fmtDate(doc.created_at)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* MODULES CARD */}
              <div className={styles.card}>
                <div className={styles.cardHd}>
                  <div>
                    <div className={styles.stag}>Cobertura de servicios</div>
                    <div className={styles.cardTitle}>Módulos contratados</div>
                    <div className={styles.cardSub}>
                      {loading ? 'Cargando…' : `${c.length} empresa${c.length !== 1 ? 's' : ''} · cobertura actual`}
                    </div>
                  </div>
                </div>
                {loading ? (
                  <div><div className={styles.sk} style={{ height: '12px', borderRadius: '4px', marginBottom: '.7rem' }}></div><div className={styles.sk} style={{ height: '12px', borderRadius: '4px', width: '70%', marginBottom: '.7rem' }}></div><div className={styles.sk} style={{ height: '12px', borderRadius: '4px', width: '55%', marginBottom: '.7rem' }}></div><div className={styles.sk} style={{ height: '12px', borderRadius: '4px', width: '40%' }}></div></div>
                ) : (
                  <>
                    <div className={styles.modBar}>
                      <div className={styles.mbRow}>
                        <div className={styles.mbLbl}>🧾 Facturación</div>
                        <div className={styles.mbTrack}><div className={styles.mbFill} style={{ width: `${pct('billing_module')}%` }}></div></div>
                        <div className={styles.mbPct}>{pct('billing_module')}%</div>
                      </div>
                      <div className={styles.mbRow}>
                        <div className={styles.mbLbl}>📋 Contabilidad</div>
                        <div className={styles.mbTrack}><div className={styles.mbFill} style={{ width: `${pct('accounting_module')}%`, background: 'linear-gradient(90deg,#4a9fd4,#6dc4f0)' }}></div></div>
                        <div className={styles.mbPct}>{pct('accounting_module')}%</div>
                      </div>
                      <div className={styles.mbRow}>
                        <div className={styles.mbLbl}>🏦 Tesorería</div>
                        <div className={styles.mbTrack}><div className={styles.mbFill} style={{ width: `${pct('treasury_module')}%`, background: 'linear-gradient(90deg,#22a66a,#50d090)' }}></div></div>
                        <div className={styles.mbPct}>{pct('treasury_module')}%</div>
                      </div>
                      <div className={styles.mbRow}>
                        <div className={styles.mbLbl}>👥 Personal</div>
                        <div className={styles.mbTrack}><div className={styles.mbFill} style={{ width: `${pct('hr_module')}%`, background: 'linear-gradient(90deg,#e8a020,#f0c040)' }}></div></div>
                        <div className={styles.mbPct}>{pct('hr_module')}%</div>
                      </div>
                    </div>
                    <div className={styles.miniKpis}>
                      <div className={styles.mk}>
                        <div className={styles.mkLbl}>Dashboards BI</div>
                        <div className={styles.mkVal} style={{ color: '#c9a84c' }}>{dh.length}</div>
                      </div>
                      <div className={styles.mk}>
                        <div className={styles.mkLbl}>Usuarios portal</div>
                        <div className={styles.mkVal} style={{ color: '#4a9fd4' }}>{data.profiles.length}</div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* REQUESTS CARD */}
            <div className={styles.card}>
              <div className={styles.cardHd}>
                <div>
                  <div className={styles.stag}>Supabase · operational_requests</div>
                  <div className={styles.cardTitle}>Solicitudes pendientes</div>
                  <div className={styles.cardSub}>
                    {loading ? 'Cargando…' : `${openReqs} abierta${openReqs !== 1 ? 's' : ''} · ${progReqs} en proceso`}
                  </div>
                </div>
                <button className={styles.cardLnk} onClick={() => navigate('/admin/requests')}>Ver todas →</button>
              </div>
              {loading ? (
                <div><div className={styles.sk} style={{ height: '14px', borderRadius: '4px', marginBottom: '.55rem' }}></div><div className={styles.sk} style={{ height: '14px', borderRadius: '4px', width: '70%', marginBottom: '.55rem' }}></div></div>
              ) : reqs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#22a66a' }}>
                  <div style={{ fontSize: '1.4rem', marginBottom: '.4rem' }}>✅</div>
                  <div style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.5)' }}>Sin solicitudes pendientes</div>
                </div>
              ) : (
                <table className={styles.tbl}>
                  <thead><tr><th>Solicitud</th><th>Empresa</th><th>Tipo</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
                  <tbody>
                    {reqs.map(r => (
                      <tr key={r.id}>
                        <td><div className={styles.tdW}>{r.title}</div></td>
                        <td className={styles.tdM}>{cosMap[r.company_id] || '—'}</td>
                        <td className={styles.tdM}>{r.operational_request_types?.name || '—'}</td>
                        <td><span className={`${styles.badge} ${styles[ST[r.status] || 'bN']}`}>{SL[r.status] || r.status}</span></td>
                        <td className={styles.tdM}>{fmtDate(r.requested_at)}</td>
                        <td><button className={styles.actBtn} onClick={() => navigate('/admin/requests')}>→</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
