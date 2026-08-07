import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setApiBearerToken } from "../lib/api";
import {
  completeProviderSignIn,
  ensureAuthConfig,
  getSession,
  getSupabaseBrowserClient,
  isAuthConfigured,
  openProviderConnectPopup,
  requestPasswordReset,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updatePassword,
  type LazarusLoginProvider,
  type Session,
  type User,
} from "../lib/auth";

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInPassword: (email: string, password: string) => Promise<void>;
  signUpPassword: (email: string, password: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  resetPasswordEmail: (email: string) => Promise<void>;
  startProviderLogin: (provider: LazarusLoginProvider) => Promise<void>;
  completeProviderLogin: (provider: LazarusLoginProvider) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [configured, setConfigured] = useState(() => isAuthConfigured());
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const ok = await ensureAuthConfig();
      if (cancelled) return;
      setConfigured(ok);
      if (!ok) {
        setApiBearerToken(null);
        setLoading(false);
        return;
      }

      const sb = getSupabaseBrowserClient();
      if (!sb) {
        setLoading(false);
        return;
      }

      const s = await getSession();
      if (cancelled) return;
      setSession(s);
      setApiBearerToken(s?.access_token ?? null);
      setLoading(false);

      const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
        setSession(next);
        setApiBearerToken(next?.access_token ?? null);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const startProviderLogin = useCallback(async (provider: LazarusLoginProvider) => {
    openProviderConnectPopup(provider);
  }, []);

  const completeProviderLogin = useCallback(async (provider: LazarusLoginProvider) => {
    await completeProviderSignIn(provider);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      signInPassword: signInWithPassword,
      signUpPassword: signUpWithPassword,
      changePassword: updatePassword,
      resetPasswordEmail: requestPasswordReset,
      startProviderLogin,
      completeProviderLogin,
      logout: signOut,
    }),
    [configured, loading, session, startProviderLogin, completeProviderLogin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
