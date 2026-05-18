import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn as useTanstackServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { ensureUserRole } from "@/lib/ordenes.functions";

export type AppRole = "admin" | "operador" | "contador";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  rolesError: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  isOperador: boolean;
  isContador: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const queryClient = useQueryClient();
  const ensureRoleFn = useTanstackServerFn(ensureUserRole);
  const bootstrapAttemptedRef = useRef(new Set<string>());

  const loadRoles = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setRoles([]);
      setRolesError(null);
      return;
    }
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) {
      console.error("Error cargando roles:", error);
      setRoles([]);
      setRolesError(error.message ?? "No se pudieron cargar los roles.");
      return;
    }
    const nextRoles = (data ?? []).map((r) => r.role as AppRole);
    setRoles(nextRoles);
    setRolesError(null);

    if (nextRoles.length === 0 && !bootstrapAttemptedRef.current.has(userId)) {
      bootstrapAttemptedRef.current.add(userId);
      try {
        const res = await ensureRoleFn({ data: {} });
        if (res && typeof res === "object" && "ok" in res && res.ok === false) {
          if ("error" in res && res.error === "ADMIN_KEY_MISSING") {
            setRolesError(
              "Falta configurar una key secreta en el servidor para asignación automática. Agrega SUPABASE_SECRET_KEY (sb_secret_...) o asigna el rol manualmente en la tabla public.user_roles.",
            );
          }
          return;
        }

        const { data: after } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        setRoles((after ?? []).map((r) => r.role as AppRole));
      } catch (e) {
        const message = e instanceof Error ? e.message : "No se pudo asignar un rol.";
        console.error(message);
      }
    }
  }, [ensureRoleFn]);

  useEffect(() => {
    // CRÍTICO: registrar el listener ANTES de getSession()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      // Diferir consultas a Supabase para evitar deadlocks dentro del callback
      if (newSession?.user) {
        setTimeout(() => {
          loadRoles(newSession.user.id);
        }, 0);
      } else {
        setRoles([]);
      }
      // Invalidar caches al cambiar de usuario
      queryClient.invalidateQueries();
      router.invalidate();
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadRoles(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const hasRole = (role: AppRole) => roles.includes(role);
    return {
      session,
      user: session?.user ?? null,
      roles,
        rolesError,
      loading,
      signIn,
      signUp,
      signOut,
      hasRole,
      isAdmin: hasRole("admin"),
      isOperador: hasRole("operador"),
      isContador: hasRole("contador"),
    };
  }, [session, roles, rolesError, loading, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
