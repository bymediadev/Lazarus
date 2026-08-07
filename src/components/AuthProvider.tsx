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
  getSession,
  getSupabaseBrowserClient,
  isAuthConfigured,
  signInWithCrmProvider,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  type Session,
  type User,
} from "../lib/auth";
import { hubspotConnectUrl } from "../lib/hubspotIntegration";
import { salesforceConnectUrl } from "../lib/salesforceIntegration";

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInEmail: (email: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  connectAndSignInCrm: (provider: "hubspot" | "salesforce") => Promise<void>;
  completeCrmSignIn: (provider: "hubspot" | "salesforce") => Promise<void>;
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

  const connectAndSignInCrm = useCallback(async (provider: "hubspot" | "salesforce") => {
    const url = provider === "hubspot" ? hubspotConnectUrl() : salesforceConnectUrl();
    const popup = window.open(
      url,
      `lazarus-${provider}-oauth`,
      "popup=yes,width=560,height=720,resizable=yes,scrollbars=yes"
    );
    if (!popup) throw new Error("Allow popups to connect and sign in.");
    popup.focus();
  }, []);

  const completeCrmSignIn = useCallback(async (provider: "hubspot" | "salesforce") => {
    await signInWithCrmProvider(provider);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      signInEmail: signInWithEmail,
      signInGoogle: signInWithGoogle,
      connectAndSignInCrm,
      completeCrmSignIn,
      logout: signOut,
    }),
    [configured, loading, session, connectAndSignInCrm, completeCrmSignIn]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
