import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';

export default function Register() {
  const [form, setForm] = useState({ full_name: '', block: '', number: '', username: '', password: '' });
  const { register, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await register(form);
    if (result.ok) {
      toast.success('¡Cuenta creada! El administrador debe activarla antes de que puedas iniciar sesión.');
      navigate('/login');
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '480px' }}>
        <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Cambiar tema">
            <i className={`bi bi-${theme === 'dark' ? 'sun-fill' : 'moon-stars-fill'}`} />
          </button>
        </div>

        <div className="login-logo">
          <i className="bi bi-person-plus-fill" />
        </div>
        <h1 className="login-title">Registro de Adjudicatario</h1>
        <p className="login-subtitle">Crea tu cuenta para ver tu consumo de agua</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-name">Nombre Completo</label>
            <input id="reg-name" className="form-control" name="full_name" placeholder="Juan Pérez" value={form.full_name} onChange={handleChange} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-block">Bloque</label>
              <input id="reg-block" className="form-control" name="block" placeholder="A" value={form.block} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-number">N° Departamento</label>
              <input id="reg-number" className="form-control" name="number" placeholder="101" value={form.number} onChange={handleChange} required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-user">Usuario</label>
            <input id="reg-user" className="form-control" name="username" placeholder="juanperez" value={form.username} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-pass">Contraseña</label>
            <input id="reg-pass" className="form-control" type="password" name="password" placeholder="Mínimo 6 caracteres" value={form.password} onChange={handleChange} required minLength={6} />
          </div>
          <button type="submit" className="btn btn-success w-full" disabled={loading} style={{ marginTop: '8px' }}>
            {loading ? 'Registrando...' : <><i className="bi bi-check-lg" /> Crear Cuenta</>}
          </button>
        </form>

        <p className="text-center text-sm text-muted" style={{ marginTop: '20px' }}>
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}
