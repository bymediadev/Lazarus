/** In-Meet companion: read on-screen captions and show a Lazarus panel. */

const LINE_SELECTORS = [".nMcdL", ".TBMxY", "[data-message-text]"];
const CONTAINER_SELECTORS = [".iOzk7", '[jsname="dsyhDe"]', '[aria-live="polite"]', ".a4cQT"];
const SPEAKER_SELECTORS = [".NWpY1d", ".Nxjare", ".zc6p5d"];
const TEXT_SELECTORS = [".ygicle", ".bh44bd"];
const LIVE_URL = "https://www.getldr.ca/portal?tab=live";

const sent = new Set();
let lastCombined = "";
const recent = [];
let ui = null;

function firstText(root, selectors) {
  for (const sel of selectors) {
    const node = root.querySelector(sel);
    const text = node?.textContent?.trim();
    if (text) return text;
  }
  return "";
}

function collectLines() {
  const lines = [];
  for (const sel of LINE_SELECTORS) {
    document.querySelectorAll(sel).forEach((el) => {
      const speaker = firstText(el, SPEAKER_SELECTORS) || "Speaker";
      const dialogue = firstText(el, TEXT_SELECTORS) || el.textContent?.trim() || "";
      if (dialogue) lines.push({ speaker, dialogue });
    });
    if (lines.length) return lines;
  }

  for (const sel of CONTAINER_SELECTORS) {
    const box = document.querySelector(sel);
    if (!box) continue;
    const raw = box.innerText?.trim() ?? "";
    if (!raw) continue;
    for (const part of raw.split("\n")) {
      const line = part.trim();
      if (!line) continue;
      const split = line.match(/^(.{1,48}):\s+(.+)$/);
      if (split) lines.push({ speaker: split[1].trim(), dialogue: split[2].trim() });
      else lines.push({ speaker: "Speaker", dialogue: line });
    }
    if (lines.length) return lines;
  }
  return lines;
}

function fingerprint(speaker, dialogue) {
  return `${speaker}\0${dialogue}`.toLowerCase();
}

function remember(speaker, dialogue) {
  recent.push({ speaker, dialogue });
  if (recent.length > 8) recent.shift();
  renderLines();
}

function flushNewLines() {
  const lines = collectLines();
  if (!lines.length) {
    renderLines();
    return;
  }
  const combined = lines.map((l) => `${l.speaker}:${l.dialogue}`).join("|");
  if (combined === lastCombined) return;
  lastCombined = combined;

  for (const line of lines) {
    const key = fingerprint(line.speaker, line.dialogue);
    if (sent.has(key)) continue;
    sent.add(key);
    if (sent.size > 80) {
      const keep = [...sent].slice(-40);
      sent.clear();
      keep.forEach((k) => sent.add(k));
    }
    remember(line.speaker, line.dialogue);
    chrome.runtime.sendMessage({
      type: "caption",
      speaker: line.speaker,
      dialogue: line.dialogue,
    });
  }
}

function renderLines() {
  if (!ui?.lines) return;
  if (!recent.length) {
    ui.lines.innerHTML =
      '<p class="empty">Turn on Captions in Meet. Lines show here, then stream to the Lazarus Live tab.</p>';
    return;
  }
  ui.lines.innerHTML = recent
    .map(
      (l) =>
        `<p class="line"><span class="who">${escapeHtml(l.speaker)}</span> ${escapeHtml(l.dialogue)}</p>`
    )
    .join("");
  ui.lines.scrollTop = ui.lines.scrollHeight;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setPairStatus(paired) {
  if (!ui) return;
  ui.mark.classList.toggle("on", paired);
  ui.mark.classList.toggle("wait", !paired);
  ui.sub.textContent = paired ? "Sending to Live tab" : "Waiting for Live session";
  ui.status.textContent = paired
    ? "Paired with Lazarus. Keep Captions on."
    : "On getldr.ca open Live → Google Meet → Start live session.";
}

function refreshStatus() {
  chrome.runtime.sendMessage({ type: "status" }, (res) => {
    if (chrome.runtime.lastError) return;
    setPairStatus(Boolean(res?.paired));
  });
}

async function mountPanel() {
  if (document.getElementById("lazarus-meet-widget")) return;
  const host = document.createElement("div");
  host.id = "lazarus-meet-widget";
  const shadow = host.attachShadow({ mode: "open" });
  let css = "";
  try {
    css = await (await fetch(chrome.runtime.getURL("meet.css"))).text();
  } catch {
    /* panel still works unstyled */
  }
  shadow.innerHTML = `
    <style>${css}</style>
    <aside class="panel" role="complementary" aria-label="Lazarus Deal Recovery">
      <header class="header">
        <span class="mark wait" data-mark></span>
        <div class="title">Lazarus Deal Recovery<span data-sub>Waiting for Live session</span></div>
        <button type="button" class="toggle" data-toggle aria-label="Minimize">–</button>
      </header>
      <div class="body" data-body>
        <p class="status" data-status>On getldr.ca open Live → Google Meet → Start live session.</p>
        <div class="lines" data-lines></div>
        <div class="actions">
          <a class="btn" href="${LIVE_URL}" target="_blank" rel="noopener">Open Live tab</a>
        </div>
      </div>
    </aside>
  `;
  const panel = shadow.querySelector(".panel");
  const body = shadow.querySelector("[data-body]");
  const toggle = shadow.querySelector("[data-toggle]");
  toggle.addEventListener("click", () => {
    const min = panel.classList.toggle("min");
    body.hidden = min;
    toggle.textContent = min ? "+" : "–";
    toggle.setAttribute("aria-label", min ? "Expand" : "Minimize");
  });
  ui = {
    mark: shadow.querySelector("[data-mark]"),
    sub: shadow.querySelector("[data-sub]"),
    status: shadow.querySelector("[data-status]"),
    lines: shadow.querySelector("[data-lines]"),
  };
  document.documentElement.appendChild(host);
  renderLines();
  refreshStatus();
}

void mountPanel();

if (document.body) {
  const observer = new MutationObserver(() => flushNewLines());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}
setInterval(flushNewLines, 1500);
setInterval(refreshStatus, 4000);
flushNewLines();
