import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useSEO } from '../../hooks/useSEO';
import styles from './OnboardingPage.module.css';

const STEP_LABELS = ['', 'Datos de empresa', 'Servicios', 'Políticas', 'KYC / Documentos', 'Confirmación'];
const ESTADOS_BLOQUEADOS = ['pending_review', 'approved', 'needs_correction'];

const SERVICE_ICONS = {
  'Contabilidad': { ico: '📋', bg: '#e8f4fd' },
  'Nómina': { ico: '👥', bg: '#f0fdf4' },
  'Controller': { ico: '📊', bg: '#fef9ec' },
  'Facturación y cobranza': { ico: '🧾', bg: '#fef9ec' },
};

function formatBytes(b) {
  return b < 1024 * 1024 ? (b / 1024).toFixed(0) + 'KB' : (b / (1024 * 1024)).toFixed(1) + 'MB';
}

function isEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export default function OnboardingPage() {
  useSEO({
    title: 'Registro de Empresa',
    description: 'Registra tu empresa en RS Back Office y comienza a optimizar tu gestión.',
  });

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [onboardingId, setOnboardingId] = useState(null);
  const [kycSubmissionId, setKycSubmissionId] = useState(null);
  const [blockedStatus, setBlockedStatus] = useState(null);

  const [alert, setAlert] = useState({ show: false, msg: '', type: 'err' });
  const [loading, setLoading] = useState(false);

  // Paso 1 - Form
  const [form, setForm] = useState({
    name: '', nit: '', type: '', sector: '', city: '',
    address: '', phone: '', website: '', repName: '',
    repCedula: '', repEmail: '', repPhone: '', repPosition: ''
  });

  // Paso 2 - Servicios
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);

  // Paso 3 - Políticas
  const [policies, setPolicies] = useState([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [openPolicies, setOpenPolicies] = useState({});

  // Paso 4 - Documentos
  const [docs, setDocs] = useState({
    rut: { file: null, path: null },
    cedula: { file: null, path: null },
    sarlaft: { file: null, path: null }
  });

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadServices(), loadPolicies()]);
      const paramNit = searchParams.get('nit');
      if (paramNit) {
        setForm(f => ({ ...f, nit: paramNit }));
        showAlert('Encontramos una solicitud previa. Complete los datos y continúe.', 'info');
      }
    };
    init();
  }, [searchParams]);

  const loadServices = async () => {
    setServicesLoading(true);
    const { data } = await supabase.from('services').select('id, name').eq('active', true).order('name');
    if (data) setServices(data.map(s => ({ ...s, selected: false })));
    setServicesLoading(false);
  };

  const loadPolicies = async () => {
    setPoliciesLoading(true);
    const { data } = await supabase.from('policy_versions').select('id, policy_type, version, title, content').eq('active', true).order('policy_type');
    if (data) setPolicies(data.map(p => ({ ...p, accepted: false })));
    setPoliciesLoading(false);
  };

  const showAlert = (msg, type = 'err') => setAlert({ show: true, msg, type });
  const hideAlert = () => setAlert({ show: false, msg: '', type: 'err' });

  // PASO 1 -> PASO 2
  const goStep2 = async () => {
    const { name, nit, type, city, repName, repEmail, repPhone, repCedula, sector, address, phone, website, repPosition } = form;
    if (!name || !nit || !type || !city || !repName || !repEmail || !repPhone || !repCedula) {
      return showAlert('Complete todos los campos obligatorios (*).');
    }
    if (!isEmail(repEmail)) return showAlert('Ingrese un correo electrónico válido.');

    setLoading(true);
    try {
      if (!onboardingId) {
        const { data: existing } = await supabase
          .from('client_onboardings')
          .select('id, current_step, status')
          .eq('company_nit', nit)
          .neq('status', 'rejected')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          if (ESTADOS_BLOQUEADOS.includes(existing.status)) {
            setBlockedStatus(existing.status);
            setLoading(false);
            return;
          }
          setOnboardingId(existing.id);
          await supabase.from('client_onboardings').update({
            company_name: name, company_nit: nit, company_type: type,
            company_sector: sector, company_city: city, company_address: address,
            company_phone: phone, company_website: website, rep_name: repName,
            rep_email: repEmail, rep_phone: repPhone, rep_cedula: repCedula,
            rep_position: repPosition, current_step: Math.max(existing.current_step, 2),
          }).eq('id', existing.id);
          await restoreState(existing.id);
          hideAlert();
          setStep(2);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.from('client_onboardings').insert({
          company_name: name, company_nit: nit, company_type: type,
          company_sector: sector, company_city: city, company_address: address,
          company_phone: phone, company_website: website, rep_name: repName,
          rep_email: repEmail, rep_phone: repPhone, rep_cedula: repCedula,
          rep_position: repPosition, status: 'draft', current_step: 2,
          user_agent: navigator.userAgent,
        }).select().single();

        if (error) {
          if (error.code === '23505') return showAlert('Ya existe una solicitud activa con este NIT.');
          throw error;
        }
        setOnboardingId(data.id);
      } else {
        await supabase.from('client_onboardings').update({
          company_name: name, company_nit: nit, company_type: type,
          company_sector: sector, company_city: city, company_address: address,
          company_phone: phone, company_website: website, rep_name: repName,
          rep_email: repEmail, rep_phone: repPhone, rep_cedula: repCedula,
          rep_position: repPosition, current_step: Math.max(step, 2),
        }).eq('id', onboardingId);
      }
      hideAlert();
      setStep(2);
      window.scrollTo(0, 0);
    } catch (e) {
      showAlert('Error al guardar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const restoreState = async (id) => {
    const { data: contracts } = await supabase.from('service_contracts').select('service_id').eq('onboarding_id', id);
    if (contracts?.length) {
      const ids = contracts.map(c => c.service_id);
      setServices(prev => prev.map(s => ({ ...s, selected: ids.includes(s.id) })));
    }
    const { data: acceptances } = await supabase.from('policy_acceptances').select('policy_version_id').eq('onboarding_id', id);
    if (acceptances?.length) {
      const ids = acceptances.map(a => a.policy_version_id);
      setPolicies(prev => prev.map(p => ({ ...p, accepted: ids.includes(p.id) })));
    }
    const { data: kyc } = await supabase.from('kyc_submissions').select('id').eq('onboarding_id', id).maybeSingle();
    if (kyc) setKycSubmissionId(kyc.id);
  };

  // PASO 2 -> PASO 3
  const toggleService = (id) => {
    setServices(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const goStep3 = async () => {
    const selected = services.filter(s => s.selected);
    if (!selected.length) return showAlert('Seleccione al menos un servicio.');
    setLoading(true);
    try {
      await supabase.from('service_contracts').delete().eq('onboarding_id', onboardingId);
      for (const s of selected) {
        await supabase.from('service_contracts').insert({ onboarding_id: onboardingId, service_id: s.id, status: 'selected' });
      }
      await supabase.from('client_onboardings').update({ status: 'services_selected', current_step: Math.max(step, 3) }).eq('id', onboardingId);
      hideAlert();
      setStep(3);
      window.scrollTo(0, 0);
    } catch (e) {
      showAlert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // PASO 3 -> PASO 4
  const togglePolicyOpen = (id) => setOpenPolicies(prev => ({ ...prev, [id]: !prev[id] }));
  const togglePolicyAccept = (id) => {
    setPolicies(prev => prev.map(p => p.id === id ? { ...p, accepted: !p.accepted } : p));
  };

  const goStep4 = async () => {
    const unaccepted = policies.filter(p => !p.accepted);
    if (unaccepted.length) return showAlert('Debe aceptar todas las políticas.');
    setLoading(true);
    try {
      await supabase.from('policy_acceptances').delete().eq('onboarding_id', onboardingId);
      for (const p of policies) {
        await supabase.from('policy_acceptances').insert({
          onboarding_id: onboardingId, policy_version_id: p.id,
          accepted_by_name: form.repName, accepted_by_email: form.repEmail,
          accepted_by_cedula: form.repCedula,
          accepted_at: new Date().toISOString(), user_agent: navigator.userAgent,
          acceptance_method: 'checkbox',
        });
      }
      await supabase.from('client_onboardings').update({ status: 'policies_accepted', current_step: Math.max(step, 4) }).eq('id', onboardingId);
      if (!kycSubmissionId) {
        const { data } = await supabase.from('kyc_submissions').insert({ onboarding_id: onboardingId, status: 'pending' }).select().single();
        if (data) setKycSubmissionId(data.id);
      }
      hideAlert();
      setStep(4);
      window.scrollTo(0, 0);
    } catch (e) {
      showAlert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // PASO 4 -> PASO 5
  const handleFile = (type, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return showAlert('Archivo excede 10 MB.');
    setDocs(prev => ({ ...prev, [type]: { ...prev[type], file } }));
    hideAlert();
  };

  const goStep5 = async () => {
    const missing = [];
    if (!docs.rut.file) missing.push('RUT');
    if (!docs.cedula.file) missing.push('Cédula');
    if (!docs.sarlaft.file) missing.push('SARLAFT');
    if (missing.length) return showAlert('Documentos faltantes: ' + missing.join(', ') + '.');

    setLoading(true);
    try {
      const uploads = [
        { key: 'rut', type: 'rut', file: docs.rut.file },
        { key: 'cedula', type: 'cedula_representante', file: docs.cedula.file },
        { key: 'sarlaft', type: 'sarlaft_form', file: docs.sarlaft.file }
      ];

      for (const { key, type, file } of uploads) {
        const ext = file.name.split('.').pop();
        const path = `${onboardingId}/${type}.${ext}`;

        const { error } = await supabase.storage.from('kyc-documents').upload(path, file, { upsert: true });
        if (error) throw new Error(`Error subiendo ${type}: ${error.message}`);

        await supabase.from('kyc_documents').upsert({
          kyc_submission_id: kycSubmissionId, doc_type: type,
          status: 'uploaded', file_name: file.name, file_size_bytes: file.size,
          storage_path: path, uploaded_at: new Date().toISOString(),
        }, { onConflict: 'kyc_submission_id,doc_type' });
      }

      await supabase.from('kyc_submissions').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', kycSubmissionId);
      await supabase.from('client_onboardings').update({ current_step: 5 }).eq('id', onboardingId);

      hideAlert();
      setStep(5);
      window.scrollTo(0, 0);
    } catch (e) {
      showAlert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // PASO 5 -> SUCCESS
  const submitOnboarding = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from('client_onboardings').update({
        status: 'pending_review', current_step: 5, submitted_at: new Date().toISOString()
      }).eq('id', onboardingId);
      if (error) throw error;
      setStep(6); // Success
      window.scrollTo(0, 0);
    } catch (e) {
      showAlert('Error al enviar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const getSvcDesc = (n) => ({
    'Contabilidad': 'Cierre mensual, conciliaciones, estados financieros y tributarios.',
    'Nómina': 'Procesamiento de nómina, seguridad social y PILA.',
    'Controller': 'Análisis financiero, presupuesto e informes gerenciales.',
    'Facturación y cobranza': 'Facturación electrónica, cartera y cobros.',
  }[n] || 'Servicio especializado de back office empresarial.');

  const ICONS_POL = { terms_of_service: '📋', privacy_policy: '🔒', data_processing: '✍️', sarlaft: '🛡️' };
  const COLORS_POL = { terms_of_service: '#fef9ec', privacy_policy: '#e8f4fd', data_processing: '#f0fdf4', sarlaft: '#fdf2f2' };

  if (blockedStatus) {
    const cfg = {
      pending_review: { ico: '⏳', titulo: 'Solicitud en revisión', msg: 'Su solicitud está siendo revisada por el equipo RS Back Office. Le notificaremos por correo en máximo 2 días hábiles.' },
      approved: { ico: '✅', titulo: 'Solicitud aprobada', msg: 'Su vinculación fue aprobada. Revise su correo para encontrar las credenciales de acceso al portal.' },
      needs_correction: { ico: '⚠️', titulo: 'Se requieren correcciones', msg: 'Su solicitud requiere ajustes. Revise el correo que le enviamos con las instrucciones específicas.' },
    };
    const c = cfg[blockedStatus] || { ico: 'ℹ️', titulo: 'Solicitud registrada', msg: 'Ya existe una solicitud activa.' };
    return (
      <div className={styles.shell}>
        <div className={styles.main} style={{ justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center', maxWidth: 460 }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{c.ico}</div>
            <div style={{ fontFamily: 'var(--fd)', fontSize: '1.8rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '.75rem' }}>{c.titulo}</div>
            <div style={{ fontSize: '.85rem', color: 'var(--g500)', lineHeight: 1.7, marginBottom: '2rem' }}>{c.msg}</div>
            <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', padding: '.68rem 1.4rem', background: 'var(--ink)', color: 'var(--gold-l)', borderRadius: 'var(--r)', fontSize: '.82rem', fontWeight: 500, textDecoration: 'none' }}>Ingresar al portal →</Link>
              <a href="https://wa.me/573102170905" style={{ display: 'inline-flex', alignItems: 'center', padding: '.68rem 1.4rem', background: 'transparent', color: 'var(--g500)', border: '1px solid var(--g200)', borderRadius: 'var(--r)', fontSize: '.82rem', textDecoration: 'none' }}>Contactar soporte</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <div className={styles.sideInner}>
          <div className={styles.brand}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '.75rem', textDecoration: 'none' }}>
              <div className={styles.brandMark}>RS</div>
              <div className={styles.brandTxt}><strong>RS Back Office</strong><span>Proceso de vinculación</span></div>
            </Link>
          </div>
          <div className={styles.stepsNav}>
            {[
              { n: 1, lbl: 'Datos de empresa', dsc: 'Información básica del negocio' },
              { n: 2, lbl: 'Servicios', dsc: 'Selecciona los módulos' },
              { n: 3, lbl: 'Políticas', dsc: 'Términos y privacidad' },
              { n: 4, lbl: 'KYC / Documentos', dsc: 'RUT, cédula y SARLAFT' },
              { n: 5, lbl: 'Confirmación', dsc: 'Revisa y envía tu solicitud' },
            ].map((s) => (
              <div key={s.n} className={`${styles.stepItem} ${step === s.n ? styles.active : ''} ${step > s.n || step === 6 ? styles.done : ''}`}>
                <div className={styles.stepNum}>{s.n}</div>
                <div className={styles.stepTxt}>
                  <div className={styles.stepLabel}>{s.lbl}</div>
                  <div className={styles.stepDesc}>{s.dsc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.sideFoot}>
            <p>¿Tienes cuenta? <Link to="/login">Ingresar →</Link><br />¿Necesitas ayuda? <a href="https://wa.me/573102170905" target="_blank" rel="noreferrer">Escríbenos</a></p>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.tbBc}>RS Back Office / <span>{STEP_LABELS[step === 6 ? 5 : step]}</span></div>
          <div className={styles.tbRight}>
            <div className={styles.progressTxt}>{step === 6 ? 'Completado' : `Paso ${step} de 5`}</div>
            <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${step === 6 ? 100 : (step / 5) * 100}%` }}></div></div>
          </div>
        </div>

        <div className={styles.contentArea}>
          <div className={`${styles.alert} ${alert.show ? styles.on : ''} ${alert.type === 'err' ? styles.alertErr : styles.alertInfo}`}>
            <span>{alert.type === 'err' ? '⚠️' : 'ℹ️'}</span>
            <span>{alert.msg}</span>
          </div>

          {/* PASO 1 */}
          <div className={`${styles.stepPanel} ${step === 1 ? styles.active : ''}`}>
            <div className={styles.stepHeader}>
              <div className={styles.stepTag}>Paso 1 de 5</div>
              <div className={styles.stepTitle}>Datos de su empresa</div>
              <div className={styles.stepSub}>Ingrese la información básica de su empresa y del representante legal.</div>
            </div>
            <div className={styles.formGrid} style={{ gridTemplateColumns: '1fr', marginBottom: '.75rem' }}>
              <div style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--g400)', letterSpacing: '.1em', textTransform: 'uppercase', padding: '.4rem 0', borderBottom: '1px solid var(--g200)' }}>Información de la empresa</div>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.field}><label>Razón social <span className={styles.req}>*</span></label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre S.A.S." /></div>
              <div className={styles.field}><label>NIT <span className={styles.req}>*</span></label><input type="text" value={form.nit} onChange={e => setForm({ ...form, nit: e.target.value })} placeholder="900.123.456-7" /></div>
            </div>
            <div className={styles.formGrid} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div className={styles.field}><label>Tipo <span className={styles.req}>*</span></label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={form.type ? styles.filled : ''}><option value="">Seleccionar…</option><option value="SAS">S.A.S.</option><option value="LTDA">Ltda.</option><option value="SA">S.A.</option><option value="persona_natural">Persona Natural</option><option value="otro">Otro</option></select></div>
              <div className={styles.field}><label>Sector</label><select value={form.sector} onChange={e => setForm({ ...form, sector: e.target.value })} className={form.sector ? styles.filled : ''}><option value="">Seleccionar…</option><option value="comercio">Comercio</option><option value="servicios">Servicios</option><option value="manufactura">Manufactura</option><option value="construccion">Construcción</option><option value="tecnologia">Tecnología</option><option value="otro">Otro</option></select></div>
              <div className={styles.field}><label>Ciudad <span className={styles.req}>*</span></label><input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Bogotá" /></div>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.field}><label>Dirección</label><input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Calle 100 # 15-20" /></div>
              <div className={styles.field}><label>Teléfono</label><input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+57 601..." /></div>
            </div>
            <div className={styles.formGrid} style={{ gridTemplateColumns: '1fr', marginTop: '.5rem' }}>
              <div className={styles.field}><label>Sitio web</label><input type="url" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://..." /></div>
            </div>

            <div className={styles.formGrid} style={{ gridTemplateColumns: '1fr', marginTop: '1.25rem' }}>
              <div style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--g400)', letterSpacing: '.1em', textTransform: 'uppercase', padding: '.4rem 0', borderBottom: '1px solid var(--g200)' }}>Representante legal</div>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.field}><label>Nombre completo <span className={styles.req}>*</span></label><input type="text" value={form.repName} onChange={e => setForm({ ...form, repName: e.target.value })} /></div>
              <div className={styles.field}><label>Cédula <span className={styles.req}>*</span></label><input type="text" value={form.repCedula} onChange={e => setForm({ ...form, repCedula: e.target.value })} /></div>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.field}><label>Correo electrónico <span className={styles.req}>*</span></label><input type="email" value={form.repEmail} onChange={e => setForm({ ...form, repEmail: e.target.value })} /><div className={styles.fieldHint}>Será su usuario de acceso</div></div>
              <div className={styles.field}><label>Teléfono móvil <span className={styles.req}>*</span></label><input type="tel" value={form.repPhone} onChange={e => setForm({ ...form, repPhone: e.target.value })} /></div>
            </div>
            <div className={styles.formGrid} style={{ gridTemplateColumns: '1fr' }}>
              <div className={styles.field}><label>Cargo</label><input type="text" value={form.repPosition} onChange={e => setForm({ ...form, repPosition: e.target.value })} placeholder="Gerente General" /></div>
            </div>
            <div className={styles.navRow}><div></div><button className={styles.btnNext} onClick={goStep2} disabled={loading}>{loading ? 'Guardando...' : 'Continuar → Servicios'}</button></div>
          </div>

          {/* PASO 2 */}
          <div className={`${styles.stepPanel} ${step === 2 ? styles.active : ''}`}>
            <div className={styles.stepHeader}><div className={styles.stepTag}>Paso 2 de 5</div><div className={styles.stepTitle}>Seleccione sus servicios</div><div className={styles.stepSub}>Escoja uno o más módulos según las necesidades de su empresa.</div></div>
            <div className={styles.servicesGrid}>
              {servicesLoading ? (
                <><div className={styles.sk} style={{ height: 130, borderRadius: 14 }}></div><div className={styles.sk} style={{ height: 130, borderRadius: 14 }}></div></>
              ) : services.map(s => {
                const ic = SERVICE_ICONS[s.name] || { ico: '⚙️', bg: 'var(--g100)' };
                return (
                  <div key={s.id} className={`${styles.svcCard} ${s.selected ? styles.selected : ''}`} onClick={() => toggleService(s.id)}>
                    <div className={styles.svcIco} style={{ background: ic.bg }}>{ic.ico}</div>
                    <div className={styles.svcName}>{s.name}</div>
                    <div className={styles.svcDesc}>{getSvcDesc(s.name)}</div>
                  </div>
                );
              })}
            </div>
            <div className={styles.navRow}><button className={styles.btnBack} onClick={() => setStep(1)}>← Volver</button><button className={styles.btnNext} onClick={goStep3} disabled={loading}>{loading ? 'Guardando...' : 'Continuar → Políticas'}</button></div>
          </div>

          {/* PASO 3 */}
          <div className={`${styles.stepPanel} ${step === 3 ? styles.active : ''}`}>
            <div className={styles.stepHeader}><div className={styles.stepTag}>Paso 3 de 5</div><div className={styles.stepTitle}>Políticas y autorizaciones</div><div className={styles.stepSub}>Lea cada política y confirme su aceptación. Queda registrada con fecha y hora.</div></div>
            <div>
              {policiesLoading ? (
                <div className={styles.sk} style={{ height: 70, borderRadius: 10 }}></div>
              ) : policies.map(p => (
                <div key={p.id} className={`${styles.policyBlock} ${openPolicies[p.id] ? styles.open : ''}`}>
                  <div className={styles.policyHead} onClick={() => togglePolicyOpen(p.id)}>
                    <div className={styles.policyHeadLeft}>
                      <div className={styles.policyIco} style={{ background: COLORS_POL[p.policy_type] || 'var(--g100)' }}>{ICONS_POL[p.policy_type] || '📄'}</div>
                      <div><div className={styles.policyName}>{p.title}</div><div className={styles.policyVersion}>v{p.version} · Activa</div></div>
                    </div>
                    <div className={styles.policyChevron}>▾</div>
                  </div>
                  <div className={styles.policyContent}>{p.content}</div>
                  <div className={styles.policyAccept}>
                    <div className={`${styles.policyChk} ${p.accepted ? styles.on : ''}`} onClick={() => togglePolicyAccept(p.id)}>{p.accepted ? '✓' : ''}</div>
                    <div className={styles.policyAcceptTxt} onClick={() => togglePolicyAccept(p.id)}>He leído y acepto <strong>{p.title}</strong></div>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.navRow}><button className={styles.btnBack} onClick={() => setStep(2)}>← Volver</button><button className={styles.btnNext} onClick={goStep4} disabled={loading}>{loading ? 'Registrando...' : 'Continuar → KYC'}</button></div>
          </div>

          {/* PASO 4 */}
          <div className={`${styles.stepPanel} ${step === 4 ? styles.active : ''}`}>
            <div className={styles.stepHeader}><div className={styles.stepTag}>Paso 4 de 5</div><div className={styles.stepTitle}>Documentos de vinculación</div><div className={styles.stepSub}>Suba los documentos requeridos en PDF o imagen. Máx. 10 MB por archivo.</div></div>

            <div className={styles.docHeader}><div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--ink)' }}>📄 RUT de la empresa</div><div className={styles.docReq}>Requerido</div></div>
            <div className={`${styles.docUploadArea} ${docs.rut.file ? styles.hasFile : ''}`}>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => handleFile('rut', e)} />
              <div className={styles.docUploadIcon}>📋</div>
              <div className={styles.docUploadLabel}>{docs.rut.file ? `${docs.rut.file.name}` : 'Subir RUT'}</div>
              <div className={styles.docUploadSub}>{docs.rut.file ? `${formatBytes(docs.rut.file.size)} · Listo para subir` : 'PDF o imagen · Máx. 10 MB'}</div>
            </div>

            <div className={styles.docHeader} style={{ marginTop: '1rem' }}><div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--ink)' }}>🪪 Cédula del representante</div><div className={styles.docReq}>Requerido</div></div>
            <div className={`${styles.docUploadArea} ${docs.cedula.file ? styles.hasFile : ''}`}>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => handleFile('cedula', e)} />
              <div className={styles.docUploadIcon}>🪪</div>
              <div className={styles.docUploadLabel}>{docs.cedula.file ? `${docs.cedula.file.name}` : 'Subir cédula (ambas caras)'}</div>
              <div className={styles.docUploadSub}>{docs.cedula.file ? `${formatBytes(docs.cedula.file.size)} · Listo para subir` : 'PDF o imagen · Máx. 10 MB'}</div>
            </div>

            <div className={styles.docHeader} style={{ marginTop: '1rem' }}><div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--ink)' }}>🛡️ Formulario SARLAFT</div><div className={styles.docReq}>Requerido</div></div>
            <div style={{ background: 'var(--info-bg)', border: '1px solid rgba(36,113,163,.2)', borderRadius: 'var(--r)', padding: '.75rem 1rem', marginBottom: '.65rem', fontSize: '.76rem', color: 'var(--info)', lineHeight: 1.6 }}>📎 Descargue, diligencie y firme el formulario SARLAFT antes de subirlo. <a href="#" style={{ color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>Descargar formulario →</a></div>
            <div className={`${styles.docUploadArea} ${docs.sarlaft.file ? styles.hasFile : ''}`}>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => handleFile('sarlaft', e)} />
              <div className={styles.docUploadIcon}>🛡️</div>
              <div className={styles.docUploadLabel}>{docs.sarlaft.file ? `${docs.sarlaft.file.name}` : 'Subir formulario SARLAFT firmado'}</div>
              <div className={styles.docUploadSub}>{docs.sarlaft.file ? `${formatBytes(docs.sarlaft.file.size)} · Listo para subir` : 'PDF o imagen · Máx. 10 MB'}</div>
            </div>

            <div className={styles.navRow}><button className={styles.btnBack} onClick={() => setStep(3)}>← Volver</button><button className={styles.btnNext} onClick={goStep5} disabled={loading}>{loading ? 'Subiendo...' : 'Continuar → Confirmación'}</button></div>
          </div>

          {/* PASO 5 */}
          <div className={`${styles.stepPanel} ${step === 5 ? styles.active : ''}`}>
            <div className={styles.stepHeader}><div className={styles.stepTag}>Paso 5 de 5</div><div className={styles.stepTitle}>Revise y confirme</div><div className={styles.stepSub}>Verifique que toda la información sea correcta antes de enviar.</div></div>

            <div className={styles.confirmCard}>
              <div className={styles.confirmTitle}>🏢 Datos de la empresa</div>
              <div className={styles.confirmRow}><span className={styles.confirmLbl}>Razón social</span><span className={styles.confirmVal}>{form.name || '—'}</span></div>
              <div className={styles.confirmRow}><span className={styles.confirmLbl}>NIT</span><span className={styles.confirmVal}>{form.nit || '—'}</span></div>
              <div className={styles.confirmRow}><span className={styles.confirmLbl}>Tipo</span><span className={styles.confirmVal}>{form.type || '—'}</span></div>
              <div className={styles.confirmRow}><span className={styles.confirmLbl}>Ciudad</span><span className={styles.confirmVal}>{form.city || '—'}</span></div>
              <div className={styles.confirmRow}><span className={styles.confirmLbl}>Representante</span><span className={styles.confirmVal}>{form.repName || '—'}</span></div>
              <div className={styles.confirmRow}><span className={styles.confirmLbl}>Correo</span><span className={styles.confirmVal}>{form.repEmail || '—'}</span></div>
            </div>

            <div className={styles.confirmCard}>
              <div className={styles.confirmTitle}>⚙️ Servicios seleccionados</div>
              <div className={styles.confirmRow}>
                <span className={styles.confirmLbl}>Módulos</span>
                <div className={styles.svcTags}>
                  {services.filter(s => s.selected).length ? services.filter(s => s.selected).map(s => <span key={s.id} className={styles.svcTag}>{s.name}</span>) : '—'}
                </div>
              </div>
            </div>

            <div className={styles.confirmCard}>
              <div className={styles.confirmTitle}>✅ Políticas aceptadas</div>
              {policies.filter(p => p.accepted).map(p => (
                <div key={p.id} className={styles.confirmRow}>
                  <span className={styles.confirmLbl} style={{ fontSize: '.72rem' }}>{p.title}</span>
                  <span className={styles.confirmVal} style={{ color: 'var(--ok)', fontSize: '.75rem' }}>✓ v{p.version}</span>
                </div>
              ))}
            </div>

            <div className={styles.confirmCard}>
              <div className={styles.confirmTitle}>📁 Documentos cargados</div>
              <div className={styles.confirmRow}><span className={styles.confirmLbl}>RUT</span><span className={styles.confirmVal}>{docs.rut.file ? `✓ ${docs.rut.file.name}` : '—'}</span></div>
              <div className={styles.confirmRow}><span className={styles.confirmLbl}>Cédula rep. legal</span><span className={styles.confirmVal}>{docs.cedula.file ? `✓ ${docs.cedula.file.name}` : '—'}</span></div>
              <div className={styles.confirmRow}><span className={styles.confirmLbl}>SARLAFT</span><span className={styles.confirmVal}>{docs.sarlaft.file ? `✓ ${docs.sarlaft.file.name}` : '—'}</span></div>
            </div>

            <div className={styles.navRow}><button className={styles.btnBack} onClick={() => setStep(4)}>← Volver</button><button className={styles.btnNext} onClick={submitOnboarding} disabled={loading}>{loading ? 'Enviando...' : '🚀 Enviar solicitud'}</button></div>
          </div>

          {/* ÉXITO */}
          <div className={`${styles.stepPanel} ${step === 6 ? styles.active : ''}`}>
            <div className={styles.successScreen}>
              <div className={styles.successIcon}>✅</div>
              <div className={styles.successTitle}>¡Solicitud enviada!</div>
              <div className={styles.successSub}>Hemos recibido su solicitud. Nuestro equipo la revisará en <strong>máximo 2 días hábiles</strong>.</div>
              <div className={styles.nextSteps}>
                <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--g400)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '.75rem' }}>¿Qué sigue?</div>
                <div className={styles.nextStepItem}><div className={styles.nsNum}>1</div><div className={styles.nsTxt}><strong>Revisión de documentos</strong>Verificaremos RUT, cédula y SARLAFT.</div></div>
                <div className={styles.nextStepItem}><div className={styles.nsNum}>2</div><div className={styles.nsTxt}><strong>Notificación por email</strong>Le avisaremos al correo registrado.</div></div>
                <div className={styles.nextStepItem}><div className={styles.nsNum}>3</div><div className={styles.nsTxt}><strong>Activación del portal</strong>Recibirá sus credenciales una vez aprobado.</div></div>
              </div>
              <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', padding: '.62rem 1.2rem', background: 'var(--ink)', color: 'var(--gold-l)', borderRadius: 'var(--r)', fontSize: '.8rem', fontWeight: 500, textDecoration: 'none', marginTop: '2rem' }}>← Volver al inicio</Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
