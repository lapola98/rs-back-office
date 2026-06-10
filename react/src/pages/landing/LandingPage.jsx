import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './LandingPage.module.css';

const SERVICES = [
  {
    num: '01', icon: '📊', title: 'Contabilidad e impuestos',
    desc: 'Gestión contable integral bajo NIIF y normativa colombiana vigente. Información financiera precisa y oportuna para la toma de decisiones.',
    features: ['Registro y causación de movimientos', 'Estados financieros mensuales', 'Conciliaciones bancarias', 'Declaraciones tributarias (IVA, Renta, ICA)', 'Libros oficiales y auxiliares'],
  },
  {
    num: '02', icon: '🏦', title: 'Controller financiero y Tesorería',
    desc: 'Control del flujo de caja, pagos y recaudos con visibilidad en tiempo real. Optimizamos la liquidez de su empresa.',
    features: ['Planeación financiera', 'Flujo de caja proyectado', 'Gestión bancaria', 'Reportes financieros', 'Reportes y Dashboard en línea'],
  },
  {
    num: '03', icon: '🧾', title: 'Facturación y recaudo',
    desc: 'Emisión y gestión de factura electrónica conforme a los requisitos de la DIAN. Procesos ágiles y sin errores.',
    features: ['Facturación masiva y programada', 'Notas crédito y débito', 'Gestión de cobro preventivo y activo', 'Ageing de cartera (antigüedad)', 'Reportes y Dashboard en línea'],
  },
  {
    num: '05', icon: '👥', title: 'Gestión de Personal y compras',
    desc: 'Nómina, seguridad social y bienestar laboral. Cumplimos con toda la normativa laboral colombiana de manera eficiente.',
    features: ['Vinculaciones y desvinculaciones', 'Evaluaciones de desempeño', 'Contratos, novedades y certificados', 'Compras de oficina y suministros', 'Reportes y dashboard en línea'],
  },
];

const FEATURES = [
  { icon: '⚡', title: 'Información actualizada al instante', desc: 'Los datos de su empresa se reflejan en el portal en tiempo real. Sin esperas, sin versiones desactualizadas.' },
  { icon: '🛡️', title: 'Seguridad de nivel bancario', desc: 'Cifrado SSL, autenticación de dos factores y copias de seguridad automáticas diarias.' },
  { icon: '📱', title: 'Acceso desde cualquier dispositivo', desc: 'Portal responsivo optimizado para computador, tableta y móvil. Su información siempre disponible.' },
  { icon: '🔗', title: 'Integración con su ERP', desc: 'Conectamos con los principales sistemas contables y ERP del mercado colombiano sin fricciones.' },
  { icon: '📋', title: 'Reportes personalizados', desc: 'Genere informes a la medida de su empresa: por período, área, proyecto o centro de costos.' },
  { icon: '🎯', title: 'Soporte dedicado', desc: 'Un equipo especializado asignado a su empresa, con tiempos de respuesta garantizados por SLA.' },
];

const PORTAL_FEATURES = [
  { icon: '📈', title: 'Dashboard en tiempo real', desc: 'Indicadores clave de su empresa actualizados al instante: flujo de caja, cartera, nómina y más.' },
  { icon: '🔒', title: 'Acceso seguro por roles', desc: 'Administre los permisos de su equipo. Cada usuario ve solo la información que le corresponde.' },
  { icon: '📥', title: 'Descarga de documentos', desc: 'Facturas, comprobantes, informes y certificados disponibles para descarga en cualquier momento.' },
];

// Hook for IntersectionObserver animation
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add(styles.visible); }),
      { threshold: 0.1 }
    );
    el.querySelectorAll(`.${styles.serviceCard},.${styles.featureItem},.${styles.step}`).forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  return ref;
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const contentRef = useReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={contentRef}>
      {/* ─── NAV ─── */}
      <nav className={`${styles.nav} ${scrolled ? styles.navScrolled : ''}`}>
        <a href="#inicio" className={styles.logo}>
          <div className={styles.logoMark}>RS</div>
          <div className={styles.logoText}>
            <strong>RS Back Office</strong>
            <span>Gestión Empresarial</span>
          </div>
        </a>
        <div className={styles.navLinks}>
          <a href="#servicios">Servicios</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#caracteristicas">Plataforma</a>
          <a href="#contacto">Contacto</a>
          <Link to="/onboarding" className={styles.navRegister}>Registrarse</Link>
          <Link to="/login" className={styles.btnNav}>Acceder al Portal</Link>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className={styles.hero} id="inicio">
        <div className={styles.heroContent}>
          <div className={styles.heroTag}>
            <span className={styles.heroTagDot}></span>
            Gestión empresarial profesional
          </div>
          <h1 className={styles.heroH1}>
            Su negocio, <em>organizado<br />con precisión.</em>
          </h1>
          <p className={styles.heroP}>
            Soluciones integrales de back office para empresas que exigen excelencia. Contabilidad, finanzas, tesorería, facturación, cartera y gestión de personal, todo en una sola plataforma.
          </p>
          <div className={styles.heroActions}>
            <Link to="/login" className={styles.btnPrimary}>Acceder al Portal →</Link>
            <Link to="/onboarding" className={`${styles.btnPrimary} ${styles.btnPrimaryGold}`}>Empieza ahora →</Link>
            <a href="#servicios" className={styles.btnSecondary}>Ver Servicios</a>
          </div>
          <div className={styles.heroStats}>
            <div><span className={styles.statNum}>+5</span><span className={styles.statLabel}>Empresas activas</span></div>
            <div><span className={styles.statNum}>14+</span><span className={styles.statLabel}>Meses en el mercado</span></div>
            <div><span className={styles.statNum}>99%</span><span className={styles.statLabel}>Satisfacción clientes</span></div>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div style={{ position: 'relative' }}>
            <div className={styles.dashboardCard}>
              <div className={styles.dcHeader}>
                <span className={styles.dcTitle}>DASHBOARD CLIENTE</span>
                <span className={styles.dcBadge}>● En vivo</span>
              </div>
              <div className={styles.dcMetrics}>
                {[['$84.2M','Facturación','↑ 12.4%'],['$21.7M','Cartera','↑ 8.1%'],['97.3%','Tesorería','↑ 3.2%'],['48','Personal','Activos']].map(([val,key,up]) => (
                  <div key={key} className={styles.dcMetric}>
                    <span className={styles.dcMetricVal}>{val}</span>
                    <span className={styles.dcMetricKey}>{key}</span>
                    <span className={styles.dcMetricUp}>{up}</span>
                  </div>
                ))}
              </div>
              <div className={styles.dcChart}>
                <svg viewBox="0 0 340 70" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c9a84c" stopOpacity="0.25"/>
                      <stop offset="100%" stopColor="#c9a84c" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  <path d="M0,55 L28,48 L56,52 L85,38 L113,42 L141,28 L170,32 L198,18 L226,22 L255,12 L283,16 L340,8 L340,70 L0,70 Z" fill="url(#chartGrad)"/>
                  <path d="M0,55 L28,48 L56,52 L85,38 L113,42 L141,28 L170,32 L198,18 L226,22 L255,12 L283,16 L340,8" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                {[['#c9a84c','Facturas del mes','142','Al día','statusOk'],['#1a3a5c','Nómina procesada','Jun 2025','✓','statusOk'],['#e8c97a','Obligaciones fiscales','2 pend.','Revisar','statusPend']].map(([color,name,val,status,cls]) => (
                  <div key={name} className={styles.dcItem}>
                    <div className={styles.dcDot} style={{ background: color }}></div>
                    <span className={styles.dcItemName}>{name}</span>
                    <span className={styles.dcItemVal}>{val}</span>
                    <span className={`${styles.dcItemStatus} ${styles[cls]}`}>{status}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${styles.floatCard} ${styles.floatCard1}`}>
              <div className={styles.fcLabel}>Saldo disponible</div>
              <div className={styles.fcVal}>$12.4M</div>
              <div className={styles.fcSub}>↑ COP +2.1% este mes</div>
            </div>
            <div className={`${styles.floatCard} ${styles.floatCard2}`}>
              <div className={styles.fcLabel}>Próximo cierre</div>
              <div className={styles.fcVal}>30 Jun</div>
              <div className={styles.fcSub}>● 4 días restantes</div>
            </div>
          </div>
        </div>
        <div className={styles.heroGridBg}></div>
      </section>

      {/* ─── SERVICIOS ─── */}
      <section className={`${styles.section} ${styles.sectionWhite}`} id="servicios">
        <div className={styles.servicesHeader}>
          <div className={styles.sectionTag}>Lo que ofrecemos</div>
          <h2 className={styles.sectionTitle}>Servicios <em>especializados</em></h2>
          <p className={styles.sectionSub}>Cubrimos todas las áreas administrativas y financieras de su empresa con equipos expertos y tecnología de punta.</p>
        </div>
        <div className={styles.servicesGrid}>
          {SERVICES.map((s) => (
            <div key={s.num} className={styles.serviceCard}>
              <span className={styles.serviceNum}>{s.num}</span>
              <div className={styles.serviceIcon}>{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              <ul className={styles.serviceFeatures}>
                {s.features.map(f => <li key={f}>{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CÓMO FUNCIONA ─── */}
      <section className={`${styles.section} ${styles.sectionDark}`} id="como-funciona">
        <div className={styles.sectionTag}>Proceso</div>
        <h2 className={styles.sectionTitle}>Así trabajamos <em>con usted</em></h2>
        <p className={styles.sectionSub}>Un proceso transparente y estructurado desde el primer día.</p>
        <div className={styles.steps}>
          {[
            { n: '01', title: 'Diagnóstico inicial', desc: 'Analizamos el estado actual de su empresa, sus necesidades específicas y definimos el alcance del servicio.' },
            { n: '02', title: 'Configuración del portal', desc: 'Creamos su portal personalizado con acceso seguro para todos los usuarios autorizados de su organización.' },
            { n: '03', title: 'Operación continua', desc: 'Nuestros equipos especializados gestionan cada área con reportes y entregables definidos mes a mes.' },
            { n: '04', title: 'Reporte y seguimiento', desc: 'Usted consulta su información en tiempo real desde el dashboard y recibe informes ejecutivos periódicos.' },
          ].map(s => (
            <div key={s.n} className={styles.step}>
              <div className={styles.stepNum}>{s.n}</div>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── PORTAL ─── */}
      <section className={styles.sectionPortal} id="portal">
        <div className={styles.portalVisual}>
          <div className={styles.loginCard}>
            <div className={styles.loginLogo}>
              <div className={styles.loginLogoMark}>RS</div>
              <span>RS Back Office</span>
            </div>
            <h3>Bienvenido de vuelta</h3>
            <p>Ingrese a su portal empresarial</p>
            <div className={styles.formField}>
              <label>Correo electrónico</label>
              <input type="email" placeholder="empresa@correo.com" readOnly />
            </div>
            <div className={styles.formField}>
              <label>Contraseña</label>
              <input type="password" placeholder="••••••••" readOnly />
            </div>
            <div className={styles.formOptions}>
              <label className={styles.formCheck}><input type="checkbox" /> Recordarme</label>
              <a href="#" className={styles.formLink}>¿Olvidó su contraseña?</a>
            </div>
            <Link to="/login" className={styles.btnLogin}>Ingresar al Portal →</Link>
            <div className={styles.loginFooter}>
              <p>¿No tiene cuenta? <Link to="/onboarding">Solicite acceso</Link></p>
            </div>
          </div>
          <div className={styles.modulesPreview}>
            {['Dashboard general','Mis facturas','Estado de nómina','Cartera y cobros'].map(m => (
              <div key={m} className={styles.moduleChip}><span className={styles.chipDot}></span>{m}</div>
            ))}
          </div>
        </div>
        <div>
          <div className={styles.sectionTag}>Portal del cliente</div>
          <h2 className={styles.sectionTitle}>Todo su negocio<br />en <em>un solo lugar</em></h2>
          <p className={styles.sectionSub}>Acceda a su información financiera y administrativa desde cualquier dispositivo, en tiempo real y con total seguridad.</p>
          <div style={{ marginTop: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {PORTAL_FEATURES.map(f => (
              <div key={f.title} className={styles.featureItem} style={{ background: 'var(--white)' }}>
                <div className={styles.featureIcon}>{f.icon}</div>
                <div><h4>{f.title}</h4><p>{f.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CARACTERÍSTICAS ─── */}
      <section className={`${styles.section} ${styles.sectionWhite}`} id="caracteristicas">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'start' }}>
          <div>
            <div className={styles.sectionTag}>Plataforma</div>
            <h2 className={styles.sectionTitle}>Tecnología al<br />servicio de su <em>empresa</em></h2>
            <p className={styles.sectionSub}>Nuestra plataforma está diseñada para empresas que no pueden permitirse errores ni retrasos en su información.</p>
          </div>
          <div></div>
        </div>
        <div className={styles.featuresGrid}>
          {FEATURES.map(f => (
            <div key={f.title} className={styles.featureItem}>
              <div className={styles.featureIcon}>{f.icon}</div>
              <div><h4>{f.title}</h4><p>{f.desc}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className={`${styles.section} ${styles.sectionCta}`} id="contacto">
        <div className={styles.sectionTag}>Comience hoy</div>
        <h2 className={styles.sectionTitle}>¿Listo para ordenar<br />el back office de <em>su empresa?</em></h2>
        <p className={styles.sectionSub}>Contáctenos y en menos de 48 horas tendrá una propuesta personalizada para su negocio.</p>
        <div className={styles.ctaActions}>
          <Link to="/onboarding" className={`${styles.btnPrimary} ${styles.btnPrimaryGold}`}>Registrar mi empresa →</Link>
          <a href="tel:+576012345678" className={`${styles.btnSecondary} ${styles.btnSecondaryLight}`}>📞 Llamar ahora</a>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <a href="#inicio" className={styles.logo}>
              <div className={`${styles.logoMark} ${styles.footerLogoMark}`}>RS</div>
              <div className={`${styles.logoText} ${styles.footerLogoText}`}>
                <strong>RS Back Office</strong>
                <span>Gestión Empresarial</span>
              </div>
            </a>
            <p>Soluciones integrales de back office para empresas colombianas. Confianza, precisión y tecnología al servicio de su crecimiento.</p>
          </div>
          <div className={styles.footerCol}>
            <h5>Servicios</h5>
            {['Contabilidad','Tesorería','Facturación','Cartera','Gestión de Personal'].map(l => <a key={l} href="#">{l}</a>)}
          </div>
          <div className={styles.footerCol}>
            <h5>Portal</h5>
            {['Acceder','Solicitar acceso','Soporte técnico','Manual de usuario'].map(l => <a key={l} href="#">{l}</a>)}
          </div>
          <div className={styles.footerCol}>
            <h5>Empresa</h5>
            {['Nosotros','Equipo','Contacto','Política de privacidad'].map(l => <a key={l} href="#">{l}</a>)}
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p>© 2025 RS Back Office. Todos los derechos reservados.</p>
          <p>Bogotá, Colombia · info@rsbackoffice.com</p>
        </div>
      </footer>
    </div>
  );
}
