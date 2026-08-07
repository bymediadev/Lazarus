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
  getSession,
  getSupabaseBrowserClient,
  isAuthConfigured,
  openProviderConnectPopup,
  signInWithEmail,
  signOut,
  type LazarusLoginProvider,
  type Session,
  type User,
} from "../lib/auth";

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInEmail: (email: string) => Promise<{ message: string; action_link?: string }>;
  startProviderLogin: (provider: LazarusLoginProvider) => Promise<void>;
  completeProviderLogin: (provider: LazarusLoginProvider) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isAuthConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      setApiBearerToken(null);
      return;
    }
    const sb = getSupabaseBrowserClient();
    if (!sb) {
      setLoading(false);
      return;
    }
    void getSession().then((s) => {
      setSession(s);
      setApiBearerToken(s?.access_token ?? null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setApiBearerToken(next?.access_token ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  /** After OAuth popup connects, LoginScreen completes the Lazarus session. */

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
      signInEmail: signInWithEmail,
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
