import { useEffect, useState } from "react";
import { navigateApp } from "../lib/appRoute";
import { arrivalOpensNow, qualifySharePath, readArrival, type Arrival } from "./arrival";
import OffHoursFunnel from "./OffHoursFunnel";
import "./off-hours.css";

const SEEN_KEY = "ldr-off-hours-seen";

type Props = {
  mode: "page" | "dock";
  onOpenPortal?: () => void;
};

export default function OffHoursQualifier({ mode, onOpenPortal }: Props) {
  const [arrival] = useState<Arrival>(() =>
    typeof window === "undefined" ? "site" : readArrival(window.location.search, document.referrer)
  );
  const [open, setOpen] = useState(mode === "page" || (mode === "dock" && arrivalOpensNow(arrival)));

  useEffect(() => {
    if (mode !== "dock" || typeof window === "undefined") return;
    const path = qualifySharePath(window.location.search, document.referrer);
    if (!path) return;
    navigateApp(path);
  }, [mode]);

  useEffect(() => {
    if (mode !== "dock" || arrivalOpensNow(arrival)) return;
    try {
      if (sessionStorage.getItem(SEEN_KEY) === "1") return;
    } catch {
      return;
    }
    const markSeen = () => {
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* private mode */
      }
    };
    const openOnce = () => {
      setOpen(true);
      markSeen();
    };
    const timer = window.setTimeout(openOnce, 350);
    const onScroll = () => {
      if (window.scrollY < 48) return;
      window.clearTimeout(timer);
      openOnce();
      window.removeEventListener("scroll", onScroll);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [mode, arrival]);

  const funnel = (
    <OffHoursFunnel active={mode === "page" || open} arrival={arrival} onOpenPortal={onOpenPortal} />
  );

  if (mode === "page") {
    return (
      <section className="ohq-page" aria-label="Off-hours forecast triage">
        {funnel}
      </section>
    );
  }

  return (
    <div className="ohq-dock">
      {open && (
        <div className="ohq-panel" role="dialog" aria-label="Off-hours forecast triage">
          <button type="button" className="ohq-close" onClick={() => setOpen(false)}>
            Close
          </button>
          {funnel}
          <button type="button" className="btn-secondary" onClick={() => navigateApp("/qualify")}>
            Open full page
          </button>
        </div>
      )}
      <button
        type="button"
        className="ohq-launch"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Off-hours triage
      </button>
    </div>
  );
}
