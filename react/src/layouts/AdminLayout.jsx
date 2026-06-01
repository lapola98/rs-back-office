import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './AdminLayout.module.css';

export default function AdminLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [counts, setCounts] = useState({
    companies: 0,
    documents: 0,
    tasks: 0,
    requests: 0,
    onboarding: 0,
    hasOverdue: false,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate('/login');
      } else {
        setUser(data.session.user);
      }
    });
  }, [navigate]);

  const loadCounts = async () => {
    try {
      const [rCos, rDocs, rTasks, rReqs, rObs] = await Promise.all([
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('documents').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('due_date, status').eq('status', 'pending'),
        supabase.from('operational_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('client_onboardings').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      ]);

      const pendingTasks = rTasks.data || [];
      const todayStr = new Date().toDateString();
      const overdueCount = pendingTasks.filter(t => t.due_date && new Date(t.due_date) < new Date(todayStr)).length;
      const tasksCount = overdueCount > 0 ? overdueCount : pendingTasks.length;

      setCounts({
        companies: rCos.count || 0,
        documents: rDocs.count || 0,
        tasks: tasksCount,
        requests: rReqs.count || 0,
        onboarding: rObs.count || 0,
        hasOverdue: overdueCount > 0,
      });
    } catch (err) {
      console.error('Error fetching sidebar counts:', err);
    }
  };

  useEffect(() => {
    if (user) {
      loadCounts();
      const interval = setInterval(loadCounts, 60000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const renderLink = (to, icon, label, badge = null) => {
    if (to === '#') {
      return (
        <a key={label} href="#" className={styles.sbLink} onClick={(e) => e.preventDefault()}>
          <span className={styles.sbIcon}>{icon}</span>
          <span>{label}</span>
          {badge}
        </a>
      );
    }

    if (to === '/') {
      return (
        <a key={label} href="/" className={styles.sbLink} target="_blank" rel="noopener noreferrer">
          <span className={styles.sbIcon}>{icon}</span>
          <span>{label}</span>
          {badge}
        </a>
      );
    }

    return (
      <NavLink
        key={to}
        to={to}
        className={({ isActive }) =>
          isActive ? `${styles.sbLink} ${styles.sbLinkActive}` : styles.sbLink
        }
      >
        <span className={styles.sbIcon}>{icon}</span>
        <span>{label}</span>
        {badge}
      </NavLink>
    );
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
          {renderLink('/admin/dashboard', '📊', 'Dashboard')}
          {renderLink('/admin/companies', '🏢', 'Empresas', counts.companies > 0 && <span className={styles.sbCount}>{counts.companies}</span>)}
          {renderLink('/admin/onboarding', '🚀', 'Onboarding', counts.onboarding > 0 && <span className={styles.sbBadgeN}>{counts.onboarding}</span>)}
          {renderLink('/admin/tasks', '✅', 'Tareas', counts.tasks > 0 && <span className={counts.hasOverdue ? styles.sbBadgeN : styles.sbCount}>{counts.tasks}</span>)}
          {renderLink('/admin/documents', '📁', 'Documentos', counts.documents > 0 && <span className={styles.sbCount}>{counts.documents}</span>)}
          {renderLink('/admin/requests', '📥', 'Solicitudes', counts.requests > 0 && <span className={styles.sbBadgeN}>{counts.requests}</span>)}

          <div className={styles.sbDiv}></div>
          <div className={styles.sbLbl}>Módulos</div>
          {renderLink('/admin/collections', '💰', 'Cartera')}

          <div className={styles.sbDiv}></div>
          <div className={styles.sbLbl}>Sistema</div>
          {renderLink('#', '👤', 'Usuarios')}
          {renderLink('#', '⚙️', 'Configuración')}
          {renderLink('/', '🌐', 'Ver sitio web')}
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
