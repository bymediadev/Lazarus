export type AppRoute = "home" | "app" | "login";

export function currentPathname(): string {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path || "/";
}

export function getAppRoute(pathname = currentPathname()): AppRoute {
  if (
    pathname === "/app" ||
    pathname === "/portal" ||
    pathname.startsWith("/app/") ||
    pathname.startsWith("/portal/")
  ) {
    return "app";
  }
  if (pathname === "/login") return "login";
  return "home";
}

export function isMarketingRoute(route: AppRoute): boolean {
  return route === "home";
}

export function hasOAuthReturnParams(search = window.location.search): boolean {
  const params = new URLSearchParams(search);
  return (
    params.has("google") ||
    params.has("teams") ||
    params.has("hubspot") ||
    params.has("salesforce")
  );
}

export function navigateApp(path: string): void {
  const next = path.startsWith("/") ? path : `/${path}`;
  if (`${window.location.pathname}${window.location.search}` === next) return;
  window.history.pushState({}, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function scrollToSection(id: string): void {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
