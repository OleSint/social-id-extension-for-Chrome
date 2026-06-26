// GitHub: api.github.com/users/<name> ist eine vollständig öffentliche,
// unauthentifizierte API (kein Login nötig, ähnlich wie bei Bluesky).

const GITHUB_RESERVED = [
  "settings", "notifications", "marketplace", "explore", "topics", "trending",
  "collections", "events", "sponsors", "about", "pricing", "features",
  "security", "login", "join", "orgs", "apps", "issues", "pulls",
  "codespaces", "search", "new", "dashboard", "account", "watching", "stars",
];

function getGithubUsernameFromUrl() {
  const match = window.location.pathname.match(/^\/([A-Za-z0-9-]+)\/?$/);
  if (!match) return null;
  const username = match[1];
  if (GITHUB_RESERVED.includes(username.toLowerCase())) return null;
  return username;
}

async function extractGithub() {
  const username = getGithubUsernameFromUrl();
  if (!username) {
    throw new Error("Kein GitHub-Profil auf dieser Seite erkannt.");
  }

  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`);
  if (!response.ok) {
    throw new Error(`GitHub-API antwortete mit Status ${response.status}.`);
  }
  const json = await response.json();
  if (!json || !json.id) {
    throw new Error("Profil-ID nicht in der GitHub-Antwort gefunden.");
  }

  const avatarUrl = json.avatar_url
    ? json.avatar_url + (json.avatar_url.includes("?") ? "&s=460" : "?s=460")
    : null;

  const result = {
    "Profil-ID": json.id,
    "Benutzername": json.login || username,
    "Anzeigename": json.name || null,
    "Bio": json.bio || null,
    "Erstellt am": json.created_at ? json.created_at.slice(0, 10) : null,
    "Firma": json.company || null,
    "Standort": json.location || null,
    "Website": json.blog || null,
    "Konto-Typ": json.type || null,
    "Öffentliche Repos": json.public_repos ?? null,
    "Follower": json.followers ?? null,
    "Folgt": json.following ?? null,
    "Profilbild": avatarUrl,
  };

  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

registerExtractor("GitHub", extractGithub);
