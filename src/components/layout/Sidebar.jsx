import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({ isOpen, onClose }) {
  const { user, isAdmin, logout } = useAuth();

  const adminLinks = [
    { to: '/admin', icon: 'bi-grid-1x2', label: 'Dashboard', end: true },
    { to: '/admin/apartamentos', icon: 'bi-building', label: 'Departamentos' },
    { to: '/admin/periodos', icon: 'bi-calendar3', label: 'Periodos' },
    { to: '/admin/cobros', icon: 'bi-cash-stack', label: 'Cobro Rápido' },
  ];

  const ownerLinks = [
    { to: '/mi-consumo', icon: 'bi-droplet-half', label: 'Mi Consumo', end: true },
  ];

  const links = isAdmin ? adminLinks : ownerLinks;

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <i className="bi bi-droplet-fill" />
          </div>
          <div>
            <span className="sidebar-brand-text">AguaPago</span>
            <span className="sidebar-brand-sub">Control de Agua</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-section-title">
            {isAdmin ? 'Administración' : 'Mi Cuenta'}
          </span>

          {links.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <i className={`bi ${link.icon}`} />
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ color: 'var(--text-sidebar)', fontSize: '0.78rem', marginBottom: '8px', padding: '0 12px' }}>
            <strong>{user?.full_name}</strong>
            <br />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{user?.role}</span>
          </div>
          <button className="sidebar-link" onClick={logout} style={{ color: '#ef4444' }}>
            <i className="bi bi-box-arrow-left" />
            Cerrar Sesión
          </button>
        </div>
      </aside>
    </>
  );
}
