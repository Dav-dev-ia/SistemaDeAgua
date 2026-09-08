import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

const normalizeUser = (raw) => {
  if (!raw) return null;
  return {
    id: raw.id,
    username: raw.username,
    fullName: raw.full_name ?? raw.fullName,
    role: raw.role,
    isActive: raw.is_active ?? raw.isActive,
    apartmentId: raw.apartment_id ?? raw.apartmentId,
  };
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? normalizeUser(JSON.parse(saved)) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  // Sincronizar sesión entre pestañas
  useEffect(() => {
    const onStorage = () => {
      try {
        const saved = localStorage.getItem('user');
        const token = localStorage.getItem('access_token');
        if (!token && user) {
          setUser(null);
        } else if (saved) {
          const normalized = normalizeUser(JSON.parse(saved));
          setUser((prev) => (JSON.stringify(prev) !== JSON.stringify(normalized) ? normalized : prev));
        }
      } catch {
        // ignorar errores de parse
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user]);

  const login = useCallback(async (username, password) => {
    setLoading(true);
    try {
      const { data } = await client.post('/auth/login', {
        username: username.trim().toLowerCase(),
        password
      });
      if (data.ok) {
        const normalized = normalizeUser(data.user);
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(normalized);
        return { ok: true, user: normalized };
      }
      return { ok: false, message: data.message, retry: data.retry };
    } catch (err) {
      const status = err.response?.status;
      const serverMsg = err.response?.data?.message;
      const retry = err.response?.data?.retry;

      // Mensajes de error según el tipo
      let message;
      if (!err.response) {
        message = 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
      } else if (status === 503) {
        message = serverMsg || 'La base de datos está iniciando. Intenta de nuevo en unos segundos.';
      } else if (status === 401) {
        message = serverMsg || 'Usuario o contraseña incorrectos';
      } else if (status === 403) {
        message = serverMsg || 'Tu cuenta está pendiente de activación por el administrador.';
      } else if (status === 429) {
        message = 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
      } else {
        message = serverMsg || 'Error de conexión. Intenta de nuevo.';
      }

      return { ok: false, message, retry: retry || status === 503 || !err.response };
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (formData) => {
    setLoading(true);
    try {
      const { data } = await client.post('/auth/register', formData);
      return { ok: data.ok, message: data.message };
    } catch (err) {
      const serverMsg = err.response?.data?.message;
      return {
        ok: false,
        message: serverMsg || 'Error de conexión. Intenta de nuevo.',
        retry: err.response?.status === 503 || !err.response
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const isAdmin = user?.role === 'ADMIN';
  const isOwner = user?.role === 'OWNER';
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, isAdmin, isOwner, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
