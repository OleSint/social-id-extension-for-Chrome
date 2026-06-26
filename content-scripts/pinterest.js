// Pinterest: Profildaten stecken im __PWS_DATA__-Hydration-Script. Da darin
// teils auch das eigene (eingeloggte) Nutzerobjekt vorkommt, wird gezielt
// nach einem Objekt mit passendem "username" gesucht statt blind dem ersten
// "user"-Treffer zu vertrauen.

const PINTEREST_RESERVED = [
  "pin", "search", "today", "ideas", "settings", "business", "login",
  "ads", "developers", "about", "blog", "help",
];

function getPinterestUsernameFromUrl() {
  const match = window.location.pathname.match(/^\/([A-Za-z0-9_]+)\/?$/);
  if (!match) return null;
  const username = match[1];
  if (PINTEREST_RESERVED.includes(username.toLowerCase())) return null;
  return username;
}

function findPinterestUserByUsername(obj, username, maxDepth = 14) {
  const seen = new Set();
  const target = username.toLowerCase();
  function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > maxDepth || seen.has(node)) return undefined;
    seen.add(node);
    if (
      typeof node.username === "string" &&
      node.username.toLowerCase() === target &&
      node.id
    ) {
      return node;
    }
    for (const key of Object.keys(node)) {
      const result = walk(node[key], depth + 1);
      if (result !== undefined) return result;
    }
    return undefined;
  }
  return walk(obj, 0);
}

function extractPinterest() {
  const username = getPinterestUsernameFromUrl();
  if (!username) {
    throw new Error("Kein Pinterest-Profil auf dieser Seite erkannt.");
  }

  const scriptTag = document.getElementById("__PWS_DATA__");
  if (!scriptTag) {
    throw new Error("Pinterest-Daten konnten nicht gefunden werden. Seite ggf. neu laden.");
  }

  let parsed;
  try {
    parsed = JSON.parse(scriptTag.textContent);
  } catch (e) {
    throw new Error("Pinterest-Daten konnten nicht gelesen werden (Format hat sich evtl. geändert).");
  }

  const user = findPinterestUserByUsername(parsed, username);
  if (!user) {
    throw new Error("Profil-ID nicht in den Seitendaten gefunden.");
  }

  const result = {
    "Profil-ID": user.id,
    "Benutzername": user.username || username,
    "Anzeigename": user.full_name || null,
    "Bio": user.about || null,
    "Follower": user.follower_count ?? null,
    "Folgt": user.following_count ?? null,
    "Pins": user.pin_count ?? null,
    "Boards": user.board_count ?? null,
    "Website": user.domain_url || null,
    "Verifizierter Händler": typeof user.is_verified_merchant === "boolean" ? (user.is_verified_merchant ? "Ja" : "Nein") : null,
    "Profilbild": user.image_xlarge_url || user.image_large_url || null,
  };

  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

registerExtractor("Pinterest", extractPinterest);
