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

function isFacebookProfilePage() {
  const path = window.location.pathname;
  if (path === "/profile.php" || path === "/profile.php/") return true;
  if (/^\/(login|home|sharer|watch|groups|marketplace|gaming|help|policies)(\/|$)/.test(path)) return false;
  return /^\/[A-Za-z0-9.]+\/?$/.test(path);
}

function extractFacebook() {
  if (!isFacebookProfilePage()) {
    throw new Error("Keine Facebook-Profilseite erkannt.");
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
    "Anzeigename": titleMatch || null,
    "Profilbild": ogImage ? ogImage.getAttribute("content") : null,
  };

  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

registerExtractor("Facebook", extractFacebook);
