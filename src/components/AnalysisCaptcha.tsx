import { useEffect, useRef } from "react";
import { loadTurnstileScript } from "../lib/captcha";

type Props = {
  siteKey: string;
  resetKey: number;
  onToken: (token: string) => void;
};

export default function AnalysisCaptcha({ siteKey, resetKey, onToken }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    onToken("");

    const run = async () => {
      try {
        await loadTurnstileScript();
      } catch {
        return;
      }
      if (cancelled || !hostRef.current || !window.turnstile) return;
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      widgetIdRef.current = window.turnstile.render(hostRef.current, {
        sitekey: siteKey,
        theme: "dark",
        appearance: "always",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };

    void run();
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, resetKey, onToken]);

  return (
    <div className="analysis-captcha">
      <p className="analysis-captcha-label">Security check — complete this before analyzing a call</p>
      <div ref={hostRef} className="analysis-captcha-widget" />
    </div>
  );
}
