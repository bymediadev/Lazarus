/** Initialize Microsoft Teams JS when the portal is iframed (store meeting side panel). */

export function bootTeamsHost(): void {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;
  if (document.querySelector("script[data-lazarus-teams-js]")) return;

  const script = document.createElement("script");
  script.dataset.lazarusTeamsJs = "1";
  script.src = "https://res.cdn.office.net/teams-js/2.34.0/js/MicrosoftTeams.min.js";
  script.async = true;
  script.onload = () => {
    const teams = (
      window as unknown as {
        microsoftTeams?: { app?: { initialize?: () => Promise<unknown> } };
      }
    ).microsoftTeams;
    void teams?.app?.initialize?.();
  };
  document.head.appendChild(script);
}
