/** Read Meet's on-screen captions and forward new lines to Lazarus. */

const LINE_SELECTORS = [".nMcdL", ".TBMxY", "[data-message-text]"];
const CONTAINER_SELECTORS = [".iOzk7", '[jsname="dsyhDe"]', '[aria-live="polite"]', ".a4cQT"];
const SPEAKER_SELECTORS = [".NWpY1d", ".Nxjare", ".zc6p5d"];
const TEXT_SELECTORS = [".ygicle", ".bh44bd"];

const sent = new Set();
let lastCombined = "";

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

function flushNewLines() {
  const lines = collectLines();
  if (!lines.length) return;
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
    chrome.runtime.sendMessage({
      type: "caption",
      speaker: line.speaker,
      dialogue: line.dialogue,
    });
  }
}

const observer = new MutationObserver(() => flushNewLines());
observer.observe(document.body, { childList: true, subtree: true, characterData: true });
setInterval(flushNewLines, 1500);
flushNewLines();
