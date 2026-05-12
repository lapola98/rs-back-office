import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import styles from './AdminTasksPage.module.css';

const CO_COLORS = ['#c9a84c', '#4a9fd4', '#22a66a', '#e8a020', '#9b59b6', '#e05c4b'];

const SERVICES = {
  'a629c808-d0ae-4f40-8ac6-fa1cd0c4778b': 'Contabilidad e Impuestos',
  '03288227-5f30-4fc8-9857-6005b905a1fa': 'Controller financiero y tesorería',
  'c4b63af0-b25f-4d15-9021-10ea5ac5ce95': 'Facturación y recaudo',
  '9e5de36d-a2a0-45ea-a393-b411b30e3723': 'Gestión de personal y compras',
  '786871dc-1a0b-44af-957e-1fe2f6fc6bef': 'Nómina',
  '9740c5ba-203c-4cbb-8d90-f2ca6966572b': 'SG-SST',
};

function hexToRgb(hex) {
  if (!hex || hex.startsWith('var')) return '150,150,150';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

export default function AdminTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [companies, setCompanies] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('todas');
  const [filterOwner, setFilterOwner] = useState('todas');
  const [filterCo, setFilterCo] = useState('todas');
  const [filterService, setFilterService] = useState('todas');

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formData, setFormData] = useState({ title: '', company_id: '', due_date: '', status: 'pending' });
  const [saving, setSaving] = useState(false);

  // Doc Modal
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docTask, setDocTask] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [docDesc, setDocDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, txt: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load companies
      const { data: cosData, error: cosError } = await supabase.from('companies').select('id, name').order('name');
      if (cosError) throw cosError;

      const cosMap = {};
      if (cosData) {
        cosData.forEach((c, i) => {
          cosMap[c.id] = { id: c.id, name: c.name, color: CO_COLORS[i % CO_COLORS.length] };
        });
      }
      setCompanies(cosMap);

      // Load tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, company_id, owner_type, created_at, create_day, requires_document, document_id, service_id')
        .order('due_date', { ascending: true, nullsFirst: false });

      if (tasksError) throw tasksError;
      setTasks(tasksData || []);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isOverdue = (t) => {
    return t.status === 'pending' && t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
  };

  const filteredTasks = tasks.filter((t) => {
    const coName = (companies[t.company_id]?.name || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchQ = !q || t.title.toLowerCase().includes(q) || coName.includes(q);
    const matchCo = filterCo === 'todas' || t.company_id === filterCo;
    const matchOwner = filterOwner === 'todas' || t.owner_type === filterOwner;
    const matchService = filterService === 'todas' || t.service_id === filterService;
    const matchS =
      filterStatus === 'todas' ||
      (filterStatus === 'overdue' && isOverdue(t)) ||
      (filterStatus === 'pending' && t.status === 'pending' && !isOverdue(t)) ||
      (filterStatus === 'completed' && t.status === 'completed');

    return matchQ && matchCo && matchOwner && matchService && matchS;
  });

  const stats = {
    total: tasks.length,
    vencidas: tasks.filter(isOverdue).length,
    pendientes: tasks.filter((t) => t.status === 'pending').length,
    completadas: tasks.filter((t) => t.status === 'completed').length,
  };

  // Actions
  const toggleDone = async (task) => {
    if (task.status === 'completed') {
      if (!window.confirm('¿Estás seguro de que quieres desmarcar esta tarea como completada?')) return;
      const { error } = await supabase.from('tasks').update({ status: 'pending', document_id: null }).eq('id', task.id);
      if (error) return alert('Error: ' + error.message);
      setTasks(tasks.map((t) => (t.id === task.id ? { ...t, status: 'pending', document_id: null } : t)));
      return;
    }

    if (task.requires_document && !task.document_id) {
      setDocTask(task);
      setDocFile(null);
      setDocDesc('');
      setProgress({ pct: 0, txt: '' });
      setDocModalOpen(true);
      return;
    }

    if (!window.confirm(`¿Confirmas que la tarea "${task.title}" está completada?`)) return;
    const { error } = await supabase.from('tasks').update({ status: 'completed' }).eq('id', task.id);
    if (error) return alert('Error: ' + error.message);
    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, status: 'completed' } : t)));
  };

  const deleteTask = async (id, name) => {
    if (!window.confirm(`¿Eliminar la tarea "${name}"?`)) return;
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) return alert('Error: ' + error.message);
    setTasks(tasks.filter((t) => t.id !== id));
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      company_id: task.company_id || '',
      due_date: task.due_date || '',
      status: task.status || 'pending',
    });
    setModalOpen(true);
  };

  const openNewModal = () => {
    setEditingTask(null);
    setFormData({ title: '', company_id: '', due_date: '', status: 'pending' });
    setModalOpen(true);
  };

  const saveTask = async () => {
    if (!formData.title.trim()) return alert('El título es obligatorio.');
    if (!formData.company_id) return alert('Selecciona una empresa.');

    setSaving(true);
    const payload = { ...formData, due_date: formData.due_date || null };

    try {
      if (editingTask) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', editingTask.id);
        if (error) throw error;
        setTasks(tasks.map((t) => (t.id === editingTask.id ? { ...t, ...payload } : t)));
      } else {
        const { data, error } = await supabase.from('tasks').insert(payload).select().single();
        if (error) throw error;
        if (data) setTasks([...tasks, data]);
      }
      setModalOpen(false);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Doc Upload Actions
  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return alert('El archivo supera 20 MB');
    setDocFile(file);
  };

  const submitDocAndClose = async () => {
    if (!docFile) return alert('Selecciona un archivo.');
    setUploading(true);
    setProgress({ pct: 0, txt: 'Subiendo archivo…' });

    try {
      const { count: prevCount } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .like('storage_path', `${docTask.company_id || 'rs'}/${docTask.id}/%`);

      const titleVersioned = prevCount > 0 ? `${docTask.title} (${prevCount + 1})` : docTask.title;

      const ext = docFile.name.split('.').pop();
      const base = `${docTask.company_id || 'rs'}/${docTask.id}`;
      const { data: existing } = await supabase.storage.from('documents').list(base);
      const version = existing ? existing.length + 1 : 1;
      const path = `${base}/v${version}_${Date.now()}.${ext}`;

      setProgress({ pct: 20, txt: 'Subiendo archivo…' });

      const { error: storageErr } = await supabase.storage
        .from('documents')
        .upload(path, docFile, { contentType: docFile.type, upsert: false });

      if (storageErr) throw storageErr;

      setProgress({ pct: 50, txt: 'Registrando documento…' });
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
      const fileUrl = urlData?.publicUrl || '';

      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      const { data: docData, error: docErr } = await supabase
        .from('documents')
        .insert({
          company_id: docTask.company_id,
          title: titleVersioned,
          category: 'general',
          description: docDesc || null,
          file_url: fileUrl,
          storage_path: path,
          original_name: docFile.name,
          mime_type: docFile.type,
          size_bytes: docFile.size,
          status: 'available',
          uploaded_by: user?.id || null,
        })
        .select('id')
        .single();

      if (docErr) throw docErr;

      setProgress({ pct: 85, txt: 'Cerrando tarea…' });
      const { error: taskErr } = await supabase
        .from('tasks')
        .update({ status: 'completed', document_id: docData.id })
        .eq('id', docTask.id);

      if (taskErr) throw taskErr;

      setProgress({ pct: 100, txt: '¡Listo!' });
      await new Promise((r) => setTimeout(r, 500));

      setTasks(tasks.map((t) => (t.id === docTask.id ? { ...t, status: 'completed', document_id: docData.id } : t)));
      setDocModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatBytes = (b) => {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  };

  return (
    <div className={styles.app}>
      {/* SIDEBAR PLACEHOLDER - Debería ser un componente separado */}
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
          <a href="#" className={styles.sbLink}>
            <span className={styles.sbIcon}>📊</span> Dashboard
          </a>
          <a href="#" className={`${styles.sbLink} ${styles.sbLinkActive}`}>
            <span className={styles.sbIcon}>✅</span> Tareas <span className={styles.sbBadgeN}>{stats.pendientes || 0}</span>
          </a>
        </div>
      </aside>

      {/* MAIN */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.tbLeft}>
            <div className={styles.tbBc}>
              Admin / <span>Tareas</span>
            </div>
            <div className={styles.tbTitle}>Gestión de tareas</div>
          </div>
          <div className={styles.tbRight}>
            <div className={styles.tbDate}>
              {new Date().toLocaleDateString('es-CO', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
            <button className={styles.btnP} onClick={openNewModal}>
              + Nueva tarea
            </button>
          </div>
        </header>

        <div className={styles.content}>
          <div className={styles.page}>
            {/* KPI ROW */}
            <div className={styles.statsRow}>
              <div className={styles.statCard} style={{ '--sc': '#c9a84c' }}>
                <div className={styles.statLbl}>Total tareas</div>
                <div className={styles.statVal}>{stats.total}</div>
                <div className={styles.statSub}>en todas las empresas</div>
              </div>
              <div className={styles.statCard} style={{ '--sc': '#e05c4b' }}>
                <div className={styles.statLbl}>Vencidas</div>
                <div className={styles.statVal} style={{ color: '#e05c4b' }}>
                  {stats.vencidas}
                </div>
                <div className={styles.statSub}>requieren atención inmediata</div>
              </div>
              <div className={styles.statCard} style={{ '--sc': '#e8a020' }}>
                <div className={styles.statLbl}>Pendientes</div>
                <div className={styles.statVal} style={{ color: '#e8a020' }}>
                  {stats.pendientes}
                </div>
                <div className={styles.statSub}>por completar</div>
              </div>
              <div className={styles.statCard} style={{ '--sc': '#22a66a' }}>
                <div className={styles.statLbl}>Completadas</div>
                <div className={styles.statVal} style={{ color: '#22a66a' }}>
                  {stats.completadas}
                </div>
                <div className={styles.statSub}>finalizadas</div>
              </div>
            </div>

            {/* TOOLBAR */}
            <div className={styles.toolbar}>
              <div className={styles.searchBox}>
                <span style={{ color: 'rgba(255,255,255,.25)', fontSize: '.82rem' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Buscar tarea…"
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
                className={`${styles.btnG} ${filterStatus === 'overdue' ? styles.btnGOn : ''}`}
                onClick={() => setFilterStatus('overdue')}
              >
                🔴 Vencidas
              </button>
              <button
                className={`${styles.btnG} ${filterStatus === 'pending' ? styles.btnGOn : ''}`}
                onClick={() => setFilterStatus('pending')}
              >
                Pendientes
              </button>
              <button
                className={`${styles.btnG} ${filterStatus === 'completed' ? styles.btnGOn : ''}`}
                onClick={() => setFilterStatus('completed')}
              >
                Completadas
              </button>
              <div className={styles.tbSep}></div>
              <button className={styles.btnP} onClick={openNewModal}>
                + Nueva tarea
              </button>
              <div className={styles.tbSep}></div>
              <button
                className={`${styles.btnG} ${filterOwner === 'todas' ? styles.btnGOn : ''}`}
                onClick={() => setFilterOwner('todas')}
              >
                Todas
              </button>
              <button
                className={`${styles.btnG} ${filterOwner === 'rs_team' ? styles.btnGOn : ''}`}
                onClick={() => setFilterOwner('rs_team')}
              >
                ⚙️ RS
              </button>
              <button
                className={`${styles.btnG} ${filterOwner === 'client' ? styles.btnGOn : ''}`}
                onClick={() => setFilterOwner('client')}
              >
                🏢 Cliente
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

            {/* FILTRO POR SERVICIO */}
            <div className={styles.coFilterRow}>
              <span style={{ fontSize: '.67rem', color: 'rgba(255,255,255,.25)', whiteSpace: 'nowrap' }}>Por servicio:</span>
              <div
                className={`${styles.coChip} ${filterService === 'todas' ? styles.coChipOn : ''}`}
                onClick={() => setFilterService('todas')}
              >
                Todos
              </div>
              {Object.entries(SERVICES).map(([id, name]) => (
                <div
                  key={id}
                  className={`${styles.coChip} ${filterService === id ? styles.coChipOn : ''}`}
                  onClick={() => setFilterService(id)}
                >
                  {name}
                </div>
              ))}
            </div>

            {/* TABLA */}
            <div className={styles.taskTableWrap}>
              <div className={styles.taskTableHd}>
                <h3>Tareas</h3>
                <span>{loading ? 'cargando…' : `${filteredTasks.length} tarea${filteredTasks.length !== 1 ? 's' : ''}`}</span>
              </div>
              <table className={styles.tbl}>
                <thead>
                  <tr>
                    <th style={{ width: '36px' }}></th>
                    <th>Tarea</th>
                    <th>Empresa</th>
                    <th>Vencimiento</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <>
                      <tr><td colSpan="6"><div className={styles.sk} style={{ height: '14px', margin: '.5rem 1rem', width: '60%' }}></div></td></tr>
                      <tr><td colSpan="6"><div className={styles.sk} style={{ height: '14px', margin: '.5rem 1rem', width: '80%' }}></div></td></tr>
                      <tr><td colSpan="6"><div className={styles.sk} style={{ height: '14px', margin: '.5rem 1rem', width: '50%' }}></div></td></tr>
                    </>
                  ) : error ? (
                    <tr>
                      <td colSpan="6" style={{ color: '#e05c4b', padding: '1.2rem', fontSize: '.8rem' }}>
                        ⚠️ Error al cargar: {error}
                      </td>
                    </tr>
                  ) : filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan="6">
                        <div className={styles.emptyState}>
                          <div className={styles.emptyStateIcon}>✅</div>
                          <h3>Sin tareas</h3>
                          <p>No hay tareas que coincidan con los filtros seleccionados.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map((t) => {
                      const overdue = isOverdue(t);
                      const done = t.status === 'completed';
                      const today = new Date();
                      const createDate = new Date(today.getFullYear(), today.getMonth(), t.create_day || 1);
                      const isFuture = t.create_day && t.create_day > today.getDate() && !done;
                      const coInfo = companies[t.company_id];
                      const coName = coInfo?.name || 'Sin empresa';
                      const coColor = coInfo?.color || 'rgba(255,255,255,.25)';
                      const initials = coName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

                      return (
                        <tr key={t.id} style={{ opacity: isFuture ? 0.45 : 1 }}>
                          <td>
                            <div
                              style={{
                                width: '17px',
                                height: '17px',
                                borderRadius: '4px',
                                border: `1.5px solid ${done ? '#22a66a' : overdue ? '#e05c4b' : 'rgba(255,255,255,.07)'}`,
                                background: done ? '#22a66a' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '.6rem',
                                color: '#fff',
                                cursor: 'pointer',
                                transition: 'all .18s',
                              }}
                              onClick={() => toggleDone(t)}
                            >
                              {done ? '✓' : ''}
                            </div>
                          </td>
                          <td>
                            <div className={styles.tdW}>
                              {t.title}{' '}
                              {t.owner_type === 'rs_team' && (
                                <span
                                  style={{
                                    fontSize: '.58rem',
                                    fontWeight: 600,
                                    padding: '.1rem .38rem',
                                    borderRadius: '100px',
                                    background: 'rgba(201,168,76,.15)',
                                    color: '#c9a84c',
                                  }}
                                >
                                  ⚙️ RS
                                </span>
                              )}
                              {t.owner_type === 'client' && (
                                <span
                                  style={{
                                    fontSize: '.58rem',
                                    fontWeight: 600,
                                    padding: '.1rem .38rem',
                                    borderRadius: '100px',
                                    background: 'rgba(74,159,212,.12)',
                                    color: '#4a9fd4',
                                  }}
                                >
                                  🏢
                                </span>
                              )}
                              {t.requires_document && (
                                <span className={styles.docBadge}>{t.document_id ? '📎 doc' : '📎 req'}</span>
                              )}
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
                                {initials}
                              </div>
                              <span
                                style={{
                                  fontSize: '.75rem',
                                  color: 'rgba(255,255,255,.5)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '140px',
                                }}
                              >
                                {coName}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span style={{ color: overdue ? '#e05c4b' : 'inherit', fontWeight: overdue ? 500 : 'normal', fontSize: '.75rem' }}>
                              {fmtDate(t.due_date)}
                            </span>
                          </td>
                          <td>
                            {done ? (
                              <span className={`${styles.badge} ${styles.bOk}`}>Completada</span>
                            ) : overdue ? (
                              <span className={`${styles.badge} ${styles.bErr}`}>🔴 Vencida</span>
                            ) : isFuture ? (
                              <span className={`${styles.badge} ${styles.bN}`}>Próximamente</span>
                            ) : (
                              <span className={`${styles.badge} ${styles.bWarn}`}>Pendiente</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button className={styles.actBtn} onClick={() => openEditModal(t)} title="Editar">
                              ✏️
                            </button>
                            <button className={`${styles.actBtn} ${styles.actBtnDel}`} onClick={() => deleteTask(t.id, t.title)} title="Eliminar">
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

      {/* MODAL NUEVA/EDITAR TAREA */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHd}>
              <h3>{editingTask ? 'Editar tarea' : 'Nueva tarea'}</h3>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Título *</label>
                <input
                  type="text"
                  placeholder="Ej: Declarar IVA bimestral"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Empresa *</label>
                <select
                  value={formData.company_id}
                  onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                >
                  <option value="">Seleccionar empresa…</option>
                  {Object.values(companies).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Fecha de vencimiento</label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Estado</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="pending">Pendiente</option>
                  <option value="completed">Completada</option>
                </select>
              </div>
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</button>
              <button className={styles.btnP} onClick={saveTask} disabled={saving}>
                {saving ? '⏳ Guardando…' : editingTask ? 'Guardar cambios' : 'Crear tarea'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CERRAR TAREA CON DOCUMENTO */}
      {docModalOpen && (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && !uploading && setDocModalOpen(false)}>
          <div className={`${styles.modal} ${styles.modalDoc}`}>
            <div className={styles.modalHd}>
              <h3>Completar: {docTask?.title}</h3>
              <button className={styles.modalClose} onClick={() => !uploading && setDocModalOpen(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.5)', marginBottom: '1rem', lineHeight: 1.5 }}>
                Esta tarea requiere un documento de soporte para cerrarse. Adjunta el archivo antes de continuar.
              </p>
              <div className={styles.field}>
                <label>Comentarios <span style={{ textTransform: 'none', fontWeight: 400, letterSpacing: 0 }}>(opcional)</span></label>
                <input
                  type="text"
                  placeholder="Describe brevemente el documento adjunto…"
                  value={docDesc}
                  onChange={(e) => setDocDesc(e.target.value)}
                  disabled={uploading}
                />
              </div>
              <div className={styles.field}>
                <label>Archivo *</label>
                {!docFile ? (
                  <div
                    className={styles.uploadZone}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleFileDrop}
                  >
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                      onChange={(e) => handleFileSelect(e.target.files[0])}
                      disabled={uploading}
                    />
                    <div className={styles.uploadZoneIco}>📎</div>
                    <div className={styles.uploadZoneLbl}>Arrastra aquí o haz clic para seleccionar</div>
                    <div className={styles.uploadZoneSub}>PDF, Word, Excel, imágenes — máx. 20 MB</div>
                  </div>
                ) : (
                  <div className={styles.filePrev}>
                    <span style={{ fontSize: '1.1rem' }}>📄</span>
                    <div className={styles.filePrevInfo}>
                      <div className={styles.filePrevName}>{docFile.name}</div>
                      <div className={styles.filePrevSize}>{formatBytes(docFile.size)}</div>
                    </div>
                    {!uploading && (
                      <button className={styles.filePrevRm} onClick={() => setDocFile(null)} title="Quitar">✕</button>
                    )}
                  </div>
                )}
              </div>
              {uploading && (
                <div className={styles.progWrap}>
                  <div className={styles.progLbl}><span>{progress.txt}</span><span>{progress.pct}%</span></div>
                  <div className={styles.progBarBg}><div className={styles.progBar} style={{ width: `${progress.pct}%` }}></div></div>
                </div>
              )}
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setDocModalOpen(false)} disabled={uploading}>Cancelar</button>
              <button className={styles.btnP} onClick={submitDocAndClose} disabled={uploading}>
                ✓ Completar tarea
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
