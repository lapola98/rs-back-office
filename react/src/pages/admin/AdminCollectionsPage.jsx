import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSEO } from '../../hooks/useSEO';
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

  useSEO({
    title: 'Gestión de Cartera',
    description: 'Módulo de cobranza y gestión de cartera de clientes para administradores de RS.',
  });
  
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
        supabase.from('companies').select('id,name,nit,city,phone,email,contact').order('name'),
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

  const envioSegment = debtors.filter(d => {
    if (d.status === 'paid') return false;
    if (globalCompany && d.company_id !== globalCompany) return false;
    if (envioTramo && d.max_days !== parseInt(envioTramo)) return false;
    if (envioStatusFilter && d.status !== envioStatusFilter) return false;
    return d.max_days > 0;
  });

  useEffect(() => {
    setEnvioSelIds(new Set(envioSegment.map(d => d.id)));
    setEnvioSelAll(true);
    setEnvioTemplateId('');
    setEnvioMsg('');
  }, [envioChannel, envioTramo, envioStatusFilter, globalCompany, debtors]);

  useEffect(() => {
    if (currentTab === 'envio') {
      loadEnvioLogs();
    }
  }, [currentTab, globalCompany]);

  const loadEnvioLogs = async () => {
    try {
      let query = supabase
        .from('collection_actions')
        .select(`
          id, debtor_id, channel, result, notes, created_at, company_id,
          profiles(full_name),
          collection_debtors(debtor_name)
        `)
        .or('notes.ilike.%Campaña masiva%,notes.ilike.%Envío masivo%,notes.ilike.%Envio masivo%')
        .order('created_at', { ascending: false })
        .limit(100);

      if (globalCompany) {
        query = query.eq('company_id', globalCompany);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEnvioLogs(data || []);
    } catch (err) {
      console.error('Error loading envio logs:', err);
    }
  };

  const handleToggleEnvioAll = (checked) => {
    if (checked) {
      setEnvioSelIds(new Set(envioSegment.map(d => d.id)));
      setEnvioSelAll(true);
    } else {
      setEnvioSelIds(new Set());
      setEnvioSelAll(false);
    }
  };

  const handleToggleEnvioOne = (id) => {
    const next = new Set(envioSelIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setEnvioSelIds(next);
    setEnvioSelAll(next.size === envioSegment.length);
  };

  const buildFacturasText = (debtor) => {
    const tramoLabel = t =>
      t >= 91 ? '91+ días' :
      t >= 61 ? '61-90 días' :
      t >= 31 ? '31-60 días' :
      t === 1 ? '1-30 días' :
      'Por vencer';

    const debts = debtor?.debts || debtor?.collection_debts || [];

    const compensaciones = debts
      .filter(f => f.status === 'paid' && (+f.total_balance || 0) < 0)
      .map(f => Math.abs(Math.round(+f.total_balance || 0)));

    const usedComp = [...compensaciones];

    const active = debts.filter(f => {
      if (f.status !== 'pending' || (+f.total_balance || 0) < 1000) return false;

      const monto = Math.round(+f.total_balance || 0);
      const idx = usedComp.findIndex(c => Math.abs(c - monto) <= 2);

      if (idx >= 0) {
        usedComp.splice(idx, 1);
        return false;
      }

      return true;
    });

    if (!active.length) return 'Sin facturas pendientes';

    return active.map(f => {
      const ov1 = +f.overdue_1_30 || 0;
      const ov31 = +f.overdue_31_60 || 0;
      const ov61 = +f.overdue_61_90 || 0;
      const ov91 = +f.overdue_91_plus || 0;
      const notDue = +f.not_yet_due || 0;

      const vencido = ov1 + ov31 + ov61 + ov91;

      const tramo = ov91 > 0 ? 91 :
                    ov61 > 0 ? 61 :
                    ov31 > 0 ? 31 :
                    ov1 > 0 ? 1 :
                    0;

      const amount = vencido > 0 ? vencido : notDue;

      const usdAmount = Number(f.original_amount || f.usd_amount || 0);

      const usdText =
        f.currency &&
        f.currency !== 'COP' &&
        usdAmount > 0
          ? ` [${f.currency} $${usdAmount.toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            })}]`
          : '';

      return `- RAD-${f.siigo_document}: ${fmt(amount)}${usdText} (${tramoLabel(tramo)})`;
    }).join('\n');
  };

  const getEnvioPreview = () => {
    if (!envioMsg) return '—';
    const selectedDebtors = envioSegment.filter(d => envioSelIds.has(d.id));
    if (selectedDebtors.length === 0) return envioMsg;
    const d = selectedDebtors[0];
    const co = companies[d.company_id]?.name || '—';
    return envioMsg
      .replace(/\{\{nombre\}\}/g, d.debtor_name || '')
      .replace(/\{\{saldo\}\}/g, fmt(d.total_outstanding))
      .replace(/\{\{dias_mora\}\}/g, d.max_days >= 91 ? '91+' : String(d.max_days || 0))
      .replace(/\{\{empresa\}\}/g, co)
      .replace(/\{\{asesor\}\}/g, 'Asesor RS')
      .replace(/\{\{facturas\}\}/g, buildFacturasText(d));
  };

  const callTwilio = async (channel, debtor, message) => {
    let to = null;
    if (channel === 'whatsapp') to = debtor.whatsapp || debtor.phone;
    else if (channel === 'sms') to = debtor.whatsapp || debtor.phone;
    else if (channel === 'email') to = debtor.email;

    if (!to) return { success: false, error: 'Sin contacto registrado para este canal' };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${functionsUrl}/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          channel,
          to,
          message,
          subject: channel === 'email' ? 'Aviso de cobranza — RAD/ estrategias legales' : null,
        }),
      });

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('[callTwilio] Error:', err);
      return { success: false, error: 'Error de conexión con servidor de envío' };
    }
  };

  const executeEnvio = async () => {
    const msg = envioMsg.trim();
    if (!msg) return;
    const selectedDebtors = envioSegment.filter(d => envioSelIds.has(d.id));
    if (selectedDebtors.length === 0) return;

    if (!window.confirm(`¿Aprobar y enviar mensaje de ${envioChannel} a ${selectedDebtors.length} deudores?`)) return;

    setEnvioSending(true);
    setEnvioProg({ total: selectedDebtors.length, done: 0, errors: 0, currentName: '' });

    const { data: { user } } = await supabase.auth.getUser();
    let sent = 0;
    let skipped = 0;
    const errorsList = [];

    for (let i = 0; i < selectedDebtors.length; i++) {
      const d = selectedDebtors[i];
      const co = companies[d.company_id]?.name || '—';
      const hasContact =
        envioChannel === 'whatsapp' ? !!(d.whatsapp || d.phone) :
        envioChannel === 'sms'      ? !!(d.whatsapp || d.phone) :
        envioChannel === 'email'    ? !!d.email : false;

      const personalMsg = msg
        .replace(/\{\{nombre\}\}/g, d.debtor_name || '')
        .replace(/\{\{saldo\}\}/g, fmt(d.total_outstanding))
        .replace(/\{\{dias_mora\}\}/g, d.max_days >= 91 ? '91+' : String(d.max_days || 0))
        .replace(/\{\{empresa\}\}/g, co)
        .replace(/\{\{asesor\}\}/g, 'Asesor RS')
        .replace(/\{\{facturas\}\}/g, buildFacturasText(d));

      let twilioOk = false;
      let twilioNote = '';

      if (hasContact) {
        setEnvioProg(prev => ({ ...prev, currentName: d.debtor_name }));
        const twilioResult = await callTwilio(envioChannel, d, personalMsg);
        twilioOk = twilioResult.success;
        twilioNote = twilioOk
          ? `[Envío masivo · ${envioChannel}]\n${personalMsg}`
          : `[Envío masivo · ERROR]\n${personalMsg}\nError: ${twilioResult.error}`;
        if (!twilioOk) {
          errorsList.push(`${d.debtor_name}: ${twilioResult.error}`);
        }
      } else {
        twilioNote = `[Envío masivo] Sin contacto para canal ${envioChannel}\n${personalMsg}`;
      }

      const { error } = await supabase.from('collection_actions').insert({
        company_id: d.company_id,
        debtor_id: d.id,
        user_id: user?.id || null,
        channel: envioChannel,
        result: !hasContact ? 'uncontactable' : twilioOk ? 'contacted' : 'error',
        notes: twilioNote,
      });

      if (error) {
        errorsList.push(`${d.debtor_name}: ${error.message}`);
      }

      if (hasContact && twilioOk && d.status === 'pending') {
        await supabase.from('collection_debtors').update({ status: 'in_collection' }).eq('id', d.id);
      }

      if (hasContact && twilioOk) {
        sent++;
      } else {
        skipped++;
      }

      setEnvioProg(prev => ({ ...prev, done: i + 1, errors: errorsList.length }));
    }

    setEnvioSending(false);
    alert(`Envío completado: ${sent} enviados, ${skipped} omitidos/sin contacto, ${errorsList.length} errores.`);
    loadData();
    loadEnvioLogs();
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

  const envioTemplates = templates.filter(t => {
    if (t.channel !== envioChannel) return false;
    if (envioTramo && t.tramo && t.tramo !== parseInt(envioTramo)) return false;
    if (t.is_global || !t.company_id) return true;
    if (globalCompany && t.company_id === globalCompany) return true;
    if (!globalCompany) return true;
    return false;
  });

  const handleEnvioTemplateChange = (e) => {
    const id = e.target.value;
    setEnvioTemplateId(id);
    const tpl = templates.find(t => t.id === id);
    if (tpl) {
      setEnvioMsg(tpl.body);
    } else {
      setEnvioMsg('');
    }
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

              {/* ── GESTIÓN DEL DÍA ── */}
              {currentTab === 'gestion' && (
                <div>
                  {sinGestion.length === 0 && conGestion.length === 0 ? (
                    <div className={styles.empty}><div className={styles.emptyIcon}>🎉</div><div className={styles.emptyTxt}>Sin deudores pendientes de gestión hoy.</div></div>
                  ) : (
                    <>
                      {sinGestion.length > 0 && (
                        <>
                          <div style={{ fontSize: '.7rem', fontWeight: 600, color: '#e05c4b', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '.5rem' }}>⚠ Sin gestionar hoy ({sinGestion.length})</div>
                          <table className={styles.tbl}>
                            <thead><tr><th>Deudor</th><th>Empresa</th><th>Antigüedad</th><th>Saldo vencido</th><th>Contacto</th><th></th></tr></thead>
                            <tbody>
                              {sinGestion.filter(d => !globalCompany || d.company_id === globalCompany).map(d => {
                                const co = companies[d.company_id]?.name || '—';
                                const ac = d.max_days >= 91 ? '#e05c4b' : d.max_days >= 31 ? '#e8a020' : '#c9a84c';
                                const al = d.max_days >= 91 ? '91+ días' : d.max_days >= 61 ? '61–90 días' : d.max_days >= 31 ? '31–60 días' : '1–30 días';
                                return (
                                  <tr key={d.id}>
                                    <td><div style={{ fontWeight: 500 }}>{d.debtor_name}</div><div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.25)' }}>{d.debtor_document}</div></td>
                                    <td style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.25)' }}>{co}</td>
                                    <td><span style={{ color: ac, fontWeight: 600, fontSize: '.75rem' }}>{al}</span></td>
                                    <td style={{ fontWeight: 500 }}>{fmt(d.total_outstanding)}</td>
                                    <td style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.5)' }}>{d.phone || d.whatsapp || d.email || <span style={{ color: '#e8a020' }}>⚠ Sin datos</span>}</td>
                                    <td><button className={styles.actBtn} onClick={() => navigate(`/admin/collections/detail/${d.id}`)}>👁 Gestionar</button></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </>
                      )}
                      {conGestion.length > 0 && (
                        <>
                          <div style={{ fontSize: '.7rem', fontWeight: 600, color: '#22a66a', letterSpacing: '.1em', textTransform: 'uppercase', margin: '1rem 0 .5rem' }}>✓ Gestionados hoy ({conGestion.length})</div>
                          <table className={styles.tbl}>
                            <thead><tr><th>Deudor</th><th>Empresa</th><th>Antigüedad</th><th>Saldo vencido</th><th></th></tr></thead>
                            <tbody>
                              {conGestion.filter(d => !globalCompany || d.company_id === globalCompany).map(d => (
                                <tr key={d.id} style={{ opacity: 0.6 }}>
                                  <td><div style={{ fontWeight: 500 }}>{d.debtor_name}</div></td>
                                  <td style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.25)' }}>{companies[d.company_id]?.name || '—'}</td>
                                  <td><span style={{ color: '#22a66a', fontSize: '.75rem' }}>✓ Gestionado</span></td>
                                  <td>{fmt(d.total_outstanding)}</td>
                                  <td><button className={styles.actBtn} onClick={() => navigate(`/admin/collections/detail/${d.id}`)}>👁</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── ENVÍO MASIVO ── */}
              {currentTab === 'envio' && (
                <div>
                  <div className={styles.toolbar} style={{ flexWrap: 'wrap', gap: '.5rem', marginBottom: '1rem' }}>
                    <div className={styles.field} style={{ minWidth: 160 }}>
                      <label style={{ fontSize: '.65rem' }}>Filtrar por tramo</label>
                      <select value={envioTramo} onChange={e => setEnvioTramo(e.target.value)} className={styles.filterSel}>
                        <option value="">Todos los tramos</option>
                        <option value="1">1–30 días</option>
                        <option value="31">31–60 días</option>
                        <option value="61">61–90 días</option>
                        <option value="91">91+ días</option>
                      </select>
                    </div>
                    <div className={styles.field} style={{ minWidth: 160 }}>
                      <label style={{ fontSize: '.65rem' }}>Filtrar por estado</label>
                      <select value={envioStatusFilter} onChange={e => setEnvioStatusFilter(e.target.value)} className={styles.filterSel}>
                        <option value="">Todos los estados</option>
                        <option value="pending">Pendiente</option>
                        <option value="in_collection">En gestión</option>
                        <option value="promised">Con promesa</option>
                        <option value="agreement">Con acuerdo</option>
                        <option value="defaulted">Incumplido</option>
                        <option value="uncontactable">Incontactable</option>
                      </select>
                    </div>
                    <div className={styles.field} style={{ minWidth: 160 }}>
                      <label style={{ fontSize: '.65rem' }}>Plantilla</label>
                      <select value={envioTemplateId} onChange={handleEnvioTemplateChange} className={styles.filterSel}>
                        <option value="">Sin plantilla</option>
                        {envioTemplates.map(t => (
                          <option key={t.id} value={t.id}>{t.is_global ? t.name : `★ ${t.name}`}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Canal de envío como botones */}
                  <div className={styles.field} style={{ marginBottom: '1.25rem' }}>
                    <label>Canal de envío</label>
                    <div style={{ display: 'flex', gap: '.4rem' }}>
                      <button className={`${styles.envioCh} ${envioChannel === 'whatsapp' ? styles.envioChActive : ''}`} onClick={() => setEnvioChannel('whatsapp')}>💬 WhatsApp</button>
                      <button className={`${styles.envioCh} ${envioChannel === 'sms' ? styles.envioChActive : ''}`} onClick={() => setEnvioChannel('sms')}>📱 SMS</button>
                      <button className={`${styles.envioCh} ${envioChannel === 'email' ? styles.envioChActive : ''}`} onClick={() => setEnvioChannel('email')}>📧 Email</button>
                    </div>
                  </div>

                  {/* Listado de deudores del segmento con selección */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.6rem' }}>
                      <input type="checkbox" checked={envioSelAll} onChange={e => handleToggleEnvioAll(e.target.checked)} style={{ accentColor: '#c9a84c', width: '15px', height: '15px', cursor: 'pointer' }} />
                      <span id="envioSelCount" style={{ fontSize: '.72rem', color: '#c9a84c', fontWeight: 500 }}>
                        {envioSegment.filter(d => envioSelIds.has(d.id)).length} seleccionado(s)
                      </span>
                    </div>

                    <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.3rem', paddingRight: '.25rem' }}>
                      {envioSegment.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'rgba(255,255,255,.25)', fontSize: '.78rem' }}>Sin deudores en este segmento</div>
                      ) : (
                        envioSegment.map(d => {
                          const co = companies[d.company_id]?.name || '—';
                          const isChecked = envioSelIds.has(d.id);
                          const tc = t => t >= 91 ? '#e05c4b' : t >= 61 ? '#e05c4b' : t >= 31 ? '#e8a020' : '#c9a84c';
                          const tl = t => t >= 91 ? '91+' : t >= 61 ? '61-90' : t >= 31 ? '31-60' : '1-30';
                          return (
                            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.45rem .6rem', background: '#1a2230', border: '1px solid rgba(255,255,255,.04)', borderRadius: '7px' }}>
                              <input type="checkbox" checked={isChecked} onChange={() => handleToggleEnvioOne(d.id)} style={{ accentColor: '#c9a84c', width: '15px', height: '15px', flexShrink: 0, cursor: 'pointer' }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '.77rem', fontWeight: 500, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.debtor_name}</div>
                                <div style={{ fontSize: '.66rem', color: 'rgba(255,255,255,.25)' }}>{d.debtor_document || '—'} · {co}</div>
                                <div style={{ fontSize: '.65rem', marginTop: '.15rem', display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                  {(d.phone || d.whatsapp) && <span style={{ color: 'rgba(255,255,255,.5)' }}>📞 {d.whatsapp || d.phone}</span>}
                                  {d.email && <span style={{ color: 'rgba(255,255,255,.5)' }}>📧 {d.email}</span>}
                                  {!d.has_contact && <span style={{ color: '#e8a020' }}>⚠ Sin contacto</span>}
                                  <Link to={`/admin/collections/detail/${d.id}`} style={{ color: '#c9a84c', textDecoration: 'none', opacity: 0.7 }}>✏️ Editar →</Link>
                                </div>
                              </div>
                              <span style={{ fontSize: '.65rem', fontWeight: 600, color: tc(d.max_days), flexShrink: 0 }}>{tl(d.max_days)} días</span>
                              <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '.88rem', fontWeight: 600, color: '#e8c97a', flexShrink: 0 }}>{fmt(d.total_outstanding)}</div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Redacción de Mensaje */}
                  <div className={styles.field} style={{ marginBottom: '.75rem' }}>
                    <label>Mensaje *</label>
                    <textarea value={envioMsg} onChange={e => setEnvioMsg(e.target.value)} rows={4} placeholder="Escribe el mensaje... Usa {{nombre}}, {{saldo}}, {{dias_mora}}, {{empresa}}, {{asesor}}, {{facturas}} como variables" />
                  </div>

                  {/* Vista Previa */}
                  <div className={styles.field} style={{ marginBottom: '1.25rem' }}>
                    <label>Vista previa (primer deudor seleccionado)</label>
                    <div className={styles.tplPreviewBox}>
                      {getEnvioPreview()}
                    </div>
                  </div>

                  {/* Resumen & Botón de Enviar */}
                  <div style={{ background: '#131920', border: '1px solid rgba(255,255,255,0.07)', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem' }}>
                    {(() => {
                      const selectedList = envioSegment.filter(d => envioSelIds.has(d.id));
                      const noContact = selectedList.filter(d => {
                        if (envioChannel === 'whatsapp') return !d.phone && !d.whatsapp;
                        if (envioChannel === 'sms') return !d.phone && !d.whatsapp;
                        if (envioChannel === 'email') return !d.email;
                        return false;
                      }).length;

                      const chLabel = { whatsapp: 'Celular', sms: 'SMS', email: 'Email' };
                      const canSend = selectedList.length > 0 && envioMsg.trim();

                      return (
                        <div>
                          <div id="envioSummary" style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.25)', marginBottom: '.75rem' }}>
                            {!canSend ? (
                              <span>Completa los pasos anteriores (selecciona deudores y escribe un mensaje).</span>
                            ) : (
                              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                <div>
                                  <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '1.4rem', fontWeight: 600, color: '#e8c97a' }}>{selectedList.length}</div>
                                  <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.25)' }}>destinatarios</div>
                                </div>
                                <div>
                                  <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '1.4rem', fontWeight: 600, color: noContact > 0 ? '#e8a020' : '#22a66a' }}>{selectedList.length - noContact}</div>
                                  <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.25)' }}>con contacto {chLabel[envioChannel]}</div>
                                </div>
                                {noContact > 0 && (
                                  <div>
                                    <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '1.4rem', fontWeight: 600, color: 'rgba(255,255,255,.25)' }}>{noContact}</div>
                                    <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.25)' }}>sin contacto (se omitirán)</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            className={styles.btnP}
                            disabled={!canSend || envioSending}
                            onClick={executeEnvio}
                          >
                            {envioSending ? 'Enviando...' : `✉️ Aprobar y enviar a ${selectedList.length} deudores`}
                          </button>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Barra de progreso de envío */}
                  {envioProg && (
                    <div style={{ marginTop: '1rem', background: '#1c2a3a', border: '1px solid rgba(255,255,255,0.07)', padding: '.75rem 1rem', borderRadius: '10px', marginBottom: '1.5rem' }}>
                      <div id="envioProgTitle" style={{ fontSize: '.78rem', fontWeight: 600, marginBottom: '.4rem', color: envioSending ? '#e8c97a' : '#22a66a' }}>
                        {envioSending ? '⏳ Enviando campaña masiva...' : '✅ Envío completado'}
                      </div>
                      <div style={{ background: '#131920', height: '6px', borderRadius: '100px', overflow: 'hidden', marginBottom: '.4rem' }}>
                        <div style={{ background: 'linear-gradient(90deg, #c9a84c, #e8c97a)', height: '100%', width: `${Math.round((envioProg.done / envioProg.total) * 100)}%`, transition: 'width .2s' }}></div>
                      </div>
                      <div id="envioProgDetail" style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.4)' }}>
                        {envioProg.done} de {envioProg.total} {envioProg.currentName && `— ${envioProg.currentName}`}
                      </div>
                    </div>
                  )}

                  {/* Historial de envíos masivos */}
                  <div style={{ marginTop: '2.5rem', borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                      <h4 style={{ fontFamily: 'Cormorant Garamond', fontSize: '1.1rem', fontWeight: 600, color: '#fff' }}>Historial de envíos masivos</h4>
                      <span style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.25)' }}>{envioLogs.length} envíos masivos registrados</span>
                    </div>

                    {(() => {
                      const getGroupedLogs = () => {
                        const grouped = {};
                        envioLogs.forEach(l => {
                          const dateKey = l.created_at?.slice(0, 16).replace('T', ' ') || '—';
                          const key = `${dateKey}|${l.channel}|${l.company_id}`;
                          if (!grouped[key]) {
                            grouped[key] = {
                              date: dateKey,
                              channel: l.channel,
                              company_id: l.company_id,
                              count: 0,
                              sent: 0,
                              skipped: 0,
                              gestor: l.profiles?.full_name || '—',
                            };
                          }
                          grouped[key].count++;
                          if (l.result === 'contacted') {
                            grouped[key].sent++;
                          } else {
                            grouped[key].skipped++;
                          }
                        });
                        return Object.values(grouped).slice(0, 30);
                      };

                      const groupedLogs = getGroupedLogs();

                      if (groupedLogs.length === 0) {
                        return <div style={{ textAlign: 'center', padding: '1.5rem', color: 'rgba(255,255,255,.25)', fontSize: '.76rem' }}>Sin envíos masivos registrados aún.</div>;
                      }

                      const chIcon = { whatsapp: '💬', email: '📧', sms: '📱', phone: '📞', manual: '📝' };

                      return (
                        <div style={{ overflowX: 'auto', maxHeight: '280px', overflowY: 'auto' }}>
                          <table className={styles.pendingTbl}>
                            <thead>
                              <tr>
                                <th>Fecha</th>
                                <th>Canal</th>
                                <th>Empresa</th>
                                <th style={{ textAlign: 'center' }}>Destinatarios</th>
                                <th style={{ textAlign: 'center' }}>Resultado</th>
                                <th>Gestor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {groupedLogs.map((g, i) => {
                                const co = companies[g.company_id]?.name || '—';
                                return (
                                  <tr key={i}>
                                    <td style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.25)', whiteSpace: 'nowrap' }}>{g.date}</td>
                                    <td>{chIcon[g.channel] || '📝'} <span style={{ fontSize: '.74rem', color: 'rgba(255,255,255,.5)' }}>{g.channel}</span></td>
                                    <td style={{ fontSize: '.74rem', color: 'rgba(255,255,255,.5)' }}>{co}</td>
                                    <td style={{ textAlign: 'center' }}>
                                      <span style={{ fontFamily: 'Cormorant Garamond', fontSize: '.95rem', fontWeight: 600, color: '#e8c97a' }}>{g.count}</span>
                                      <span style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.25)' }}> total</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                      <span style={{ fontSize: '.74rem', color: '#22a66a', fontWeight: 500 }}>{g.sent}</span>
                                      <span style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.25)' }}> env · </span>
                                      <span style={{ fontSize: '.74rem', color: 'rgba(255,255,255,.25)' }}>{g.skipped}</span>
                                      <span style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.25)' }}> omit</span>
                                    </td>
                                    <td style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.25)' }}>{g.gestor}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>

                </div>
              )}

              {/* ── PLANTILLAS ── */}
              {currentTab === 'plantillas' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.75rem' }}>
                    <button className={styles.btnP} onClick={() => {
                      setEditingTplId(null);
                      setTplForm({ name: '', channel: 'whatsapp', tramo: '', company_id: globalCompany || '', subject: '', body: '', is_active: true });
                      setIsTplModalOpen(true);
                    }}>+ Nueva plantilla</button>
                  </div>
                  {templates.length === 0 ? (
                    <div className={styles.empty}><div className={styles.emptyIcon}>📄</div><div className={styles.emptyTxt}>Sin plantillas. Crea la primera.</div></div>
                  ) : (
                    <table className={styles.tbl}>
                      <thead><tr><th>Nombre</th><th>Canal</th><th>Tramo</th><th>Empresa</th><th>Estado</th><th></th></tr></thead>
                      <tbody>
                        {templates.map(t => (
                          <tr key={t.id}>
                            <td style={{ fontWeight: 500 }}>{t.name}</td>
                            <td><span style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.5)' }}>{t.channel}</span></td>
                            <td style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.4)' }}>{t.tramo ? `${t.tramo}+ días` : 'Todos'}</td>
                            <td style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.4)' }}>{t.is_global ? '🌐 Global' : companies[t.company_id]?.name || '—'}</td>
                            <td><span style={{ fontSize: '.7rem', color: t.is_active ? '#22a66a' : 'rgba(255,255,255,.25)' }}>{t.is_active ? '● Activa' : '○ Inactiva'}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: '.25rem', justifyContent: 'flex-end' }}>
                                <button className={styles.actBtn} onClick={() => {
                                  setEditingTplId(t.id);
                                  setTplForm({ name: t.name, channel: t.channel, tramo: t.tramo || '', company_id: t.company_id || '', subject: t.subject || '', body: t.body, is_active: t.is_active });
                                  setIsTplModalOpen(true);
                                }}>✏️</button>
                                <button className={`${styles.actBtn} ${styles.actBtnDanger}`} onClick={async () => {
                                  if (!window.confirm('¿Eliminar plantilla?')) return;
                                  await supabase.from('collection_templates').delete().eq('id', t.id);
                                  loadData();
                                }}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
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
                  <select
                    value={debtorForm.company_id}
                    onChange={e => {
                      const coId = e.target.value;
                      const co = companies[coId];
                      if (co && !editingDebtorId) {
                        setDebtorForm({
                          ...debtorForm,
                          company_id: coId,
                          debtor_document: co.nit || '',
                          debtor_name: co.name || '',
                          city: co.city || '',
                          phone: co.phone || '',
                          whatsapp: co.phone || '',
                          email: co.email || '',
                          preferred_channel: co.phone ? 'whatsapp' : (co.email ? 'email' : ''),
                        });
                      } else {
                        setDebtorForm({ ...debtorForm, company_id: coId });
                      }
                    }}
                  >
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
              <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.4)', marginBottom: '.75rem' }}>
                Canal: <strong style={{ color: '#e8c97a' }}>{envioChannel}</strong> · {selectedIds.size} deudores seleccionados
              </div>
              <div className={styles.field} style={{ marginBottom: '.5rem' }}>
                <label>Usar plantilla</label>
                <select value={envioTemplateId} onChange={handleEnvioTemplateChange} className={styles.filterSel} style={{ width: '100%' }}>
                  <option value="">Sin plantilla</option>
                  {envioTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.is_global ? t.name : `★ ${t.name}`}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Mensaje * <span style={{ color: 'rgba(255,255,255,.3)', fontSize: '.65rem' }}>Variables: {'{{nombre}}'} {'{{saldo}}'} {'{{dias_mora}}'} {'{{empresa}}'} {'{{asesor}}'} {'{{facturas}}'}</span></label>
                <textarea value={envioMsg} onChange={e => setEnvioMsg(e.target.value)} rows={5} placeholder="Escribe el mensaje..." />
              </div>
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setIsBulkMsgModalOpen(false)}>Cancelar</button>
              <button className={styles.btnP} disabled={!envioMsg.trim() || envioSending} onClick={async () => {
                const targets = activeDebtors.filter(d => selectedIds.has(d.id));
                if (targets.length === 0) return;
                
                if (!window.confirm(`¿Aprobar y enviar mensaje de ${envioChannel} a ${targets.length} deudores?`)) return;

                setEnvioSending(true);
                const { data: { user } } = await supabase.auth.getUser();
                let sent = 0;
                let skipped = 0;
                const errorsList = [];

                for (const d of targets) {
                  const hasContact =
                    envioChannel === 'whatsapp' ? !!(d.whatsapp || d.phone) :
                    envioChannel === 'sms'      ? !!(d.whatsapp || d.phone) :
                    envioChannel === 'email'    ? !!d.email : false;

                  const personalMsg = envioMsg
                    .replace(/\{\{nombre\}\}/g, d.debtor_name || '')
                    .replace(/\{\{saldo\}\}/g, fmt(d.total_outstanding))
                    .replace(/\{\{dias_mora\}\}/g, d.max_days >= 91 ? '91+' : String(d.max_days || 0))
                    .replace(/\{\{empresa\}\}/g, companies[d.company_id]?.name || '')
                    .replace(/\{\{asesor\}\}/g, 'Asesor RS')
                    .replace(/\{\{facturas\}\}/g, buildFacturasText(d));

                  let twilioOk = false;
                  let twilioNote = '';

                  if (hasContact) {
                    const twilioResult = await callTwilio(envioChannel, d, personalMsg);
                    twilioOk = twilioResult.success;
                    twilioNote = twilioOk
                      ? `[Envío masivo · ${envioChannel}]\n${personalMsg}`
                      : `[Envío masivo · ERROR]\n${personalMsg}\nError: ${twilioResult.error}`;
                    if (!twilioOk) {
                      errorsList.push(`${d.debtor_name}: ${twilioResult.error}`);
                    }
                  } else {
                    twilioNote = `[Envío masivo] Sin contacto para canal ${envioChannel}\n${personalMsg}`;
                  }

                  const { error } = await supabase.from('collection_actions').insert({
                    company_id: d.company_id,
                    debtor_id: d.id,
                    user_id: user?.id || null,
                    channel: envioChannel,
                    result: !hasContact ? 'uncontactable' : twilioOk ? 'contacted' : 'error',
                    notes: twilioNote,
                  });

                  if (error) {
                    errorsList.push(`${d.debtor_name}: ${error.message}`);
                  }

                  if (hasContact && twilioOk && d.status === 'pending') {
                    await supabase.from('collection_debtors').update({ status: 'in_collection' }).eq('id', d.id);
                  }

                  if (hasContact && twilioOk) {
                    sent++;
                  } else {
                    skipped++;
                  }
                }

                setEnvioSending(false);
                setIsBulkMsgModalOpen(false);
                clearSelection();
                alert(`Envío completado: ${sent} enviados, ${skipped} omitidos/sin contacto, ${errorsList.length} errores.`);
                loadData();
                loadEnvioLogs();
              }}>{envioSending ? 'Enviando...' : `✉️ Aprobar y enviar a ${selectedIds.size} deudores`}</button>
            </div>
          </div>
        </div>
      )}

      {isTplModalOpen && (
        <div className={styles.modalOverlay} onClick={e => { if (e.target.className.includes('modalOverlay')) setIsTplModalOpen(false); }}>
          <div className={styles.modal}>
            <div className={styles.modalHd}>
              <h3>{editingTplId ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
              <button className={styles.modalClose} onClick={() => setIsTplModalOpen(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.fieldRow}>
                <div className={styles.field}><label>Nombre *</label><input type="text" value={tplForm.name} onChange={e => setTplForm({ ...tplForm, name: e.target.value })} /></div>
                <div className={styles.field}><label>Canal *</label>
                  <select value={tplForm.channel} onChange={e => setTplForm({ ...tplForm, channel: e.target.value })}>
                    <option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="sms">SMS</option><option value="phone">Llamada</option><option value="manual">Manual</option>
                  </select>
                </div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}><label>Tramo mínimo (días)</label><input type="number" value={tplForm.tramo} onChange={e => setTplForm({ ...tplForm, tramo: e.target.value })} placeholder="Ej: 31" /></div>
                <div className={styles.field}><label>Empresa (vacío = global)</label>
                  <select value={tplForm.company_id} onChange={e => setTplForm({ ...tplForm, company_id: e.target.value })}>
                    <option value="">🌐 Global</option>
                    {Object.values(companies).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              {tplForm.channel === 'email' && (
                <div className={styles.field}><label>Asunto</label><input type="text" value={tplForm.subject} onChange={e => setTplForm({ ...tplForm, subject: e.target.value })} /></div>
              )}
              <div className={styles.field}>
                <label>Cuerpo del mensaje * <span style={{ color: 'rgba(255,255,255,.3)', fontSize: '.65rem' }}>Variables: {'{{nombre}}'} {'{{saldo}}'} {'{{empresa}}'}</span></label>
                <textarea value={tplForm.body} onChange={e => setTplForm({ ...tplForm, body: e.target.value })} rows={6} />
              </div>
              <div className={styles.field}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={tplForm.is_active} onChange={e => setTplForm({ ...tplForm, is_active: e.target.checked })} />
                  Plantilla activa
                </label>
              </div>
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setIsTplModalOpen(false)}>Cancelar</button>
              <button className={styles.btnP} onClick={async () => {
                if (!tplForm.name || !tplForm.body) { alert('Nombre y cuerpo son obligatorios.'); return; }
                const payload = {
                  name: tplForm.name, channel: tplForm.channel, body: tplForm.body,
                  subject: tplForm.subject || null, is_active: tplForm.is_active,
                  tramo: tplForm.tramo ? parseInt(tplForm.tramo) : null,
                  company_id: tplForm.company_id || null,
                  is_global: !tplForm.company_id,
                };
                if (editingTplId) {
                  const { error } = await supabase.from('collection_templates').update(payload).eq('id', editingTplId);
                  if (error) { alert('Error: ' + error.message); return; }
                } else {
                  const { error } = await supabase.from('collection_templates').insert(payload);
                  if (error) { alert('Error: ' + error.message); return; }
                }
                setIsTplModalOpen(false);
                loadData();
              }}>{editingTplId ? 'Guardar cambios' : 'Crear plantilla'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
