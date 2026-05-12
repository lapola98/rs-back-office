import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import styles from './AdminTaskTemplatesPage.module.css';

const FREQ_LABELS = { monthly: 'Mensual', weekly: 'Semanal', biweekly: 'Quincenal', annual: 'Anual' };

export default function AdminTaskTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFrequency, setFilterFrequency] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterActive, setFilterActive] = useState('');

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form Data
  const [formData, setFormData] = useState({
    title: '',
    frequency: 'monthly',
    service_id: '',
    owner_type: 'rs_team',
    create_day: '',
    due_day: '',
    requires_document: false,
  });

  // Toasts
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg, type = 'ok') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Load services
      const { data: svcData, error: svcError } = await supabase
        .from('services')
        .select('id, name')
        .eq('active', true)
        .order('name');
      if (svcError) throw svcError;
      setServices(svcData || []);

      // Load templates
      const { data: tplData, error: tplError } = await supabase
        .from('task_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (tplError) throw tplError;
      setTemplates(tplData || []);
    } catch (err) {
      showToast('Error al cargar: ' + err.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    const q = searchQuery.toLowerCase();
    if (q && !t.title.toLowerCase().includes(q)) return false;
    if (filterFrequency && t.frequency !== filterFrequency) return false;
    if (filterService && t.service_id !== filterService) return false;
    if (filterOwner && t.owner_type !== filterOwner) return false;
    if (filterActive !== '') {
      if (t.active !== (filterActive === 'true')) return false;
    }
    return true;
  });

  const stats = {
    total: templates.length,
    active: templates.filter((t) => t.active).length,
    monthly: templates.filter((t) => t.frequency === 'monthly').length,
    weekly: templates.filter((t) => t.frequency === 'weekly').length,
    biweekly: templates.filter((t) => t.frequency === 'biweekly').length,
    annual: templates.filter((t) => t.frequency === 'annual').length,
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilterFrequency('');
    setFilterService('');
    setFilterOwner('');
    setFilterActive('');
  };

  const toggleActive = async (id, checked) => {
    const { error } = await supabase.from('task_templates').update({ active: checked }).eq('id', id);
    if (error) {
      showToast('Error: ' + error.message, 'err');
      return;
    }
    setTemplates(templates.map((t) => (t.id === id ? { ...t, active: checked } : t)));
    showToast(checked ? 'Plantilla activada' : 'Plantilla desactivada', 'ok');
  };

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormData({
      title: '',
      frequency: 'monthly',
      service_id: '',
      owner_type: 'rs_team',
      create_day: '',
      due_day: '',
      requires_document: false,
    });
    setModalOpen(true);
  };

  const openEditModal = (t) => {
    setEditingTemplate(t);
    setFormData({
      title: t.title || '',
      frequency: t.frequency || 'monthly',
      service_id: t.service_id || '',
      owner_type: t.owner_type || 'rs_team',
      create_day: t.create_day ?? '',
      due_day: t.due_day ?? '',
      requires_document: t.requires_document || false,
    });
    setModalOpen(true);
  };

  const openConfirmDelete = (id) => {
    setDeletingId(id);
    setConfirmModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from('task_templates').delete().eq('id', deletingId);
    if (error) {
      showToast('Error al eliminar: ' + error.message, 'err');
      return;
    }
    showToast('Plantilla eliminada', 'ok');
    setTemplates(templates.filter((t) => t.id !== deletingId));
    setConfirmModalOpen(false);
    setDeletingId(null);
  };

  const saveTemplate = async () => {
    if (!formData.title.trim()) return showToast('El título es obligatorio', 'warn');
    if (!formData.service_id) return showToast('El servicio es obligatorio', 'warn');

    setSaving(true);
    const payload = {
      title: formData.title.trim(),
      frequency: formData.frequency,
      service_id: formData.service_id,
      owner_type: formData.owner_type,
      create_day: formData.create_day ? parseInt(formData.create_day) : null,
      due_day: formData.due_day ? parseInt(formData.due_day) : null,
      requires_document: formData.requires_document,
    };

    try {
      if (editingTemplate) {
        const { error } = await supabase.from('task_templates').update(payload).eq('id', editingTemplate.id);
        if (error) throw error;
        setTemplates(templates.map((t) => (t.id === editingTemplate.id ? { ...t, ...payload } : t)));
        showToast('Plantilla actualizada', 'ok');
      } else {
        payload.active = true;
        const { data, error } = await supabase.from('task_templates').insert(payload).select().single();
        if (error) throw error;
        setTemplates([data, ...templates]);
        showToast('Plantilla creada', 'ok');
      }
      setModalOpen(false);
    } catch (err) {
      showToast('Error al guardar: ' + err.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const getServiceName = (id) => {
    const svc = services.find((s) => s.id === id);
    return svc ? svc.name : id;
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
          <a href="#" className={`${styles.sbLink} ${styles.sbLinkActive}`}>
            <span className={styles.sbIcon}>📋</span> Plantillas
          </a>
        </div>
      </aside>

      {/* MAIN */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.tbLeft}>
            <div className={styles.tbBc}>
              Admin / <span>Plantillas de Tareas</span>
            </div>
            <div className={styles.tbTitle}>Gestión de plantillas</div>
          </div>
          <div className={styles.tbRight}>
            <div className={styles.tbDate}>
              {new Date().toLocaleDateString('es-CO', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
            <button className={styles.btnP} onClick={openCreateModal}>
              + Nueva plantilla
            </button>
          </div>
        </header>

        <div className={styles.content}>
          <div className={styles.page}>
            {/* STATS */}
            <div className={styles.statsRow}>
              <div className={styles.statCard} style={{ '--sc': '#c9a84c' }}>
                <div className={styles.statLbl}>Total</div>
                <div className={styles.statVal}>{stats.total}</div>
              </div>
              <div className={styles.statCard} style={{ '--sc': '#22a66a' }}>
                <div className={styles.statLbl}>Activas</div>
                <div className={styles.statVal} style={{ color: '#22a66a' }}>
                  {stats.active}
                </div>
              </div>
              <div className={styles.statCard} style={{ '--sc': '#4a9fd4' }}>
                <div className={styles.statLbl}>Mensual</div>
                <div className={styles.statVal} style={{ color: '#4a9fd4' }}>
                  {stats.monthly}
                </div>
              </div>
              <div className={styles.statCard} style={{ '--sc': '#22a66a' }}>
                <div className={styles.statLbl}>Semanal</div>
                <div className={styles.statVal}>{stats.weekly}</div>
              </div>
              <div className={styles.statCard} style={{ '--sc': '#e8a020' }}>
                <div className={styles.statLbl}>Quincenal</div>
                <div className={styles.statVal} style={{ color: '#e8a020' }}>
                  {stats.biweekly}
                </div>
              </div>
              <div className={styles.statCard} style={{ '--sc': '#b464c8' }}>
                <div className={styles.statLbl}>Anual</div>
                <div className={styles.statVal} style={{ color: '#b464c8' }}>
                  {stats.annual}
                </div>
              </div>
            </div>

            {/* TOOLBAR */}
            <div className={styles.toolbar}>
              <div className={styles.searchBox}>
                <span style={{ color: 'rgba(255,255,255,.25)', fontSize: '.82rem' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Buscar plantilla…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className={styles.tbSep}></div>
              <span className={styles.filterLbl}>Frecuencia</span>
              <select className={styles.fsel} value={filterFrequency} onChange={(e) => setFilterFrequency(e.target.value)}>
                <option value="">Todas</option>
                <option value="monthly">Mensual</option>
                <option value="weekly">Semanal</option>
                <option value="biweekly">Quincenal</option>
                <option value="annual">Anual</option>
              </select>
              <div className={styles.tbSep}></div>
              <span className={styles.filterLbl}>Servicio</span>
              <select className={styles.fsel} value={filterService} onChange={(e) => setFilterService(e.target.value)}>
                <option value="">Todos</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <div className={styles.tbSep}></div>
              <span className={styles.filterLbl}>Responsable</span>
              <select className={styles.fsel} value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)}>
                <option value="">Todos</option>
                <option value="rs_team">⚙️ RS</option>
                <option value="client">🏢 Cliente</option>
              </select>
              <div className={styles.tbSep}></div>
              <span className={styles.filterLbl}>Estado</span>
              <select className={styles.fsel} value={filterActive} onChange={(e) => setFilterActive(e.target.value)}>
                <option value="">Todos</option>
                <option value="true">Activas</option>
                <option value="false">Inactivas</option>
              </select>
              <div className={styles.tbSep}></div>
              <button className={styles.btnG} onClick={clearFilters}>
                Limpiar
              </button>
            </div>

            {/* TABLE */}
            <div className={styles.taskTableWrap}>
              <div className={styles.taskTableHd}>
                <h3>Plantillas</h3>
                <span>{loading ? 'cargando…' : `${filteredTemplates.length} plantilla${filteredTemplates.length !== 1 ? 's' : ''}`}</span>
              </div>
              <table className={styles.tbl}>
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Frecuencia</th>
                    <th>Servicio</th>
                    <th>Responsable</th>
                    <th>Día creación</th>
                    <th>Día vencimiento</th>
                    <th>Req. doc.</th>
                    <th>Activa</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,.25)' }}>
                        Cargando…
                      </td>
                    </tr>
                  ) : filteredTemplates.length === 0 ? (
                    <tr>
                      <td colSpan="9">
                        <div className={styles.emptyState}>
                          <div className={styles.emptyStateIcon}>📋</div>
                          <h3>Sin plantillas</h3>
                          <p>No hay plantillas que coincidan con los filtros.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredTemplates.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div className={styles.tdW}>{t.title}</div>
                          <div className={styles.tdSm}>ID: {t.id.slice(0, 8)}…</div>
                        </td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              t.frequency === 'monthly'
                                ? styles.bMonthly
                                : t.frequency === 'weekly'
                                ? styles.bWeekly
                                : t.frequency === 'biweekly'
                                ? styles.bBiweekly
                                : styles.bAnnual
                            }`}
                          >
                            {FREQ_LABELS[t.frequency] || t.frequency}
                          </span>
                        </td>
                        <td style={{ fontSize: '.75rem' }}>
                          {t.service_id ? getServiceName(t.service_id) : <span style={{ color: 'rgba(255,255,255,.25)' }}>—</span>}
                        </td>
                        <td>
                          {t.owner_type === 'rs_team' ? (
                            <span className={`${styles.badge} ${styles.bRs}`}>⚙️ RS</span>
                          ) : t.owner_type === 'client' ? (
                            <span className={`${styles.badge} ${styles.bClient}`}>🏢 Cliente</span>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,.25)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {t.create_day != null ? (
                            <span style={{ color: 'rgba(255,255,255,.88)' }}>Día {t.create_day}</span>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,.25)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {t.due_day != null ? (
                            <span style={{ color: 'rgba(255,255,255,.88)' }}>Día {t.due_day}</span>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,.25)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {t.requires_document ? (
                            <span className={`${styles.badge} ${styles.bRs}`}>📎 Sí</span>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,.25)', fontSize: '.75rem' }}>No</span>
                          )}
                        </td>
                        <td>
                          <label className={styles.toggle}>
                            <input
                              type="checkbox"
                              checked={t.active}
                              onChange={(e) => toggleActive(t.id, e.target.checked)}
                            />
                            <span className={styles.toggleTrack}></span>
                            <span className={styles.toggleThumb}></span>
                          </label>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className={styles.actBtn} onClick={() => openEditModal(t)} title="Editar">
                            ✏️
                          </button>
                          <button
                            className={`${styles.actBtn} ${styles.actBtnDel}`}
                            onClick={() => openConfirmDelete(t.id)}
                            title="Eliminar"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* TOASTS */}
      <div className={styles.toastContainer}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${styles.toast} ${
              t.type === 'ok' ? styles.toastOk : t.type === 'err' ? styles.toastErr : styles.toastWarn
            }`}
          >
            <span>{t.type === 'ok' ? '✓' : t.type === 'err' ? '✕' : '⚠'}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

      {/* MODAL CREAR / EDITAR */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHd}>
              <h3>{editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Título *</label>
                <input
                  type="text"
                  placeholder="Ej: Declaración mensual de IVA"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>Frecuencia *</label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  >
                    <option value="monthly">Mensual</option>
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="annual">Anual</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Responsable</label>
                  <select
                    value={formData.owner_type}
                    onChange={(e) => setFormData({ ...formData, owner_type: e.target.value })}
                  >
                    <option value="rs_team">⚙️ Equipo RS</option>
                    <option value="client">🏢 Cliente</option>
                  </select>
                </div>
              </div>
              <div className={styles.field}>
                <label>Servicio *</label>
                <select
                  value={formData.service_id}
                  onChange={(e) => setFormData({ ...formData, service_id: e.target.value })}
                >
                  <option value="">Sin servicio</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div
                className={styles.field}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '.5rem .88rem',
                  background: '#1a2230',
                  border: '1px solid rgba(255,255,255,.07)',
                  borderRadius: '10px',
                }}
              >
                <div>
                  <label style={{ display: 'block', marginBottom: '.15rem' }}>Requiere documento para cerrar</label>
                  <span style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.25)' }}>
                    El cliente o RS deberá adjuntar un archivo al completarla
                  </span>
                </div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={formData.requires_document}
                    onChange={(e) => setFormData({ ...formData, requires_document: e.target.checked })}
                  />
                  <span className={styles.toggleTrack}></span>
                  <span className={styles.toggleThumb}></span>
                </label>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>Día de creación</label>
                  <input
                    type="number"
                    placeholder="Ej. 1"
                    min="1"
                    max="31"
                    value={formData.create_day}
                    onChange={(e) => setFormData({ ...formData, create_day: e.target.value })}
                  />
                  <div className={styles.fieldHint}>Día del período en que se crea</div>
                </div>
                <div className={styles.field}>
                  <label>Día de vencimiento</label>
                  <input
                    type="number"
                    placeholder="Ej. 15"
                    min="1"
                    max="31"
                    value={formData.due_day}
                    onChange={(e) => setFormData({ ...formData, due_day: e.target.value })}
                  />
                  <div className={styles.fieldHint}>Día del período en que vence</div>
                </div>
              </div>
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button className={styles.btnP} onClick={saveTemplate} disabled={saving}>
                {saving ? '⏳ Guardando…' : editingTemplate ? 'Guardar cambios' : 'Crear plantilla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR ELIMINAR */}
      {confirmModalOpen && (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setConfirmModalOpen(false)}>
          <div className={`${styles.modal} ${styles.modalSm}`}>
            <div className={styles.confirmBody}>
              <div className={styles.confirmIcon}>🗑</div>
              <h3>Eliminar plantilla</h3>
              <p>
                ¿Estás seguro de que deseas eliminar la plantilla "
                {templates.find((t) => t.id === deletingId)?.title}"? Esta acción no se puede deshacer.
              </p>
            </div>
            <div className={`${styles.modalFt} ${styles.modalFtCenter}`}>
              <button className={styles.btnS} onClick={() => setConfirmModalOpen(false)}>
                Cancelar
              </button>
              <button className={styles.btnD} onClick={confirmDelete}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
