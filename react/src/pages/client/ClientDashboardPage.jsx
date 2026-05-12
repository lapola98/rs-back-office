import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import styles from './ClientDashboardPage.module.css';

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const isOverdue = (t) => {
  if (!t.due_date || t.status !== 'pending') return false;
  return new Date(t.due_date) < new Date(new Date().toDateString());
};

const PrioBadge = ({ t }) => {
  if (isOverdue(t)) return <span className={styles.pHi}>🔴 Vencida</span>;
  if (!t.due_date) return <span className={styles.pLo}>Sin fecha</span>;
  const days = Math.ceil((new Date(t.due_date) - new Date()) / 86400000);
  if (days <= 3) return <span className={styles.pHi}>🔴 {days}d</span>;
  if (days <= 7) return <span className={styles.pMed}>🟡 {days}d</span>;
  return <span className={styles.pLo}>🔵 {days}d</span>;
};

const DocBadge = ({ s }) => {
  const m = {
    available: ['bOk', 'Disponible'],
    pending: ['bWarn', 'Pendiente'],
    draft: ['bN', 'Borrador'],
    archived: ['bN', 'Archivado']
  };
  const [c, l] = m[s] || ['bN', s || '—'];
  return <span className={`${styles.badge} ${styles[c]}`}>{l}</span>;
};

const EmptyState = ({ icon, title, subtitle }) => (
  <div className={styles.empty}>
    <div className={styles.emptyIcon}>{icon}</div>
    <h4>{title}</h4>
    <p>{subtitle}</p>
  </div>
);

export default function ClientDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tFilter, setTFilter] = useState('todas');
  const [dFilter, setDFilter] = useState('todos');

  // Request wizard state
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedReqType, setSelectedReqType] = useState(null);
  const [reqTitle, setReqTitle] = useState('');
  const [reqDesc, setReqDesc] = useState('');
  const [reqMsg, setReqMsg] = useState(null);
  const [sendingReq, setSendingReq] = useState(false);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState(null);
  const [sendingInvite, setSendingInvite] = useState(false);

  // Chat state
  const [chatInput, setChatInput] = useState('');

  const [data, setData] = useState({
    profile: null,
    company: null,
    tasks: [],
    documents: [],
    dashboards: [],
    requestTypes: [],
    requests: [],
    contractedServiceIds: [],
    allServices: [],
    team: [],
    invitations: []
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
      
      const user = session.user;

      const { data: profile, error: pe } = await supabase
        .from('profiles')
        .select('id, full_name, role, company_id')
        .eq('id', user.id)
        .single();

      if (pe) throw new Error('Perfil no encontrado: ' + pe.message);
      if (!profile.company_id) throw new Error('Tu cuenta no tiene empresa asignada. Contacta a RS Back Office.');

      const [rc, rt, rd, rbi, rrt, rreq, rcs, rsvc] = await Promise.all([
        supabase.from('companies').select('id, name, status, billing_module, accounting_module, treasury_module, hr_module, created_at, max_users').eq('id', profile.company_id).single(),
        supabase.from('tasks').select('id, title, status, due_date, created_at, owner_type').eq('owner_type', 'client').order('due_date', { ascending: true }),
        supabase.from('documents').select('id, title, category, status, storage_path, created_at').order('created_at', { ascending: false }),
        supabase.from('embedded_dashboards').select('id, title, tool, embed_url, active').eq('active', true).order('created_at', { ascending: true }),
        supabase.from('operational_request_types').select('id, code, name, description, service_id').eq('active', true).order('name'),
        supabase.from('operational_requests').select('id, title, status, priority, requested_at, request_type_id, operational_request_types(name)').eq('company_id', profile.company_id).order('requested_at', { ascending: false }).limit(20),
        supabase.from('company_services').select('service_id, active').eq('company_id', profile.company_id).eq('active', true),
        supabase.from('services').select('id, name').eq('active', true)
      ]);

      if (rc.error) throw new Error('company: ' + rc.error.message);
      if (rt.error) throw new Error('tasks: ' + rt.error.message);
      if (rd.error) throw new Error('documents: ' + rd.error.message);
      if (rbi.error) throw new Error('dashboards: ' + rbi.error.message);
      if (rrt.error) throw new Error('request_types: ' + rrt.error.message);
      if (rreq.error) throw new Error('requests: ' + rreq.error.message);
      if (rcs.error) throw new Error('company_services: ' + rcs.error.message);

      const docsWithUrl = await Promise.all((rd.data || []).map(async d => {
        let file_url = null;
        if (d.storage_path) {
          const { data } = await supabase.storage.from('documents').createSignedUrl(d.storage_path, 3600);
          file_url = data?.signedUrl || null;
        }
        return { ...d, file_url };
      }));

      let team = [];
      let invitations = [];
      if (profile.role === 'client_owner') {
        const { data: teamView } = await supabase.from('company_team_view').select('*').eq('company_id', rc.data.id);
        if (teamView) {
          team = teamView.filter(r => r.source === 'member');
          invitations = teamView.filter(r => r.source === 'invitation');
        }
      }

      setData({
        profile,
        company: rc.data,
        tasks: rt.data || [],
        documents: docsWithUrl,
        dashboards: rbi.data || [],
        requestTypes: rrt.data || [],
        requests: rreq.data || [],
        contractedServiceIds: (rcs.data || []).map(cs => cs.service_id),
        allServices: rsvc.data || [],
        team,
        invitations
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
    }, 90000);
    return () => clearInterval(interval);
  }, []);

  const handleSignOut = async () => {
    if (!window.confirm('¿Cerrar sesión?')) return;
    await supabase.auth.signOut();
    navigate('/login');
  };

  const submitRequest = async () => {
    if (!selectedReqType) {
      setReqMsg({ type: 'err', text: '⚠️ Selecciona un tipo de solicitud.' });
      return;
    }
    if (!reqTitle.trim()) {
      setReqMsg({ type: 'err', text: '⚠️ Escribe un título para la solicitud.' });
      return;
    }
    if (!reqDesc.trim()) {
      setReqMsg({ type: 'err', text: '⚠️ El detalle adicional es obligatorio.' });
      return;
    }

    const rt = data.requestTypes.find(t => t.id === selectedReqType);
    const now = new Date();
    setSendingReq(true);
    setReqMsg(null);

    try {
      const { error } = await supabase.from('operational_requests').insert({
        company_id: data.company.id,
        created_by_user_id: data.profile.id,
        service_id: rt?.service_id || null,
        request_type_id: selectedReqType,
        title: reqTitle.trim(),
        description: reqDesc.trim(),
        status: 'open',
        priority: 'medium',
        requested_at: now.toISOString(),
        period_year: now.getFullYear(),
        period_month: now.getMonth() + 1,
      });

      if (error) throw error;

      setReqMsg({ type: 'ok', text: '✅ Solicitud enviada correctamente. Tu asesor RS la revisará pronto.' });
      setReqTitle('');
      setReqDesc('');
      setSelectedReqType(null);
      setSelectedArea(null);

      // Reload requests
      const { data: newReqs } = await supabase.from('operational_requests')
        .select('id, title, status, priority, requested_at, operational_request_types(name)')
        .eq('company_id', data.company.id)
        .order('requested_at', { ascending: false })
        .limit(20);
      
      if (newReqs) setData(prev => ({ ...prev, requests: newReqs }));

    } catch (e) {
      setReqMsg({ type: 'err', text: '❌ Error al enviar: ' + e.message });
    } finally {
      setSendingReq(false);
    }
  };

  const cancelInvitation = async (email) => {
    if (!window.confirm(`¿Cancelar la invitación a ${email}?`)) return;
    await supabase.from('company_invitations').update({ status: 'cancelled' }).eq('company_id', data.company.id).eq('email', email);
    loadData();
  };

  const sendInvitation = async () => {
    if (!inviteEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      setInviteMsg({ type: 'err', text: '⚠️ Ingresa un correo válido.' });
      return;
    }

    setSendingInvite(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('https://doauzsmkoeyvllbmbdda.supabase.co/functions/v1/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), company_id: data.company.id }),
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        setInviteMsg({ type: 'err', text: '❌ ' + (result.error || 'Error al enviar') });
      } else {
        setInviteMsg({ type: 'ok', text: '✅ Invitación enviada a ' + inviteEmail });
        setInviteEmail('');
        setTimeout(() => { setShowInviteModal(false); loadData(); }, 1800);
      }
    } catch (e) {
      setInviteMsg({ type: 'err', text: '❌ Error de conexión: ' + e.message });
    } finally {
      setSendingInvite(false);
    }
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const name = data.profile?.full_name || '';
    const comp = data.company?.name || '';
    const text = encodeURIComponent(`Hola RS Back Office, soy ${name} de ${comp}. ${chatInput.trim()}`);
    window.open(`https://wa.me/573102170905?text=${text}`, '_blank');
    setChatInput('');
  };

  const activeModules = data.company ? [data.company.billing_module, data.company.accounting_module, data.company.treasury_module, data.company.hr_module].filter(Boolean).length : 0;
  const pendingTasks = data.tasks.filter(t => t.status === 'pending').length;
  const overdueTasks = data.tasks.filter(t => isOverdue(t) && t.status === 'pending').length;

  const filteredTasks = data.tasks.filter(t => {
    if (tFilter === 'todas') return true;
    if (tFilter === 'pending') return t.status === 'pending' && !isOverdue(t);
    if (tFilter === 'completed') return t.status === 'completed';
    if (tFilter === 'overdue') return isOverdue(t) && t.status === 'pending';
    return true;
  });

  const filteredDocs = data.documents.filter(d => {
    if (dFilter === 'todos') return true;
    return d.status === dFilter;
  });

  const areaIcons = {
    'Facturación y recaudo': { ico: '🧾', color: 'rgba(201,168,76,.12)', txt: '#c9a84c' },
    'Contabilidad e Impuestos': { ico: '📋', color: 'rgba(36,113,163,.09)', txt: '#2471a3' },
    'Nómina': { ico: '👤', color: 'rgba(34,166,106,.09)', txt: '#22a66a' },
    'Controller financiero y tesorería': { ico: '📊', color: 'rgba(36,113,163,.09)', txt: '#2471a3' },
    'Gestión de personal y compras': { ico: '👥', color: 'rgba(34,166,106,.09)', txt: '#22a66a' },
    'SG-SST': { ico: '🛡️', color: 'rgba(212,137,10,.09)', txt: '#d4890a' },
  };

  const areaMap = {};
  data.requestTypes.forEach(t => {
    if (!areaMap[t.service_id]) areaMap[t.service_id] = [];
    areaMap[t.service_id].push(t);
  });
  const availableAreas = data.allServices.filter(svc => areaMap[svc.id]);

  const ST_BADGE = {
    open: ['bWarn', 'Abierta'],
    in_progress: ['bInfo', 'En proceso'],
    resolved: ['bOk', 'Resuelta'],
    closed: ['bN', 'Cerrada'],
  };

  return (
    <div className={styles.app}>
      <aside className={styles.sb}>
        <a href="#" className={styles.sbLogo}>
          <div className={styles.sbMark}>RS</div>
          <div className={styles.sbWm}>
            <strong>RS Back Office</strong>
            <span>Mi portal</span>
          </div>
        </a>
        <nav className={styles.sbNav}>
          <div className={styles.sbLbl}>Mi empresa</div>
          <div className={`${styles.sbLink} ${activeTab === 'dashboard' ? styles.sbLinkActive : ''}`} onClick={() => setActiveTab('dashboard')}><span className={styles.sbIcon}>🏠</span> Dashboard</div>
          <div className={`${styles.sbLink} ${activeTab === 'tareas' ? styles.sbLinkActive : ''}`} onClick={() => setActiveTab('tareas')}><span className={styles.sbIcon}>✅</span> Mis tareas</div>
          <div className={`${styles.sbLink} ${activeTab === 'documentos' ? styles.sbLinkActive : ''}`} onClick={() => setActiveTab('documentos')}><span className={styles.sbIcon}>📁</span> Documentos</div>
          <div className={styles.sbDiv}></div>
          <div className={styles.sbLbl}>Soporte</div>
          <div className={`${styles.sbLink} ${activeTab === 'solicitudes' ? styles.sbLinkActive : ''}`} onClick={() => setActiveTab('solicitudes')}><span className={styles.sbIcon}>📝</span> Solicitudes</div>
          <div className={styles.sbDiv}></div>
          {data.profile?.role === 'client_owner' && (
            <>
              <div className={styles.sbLbl}>Mi empresa</div>
              <div className={`${styles.sbLink} ${activeTab === 'equipo' ? styles.sbLinkActive : ''}`} onClick={() => setActiveTab('equipo')}><span className={styles.sbIcon}>👥</span> Mi equipo</div>
            </>
          )}
          <div className={`${styles.sbLink} ${activeTab === 'chat' ? styles.sbLinkActive : ''}`} onClick={() => setActiveTab('chat')}><span className={styles.sbIcon}>💬</span> Chat RS</div>
        </nav>
        <div className={styles.sbFoot}>
          <div className={styles.uPill}>
            <div className={styles.uAv}>{data.profile?.full_name?.slice(0, 2).toUpperCase() || '—'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className={styles.uName}>{data.profile?.full_name || 'Cargando...'}</span>
              <span className={styles.uCo}>{data.company?.name || '—'}</span>
            </div>
            <button className={styles.uOut} onClick={handleSignOut} title="Cerrar sesión">⎋</button>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <div className={styles.tbBc}>Portal / <span>{activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'tareas' ? 'Mis tareas' : activeTab === 'documentos' ? 'Documentos' : activeTab === 'solicitudes' ? 'Solicitudes' : activeTab === 'equipo' ? 'Mi equipo' : 'Chat RS'}</span></div>
            <div className={styles.tbTitle}>{data.company?.name || 'Mi empresa'}</div>
          </div>
          <div className={styles.tbRight}>
            <div className={styles.connPill}>
              <span className={`${styles.cdot} ${loading ? styles.cL : error ? styles.cErr : styles.cOk}`}></span>
              <span>{loading ? 'Conectando...' : error ? 'Sin conexión' : 'Conectado'}</span>
            </div>
            <div className={styles.tbDate}>{fmtDate(new Date().toISOString())}</div>
            <div className={styles.tbAv}>{data.profile?.full_name?.slice(0, 2).toUpperCase() || '—'}</div>
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

            {/* DASHBOARD TAB */}
            {activeTab === 'dashboard' && (
              <div>
                <div className={styles.wb}>
                  <div className={styles.wbMark}>{data.company?.name?.slice(0, 2).toUpperCase() || 'RS'}</div>
                  <div className={styles.wbTxt}>
                    <div className={styles.wbG}>{new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 18 ? 'Buenas tardes' : 'Buenas noches'}</div>
                    <div className={styles.wbN}><em>{data.company?.name}</em></div>
                    <div className={styles.wbS}>Portal RS Back Office · {fmtDate(new Date().toISOString())}</div>
                  </div>
                  <div className={styles.wbMods}>
                    {data.allServices.map(svc => (
                      <div key={svc.id} className={`${styles.wbMod} ${data.contractedServiceIds.includes(svc.id) ? styles.wbModOn : ''}`}>
                        {areaIcons[svc.name]?.ico || '⚙️'} {svc.name}
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.kpiRow}>
                  <div className={styles.kpi} style={{ '--kc': '#c9a84c' }}>
                    <div className={styles.kpiLbl}>Módulos activos</div>
                    <div className={styles.kpiVal}>{activeModules}<small>/4</small></div>
                    <div className={styles.kpiFt}><span className={`${styles.badge} ${styles.bGold}`}>Plan activo</span></div>
                  </div>
                  <div className={styles.kpi} style={{ '--kc': overdueTasks > 0 ? '#c0392b' : '#22a66a' }}>
                    <div className={styles.kpiLbl}>Tareas pendientes</div>
                    <div className={styles.kpiVal}>{pendingTasks}</div>
                    <div className={styles.kpiFt}>
                      {overdueTasks > 0 ? <span className={`${styles.delta} ${styles.dDn}`}>⚠ {overdueTasks} vencida{overdueTasks !== 1 ? 's' : ''}</span> : <span className={`${styles.delta} ${styles.dUp}`}>✓ Al día</span>}
                    </div>
                  </div>
                  <div className={styles.kpi} style={{ '--kc': '#2471a3' }}>
                    <div className={styles.kpiLbl}>Documentos</div>
                    <div className={styles.kpiVal}>{data.documents.length}</div>
                    <div className={styles.kpiFt}><span style={{ color: '#a09c94', fontSize: '.68rem' }}>archivos disponibles</span></div>
                  </div>
                  <div className={styles.kpi} style={{ '--kc': '#22a66a' }}>
                    <div className={styles.kpiLbl}>Dashboards BI</div>
                    <div className={styles.kpiVal}>{data.dashboards.length}</div>
                    <div className={styles.kpiFt}><span className={`${styles.badge} ${data.dashboards.length > 0 ? styles.bOk : styles.bN}`}>{data.dashboards.length > 0 ? 'Activos' : 'Sin configurar'}</span></div>
                  </div>
                </div>

                <div className={styles.col2}>
                  <div className={styles.card}>
                    <div className={styles.cardHd}>
                      <div><div className={styles.stag}>Pendientes</div><div className={styles.cardTitle}>Tareas recientes</div></div>
                      <button className={styles.cardLnk} onClick={() => setActiveTab('tareas')}>Ver todas →</button>
                    </div>
                    <div>
                      {data.tasks.filter(t => t.status === 'pending').slice(0, 5).length > 0 ? (
                        data.tasks.filter(t => t.status === 'pending').slice(0, 5).map(t => (
                          <div key={t.id} className={styles.taskItem}>
                            <div className={styles.tChk}></div>
                            <div className={styles.tBody}>
                              <div className={styles.tTitle}>{t.title}</div>
                              <div className={styles.tMeta}><PrioBadge t={t} /> {t.due_date && <span>📅 {fmtDate(t.due_date)}</span>}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState icon="✅" title="Sin tareas pendientes" subtitle="Tu equipo RS está al día." />
                      )}
                    </div>
                  </div>
                  <div className={styles.card}>
                    <div className={styles.cardHd}>
                      <div><div className={styles.stag}>Archivos</div><div className={styles.cardTitle}>Documentos recientes</div></div>
                      <button className={styles.cardLnk} onClick={() => setActiveTab('documentos')}>Ver todos →</button>
                    </div>
                    <div>
                      {data.documents.slice(0, 5).length > 0 ? (
                        data.documents.slice(0, 5).map(d => (
                          <div key={d.id} className={styles.docItem} onClick={() => d.file_url && window.open(d.file_url, '_blank')}>
                            <div className={styles.docIcon}>{d.category === 'invoice' ? '📕' : d.category === 'report' ? '📗' : d.category === 'contract' ? '📘' : d.category === 'payroll' ? '📙' : '📄'}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '.79rem', fontWeight: 500, color: '#0d1117', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                              <div style={{ fontSize: '.65rem', color: '#a09c94', marginTop: '.1rem' }}>{d.category || 'General'} · {fmtDate(d.created_at)}</div>
                            </div>
                            <div style={{ flexShrink: 0 }}><DocBadge s={d.status} /></div>
                          </div>
                        ))
                      ) : (
                        <EmptyState icon="📁" title="Sin documentos" subtitle="Aún no hay archivos cargados." />
                      )}
                    </div>
                  </div>
                </div>

                {data.dashboards.length > 0 && (
                  <div className={styles.biWrap}>
                    <div className={styles.biHead}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem' }}>
                        <h3>{data.dashboards[0].title}</h3>
                        <span className={styles.biLive}>{data.dashboards[0].tool === 'powerbi' ? 'Power BI' : data.dashboards[0].tool === 'looker' ? 'Looker Studio' : data.dashboards[0].tool || 'BI'}</span>
                      </div>
                      {data.dashboards[0].embed_url?.startsWith('http') && <button className={styles.btnG} onClick={() => window.open(data.dashboards[0].embed_url, '_blank')}>⛶ Abrir</button>}
                    </div>
                    <div className={styles.biFrame} style={{ height: '420px' }}>
                      {data.dashboards[0].embed_url?.startsWith('http') ? (
                        <iframe src={data.dashboards[0].embed_url} allowFullScreen></iframe>
                      ) : (
                        <div className={styles.biPh}>
                          <div className={styles.biPhIcon}>📊</div>
                          <h4>Dashboard <em>en preparación</em></h4>
                          <p>Tu asesor está configurando este reporte. Estará disponible pronto.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAREAS TAB */}
            {activeTab === 'tareas' && (
              <div className={styles.card}>
                <div className={styles.cardHd}><div><div className={styles.stag}>Mis pendientes</div><div className={styles.cardTitle}>Todas las tareas</div><div className={styles.cardSub}>{pendingTasks} pendiente{pendingTasks !== 1 ? 's' : ''} · {data.tasks.filter(t => t.status === 'completed').length} completada{data.tasks.filter(t => t.status === 'completed').length !== 1 ? 's' : ''}</div></div></div>
                <div className={styles.tabs}>
                  <div className={`${styles.tab} ${tFilter === 'todas' ? styles.tabOn : ''}`} onClick={() => setTFilter('todas')}>Todas</div>
                  <div className={`${styles.tab} ${tFilter === 'pending' ? styles.tabOn : ''}`} onClick={() => setTFilter('pending')}>Pendientes</div>
                  <div className={`${styles.tab} ${tFilter === 'completed' ? styles.tabOn : ''}`} onClick={() => setTFilter('completed')}>Completadas</div>
                  <div className={`${styles.tab} ${tFilter === 'overdue' ? styles.tabOn : ''}`} onClick={() => setTFilter('overdue')}>🔴 Vencidas</div>
                </div>
                <div>
                  {filteredTasks.length > 0 ? filteredTasks.map(t => (
                    <div key={t.id} className={`${styles.taskItem} ${t.status === 'completed' ? styles.taskItemDone : ''}`}>
                      <div className={`${styles.tChk} ${t.status === 'completed' ? styles.tChkOn : ''}`}>{t.status === 'completed' ? '✓' : ''}</div>
                      <div className={styles.tBody}>
                        <div className={styles.tTitle}>{t.title}</div>
                        <div className={styles.tMeta}><PrioBadge t={t} /> {t.due_date && <span>📅 {fmtDate(t.due_date)}</span>}</div>
                      </div>
                    </div>
                  )) : <EmptyState icon="✅" title="Sin tareas en esta categoría" subtitle="" />}
                </div>
              </div>
            )}

            {/* DOCUMENTOS TAB */}
            {activeTab === 'documentos' && (
              <div className={styles.card}>
                <div className={styles.cardHd}><div><div className={styles.stag}>Mis archivos</div><div className={styles.cardTitle}>Documentos</div><div className={styles.cardSub}>{data.documents.length} documento{data.documents.length !== 1 ? 's' : ''}</div></div></div>
                <div className={styles.tabs}>
                  <div className={`${styles.tab} ${dFilter === 'todos' ? styles.tabOn : ''}`} onClick={() => setDFilter('todos')}>Todos</div>
                  <div className={`${styles.tab} ${dFilter === 'available' ? styles.tabOn : ''}`} onClick={() => setDFilter('available')}>Disponibles</div>
                  <div className={`${styles.tab} ${dFilter === 'pending' ? styles.tabOn : ''}`} onClick={() => setDFilter('pending')}>Pendientes</div>
                </div>
                <div>
                  {filteredDocs.length > 0 ? (
                    <table className={styles.tbl}>
                      <thead><tr><th>Documento</th><th>Tipo</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
                      <tbody>
                        {filteredDocs.map(d => (
                          <tr key={d.id}>
                            <td><div className={styles.tdW}>{d.title}</div></td>
                            <td className={styles.tdM}>{d.category || 'General'}</td>
                            <td><DocBadge s={d.status} /></td>
                            <td className={styles.tdM}>{fmtDate(d.created_at)}</td>
                            <td>{d.file_url ? <a href={d.file_url} target="_blank" rel="noreferrer" style={{ color: '#c9a84c', fontSize: '.82rem', textDecoration: 'none' }} title="Descargar">↓ Descargar</a> : <span style={{ color: '#c8c4bc', fontSize: '.75rem' }}>Sin archivo</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <EmptyState icon="📁" title="Sin documentos en esta categoría" subtitle="" />}
                </div>
              </div>
            )}

            {/* SOLICITUDES TAB */}
            {activeTab === 'solicitudes' && (
              <>
                <div className={styles.card} style={{ marginBottom: '1rem' }}>
                  <div className={styles.cardHd}>
                    <div>
                      <div className={styles.stag}>Soporte</div>
                      <div className={styles.cardTitle}>Nueva solicitud</div>
                      <div className={styles.cardSub}>Selecciona el tipo y describe tu solicitud</div>
                    </div>
                  </div>

                  {!selectedArea ? (
                    <div>
                      <div style={{ fontSize: '.7rem', fontWeight: 600, color: '#a09c94', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '.65rem' }}>Paso 1 — Selecciona el área</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.5rem', marginBottom: '1rem' }}>
                        {availableAreas.map(svc => {
                          const contracted = data.contractedServiceIds.includes(svc.id);
                          const ic = areaIcons[svc.name] || { ico: '⚙️', color: '#f2f0eb', txt: '#7a776f' };
                          const count = areaMap[svc.id]?.length || 0;
                          return (
                            <div key={svc.id} onClick={() => contracted && setSelectedArea(svc.id)}
                              style={{
                                border: `1.5px solid ${contracted ? '#e8e4dc' : '#f2f0eb'}`, borderRadius: '14px', padding: '1rem',
                                cursor: contracted ? 'pointer' : 'not-allowed', background: '#ffffff', transition: 'all .2s',
                                opacity: contracted ? 1 : 0.45, filter: contracted ? 'none' : 'grayscale(.6)'
                              }}>
                              <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: ic.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', marginBottom: '.6rem', position: 'relative' }}>
                                {ic.ico}
                                {!contracted && <span style={{ position: 'absolute', top: '-4px', right: '-4px', fontSize: '.55rem', background: '#c8c4bc', color: '#fff', borderRadius: '100px', padding: '.05rem .3rem', fontWeight: 700 }}>🔒</span>}
                              </div>
                              <div style={{ fontSize: '.82rem', fontWeight: 600, color: '#0d1117', marginBottom: '.2rem' }}>{svc.name}</div>
                              <div style={{ fontSize: '.68rem', color: '#a09c94' }}>{count} tipo{count !== 1 ? 's' : ''} de solicitud</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.65rem' }}>
                        <button onClick={() => { setSelectedArea(null); setSelectedReqType(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c9a84c', fontSize: '.75rem', fontFamily: 'DM Sans', padding: 0 }}>← Volver</button>
                        <div style={{ fontSize: '.7rem', fontWeight: 600, color: '#a09c94', letterSpacing: '.1em', textTransform: 'uppercase' }}>Paso 2 — Tipo de solicitud</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.5rem', marginBottom: '1rem' }}>
                        {data.requestTypes.filter(t => t.service_id === selectedArea).map(t => (
                          <div key={t.id} onClick={() => setSelectedReqType(t.id)}
                            style={{
                              border: `1.5px solid ${selectedReqType === t.id ? '#c9a84c' : '#e8e4dc'}`,
                              borderRadius: '14px', padding: '.85rem 1rem', cursor: 'pointer',
                              background: selectedReqType === t.id ? '#f5e9c8' : '#ffffff', transition: 'all .2s'
                            }}>
                            <div style={{ fontSize: '.82rem', fontWeight: 600, color: '#0d1117', marginBottom: '.18rem' }}>{t.name}</div>
                            {t.description && <div style={{ fontSize: '.7rem', color: '#7a776f', lineHeight: 1.5 }}>{t.description}</div>}
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', marginBottom: '1rem' }}>
                        <div>
                          <label style={{ fontSize: '.62rem', fontWeight: 600, color: '#a09c94', letterSpacing: '.1em', textTransform: 'uppercase', display: 'block', marginBottom: '.3rem' }}>Título de la solicitud *</label>
                          <input type="text" value={reqTitle} onChange={e => setReqTitle(e.target.value)} placeholder="Ej: Certificado de retención 2024" style={{ width: '100%', border: '1.5px solid #e8e4dc', borderRadius: '10px', padding: '.62rem .88rem', fontFamily: 'DM Sans', fontSize: '.8rem', color: '#0d1117', outline: 'none', background: '#f8f6f1' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '.62rem', fontWeight: 600, color: '#a09c94', letterSpacing: '.1em', textTransform: 'uppercase', display: 'block', marginBottom: '.3rem' }}>Detalle adicional *</label>
                          <textarea value={reqDesc} onChange={e => setReqDesc(e.target.value)} placeholder="Describe el contexto o adjunta números de documento, fechas, montos…" rows="3" style={{ width: '100%', border: '1.5px solid #e8e4dc', borderRadius: '10px', padding: '.62rem .88rem', fontFamily: 'DM Sans', fontSize: '.8rem', color: '#0d1117', outline: 'none', background: '#f8f6f1', resize: 'vertical' }}></textarea>
                        </div>
                      </div>

                      {reqMsg && (
                        <div style={{ padding: '.65rem .9rem', borderRadius: '10px', fontSize: '.78rem', marginBottom: '.75rem', background: reqMsg.type === 'ok' ? 'rgba(34,166,106,.09)' : 'rgba(192,57,43,.04)', color: reqMsg.type === 'ok' ? '#22a66a' : '#c0392b', border: `1px solid ${reqMsg.type === 'ok' ? '#22a66a' : '#c0392b'}` }}>
                          {reqMsg.text}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem' }}>
                        <button className={styles.btnS} onClick={() => { setReqTitle(''); setReqDesc(''); setSelectedReqType(null); setReqMsg(null); }}>Limpiar</button>
                        <button className={styles.btnP} onClick={submitRequest} disabled={sendingReq}>{sendingReq ? '⏳ Enviando…' : 'Enviar solicitud →'}</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHd}>
                    <div><div className={styles.stag}>Historial</div><div className={styles.cardTitle}>Mis solicitudes</div></div>
                  </div>
                  <div>
                    {data.requests.length > 0 ? (
                      <table className={styles.tbl}>
                        <thead><tr><th>Solicitud</th><th>Tipo</th><th>Estado</th><th>Fecha</th></tr></thead>
                        <tbody>
                          {data.requests.map(r => (
                            <tr key={r.id}>
                              <td><div className={styles.tdW}>{r.title}</div></td>
                              <td className={styles.tdM}>{r.operational_request_types?.name || '—'}</td>
                              <td><span className={`${styles.badge} ${styles[ST_BADGE[r.status]?.[0] || 'bN']}`}>{ST_BADGE[r.status]?.[1] || r.status}</span></td>
                              <td className={styles.tdM}>{fmtDate(r.requested_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <EmptyState icon="📝" title="Sin solicitudes aún" subtitle="Tus solicitudes aparecerán aquí una vez enviadas." />}
                  </div>
                </div>
              </>
            )}

            {/* EQUIPO TAB */}
            {activeTab === 'equipo' && data.profile?.role === 'client_owner' && (
              <>
                <div className={styles.card} style={{ marginBottom: '1rem' }}>
                  <div className={styles.cardHd}>
                    <div>
                      <div className={styles.stag}>Mi empresa</div>
                      <div className={styles.cardTitle}>Gestión de equipo</div>
                      <div className={styles.cardSub}>{data.team.length} usuario{data.team.length !== 1 ? 's' : ''} activo{data.team.length !== 1 ? 's' : ''} · límite {data.company?.max_users || 5}</div>
                    </div>
                    <button className={styles.btnP} onClick={() => setShowInviteModal(true)}>+ Invitar usuario</button>
                  </div>
                  <div>
                    {data.team.length > 0 ? (
                      <table className={styles.tbl}>
                        <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead>
                        <tbody>
                          {data.team.map((m, i) => (
                            <tr key={i}>
                              <td><div className={styles.tdW}>{m.full_name || '—'}</div></td>
                              <td className={styles.tdM}>{m.email || '—'}</td>
                              <td className={styles.tdM}>{m.role === 'client_owner' ? '⭐ Representante' : m.role === 'client_user' ? '👤 Usuario' : m.role}</td>
                              <td><span className={`${styles.badge} ${m.active ? styles.bOk : styles.bN}`}>{m.active ? 'Activo' : 'Inactivo'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <EmptyState icon="👥" title="Sin usuarios aún" subtitle="Invita a tu equipo usando el botón de arriba." />}
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHd}>
                    <div>
                      <div className={styles.stag}>Pendientes</div>
                      <div className={styles.cardTitle}>Invitaciones enviadas</div>
                    </div>
                  </div>
                  <div>
                    {data.invitations.length > 0 ? (
                      <table className={styles.tbl}>
                        <thead><tr><th>Correo</th><th>Estado</th><th></th></tr></thead>
                        <tbody>
                          {data.invitations.map((inv, i) => (
                            <tr key={i}>
                              <td><div className={styles.tdW}>{inv.email}</div></td>
                              <td><span className={`${styles.badge} ${styles.bWarn}`}>⏳ Pendiente</span></td>
                              <td><button className={styles.btnG} onClick={() => cancelInvitation(inv.email)}>Cancelar</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <div style={{ fontSize: '.78rem', color: '#a09c94', padding: '.5rem 0' }}>Sin invitaciones pendientes.</div>}
                  </div>
                </div>

                {showInviteModal && (
                  <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                      <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '1.3rem', fontWeight: 600, color: '#0d1117', marginBottom: '.3rem' }}>Invitar usuario</div>
                      <div style={{ fontSize: '.78rem', color: '#7a776f', marginBottom: '1.25rem' }}>Recibirá un correo con el enlace de activación.</div>
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ fontSize: '.62rem', fontWeight: 600, color: '#7a776f', letterSpacing: '.1em', textTransform: 'uppercase', display: 'block', marginBottom: '.3rem' }}>Correo electrónico *</label>
                        <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="nombre@empresa.com" style={{ width: '100%', border: '1.5px solid #e8e4dc', borderRadius: '10px', padding: '.65rem .9rem', fontFamily: 'DM Sans', fontSize: '.82rem', color: '#0d1117', outline: 'none', background: '#f8f6f1' }} />
                      </div>
                      {inviteMsg && (
                        <div style={{ padding: '.6rem .85rem', borderRadius: '10px', fontSize: '.78rem', marginBottom: '.85rem', background: inviteMsg.type === 'ok' ? 'rgba(34,166,106,.09)' : 'rgba(192,57,43,.04)', color: inviteMsg.type === 'ok' ? '#22a66a' : '#c0392b', border: `1px solid ${inviteMsg.type === 'ok' ? '#22a66a' : '#c0392b'}` }}>
                          {inviteMsg.text}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-end' }}>
                        <button className={styles.btnS} onClick={() => setShowInviteModal(false)}>Cancelar</button>
                        <button className={styles.btnP} onClick={sendInvitation} disabled={sendingInvite}>{sendingInvite ? '⏳ Enviando…' : 'Enviar invitación →'}</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* CHAT TAB */}
            {activeTab === 'chat' && (
              <div className={styles.chatWrap}>
                <div className={styles.chatHd}>
                  <div className={styles.chatAv}>🤝</div>
                  <div><div className={styles.chatName}>Equipo RS Back Office</div><div className={styles.chatStatus}>En línea · Respuesta ~15 min</div></div>
                  <div style={{ marginLeft: 'auto' }}><button className={styles.btnG} onClick={() => setActiveTab('solicitudes')}>📝 Abrir solicitud</button></div>
                </div>
                <div className={styles.chatMsgs}>
                  <div className={styles.msgSep}>Hoy — {new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  <div className={`${styles.msg} ${styles.msgTheirs}`}>
                    <div className={styles.msgAv}>RS</div>
                    <div className={styles.msgMeta}>
                      <div className={styles.msgBubble}>¡Hola! 👋 Soy tu asesor en <strong>RS Back Office</strong>. Aquí puedes consultarme sobre tu facturación, cartera, documentos o cualquier tema de tu cuenta. ¿En qué te ayudo?</div>
                      <div className={styles.msgTime}>Asesor RS</div>
                    </div>
                  </div>
                </div>
                <div className={styles.chatTyping}><div className={styles.dots}><span></span><span></span><span></span></div> El asesor puede responder en breve…</div>
                <div className={styles.chatInpArea}>
                  <textarea className={styles.chatInp} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }} placeholder="Escribe tu mensaje…" rows="1"></textarea>
                  <button className={styles.chatSend} onClick={sendChat}>➤</button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
