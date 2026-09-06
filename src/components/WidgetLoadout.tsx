import { useState } from "react";
import { navigateApp } from "../lib/appRoute";
import type { MeetingPlatformId } from "../lib/meetingPlatforms";
import { mintWidgetLaunchLink } from "../lib/widgetLaunch";
import {
  WIDGET_LISTING_NAME,
  WIDGET_STORES,
  isWidgetHostFramed,
  type WidgetStoreSpec,
} from "../lib/widgetStores";

export interface WidgetConnectState {
  connected: boolean;
  accountEmail?: string | null;
  connectUrl: string;
}

interface Props {
  signedIn: boolean;
  email?: string | null;
  zoom: WidgetConnectState;
  meet: WidgetConnectState;
  teams: WidgetConnectState;
  focus?: MeetingPlatformId | null;
  onSignIn?: () => void;
}

function statusLabel(signedIn: boolean, connected: boolean): string {
  if (!signedIn) return "Sign in first";
  if (!connected) return "Connect account";
  return "Ready to enable";
}

function Card({
  spec,
  signedIn,
  connected,
  accountEmail,
  connectUrl,
  onSignIn,
  onOpenAsAccount,
  opening,
}: {
  spec: WidgetStoreSpec;
  signedIn: boolean;
  connected: boolean;
  accountEmail?: string | null;
  connectUrl: string;
  onSignIn?: () => void;
  onOpenAsAccount: (id: MeetingPlatformId) => void;
  opening: boolean;
}) {
  const enableReady = signedIn && connected && !!spec.listingUrl;

  return (
    <article className="widget-loadout-card" data-platform={spec.id}>
      <header className="widget-loadout-card-top">
        <h4>{spec.label}</h4>
        <span className={`widget-loadout-badge${connected && signedIn ? " widget-loadout-badge-ok" : ""}`}>
          {statusLabel(signedIn, connected)}
        </span>
      </header>
      <p className="widget-loadout-meta">
        {connected && accountEmail ? `${accountEmail} · ` : null}
        {spec.enableNote}
      </p>
      <div className="widget-loadout-actions">
        {!signedIn ? (
          <button type="button" className="btn-primary" onClick={onSignIn}>
            Sign in on getldr.ca first
          </button>
        ) : (
          <a
            className={`btn-primary meeting-platform-connect-btn${connected ? " widget-loadout-link-quiet" : ""}`}
            href={connectUrl}
          >
            {connected ? `Reconnect ${spec.label}` : `Connect ${spec.label}`}
          </a>
        )}
        {enableReady ? (
          <a className="btn-secondary" href={spec.listingUrl ?? undefined} target="_blank" rel="noreferrer">
            Enable {WIDGET_LISTING_NAME} · {spec.storeLabel}
          </a>
        ) : (
          <span className="widget-loadout-pending">
            {!signedIn
              ? "Sign in on getldr.ca first."
              : !connected
                ? "Connect this account first."
                : spec.pendingHint}
          </span>
        )}
        {signedIn && connected && (
          <button
            type="button"
            className="btn-secondary"
            disabled={opening}
            onClick={() => onOpenAsAccount(spec.id)}
          >
            {opening ? "Opening…" : "Open widget as this account"}
          </button>
        )}
      </div>
    </article>
  );
}

export default function WidgetLoadout({
  signedIn,
  email,
  zoom,
  meet,
  teams,
  focus,
  onSignIn,
}: Props) {
  const [opening, setOpening] = useState<MeetingPlatformId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const framed = isWidgetHostFramed();
  const states: Record<MeetingPlatformId, WidgetConnectState> = { zoom, meet, teams };
  const order: MeetingPlatformId[] = focus ? [focus, ...(["zoom", "meet", "teams"] as const).filter((id) => id !== focus)] : ["zoom", "meet", "teams"];

  const openAsAccount = async (id: MeetingPlatformId) => {
    setError(null);
    setOpening(id);
    try {
      const { url } = await mintWidgetLaunchLink(id);
      window.open(url, framed ? "_self" : "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open widget as this account");
    } finally {
      setOpening(null);
    }
  };

  return (
    <section className="widget-loadout" aria-label="Meeting widgets">
      <header className="widget-loadout-header">
        <h3>Lazarus Deal Recovery Widget</h3>
        <p>
          This is Lazarus Deal Recovery in the meeting — recoverable vs flat no, then CRM-ready notes.
          Not an AI SDR. Sign in on getldr.ca, connect the host, then enable the widget in the store.
        </p>
      </header>

      {framed && !signedIn && (
        <div className="widget-loadout-unlock">
          <p>Open getldr.ca once to unlock this panel as your Lazarus account.</p>
          <a className="btn-primary" href="https://www.getldr.ca/portal" target="_blank" rel="noreferrer">
            Continue on getldr.ca
          </a>
        </div>
      )}

      {framed && signedIn && email && (
        <div className="widget-loadout-unlock">
          <p>Continue as {email} — same Recovery Brief, no second login.</p>
          <button
            type="button"
            className="btn-primary"
            disabled={!!opening}
            onClick={() => void openAsAccount(focus ?? "teams")}
          >
            {opening ? "Opening…" : `Continue as ${email}`}
          </button>
        </div>
      )}

      <div className="widget-loadout-grid">
        {order.map((id) => {
          const spec = WIDGET_STORES[id];
          const state = states[id];
          return (
            <Card
              key={id}
              spec={spec}
              signedIn={signedIn}
              connected={state.connected}
              accountEmail={state.accountEmail}
              connectUrl={state.connectUrl}
              onSignIn={onSignIn ?? (() => navigateApp("/login"))}
              onOpenAsAccount={(platform) => void openAsAccount(platform)}
              opening={opening === id}
            />
          );
        })}
      </div>
      {error && <div className="error-banner">{error}</div>}
    </section>
  );
}
