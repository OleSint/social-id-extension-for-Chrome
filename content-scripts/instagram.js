// Instagram: nutzt den internen web_profile_info-Endpoint, den die Web-App
// selbst verwendet. Der x-ig-app-id-Header ist der öffentliche, feste
// App-ID-Wert der Instagram-Web-Oberfläche (kein Secret, kein eigener Login nötig
// über das, was im Browser ohnehin schon eingeloggt ist).
const INSTAGRAM_APP_ID = "936619743392459";
const INSTAGRAM_RESERVED = [
  "explore", "reels", "accounts", "direct", "stories", "p", "tv",
  "about", "developer", "legal", "directory", "emails",
];

function getInstagramUsernameFromUrl() {
  const match = window.location.pathname.match(/^\/([A-Za-z0-9_.]+)\/?$/);
  if (!match) return null;
  const username = match[1];
  if (INSTAGRAM_RESERVED.includes(username.toLowerCase())) return null;
  return username;
}

function isInstagramPostPage() {
  return /^\/(p|reel)\/[^/]+/.test(window.location.pathname);
}

// Instagram bettet Beitragsdaten in mehreren <script type="application/json">-
// Tags ein (kein einzelner vorhersagbarer Variablenname wie bei TikTok).
// Daher: alle solchen Tags parsen und das erste Objekt nehmen, das ein
// "taken_at"-Feld enthält (Zeitstempel-Feld, das nur bei Beitragsobjekten
// vorkommt) – best effort, da Instagram dieses Format ohne Vorwarnung
// ändern kann.
function findInstagramPostNode() {
  const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'));
  for (const script of scripts) {
    let parsed;
    try {
      parsed = JSON.parse(script.textContent);
    } catch (e) {
      continue;
    }
    const owner = findNodeContainingKey(parsed, "taken_at");
    if (owner) return owner;
  }
  return null;
}

function findNodeContainingKey(obj, key, maxDepth = 16) {
  const seen = new Set();
  function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > maxDepth || seen.has(node)) return undefined;
    seen.add(node);
    if (Object.prototype.hasOwnProperty.call(node, key)) return node;
    for (const k of Object.keys(node)) {
      const result = walk(node[k], depth + 1);
      if (result !== undefined) return result;
    }
    return undefined;
  }
  return walk(obj, 0);
}

// "video_url" fehlt auf manchen Knoten-Varianten (führte dazu, dass bei
// Video-Beiträgen nur das Standbild aus display_url heruntergeladen wurde).
// video_versions ist die zuverlässigere Quelle für das echte Video. Bei
// Karussell-Beiträgen (mehrere Bilder/Videos) wird das erste Element genutzt.
function getInstagramMediaUrl(node) {
  if (node.video_versions && node.video_versions.length) {
    return node.video_versions[0].url;
  }
  if (node.video_url) return node.video_url;
  if (node.carousel_media && node.carousel_media.length) {
    const first = node.carousel_media[0];
    if (first.video_versions && first.video_versions.length) return first.video_versions[0].url;
    if (first.image_versions2 && first.image_versions2.candidates && first.image_versions2.candidates.length) {
      return first.image_versions2.candidates[0].url;
    }
  }
  if (node.image_versions2 && node.image_versions2.candidates && node.image_versions2.candidates.length) {
    return node.image_versions2.candidates[0].url;
  }
  return node.display_url || null;
}

function extractInstagramPost() {
  const node = findInstagramPostNode();
  if (!node) {
    throw new Error("Beitragsdaten nicht gefunden (Format hat sich evtl. geändert oder Seite muss frisch geladen werden).");
  }

  const likeCount = node.like_count ?? (node.edge_media_preview_like && node.edge_media_preview_like.count);
  const commentCount = node.comment_count ?? (node.edge_media_to_comment && node.edge_media_to_comment.count);
  const caption =
    (node.caption && node.caption.text) ||
    (node.edge_media_to_caption && node.edge_media_to_caption.edges[0] && node.edge_media_to_caption.edges[0].node.text);
  const mediaUrl = getInstagramMediaUrl(node);

  const result = {
    "Gepostet am": node.taken_at ? new Date(node.taken_at * 1000).toLocaleString("de-DE") : null,
    "Beschreibung": caption || null,
    "Likes": likeCount ?? null,
    "Kommentare": commentCount ?? null,
    "Medium": mediaUrl || null,
  };
  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

async function extractInstagram() {
  if (isInstagramPostPage()) {
    return extractInstagramPost();
  }

  const username = getInstagramUsernameFromUrl();
  if (!username) {
    throw new Error("Kein Instagram-Profil auf dieser Seite erkannt.");
  }

  const response = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    {
      credentials: "include",
      headers: { "x-ig-app-id": INSTAGRAM_APP_ID },
    }
  );
  if (!response.ok) {
    throw new Error(`Instagram-API antwortete mit Status ${response.status}. Eventuell eingeloggt sein nötig.`);
  }
  const json = await response.json();
  const user = json && json.data && json.data.user;
  if (!user || !user.id) {
    throw new Error("Profil-ID nicht in der Instagram-Antwort gefunden.");
  }

  const result = {
    "Profil-ID": user.id,
    "Benutzername": user.username || username,
    "Anzeigename": user.full_name || null,
    "Bio": user.biography || null,
    "Privates Konto": typeof user.is_private === "boolean" ? (user.is_private ? "Ja" : "Nein") : null,
    "Verifiziert": typeof user.is_verified === "boolean" ? (user.is_verified ? "Ja" : "Nein") : null,
    "Business-Konto": typeof user.is_business_account === "boolean" ? (user.is_business_account ? "Ja" : "Nein") : null,
    "Follower": user.edge_followed_by ? user.edge_followed_by.count : null,
    "Folgt": user.edge_follow ? user.edge_follow.count : null,
    "Beiträge": user.edge_owner_to_timeline_media ? user.edge_owner_to_timeline_media.count : null,
    "Kategorie": user.category_name || null,
    "Website": user.external_url || null,
    "Geschäftliche E-Mail": user.public_email || null,
    "Geschäftliche Telefonnummer": user.public_phone_number || null,
    "Adresse": [user.address_street, user.city_name, user.zip].filter(Boolean).join(", ") || null,
    "Pronomen": Array.isArray(user.pronouns) && user.pronouns.length ? user.pronouns.join(", ") : null,
    "Story-Highlights": user.highlight_reel_count ?? null,
    "Kürzlich beigetreten": typeof user.is_joined_recently === "boolean" ? (user.is_joined_recently ? "Ja (kein exaktes Datum verfügbar)" : "Nein") : null,
    "Profilbild": user.profile_pic_url_hd || user.profile_pic_url || null,
  };

  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

registerExtractor("Instagram", extractInstagram);
