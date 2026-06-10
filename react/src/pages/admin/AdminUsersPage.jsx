import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSEO } from '../../hooks/useSEO';
import styles from './AdminUsersPage.module.css';

const PALETTE = [
  { color: '#c9a84c', bg: 'rgba(201,168,76,.12)' },
  { color: '#4a9fd4', bg: 'rgba(74,159,212,.12)' },
  { color: '#22a66a', bg: 'rgba(34,166,106,.12)' },
  { color: '#e8a020', bg: 'rgba(232,160,32,.12)' },
  { color: '#9b59b6', bg: 'rgba(155,89,182,.12)' },
  { color: '#e05c4b', bg: 'rgba(224,92,75,.12)' },
];

const ROLE_LABELS = {
  admin: 'Super Administrador',
  rs_admin: 'Administrador RS',
  rs_staff: 'Staff RS',
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function AdminUsersPage() {
  useSEO({
    title: 'Gestión de Usuarios Administrativos',
    description: 'Administra y crea el personal administrativo del Back Office en RS Back Office.',
  });

  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('todas');
  const [filterStatus, setFilterStatus] = useState('todas');

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);

  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'rs_staff' });
  const [editForm, setEditForm] = useState({ id: '', name: '', role: 'rs_staff' });

  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, active, created_at')
        .in('role', ['admin', 'rs_admin', 'rs_staff'])
        .order('full_name', { ascending: true });

      if (error) throw error;

      const enhancedUsers = (profiles || []).map((u, i) => {
        const pal = PALETTE[i % PALETTE.length];
        const initials = (u.full_name || u.email || '??')
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();

        return {
          ...u,
          initials,
          color: pal.color,
          bg: pal.bg,
        };
      });

      setUsers(enhancedUsers);
    } catch (e) {
      console.error(e);
      alert('Error al cargar usuarios: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const q = searchQuery.toLowerCase();
    const filtered = users.filter((u) => {
      const nameMatch = !q || (u.full_name && u.full_name.toLowerCase().includes(q)) || (u.email && u.email.toLowerCase().includes(q));
      const roleMatch = filterRole === 'todas' || u.role === filterRole;
      const statusMatch =
        filterStatus === 'todas' ||
        (filterStatus === 'activa' && u.active) ||
        (filterStatus === 'inactiva' && !u.active);
      return nameMatch && roleMatch && statusMatch;
    });
    setFilteredUsers(filtered);
  }, [users, searchQuery, filterRole, filterStatus]);

  const handleSendInvite = async () => {
    if (!inviteForm.name.trim()) {
      setInviteMsg({ type: 'err', text: '⚠️ El nombre completo es obligatorio.' });
      return;
    }
    if (!inviteForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteForm.email)) {
      setInviteMsg({ type: 'err', text: '⚠️ Ingresa un correo electrónico válido.' });
      return;
    }

    setSendingInvite(true);
    setInviteMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session?.access_token,
        },
        body: JSON.stringify({
          email: inviteForm.email.trim().toLowerCase(),
          role: inviteForm.role,
          full_name: inviteForm.name.trim(),
        }),
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        setInviteMsg({ type: 'err', text: '❌ ' + (result.error || 'Error al enviar invitación') });
      } else {
        setInviteMsg({ type: 'ok', text: '✅ Invitación enviada correctamente.' });
        setInviteForm({ email: '', name: '', role: 'rs_staff' });
        setTimeout(() => {
          setIsInviteModalOpen(false);
          setInviteMsg(null);
          loadUsers();
        }, 1500);
      }
    } catch (e) {
      setInviteMsg({ type: 'err', text: '❌ Error de conexión: ' + e.message });
    } finally {
      setSendingInvite(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) {
      alert('El nombre completo es obligatorio.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.name.trim(),
          role: editForm.role,
        })
        .eq('id', editForm.id);

      if (error) throw error;

      setIsEditModalOpen(false);
      await loadUsers();
    } catch (e) {
      alert('Error al guardar cambios: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user) => {
    const action = user.active ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Estás seguro de que deseas ${action} al usuario "${user.full_name || user.email}"?`)) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ active: !user.active })
        .eq('id', user.id);

      if (error) throw error;
      await loadUsers();
    } catch (e) {
      alert('Error al cambiar el estado: ' + e.message);
    }
  };

  const openInviteModal = () => {
    setInviteForm({ email: '', name: '', role: 'rs_staff' });
    setInviteMsg(null);
    setIsInviteModalOpen(true);
  };

  const openEditModal = () => {
    if (!selectedUser) return;
    setEditForm({
      id: selectedUser.id,
      name: selectedUser.full_name || '',
      role: selectedUser.role,
    });
    setIsEditModalOpen(true);
  };

  const selectedUser = users.find((u) => u.id === selectedUserId);

  const renderStatusBadge = (active) => {
    return active ? (
      <span className={`${styles.badge} ${styles.bOk}`}>Activo</span>
    ) : (
      <span className={`${styles.badge} ${styles.bN}`}>Inactivo</span>
    );
  };

  return (
    <div className={styles.app}>
      <div className={styles.main}>
        <div className={styles.content}>
          {/* PANEL IZQUIERDO - LISTADO DE USUARIOS */}
          <div className={styles.listPanel}>
            <div className={styles.lpHead}>
              <div className={styles.lpTop}>
                <div>
                  <h2>Personal Administrativo</h2>
                  <div className={styles.lpCount}>
                    {filteredUsers.length} usuarios · {filteredUsers.filter((u) => u.active).length} activos
                  </div>
                </div>
                <button className={styles.btnP} style={{ fontSize: '.74rem', padding: '.48rem .9rem' }} onClick={openInviteModal}>
                  + Invitar
                </button>
              </div>
              <div className={styles.searchBox}>
                <span style={{ color: 'rgba(255,255,255,.25)', fontSize: '.82rem' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Buscar usuario o correo…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className={styles.filterRow}>
                <button
                  className={`${styles.filterBtn} ${filterRole === 'todas' ? styles.filterBtnOn : ''}`}
                  onClick={() => setFilterRole('todas')}
                >
                  Todos los roles
                </button>
                <button
                  className={`${styles.filterBtn} ${filterRole === 'admin' ? styles.filterBtnOn : ''}`}
                  onClick={() => setFilterRole('admin')}
                >
                  Admin
                </button>
                <button
                  className={`${styles.filterBtn} ${filterRole === 'rs_admin' ? styles.filterBtnOn : ''}`}
                  onClick={() => setFilterRole('rs_admin')}
                >
                  Admin RS
                </button>
                <button
                  className={`${styles.filterBtn} ${filterRole === 'rs_staff' ? styles.filterBtnOn : ''}`}
                  onClick={() => setFilterRole('rs_staff')}
                >
                  Staff RS
                </button>
              </div>
              <div className={styles.filterRow} style={{ marginTop: '.4rem' }}>
                <button
                  className={`${styles.filterBtn} ${filterStatus === 'todas' ? styles.filterBtnOn : ''}`}
                  onClick={() => setFilterStatus('todas')}
                >
                  Todos los estados
                </button>
                <button
                  className={`${styles.filterBtn} ${filterStatus === 'activa' ? styles.filterBtnOn : ''}`}
                  onClick={() => setFilterStatus('activa')}
                >
                  Activos
                </button>
                <button
                  className={`${styles.filterBtn} ${filterStatus === 'inactiva' ? styles.filterBtnOn : ''}`}
                  onClick={() => setFilterStatus('inactiva')}
                >
                  Inactivos
                </button>
              </div>
            </div>

            <div className={styles.coList}>
              {loading && <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,.25)', fontSize: '.8rem' }}>Cargando usuarios...</div>}
              {!loading && filteredUsers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,.25)', fontSize: '.8rem' }}>
                  Sin usuarios encontrados
                </div>
              )}
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className={`${styles.coCard} ${selectedUserId === u.id ? styles.coCardActive : ''}`}
                  onClick={() => setSelectedUserId(u.id)}
                >
                  <div className={styles.coAv} style={{ background: u.bg, color: u.color }}>
                    {u.initials}
                  </div>
                  <div className={styles.coInfo}>
                    <div className={styles.coName}>{u.full_name || u.email}</div>
                    <div className={styles.coCity}>
                      {ROLE_LABELS[u.role] || u.role} · {renderStatusBadge(u.active)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* PANEL DERECHO - DETALLES DEL USUARIO */}
          <div className={styles.detailPanel}>
            {!selectedUser ? (
              <div className={styles.dpEmpty}>
                <div className={styles.dpEmptyIcon}>👤</div>
                <h3>Selecciona un usuario</h3>
                <p>Haz clic en cualquier usuario de la lista para ver su información de perfil, rol y estado.</p>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className={styles.dpHead}>
                  <div className={styles.dpTop}>
                    <div className={styles.dpAv} style={{ background: selectedUser.bg, color: selectedUser.color }}>
                      {selectedUser.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={styles.dpName}>{selectedUser.full_name || 'Sin nombre'}</div>
                      <div className={styles.dpMeta}>
                        <span className={styles.dpNit}>{selectedUser.email}</span>
                        <span>{renderStatusBadge(selectedUser.active)}</span>
                      </div>
                    </div>
                    <div className={styles.dpActions}>
                      <button className={styles.btnG} onClick={openEditModal}>
                        ✏️ Editar
                      </button>
                      <button
                        className={selectedUser.active ? styles.btnS : styles.btnP}
                        style={{ fontSize: '.76rem', padding: '.5rem .9rem' }}
                        onClick={() => handleToggleActive(selectedUser)}
                      >
                        {selectedUser.active ? 'Deactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.dpBody}>
                  <div className={styles.dpViewActive}>
                    <div className={styles.card}>
                      <div className={styles.cardHd}>
                        <div>
                          <div className={styles.stag}>Datos generales</div>
                          <div className={styles.cardTitle}>{selectedUser.full_name || 'Sin nombre'}</div>
                        </div>
                      </div>
                      <div className={styles.infoGrid}>
                        <div className={styles.infoField}>
                          <div className={styles.infoLbl}>Nombre completo</div>
                          <div className={styles.infoVal}>{selectedUser.full_name || '—'}</div>
                        </div>
                        <div className={styles.infoField}>
                          <div className={styles.infoLbl}>Correo electrónico</div>
                          <div className={`${styles.infoVal} ${styles.infoValMono}`}>{selectedUser.email}</div>
                        </div>
                        <div className={styles.infoField}>
                          <div className={styles.infoLbl}>Rol del sistema</div>
                          <div className={`${styles.infoVal} ${styles.infoValGold}`}>{ROLE_LABELS[selectedUser.role] || selectedUser.role}</div>
                        </div>
                        <div className={styles.infoField}>
                          <div className={styles.infoLbl}>Fecha de registro</div>
                          <div className={styles.infoVal}>{fmtDate(selectedUser.created_at)}</div>
                        </div>
                        <div className={styles.infoField}>
                          <div className={styles.infoLbl}>Estado de la cuenta</div>
                          <div className={styles.infoVal}>{selectedUser.active ? 'Activo (Puede ingresar)' : 'Inactivo (Acceso denegado)'}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL INVITACIÓN DE USUARIOS */}
      {isInviteModalOpen && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => {
            if (e.target.className.includes('modalOverlay')) setIsInviteModalOpen(false);
          }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHd}>
              <div>
                <h3>Invitar personal administrativo</h3>
                <p>El usuario recibirá un correo para activar su cuenta y crear su contraseña.</p>
              </div>
              <button className={styles.modalClose} onClick={() => setIsInviteModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formSectionTitle}>Información del usuario</div>
              <div className={styles.formRowFull} style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
                <div className={styles.field}>
                  <label>Nombre completo *</label>
                  <input
                    type="text"
                    placeholder="Ej: Laura Becerra"
                    value={inviteForm.name}
                    onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <label>Correo electrónico *</label>
                  <input
                    type="email"
                    placeholder="Ej: laura@rsbackoffice.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <label>Rol asignado</label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                  >
                    <option value="rs_staff">Staff RS</option>
                    <option value="rs_admin">Administrador RS</option>
                    <option value="admin">Super Administrador</option>
                  </select>
                </div>
              </div>

              {inviteMsg && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '.65rem .9rem',
                    borderRadius: '10px',
                    fontSize: '.78rem',
                    background: inviteMsg.type === 'ok' ? 'rgba(34,166,106,.09)' : 'rgba(192,57,43,.04)',
                    color: inviteMsg.type === 'ok' ? '#22a66a' : '#c0392b',
                    border: `1px solid ${inviteMsg.type === 'ok' ? '#22a66a' : '#c0392b'}`,
                  }}
                >
                  {inviteMsg.text}
                </div>
              )}
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setIsInviteModalOpen(false)}>
                Cancelar
              </button>
              <button className={styles.btnP} onClick={handleSendInvite} disabled={sendingInvite}>
                {sendingInvite ? '⏳ Invitando…' : 'Enviar Invitación →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN DE USUARIOS */}
      {isEditModalOpen && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => {
            if (e.target.className.includes('modalOverlay')) setIsEditModalOpen(false);
          }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHd}>
              <div>
                <h3>Editar usuario administrativo</h3>
                <p>Modifica los datos generales y permisos de acceso.</p>
              </div>
              <button className={styles.modalClose} onClick={() => setIsEditModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formSectionTitle}>Información del usuario</div>
              <div className={styles.formRowFull} style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
                <div className={styles.field}>
                  <label>Nombre completo *</label>
                  <input
                    type="text"
                    placeholder="Ej: Laura Becerra"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <label>Rol asignado</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  >
                    <option value="rs_staff">Staff RS</option>
                    <option value="rs_admin">Administrador RS</option>
                    <option value="admin">Super Administrador</option>
                  </select>
                </div>
              </div>
            </div>
            <div className={styles.modalFt}>
              <button className={styles.btnS} onClick={() => setIsEditModalOpen(false)}>
                Cancelar
              </button>
              <button className={styles.btnP} onClick={handleSaveEdit} disabled={saving}>
                {saving ? '⏳ Guardando…' : 'Guardar Cambios →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
