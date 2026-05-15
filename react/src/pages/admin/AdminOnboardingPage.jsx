import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import styles from './AdminOnboardingPage.module.css';

const STATUS_LABEL = {
  draft: 'Borrador', services_selected: 'Servicios ✓', policies_accepted: 'Políticas ✓',
  kyc_submitted: 'KYC enviado', pending_review: 'En revisión', approved: 'Aprobado',
  rejected: 'Rechazado', needs_correction: 'Corrección requerida'
};
const STEP_MAP = {
  draft: 1, services_selected: 2, policies_accepted: 3, kyc_submitted: 4,
  pending_review: 4, approved: 5, rejected: 5, needs_correction: 4
};

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDT = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function AdminOnboardingPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('created_at_desc');
  
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [drawerData, setDrawerData] = useState({ contracts: [], kyc: null, policies: [] });
  const [editStatus, setEditStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: records, error } = await supabase.from('client_onboardings').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setData(records || []);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleOpenDrawer = async (item) => {
    setSelectedItem(item);
    setEditStatus(item.status);
    setEditNotes(item.review_notes || '');
    setDrawerOpen(true);

    try {
      const [{ data: contracts }, { data: kyc }, { data: policies }] = await Promise.all([
        supabase.from('service_contracts').select('service_id,status,services(name)').eq('onboarding_id', item.id),
        supabase.from('kyc_submissions').select('status,submitted_at,kyc_documents(doc_type,status,file_name,storage_path)').eq('onboarding_id', item.id).maybeSingle(),
        supabase.from('policy_acceptances').select('accepted_at,policy_versions(title,version)').eq('onboarding_id', item.id),
      ]);
      setDrawerData({ contracts: contracts || [], kyc: kyc || null, policies: policies || [] });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveStatus = async () => {
    if (!selectedItem) return;
    try {
      const upd = { status: editStatus, review_notes: editNotes, reviewed_at: new Date().toISOString() };
      if (editStatus === 'approved') upd.approved_at = new Date().toISOString();
      const { error } = await supabase.from('client_onboardings').update(upd).eq('id', selectedItem.id);
      if (error) throw error;
      
      // Si se está aprobando, mostrar alerta simple (el Trigger de la BD se encarga de crear el usuario)
      if (editStatus === 'approved' && selectedItem.status !== 'approved') {
        alert('Empresa aprobada. El usuario ha sido creado automáticamente por la base de datos con contraseña temporal (Temporal123!).');
      } else {
        alert('Estado actualizado correctamente.');
      }
      
      setDrawerOpen(false);
      loadData();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleQuickApprove = async () => {
    if (!selectedItem || !window.confirm('¿Confirmas la aprobación?')) return;
    try {
      const { error } = await supabase.from('client_onboardings').update({
        status: 'approved', approved_at: new Date().toISOString(), reviewed_at: new Date().toISOString()
      }).eq('id', selectedItem.id);
      if (error) throw error;

      alert('Empresa aprobada. El usuario ha sido creado automáticamente por la base de datos con contraseña temporal (Temporal123!).');
      setDrawerOpen(false);
      loadData();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleQuickReject = async () => {
    if (!selectedItem) return;
    const reason = window.prompt('Motivo del rechazo:');
    if (!reason) return;
    try {
      const { error } = await supabase.from('client_onboardings').update({
        status: 'rejected', rejection_reason: reason, reviewed_at: new Date().toISOString()
      }).eq('id', selectedItem.id);
      if (error) throw error;
      alert('Solicitud rechazada');
      setDrawerOpen(false);
      loadData();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleViewDocument = async (path) => {
    if (!path) return;
    try {
      const { data, error } = await supabase.storage.from('kyc-documents').createSignedUrl(path, 3600);
      if (error) throw error;
      if (data && data.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (e) {
      alert('Error al abrir el documento: ' + e.message);
    }
  };

  const filtered = data.filter(r => {
    if (activeFilter !== 'all' && r.status !== activeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!((r.company_name || '').toLowerCase().includes(q) ||
            (r.company_nit || '').toLowerCase().includes(q) ||
            (r.rep_email || '').toLowerCase().includes(q) ||
            (r.rep_name || '').toLowerCase().includes(q) ||
            (r.company_city || '').toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortOrder === 'created_at_desc') return new Date(b.created_at) - new Date(a.created_at);
    if (sortOrder === 'created_at_asc') return new Date(a.created_at) - new Date(b.created_at);
    if (sortOrder === 'submitted_at_desc') return new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0);
    if (sortOrder === 'company_name_asc') return (a.company_name || '').localeCompare(b.company_name || '');
    return 0;
  });

  const reviewing = data.filter(r => r.status === 'pending_review').length;
  const approved = data.filter(r => r.status === 'approved').length;
  const inprog = data.filter(r => ['draft', 'services_selected', 'policies_accepted', 'kyc_submitted'].includes(r.status)).length;
  const rejected = data.filter(r => r.status === 'rejected').length;

  return (
    <div className={styles.app}>
      <div className={styles.main}>
        <div className={styles.content}>
          <div className={styles.pageHeader}>
            <div>
              <div className={styles.phTag}>Módulo comercial</div>
              <div className={styles.phTitle}>Onboarding Comercial</div>
              <div className={styles.phSub}>Solicitudes de vinculación</div>
            </div>
            <select className={styles.sortSelect} value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
              <option value="created_at_desc">Más recientes primero</option>
              <option value="created_at_asc">Más antiguos primero</option>
              <option value="submitted_at_desc">Enviados primero</option>
              <option value="company_name_asc">Empresa A→Z</option>
            </select>
          </div>

          <div className={styles.statsRow}>
            <div className={styles.statCard} onClick={() => setActiveFilter('all')}>
              <div className={styles.scTop}><div className={styles.scIcon} style={{ background: 'rgba(255,255,255,.06)' }}>📝</div><span className={`${styles.scTrend} ${styles.neutral}`}>{data.length} total</span></div>
              <div className={styles.scNum}>{data.length}</div><div className={styles.scLbl}>Total registros</div>
            </div>
            <div className={styles.statCard} onClick={() => setActiveFilter('pending_review')}>
              <div className={styles.scTop}><div className={styles.scIcon} style={{ background: 'rgba(196,114,7,.15)' }}>⏳</div><span className={`${styles.scTrend} ${reviewing > 0 ? styles.up : styles.neutral}`}>{reviewing > 0 ? 'revisar' : 'sin pendientes'}</span></div>
              <div className={styles.scNum} style={{ color: reviewing > 0 ? '#e8a020' : '#fff' }}>{reviewing}</div><div className={styles.scLbl}>En revisión</div>
            </div>
            <div className={styles.statCard} onClick={() => setActiveFilter('approved')}>
              <div className={styles.scTop}><div className={styles.scIcon} style={{ background: 'rgba(34,166,106,.12)' }}>✅</div><span className={`${styles.scTrend} ${styles.up}`}>activos</span></div>
              <div className={styles.scNum} style={{ color: '#22a66a' }}>{approved}</div><div className={styles.scLbl}>Aprobados</div>
            </div>
            <div className={styles.statCard} onClick={() => setActiveFilter('kyc_submitted')}>
              <div className={styles.scTop}><div className={styles.scIcon} style={{ background: 'rgba(74,159,212,.12)' }}>🔄</div><span className={`${styles.scTrend} ${styles.neutral}`}>en curso</span></div>
              <div className={styles.scNum} style={{ color: '#4a9fd4' }}>{inprog}</div><div className={styles.scLbl}>En progreso</div>
            </div>
            <div className={styles.statCard} onClick={() => setActiveFilter('rejected')}>
              <div className={styles.scTop}><div className={styles.scIcon} style={{ background: 'rgba(224,92,75,.12)' }}>❌</div><span className={`${styles.scTrend} ${styles.neutral}`}>—</span></div>
              <div className={styles.scNum} style={{ color: '#e05c4b' }}>{rejected}</div><div className={styles.scLbl}>Rechazados</div>
            </div>
          </div>

          <div className={styles.filtersBar}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIco}>🔍</span>
              <input type="text" placeholder="Buscar empresa, NIT, email…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className={styles.filterChips}>
              {['all', 'draft', 'services_selected', 'policies_accepted', 'kyc_submitted', 'pending_review', 'approved', 'rejected', 'needs_correction'].map(f => (
                <div key={f} className={`${styles.chip} ${activeFilter === f ? styles.on : ''}`} onClick={() => setActiveFilter(f)}>
                  {f === 'all' ? 'Todas' : f === 'draft' ? 'Borrador' : f === 'services_selected' ? 'Servicios' : f === 'policies_accepted' ? 'Políticas' : f === 'kyc_submitted' ? 'KYC' : f === 'pending_review' ? '⭐ En revisión' : f === 'approved' ? 'Aprobados' : f === 'rejected' ? 'Rechazados' : 'Corrección'}
                </div>
              ))}
            </div>
            <div className={styles.filtersRight}>
              <span style={{ fontSize: '.67rem', color: 'rgba(255,255,255,.25)' }}>{filtered.length} registros</span>
            </div>
          </div>

          <div className={styles.tableArea}>
            <div className={styles.tableWrap}>
              <div className={styles.tHead}>
                <div className={styles.tHeadCell}>Empresa</div>
                <div className={styles.tHeadCell}>Representante</div>
                <div className={styles.tHeadCell}>Estado</div>
                <div className={styles.tHeadCell}>Progreso</div>
                <div className={styles.tHeadCell}>Ciudad</div>
                <div className={styles.tHeadCell}>Fecha</div>
                <div className={styles.tHeadCell}></div>
              </div>
              <div className={styles.tBody}>
                {loading ? <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,.25)' }}>Cargando...</div> : filtered.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIco}>🔍</div>
                    <div className={styles.emptyTtl}>Sin resultados</div>
                    <div className={styles.emptySub}>No hay registros que coincidan.</div>
                  </div>
                ) : filtered.map(r => {
                  const step = STEP_MAP[r.status] || 1;
                  return (
                    <div key={r.id} className={styles.tRow} onClick={() => handleOpenDrawer(r)}>
                      <div>
                        <div className={styles.coName}>{r.company_name}</div>
                        <div className={styles.coNit}>{r.company_nit ? `NIT ${r.company_nit}` : <span style={{ color: 'rgba(255,255,255,.25)' }}>Sin NIT</span>}</div>
                      </div>
                      <div>
                        <div className={styles.repName}>{r.rep_name}</div>
                        <div className={styles.repEmail}>{r.rep_email}</div>
                        {r.rep_phone && <div className={styles.repPhone}>{r.rep_phone}</div>}
                      </div>
                      <div>
                        <span className={`${styles.sbadge} ${styles[r.status]}`}>{STATUS_LABEL[r.status] || r.status}</span>
                      </div>
                      <div>
                        <div className={styles.stepPip}>
                          {[1, 2, 3, 4, 5].map(n => <div key={n} className={`${styles.pip} ${n < step ? styles.done : n === step ? styles.active : ''}`}></div>)}
                        </div>
                        <div style={{ fontSize: '.6rem', color: 'rgba(255,255,255,.25)', marginTop: '.22rem' }}>Paso {step} de 5</div>
                      </div>
                      <div className={styles.tCell}>{r.company_city || '—'}</div>
                      <div className={styles.tCellDim}>{r.submitted_at ? '📤 ' + fmtDate(r.submitted_at) : '📝 ' + fmtDate(r.created_at)}</div>
                      <div className={styles.rowActs} onClick={e => e.stopPropagation()}>
                        <button className={styles.raBtn} onClick={() => handleOpenDrawer(r)}>👁</button>
                        <a className={styles.raBtn} href={`mailto:${r.rep_email}`}>📧</a>
                        {r.rep_phone && <a className={styles.raBtn} href={`https://wa.me/${r.rep_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">💬</a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>

      {drawerOpen && selectedItem && (
        <>
          <div className={`${styles.drawerOv} ${drawerOpen ? styles.open : ''}`} onClick={() => setDrawerOpen(false)}></div>
          <div className={`${styles.drawer} ${drawerOpen ? styles.open : ''}`}>
            <div className={styles.drHead}>
              <div>
                <div className={styles.drTitle}>{selectedItem.company_name}</div>
                <div className={styles.drSub}>NIT: {selectedItem.company_nit || '—'} · {STATUS_LABEL[selectedItem.status]}</div>
              </div>
              <button className={styles.drClose} onClick={() => setDrawerOpen(false)}>✕</button>
            </div>
            
            <div className={styles.drBody}>
              <div className={styles.drSection}>
                <div className={styles.drSectTitle}>Progreso del proceso</div>
                <div className={styles.drSteps}>
                  {[1, 2, 3, 4, 5].map((n, i) => {
                    const step = STEP_MAP[selectedItem.status] || 1;
                    const labels = ['Datos', 'Servicios', 'Políticas', 'KYC', 'Confirmación'];
                    const cls = n < step ? styles.done : n === step ? styles.active : '';
                    return (
                      <div key={n} className={`${styles.drStep} ${cls}`}>
                        <div className={styles.drStepDot}>{n < step ? '✓' : n}</div>
                        <div className={styles.drStepLbl}>{labels[i]}</div>
                      </div>
                    );
                  })}
                </div>
                <span className={`${styles.sbadge} ${styles[selectedItem.status]}`} style={{ marginTop: '.5rem' }}>{STATUS_LABEL[selectedItem.status]}</span>
              </div>

              <div className={styles.drSection}>
                <div className={styles.drSectTitle}>Datos de contacto</div>
                <div className={styles.drGrid}>
                  <div className={styles.drField}><div className={styles.drLbl}>Representante</div><div className={styles.drVal}>{selectedItem.rep_name}</div></div>
                  <div className={styles.drField}><div className={styles.drLbl}>Cédula</div><div className={`${styles.drVal} ${!selectedItem.rep_cedula ? styles.empty : ''}`}>{selectedItem.rep_cedula || 'No registrada'}</div></div>
                  <div className={styles.drField}><div className={styles.drLbl}>Cargo</div><div className={`${styles.drVal} ${!selectedItem.rep_position ? styles.empty : ''}`}>{selectedItem.rep_position || '—'}</div></div>
                  <div className={styles.drField}><div className={styles.drLbl}>Teléfono</div><div className={`${styles.drVal} ${!selectedItem.rep_phone ? styles.empty : ''}`}>{selectedItem.rep_phone || '—'}</div></div>
                  <div className={`${styles.drField} ${styles.full}`}><div className={styles.drLbl}>Correo</div><div className={styles.drVal}>{selectedItem.rep_email}</div></div>
                </div>
                <div className={styles.contactBar}>
                  <a className={`${styles.ctBtn} ${styles.ctBtnEmail}`} href={`mailto:${selectedItem.rep_email}`}>✉️ Email</a>
                  {selectedItem.rep_phone && <a className={`${styles.ctBtn} ${styles.ctBtnPhone}`} href={`tel:${selectedItem.rep_phone}`}>📞 Llamar</a>}
                  {selectedItem.rep_phone && <a className={`${styles.ctBtn} ${styles.ctBtnWa}`} href={`https://wa.me/${selectedItem.rep_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
                </div>
              </div>

              <div className={styles.drSection}>
                <div className={styles.drSectTitle}>Información de la empresa</div>
                <div className={styles.drGrid}>
                  <div className={styles.drField}><div className={styles.drLbl}>Razón social</div><div className={styles.drVal}>{selectedItem.company_name}</div></div>
                  <div className={styles.drField}><div className={styles.drLbl}>NIT</div><div className={`${styles.drVal} ${!selectedItem.company_nit ? styles.empty : ''}`}>{selectedItem.company_nit || '—'}</div></div>
                  <div className={styles.drField}><div className={styles.drLbl}>Tipo</div><div className={`${styles.drVal} ${!selectedItem.company_type ? styles.empty : ''}`}>{selectedItem.company_type || '—'}</div></div>
                  <div className={styles.drField}><div className={styles.drLbl}>Sector</div><div className={`${styles.drVal} ${!selectedItem.company_sector ? styles.empty : ''}`}>{selectedItem.company_sector || '—'}</div></div>
                  <div className={styles.drField}><div className={styles.drLbl}>Ciudad</div><div className={`${styles.drVal} ${!selectedItem.company_city ? styles.empty : ''}`}>{selectedItem.company_city || '—'}</div></div>
                  <div className={styles.drField}><div className={styles.drLbl}>Teléfono</div><div className={`${styles.drVal} ${!selectedItem.company_phone ? styles.empty : ''}`}>{selectedItem.company_phone || '—'}</div></div>
                  {selectedItem.company_address && <div className={`${styles.drField} ${styles.full}`}><div className={styles.drLbl}>Dirección</div><div className={styles.drVal}>{selectedItem.company_address}</div></div>}
                  {selectedItem.company_website && <div className={`${styles.drField} ${styles.full}`}><div className={styles.drLbl}>Sitio web</div><div className={styles.drVal}><a href={selectedItem.company_website} target="_blank" rel="noreferrer" style={{ color: '#4a9fd4' }}>{selectedItem.company_website}</a></div></div>}
                </div>
              </div>

              <div className={styles.drSection}>
                <div className={styles.drSectTitle}>Servicios seleccionados</div>
                {drawerData.contracts.length > 0 ? drawerData.contracts.map(c => (
                  <div key={c.service_id} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', padding: '.3rem 0', borderBottom: '1px solid rgba(255,255,255,.04)', fontSize: '.78rem', color: 'rgba(255,255,255,.5)' }}>
                    <span style={{ color: '#22a66a' }}>✓</span> {c.services?.name || '—'}
                  </div>
                )) : <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.25)', fontStyle: 'italic' }}>Sin servicios seleccionados</div>}
              </div>

              <div className={styles.drSection}>
                <div className={styles.drSectTitle}>Políticas aceptadas</div>
                {drawerData.policies.length > 0 ? drawerData.policies.map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.3rem 0', borderBottom: '1px solid rgba(255,255,255,.04)', fontSize: '.75rem', color: 'rgba(255,255,255,.5)' }}>
                    <span>{p.policy_versions?.title || '—'}</span>
                    <span style={{ color: '#22a66a', fontSize: '.65rem' }}>✓ {fmtDate(p.accepted_at)}</span>
                  </div>
                )) : <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.25)', fontStyle: 'italic' }}>Sin políticas aceptadas</div>}
              </div>

              <div className={styles.drSection}>
                <div className={styles.drSectTitle}>
                  Documentos KYC · <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: drawerData.kyc?.status === 'approved' ? '#22a66a' : drawerData.kyc?.status === 'submitted' ? '#e8a020' : 'rgba(255,255,255,.25)' }}>
                    {drawerData.kyc ? (STATUS_LABEL[drawerData.kyc.status] || drawerData.kyc.status) : 'Sin KYC'}
                  </span>
                </div>
                {drawerData.kyc ? ['rut', 'cedula_representante', 'sarlaft_form'].map(type => {
                  const doc = drawerData.kyc.kyc_documents?.find(d => d.doc_type === type);
                  const icons = { rut: '📄', cedula_representante: '🪪', sarlaft_form: '🛡️' };
                  const names = { rut: 'RUT', cedula_representante: 'Cédula rep. legal', sarlaft_form: 'SARLAFT' };
                  const stIcon = doc ? (doc.status === 'verified' ? '✅' : doc.status === 'rejected' ? '❌' : '⏳') : '⬜';
                  const stCol = doc ? (doc.status === 'verified' ? '#22a66a' : doc.status === 'rejected' ? '#e05c4b' : '#e8a020') : 'rgba(255,255,255,.25)';
                  return (
                    <div key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.38rem 0', borderBottom: '1px solid rgba(255,255,255,.04)', fontSize: '.78rem', color: 'rgba(255,255,255,.5)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                        <span>{icons[type]} {names[type]}</span>
                        {doc && doc.storage_path && (
                          <button 
                            onClick={() => handleViewDocument(doc.storage_path)}
                            style={{ background: 'transparent', border: '1px solid rgba(74,159,212,.3)', borderRadius: '4px', color: '#4a9fd4', padding: '.1rem .3rem', fontSize: '.65rem', cursor: 'pointer' }}>
                            Ver doc
                          </button>
                        )}
                      </div>
                      <span style={{ color: stCol, fontSize: '.72rem' }}>{stIcon} {doc ? doc.status : 'No subido'}</span>
                    </div>
                  );
                }) : <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.25)', fontStyle: 'italic' }}>Sin KYC registrado</div>}
              </div>

              <div className={styles.drSection}>
                <div className={styles.drSectTitle}>Auditoría</div>
                <div className={styles.drGrid}>
                  <div className={styles.drField}><div className={styles.drLbl}>Creado</div><div className={styles.drVal}>{fmtDT(selectedItem.created_at)}</div></div>
                  <div className={styles.drField}><div className={styles.drLbl}>Actualizado</div><div className={styles.drVal}>{fmtDT(selectedItem.updated_at)}</div></div>
                  <div className={styles.drField}><div className={styles.drLbl}>Enviado</div><div className={`${styles.drVal} ${!selectedItem.submitted_at ? styles.empty : ''}`}>{selectedItem.submitted_at ? fmtDT(selectedItem.submitted_at) : 'No enviado'}</div></div>
                  <div className={styles.drField}><div className={styles.drLbl}>Aprobado</div><div className={`${styles.drVal} ${!selectedItem.approved_at ? styles.empty : ''}`}>{selectedItem.approved_at ? fmtDT(selectedItem.approved_at) : '—'}</div></div>
                </div>
              </div>

              <div className={styles.drSection}>
                <div className={styles.drSectTitle}>Cambiar estado</div>
                <select className={styles.statusSelect} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                  <option value="draft">Borrador</option>
                  <option value="services_selected">Servicios seleccionados</option>
                  <option value="policies_accepted">Políticas aceptadas</option>
                  <option value="kyc_submitted">KYC enviado</option>
                  <option value="pending_review">En revisión</option>
                  <option value="approved">✅ Aprobado</option>
                  <option value="rejected">❌ Rechazado</option>
                  <option value="needs_correction">⚠️ Requiere corrección</option>
                </select>
                <div style={{ marginTop: '.75rem' }}>
                  <div style={{ fontSize: '.62rem', fontWeight: 600, color: 'rgba(255,255,255,.25)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '.35rem' }}>Notas internas</div>
                  <textarea className={styles.notesArea} value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Observaciones del equipo RS…"></textarea>
                </div>
                {selectedItem.rejection_reason && (
                  <div style={{ marginTop: '.6rem', background: 'rgba(224,92,75,.12)', border: '1px solid rgba(224,92,75,.3)', borderRadius: '10px', padding: '.65rem .85rem', fontSize: '.75rem', color: '#e05c4b' }}>
                    <strong>Motivo:</strong> {selectedItem.rejection_reason}
                  </div>
                )}
              </div>
            </div>
            
            <div className={styles.drFoot}>
              <button className={styles.btnP} onClick={handleSaveStatus}>Guardar cambios</button>
              <button className={styles.btnS} onClick={() => setDrawerOpen(false)}>Cancelar</button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem' }}>
                {selectedItem.status === 'pending_review' && (
                  <>
                    <button className={styles.btnOk} onClick={handleQuickApprove}>✓ Aprobar</button>
                    <button className={styles.btnErr} onClick={handleQuickReject}>✗ Rechazar</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
