import { useState, useCallback } from 'react';
import { login as apiLogin, logout as apiLogout, getCurrentUser } from '../api/client';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser());

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    setUser(result.user);
    return result;
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isSupervisor: user?.role === 'supervisor' || user?.role === 'admin',
    login,
    logout,
  };
}
