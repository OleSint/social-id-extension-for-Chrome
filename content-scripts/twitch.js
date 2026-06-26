// Twitch: nutzt die interne GraphQL-API (gql.twitch.tv) mit dem öffentlichen
// Web-Client-Id-Header, den die Twitch-Webseite selbst für jeden Besucher
// verwendet (kein eigener API-Key/Secret nötig).
const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const TWITCH_RESERVED = [
  "directory", "settings", "subscriptions", "wallet", "drops", "prime",
  "downloads", "jobs", "p", "turbo", "videos", "clips", "schedule", "about",
  "login", "signup", "search", "friends", "inventory", "wallet", "payments",
];

function getTwitchUsernameFromUrl() {
  const match = window.location.pathname.match(/^\/([A-Za-z0-9_]{2,25})\/?$/);
  if (!match) return null;
  const username = match[1];
  if (TWITCH_RESERVED.includes(username.toLowerCase())) return null;
  return username;
}

async function extractTwitch() {
  const username = getTwitchUsernameFromUrl();
  if (!username) {
    throw new Error("Kein Twitch-Kanal auf dieser Seite erkannt.");
  }

  const query = `
    query {
      user(login: "${username}") {
        id
        login
        displayName
        description
        createdAt
        profileImageURL(width: 300)
        followers { totalCount }
        roles { isPartner isAffiliate isStaff }
        stream { id }
      }
    }
  `;

  const response = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: {
      "Client-Id": TWITCH_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Twitch-API antwortete mit Status ${response.status} (API hat sich evtl. geändert).`);
  }

  const json = await response.json();
  const user = json && json.data && json.data.user;
  if (!user || !user.id) {
    throw new Error("Profil-ID nicht in der Twitch-Antwort gefunden.");
  }

  const result = {
    "Profil-ID": user.id,
    "Benutzername": user.login || username,
    "Anzeigename": user.displayName || null,
    "Bio": user.description || null,
    "Erstellt am": user.createdAt ? user.createdAt.slice(0, 10) : null,
    "Follower": user.followers ? user.followers.totalCount : null,
    "Partner": user.roles && typeof user.roles.isPartner === "boolean" ? (user.roles.isPartner ? "Ja" : "Nein") : null,
    "Affiliate": user.roles && typeof user.roles.isAffiliate === "boolean" ? (user.roles.isAffiliate ? "Ja" : "Nein") : null,
    "Gerade live": user.stream ? "Ja" : "Nein",
    "Profilbild": user.profileImageURL || null,
  };

  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

registerExtractor("Twitch", extractTwitch);
