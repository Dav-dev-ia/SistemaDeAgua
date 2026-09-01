import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Cliente Axios configurado para Neon + Vercel free tier.
 *
 * Características:
 * - Timeout extendido (30s) para tolerar cold starts de Neon (~5-10s)
 * - Retry automático en errores de red y 503 (BD durmiendo)
 * - Interceptor de autenticación JWT
 * - Redirección automática al login en 401
 */
const client = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000, // 30s para tolerar cold starts de Neon free tier
});

// ─── Interceptor de request: inyectar JWT ────────────────────────────────────
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Interceptor de respuesta: manejo de errores + retry ─────────────────────
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // No reintentar si ya fue un reintento o si es error de auth
    if (config?._retryCount >= 2) {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const isNetworkError = !error.response; // Sin respuesta = error de red
    const isServerBusy = status === 503; // BD durmiendo / no disponible
    const isTimeout = error.code === 'ECONNABORTED'; // Timeout

    if (isNetworkError || isServerBusy || isTimeout) {
      config._retryCount = (config._retryCount || 0) + 1;
      const delay = config._retryCount * 3000; // 3s, 6s

      console.warn(`[API] Reintento ${config._retryCount}/2 en ${delay}ms (${error.message || status})`);
      await new Promise((resolve) => setTimeout(resolve, delay));

      return client(config);
    }

    // 401: Token expirado o inválido → limpiar sesión
    if (status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Hace un "ping" al backend para despertar Neon antes del login.
 * Útil para evitar el delay del cold start en el login real.
 * @returns {Promise<boolean>} true si el backend respondió
 */
export async function warmupBackend() {
  try {
    await client.get('/ping', { timeout: 10000 });
    return true;
  } catch {
    return false; // No es crítico, solo un intento de pre-carga
  }
}

export default client;
