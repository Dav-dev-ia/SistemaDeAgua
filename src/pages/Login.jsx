import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(username, password);
    if (result.ok) {
      toast.success('¡Bienvenido!');
      navigate(result.user.role === 'ADMIN' ? '/admin' : '/mi-consumo');
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Cambiar tema">
            <i className={`bi bi-${theme === 'dark' ? 'sun-fill' : 'moon-stars-fill'}`} />
          </button>
        </div>

        <div className="login-logo">
          <i className="bi bi-droplet-fill" />
        </div>
        <h1 className="login-title">AguaPago</h1>
        <p className="login-subtitle">Control de Agua del Condominio</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-user">Usuario</label>
            <input
              id="login-user"
              className="form-control"
              type="text"
              placeholder="Tu nombre de usuario"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="login-pass">Contraseña</label>
            <input
              id="login-pass"
              className="form-control"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ marginTop: '8px' }}>
            {loading ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Ingresando...</> : <><i className="bi bi-box-arrow-in-right" /> Ingresar</>}
          </button>
        </form>

        <p className="text-center text-sm text-muted" style={{ marginTop: '20px' }}>
          ¿Eres adjudicatario? <Link to="/registro">Regístrate aquí</Link>
        </p>
      </div>
    </div>
  );
}
