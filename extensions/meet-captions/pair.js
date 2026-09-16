function allowedApiBases() {
  const set = new Set(["https://api.getldr.ca", "https://lazarus-4uxi.onrender.com"]);
  for (const p of chrome.runtime.getManifest().host_permissions || []) {
    try {
      set.add(new URL(p.replace("/*", "/")).origin);
    } catch {
      /* skip */
    }
  }
  return set;
}

function pairFromDetail(detail) {
  if (!detail || typeof detail !== "object") return;
  const apiBase = String(detail.apiBase ?? "").replace(/\/$/, "");
  if (apiBase && !allowedApiBases().has(apiBase)) return;
  chrome.runtime.sendMessage(
    {
      type: "pair",
      sessionId: detail.sessionId ?? "",
      sessionSecret: detail.sessionSecret ?? "",
      apiBase,
    },
    (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.ok && !res.cleared) {
        window.dispatchEvent(new CustomEvent("lazarus-meet-paired"));
      }
    }
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.type !== "lazarus-meet-session") return;
  pairFromDetail(data);
});

function readPairNode() {
  const el = document.getElementById("lazarus-meet-pair");
  if (!el) return;
  pairFromDetail({
    sessionId: el.getAttribute("data-session-id") ?? "",
    sessionSecret: el.getAttribute("data-session-secret") ?? "",
    apiBase: el.getAttribute("data-api-base") ?? "",
  });
}

readPairNode();
const observer = new MutationObserver(() => readPairNode());
observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["data-session-id", "data-session-secret", "data-api-base"],
});
