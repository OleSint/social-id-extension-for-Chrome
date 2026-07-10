// Facebook: numerische IDs sind seit der Umstellung auf Vanity-URLs nur noch
// in Sonderfällen direkt sichtbar. Best-effort-Extraktion über zwei Wege:
// 1) profile.php?id=NUMMER in der URL (eindeutig und zuverlässig)
// 2) Regex-Suche im Seitenquelltext nach bekannten internen ID-Feldern
// Ohne Treffer wird ein klarer Fehler statt einer falschen ID gemeldet.

function getFacebookIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (id && /^\d+$/.test(id)) return id;
  return null;
}

function getFacebookIdFromSource() {
  const html = document.documentElement.innerHTML;
  const patterns = [
    /"userID":"(\d+)"/,
    /"USER_ID":"(\d+)"/,
    /"entity_id":"(\d+)"/,
    /profile_id=(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function getFacebookUsernameFromUrl() {
  const path = window.location.pathname;
  if (path === "/profile.php" || path === "/profile.php/") return null;
  const match = path.match(/^\/([A-Za-z0-9.]+)\/?$/);
  return match ? match[1] : null;
}

function isFacebookProfilePage() {
  const path = window.location.pathname;
  if (path === "/profile.php" || path === "/profile.php/") return true;
  if (/^\/(login|home|sharer|watch|groups|marketplace|gaming|help|policies)(\/|$)/.test(path)) return false;
  return /^\/[A-Za-z0-9.]+\/?$/.test(path);
}

function isFacebookPostPage() {
  const path = window.location.pathname;
  return /\/posts\//.test(path) || /\/permalink\.php/.test(path) || /\/photo(\.php|\/)/.test(path) || /\/videos\//.test(path) || /\/reel\//.test(path);
}

// Facebook bettet den Zeitpunkt eines Beitrags als Unix-Timestamp im
// Seitenquelltext ein (gleiches Prinzip wie die ID-Extraktion oben).
function getFacebookPostDate() {
  const html = document.documentElement.innerHTML;
  const patterns = [/"publish_time":(\d{9,11})/, /"creation_time":(\d{9,11})/, /"timestamp":(\d{9,11})/];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return new Date(parseInt(match[1], 10) * 1000).toLocaleString("de-DE");
  }
  return null;
}

function extractFacebook() {
  if (isFacebookPostPage()) {
    const postDate = getFacebookPostDate();
    if (!postDate) {
      throw new Error("Datum des Beitrags konnte nicht gefunden werden.");
    }
    return { "Gepostet am": postDate };
  }

  if (!isFacebookProfilePage()) {
    throw new Error("Keine Facebook-Profilseite oder kein Beitrag erkannt.");
  }

  const id = getFacebookIdFromUrl() || getFacebookIdFromSource();
  if (!id) {
    throw new Error("Profil-ID konnte nicht gefunden werden (Facebook verschleiert IDs oft bei Vanity-URLs).");
  }

  const titleMatch = document.title.replace(/\s*\|\s*Facebook\s*$/i, "").trim();

  // Bestes verfügbares Profilbild ohne API/Login-Zugriff: das og:image-Meta-Tag,
  // das Facebook für Link-Vorschauen einbettet. Auflösung ist dadurch begrenzt
  // und nicht garantiert die höchstmögliche.
  const ogImage = document.querySelector('meta[property="og:image"]');

  const result = {
    "Profil-ID": id,
    "Benutzername": getFacebookUsernameFromUrl(),
    "Anzeigename": titleMatch || null,
    "Profilbild": ogImage ? ogImage.getAttribute("content") : null,
  };

  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

registerExtractor("Facebook", extractFacebook);

// Facebook hat keine öffentliche API für Kommentare – ohne Aufklappen der
// "X weitere Kommentare"/"X Antworten"-Buttons würde eine spätere Sicherung
// nur den anfangs gerenderten Bruchteil der Kommentare erfassen (ähnliches
// Grundproblem wie die Virtualisierung bei anderen Plattformen, hier aber
// ohne API-Ausweg lösbar). Gleiches Prinzip nutzt die Übersetzen-Funktion:
// "Übersetzung anzeigen"-Buttons pro Kommentar anklicken, statt auf eine
// eventuelle Sammel-Übersetzen-Funktion von Facebook zu warten, deren
// genaues Verhalten sich nicht zuverlässig antizipieren lässt. Erkennung
// über Textmuster statt über Facebooks bei jedem Deploy neu generierte,
// instabile CSS-Klassennamen.
const FACEBOOK_EXPAND_PATTERNS = [
  /weitere[nr]?\s+kommentare/i,
  /alle\s+\d+\s+kommentare/i,
  /\d+\s+antworten?/i,
  /view\s+more\s+comments/i,
  /view\s+\d+\s+repl/i,
  /\d+\s+repl(y|ies)/i,
  /see\s+more\s+comments/i,
  /vorherige\s+kommentare/i,
];

const FACEBOOK_TRANSLATE_PATTERNS = [
  /übersetzung anzeigen/i,
  /^übersetzen$/i,
  /alle kommentare übersetzen/i,
  /see translation/i,
  /^translate$/i,
  /translate all comments/i,
];

function findButtonsMatchingPatterns(patterns) {
  return Array.from(document.querySelectorAll('[role="button"]')).filter((el) => {
    const text = (el.textContent || "").trim();
    if (!text || text.length > 60) return false;
    return patterns.some((re) => re.test(text));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Klickt wiederholt alle aktuell sichtbaren, zu den Mustern passenden
// Buttons, bis mehrere Runden hintereinander nichts Neues mehr auftaucht
// (z. B. weil weitere Kommentare/Übersetzungen nach dem Klicken nachladen)
// oder ein Sicherheitslimit erreicht ist.
async function clickMatchingButtonsUntilIdle(patterns, maxClicks = 300, maxIdleRounds = 5) {
  let clicks = 0;
  let idleRounds = 0;

  while (clicks < maxClicks && idleRounds < maxIdleRounds) {
    const buttons = findButtonsMatchingPatterns(patterns);
    if (!buttons.length) {
      idleRounds++;
      await sleep(400);
      continue;
    }
    idleRounds = 0;
    for (const btn of buttons) {
      if (clicks >= maxClicks) break;
      try {
        btn.click();
        clicks++;
      } catch (e) {
        // Button ggf. schon durch einen vorherigen Klick aus dem DOM entfernt – überspringen
      }
      await sleep(200);
    }
    await sleep(400);
  }
  return clicks;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || (msg.type !== "EXPAND_FACEBOOK_COMMENTS" && msg.type !== "TRANSLATE_FACEBOOK_COMMENTS")) return;
  const patterns = msg.type === "EXPAND_FACEBOOK_COMMENTS" ? FACEBOOK_EXPAND_PATTERNS : FACEBOOK_TRANSLATE_PATTERNS;
  clickMatchingButtonsUntilIdle(patterns)
    .then((clicks) => sendResponse({ success: true, clicks }))
    .catch((err) => sendResponse({ success: false, error: err && err.message ? err.message : String(err) }));
  return true;
});
