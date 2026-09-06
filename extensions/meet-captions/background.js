function allowedApiBases() {
  const set = new Set(["https://lazarus-4uxi.onrender.com"]);
  const perms = chrome.runtime.getManifest().host_permissions || [];
  const localDev = perms.some(
    (p) => p.includes("localhost:3001") || p.includes("127.0.0.1:3001")
  );
  if (localDev) {
    set.add("http://localhost:3001");
    set.add("http://127.0.0.1:3001");
  }
  return set;
}

function storePair(sessionId, sessionSecret, apiBase, userId, userEmail, sendResponse) {
  const id = String(sessionId ?? "").trim();
  const secret = String(sessionSecret ?? "").trim();
  const uid = String(userId ?? "").trim();
  const email = String(userEmail ?? "").trim();
  const base = String(apiBase ?? "").replace(/\/$/, "");
  if (!id && !uid) {
    chrome.storage.local.remove(
      ["sessionId", "sessionSecret", "apiBase", "userId", "userEmail"],
      () => sendResponse({ ok: true, cleared: true })
    );
    return;
  }
  if (base && !allowedApiBases().has(base)) {
    sendResponse({ ok: false, reason: "api_base_not_allowed" });
    return;
  }
  const patch = { userId: uid, userEmail: email };
  if (base) patch.apiBase = base;
  if (id) {
    patch.sessionId = id;
    patch.sessionSecret = secret;
  }
  chrome.storage.local.set(patch, () => sendResponse({ ok: true }));
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;

  if (msg.type === "pair") {
    storePair(msg.sessionId, msg.sessionSecret, msg.apiBase, msg.userId, msg.userEmail, sendResponse);
    return true;
  }

  if (msg.type === "caption") {
    const speaker = String(msg.speaker ?? "Speaker").trim() || "Speaker";
    const dialogue = String(msg.dialogue ?? "").trim();
    if (!dialogue) {
      sendResponse({ ok: false, reason: "empty" });
      return false;
    }
    chrome.storage.local.get(["sessionId", "sessionSecret", "apiBase", "userId"], (st) => {
      const sessionId = String(st.sessionId ?? "").trim();
      const sessionSecret = String(st.sessionSecret ?? "").trim();
      const userId = String(st.userId ?? "").trim();
      const apiBase = String(st.apiBase ?? "").replace(/\/$/, "");
      if (!sessionId || !sessionSecret || !apiBase) {
        sendResponse({ ok: false, reason: "not_paired" });
        return;
      }
      if (!allowedApiBases().has(apiBase)) {
        sendResponse({ ok: false, reason: "api_base_not_allowed" });
        return;
      }
      fetch(`${apiBase}/api/integrations/google/live-captions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sessionSecret, speaker, dialogue, userId: userId || undefined }),
      })
        .then((res) => sendResponse({ ok: res.ok, status: res.status }))
        .catch((err) => sendResponse({ ok: false, reason: String(err) }));
    });
    return true;
  }

  return false;
});
