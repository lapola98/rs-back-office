import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSEO } from '../../hooks/useSEO';
import styles from './AdminCompaniesPage.module.css';

const PALETTE = [
  { color: '#c9a84c', bg: 'rgba(201,168,76,.12)' },
  { color: '#4a9fd4', bg: 'rgba(74,159,212,.12)' },
  { color: '#22a66a', bg: 'rgba(34,166,106,.12)' },
  { color: '#e8a020', bg: 'rgba(232,160,32,.12)' },
  { color: '#9b59b6', bg: 'rgba(155,89,182,.12)' },
  { color: '#e05c4b', bg: 'rgba(224,92,75,.12)' },
];

const MOD_NAMES = ['Facturación y Cartera', 'Contabilidad', 'Tesorería', 'Gestión de Personal'];
const MOD_ICONS = ['🧾', '📋', '🏦', '👥'];
const MOD_DESCS = [
  'Emisión FE, gestión de cobro, aging',
  'Libros, estados financieros, tributos',
  'Flujo de caja, pagos, conciliación',
  'Nómina, PILA, contratos, novedades',
];

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function AdminCompaniesPage() {
  useSEO({
    title: 'Directorio de Empresas',
    description: 'Gestión y administración de empresas clientes en RS Back Office.',
  });

  const [companies, setCompanies] = useState([]);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [selectedCoId, setSelectedCoId] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('todas');
  const [currentTab, setCurrentTab] = useState('info');
  
  const [coTaskFilter, setCoTaskFilter] = useState('todas');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '', nit: '', city: '', dept: '', sector: '', size: 'Mediana empresa',
    contact: '', cargo: '', email: '', tel: '', asesor: 'Ana García', status: 'activa',
    billing_module: true, accounting_module: false, treasury_module: false, hr_module: false, notes: ''
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const { data: coData, error } = await supabase
        .from('companies')
        .select('id, name, status, billing_module, accounting_module, treasury_module, hr_module, created_at')
        .order('name', { ascending: true });

      if (error) throw error;

      const enhancedCompanies = await Promise.all((coData || []).map(async (c, i) => {
        const pal = PALETTE[i % PALETTE.length];
        const initials = (c.name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const mods = [c.billing_module, c.accounting_module, c.treasury_module, c.hr_module];
        
        // Fetch counts for this company
        const [{ count: tCount }, { count: dCount }, { count: vCount }] = await Promise.all([
          supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('company_id', c.id),
          supabase.from('documents').select('*', { count: 'exact', head: true }).eq('company_id', c.id),
          supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('company_id', c.id).eq('status', 'pending').lt('due_date', new Date().toISOString().slice(0, 10))
        ]);

        // Fetch actual tasks and docs for the details view if needed later
        const { data: tasksList } = await supabase.from('tasks').select('id, title, status, due_date').eq('company_id', c.id).order('due_date');
        const { data: docsList } = await supabase.from('documents').select('id, title, category, status, storage_path, created_at').eq('company_id', c.id).order('created_at', { ascending: false });

        return {
          id: c.id,
          initials,
          color: pal.color,
          bg: pal.bg,
          name: c.name || 'Sin nombre',
          nit: '—', city: '—', dept: '—', sector: '—', size: '—',
          contact: '—', email: '—', tel: '—',
          date: fmtDate(c.created_at),
          asesor: '—',
          plan: mods.filter(Boolean).length + ' módulo(s) activo(s)',
          status: c.status || 'activa',
          mods,
          tasks: tCount || 0,
          docs: dCount || 0,
          taskVenc: vCount || 0,
          notes: '',
          tasksList: tasksList || [],
          docsList: docsList || [],
          _raw: c
        };
      }));

      setCompanies(enhancedCompanies);
    } catch (e) {
      console.error(e);
      alert('Error al cargar empresas: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    const q = searchQuery.toLowerCase();
    const filtered = companies.filter(co => {
      const matchQ = !q || co.name.toLowerCase().includes(q) || co.nit.includes(q) || co.city.toLowerCase().includes(q);
      const normS = { active: 'activa', activa: 'activa', inactive: 'inactiva', inactiva: 'inactiva', new: 'nueva', nueva: 'nueva', 'en-mora': 'en-mora' };
      const matchS = filterStatus === 'todas' || normS[co.status] === filterStatus || co.status === filterStatus;
      return matchQ && matchS;
    });
    setFilteredCompanies(filtered);
  }, [companies, searchQuery, filterStatus]);

  const handleSaveCompany = async () => {
    if (!formData.name.trim()) {
      alert('La razón social es obligatoria.');
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        status: formData.status,
        billing_module: formData.billing_module,
        accounting_module: formData.accounting_module,
        treasury_module: formData.treasury_module,
        hr_module: formData.hr_module,
      };

      if (isEditing && selectedCoId) {
        const { error } = await supabase.from('companies').update(payload).eq('id', selectedCoId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('companies').insert(payload);
        if (error) throw error;
      }

      setIsModalOpen(false);
      await loadCompanies();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedCo) return;
    if (!window.confirm(`¿Eliminar "${selectedCo.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await supabase.from('companies').delete().eq('id', selectedCo.id);
      if (error) throw error;
      setSelectedCoId(null);
      await loadCompanies();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleToggleModule = async (modIndex) => {
    if (!selectedCo) return;
    
    // Create new mods array for the update payload based on current selectedCo state
    const currentMods = [...selectedCo.mods];
    currentMods[modIndex] = !currentMods[modIndex];
    
    const payload = {
      billing_module: currentMods[0],
      accounting_module: currentMods[1],
      treasury_module: currentMods[2],
      hr_module: currentMods[3],
    };

    try {
      const { error } = await supabase.from('companies').update(payload).eq('id', selectedCo.id);
      if (error) throw error;
      await loadCompanies(); // Reload data to reflect changes
    } catch (e) {
      alert('Error guardando módulos: ' + e.message);
    }
  };

  const deleteDocFromCo = async (id, name) => {
    if (!window.confirm(`¿Eliminar "${name}"?`)) return;
    try {
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
      await loadCompanies();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const openNewModal = () => {
    setIsEditing(false);
    setFormData({
      name: '', nit: '', city: '', dept: '', sector: '', size: 'Mediana empresa',
      contact: '', cargo: '', email: '', tel: '', asesor: 'Ana García', status: 'nueva',
      billing_module: true, accounting_module: false, treasury_module: false, hr_module: false, notes: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = () => {
    if (!selectedCo) return;
    setIsEditing(true);
    setFormData({
      name: selectedCo.name, nit: selectedCo.nit !== '—' ? selectedCo.nit : '',
      city: selectedCo.city !== '—' ? selectedCo.city : '', dept: selectedCo.dept !== '—' ? selectedCo.dept : '',
      sector: selectedCo.sector !== '—' ? selectedCo.sector : '', size: selectedCo.size !== '—' ? selectedCo.size : 'Mediana empresa',
      contact: selectedCo.contact !== '—' ? selectedCo.contact : '', cargo: '',
      email: selectedCo.email !== '—' ? selectedCo.email : '', tel: selectedCo.tel !== '—' ? selectedCo.tel : '',
      asesor: selectedCo.asesor !== '—' ? selectedCo.asesor : 'Ana García', status: selectedCo.status,
      billing_module: selectedCo.mods[0], accounting_module: selectedCo.mods[1],
      treasury_module: selectedCo.mods[2], hr_module: selectedCo.mods[3], notes: selectedCo.notes || ''
    });
    setIsModalOpen(true);
  };

  const selectedCo = companies.find(c => c.id === selectedCoId);

  const renderStatusBadge = (status) => {
    const sb = { active: 'bOk', activa: 'bOk', 'en-mora': 'bWarn', inactiva: 'bN', inactive: 'bN', nueva: 'bInfo', new: 'bInfo' };
    const sl = { active: 'Activa', activa: 'Activa', 'en-mora': 'En mora', inactiva: 'Inactiva', inactive: 'Inactiva', nueva: 'Nueva', new: 'Nueva' };
    const c = sb[status] || 'bN';
    const l = sl[status] || status;
    return <span className={`${styles.badge} ${styles[c]}`}>{l}</span>;
  };

  const stBadgeDoc = { available: 'bOk', pending: 'bWarn', draft: 'bN', archived: 'bN' };
  const stLabelDoc = { available: 'Publicado', pending: 'Revisión', draft: 'Borrador', archived: 'Archivado' };

  return (
    <div className={styles.app}>
      <div className={styles.main}>
        <div className={styles.content}>
          
          {/* PANEL IZQUIERDO */}
          <div className={styles.listPanel}>
            <div className={styles.lpHead}>
              <div className={styles.lpTop}>
                <div>
                  <h2>Empresas</h2>
                  <div className={styles.lpCount}>{filteredCompanies.length} empresas · {filteredCompanies.filter(c => c.status === 'activa' || c.status === 'active').length} activas</div>
                </div>
                <button className={styles.btnP} style={{ fontSize: '.74rem', padding: '.48rem .9rem' }} onClick={openNewModal}>+ Nueva</button>
              </div>
              <div className={styles.searchBox}>
                <span style={{ color: 'rgba(255,255,255,.25)', fontSize: '.82rem' }}>🔍</span>
                <input type="text" placeholder="Buscar empresa o NIT…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <div className={styles.filterRow}>
                <button className={`${styles.filterBtn} ${filterStatus === 'todas' ? styles.filterBtnOn : ''}`} onClick={() => setFilterStatus('todas')}>Todas</button>
                <button className={`${styles.filterBtn} ${filterStatus === 'activa' ? styles.filterBtnOn : ''}`} onClick={() => setFilterStatus('activa')}>Activas</button>
                <button className={`${styles.filterBtn} ${filterStatus === 'en-mora' ? styles.filterBtnOn : ''}`} onClick={() => setFilterStatus('en-mora')}>En mora</button>
                <button className={`${styles.filterBtn} ${filterStatus === 'inactiva' ? styles.filterBtnOn : ''}`} onClick={() => setFilterStatus('inactiva')}>Inactivas</button>
                <button className={`${styles.filterBtn} ${filterStatus === 'nueva' ? styles.filterBtnOn : ''}`} onClick={() => setFilterStatus('nueva')}>Nuevas</button>
              </div>
            </div>

            <div className={styles.coList}>
              {loading && <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,.25)', fontSize: '.8rem' }}>Cargando empresas...</div>}
              {!loading && filteredCompanies.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,.25)', fontSize: '.8rem' }}>Sin empresas encontradas</div>}
              {filteredCompanies.map(co => (
                <div key={co.id} className={`${styles.coCard} ${selectedCoId === co.id ? styles.coCardActive : ''}`} onClick={() => setSelectedCoId(co.id)}>
                  <div className={styles.coAv} style={{ background: co.bg, color: co.color }}>{co.initials}</div>
                  <div className={styles.coInfo}>
                    <div className={styles.coName}>{co.name}</div>
                    <div className={styles.coCity}>{co.city} · {renderStatusBadge(co.status)}</div>
                  </div>
                  <div className={styles.coRight}>
                    <div className={styles.coMods}>
                      {co.mods.map((m, i) => <div key={i} className={`${styles.coDot} ${m ? styles.coDotOn : ''}`}></div>)}
                    </div>
                    {co.taskVenc > 0 && <span style={{ fontSize: '.58rem', color: '#e05c4b' }}>⚠ {co.taskVenc} venc.</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* PANEL DERECHO */}
          <div className={styles.detailPanel}>
            {!selectedCo ? (
              <div className={styles.dpEmpty}>
                <div className={styles.dpEmptyIcon}>🏢</div>
                <h3>Selecciona una empresa</h3>
                <p>Haz clic en cualquier empresa de la lista para ver su detalle, módulos, tareas, documentos y actividad.</p>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className={styles.dpHead}>
                  <div className={styles.dpTop}>
                    <div className={styles.dpAv} style={{ background: selectedCo.bg, color: selectedCo.color }}>{selectedCo.initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={styles.dpName}>{selectedCo.name}</div>
                      <div className={styles.dpMeta}>
                        {selectedCo.nit !== '—' && <span className={styles.dpNit}>NIT: {selectedCo.nit}</span>}
                        <span>{renderStatusBadge(selectedCo.status)}</span>
                        {selectedCo.city !== '—' && <span className={styles.dpNit}>📍 {selectedCo.city}</span>}
                      </div>
                    </div>
                    <div className={styles.dpActions}>
                      <button className={styles.btnG} onClick={openEditModal}>✏️ Editar</button>
                      <button className={styles.btnS} style={{ fontSize: '.76rem', padding: '.5rem .9rem' }}>📊 Portal</button>
                      <button className={styles.btnIc} onClick={confirmDelete} title="Eliminar empresa">🗑️</button>
                    </div>
                  </div>
                  <div className={styles.dpTabs}>
                    <div className={`${styles.dpTab} ${currentTab === 'info' ? styles.dpTabActive : ''}`} onClick={() => setCurrentTab('info')}>📋 Información</div>
                    <div className={`${styles.dpTab} ${currentTab === 'modulos' ? styles.dpTabActive : ''}`} onClick={() => setCurrentTab('modulos')}>🧩 Módulos</div>
                    <div className={`${styles.dpTab} ${currentTab === 'tareas' ? styles.dpTabActive : ''}`} onClick={() => setCurrentTab('tareas')}>✅ Tareas</div>
                    <div className={`${styles.dpTab} ${currentTab === 'docs' ? styles.dpTabActive : ''}`} onClick={() => setCurrentTab('docs')}>📁 Documentos</div>
                    <div className={`${styles.dpTab} ${currentTab === 'actividad' ? styles.dpTabActive : ''}`} onClick={() => setCurrentTab('actividad')}>📈 Actividad</div>
                  </div>
                </div>

                <div className={styles.dpBody}>
                  {/* TABS CONTENT */}
                  {currentTab === 'info' && (
                    <div className={styles.dpViewActive}>
                      <div className={styles.card}>
                        <div className={styles.cardHd}><div><div className={styles.stag}>Datos generales</div><div className={styles.cardTitle}>{selectedCo.name}</div></div></div>
                        <div className={styles.infoGrid}>
                          <div className={styles.infoField}><div className={styles.infoLbl}>NIT</div><div className={`${styles.infoVal} ${styles.infoValMono}`}>{selectedCo.nit}</div></div>
                          <div className={styles.infoField}><div className={styles.infoLbl}>Razón social</div><div className={styles.infoVal}>{selectedCo.name}</div></div>
                          <div className={styles.infoField}><div className={styles.infoLbl}>Ciudad</div><div className={styles.infoVal}>{selectedCo.city}</div></div>
                          <div className={styles.infoField}><div className={styles.infoLbl}>Departamento</div><div className={styles.infoVal}>{selectedCo.dept}</div></div>
                          <div className={styles.infoField}><div className={styles.infoLbl}>Sector</div><div className={styles.infoVal}>{selectedCo.sector}</div></div>
                          <div className={styles.infoField}><div className={styles.infoLbl}>Tamaño</div><div className={styles.infoVal}>{selectedCo.size}</div></div>
                          <div className={styles.infoField}><div className={styles.infoLbl}>Contacto principal</div><div className={styles.infoVal}>{selectedCo.contact}</div></div>
                          <div className={styles.infoField}><div className={styles.infoLbl}>Email</div><div className={`${styles.infoVal} ${styles.infoValMono}`} style={{ fontSize: '.74rem' }}>{selectedCo.email}</div></div>
                          <div className={styles.infoField}><div className={styles.infoLbl}>Teléfono</div><div className={`${styles.infoVal} ${styles.infoValMono}`}>{selectedCo.tel}</div></div>
                          <div className={styles.infoField}><div className={styles.infoLbl}>Fecha vinculación</div><div className={styles.infoVal}>{selectedCo.date}</div></div>
                          <div className={styles.infoField}><div className={styles.infoLbl}>Asesor asignado</div><div className={`${styles.infoVal} ${styles.infoValGold}`}>{selectedCo.asesor}</div></div>
                          <div className={styles.infoField}><div className={styles.infoLbl}>Plan</div><div className={`${styles.infoVal} ${styles.infoValGold}`}>{selectedCo.plan}</div></div>
                        </div>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: '1rem', marginTop: '.5rem' }}>
                          <div className={styles.infoLbl} style={{ marginBottom: '.4rem' }}>Notas internas</div>
                          <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.5)', lineHeight: 1.65, background: '#1a2230', border: '1px solid rgba(255,255,255,.07)', borderRadius: '10px', padding: '.75rem .9rem' }}>
                            {selectedCo.notes || 'Sin notas.'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.8rem' }}>
                        <div className={styles.card} style={{ textAlign: 'center', padding: '.9rem' }}>
                          <div style={{ fontSize: '.6rem', fontWeight: 600, color: 'rgba(255,255,255,.25)', letterSpacing: '.09em', textTransform: 'uppercase', marginBottom: '.4rem' }}>Tareas activas</div>
                          <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '1.6rem', fontWeight: 600, color: '#fff' }}>{selectedCo.tasks}</div>
                          <div style={{ fontSize: '.66rem', color: selectedCo.taskVenc > 0 ? '#e05c4b' : '#22a66a', marginTop: '.15rem' }}>{selectedCo.taskVenc > 0 ? `${selectedCo.taskVenc} vencidas` : 'Al día ✓'}</div>
                        </div>
                        <div className={styles.card} style={{ textAlign: 'center', padding: '.9rem' }}>
                          <div style={{ fontSize: '.6rem', fontWeight: 600, color: 'rgba(255,255,255,.25)', letterSpacing: '.09em', textTransform: 'uppercase', marginBottom: '.4rem' }}>Documentos</div>
                          <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '1.6rem', fontWeight: 600, color: '#fff' }}>{selectedCo.docs}</div>
                          <div style={{ fontSize: '.66rem', color: 'rgba(255,255,255,.25)', marginTop: '.15rem' }}>Este mes</div>
                        </div>
                        <div className={styles.card} style={{ textAlign: 'center', padding: '.9rem' }}>
                          <div style={{ fontSize: '.6rem', fontWeight: 600, color: 'rgba(255,255,255,.25)', letterSpacing: '.09em', textTransform: 'uppercase', marginBottom: '.4rem' }}>Módulos activos</div>
                          <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '1.6rem', fontWeight: 600, color: '#c9a84c' }}>{selectedCo.mods.filter(Boolean).length}</div>
                          <div style={{ fontSize: '.66rem', color: 'rgba(255,255,255,.25)', marginTop: '.15rem' }}>de 4 disponibles</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {currentTab === 'modulos' && (
                    <div className={styles.dpViewActive}>
                      <div className={styles.card}>
                        <div className={styles.cardHd}><div><div className={styles.stag}>Servicios contratados</div><div className={styles.cardTitle}>Módulos habilitados</div><div className={styles.cardSub}>Activa o desactiva los módulos disponibles para este cliente</div></div></div>
                        <div className={styles.modGrid}>
                          {MOD_NAMES.map((name, i) => (
                            <div key={i} className={`${styles.modToggle} ${selectedCo.mods[i] ? styles.modToggleOn : ''}`} onClick={() => handleToggleModule(i)}>
                              <span className={styles.modIcon}>{MOD_ICONS[i]}</span>
                              <div style={{ flex: 1 }}><div className={styles.modName}>{name}</div><div className={styles.modDesc}>{MOD_DESCS[i]}</div></div>
                              <div className={styles.modSwitch}></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {currentTab === 'tareas' && (
                    <div className={styles.dpViewActive}>
                      <div className={styles.card}>
                        <div className={styles.cardHd}>
                          <div><div className={styles.stag}>Gestión interna</div><div className={styles.cardTitle}>Tareas de la empresa</div></div>
                          <div style={{ display: 'flex', gap: '.4rem' }}>
                            <div style={{ display: 'flex', gap: '.3rem' }}>
                              <button className={`${styles.btnG} ${coTaskFilter === 'todas' ? styles.btnGOn : ''}`} onClick={() => setCoTaskFilter('todas')}>Todas</button>
                              <button className={`${styles.btnG} ${coTaskFilter === 'pendiente' ? styles.btnGOn : ''}`} onClick={() => setCoTaskFilter('pendiente')}>Pendientes</button>
                              <button className={`${styles.btnG} ${coTaskFilter === 'completada' ? styles.btnGOn : ''}`} onClick={() => setCoTaskFilter('completada')}>Completadas</button>
                            </div>
                            <button className={styles.btnP} style={{ fontSize: '.72rem', padding: '.38rem .8rem' }} onClick={() => alert('Nueva tarea...')}>+ Tarea</button>
                          </div>
                        </div>
                        <div>
                          {selectedCo.tasksList.filter(t => {
                            if (coTaskFilter === 'todas') return true;
                            if (coTaskFilter === 'pendiente') return t.status === 'pending';
                            if (coTaskFilter === 'completada') return t.status === 'completed';
                            return true;
                          }).length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'rgba(255,255,255,.25)', fontSize: '.8rem' }}>Sin tareas</div>
                          ) : (
                            selectedCo.tasksList.filter(t => {
                              if (coTaskFilter === 'todas') return true;
                              if (coTaskFilter === 'pendiente') return t.status === 'pending';
                              if (coTaskFilter === 'completada') return t.status === 'completed';
                              return true;
                            }).map(t => {
                              const done = t.status === 'completed';
                              const overdue = !done && t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
                              return (
                                <div key={t.id} className={`${styles.taskItem} ${done ? styles.taskItemDone : ''}`}>
                                  <div className={`${styles.tChk} ${done ? styles.tChkOn : ''}`}>{done ? '✓' : ''}</div>
                                  <div className={styles.tBody}>
                                    <div className={styles.tTitle}>{t.title}</div>
                                    <div className={styles.tMeta}>
                                      {overdue ? <span className={styles.pHi}>Vencida</span> : done ? <span className={styles.pLo}>Completada</span> : <span className={styles.pMed}>Pendiente</span>}
                                      {t.due_date && <span>📅 {new Date(t.due_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {currentTab === 'docs' && (
                    <div className={styles.dpViewActive}>
                      <div className={styles.card}>
                        <div className={styles.cardHd}>
                          <div><div className={styles.stag}>Archivos del cliente</div><div className={styles.cardTitle}>Documentos</div></div>
                          <button className={styles.btnP} style={{ fontSize: '.72rem', padding: '.38rem .8rem' }} onClick={() => alert('Subir documento...')}>📤 Subir</button>
                        </div>
                        <table className={styles.tbl}>
                          <thead><tr><th>Documento</th><th>Módulo</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
                          <tbody>
                            {selectedCo.docsList.length === 0 ? (
                              <tr><td colSpan="5" style={{ color: 'rgba(255,255,255,.25)', fontSize: '.78rem', padding: '.8rem', textAlign: 'center' }}>Sin documentos</td></tr>
                            ) : (
                              selectedCo.docsList.map(d => {
                                const ext = (d.storage_path || '').split('.').pop().toLowerCase();
                                const extIcons = { pdf: '📕', xlsx: '📗', xls: '📗', docx: '📘', doc: '📘' };
                                const icon = extIcons[ext] || '📄';
                                let file_url = null;
                                if (d.storage_path) {
                                  const { data: u } = supabase.storage.from('documents').getPublicUrl(d.storage_path);
                                  file_url = u?.publicUrl || null;
                                }
                                return (
                                  <tr key={d.id}>
                                    <td><div className={styles.tdW}>{icon} {d.title}</div><div className={styles.tdM}>{ext.toUpperCase()}</div></td>
                                    <td><span className={`${styles.badge} ${styles.bGold}`}>{(d.category || 'General').substring(0, 8)}</span></td>
                                    <td className={styles.tdM}>{new Date(d.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>
                                    <td><span className={`${styles.badge} ${styles[stBadgeDoc[d.status] || 'bN']}`}>{stLabelDoc[d.status] || d.status}</span></td>
                                    <td>
                                      {file_url ? <button className={styles.actBtn} onClick={() => window.open(file_url, '_blank')} title="Ver">👁</button> : <button className={styles.actBtn} style={{ opacity: .3 }}>👁</button>}
                                      <button className={styles.actBtn} onClick={() => deleteDocFromCo(d.id, d.title)} title="Eliminar">🗑️</button>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {currentTab === 'actividad' && (
                    <div className={styles.dpViewActive}>
                      <div className={styles.card}>
                        <div className={styles.cardHd}><div><div className={styles.stag}>Historial</div><div className={styles.cardTitle}>Actividad reciente</div></div></div>
                        <div className={styles.feed}>
                          <div style={{ textAlign: 'center', padding: '1rem', color: 'rgba(255,255,255,.25)', fontSize: '.78rem' }}>Funcionalidad en desarrollo</div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target.className.includes('modalOverlay')) setIsModalOpen(false); }}>
          <div className={styles.modal}>
            <div className={styles.modalHd}>
              <div>
                <h3>{isEditing ? 'Editar empresa' : 'Nueva empresa'}</h3>
                <p>{isEditing ? formData.name : 'Ingresa los datos del nuevo cliente RS Back Office'}</p>
              </div>
              <button className={styles.modalClose} onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formSectionTitle}>Información de la empresa</div>
              <div className={styles.formRow}>
                <div className={styles.field}><label>Razón social *</label><input type="text" placeholder="Ej: Constructora ABC S.A.S" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
                <div className={styles.field}><label>NIT</label><input type="text" placeholder="900.123.456-7" value={formData.nit} onChange={e => setFormData({ ...formData, nit: e.target.value })} /></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.field}><label>Ciudad</label><input type="text" placeholder="Bogotá D.C." value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} /></div>
                <div className={styles.field}><label>Departamento</label>
                  <select value={formData.dept} onChange={e => setFormData({ ...formData, dept: e.target.value })}>
                    <option value="">Seleccionar…</option><option>Bogotá D.C.</option><option>Antioquia</option><option>Valle del Cauca</option><option>Atlántico</option><option>Santander</option><option>Bolívar</option><option>Cundinamarca</option><option>Otro</option>
                  </select>
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.field}><label>Sector</label>
                  <select value={formData.sector} onChange={e => setFormData({ ...formData, sector: e.target.value })}>
                    <option value="">Seleccionar…</option><option>Construcción</option><option>Manufactura</option><option>Comercio</option><option>Servicios</option><option>Logística</option><option>Salud</option><option>Tecnología</option><option>Otro</option>
                  </select>
                </div>
                <div className={styles.field}><label>Tamaño</label>
                  <select value={formData.size} onChange={e => setFormData({ ...formData, size: e.target.value })}>
                    <option>Microempresa</option><option>Pequeña empresa</option><option>Mediana empresa</option><option>Gran empresa</option>
                  </select>
                </div>
              </div>

              <div className={styles.formSectionTitle} style={{ marginTop: '.4rem' }}>Contacto principal</div>
              <div className={styles.formRow}>
                <div className={styles.field}><label>Nombre completo</label><input type="text" placeholder="Jorge Rodríguez" value={formData.contact} onChange={e => setFormData({ ...formData, contact: e.target.value })} /></div>
                <div className={styles.field}><label>Cargo</label><input type="text" placeholder="Gerente / Director Financiero" value={formData.cargo} onChange={e => setFormData({ ...formData, cargo: e.target.value })} /></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.field}><label>Email</label><input type="email" placeholder="contacto@empresa.co" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} /></div>
                <div className={styles.field}><label>Teléfono</label><input type="text" placeholder="+57 300 000 0000" value={formData.tel} onChange={e => setFormData({ ...formData, tel: e.target.value })} /></div>
              </div>

              <div className={styles.formSectionTitle} style={{ marginTop: '.4rem' }}>Asesor y módulos</div>
              <div className={styles.formRow}>
                <div className={styles.field}><label>Asesor asignado</label>
                  <select value={formData.asesor} onChange={e => setFormData({ ...formData, asesor: e.target.value })}>
                    <option>Ana García</option><option>Carlos Muñoz</option><option>Laura Becerra</option>
                  </select>
                </div>
                <div className={styles.field}><label>Estado inicial</label>
                  <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                    <option value="nueva">Nueva</option><option value="activa">Activa</option><option value="en-mora">En mora</option><option value="inactiva">Inactiva</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '.7rem' }}>
                <div className={styles.formSectionTitle} style={{ marginBottom: '.55rem' }}>Módulos a contratar</div>
                <div className={styles.formMods}>
                  <div className={`${styles.formMod} ${formData.billing_module ? styles.formModOn : ''}`} onClick={() => setFormData({ ...formData, billing_module: !formData.billing_module })}>
                    <div className={styles.formModCheck}>{formData.billing_module ? '✓' : ''}</div><span className={styles.formModName}>🧾 Facturación y Cartera</span>
                  </div>
                  <div className={`${styles.formMod} ${formData.accounting_module ? styles.formModOn : ''}`} onClick={() => setFormData({ ...formData, accounting_module: !formData.accounting_module })}>
                    <div className={styles.formModCheck}>{formData.accounting_module ? '✓' : ''}</div><span className={styles.formModName}>📋 Contabilidad</span>
                  </div>
                  <div className={`${styles.formMod} ${formData.treasury_module ? styles.formModOn : ''}`} onClick={() => setFormData({ ...formData, treasury_module: !formData.treasury_module })}>
                    <div className={styles.formModCheck}>{formData.treasury_module ? '✓' : ''}</div><span className={styles.formModName}>🏦 Tesorería</span>
                  </div>
                  <div className={`${styles.formMod} ${formData.hr_module ? styles.formModOn : ''}`} onClick={() => setFormData({ ...formData, hr_module: !formData.hr_module })}>
                    <div className={styles.formModCheck}>{formData.hr_module ? '✓' : ''}</div><span className={styles.formModName}>👥 Gestión de Personal</span>
                  </div>
                </div>
              </div>

              <div className={styles.formRowFull}>
                <div className={styles.field}><label>Notas internas</label><textarea placeholder="Observaciones, acuerdos, contexto del cliente…" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })}></textarea></div>
              </div>
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className={styles.btnP} onClick={handleSaveCompany} disabled={saving}>{saving ? '⏳ Guardando…' : isEditing ? 'Guardar cambios →' : 'Crear empresa →'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
