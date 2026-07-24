import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('erp_token');
    if (!token) { setLoading(false); return; }
    client.get('/auth/me')
      .then(res => setUser(res.data))
      .catch(() => localStorage.removeItem('erp_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await client.post('/auth/login', { email, password });
    localStorage.setItem('erp_token', res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('erp_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// L'utilisateur détient-il ce rôle sur cette entité (ou super_admin, qui a accès partout) ?
export function hasRoleOnEntity(user, roleCode, entityId) {
  if (!user) return false;
  return user.roles.some(r => r.role_code === 'super_admin' || (r.role_code === roleCode && Number(r.entity_id) === Number(entityId)));
}

export function hasAnyRoleOnEntity(user, entityId) {
  if (!user) return false;
  return user.roles.some(r => r.role_code === 'super_admin' || Number(r.entity_id) === Number(entityId));
}

export function isSuperAdmin(user) {
  return !!user && user.roles.some(r => r.role_code === 'super_admin');
}

export function entitiesForRole(user, roleCode) {
  if (!user) return [];
  if (isSuperAdmin(user)) return 'all';
  return user.roles.filter(r => r.role_code === roleCode).map(r => r.entity_id);
}
