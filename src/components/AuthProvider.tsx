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
  deleteOwnAccount,
  type LazarusLoginProvider,
  type Session,
  type User,
} from "../lib/auth";
import {
  clearPasswordRecoveryState,
  capturePasswordRecoveryFromUrl,
  isPasswordRecoveryPending,
  markPasswordRecoveryPending,
} from "../lib/passwordRecovery";

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  /** True after clicking the email reset link — user must set a new password. */
  passwordRecovery: boolean;
  signInPassword: (email: string, password: string) => Promise<void>;
  signUpPassword: (email: string, password: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  clearPasswordRecovery: () => void;
  resetPasswordEmail: (email: string) => Promise<void>;
  startProviderLogin: (provider: LazarusLoginProvider) => Promise<void>;
  completeProviderLogin: (provider: LazarusLoginProvider) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [configured, setConfigured] = useState(() => isAuthConfigured());
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(() => {
    capturePasswordRecoveryFromUrl();
    return isPasswordRecoveryPending();
  });

  const clearPasswordRecovery = useCallback(() => {
    clearPasswordRecoveryState();
    setPasswordRecovery(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      capturePasswordRecoveryFromUrl();
      setPasswordRecovery(isPasswordRecoveryPending());

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

      // Capture again after client creation (PKCE may still be mid-exchange).
      capturePasswordRecoveryFromUrl();

      const { data: sub } = sb.auth.onAuthStateChange((event, next) => {
        if (event === "PASSWORD_RECOVERY") {
          markPasswordRecoveryPending();
          setPasswordRecovery(true);
        } else if (event === "SIGNED_OUT") {
          clearPasswordRecoveryState();
          setPasswordRecovery(false);
        } else if (next && isPasswordRecoveryPending()) {
          setPasswordRecovery(true);
        }
        setSession(next);
        setApiBearerToken(next?.access_token ?? null);
      });
      unsubscribe = () => sub.subscription.unsubscribe();

      const s = await getSession();
      if (cancelled) return;
      setPasswordRecovery(isPasswordRecoveryPending());
      setSession(s);
      setApiBearerToken(s?.access_token ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const startProviderLogin = useCallback(async (provider: LazarusLoginProvider) => {
    await openProviderConnectPopup(provider);
  }, []);

  const completeProviderLogin = useCallback(async (provider: LazarusLoginProvider) => {
    clearPasswordRecoveryState();
    setPasswordRecovery(false);
    await completeProviderSignIn(provider);
  }, []);

  const signInPassword = useCallback(async (email: string, password: string) => {
    clearPasswordRecoveryState();
    setPasswordRecovery(false);
    await signInWithPassword(email, password);
  }, []);

  const signUpPassword = useCallback(async (email: string, password: string) => {
    clearPasswordRecoveryState();
    setPasswordRecovery(false);
    await signUpWithPassword(email, password);
  }, []);

  const changePasswordAndClearRecovery = useCallback(async (newPassword: string) => {
    await updatePassword(newPassword);
    setPasswordRecovery(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      passwordRecovery,
      signInPassword,
      signUpPassword,
      changePassword: changePasswordAndClearRecovery,
      clearPasswordRecovery,
      resetPasswordEmail: requestPasswordReset,
      startProviderLogin,
      completeProviderLogin,
      logout: signOut,
      deleteAccount: deleteOwnAccount,
    }),
    [
      configured,
      loading,
      session,
      passwordRecovery,
      signInPassword,
      signUpPassword,
      changePasswordAndClearRecovery,
      clearPasswordRecovery,
      startProviderLogin,
      completeProviderLogin,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
