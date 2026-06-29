// Reddit: nutzt die öffentliche about.json-API des jeweiligen Profils
// (liefert u.a. die echte ID und das Erstellungsdatum des Kontos).

function getRedditUsernameFromUrl() {
  const match = window.location.pathname.match(/^\/(?:u|user)\/([^/]+)/);
  return match ? match[1] : null;
}

function isRedditPostPage() {
  return /\/comments\//.test(window.location.pathname);
}

// Jede Reddit-Seite liefert ihre eigene JSON-Repräsentation, wenn man ".json"
// an den Pfad anhängt – auch Kommentar-/Beitragsseiten. Kein separater
// API-Aufbau nötig wie bei den anderen Plattformen.
async function extractRedditPost() {
  const response = await fetch(`https://www.reddit.com${window.location.pathname}.json`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Reddit-API antwortete mit Status ${response.status}.`);
  }
  const json = await response.json();
  const postData = json && json[0] && json[0].data && json[0].data.children && json[0].data.children[0] && json[0].data.children[0].data;
  if (!postData) {
    throw new Error("Beitragsdaten nicht gefunden.");
  }

  const mediaUrl = /\.(jpe?g|png|gif|gifv|mp4|webm)(\?|$)/i.test(postData.url || "") ? postData.url : null;

  const result = {
    "Gepostet am": postData.created_utc ? new Date(postData.created_utc * 1000).toLocaleString("de-DE") : null,
    "Titel": postData.title || null,
    "Autor": postData.author || null,
    "Subreddit": postData.subreddit ? `r/${postData.subreddit}` : null,
    "Punkte": postData.score ?? null,
    "Kommentare": postData.num_comments ?? null,
    "Text": postData.selftext || null,
    "Medium": mediaUrl,
  };
  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

async function extractReddit() {
  if (isRedditPostPage()) {
    return extractRedditPost();
  }

  const username = getRedditUsernameFromUrl();
  if (!username) {
    throw new Error("Kein Reddit-Nutzerprofil auf dieser Seite erkannt (URL-Format: reddit.com/user/name).");
  }

  const response = await fetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Reddit-API antwortete mit Status ${response.status}.`);
  }
  const json = await response.json();
  const data = json && json.data;
  if (!data || !data.id) {
    throw new Error("Profil-ID nicht in der Reddit-Antwort gefunden.");
  }

  const subreddit = data.subreddit || {};

  const result = {
    "Profil-ID": `t2_${data.id}`,
    "Benutzername": data.name || username,
    "Erstellt am": formatUnixSeconds(data.created_utc),
    "Bio": subreddit.public_description || null,
    "Profil-Follower": subreddit.subscribers ?? null,
    "Karma gesamt": data.total_karma ?? null,
    "Link-Karma": data.link_karma ?? null,
    "Kommentar-Karma": data.comment_karma ?? null,
    "Reddit Premium": typeof data.is_gold === "boolean" ? (data.is_gold ? "Ja" : "Nein") : null,
    "Verifiziert": typeof data.verified === "boolean" ? (data.verified ? "Ja" : "Nein") : null,
    "E-Mail verifiziert": typeof data.has_verified_email === "boolean" ? (data.has_verified_email ? "Ja" : "Nein") : null,
    "Moderator": typeof data.is_mod === "boolean" ? (data.is_mod ? "Ja" : "Nein") : null,
    "Reddit-Mitarbeiter": typeof data.is_employee === "boolean" ? (data.is_employee ? "Ja" : "Nein") : null,
    // Reddits JSON-API liefert URLs in icon_img/snoovatar_img HTML-entity-escaped (&amp; statt &).
    "Profilbild": (data.snoovatar_img || data.icon_img || "").replace(/&amp;/g, "&") || null,
  };

  Object.keys(result).forEach((k) => result[k] === null && delete result[k]);
  return result;
}

registerExtractor("Reddit", extractReddit);

// Sicherung: sammelt alle Beiträge/Kommentare über die öffentliche
// overview.json-Listing-API (paginiert über "after"). Im Gegensatz zum
// Scrollen der Live-Seite gibt es hier keine Virtualisierung – jedes
// gesammelte Element bleibt erhalten, unabhängig davon, was im DOM gerade
// gerendert ist. Reddits Listing-API liefert ohnehin meist nur die letzten
// ca. 1000 Einträge eines Profils; MAX_PAGES ist daher ein großzügiges, aber
// endliches Sicherheitslimit.
async function collectRedditArchive() {
  const username = getRedditUsernameFromUrl();
  if (!username) {
    throw new Error("Kein Reddit-Nutzerprofil auf dieser Seite erkannt.");
  }

  const items = [];
  let after = null;
  const MAX_PAGES = 20;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `https://www.reddit.com/user/${encodeURIComponent(username)}/overview.json?limit=100&raw_json=1${after ? `&after=${after}` : ""}`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Reddit-API antwortete mit Status ${response.status}.`);
    }
    const json = await response.json();
    const children = (json && json.data && json.data.children) || [];
    children.forEach((child) => items.push({ kind: child.kind, ...child.data }));

    after = json.data ? json.data.after : null;
    if (!after || children.length === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return { username, items };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "BUILD_REDDIT_ARCHIVE") return;
  collectRedditArchive()
    .then((result) => sendResponse({ success: true, ...result }))
    .catch((err) => sendResponse({ success: false, error: err && err.message ? err.message : String(err) }));
  return true;
});
