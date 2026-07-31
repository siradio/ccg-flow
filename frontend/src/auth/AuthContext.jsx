import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { MODULE_SUB_KEYS } from '../config/modules';

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

// Accès par sous-module (RH, Achats, Stock du Jour, Mouvement Stock, un référentiel précis...) —
// couche indépendante des rôles de workflow ci-dessus, miroir de permissions.js côté backend.
// Hiérarchie stricte : consultation < ajout < edition. super_admin = toujours 'edition' partout.
const NIVEAUX = ['consultation', 'ajout', 'edition'];

export function subModuleNiveau(user, subModuleKey) {
  if (isSuperAdmin(user)) return 'edition';
  const row = (user?.subModules || []).find(s => s.sub_module_key === subModuleKey);
  return row ? row.niveau : null;
}

export function hasSubModuleLevel(user, subModuleKey, minNiveau = 'consultation') {
  const niveau = subModuleNiveau(user, subModuleKey);
  if (!niveau) return false;
  return NIVEAUX.indexOf(niveau) >= NIVEAUX.indexOf(minNiveau);
}

// Dérivé de MODULE_SUB_KEYS (config/modules.js) : vrai si l'utilisateur a accès à AU MOINS UN
// sous-module de ce module — sert uniquement à décider si un lien de nav de premier niveau doit
// s'afficher, jamais à gater un écran précis (chaque écran gate sur son propre sous-module).
export function hasModuleAccess(user, moduleKey) {
  if (isSuperAdmin(user)) return true;
  const keys = MODULE_SUB_KEYS[moduleKey]?.length ? MODULE_SUB_KEYS[moduleKey] : [moduleKey];
  return keys.some(k => hasSubModuleLevel(user, k));
}

// Accès par Business Unit (module Stock du Jour) — miroir de permissions.js côté backend.
// Sans AUCUN octroi : lecture seule sur toutes les BU. Avec au moins un octroi : restreint
// à ces BU précises, en lecture ET en écriture.
export function canWriteBusinessUnit(user, businessUnitId) {
  if (isSuperAdmin(user)) return true;
  return !!user && (user.businessUnits || []).map(Number).includes(Number(businessUnitId));
}

export function entitiesForRole(user, roleCode) {
  if (!user) return [];
  if (isSuperAdmin(user)) return 'all';
  return user.roles.filter(r => r.role_code === roleCode).map(r => r.entity_id);
}
