import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// Asegúrate de tener este archivo creado según la guía anterior
import { supabase } from '../../lib/supabaseClient';
import { useSEO } from '../../hooks/useSEO';
import styles from './AuthPages.module.css';

export default function LoginPage() {
  useSEO({
    title: 'Iniciar Sesión',
    description: 'Ingresa a tu cuenta de RS Back Office para gestionar las finanzas de tu empresa.',
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Estado de errores individuales
  const [emailError, setEmailError] = useState('');
  const [passError, setPassError] = useState('');

  // Alerta global del formulario
  const [formError, setFormError] = useState('');

  // Modal de reset de contraseña
  const [showModal, setShowModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Toast (notificaciones)
  const [toast, setToast] = useState({ show: false, msg: '', type: 'ok' });

  const navigate = useNavigate();

  // Función para mapear errores de Supabase al español
  const mapError = (err) => {
    const m = err.message?.toLowerCase() || '';
    if (m.includes('invalid login credentials') || m.includes('invalid_credentials'))
      return 'Correo o contraseña incorrectos. Verifica tus datos.';
    if (m.includes('email not confirmed'))
      return 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.';
    if (m.includes('too many requests') || m.includes('rate limit'))
      return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
    if (m.includes('user not found'))
      return 'No existe una cuenta con este correo.';
    if (m.includes('network') || m.includes('fetch'))
      return 'Error de conexión. Verifica tu internet.';
    return `Error: ${err.message}`;
  };

  const showToastMsg = (msg, type = 'ok') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'ok' }), 4000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setFormError('');
    setEmailError('');
    setPassError('');

    // Validaciones locales
    let ok = true;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Ingresa un correo electrónico válido.');
      ok = false;
    }
    if (!password) {
      setPassError('Ingresa tu contraseña.');
      ok = false;
    }
    if (!ok) return;

    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (authError) {
        setFormError(mapError(authError));
        setLoading(false);
        return;
      }

      showToastMsg('Bienvenido. Redirigiendo…', 'ok');

      // Obtener rol
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      const role = profile?.role || data.user.user_metadata?.role || 'client_user';
      const ADMIN_ROLES = ['admin', 'rs_staff', 'rs_admin'];

      setTimeout(() => {
        if (ADMIN_ROLES.includes(role)) {
          navigate('/admin/dashboard');
        } else {
          navigate('/dashboard');
        }
      }, 900);

    } catch (err) {
      setFormError('Error: ' + err.message);
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      showToastMsg('Ingresa un correo válido', 'err');
      return;
    }

    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim().toLowerCase(), {
        redirectTo: window.location.origin + '/reset-password',
      });

      if (error) {
        showToastMsg('No se pudo enviar el correo: ' + error.message, 'err');
      } else {
        showToastMsg(`Correo enviado a ${resetEmail}. Revisa tu bandeja.`, 'ok');
        setShowModal(false);
      }
    } catch (err) {
      showToastMsg('Error de conexión.', 'err');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
      {/* TOAST */}
      <div className={`${styles.toast} ${toast.show ? styles.toastShow : ''} ${toast.type === 'err' ? styles.toastErr : ''}`}>
        <span className={styles.toastIcon}>{toast.type === 'err' ? '⚠️' : '✅'}</span>
        <span>{toast.msg}</span>
        <button className={styles.toastClose} onClick={() => setToast({ show: false, msg: '', type: 'ok' })}>✕</button>
      </div>

      {/* MODAL RESET */}
      {showModal && (
        <div className={styles.modalOv} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className={styles.modal}>
            <h3>Recuperar contraseña</h3>
            <p>Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.</p>
            <div className={styles.fieldGroup}>
              <label>Correo electrónico</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>📧</span>
                <input
                  type="email"
                  placeholder="tu@empresa.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.modalRow}>
              <button className={styles.btnModalS} onClick={() => setShowModal(false)}>Cancelar</button>
              <button className={styles.btnModalP} onClick={handleResetPassword} disabled={resetLoading}>
                {resetLoading ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <div className={styles.wrap}>
        {/* PANEL IZQUIERDO */}
        <div className={styles.left}>
          <div className={styles.leftTop}>
            <Link to="/" className={styles.logo}>
              <div className={styles.logoMark}>RS</div>
              <div className={styles.logoText}>
                <strong>RS Back Office</strong>
                <span>Gestión empresarial</span>
              </div>
            </Link>
            <h1 className={styles.leftH}>Bienvenido<em>a su portal</em></h1>
            <p className={styles.leftDesc}>Acceda a toda la información financiera y administrativa de su empresa en un solo lugar, seguro y en tiempo real.</p>
            <ul className={styles.benefits}>
              <li>
                <div className={styles.bIcon}>📊</div>
                <div><strong>Dashboard en tiempo real</strong>KPIs, facturación, cartera y tesorería actualizados al instante.</div>
              </li>
              <li>
                <div className={styles.bIcon}>🔒</div>
                <div><strong>Acceso seguro por roles</strong>Cada usuario ve únicamente la información que le corresponde.</div>
              </li>
              <li>
                <div className={styles.bIcon}>📁</div>
                <div><strong>Documentos y reportes</strong>Descargue facturas, nóminas e informes desde cualquier dispositivo.</div>
              </li>
            </ul>
          </div>

          <div>
            <div className={styles.leftDiv}></div>
            <div className={styles.testimonial}>
              <p className={styles.tQuote}>RS Back Office transformó la manera en que gestionamos nuestra contabilidad. Tenemos visibilidad total y nunca más perdemos una fecha tributaria.</p>
              <div className={styles.tAuthor}>
                <div className={styles.tAv}>JR</div>
                <div>
                  <span className={styles.tName}>Jorge Rodríguez</span>
                  <span className={styles.tCo}>Constructora Bolívar S.A.S</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PANEL DERECHO (Formulario) */}
        <div className={styles.right}>
          <div className={styles.formWrap}>
            <div className={styles.secTag}>Acceso al portal</div>
            <h2 className={styles.formH}>Ingresar a<em>su cuenta</em></h2>
            <p className={styles.formDesc}>Digite sus credenciales para acceder al portal empresarial.</p>

            {formError && (
              <div className={styles.formAlert}>
                <span className={styles.faIco}>⚠️</span>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} noValidate>
              <div className={styles.fieldGroup}>
                <label htmlFor="email">Correo electrónico</label>
                <div className={`${styles.inputWrap} ${emailError ? styles.error : ''}`}>
                  <span className={styles.inputIcon}>📧</span>
                  <input
                    type="email"
                    id="email"
                    placeholder="correo@empresa.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(''); setFormError(''); }}
                  />
                </div>
                {emailError && <span className={styles.fieldError}>{emailError}</span>}
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="password">Contraseña</label>
                <div className={`${styles.inputWrap} ${passError ? styles.error : ''}`}>
                  <span className={styles.inputIcon}>🔑</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setPassError(''); setFormError(''); }}
                  />
                  <button
                    type="button"
                    className={styles.togglePass}
                    onClick={() => setShowPassword(!showPassword)}
                    title="Mostrar/ocultar contraseña"
                  >
                    {showPassword ? '🙈' : '👁'}
                  </button>
                </div>
                {passError && <span className={styles.fieldError}>{passError}</span>}
              </div>

              <div className={styles.formMeta}>
                <label className={styles.remember}>
                  <input type="checkbox" />
                  <span>Recordarme</span>
                </label>
                <button type="button" className={styles.forgot} onClick={() => setShowModal(true)}>
                  ¿Olvidó su contraseña?
                </button>
              </div>

              <button type="submit" className={styles.btnLogin} disabled={loading}>
                {!loading ? <span>Ingresar al portal</span> : <div className={styles.spinner}></div>}
              </button>
            </form>

            <div className={styles.formDiv}><span>¿Aún no tiene cuenta?</span></div>

            <Link to="/onboarding" className={styles.linkRegister}>
              Registrar mi empresa →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
