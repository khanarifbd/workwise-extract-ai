import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type RoleMode = 'default' | 'daniella' | 'nav';

interface RoleModeCtx {
  mode: RoleMode;
  setMode: (m: RoleMode) => void;
}

const Ctx = createContext<RoleModeCtx>({ mode: 'default', setMode: () => {} });
const KEY = 'progressor_role_mode';

export const RoleModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<RoleMode>(() => {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'daniella' || v === 'nav' ? v : 'default';
    } catch {
      return 'default';
    }
  });
  const setMode = (m: RoleMode) => {
    setModeState(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  };
  useEffect(() => {
    document.documentElement.dataset.roleMode = mode;
  }, [mode]);
  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
};

export const useRoleMode = () => useContext(Ctx);
