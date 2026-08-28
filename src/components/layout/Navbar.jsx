import { useTheme } from '../../context/ThemeContext';

export default function Navbar({ title, onMenuToggle }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="navbar">
      <div className="flex items-center gap-3">
        <button className="menu-toggle" onClick={onMenuToggle} aria-label="Abrir menú">
          <i className="bi bi-list" />
        </button>
        <h2 className="navbar-title">{title}</h2>
      </div>
      <div className="navbar-actions">
        <button className="theme-toggle" onClick={toggleTheme} aria-label="Cambiar tema" title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
          <i className={`bi bi-${theme === 'dark' ? 'sun-fill' : 'moon-stars-fill'}`} />
        </button>
      </div>
    </header>
  );
}
