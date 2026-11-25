import axios from 'axios';

// Client API dédié au PORTAIL CANDIDAT (externe). Utilise un token candidat propre (sessionStorage),
// distinct du JWT des utilisateurs CCG Flow, et ne redirige jamais vers /login interne.
const KEY = 'ccg-recr-jwt';
export const recrToken = {
  get() { try { return sessionStorage.getItem(KEY); } catch { return null; } },
  set(t) { try { sessionStorage.setItem(KEY, t); } catch { /* indispo */ } },
  clear() { try { sessionStorage.removeItem(KEY); } catch { /* indispo */ } },
};

const portal = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4001/api' });
portal.interceptors.request.use(cfg => {
  const t = recrToken.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export default portal;
