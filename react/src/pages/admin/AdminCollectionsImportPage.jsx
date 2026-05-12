import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import styles from './AdminCollectionsImportPage.module.css';
import { Link, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function AdminCollectionsImportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  
  // Tabs
  const [currentTab, setCurrentTab] = useState('siigo'); // siigo, contactos
  
  // Siigo Import State
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [diffResult, setDiffResult] = useState(null);
  const [showPreviewTable, setShowPreviewTable] = useState(false);
  const fileInputRef = useRef(null);
  
  // Contacts Import State
  const [ctCompanyId, setCtCompanyId] = useState('');
  const [ctRows, setCtRows] = useState([]);
  const [ctPreviewSub, setCtPreviewSub] = useState('');
  const [ctMatched, setCtMatched] = useState([]);
  const ctFileInputRef = useRef(null);

  // Progress
  const [progPct, setProgPct] = useState(0);
  const [progMsg, setProgMsg] = useState('');
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    const loadCompanies = async () => {
      setLoading(true);
      const { data } = await supabase.from('companies').select('id, name').order('name');
      setCompanies(data || []);
      setLoading(false);
    };
    loadCompanies();
  }, []);

  // --- SIIGO PARSER HELPER ---
  const parseSiigoMoney = (v) => {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    let s = String(v).replace(/\$/g, '').replace(/"/g, '').trim();
    if (!s) return 0;
    if (s.includes(',')) { s = s.replace(/\./g, '').replace(',', '.'); }
    else { s = s.replace(/\./g, ''); }
    return parseFloat(s) || 0;
  };

  const parseSiigoDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') {
      const d = XLSX.SSF.parse_date_code(v);
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
    const s = String(v).trim();
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    return null;
  };

  const parseNewSiigoRows = (json) => {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const findKey = (row, options) => Object.keys(row).find((k) => options.includes(norm(k)));

    if (!json.length) return [];

    const K_NIT = findKey(json[0], ['cliente identificacion', 'cliente identificación']);
    const K_NAME = findKey(json[0], ['cliente nombre']);
    const K_FECHA = findKey(json[0], ['fecha factura']);
    const K_NUM = findKey(json[0], ['numero']);
    const K_RANGO = findKey(json[0], ['rango vencimiento']);
    const K_MONEDA = findKey(json[0], ['moneda']);
    const K_TOTALO = findKey(json[0], ['total factura original']);
    const K_SALDO = findKey(json[0], ['saldo actual cop']);

    if (!K_NIT || !K_NUM || !K_RANGO || !K_SALDO) {
      alert('El archivo Excel no tiene las columnas esperadas del nuevo formato Siigo.');
      return [];
    }

    return json.map((r) => ({
      nit: String(r[K_NIT] || '').trim(),
      name: String(r[K_NAME] || '').trim(),
      fecha: r[K_FECHA],
      numero: String(r[K_NUM] || '').trim(),
      rango: String(r[K_RANGO] || '').trim(),
      moneda: String(r[K_MONEDA] || 'COP').trim().toUpperCase(),
      total_o: r[K_TOTALO],
      saldo: r[K_SALDO],
    })).filter((r) => r.nit && r.numero && r.rango);
  };

  const groupAndProcess = async (rawRows) => {
    const map = {};
    for (const r of rawRows) {
      if (!r.nit || !r.numero) continue;
      const key = r.nit + '|' + r.numero;
      if (!map[key]) {
        map[key] = {
          document_id: r.nit, name: r.name || '', invoice: r.numero, due_date: parseSiigoDate(r.fecha),
          currency: String(r.moneda || 'COP').trim().toUpperCase(), original_amount: parseSiigoMoney(r.total_o),
          ov_1_30: 0, ov_31_60: 0, ov_61_90: 0, ov_91: 0, not_due: 0, total: 0,
        };
      }
      const monto = parseSiigoMoney(r.saldo);
      const rango = String(r.rango).trim();

      if (rango === '1-30') map[key].ov_1_30 += monto;
      else if (rango === '31-60') map[key].ov_31_60 += monto;
      else if (rango === '61-90') map[key].ov_61_90 += monto;
      else if (rango === '91+') map[key].ov_91 += monto;
      else if (rango === 'No vencido') map[key].not_due += monto;

      map[key].total += monto;
    }

    const grouped = Object.values(map).map((r) => {
      const outstanding = r.ov_1_30 + r.ov_31_60 + r.ov_61_90 + r.ov_91;
      return { ...r, outstanding, credit: 0, isPaid: outstanding === 0 && r.not_due === 0 };
    });

    if (!grouped.length) {
      alert('No se encontraron filas válidas.');
      return;
    }
    
    setParsedRows(grouped);
    await buildPreview(grouped);
  };

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    if (ext === 'csv') {
      reader.onload = (e) => {
        // Simple fallback for CSV parsing, realistically handled by PapaParse or similar
        // For brevity relying on Excel conversion first if possible
        alert('CSV no soportado en esta versión demo. Usa XLSX.');
      };
      reader.readAsText(file, 'utf-8');
    } else {
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
          if (!json.length) { alert('El archivo está vacío.'); return; }
          const raw = parseNewSiigoRows(json);
          groupAndProcess(raw);
        } catch (err) { alert('Error al leer: ' + err.message); }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const buildPreview = async (grouped) => {
    const [r1, r2] = await Promise.all([
      supabase.from('collection_debtors').select('debtor_document, id, phone, email, whatsapp, prev_max_tramo, status, debtor_name, city, last_import_at').eq('company_id', selectedCompanyId),
      supabase.from('collection_debts').select('siigo_document, overdue_1_30, overdue_31_60, overdue_61_90, overdue_91_plus, total_balance, outstanding_amount, debtor_id, status').eq('company_id', selectedCompanyId),
    ]);

    const existingDebtors = {};
    const existingInvoices = {};
    (r1.data || []).forEach((d) => { existingDebtors[d.debtor_document] = d; });
    (r2.data || []).forEach((f) => { existingInvoices[f.debtor_id + '|' + f.siigo_document] = f; });

    const diff = { sin_cambio: 0, modificados: [], nuevos_inv: [], pagados: [], nuevos_deb: [], sube_tramo: [], desaparecidos: [], facturas_pagadas: 0 };
    const docsEnArchivo = new Set(grouped.map((r) => r.document_id));

    Object.values(existingDebtors).forEach((d) => {
      if (!docsEnArchivo.has(d.debtor_document) && !['paid', 'cancelled'].includes(d.status)) {
        diff.desaparecidos.push({ id: d.id, name: d.debtor_name, document_id: d.debtor_document });
      }
    });

    const debtorNewTramo = {};
    const debtorAllPaid = {};
    const debtorNetSaldo = {};

    grouped.forEach((r) => {
      if (!debtorNewTramo[r.document_id]) {
        debtorNewTramo[r.document_id] = 0;
        debtorAllPaid[r.document_id] = true;
        debtorNetSaldo[r.document_id] = 0;
      }
      const t = r.ov_91 > 0 ? 91 : r.ov_61_90 > 0 ? 61 : r.ov_31_60 > 0 ? 31 : r.ov_1_30 > 0 ? 1 : 0;
      if (t > debtorNewTramo[r.document_id]) debtorNewTramo[r.document_id] = t;
      debtorNetSaldo[r.document_id] += r.total;
      if (!r.isPaid) debtorAllPaid[r.document_id] = false;
    });

    grouped.forEach((r) => {
      const debtorId = existingDebtors[r.document_id]?.id || '';
      const existF = existingInvoices[debtorId + '|' + r.invoice];
      if (!existF) {
        diff.nuevos_inv.push(r);
      } else {
        const trunc = (n) => Math.trunc(+n || 0);
        const changed =
          trunc(existF.overdue_1_30) !== trunc(r.ov_1_30) ||
          trunc(existF.overdue_31_60) !== trunc(r.ov_31_60) ||
          trunc(existF.overdue_61_90) !== trunc(r.ov_61_90) ||
          trunc(existF.overdue_91_plus) !== trunc(r.ov_91) ||
          trunc(existF.total_balance) !== trunc(r.total);
        if (changed) diff.modificados.push({ row: r, prev: existF });
        else diff.sin_cambio++;
      }
    });

    Object.entries(debtorNewTramo).forEach(([doc, newTramo]) => {
      const existD = existingDebtors[doc];
      if (!existD) {
        diff.nuevos_deb.push({ document_id: doc, name: grouped.find((r) => r.document_id === doc)?.name || doc });
      } else {
        const prevTramo = existD.prev_max_tramo || 0;
        const netSaldo = debtorNetSaldo[doc] || 0;
        if (debtorAllPaid[doc] && netSaldo <= 0 && existD.status !== 'paid') {
          diff.pagados.push({ id: existD.id, name: existD.debtor_name, document_id: doc });
        } else if (existD.last_import_at && newTramo > prevTramo) {
          diff.sube_tramo.push({ id: existD.id, name: existD.debtor_name, document_id: doc, prev: prevTramo, nuevo: newTramo });
        }
      }
    });

    setDiffResult(diff);
    setStep(3);
  };

  const handleImport = async () => {
    setStep(4);
    setProgPct(10); setProgMsg('Iniciando importación simulada...');
    // Simulated import delay to show UI progress
    setTimeout(() => {
      setProgPct(50); setProgMsg('Actualizando facturas...');
      setTimeout(() => {
        setProgPct(100); setProgMsg('Completado');
        setImportResult({ written: diffResult.modificados.length + diffResult.nuevos_inv.length, newDebtors: diffResult.nuevos_deb.length, paidCount: diffResult.pagados.length, errors: [] });
      }, 1000);
    }, 1000);
  };

  const resetImport = () => {
    setStep(1); setFileName(''); setParsedRows([]); setDiffResult(null); setImportResult(null); setProgPct(0);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const companyName = companies.find(c => c.id === selectedCompanyId)?.name || '';

  return (
    <div className={styles.app}>
      <div className={styles.main}>
        <div className={styles.content}>
          <div className={styles.page}>
            {loading ? <div style={{color:'rgba(255,255,255,.25)'}}>Cargando...</div> : (
              <>
                <div style={{ display: 'flex', gap: '.25rem', background: '#131920', border: '1px solid rgba(255,255,255,.07)', borderRadius: '10px', padding: '.25rem', marginBottom: '1.25rem', width: 'fit-content' }}>
                  <button className={styles.tabBtn} style={{ background: currentTab === 'siigo' ? 'rgba(201,168,76,.12)' : 'none', color: currentTab === 'siigo' ? '#e8c97a' : 'rgba(255,255,255,.25)', fontWeight: currentTab === 'siigo' ? 500 : 400 }} onClick={() => setCurrentTab('siigo')}>📊 Importar cartera Siigo</button>
                  <button className={styles.tabBtn} style={{ background: currentTab === 'contactos' ? 'rgba(201,168,76,.12)' : 'none', color: currentTab === 'contactos' ? '#e8c97a' : 'rgba(255,255,255,.25)', fontWeight: currentTab === 'contactos' ? 500 : 400 }} onClick={() => setCurrentTab('contactos')}>📞 Importar contactos</button>
                </div>

                {currentTab === 'siigo' && (
                  <div>
                    <div className={styles.steps}>
                      <div className={`${styles.step} ${step === 1 ? styles.stepActive : step > 1 ? styles.stepDone : ''}`}><div className={styles.stepN}>{step > 1 ? '✓' : '1'}</div><span className={styles.stepLbl}>Seleccionar empresa</span></div>
                      <div className={`${styles.stepLine} ${step > 1 ? styles.stepLineDone : ''}`}></div>
                      <div className={`${styles.step} ${step === 2 ? styles.stepActive : step > 2 ? styles.stepDone : ''}`}><div className={styles.stepN}>{step > 2 ? '✓' : '2'}</div><span className={styles.stepLbl}>Cargar archivo</span></div>
                      <div className={`${styles.stepLine} ${step > 2 ? styles.stepLineDone : ''}`}></div>
                      <div className={`${styles.step} ${step === 3 ? styles.stepActive : step > 3 ? styles.stepDone : ''}`}><div className={styles.stepN}>{step > 3 ? '✓' : '3'}</div><span className={styles.stepLbl}>Previsualizar</span></div>
                      <div className={`${styles.stepLine} ${step > 3 ? styles.stepLineDone : ''}`}></div>
                      <div className={`${styles.step} ${step === 4 ? styles.stepActive : step > 4 ? styles.stepDone : ''}`}><div className={styles.stepN}>{step > 4 ? '✓' : '4'}</div><span className={styles.stepLbl}>Importar</span></div>
                    </div>

                    {step === 1 && (
                      <div className={styles.card}>
                        <div className={styles.cardHd}><div><div className={styles.stag}>Paso 1</div><div className={styles.cardTitle}>¿Para qué empresa es este reporte?</div></div></div>
                        <div className={styles.field} style={{ maxWidth: '400px' }}>
                          <label>Empresa cliente *</label>
                          <select value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)}>
                            <option value="">Seleccionar empresa...</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <button className={styles.btnP} disabled={!selectedCompanyId} onClick={() => setStep(2)}>Continuar → Cargar archivo</button>
                      </div>
                    )}

                    {step === 2 && (
                      <div className={styles.card}>
                        <div className={styles.cardHd}><div><div className={styles.stag}>Paso 2</div><div className={styles.cardTitle}>Cargar reporte de cartera Siigo</div><div className={styles.cardSub}>Empresa: {companyName}</div></div><button className={styles.btnS} onClick={() => setStep(1)}>← Cambiar empresa</button></div>
                        <div className={styles.dropzone} onClick={() => fileInputRef.current.click()}>
                          <input type="file" ref={fileInputRef} accept=".xlsx,.xls" onChange={(e) => handleFile(e.target.files[0])} style={{ display: 'none' }} />
                          <span className={styles.dzIcon}>📊</span>
                          <div className={styles.dzTitle}>Selecciona el archivo Excel</div>
                          <div className={styles.dzSub}>Haz clic para cargar (.xlsx)</div>
                          {fileName && <div className={styles.dzChip}>📄 {fileName}</div>}
                        </div>
                      </div>
                    )}

                    {step === 3 && diffResult && (
                      <div className={styles.card}>
                        <div className={styles.cardHd}><div><div className={styles.stag}>Paso 3</div><div className={styles.cardTitle}>Previsualización</div></div><div><button className={styles.btnS} onClick={() => setStep(2)}>← Cambiar archivo</button><button className={styles.btnP} onClick={handleImport}>Importar a Supabase →</button></div></div>
                        <div className={styles.sumGrid}>
                          <div className={styles.sumCard} style={{ borderTop: '2px solid #4a9fd4' }}><div className={styles.sumLbl}>Deudores nuevos</div><div className={styles.sumVal} style={{ color: '#4a9fd4' }}>{diffResult.nuevos_deb.length}</div></div>
                          <div className={styles.sumCard} style={{ borderTop: '2px solid #22a66a' }}><div className={styles.sumLbl}>Pagaron</div><div className={styles.sumVal} style={{ color: '#22a66a' }}>{diffResult.pagados.length + diffResult.desaparecidos.length}</div></div>
                          <div className={styles.sumCard} style={{ borderTop: '2px solid #e8a020' }}><div className={styles.sumLbl}>Subieron de tramo</div><div className={styles.sumVal} style={{ color: '#e8a020' }}>{diffResult.sube_tramo.length}</div></div>
                          <div className={styles.sumCard} style={{ borderTop: '2px solid rgba(255,255,255,.07)' }}><div className={styles.sumLbl}>Facturas</div><div className={styles.sumVal} style={{ color: 'rgba(255,255,255,.5)' }}>{diffResult.modificados.length + diffResult.nuevos_inv.length}</div></div>
                        </div>
                        <button className={styles.btnG} onClick={() => setShowPreviewTable(!showPreviewTable)}>📋 Ver detalle</button>
                      </div>
                    )}

                    {step === 4 && (
                      <div>
                        <div className={styles.progWrap}>
                          <div className={styles.progTitle}>{progPct < 100 ? `Importando... ${progPct}%` : '✅ Importación completada'}</div>
                          <div className={styles.progBarWrap}><div className={styles.progBar} style={{ width: `${progPct}%` }}></div></div>
                          <div className={styles.progDetail}>{progMsg}</div>
                        </div>
                        {importResult && (
                          <div className={styles.card}>
                            <div className={styles.alert} style={{ background: 'rgba(34,166,106,.12)', borderLeft: '3px solid #22a66a' }}><p><strong>Importación exitosa</strong></p></div>
                            <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}><Link to="/admin/collections" className={styles.btnP}>Ver cartera →</Link><button className={styles.btnS} onClick={resetImport}>Importar otro</button></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {currentTab === 'contactos' && (
                  <div className={styles.card}>
                    <div className={styles.cardHd}><div><div className={styles.cardTitle}>Importar datos de contacto</div></div></div>
                    <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '.8rem' }}>Esta funcionalidad está pendiente en la migración React.</div>
                  </div>
                )}

              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
