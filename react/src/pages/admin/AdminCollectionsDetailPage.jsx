import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import styles from './AdminCollectionsDetailPage.module.css';

const STATUS_MAP = {
  pending: 'Pendiente', in_collection: 'En gestión', promised: 'Con promesa',
  agreement: 'Con acuerdo', partially_paid: 'Pago parcial', paid: 'Pagado',
  defaulted: 'Incumplido', uncontactable: 'Incontactable'
};

const STATUS_CLS = {
  pending: styles.bN, in_collection: styles.bInfo, promised: styles.bWarn, agreement: styles.bGold,
  partially_paid: styles.bWarn, paid: styles.bOk, defaulted: styles.bErr, uncontactable: styles.bN
};

const RESULT_LABELS = {
  contacted: 'Contactado', no_answer: 'No contesta', wrong_number: 'Número equivocado',
  bounced_email: 'Email rebotado', whatsapp_unavailable: 'WhatsApp no disponible',
  requested_extension: 'Prórroga solicitada', payment_promise: 'Promesa de pago',
  payment_agreement: 'Acuerdo de pago', partial_payment: 'Pago parcial',
  paid: 'Pagó', rejected: 'Rechazó negociar', uncontactable: 'Incontactable'
};

const RESULT_COLORS = {
  contacted: '#22a66a', paid: '#22a66a', payment_promise: '#e8a020',
  payment_agreement: '#c9a84c', partial_payment: '#e8a020',
  no_answer: 'rgba(255,255,255,.25)', wrong_number: '#e05c4b', bounced_email: '#e05c4b',
  rejected: '#e05c4b', uncontactable: 'rgba(255,255,255,.25)',
  requested_extension: '#4a9fd4', whatsapp_unavailable: 'rgba(255,255,255,.25)'
};

const CH_ICON = { whatsapp: '💬', email: '📧', phone: '📞', sms: '📱', manual: '📝' };

const fmt = (n) => n != null ? '$' + Number(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-CO') : '—';
const fmtDT = (d) => d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const today = () => new Date().toISOString().slice(0, 10);

export default function AdminCollectionsDetailPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  // Data
  const [debtor, setDebtor] = useState(null);
  const [debts, setDebts] = useState([]);
  const [actions, setActions] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);

  // Modals
  const [showActionModal, setShowActionModal] = useState(false);
  const [showAgrModal, setShowAgrModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);

  // Contact Edit
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({ phone: '', whatsapp: '', email: '', city: '', notes: '' });

  // Action Form
  const [actionForm, setActionForm] = useState({ channel: 'phone', result: 'contacted', user_id: '', follow_up: '', notes: '' });

  // Agreement Form
  const [agrForm, setAgrForm] = useState({ type: 'promise', amount: '', total: '', due_date: '', installments: 1, notes: '' });

  // Task Form
  const [taskForm, setTaskForm] = useState({ title: '', user_id: '', priority: 'medium', due_date: '', description: '' });

  useEffect(() => {
    loadAll();
  }, [id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setCurrentUser(session.user);
        setActionForm(f => ({ ...f, user_id: session.user.id }));
        setTaskForm(f => ({ ...f, user_id: session.user.id }));
      }

      const [r1, r2, r3, r4, r5, r6] = await Promise.all([
        supabase.from('collection_debtors').select('*, companies(name)').eq('id', id).single(),
        supabase.from('collection_debts').select('*').eq('debtor_id', id).order('due_date', { ascending: true }),
        supabase.from('collection_actions').select('*, profiles(full_name)').eq('debtor_id', id).order('created_at', { ascending: false }),
        supabase.from('collection_agreements').select('*').eq('debtor_id', id).order('created_at', { ascending: false }),
        supabase.from('collection_tasks').select('*, profiles(full_name)').eq('debtor_id', id).order('due_date', { ascending: true }),
        supabase.from('profiles').select('id, full_name').in('role', ['rs_staff', 'rs_admin', 'admin']).eq('active', true),
      ]);

      if (r1.error) throw r1.error;

      setDebtor(r1.data);
      setDebts(r2.data || []);
      setActions(r3.data || []);
      setAgreements(r4.data || []);
      setTasks(r5.data || []);
      setStaff(r6.data || []);

      setContactForm({
        phone: r1.data.phone || '',
        whatsapp: r1.data.whatsapp || '',
        email: r1.data.email || '',
        city: r1.data.city || '',
        notes: r1.data.notes || ''
      });

    } catch (e) {
      console.error(e);
      alert('Error loading detail: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Profile calculations
  const totalOut = debts.reduce((s, f) => {
    const bal = +f.total_balance || 0;
    if (f.status === 'pending') return s + bal;
    if (f.status === 'paid' && bal < 0) return s + bal;
    return s;
  }, 0);

  const activeSig = debts.filter(f => f.status !== 'paid' && ((+f.overdue_1_30||0)+(+f.overdue_31_60||0)+(+f.overdue_61_90||0)+(+f.overdue_91_plus||0)) >= 1000);
  const ov_1_30 = activeSig.reduce((s, f) => s + (+f.overdue_1_30 || 0), 0);
  const ov_31_60 = activeSig.reduce((s, f) => s + (+f.overdue_31_60 || 0), 0);
  const ov_61_90 = activeSig.reduce((s, f) => s + (+f.overdue_61_90 || 0), 0);
  const ov_91 = activeSig.reduce((s, f) => s + (+f.overdue_91_plus || 0), 0);
  const maxDays = ov_91 > 0 ? 91 : ov_61_90 > 0 ? 61 : ov_31_60 > 0 ? 31 : ov_1_30 > 0 ? 1 : 0;
  const ageColor = maxDays >= 91 ? '#e05c4b' : maxDays >= 31 ? '#e8a020' : '#22a66a';
  const ageLabel = maxDays >= 91 ? '91+ días' : maxDays >= 61 ? '61–90 días' : maxDays >= 31 ? '31–60 días' : maxDays >= 1 ? '1–30 días' : 'Al día';
  const gestor = staff.find(g => g.id === debtor?.assigned_user_id);
  const initials = (debtor?.debtor_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const handleSaveContact = async () => {
    const { error } = await supabase.from('collection_debtors').update({
      phone: contactForm.phone || null,
      whatsapp: contactForm.whatsapp || null,
      email: contactForm.email || null,
      city: contactForm.city || null,
      notes: contactForm.notes || null,
    }).eq('id', id);
    if (error) { alert(error.message); return; }
    setIsEditingContact(false);
    loadAll();
  };

  const handleSaveAction = async () => {
    if (!actionForm.notes) { alert('Notes are required'); return; }
    try {
      const { error } = await supabase.from('collection_actions').insert({
        company_id: debtor.company_id, debtor_id: id,
        user_id: actionForm.user_id || null, channel: actionForm.channel,
        result: actionForm.result, notes: actionForm.notes, next_follow_up: actionForm.follow_up || null,
      });
      if (error) throw error;

      const newStatus = { paid: 'paid', payment_promise: 'promised', payment_agreement: 'agreement', partial_payment: 'partially_paid', uncontactable: 'uncontactable', contacted: 'in_collection', requested_extension: 'in_collection' }[actionForm.result];
      if (newStatus) {
        await supabase.from('collection_debtors').update({ status: newStatus, assigned_user_id: actionForm.user_id || debtor.assigned_user_id }).eq('id', id);
      }

      if (actionForm.follow_up) {
        await supabase.from('collection_tasks').insert({
          company_id: debtor.company_id, debtor_id: id, assigned_user_id: actionForm.user_id || null,
          title: `Seguimiento — ${RESULT_LABELS[actionForm.result] || actionForm.result}`,
          due_date: actionForm.follow_up, priority: 'medium', status: 'pending',
        });
      }

      setShowActionModal(false);
      setActionForm(f => ({ ...f, notes: '', follow_up: '' }));
      loadAll();
    } catch (e) { alert(e.message); }
  };

  const handleSaveAgreement = async () => {
    if (!agrForm.amount || !agrForm.due_date) { alert('Monto y fecha requeridos'); return; }
    try {
      const { error } = await supabase.from('collection_agreements').insert({
        company_id: debtor.company_id, debtor_id: id, type: agrForm.type,
        promised_amount: parseFloat(agrForm.amount),
        total_amount: parseFloat(agrForm.total) || parseFloat(agrForm.amount),
        installment_count: agrForm.type === 'installment' ? parseInt(agrForm.installments) || 1 : 1,
        first_due_date: agrForm.due_date, status: 'active', notes: agrForm.notes || null, created_by: currentUser?.id || null
      });
      if (error) throw error;
      await supabase.from('collection_debtors').update({ status: agrForm.type === 'installment' ? 'agreement' : 'promised' }).eq('id', id);
      setShowAgrModal(false);
      setAgrForm({ type: 'promise', amount: '', total: '', due_date: '', installments: 1, notes: '' });
      loadAll();
    } catch (e) { alert(e.message); }
  };

  const handleSaveTask = async () => {
    if (!taskForm.title) { alert('Título requerido'); return; }
    try {
      const { error } = await supabase.from('collection_tasks').insert({
        company_id: debtor.company_id, debtor_id: id, assigned_user_id: taskForm.user_id || null,
        title: taskForm.title, description: taskForm.description || null, due_date: taskForm.due_date || null, priority: taskForm.priority, status: 'pending'
      });
      if (error) throw error;
      setShowTaskModal(false);
      setTaskForm(f => ({ ...f, title: '', description: '', due_date: '' }));
      loadAll();
    } catch (e) { alert(e.message); }
  };

  const toggleTask = async (taskId, currentStatus) => {
    const { error } = await supabase.from('collection_tasks').update({ status: currentStatus === 'completed' ? 'pending' : 'completed' }).eq('id', taskId);
    if (!error) loadAll();
  };

  const deleteTask = async (taskId) => {
    if (!window.confirm('¿Eliminar tarea?')) return;
    const { error } = await supabase.from('collection_tasks').delete().eq('id', taskId);
    if (!error) loadAll();
  };

  const deleteAgreement = async (agrId) => {
    if (!window.confirm('¿Eliminar acuerdo?')) return;
    const { error } = await supabase.from('collection_agreements').delete().eq('id', agrId);
    if (!error) loadAll();
  };

  if (loading || !debtor) {
    return <div className={styles.app}><div className={styles.main}><div className={styles.content}><div className={styles.page} style={{color:'rgba(255,255,255,.25)'}}>Cargando ficha...</div></div></div></div>;
  }

  return (
    <div className={styles.app}>
      <div className={styles.main}>
        <div className={styles.content}>
          <div className={styles.page}>
            <div style={{ marginBottom: '1rem', fontSize: '.8rem' }}>
              <Link to="/admin/collections" style={{ color: 'rgba(255,255,255,.5)', textDecoration: 'none' }}>← Volver a Cartera</Link>
            </div>
            <div className={styles.detailGrid}>
              
              {/* LEFT COL */}
              <div>
                <div className={styles.card}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.85rem', gap: '.5rem' }}>
                    <div className={styles.pfAvatar}>{initials}</div>
                    <span className={`${styles.badge} ${STATUS_CLS[debtor.status]}`}>{STATUS_MAP[debtor.status] || debtor.status}</span>
                  </div>
                  <div className={styles.pfName}>{debtor.debtor_name}</div>
                  <div className={styles.pfDoc}>{debtor.debtor_document || 'Sin documento'} · {debtor.companies?.name || '—'}</div>
                  
                  <div className={styles.moraGrid}>
                    <div className={styles.moraBox}><div className={styles.moraBoxLbl}>1–30 días</div><div className={styles.moraBoxVal} style={{color: ov_1_30 > 0 ? '#c9a84c' : 'rgba(255,255,255,.25)'}}>{fmt(ov_1_30)}</div></div>
                    <div className={styles.moraBox}><div className={styles.moraBoxLbl}>31–60 días</div><div className={styles.moraBoxVal} style={{color: ov_31_60 > 0 ? '#e8a020' : 'rgba(255,255,255,.25)'}}>{fmt(ov_31_60)}</div></div>
                    <div className={styles.moraBox}><div className={styles.moraBoxLbl}>61–90 días</div><div className={styles.moraBoxVal} style={{color: ov_61_90 > 0 ? '#e05c4b' : 'rgba(255,255,255,.25)'}}>{fmt(ov_61_90)}</div></div>
                    <div className={styles.moraBox}><div className={styles.moraBoxLbl}>91+ días</div><div className={styles.moraBoxVal} style={{color: ov_91 > 0 ? '#e05c4b' : 'rgba(255,255,255,.25)'}}>{fmt(ov_91)}</div></div>
                  </div>

                  <div style={{ margin: '.85rem 0' }}>
                    <div className={styles.pfRow}><span className={styles.pfLbl}>Saldo vencido</span><span className={`${styles.pfVal} ${styles.pfValAmount}`}>{fmt(totalOut)}</span></div>
                    <div className={styles.pfRow}><span className={styles.pfLbl}>Antigüedad</span><span className={styles.pfVal} style={{color: ageColor, fontWeight: 600}}>{ageLabel}</span></div>
                    <div className={styles.pfRow}><span className={styles.pfLbl}>Ciudad</span><span className={styles.pfVal}>{debtor.city || '—'}</span></div>
                    <div className={styles.pfRow}><span className={styles.pfLbl}>Gestor</span><span className={styles.pfVal}>{gestor?.full_name || '—'}</span></div>
                    <div className={styles.pfRow}><span className={styles.pfLbl}>Teléfono</span><span className={styles.pfVal}>{debtor.phone || '—'}</span></div>
                    <div className={styles.pfRow}><span className={styles.pfLbl}>Celular</span><span className={styles.pfVal}>{debtor.whatsapp || '—'}</span></div>
                    <div className={styles.pfRow}><span className={styles.pfLbl}>Email</span><span className={styles.pfVal}>{debtor.email || '—'}</span></div>
                    {debtor.notes && <div className={styles.pfRow} style={{flexDirection: 'column'}}><span className={styles.pfLbl}>Notas</span><span className={styles.pfVal} style={{fontSize: '.74rem', color: 'rgba(255,255,255,.5)'}}>{debtor.notes}</span></div>}
                  </div>

                  <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', paddingTop: '.75rem', borderTop: '1px solid rgba(255,255,255,.07)' }}>
                    <button className={styles.btnP} onClick={() => setShowActionModal(true)}>+ Gestión</button>
                    <button className={styles.btnG} onClick={() => setIsEditingContact(!isEditingContact)}>📞 Editar datos</button>
                  </div>

                  {isEditingContact && (
                    <div style={{ marginTop: '.75rem', padding: '.75rem', background: '#1a2230', border: '1px solid rgba(255,255,255,.07)', borderRadius: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: '.5rem' }}>
                        <input type="text" value={contactForm.phone} onChange={e=>setContactForm({...contactForm, phone: e.target.value})} placeholder="Teléfono" style={{background:'#212c3d', border:'1px solid rgba(255,255,255,.07)', borderRadius:'6px', padding:'.35rem .6rem', fontSize:'.73rem', color:'#fff'}} />
                        <input type="text" value={contactForm.whatsapp} onChange={e=>setContactForm({...contactForm, whatsapp: e.target.value})} placeholder="Celular" style={{background:'#212c3d', border:'1px solid rgba(255,255,255,.07)', borderRadius:'6px', padding:'.35rem .6rem', fontSize:'.73rem', color:'#fff'}} />
                        <input type="text" value={contactForm.email} onChange={e=>setContactForm({...contactForm, email: e.target.value})} placeholder="Email" style={{background:'#212c3d', border:'1px solid rgba(255,255,255,.07)', borderRadius:'6px', padding:'.35rem .6rem', fontSize:'.73rem', color:'#fff'}} />
                        <input type="text" value={contactForm.city} onChange={e=>setContactForm({...contactForm, city: e.target.value})} placeholder="Ciudad" style={{background:'#212c3d', border:'1px solid rgba(255,255,255,.07)', borderRadius:'6px', padding:'.35rem .6rem', fontSize:'.73rem', color:'#fff'}} />
                      </div>
                      <textarea value={contactForm.notes} onChange={e=>setContactForm({...contactForm, notes: e.target.value})} placeholder="Notas..." rows="2" style={{width:'100%', background:'#212c3d', border:'1px solid rgba(255,255,255,.07)', borderRadius:'6px', padding:'.35rem .6rem', fontSize:'.73rem', color:'#fff', marginBottom:'.5rem'}} />
                      <div style={{ display: 'flex', gap: '.4rem' }}>
                        <button className={styles.btnCe} onClick={handleSaveContact}>💾 Guardar</button>
                        <button className={styles.actBtn} onClick={() => setIsEditingContact(false)}>✕ Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHd}><div><div className={styles.stag}>collection_debts</div><div className={styles.cardTitle}>Facturas</div><div className={styles.cardSub}>{debts.length} facturas</div></div></div>
                  {debts.length === 0 ? <div className={styles.empty}><div className={styles.emptyIcon}>📄</div><div className={styles.emptyTxt}>Sin facturas</div></div> : (
                    <div style={{ overflowX: 'auto', maxHeight: '260px' }}>
                      <table className={styles.tbl}>
                        <thead><tr><th>Factura</th><th>Vence</th><th>1–30</th><th>Total</th><th>Est.</th></tr></thead>
                        <tbody>
                          {debts.map(f => (
                            <tr key={f.id} style={{ opacity: f.status === 'paid' ? 0.5 : 1 }}>
                              <td style={{fontWeight:500}}>{f.siigo_document}</td>
                              <td style={{fontSize:'.7rem'}}>{fmtDate(f.due_date)}</td>
                              <td style={{fontSize:'.7rem', color: f.overdue_1_30 > 0 ? '#c9a84c' : 'rgba(255,255,255,.25)'}}>{f.overdue_1_30 > 0 ? fmt(f.overdue_1_30) : '—'}</td>
                              <td style={{fontWeight:500}}>{fmt(f.total_balance)}</td>
                              <td><span className={`${styles.badge} ${f.status === 'paid' ? styles.bOk : styles.bN}`}>{f.status === 'paid' ? 'Pagada' : 'Activa'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHd}><div><div className={styles.stag}>Acuerdos</div><div className={styles.cardTitle}>Acuerdos de pago</div></div><button className={styles.btnP} onClick={()=>setShowAgrModal(true)}>+ Nuevo</button></div>
                  {agreements.length === 0 ? <div className={styles.empty}><div className={styles.emptyIcon}>🤝</div><div className={styles.emptyTxt}>Sin acuerdos</div></div> : (
                    <table className={styles.tbl}>
                      <thead><tr><th>Tipo</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
                      <tbody>
                        {agreements.map(a => (
                          <tr key={a.id}>
                            <td style={{fontWeight:500}}>{a.type === 'installment' ? `Cuotas (${a.installment_count})` : 'Promesa única'}</td>
                            <td>{fmt(a.promised_amount)}</td>
                            <td><span className={styles.badge}>{a.status}</span></td>
                            <td><button className={`${styles.actBtn} ${styles.actBtnDanger}`} onClick={()=>deleteAgreement(a.id)}>🗑</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHd}><div><div className={styles.stag}>Seguimiento</div><div className={styles.cardTitle}>Tareas</div></div><button className={styles.btnP} onClick={()=>setShowTaskModal(true)}>+ Tarea</button></div>
                  {tasks.length === 0 ? <div className={styles.empty}><div className={styles.emptyIcon}>📅</div><div className={styles.emptyTxt}>Sin tareas</div></div> : (
                    <div>
                      {tasks.map(t => (
                        <div key={t.id} className={styles.taskItem}>
                          <div className={`${styles.tChk} ${t.status === 'completed' ? styles.tChkDone : ''}`} onClick={()=>toggleTask(t.id, t.status)}>{t.status === 'completed' ? '✓' : ''}</div>
                          <div className={styles.tBody}>
                            <div className={`${styles.tTitle} ${t.status === 'completed' ? styles.tTitleDone : ''}`}>{t.title}</div>
                            <div className={styles.tMeta}>
                              <span className={t.priority === 'high' ? styles.pHi : t.priority === 'medium' ? styles.pMed : styles.pLo}>{t.priority}</span>
                              {t.due_date && <span>📅 {fmtDate(t.due_date)}</span>}
                              {t.profiles && <span style={{color:'#c9a84c'}}>{t.profiles.full_name}</span>}
                              <button className={`${styles.actBtn} ${styles.actBtnDanger}`} style={{marginLeft:'auto'}} onClick={()=>deleteTask(t.id)}>🗑</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* RIGHT COL */}
              <div>
                <div className={styles.card}>
                  <div className={styles.cardHd}><div><div className={styles.stag}>collection_actions</div><div className={styles.cardTitle}>Historial de gestiones</div><div className={styles.cardSub}>{actions.length} gestiones</div></div><button className={styles.btnP} onClick={()=>setShowActionModal(true)}>+ Registrar gestión</button></div>
                  {actions.length === 0 ? <div className={styles.empty}><div className={styles.emptyIcon}>📋</div><div className={styles.emptyTxt}>Sin gestiones registradas.</div></div> : (
                    <div className={styles.timeline}>
                      {actions.map(a => {
                        const color = RESULT_COLORS[a.result] || 'rgba(255,255,255,.25)';
                        return (
                          <div key={a.id} className={styles.tlItem}>
                            <div className={styles.tlDot} style={{ background: color + '22', borderColor: color }}>{CH_ICON[a.channel] || '📝'}</div>
                            <div className={styles.tlBody}>
                              <div className={styles.tlHeader}>
                                <span className={styles.tlResult} style={{color}}>{RESULT_LABELS[a.result] || a.result}</span>
                                <span className={styles.tlChannel}>{a.channel}</span>
                                <span className={styles.tlGestor}>{a.profiles?.full_name || '—'}</span>
                                <span className={styles.tlDate}>{fmtDT(a.created_at)}</span>
                              </div>
                              {a.notes && <div className={styles.tlNotes}>{a.notes}</div>}
                              {a.next_follow_up && <div className={styles.tlNext}>📅 Seguimiento: {fmtDate(a.next_follow_up)}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {showActionModal && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowActionModal(false); }}>
          <div className={styles.modal}>
            <div className={styles.modalHd}><h3>Registrar gestión</h3><button className={styles.modalClose} onClick={() => setShowActionModal(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div className={styles.fieldRow}>
                <div className={styles.field}><label>Canal *</label>
                  <select value={actionForm.channel} onChange={e=>setActionForm({...actionForm, channel: e.target.value})}>
                    <option value="phone">📞 Llamada</option><option value="whatsapp">💬 WhatsApp</option><option value="email">📧 Email</option><option value="sms">📱 SMS</option><option value="manual">📝 Manual</option>
                  </select>
                </div>
                <div className={styles.field}><label>Resultado *</label>
                  <select value={actionForm.result} onChange={e=>setActionForm({...actionForm, result: e.target.value})}>
                    <option value="contacted">Contactado</option><option value="no_answer">No contesta</option><option value="payment_promise">Promesa de pago</option><option value="paid">Pagó</option><option value="uncontactable">Incontactable</option><option value="requested_extension">Solicita prórroga</option>
                  </select>
                </div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}><label>Gestor</label>
                  <select value={actionForm.user_id} onChange={e=>setActionForm({...actionForm, user_id: e.target.value})}>
                    <option value="">— Sin asignar —</option>
                    {staff.map(g => <option key={g.id} value={g.id}>{g.full_name}</option>)}
                  </select>
                </div>
                <div className={styles.field}><label>Fecha seguimiento</label>
                  <input type="date" value={actionForm.follow_up} onChange={e=>setActionForm({...actionForm, follow_up: e.target.value})} />
                </div>
              </div>
              <div className={styles.field}><label>Notas *</label><textarea rows="3" value={actionForm.notes} onChange={e=>setActionForm({...actionForm, notes: e.target.value})} placeholder="Detalles de la gestión..."></textarea></div>
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setShowActionModal(false)}>Cancelar</button>
              <button className={styles.btnP} onClick={handleSaveAction}>Guardar gestión</button>
            </div>
          </div>
        </div>
      )}

      {showAgrModal && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowAgrModal(false); }}>
          <div className={styles.modal}>
            <div className={styles.modalHd}><h3>Nuevo acuerdo</h3><button className={styles.modalClose} onClick={() => setShowAgrModal(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div className={styles.field}><label>Tipo *</label>
                <select value={agrForm.type} onChange={e=>setAgrForm({...agrForm, type: e.target.value})}>
                  <option value="promise">Promesa única</option><option value="installment">Acuerdo en cuotas</option>
                </select>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}><label>Monto comprometido *</label><input type="number" value={agrForm.amount} onChange={e=>setAgrForm({...agrForm, amount: e.target.value})} /></div>
                <div className={styles.field}><label>Monto total deuda</label><input type="number" value={agrForm.total} onChange={e=>setAgrForm({...agrForm, total: e.target.value})} /></div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}><label>Primera fecha *</label><input type="date" value={agrForm.due_date} onChange={e=>setAgrForm({...agrForm, due_date: e.target.value})} /></div>
                {agrForm.type === 'installment' && <div className={styles.field}><label>Cuotas</label><input type="number" value={agrForm.installments} onChange={e=>setAgrForm({...agrForm, installments: e.target.value})} /></div>}
              </div>
              <div className={styles.field}><label>Notas</label><textarea rows="2" value={agrForm.notes} onChange={e=>setAgrForm({...agrForm, notes: e.target.value})}></textarea></div>
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setShowAgrModal(false)}>Cancelar</button>
              <button className={styles.btnP} onClick={handleSaveAgreement}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {showTaskModal && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowTaskModal(false); }}>
          <div className={styles.modal}>
            <div className={styles.modalHd}><h3>Nueva tarea</h3><button className={styles.modalClose} onClick={() => setShowTaskModal(false)}>✕</button></div>
            <div className={styles.modalBody}>
              <div className={styles.field}><label>Título *</label><input type="text" value={taskForm.title} onChange={e=>setTaskForm({...taskForm, title: e.target.value})} /></div>
              <div className={styles.fieldRow}>
                <div className={styles.field}><label>Asignar a</label>
                  <select value={taskForm.user_id} onChange={e=>setTaskForm({...taskForm, user_id: e.target.value})}>
                    <option value="">— Sin asignar —</option>
                    {staff.map(g => <option key={g.id} value={g.id}>{g.full_name}</option>)}
                  </select>
                </div>
                <div className={styles.field}><label>Prioridad</label>
                  <select value={taskForm.priority} onChange={e=>setTaskForm({...taskForm, priority: e.target.value})}>
                    <option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option>
                  </select>
                </div>
              </div>
              <div className={styles.field}><label>Fecha límite</label><input type="date" value={taskForm.due_date} onChange={e=>setTaskForm({...taskForm, due_date: e.target.value})} /></div>
              <div className={styles.field}><label>Descripción</label><textarea rows="2" value={taskForm.description} onChange={e=>setTaskForm({...taskForm, description: e.target.value})}></textarea></div>
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setShowTaskModal(false)}>Cancelar</button>
              <button className={styles.btnP} onClick={handleSaveTask}>Crear tarea</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
