import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import styles from './AuthPages.module.css';

export default function SetPasswordPage() {
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [showPass1, setShowPass1] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionValid, setSessionValid] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSessionValid(false);
        setError('El enlace no es válido o ya expiró. Contacta al equipo RS.');
      }
    };
    checkSession();
  }, []);

  const reqLen = pass1.length >= 8;
  const reqUpper = /[A-Z]/.test(pass1);
  const reqNum = /[0-9]/.test(pass1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reqLen) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (!reqUpper) { setError('Debe incluir al menos una mayúscula.'); return; }
    if (!reqNum) { setError('Debe incluir al menos un número.'); return; }
    if (pass1 !== pass2) { setError('Las contraseñas no coinciden.'); return; }

    setError(null);
    setLoading(true);

    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ password: pass1 });
      if (updateError) throw updateError;
      
      const user = data.user;
      
      // Obtener rol
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const role = profile?.role || user.user_metadata?.role || 'client_user';
      const ADMIN_ROLES = ['admin', 'rs_staff', 'rs_admin'];

      setSuccess(true);
      setTimeout(() => {
        if (ADMIN_ROLES.includes(role)) {
          navigate('/admin/dashboard');
        } else {
          navigate('/dashboard');
        }
      }, 2500);
    } catch (e) {
      setError('Error al activar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.left}>
        <Link to="/" className={styles.logo}>
          <div className={styles.logoMark}>RS</div>
          <div className={styles.logoText}>
            <strong>RS Back Office</strong>
            <span>Gestión empresarial</span>
          </div>
        </Link>
        <div className={styles.leftBody}>
          <div className={styles.leftH}>Crea tu<em>contraseña</em></div>
          <p className={styles.leftP}>Bienvenido a RS Back Office. Define una contraseña segura para activar tu cuenta y acceder a tu portal.</p>
        </div>
        <div className={styles.leftFoot}>© 2025 RS Back Office · Bogotá, Colombia</div>
      </div>

      <div className={styles.right}>
        <div className={styles.formWrap}>
          {!success ? (
            <div id="formSection">
              <div className={styles.secTag}>Activación de cuenta</div>
              <h2 className={styles.formH}>Crea tu<em>contraseña</em></h2>
              <p className={styles.formDesc}>Ingresa y confirma tu nueva contraseña. Debe tener al menos 8 caracteres.</p>

              {error && <div className={`${styles.alert} ${styles.alertErr}`}><span>⚠️</span><span>{error}</span></div>}

              {sessionValid ? (
                <form onSubmit={handleSubmit}>
                  <div className={styles.fieldGroup}>
                    <label>Nueva contraseña</label>
                    <div className={styles.inputWrap}>
                      <span className={styles.inputIcon}>🔑</span>
                      <input type={showPass1 ? "text" : "password"} placeholder="Mínimo 8 caracteres" value={pass1} onChange={(e) => setPass1(e.target.value)} />
                      <button type="button" className={styles.togglePass} onClick={() => setShowPass1(!showPass1)}>{showPass1 ? '🙈' : '👁'}</button>
                    </div>
                  </div>

                  <div className={styles.reqList}>
                    <div className={`${styles.reqItem} ${pass1.length > 0 ? (reqLen ? styles.reqOk : styles.reqFail) : ''}`}><div className={styles.reqDot}></div>Mínimo 8 caracteres</div>
                    <div className={`${styles.reqItem} ${pass1.length > 0 ? (reqUpper ? styles.reqOk : styles.reqFail) : ''}`}><div className={styles.reqDot}></div>Al menos una mayúscula</div>
                    <div className={`${styles.reqItem} ${pass1.length > 0 ? (reqNum ? styles.reqOk : styles.reqFail) : ''}`}><div className={styles.reqDot}></div>Al menos un número</div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label>Confirmar contraseña</label>
                    <div className={styles.inputWrap}>
                      <span className={styles.inputIcon}>🔐</span>
                      <input type={showPass2 ? "text" : "password"} placeholder="Repite la contraseña" value={pass2} onChange={(e) => setPass2(e.target.value)} />
                      <button type="button" className={styles.togglePass} onClick={() => setShowPass2(!showPass2)}>{showPass2 ? '🙈' : '👁'}</button>
                    </div>
                  </div>

                  <button type="submit" className={`${styles.btnLogin} ${loading ? styles.loading : ''}`} disabled={loading}>
                    <span className={styles.btnTxt}>Activar cuenta</span>
                    <div className={styles.spinner}></div>
                  </button>
                </form>
              ) : (
                <div className={styles.backLink}><Link to="/login">← Ir al login</Link></div>
              )}
            </div>
          ) : (
            <div className={styles.successScreen}>
              <div className={styles.successIcon}>✅</div>
              <div className={styles.successTitle}>¡Cuenta activada!</div>
              <div className={styles.successSub}>Tu contraseña fue creada correctamente. Redirigiendo al portal...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
