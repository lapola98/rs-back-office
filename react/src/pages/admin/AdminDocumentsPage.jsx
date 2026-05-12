import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import styles from './AdminDocumentsPage.module.css';

const EXT_MAP = {
  pdf: { icon: '📕', bg: 'var(--err-bg, rgba(224,92,75,.12))', c: 'var(--err, #e05c4b)', kc: 'var(--err, #e05c4b)' },
  xlsx: { icon: '📗', bg: 'var(--ok-bg, rgba(34,166,106,.12))', c: 'var(--ok, #22a66a)', kc: 'var(--ok, #22a66a)' },
  xls: { icon: '📗', bg: 'var(--ok-bg, rgba(34,166,106,.12))', c: 'var(--ok, #22a66a)', kc: 'var(--ok, #22a66a)' },
  docx: { icon: '📘', bg: 'var(--info-bg, rgba(74,159,212,.12))', c: 'var(--info, #4a9fd4)', kc: 'var(--info, #4a9fd4)' },
  doc: { icon: '📘', bg: 'var(--info-bg, rgba(74,159,212,.12))', c: 'var(--info, #4a9fd4)', kc: 'var(--info, #4a9fd4)' },
  csv: { icon: '📊', bg: 'var(--warn-bg, rgba(232,160,32,.12))', c: 'var(--warn, #e8a020)', kc: 'var(--warn, #e8a020)' },
};

const STATUS_LABELS = { available: 'Publicado', pending: 'En revisión', draft: 'Borrador', archived: 'Archivado' };
const STATUS_BADGE = { available: 'bOk', pending: 'bWarn', draft: 'bN', archived: 'bN' };
const FOLDER_TITLES = {
  todos: 'Todos los documentos', recientes: 'Documentos recientes', revision: 'En revisión', borrador: 'Borradores',
  facturacion: 'Facturación y Cartera', contabilidad: 'Contabilidad', tesoreria: 'Tesorería', personal: 'Gestión de Personal',
  pdf: 'Archivos PDF', xlsx: 'Archivos Excel', word: 'Archivos Word',
};

const extData = (path) => {
  const ext = (path || '').split('.').pop().toLowerCase();
  return { ext, ...(EXT_MAP[ext] || { icon: '📄', bg: 'rgba(255,255,255,.06)', c: 'rgba(255,255,255,.5)', kc: 'rgba(201,168,76,.3)' }) };
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export default function AdminDocumentsPage() {
  const [docs, setDocs] = useState([]);
  const [companies, setCompanies] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentFolder, setCurrentFolder] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [viewMode, setViewMode] = useState('grid');
  const [currentDoc, setCurrentDoc] = useState(null);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [formData, setFormData] = useState({
    company_id: '',
    mod: '',
    name: '',
    status: 'borrador',
    ver: 'v1.0',
    desc: '',
    notify: false
  });
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: cosData } = await supabase.from('companies').select('id, name');
      const cosMap = {};
      if (cosData) {
        cosData.forEach((c) => { cosMap[c.id] = c.name; });
        setCompanies(cosMap);
      }

      const { data: docsData, error: docsError } = await supabase
        .from('documents')
        .select('id, title, category, status, storage_path, created_at, company_id')
        .order('created_at', { ascending: false });

      if (docsError) throw docsError;

      const formattedDocs = (docsData || []).map((d) => {
        const { ext, icon, bg, c, kc } = extData(d.storage_path);
        const coName = cosMap[d.company_id] || 'Sin empresa';
        const coShort = coName.length > 18 ? coName.slice(0, 16) + '…' : coName;
        let file_url = null;
        if (d.storage_path) {
          const { data: u } = supabase.storage.from('documents').getPublicUrl(d.storage_path);
          file_url = u?.publicUrl || null;
        }
        return {
          id: d.id, title: d.title, name: d.title,
          category: d.category || 'General', mod: d.category || 'General',
          status: d.status, company: coName, coShort,
          date: fmtDate(d.created_at), created_at: d.created_at,
          storage_path: d.storage_path, file_url,
          ext, icon, extColor: { bg, c }, kc,
          size: '—', by: 'Admin RS', ver: 'v1.0', dl: 0, desc: d.title || 'Sin descripción',
          company_id: d.company_id,
        };
      });

      setDocs(formattedDocs);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const mapSt = (s) => {
    return { available: 'publicado', pending: 'revision', draft: 'borrador', archived: 'borrador' }[s] || 'borrador';
  };

  const matchFolder = (d) => {
    const f = currentFolder;
    if (f === 'todos') return true;
    if (f === 'recientes') return (Date.now() - new Date(d.created_at)) < 7 * 86400000;
    if (f === 'revision') return d.status === 'pending';
    if (f === 'borrador') return d.status === 'draft';
    if (f === 'facturacion') return /factura|cartera/i.test(d.category);
    if (f === 'contabilidad') return /contab/i.test(d.category);
    if (f === 'tesoreria') return /tesorer/i.test(d.category);
    if (f === 'personal') return /personal|nómina|nomina/i.test(d.category);
    if (f === 'pdf') return d.ext === 'pdf';
    if (f === 'xlsx') return d.ext === 'xlsx' || d.ext === 'xls';
    if (f === 'word') return d.ext === 'docx' || d.ext === 'doc';
    return true;
  };

  const filteredDocs = docs.filter((d) => {
    const q = searchQuery.toLowerCase();
    const mQ = !q || d.name.toLowerCase().includes(q) || d.company.toLowerCase().includes(q) || d.mod.toLowerCase().includes(q);
    const mS = filterStatus === 'todos' || mapSt(d.status) === filterStatus;
    const mF = matchFolder(d);
    return mQ && mS && mF;
  });

  const stats = {
    total: docs.length,
    pub: docs.filter((d) => d.status === 'available').length,
    rev: docs.filter((d) => d.status === 'pending').length,
    bor: docs.filter((d) => d.status === 'draft').length,
    cos: Object.keys(companies).length
  };

  const deleteDoc = async (id, name, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`¿Eliminar "${name}"?`)) return;
    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) {
      alert('Error: ' + error.message);
      return;
    }
    setDocs(docs.filter((d) => d.id !== id));
    if (currentDoc?.id === id) setCurrentDoc(null);
  };

  const publishDoc = async (id) => {
    const { error } = await supabase.from('documents').update({ status: 'available' }).eq('id', id);
    if (error) {
      alert('Error: ' + error.message);
      return;
    }
    const updatedDocs = docs.map((d) => d.id === id ? { ...d, status: 'available' } : d);
    setDocs(updatedDocs);
    if (currentDoc?.id === id) {
      setCurrentDoc({ ...currentDoc, status: 'available' });
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      setFormData({ ...formData, name: f.name.replace(/\.[^.]+$/, '') });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      setFormData({ ...formData, name: f.name.replace(/\.[^.]+$/, '') });
    }
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadDoc = async () => {
    if (!formData.company_id || !formData.mod || !formData.name) {
      alert('Completa empresa, módulo y nombre.');
      return;
    }
    if (!file) {
      alert('Selecciona un archivo.');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const safeName = formData.name.replace(/[^a-zA-Z0-9_\-.]/g, '_') + '_' + Date.now() + '.' + ext;
      const path = `${formData.company_id}/${safeName}`;
      
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw new Error('Storage: ' + upErr.message);

      let insertStatus = formData.status;
      if (insertStatus === 'borrador') insertStatus = 'draft';
      else if (insertStatus === 'revision') insertStatus = 'pending';
      else if (insertStatus === 'publicado') insertStatus = 'available';

      const { error: dbErr } = await supabase.from('documents').insert({
        title: formData.name,
        category: formData.mod,
        status: insertStatus,
        company_id: formData.company_id,
        storage_path: path
      });
      if (dbErr) throw new Error('DB: ' + dbErr.message);

      alert(`"${formData.name}" subido correctamente ✓`);
      setUploadModalOpen(false);
      clearFile();
      setFormData({ company_id: '', mod: '', name: '', status: 'borrador', ver: 'v1.0', desc: '', notify: false });
      loadData();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setUploading(false);
    }
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
          <a href="/admin/requests" className={styles.sbLink}>
            <span className={styles.sbIcon}>📥</span> Solicitudes
          </a>
          <a href="/admin/documents" className={`${styles.sbLink} ${styles.sbLinkActive}`}>
            <span className={styles.sbIcon}>📁</span> Documentos
          </a>
        </div>
      </aside>

      {/* MAIN */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.tbLeft}>
            <div className={styles.tbBc}>
              Admin / <span>Documentos</span>
            </div>
            <div className={styles.tbTitle}>Gestión de documentos</div>
          </div>
          <div className={styles.tbRight}>
            <div className={styles.tbDate}>
              {new Date().toLocaleDateString('es-CO', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
            <div className={styles.tbAv}>RS</div>
          </div>
        </header>

        <div className={styles.content}>
          {/* TREE PANEL */}
          <div className={styles.treePanel}>
            <div className={styles.treeHd}>
              <h3>Carpetas</h3>
              <p>{stats.total} documentos · {stats.cos} empresas</p>
            </div>
            <div className={styles.treeBody}>
              <div className={`${styles.treeItem} ${currentFolder === 'todos' ? styles.treeItemActive : ''}`} onClick={() => setCurrentFolder('todos')}>
                <span className={styles.treeIcon}>🗂️</span> Todos<span className={styles.treeCount}>{stats.total}</span>
              </div>
              <div className={`${styles.treeItem} ${currentFolder === 'recientes' ? styles.treeItemActive : ''}`} onClick={() => setCurrentFolder('recientes')}>
                <span className={styles.treeIcon}>🕐</span> Recientes
              </div>
              <div className={`${styles.treeItem} ${currentFolder === 'revision' ? styles.treeItemActive : ''}`} onClick={() => setCurrentFolder('revision')}>
                <span className={styles.treeIcon}>🔍</span> En revisión<span className={styles.treeCount}>{stats.rev}</span>
              </div>
              <div className={`${styles.treeItem} ${currentFolder === 'borrador' ? styles.treeItemActive : ''}`} onClick={() => setCurrentFolder('borrador')}>
                <span className={styles.treeIcon}>✏️</span> Borradores<span className={styles.treeCount}>{stats.bor}</span>
              </div>

              <div className={styles.treeDiv}></div>
              <div className={styles.treeGroupTitle}>Por módulo</div>
              <div className={`${styles.treeItem} ${styles.treeItemSub} ${currentFolder === 'facturacion' ? styles.treeItemActive : ''}`} onClick={() => setCurrentFolder('facturacion')}>
                <span className={styles.treeIcon}>🧾</span> Facturación
              </div>
              <div className={`${styles.treeItem} ${styles.treeItemSub} ${currentFolder === 'contabilidad' ? styles.treeItemActive : ''}`} onClick={() => setCurrentFolder('contabilidad')}>
                <span className={styles.treeIcon}>📋</span> Contabilidad
              </div>
              <div className={`${styles.treeItem} ${styles.treeItemSub} ${currentFolder === 'tesoreria' ? styles.treeItemActive : ''}`} onClick={() => setCurrentFolder('tesoreria')}>
                <span className={styles.treeIcon}>🏦</span> Tesorería
              </div>
              <div className={`${styles.treeItem} ${styles.treeItemSub} ${currentFolder === 'personal' ? styles.treeItemActive : ''}`} onClick={() => setCurrentFolder('personal')}>
                <span className={styles.treeIcon}>👥</span> Personal
              </div>

              <div className={styles.treeDiv}></div>
              <div className={styles.treeGroupTitle}>Por tipo</div>
              <div className={`${styles.treeItem} ${styles.treeItemSub} ${currentFolder === 'pdf' ? styles.treeItemActive : ''}`} onClick={() => setCurrentFolder('pdf')}>
                <span className={styles.treeIcon}>📕</span> PDF
              </div>
              <div className={`${styles.treeItem} ${styles.treeItemSub} ${currentFolder === 'xlsx' ? styles.treeItemActive : ''}`} onClick={() => setCurrentFolder('xlsx')}>
                <span className={styles.treeIcon}>📗</span> Excel
              </div>
              <div className={`${styles.treeItem} ${styles.treeItemSub} ${currentFolder === 'word' ? styles.treeItemActive : ''}`} onClick={() => setCurrentFolder('word')}>
                <span className={styles.treeIcon}>📘</span> Word
              </div>
            </div>
          </div>

          {/* LIST AREA */}
          <div className={styles.listArea}>
            {/* Toolbar */}
            <div className={styles.docsToolbar}>
              <div className={styles.searchBox}>
                <span style={{ color: 'rgba(255,255,255,.25)', fontSize: '.82rem' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Buscar documento, empresa, módulo…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className={styles.tbSep}></div>
              <button className={`${styles.btnG} ${filterStatus === 'todos' ? styles.btnGOn : ''}`} onClick={() => setFilterStatus('todos')}>Todos</button>
              <button className={`${styles.btnG} ${filterStatus === 'publicado' ? styles.btnGOn : ''}`} onClick={() => setFilterStatus('publicado')}>Publicados</button>
              <button className={`${styles.btnG} ${filterStatus === 'revision' ? styles.btnGOn : ''}`} onClick={() => setFilterStatus('revision')}>Revisión</button>
              <button className={`${styles.btnG} ${filterStatus === 'borrador' ? styles.btnGOn : ''}`} onClick={() => setFilterStatus('borrador')}>Borrador</button>
              <div className={styles.tbSep}></div>
              <button className={`${styles.btnG} ${viewMode === 'grid' ? styles.btnGOn : ''}`} onClick={() => setViewMode('grid')}>⊞</button>
              <button className={`${styles.btnG} ${viewMode === 'list' ? styles.btnGOn : ''}`} onClick={() => setViewMode('list')}>☰</button>
              <div className={styles.tbSep}></div>
              <button className={styles.btnP} style={{ fontSize: '.76rem', padding: '.48rem .95rem' }} onClick={() => setUploadModalOpen(true)}>
                📤 Subir documento
              </button>
            </div>

            {/* Stats bar */}
            <div className={styles.statsBar}>
              <div className={styles.sbarItem}>
                <span className={styles.sbarIcon}>📁</span>
                <span className={styles.sbarVal}>{stats.total}</span>
                <span className={styles.sbarLbl}>Total</span>
              </div>
              <div className={styles.sbarDiv}></div>
              <div className={styles.sbarItem}>
                <span className={styles.sbarIcon} style={{ color: '#22a66a' }}>✅</span>
                <span className={styles.sbarVal} style={{ color: '#22a66a' }}>{stats.pub}</span>
                <span className={styles.sbarLbl}>Publicados</span>
              </div>
              <div className={styles.sbarDiv}></div>
              <div className={styles.sbarItem}>
                <span className={styles.sbarIcon} style={{ color: '#e8a020' }}>🔍</span>
                <span className={styles.sbarVal} style={{ color: '#e8a020' }}>{stats.rev}</span>
                <span className={styles.sbarLbl}>En revisión</span>
              </div>
              <div className={styles.sbarDiv}></div>
              <div className={styles.sbarItem}>
                <span className={styles.sbarIcon} style={{ color: 'rgba(255,255,255,.25)' }}>✏️</span>
                <span className={styles.sbarVal} style={{ color: 'rgba(255,255,255,.5)' }}>{stats.bor}</span>
                <span className={styles.sbarLbl}>Borradores</span>
              </div>
            </div>

            {/* Docs scroll */}
            <div className={styles.docsScroll}>
              {loading ? (
                <div style={{ color: 'rgba(255,255,255,.25)', padding: '2rem', textAlign: 'center' }}>Cargando documentos...</div>
              ) : error ? (
                <div style={{ color: '#e05c4b', padding: '2rem', textAlign: 'center' }}>⚠️ {error}</div>
              ) : (
                <>
                  <div className={styles.sectionHd}>
                    <h4>{FOLDER_TITLES[currentFolder] || 'Documentos'}</h4>
                    <span>{filteredDocs.length} archivo{filteredDocs.length !== 1 ? 's' : ''}</span>
                  </div>

                  {filteredDocs.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyStateIcon}>🔍</div>
                      <h3>Sin resultados</h3>
                      <p>No hay documentos que coincidan.</p>
                    </div>
                  ) : viewMode === 'grid' ? (
                    <div className={styles.docGrid}>
                      {filteredDocs.map((d) => (
                        <div
                          key={d.id}
                          className={`${styles.docCard} ${currentDoc?.id === d.id ? styles.docCardSelected : ''}`}
                          style={{ '--kc': d.kc }}
                          onClick={() => setCurrentDoc(d)}
                        >
                          <div className={styles.docThumb}>
                            {d.icon}
                            <div className={styles.docExt} style={{ background: d.extColor.bg, color: d.extColor.c }}>
                              {d.ext || '?'}
                            </div>
                          </div>
                          <div className={styles.docNm}>{d.name}</div>
                          <div className={styles.docCo}>{d.coShort}</div>
                          <div className={styles.docMt}>{d.category} · {d.date}</div>
                          <span className={`${styles.badge} ${styles[STATUS_BADGE[d.status] || 'bN']}`} style={{ fontSize: '.58rem' }}>
                            {STATUS_LABELS[d.status] || d.status}
                          </span>
                          <div className={styles.docCardActions}>
                            {d.file_url ? (
                              <>
                                <span className={styles.dca} onClick={(e) => { e.stopPropagation(); window.open(d.file_url, '_blank'); }} title="Ver">👁</span>
                                <span className={styles.dca} onClick={(e) => { e.stopPropagation(); window.open(d.file_url, '_blank'); }} title="Descargar">↓</span>
                              </>
                            ) : (
                              <>
                                <span className={`${styles.dca} ${styles.dcaDisabled}`} title="Sin archivo">👁</span>
                                <span className={`${styles.dca} ${styles.dcaDisabled}`}>↓</span>
                              </>
                            )}
                            <span className={styles.dca} onClick={(e) => deleteDoc(d.id, d.name, e)} title="Eliminar">🗑</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <div className={styles.dlHeader}>
                        <div style={{ width: '34px', flexShrink: 0 }}></div>
                        <div className={styles.dlhName}>Nombre</div>
                        <div className={styles.dlhCo}>Empresa</div>
                        <div className={styles.dlhMod}>Módulo</div>
                        <div className={styles.dlhStatus}>Estado</div>
                        <div className={styles.dlhDate}>Fecha</div>
                        <div className={styles.dlhSize}>Tamaño</div>
                        <div style={{ width: '56px' }}></div>
                      </div>
                      <div className={styles.docList}>
                        {filteredDocs.map((d) => (
                          <div
                            key={d.id}
                            className={`${styles.dlItem} ${currentDoc?.id === d.id ? styles.dlItemSelected : ''}`}
                            onClick={() => setCurrentDoc(d)}
                          >
                            <div className={styles.dlIcon} style={{ background: d.extColor.bg }}>{d.icon}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className={styles.dlName}>{d.name}</div>
                              <div className={styles.dlCo}>{d.mod}</div>
                            </div>
                            <div style={{ width: '130px', flexShrink: 0, fontSize: '.72rem', color: 'rgba(255,255,255,.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {d.coShort}
                            </div>
                            <div className={styles.dlMod}><span className={`${styles.badge} ${styles.bGold}`} style={{ fontSize: '.58rem' }}>{(d.mod || '').substring(0, 10)}</span></div>
                            <div className={styles.dlStatus}><span className={`${styles.badge} ${styles[STATUS_BADGE[d.status] || 'bN']}`} style={{ fontSize: '.58rem' }}>{STATUS_LABELS[d.status] || d.status}</span></div>
                            <div className={styles.dlDate}>{d.date}</div>
                            <div className={styles.dlSize}>{d.size}</div>
                            <div className={styles.dlActions}>
                              {d.file_url ? (
                                <>
                                  <button className={styles.dla} onClick={(e) => { e.stopPropagation(); window.open(d.file_url, '_blank'); }}>👁</button>
                                  <button className={styles.dla} onClick={(e) => { e.stopPropagation(); window.open(d.file_url, '_blank'); }}>↓</button>
                                </>
                              ) : (
                                <>
                                  <button className={`${styles.dla} ${styles.dlaDisabled}`}>👁</button>
                                  <button className={`${styles.dla} ${styles.dlaDisabled}`}>↓</button>
                                </>
                              )}
                              <button className={styles.dla} onClick={(e) => deleteDoc(d.id, d.name, e)}>🗑</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* PREVIEW PANEL */}
          <div className={styles.previewPanel}>
            {!currentDoc ? (
              <div className={styles.pvEmpty}>
                <div className={styles.pvEmptyIcon}>📄</div>
                <p>Selecciona un documento para ver sus detalles y opciones</p>
              </div>
            ) : (
              <div className={styles.pvContent}>
                <div className={styles.pvThumbArea}>
                  <div className={styles.pvIcon}>{currentDoc.icon}</div>
                  <div className={styles.pvExtTag} style={{ background: currentDoc.extColor.bg, color: currentDoc.extColor.c }}>
                    {(currentDoc.ext || '?').toUpperCase()}
                  </div>
                  <div className={styles.pvFname}>{currentDoc.name}</div>
                  <div className={styles.pvFsize}>{currentDoc.size}</div>
                </div>
                <div className={styles.pvBody}>
                  <div className={styles.pvSection}>
                    <div className={styles.pvSectionTitle}>Detalles</div>
                    <div className={styles.pvRow}><span className={styles.pvLbl}>Empresa</span><span className={styles.pvVal}>{currentDoc.company}</span></div>
                    <div className={styles.pvRow}><span className={styles.pvLbl}>Módulo</span><span className={styles.pvVal}>{currentDoc.mod}</span></div>
                    <div className={styles.pvRow}>
                      <span className={styles.pvLbl}>Estado</span>
                      <span className={styles.pvVal}>
                        <span className={`${styles.badge} ${styles[STATUS_BADGE[currentDoc.status] || 'bN']}`}>
                          {STATUS_LABELS[currentDoc.status] || currentDoc.status}
                        </span>
                      </span>
                    </div>
                    <div className={styles.pvRow}><span className={styles.pvLbl}>Tipo</span><span className={styles.pvValMono}>{(currentDoc.ext || '?').toUpperCase()}</span></div>
                  </div>
                  <div className={styles.pvSection}>
                    <div className={styles.pvSectionTitle}>Metadatos</div>
                    <div className={styles.pvRow}><span className={styles.pvLbl}>Subido por</span><span className={`${styles.pvVal} ${styles.pvValGold}`}>{currentDoc.by}</span></div>
                    <div className={styles.pvRow}><span className={styles.pvLbl}>Fecha</span><span className={styles.pvValMono}>{currentDoc.date}</span></div>
                    <div className={styles.pvRow}><span className={styles.pvLbl}>Versión</span><span className={styles.pvValMono}>{currentDoc.ver}</span></div>
                    <div className={styles.pvRow}><span className={styles.pvLbl}>Descargas</span><span className={styles.pvVal}>{currentDoc.dl} veces</span></div>
                  </div>
                  <div className={styles.pvSection}>
                    <div className={styles.pvSectionTitle}>Descripción</div>
                    <div style={{ fontSize: '.74rem', color: 'rgba(255,255,255,.5)', lineHeight: 1.65 }}>
                      {currentDoc.desc}
                    </div>
                  </div>
                </div>
                <div className={styles.pvActions}>
                  {currentDoc.file_url ? (
                    <>
                      <button className={`${styles.btnP} ${styles.btnW}`} onClick={() => window.open(currentDoc.file_url, '_blank')}>👁 Ver archivo</button>
                      <button className={`${styles.btnS} ${styles.btnW}`} onClick={() => window.open(currentDoc.file_url, '_blank')}>↓ Descargar</button>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.45rem' }}>
                        <button className={styles.btnG} style={{ justifyContent: 'center' }} onClick={() => publishDoc(currentDoc.id)}>📢 Publicar</button>
                        <button className={styles.btnG} style={{ justifyContent: 'center' }}>✏️ Editar</button>
                      </div>
                      <button className={styles.btnDanger} onClick={() => deleteDoc(currentDoc.id, currentDoc.name)}>🗑 Eliminar</button>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: '.74rem', color: 'rgba(255,255,255,.25)', textAlign: 'center', padding: '.5rem 0' }}>Sin archivo en Storage</p>
                      <button className={styles.btnDanger} onClick={() => deleteDoc(currentDoc.id, currentDoc.name)}>🗑 Eliminar registro</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* UPLOAD MODAL */}
      {uploadModalOpen && (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setUploadModalOpen(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHd}>
              <div>
                <h3>Subir documento</h3>
                <p>Carga un archivo para una empresa y módulo específico</p>
              </div>
              <button className={styles.modalClose} onClick={() => setUploadModalOpen(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {!file ? (
                <div className={styles.dropZone}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add(styles.dropZoneDrag); }}
                  onDragLeave={(e) => e.currentTarget.classList.remove(styles.dropZoneDrag)}
                  onDrop={(e) => { e.currentTarget.classList.remove(styles.dropZoneDrag); handleDrop(e); }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className={styles.dropZoneIcon}>📤</div>
                  <h4>Arrastra tu archivo <em>aquí</em></h4>
                  <p>o haz clic para seleccionar desde tu equipo</p>
                  <small>PDF, Excel, Word · Máximo 50 MB por archivo</small>
                </div>
              ) : (
                <div className={styles.filePreview}>
                  <span className={styles.fpIcon}>📄</span>
                  <div style={{ flex: 1 }}>
                    <div className={styles.fpName}>{file.name}</div>
                    <div className={styles.fpSize}>{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                  <button className={styles.fpBtn} onClick={clearFile}>✕</button>
                </div>
              )}
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

              <div className={styles.formRow}>
                <div className={styles.field}>
                  <label>Empresa *</label>
                  <select value={formData.company_id} onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}>
                    <option value="">Seleccionar empresa…</option>
                    {Object.entries(companies).map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Módulo *</label>
                  <select value={formData.mod} onChange={(e) => setFormData({ ...formData, mod: e.target.value })}>
                    <option value="">Seleccionar módulo…</option>
                    <option value="Facturación y Cartera">Facturación y Cartera</option>
                    <option value="Contabilidad">Contabilidad</option>
                    <option value="Tesorería">Tesorería</option>
                    <option value="Gestión de Personal">Gestión de Personal</option>
                    <option value="Interno / General">Interno / General</option>
                  </select>
                </div>
              </div>
              <div className={`${styles.formRow} ${styles.formRowFull}`}>
                <div className={styles.field}>
                  <label>Nombre del documento</label>
                  <input type="text" placeholder="Ej: Reporte de cartera junio 2025" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.field}>
                  <label>Estado inicial</label>
                  <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                    <option value="borrador">Borrador</option>
                    <option value="revision">En revisión</option>
                    <option value="publicado">Publicar inmediatamente</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Versión</label>
                  <input type="text" placeholder="v1.0" value={formData.ver} onChange={(e) => setFormData({ ...formData, ver: e.target.value })} />
                </div>
              </div>
              <div className={`${styles.formRow} ${styles.formRowFull}`}>
                <div className={styles.field}>
                  <label>Descripción (opcional)</label>
                  <textarea placeholder="Describe el contenido o contexto del documento…" style={{ minHeight: '60px' }} value={formData.desc} onChange={(e) => setFormData({ ...formData, desc: e.target.value })}></textarea>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.7rem .85rem', background: '#1a2230', borderRadius: '10px', border: '1px solid rgba(255,255,255,.07)' }}>
                <span style={{ fontSize: '.82rem' }}>🔔</span>
                <span style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.5)' }}>Notificar al cliente cuando el documento sea publicado</span>
                <div
                  style={{ marginLeft: 'auto', width: '32px', height: '18px', borderRadius: '9px', background: formData.notify ? '#c9a84c' : '#212c3d', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .2s' }}
                  onClick={() => setFormData({ ...formData, notify: !formData.notify })}
                >
                  <div style={{ position: 'absolute', top: '2px', left: formData.notify ? '16px' : '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#0d1117', transition: 'left .2s' }}></div>
                </div>
              </div>
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setUploadModalOpen(false)}>Cancelar</button>
              <button className={styles.btnP} onClick={uploadDoc} disabled={uploading}>
                {uploading ? '⏳ Subiendo…' : '📤 Subir documento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
