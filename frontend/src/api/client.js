import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4001/api',
});

client.interceptors.request.use(config => {
  const token = localStorage.getItem('erp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('erp_token');
      // Session reprise sur un autre appareil : on mémorise un message affiché sur l'écran de connexion.
      if (err.response?.data?.code === 'session_replaced') {
        try { localStorage.setItem('session_notice', err.response.data.error || ''); } catch { /* stockage indispo */ }
      }
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default client;
