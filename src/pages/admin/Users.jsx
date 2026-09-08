import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [passModal, setPassModal] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const toast = useToast();
  const { user: me } = useAuth();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/admin/users');
      if (data.ok) setUsers(data.items || []);
    } catch {
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const toggleActive = async (u) => {
    if (u.id === me.id) {
      toast.error('No puedes desactivar tu propia cuenta');
      return;
    }
    if (togglingId) return;
    setTogglingId(u.id);
    try {
      const { data } = await client.patch(`/admin/users/${u.id}`, { is_active: !u.is_active });
      if (data.ok) {
        toast.success(data.message || (u.is_active ? 'Usuario desactivado' : 'Usuario activado'));
        loadUsers();
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al cambiar estado');
    } finally {
      setTogglingId(null);
    }
  };

  const openPassword = (u) => {
    setPassModal(u);
    setNewPassword('');
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (resetting) return;
    setResetting(true);
    try {
      const { data } = await client.patch(`/admin/users/${passModal.id}`, { password: newPassword });
      if (data.ok) {
        toast.success('Contraseña actualizada');
        setPassModal(null);
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al actualizar contraseña');
    } finally {
      setResetting(false);
    }
  };

  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return [u.username, u.full_name, u.role, u.apartment ? `${u.apartment.block}-${u.apartment.number}` : '']
      .some(v => String(v).toLowerCase().includes(q));
  });

  const pendingCount = users.filter(u => !u.is_active).length;

  if (loading) {
    return <div className="loading-overlay"><div className="spinner" /> Cargando usuarios...</div>;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-subtitle">
            {pendingCount > 0
              ? `${pendingCount} cuenta${pendingCount > 1 ? 's' : ''} pendiente${pendingCount > 1 ? 's' : ''} de activación`
              : `${users.length} usuarios registrados`}
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-bar" style={{ flex: 1 }}>
          <i className="bi bi-search" />
          <input className="form-control" placeholder="Buscar por usuario, nombre, departamento..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="glass-card">
        <div className="table-responsive">
          <table className="data-table">
            <caption className="sr-only">Lista de usuarios del sistema</caption>
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">Nombre</th>
                <th scope="col">Rol</th>
                <th scope="col">Departamento</th>
                <th scope="col">Estado</th>
                <th scope="col">Último acceso</th>
                <th scope="col" className="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><div className="empty-state"><i className="bi bi-people" /><p>No se encontraron usuarios</p></div></td></tr>
              ) : filtered.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.username}</strong></td>
                  <td>{u.full_name}</td>
                  <td>
                    <span className={`status-badge ${u.role === 'ADMIN' ? 'info' : 'open'}`}>
                      {u.role === 'ADMIN' ? 'Administrador' : 'Adjudicatario'}
                    </span>
                  </td>
                  <td>{u.apartment ? <span>Blq {u.apartment.block} — Dpto {u.apartment.number}</span> : <span className="text-muted">—</span>}</td>
                  <td>
                    <span className={`status-badge ${u.is_active ? 'paid' : 'pending'}`}>
                      {u.is_active ? 'Activo' : (u.role === 'ADMIN' ? 'Inactivo' : 'Pendiente')}
                    </span>
                  </td>
                  <td className="text-muted text-sm" style={{ whiteSpace: 'nowrap' }}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Nunca'}
                  </td>
                  <td className="center">
                    <div className="flex gap-2 items-center" style={{ justifyContent: 'center' }}>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => toggleActive(u)}
                        disabled={togglingId === u.id || u.id === me.id}
                        title={u.is_active ? 'Desactivar acceso' : 'Activar acceso'}
                        aria-label={`${u.is_active ? 'Desactivar' : 'Activar'} a ${u.username}`}
                      >
                        <i className={`bi bi-${u.is_active ? 'person-x' : 'person-check'}`} />
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openPassword(u)}
                        title="Cambiar contraseña"
                        aria-label={`Cambiar contraseña de ${u.username}`}
                      >
                        <i className="bi bi-key" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {passModal && (
        <Modal
          id="pw-modal-title"
          title={<><i className="bi bi-key" style={{ marginRight: '8px', color: 'var(--accent-primary)' }} />Cambiar Contraseña</>}
          onClose={() => setPassModal(null)}
          footer={(
            <>
              <button type="button" className="btn btn-outline" onClick={() => setPassModal(null)} disabled={resetting}>Cancelar</button>
              <button type="submit" form="pw-form" className="btn btn-primary" disabled={resetting}>
                {resetting ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Guardando...</> : <><i className="bi bi-check-lg" /> Actualizar</>}
              </button>
            </>
          )}
        >
          <form id="pw-form" onSubmit={submitPassword}>
            <p className="text-sm text-muted mb-3">
              Restableciendo contraseña para <strong>{passModal.username}</strong> ({passModal.full_name})
            </p>
            <div className="form-group">
              <label className="form-label" htmlFor="pw-new">Nueva contraseña</label>
              <input id="pw-new" className="form-control" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres" />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}