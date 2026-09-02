import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { warmupBackend } from '../api/client';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const { login, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();

  // ─── Wake-up de Neon al montar el componente ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const warmup = async () => {
      const alive = await warmupBackend();
      if (!cancelled && alive) {
        console.log('[Login] Backend despertado correctamente');
      }
    };
    warmup();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMsg('');

    const waitTimer = setTimeout(() => {
      setStatusMsg('Conectando con el servidor... La base de datos puede tardar unos segundos en iniciar.');
    }, 4000);

    const retryTimer = setTimeout(() => {
      setStatusMsg('Esperando respuesta de la base de datos (puede tardar hasta 15s la primera vez)...');
    }, 10000);

    const result = await login(username, password);

    clearTimeout(waitTimer);
    clearTimeout(retryTimer);
    setStatusMsg('');

    if (result.ok) {
      toast.success('¡Bienvenido!');
      navigate(result.user.role === 'ADMIN' ? '/admin' : '/mi-consumo');
    } else {
      const msg = result.message || 'Error de conexión';
      if (result.retry || msg.toLowerCase().includes('disponible') || msg.toLowerCase().includes('conexión')) {
        toast.error('El servidor está iniciando. Por favor, intenta de nuevo en unos segundos.');
      } else {
        toast.error(msg);
      }
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
              autoComplete="username"
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="login-pass">Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-pass"
                className="form-control"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
                style={{ paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  color: 'var(--text-muted, #94a3b8)',
                  fontSize: '1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary, #22d3ee)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted, #94a3b8)'}
              >
                <i className={`bi bi-${showPassword ? 'eye-slash-fill' : 'eye-fill'}`} />
              </button>
            </div>
          </div>

          {/* Mensaje de estado durante espera */}
          {statusMsg && (
            <div style={{
              fontSize: '0.78rem',
              color: 'var(--color-warning, #f59e0b)',
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: '8px',
              padding: '8px 12px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} />
              {statusMsg}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading}
            style={{ marginTop: '8px' }}
          >
            {loading
              ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Ingresando...</>
              : <><i className="bi bi-box-arrow-in-right" /> Ingresar</>
            }
          </button>
        </form>

        <p className="text-center text-sm text-muted" style={{ marginTop: '20px' }}>
          ¿Eres adjudicatario? <Link to="/registro">Regístrate aquí</Link>
        </p>
      </div>
    </div>
  );
}
