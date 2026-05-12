import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import styles from './AuthPages.module.css'; // I will create a shared CSS for auth pages

export default function ResetPasswordPage() {
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [showPass1, setShowPass1] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

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
      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (e) {
      setError('Error al actualizar: ' + e.message);
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
          <div className={styles.leftH}>Crea tu<em>nueva contraseña</em></div>
          <p className={styles.leftP}>Elige una contraseña segura para proteger el acceso a tu portal empresarial.</p>
        </div>
        <div className={styles.leftFoot}>© 2025 RS Back Office · Bogotá, Colombia</div>
      </div>

      <div className={styles.right}>
        <div className={styles.formWrap}>
          {!success ? (
            <div id="formSection">
              <div className={styles.secTag}>Recuperación de acceso</div>
              <h2 className={styles.formH}>Nueva<em>contraseña</em></h2>
              <p className={styles.formDesc}>Ingresa y confirma tu nueva contraseña. Debe tener al menos 8 caracteres.</p>

              {error && <div className={`${styles.alert} ${styles.alertErr}`}><span>⚠️</span><span>{error}</span></div>}

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
                  <span className={styles.btnTxt}>Guardar nueva contraseña</span>
                  <div className={styles.spinner}></div>
                </button>
              </form>

              <div className={styles.backLink}><Link to="/login">← Volver al login</Link></div>
            </div>
          ) : (
            <div className={styles.successScreen}>
              <div className={styles.successIcon}>✅</div>
              <div className={styles.successTitle}>Contraseña actualizada</div>
              <div className={styles.successSub}>Tu contraseña fue cambiada correctamente. Ya puedes ingresar al portal.</div>
              <Link to="/login" className={styles.btnP}>Ir al portal →</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
