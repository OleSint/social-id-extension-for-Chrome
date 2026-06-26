// Gemeinsame Hilfsfunktionen für alle Plattform-Content-Scripts.
// Wird in jedem content_scripts-Eintrag vor dem Plattform-Skript geladen
// und teilt sich den globalen Scope (kein ES-Modul).

function registerExtractor(platform, extractFn) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "EXTRACT_PROFILE") return;
    Promise.resolve()
      .then(extractFn)
      .then((result) => {
        sendResponse({ platform, success: true, data: result });
      })
      .catch((err) => {
        sendResponse({ platform, success: false, error: err && err.message ? err.message : String(err) });
      });
    return true; // asynchrone Antwort
  });
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

// Sucht rekursiv den ersten Wert für einen Schlüssel in einer verschachtelten
// JSON-Struktur unbekannter Form (nötig, da Plattformen ihre internen
// State-Objekte ohne stabiles Schema einbetten).
function findKeyDeep(obj, targetKey, maxDepth = 12) {
  const seen = new Set();
  function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > maxDepth || seen.has(node)) return undefined;
    seen.add(node);
    if (Object.prototype.hasOwnProperty.call(node, targetKey)) return node[targetKey];
    for (const key of Object.keys(node)) {
      const result = walk(node[key], depth + 1);
      if (result !== undefined) return result;
    }
    return undefined;
  }
  return walk(obj, 0);
}

function parseInlineJsonByVarName(varName) {
  const scripts = Array.from(document.querySelectorAll("script"));
  for (const script of scripts) {
    const text = script.textContent;
    if (!text || !text.includes(varName)) continue;
    const marker = varName + "=";
    const idx = text.indexOf(marker);
    if (idx === -1) continue;
    const jsonStart = text.indexOf("{", idx);
    if (jsonStart === -1) continue;
    let depth = 0;
    for (let i = jsonStart; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          const jsonStr = text.slice(jsonStart, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch (e) {
            // weiterprobieren mit nächstem Treffer
          }
        }
      }
    }
  }
  return null;
}

function formatUnixSeconds(seconds) {
  if (!seconds && seconds !== 0) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}
