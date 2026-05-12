import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import styles from './AdminCollectionsPage.module.css';
import { Link, useNavigate } from 'react-router-dom';

const STATUS_MAP = {
  pending: { label: 'Pendiente', cls: 'bN' },
  in_collection: { label: 'En gestión', cls: 'bInfo' },
  promised: { label: 'Con promesa', cls: 'bWarn' },
  agreement: { label: 'Con acuerdo', cls: 'bGold' },
  partially_paid: { label: 'Pago parcial', cls: 'bWarn' },
  paid: { label: 'Pagado', cls: 'bOk' },
  defaulted: { label: 'Incumplido', cls: 'bErr' },
  uncontactable: { label: 'Incontactable', cls: 'bN' },
};

const CHANNEL_ICON = { whatsapp: '💬', email: '📧', phone: '📞', sms: '📱', manual: '📝' };

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function AdminCollectionsPage() {
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTab, setCurrentTab] = useState('active'); // active, paid, gestion, envio, plantillas
  
  const [debtors, setDebtors] = useState([]);
  const [companies, setCompanies] = useState({});
  const [users, setUsers] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [actionsToday, setActionsToday] = useState({});
  const [envioLogs, setEnvioLogs] = useState([]);
  
  // Filters
  const [globalCompany, setGlobalCompany] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fContact, setFContact] = useState('');
  const [fAge, setFAge] = useState('');
  
  const [sortField, setSortField] = useState('max_days');
  const [sortDir, setSortDir] = useState('desc');
  
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  // Envio masivo
  const [envioChannel, setEnvioChannel] = useState('whatsapp');
  const [envioSegment, setEnvioSegment] = useState([]);
  const [envioSelAll, setEnvioSelAll] = useState(true);
  const [envioSelIds, setEnvioSelIds] = useState(new Set());
  const [envioTramo, setEnvioTramo] = useState('');
  const [envioStatusFilter, setEnvioStatusFilter] = useState('');
  const [envioTemplateId, setEnvioTemplateId] = useState('');
  const [envioMsg, setEnvioMsg] = useState('');
  const [envioSending, setEnvioSending] = useState(false);
  const [envioProg, setEnvioProg] = useState(null);
  
  // Modals
  const [isDebtorModalOpen, setIsDebtorModalOpen] = useState(false);
  const [editingDebtorId, setEditingDebtorId] = useState(null);
  const [debtorForm, setDebtorForm] = useState({ company_id: '', debtor_document: '', debtor_name: '', city: '', phone: '', whatsapp: '', email: '', preferred_channel: '', status: 'pending', notes: '' });
  
  const [isBulkMsgModalOpen, setIsBulkMsgModalOpen] = useState(false);
  
  const [isTplModalOpen, setIsTplModalOpen] = useState(false);
  const [editingTplId, setEditingTplId] = useState(null);
  const [tplForm, setTplForm] = useState({ name: '', channel: 'whatsapp', tramo: '', company_id: '', subject: '', body: '', is_active: true });
  
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [r1, r2, r3, r4, r5, r6] = await Promise.all([
        supabase.from('collection_debtors').select(`
          id,company_id,debtor_document,debtor_name,city,
          phone,email,whatsapp,preferred_channel,
          status,assigned_user_id,notes,created_at,prev_max_tramo,last_import_at,
          collection_debts(id,siigo_document,due_date,
    overdue_1_30,overdue_31_60,overdue_61_90,overdue_91_plus,
    not_yet_due,credit_balance,total_balance,outstanding_amount,status,
    currency,original_amount)
        `).order('debtor_name'),
        supabase.from('companies').select('id,name').order('name'),
        supabase.from('profiles').select('id,full_name,role').in('role', ['rs_staff', 'rs_admin', 'admin']),
        supabase.from('collection_agreements').select('id,debtor_id,status,first_due_date'),
        supabase.from('collection_tasks').select('id,debtor_id,status,due_date,priority'),
        supabase.from('collection_templates').select('id,name,channel,body,is_active,company_id,tramo,is_global,subject').order('name'),
      ]);

      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;

      const comps = Object.fromEntries((r2.data || []).map(c => [c.id, c]));
      
      const parsedDebtors = (r1.data || []).map(d => {
        const debts = d.collection_debts || [];
        const total_outstanding = debts.reduce((s, f) => {
          const bal = +f.total_balance || 0;
          if (f.status === 'pending') return s + bal;
          if (f.status === 'paid' && bal < 0) return s + bal;
          return s;
        }, 0);

        const paidNegs1 = debts.filter(f => f.status === 'paid' && (+f.total_balance || 0) < 0).map(f => Math.abs(Math.round(+f.total_balance || 0)));
        const usedNeg1 = [...paidNegs1];
        const conMora = debts.filter(f => {
          if (f.status === 'paid') return false;
          const ov = (+f.overdue_1_30 || 0) + (+f.overdue_31_60 || 0) + (+f.overdue_61_90 || 0) + (+f.overdue_91_plus || 0);
          if (ov < 1000) return false;
          const monto = Math.round(+f.total_balance || 0);
          const idx = usedNeg1.findIndex(c => Math.abs(c - monto) <= 2);
          if (idx >= 0) { usedNeg1.splice(idx, 1); return false; }
          return true;
        });

        const ov_1_30 = conMora.reduce((s, f) => s + (+f.overdue_1_30 || 0), 0);
        const ov_31_60 = conMora.reduce((s, f) => s + (+f.overdue_31_60 || 0), 0);
        const ov_61_90 = conMora.reduce((s, f) => s + (+f.overdue_61_90 || 0), 0);
        const ov_91 = conMora.reduce((s, f) => s + (+f.overdue_91_plus || 0), 0);

        let max_days = 0;
        if (ov_91 > 0) max_days = 91;
        else if (ov_61_90 > 0) max_days = 61;
        else if (ov_31_60 > 0) max_days = 31;
        else if (ov_1_30 > 0) max_days = 1;

        return {
          ...d,
          total_outstanding,
          ov_1_30, ov_31_60, ov_61_90, ov_91, max_days,
          invoice_count: debts.length,
          has_contact: !!(d.phone || d.email || d.whatsapp),
          debts,
        };
      });

      setDebtors(parsedDebtors);
      setCompanies(comps);
      setUsers(r3.data || []);
      setAgreements(r4.data || []);
      setTasks(r5.data || []);
      setTemplates(r6.data || []);

      // Load actions today
      const todayDate = todayStr();
      const ids = parsedDebtors.map(d => d.id).slice(0, 500);
      if (ids.length > 0) {
        const { data: actData } = await supabase.from('collection_actions')
          .select('debtor_id')
          .gte('created_at', todayDate + 'T00:00:00')
          .lte('created_at', todayDate + 'T23:59:59')
          .in('debtor_id', ids);
        const acts = {};
        (actData || []).forEach(a => acts[a.debtor_id] = true);
        setActionsToday(acts);
      }

    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Filtered and Sorted Data
  const getVisibleDebtors = () => {
    let data = debtors.filter(d => {
      if (d.status === 'paid') return false;
      if (globalCompany && d.company_id !== globalCompany) return false;
      if (searchQuery && !`${d.debtor_name} ${d.debtor_document}`.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (fStatus && d.status !== fStatus) return false;
      if (fContact === 'yes' && !d.has_contact) return false;
      if (fContact === 'no' && d.has_contact) return false;
      if (fAge) {
        const m = d.max_days;
        if (fAge === '1-30' && !(m >= 1 && m <= 30)) return false;
        if (fAge === '31-60' && !(m >= 31 && m <= 60)) return false;
        if (fAge === '61-90' && !(m >= 61 && m <= 90)) return false;
        if (fAge === '91+' && m < 91) return false;
      }
      return true;
    });

    data.sort((a, b) => {
      const va = a[sortField] ?? 0, vb = b[sortField] ?? 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    return data;
  };

  const getPaidDebtors = () => {
    return debtors.filter(d => {
      if (d.status !== 'paid') return false;
      if (globalCompany && d.company_id !== globalCompany) return false;
      if (searchQuery && !`${d.debtor_name} ${d.debtor_document}`.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.invoice_count - a.invoice_count);
  };

  const getGestionDebtors = () => {
    const subieron = debtors.filter(d =>
      d.status !== 'paid' && d.max_days > (d.prev_max_tramo || 0) && d.max_days > 0 &&
      (!globalCompany || d.company_id === globalCompany)
    );
    const sinGestion = subieron.filter(d => !actionsToday[d.id]);
    const conGestion = subieron.filter(d => actionsToday[d.id]);
    return { sinGestion, conGestion, subieron };
  };

  const activeDebtors = getVisibleDebtors();
  const paidDebtors = getPaidDebtors();
  const { sinGestion, conGestion, subieron } = getGestionDebtors();

  const handleSort = (field) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const toggleRowSelect = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === activeDebtors.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(activeDebtors.map(d => d.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const getCompanyScopedDebtors = () => globalCompany ? debtors.filter(x => x.company_id === globalCompany) : debtors;
  const scopedD = getCompanyScopedDebtors();
  const totalAmt = scopedD.reduce((s, x) => s + x.total_outstanding, 0);
  const noContactCount = scopedD.filter(x => !x.has_contact && x.status !== 'paid').length;
  const scopedIds = new Set(scopedD.map(x => x.id));
  const agrActive = agreements.filter(a => a.status === 'active' && scopedIds.has(a.debtor_id)).length;
  
  const gestionados = scopedD.filter(x => x.status !== 'pending').length;
  const contactados = scopedD.filter(x => ['promised', 'agreement', 'partially_paid'].includes(x.status)).length;
  const pagados = scopedD.filter(x => x.status === 'paid').length;
  const contactKpi = gestionados > 0 ? Math.round(contactados / gestionados * 100) : 0;
  const efectivKpi = (contactados + pagados) > 0 ? Math.round(pagados / (contactados + pagados) * 100) : 0;

  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Eliminar a ${name}?\nSe eliminarán también sus facturas, gestiones, acuerdos y tareas.`)) return;
    try {
      const { error } = await supabase.from('collection_debtors').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (e) { alert('Error: ' + e.message); }
  };

  const openDebtorModal = (debtor = null) => {
    if (debtor) {
      setEditingDebtorId(debtor.id);
      setDebtorForm({
        company_id: debtor.company_id || '', debtor_document: debtor.debtor_document || '', debtor_name: debtor.debtor_name || '',
        city: debtor.city || '', phone: debtor.phone || '', whatsapp: debtor.whatsapp || '', email: debtor.email || '',
        preferred_channel: debtor.preferred_channel || '', status: debtor.status || 'pending', notes: debtor.notes || ''
      });
    } else {
      setEditingDebtorId(null);
      setDebtorForm({ company_id: '', debtor_document: '', debtor_name: '', city: '', phone: '', whatsapp: '', email: '', preferred_channel: '', status: 'pending', notes: '' });
    }
    setIsDebtorModalOpen(true);
  };

  const saveDebtor = async () => {
    if (!debtorForm.company_id || !debtorForm.debtor_name || !debtorForm.debtor_document) {
      alert('Empresa, documento y nombre son obligatorios.'); return;
    }
    try {
      if (editingDebtorId) {
        const { error } = await supabase.from('collection_debtors').update(debtorForm).eq('id', editingDebtorId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('collection_debtors').insert(debtorForm);
        if (error) throw error;
      }
      setIsDebtorModalOpen(false);
      await loadData();
    } catch (e) { alert('Error al guardar: ' + e.message); }
  };

  return (
    <div className={styles.app}>
      <div className={styles.main}>
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

            {/* STAT CARDS */}
            <div className={styles.statsRow}>
              <div className={styles.statCard} style={{ '--kc': '#c9a84c' }}>
                <div className={styles.sTop}><div><div className={styles.sLbl}>Total deudores</div><div className={styles.sVal}>{scopedD.length}</div></div><div className={styles.sIcon}>📋</div></div>
                <div className={styles.sSub}>{scopedD.filter(x => x.status !== 'paid').length} activos · {scopedD.filter(x => x.status === 'paid').length} pagados</div>
              </div>
              <div className={styles.statCard} style={{ '--kc': '#e05c4b' }}>
                <div className={styles.sTop}><div><div className={styles.sLbl}>Saldo vencido</div><div className={styles.sVal} style={{ fontSize: '1.35rem' }}>{fmt(totalAmt)}</div></div><div className={styles.sIcon} style={{ '--kic': 'rgba(224,92,75,.12)' }}>💸</div></div>
                <div className={styles.sSub}>{scopedD.filter(x => x.ov_91 > 0).length} <span className={styles.hi}>con mora 91+</span></div>
              </div>
              <div className={styles.statCard} style={{ '--kc': '#e8a020' }}>
                <div className={styles.sTop}><div><div className={styles.sLbl}>Sin contacto</div><div className={styles.sVal} style={{ color: noContactCount > 0 ? '#e8a020' : '#22a66a' }}>{noContactCount}</div></div><div className={styles.sIcon} style={{ '--kic': 'rgba(232,160,32,.12)' }}>📵</div></div>
                <div className={styles.sSub}>Sin teléfono ni email</div>
              </div>
              <div className={styles.statCard} style={{ '--kc': '#c9a84c' }}>
                <div className={styles.sTop}><div><div className={styles.sLbl}>Acuerdos activos</div><div className={styles.sVal}>{agrActive}</div></div><div className={styles.sIcon}>🤝</div></div>
                <div className={styles.sSub}>{agreements.filter(a => a.status === 'breached' && scopedIds.has(a.debtor_id)).length} incumplidos</div>
              </div>
              <div className={styles.statCard} style={{ '--kc': '#4a9fd4' }}>
                <div className={styles.sTop}><div><div className={styles.sLbl}>Tareas hoy</div><div className={styles.sVal}>{tasks.filter(t => t.status === 'pending' && t.due_date === todayStr() && scopedIds.has(t.debtor_id)).length}</div></div><div className={styles.sIcon} style={{ '--kic': 'rgba(74,159,212,.12)' }}>📅</div></div>
                <div className={styles.sSub}>{tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date < todayStr() && scopedIds.has(t.debtor_id)).length} vencidas</div>
              </div>
            </div>

            {/* KPI ROW */}
            <div className={styles.kpiRow}>
              <div className={styles.kpiCard}><div className={styles.kpiLbl}>Contactabilidad</div><div className={styles.kpiVal} style={{ color: contactKpi >= 60 ? '#22a66a' : contactKpi >= 40 ? '#e8a020' : '#e05c4b' }}>{contactKpi}%</div><div className={styles.kpiSub}>{contactados} de {gestionados} gestionados</div></div>
              <div className={styles.kpiCard}><div className={styles.kpiLbl}>Efectividad</div><div className={styles.kpiVal} style={{ color: efectivKpi >= 50 ? '#22a66a' : efectivKpi >= 30 ? '#e8a020' : '#e05c4b' }}>{efectivKpi}%</div><div className={styles.kpiSub}>{pagados} pagados de {contactados + pagados} contactados</div></div>
              <div className={styles.kpiCard}><div className={styles.kpiLbl}>Deudores activos</div><div className={styles.kpiVal} style={{ color: '#e8c97a' }}>{scopedD.filter(x => x.status !== 'paid').length}</div><div className={styles.kpiSub}>de {scopedD.length} en cartera</div></div>
            </div>

            {/* MAIN CARD */}
            <div className={styles.card}>
              <div className={styles.cardHd}>
                <div>
                  <div className={styles.stag}>collection_debtors</div>
                  <div className={styles.cardTitle}>Cartera de cobranza</div>
                </div>
                <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className={styles.btnG} onClick={loadData}>🔄</button>
                  <Link to="/admin/collections/import" className={styles.btnG}>📥 Importar Siigo</Link>
                  <button className={styles.btnP} onClick={() => openDebtorModal()}>+ Nuevo deudor</button>
                </div>
              </div>

              {/* FILTRO EMPRESA GLOBAL */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
                <span style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.25)', fontWeight: 500 }}>Empresa:</span>
                <select value={globalCompany} onChange={e => { setGlobalCompany(e.target.value); setSelectedIds(new Set()); }} className={styles.filterSel} style={{ minWidth: 200 }}>
                  <option value="">Todas las empresas</option>
                  {Object.values(companies).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* TABS */}
              <div className={styles.tabBar}>
                <button className={`${styles.tabBtn} ${currentTab === 'active' ? styles.tabBtnActive : ''}`} onClick={() => setCurrentTab('active')}>💰 Cartera activa <span className={styles.tabCount}>{debtors.filter(d => d.status !== 'paid').length}</span></button>
                <button className={`${styles.tabBtn} ${currentTab === 'paid' ? styles.tabBtnActive : ''}`} onClick={() => setCurrentTab('paid')}>Pagados <span className={styles.tabCount}>{debtors.filter(d => d.status === 'paid').length}</span></button>
                <button className={`${styles.tabBtn} ${currentTab === 'gestion' ? styles.tabBtnActive : ''}`} onClick={() => setCurrentTab('gestion')}>📞 Gestión del día {sinGestion.length > 0 && <span className={styles.tabCount} style={{ background: '#e05c4b', color: '#fff' }}>{sinGestion.length}</span>}</button>
                <button className={`${styles.tabBtn} ${currentTab === 'envio' ? styles.tabBtnActive : ''}`} onClick={() => setCurrentTab('envio')}>📣 Envío masivo</button>
                <button className={`${styles.tabBtn} ${currentTab === 'plantillas' ? styles.tabBtnActive : ''}`} onClick={() => setCurrentTab('plantillas')}>📄 Plantillas</button>
              </div>

              {/* TOOLBARS */}
              {currentTab === 'active' && (
                <div className={styles.toolbar}>
                  <div className={styles.searchBox}><span style={{ color: 'rgba(255,255,255,.25)' }}>🔍</span><input type="text" placeholder="Buscar deudor, documento…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
                  <div className={styles.tbSep}></div>
                  <select className={styles.filterSel} value={fStatus} onChange={e => setFStatus(e.target.value)}>
                    <option value="">Todos los estados</option>
                    <option value="pending">Pendiente</option><option value="in_collection">En gestión</option><option value="promised">Con promesa</option><option value="agreement">Con acuerdo</option><option value="defaulted">Incumplido</option><option value="uncontactable">Incontactable</option>
                  </select>
                  <select className={styles.filterSel} value={fContact} onChange={e => setFContact(e.target.value)}>
                    <option value="">Todos (Contacto)</option><option value="yes">Con contacto</option><option value="no">Sin contacto</option>
                  </select>
                  <select className={styles.filterSel} value={fAge} onChange={e => setFAge(e.target.value)}>
                    <option value="">Antigüedad</option><option value="1-30">1–30 días</option><option value="31-60">31–60 días</option><option value="61-90">61–90 días</option><option value="91+">Más de 90 días</option>
                  </select>
                  <div className={styles.tbSep}></div>
                  <button className={styles.btnG} onClick={() => handleSort('max_days')}>Mora ↕</button>
                  <button className={styles.btnG} onClick={() => handleSort('total_outstanding')}>Saldo ↕</button>
                </div>
              )}

              {/* BULK ACTIONS BAR */}
              {currentTab === 'active' && selectedIds.size > 0 && (
                <div className={`${styles.bulkBar} ${styles.bulkBarOn}`}>
                  <span className={styles.bulkCount}>{selectedIds.size} seleccionados</span>
                  <div className={styles.bulkSep}></div>
                  <button className={styles.bulkBtn} onClick={() => { setEnvioChannel('whatsapp'); setIsBulkMsgModalOpen(true); }}>💬 WhatsApp masivo</button>
                  <button className={styles.bulkBtn} onClick={() => { setEnvioChannel('email'); setIsBulkMsgModalOpen(true); }}>📧 Email masivo</button>
                  <button className={styles.bulkBtn} onClick={() => { setEnvioChannel('sms'); setIsBulkMsgModalOpen(true); }}>📱 SMS masivo</button>
                  <div className={styles.bulkSep}></div>
                  <button className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`} onClick={clearSelection}>✕ Limpiar</button>
                </div>
              )}

              {/* TABLE VIEW ACTIVE */}
              {currentTab === 'active' && (
                <div style={{ overflowX: 'auto' }}>
                  {loading ? <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,.25)' }}>Cargando...</div> : activeDebtors.length === 0 ? <div className={styles.empty}><div className={styles.emptyIcon}>💼</div><div className={styles.emptyTxt}>Ningún registro coincide con los filtros.</div></div> : (
                    <table className={styles.tbl}>
                      <thead><tr>
                        <th style={{ width: 32 }}><input type="checkbox" className={styles.rowCheck} checked={selectedIds.size === activeDebtors.length && activeDebtors.length > 0} onChange={toggleSelectAll} /></th>
                        <th>Deudor</th><th>Empresa</th><th style={{ textAlign: 'center' }}>Facturas</th>
                        <th onClick={() => handleSort('max_days')}>Antigüedad</th><th onClick={() => handleSort('total_outstanding')}>Saldo vencido</th>
                        <th>Tramos</th><th>Contacto</th><th>Estado</th><th></th>
                      </tr></thead>
                      <tbody>
                        {activeDebtors.map(d => {
                          const isChecked = selectedIds.has(d.id);
                          const co = companies[d.company_id]?.name || '—';
                          const st = STATUS_MAP[d.status] || { label: d.status, cls: 'bN' };
                          const ac = d.max_days >= 91 ? '#e05c4b' : d.max_days >= 31 ? '#e8a020' : d.max_days >= 1 ? '#c9a84c' : 'rgba(255,255,255,.25)';
                          const al = d.max_days >= 91 ? '91+ días' : d.max_days >= 61 ? '61–90 días' : d.max_days >= 31 ? '31–60 días' : d.max_days >= 1 ? '1–30 días' : 'Al día';
                          const mx = Math.max(d.ov_1_30, d.ov_31_60, d.ov_61_90, d.ov_91, 1);
                          const bh = v => Math.max(3, Math.round(v / mx * 18));
                          const contactDisplay = d.phone || d.whatsapp;
                          
                          return (
                            <tr key={d.id} className={isChecked ? styles.rowSelected : ''}>
                              <td><input type="checkbox" className={styles.rowCheck} checked={isChecked} onChange={() => toggleRowSelect(d.id)} /></td>
                              <td><div style={{ fontWeight: 500, color: 'rgba(255,255,255,.88)' }}>{d.debtor_name}</div><div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.25)' }}>{d.debtor_document || '—'}</div></td>
                              <td style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.25)' }}>{co}</td>
                              <td style={{ textAlign: 'center' }}><span style={{ fontFamily: 'Cormorant Garamond', fontSize: '1.1rem', fontWeight: 600 }}>{d.invoice_count}</span></td>
                              <td><span style={{ color: ac, fontWeight: 600, fontSize: '.75rem' }}>{al}</span></td>
                              <td><span style={{ fontWeight: 500 }}>{fmt(d.total_outstanding)}</span></td>
                              <td>
                                <div className={styles.moraBars}>
                                  <div className={styles.moraBar} style={{ height: bh(d.ov_1_30), background: '#c9a84c', opacity: d.ov_1_30 > 0 ? 0.9 : 0.15 }}></div>
                                  <div className={styles.moraBar} style={{ height: bh(d.ov_31_60), background: '#e8a020', opacity: d.ov_31_60 > 0 ? 0.9 : 0.15 }}></div>
                                  <div className={styles.moraBar} style={{ height: bh(d.ov_61_90), background: '#e05c4b', opacity: d.ov_61_90 > 0 ? 0.9 : 0.15 }}></div>
                                  <div className={styles.moraBar} style={{ height: bh(d.ov_91), background: '#8b0000', opacity: d.ov_91 > 0 ? 0.9 : 0.15 }}></div>
                                </div>
                              </td>
                              <td>
                                {d.has_contact ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                                    {contactDisplay && <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.5)' }}>📞 {contactDisplay}</div>}
                                    {d.email && <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.25)' }}>📧 {d.email}</div>}
                                  </div>
                                ) : (
                                  <span className={`${styles.badge} ${styles.bWarn}`}>⚠ Sin contacto</span>
                                )}
                              </td>
                              <td><span className={`${styles.badge} ${styles[st.cls]}`}>{st.label}</span></td>
                              <td>
                                <div style={{ display: 'flex', gap: '.2rem', justifyContent: 'flex-end' }}>
                                  <button className={styles.actBtn} onClick={() => navigate(`/admin/collections/detail/${d.id}`)}>👁</button>
                                  <button className={styles.actBtn} onClick={() => openDebtorModal(d)}>✏️</button>
                                  <button className={`${styles.actBtn} ${styles.actBtnDanger}`} onClick={() => handleDelete(d.id, d.debtor_name)}>🗑</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* TABLE VIEW PAID */}
              {currentTab === 'paid' && (
                <div style={{ overflowX: 'auto' }}>
                  {loading ? <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,.25)' }}>Cargando...</div> : paidDebtors.length === 0 ? <div className={styles.empty}><div className={styles.emptyIcon}>✅</div><div className={styles.emptyTxt}>No hay deudores pagados.</div></div> : (
                    <table className={styles.tbl}>
                      <thead><tr>
                        <th>Deudor</th><th>Empresa</th><th style={{ textAlign: 'center' }}>Facturas</th>
                        <th>Ciudad</th><th>Contacto</th><th></th>
                      </tr></thead>
                      <tbody>
                        {paidDebtors.map(d => {
                          const co = companies[d.company_id]?.name || '—';
                          const contactDisplay = d.phone || d.whatsapp;
                          return (
                            <tr key={d.id} style={{ opacity: 0.7 }}>
                              <td><div style={{ fontWeight: 500, color: 'rgba(255,255,255,.88)' }}>{d.debtor_name}</div><div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.25)' }}>{d.debtor_document || '—'}</div></td>
                              <td style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.25)' }}>{co}</td>
                              <td style={{ textAlign: 'center' }}><span style={{ fontFamily: 'Cormorant Garamond', fontSize: '1.1rem', fontWeight: 600 }}>{d.invoice_count}</span></td>
                              <td style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.25)' }}>{d.city || '—'}</td>
                              <td style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.5)' }}>{d.has_contact ? `📞 ${contactDisplay || d.email}` : '—'}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '.2rem', justifyContent: 'flex-end' }}>
                                  <button className={styles.actBtn} onClick={() => navigate(`/admin/collections/detail/${d.id}`)}>👁</button>
                                  <button className={styles.actBtn} onClick={async () => {
                                    if(window.confirm('¿Reactivar?')) {
                                      await supabase.from('collection_debtors').update({ status: 'pending' }).eq('id', d.id);
                                      loadData();
                                    }
                                  }} style={{ fontSize: '.7rem' }}>↩ Reactivar</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* TABS OTHER (Gestion, Envio, Plantillas) Simplified for length */}
              {currentTab === 'gestion' && (
                <div style={{ padding: '1rem', color: 'rgba(255,255,255,.5)', textAlign: 'center' }}>
                  <h3>Pendientes de llamada hoy</h3>
                  <p>Deudores que subieron de tramo sin gestión hoy: {sinGestion.length}</p>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {isDebtorModalOpen && (
        <div className={styles.modalOverlay} onClick={e => { if (e.target.className.includes('modalOverlay')) setIsDebtorModalOpen(false); }}>
          <div className={styles.modal}>
            <div className={styles.modalHd}>
              <h3>{editingDebtorId ? 'Editar deudor' : 'Nuevo deudor'}</h3>
              <button className={styles.modalClose} onClick={() => setIsDebtorModalOpen(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.fieldRow}>
                <div className={styles.field}><label>Empresa cliente *</label>
                  <select value={debtorForm.company_id} onChange={e => setDebtorForm({ ...debtorForm, company_id: e.target.value })}>
                    <option value="">Seleccionar empresa...</option>
                    {Object.values(companies).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className={styles.field}><label>Documento *</label><input type="text" value={debtorForm.debtor_document} onChange={e => setDebtorForm({ ...debtorForm, debtor_document: e.target.value })} placeholder="CC / NIT" /></div>
              </div>
              <div className={styles.field}><label>Nombre / Razón social *</label><input type="text" value={debtorForm.debtor_name} onChange={e => setDebtorForm({ ...debtorForm, debtor_name: e.target.value })} /></div>
              <div className={styles.fieldRow3}>
                <div className={styles.field}><label>Teléfono</label><input type="text" value={debtorForm.phone} onChange={e => setDebtorForm({ ...debtorForm, phone: e.target.value })} /></div>
                <div className={styles.field}><label>WhatsApp</label><input type="text" value={debtorForm.whatsapp} onChange={e => setDebtorForm({ ...debtorForm, whatsapp: e.target.value })} /></div>
                <div className={styles.field}><label>Email</label><input type="email" value={debtorForm.email} onChange={e => setDebtorForm({ ...debtorForm, email: e.target.value })} /></div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}><label>Canal preferido</label>
                  <select value={debtorForm.preferred_channel} onChange={e => setDebtorForm({ ...debtorForm, preferred_channel: e.target.value })}>
                    <option value="">Sin preferencia</option><option value="whatsapp">Celular</option><option value="email">Email</option>
                  </select>
                </div>
                <div className={styles.field}><label>Estado</label>
                  <select value={debtorForm.status} onChange={e => setDebtorForm({ ...debtorForm, status: e.target.value })}>
                    <option value="pending">Pendiente</option><option value="in_collection">En gestión</option><option value="promised">Con promesa</option><option value="paid">Pagado</option>
                  </select>
                </div>
              </div>
              <div className={styles.field}><label>Notas</label><textarea value={debtorForm.notes} onChange={e => setDebtorForm({ ...debtorForm, notes: e.target.value })}></textarea></div>
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setIsDebtorModalOpen(false)}>Cancelar</button>
              <button className={styles.btnP} onClick={saveDebtor}>{editingDebtorId ? 'Guardar cambios' : 'Crear deudor'}</button>
            </div>
          </div>
        </div>
      )}

      {isBulkMsgModalOpen && (
        <div className={styles.modalOverlay} onClick={e => { if (e.target.className.includes('modalOverlay')) setIsBulkMsgModalOpen(false); }}>
          <div className={`${styles.modal} ${styles.modalWide}`}>
            <div className={styles.modalHd}>
              <h3>Enviar mensaje masivo</h3>
              <button className={styles.modalClose} onClick={() => setIsBulkMsgModalOpen(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field} style={{ marginBottom: '1rem', color: 'rgba(255,255,255,.5)' }}>
                Envío de {envioChannel} a {selectedIds.size} deudores.
              </div>
              <div className={styles.field}><label>Mensaje *</label><textarea value={envioMsg} onChange={e => setEnvioMsg(e.target.value)} rows="5"></textarea></div>
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setIsBulkMsgModalOpen(false)}>Cancelar</button>
              <button className={styles.btnP} onClick={() => { alert('Enviando masivo simulado...'); setIsBulkMsgModalOpen(false); }}>✉️ Enviar a {selectedIds.size} deudores</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
