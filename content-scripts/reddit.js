// Reddit: nutzt die öffentliche about.json-API des jeweiligen Profils
// (liefert u.a. die echte ID und das Erstellungsdatum des Kontos).

function getRedditUsernameFromUrl() {
  const match = window.location.pathname.match(/^\/(?:u|user)\/([^/]+)/);
  return match ? match[1] : null;
}

async function extractReddit() {
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
