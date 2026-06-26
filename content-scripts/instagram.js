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

async function extractInstagram() {
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
