import { useEffect } from "react";

/** Fade sections in as they enter the viewport. No-op when the user prefers reduced motion. */
export function useReveal(selector = ".marketing-reveal"): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll(selector).forEach((el) => el.classList.add("is-in"));
      return;
    }
    const els = document.querySelectorAll(selector);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [selector]);
}
