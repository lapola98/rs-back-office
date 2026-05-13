import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './AdminLayout.module.css';

const NAV = [
  { to: '/admin/dashboard',            icon: '📊', label: 'Dashboard' },
  { to: '/admin/companies',            icon: '🏢', label: 'Empresas' },
  { to: '/admin/tasks',                icon: '✅', label: 'Tareas' },
  { to: '/admin/task-templates',       icon: '📋', label: 'Plantillas' },
  { to: '/admin/requests',             icon: '📥', label: 'Solicitudes' },
  { to: '/admin/documents',            icon: '📁', label: 'Documentos' },
  { to: '/admin/collections',          icon: '💰', label: 'Cartera' },
  { to: '/admin/onboarding',           icon: '🚀', label: 'Onboarding' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate('/login');
      } else {
        setUser(data.session.user);
      }
    });
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className={styles.app}>
      {/* SIDEBAR */}
      <aside className={styles.sb}>
        <NavLink to="/admin/dashboard" className={styles.sbLogo}>
          <div className={styles.sbMark}>RS</div>
          <div className={styles.sbWm}>
            <strong>RS Back Office</strong>
            <span>Admin</span>
          </div>
          <div className={styles.adminPill}>ADMIN</div>
        </NavLink>

        <nav className={styles.sbNav}>
          <div className={styles.sbLbl}>Principal</div>
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? `${styles.sbLink} ${styles.sbLinkActive}` : styles.sbLink
              }
            >
              <span className={styles.sbIcon}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* USER / LOGOUT */}
        <div className={styles.sbFoot}>
          <div className={styles.sbUser}>
            <div className={styles.sbAv}>{user?.email?.slice(0, 2).toUpperCase() || '—'}</div>
            <div className={styles.sbUserInfo}>
              <span className={styles.sbUserEmail}>{user?.email || '—'}</span>
              <span className={styles.sbUserRole}>Administrador</span>
            </div>
          </div>
          <button className={styles.sbLogout} onClick={handleLogout} title="Cerrar sesión">
            ⏏
          </button>
        </div>
      </aside>

      {/* PÁGINA ACTIVA */}
      <div className={styles.main}>
        <Outlet />
      </div>
    </div>
  );
}
