// Threads (Meta): teilt sich Backend-Infrastruktur mit Instagram und nutzt
// einen ähnlichen internen web_profile_info-Endpoint mit eigener App-ID.
// Reverse-engineered und nicht offiziell dokumentiert – ähnlich fragil wie
// der X/Twitter-Extraktor, Feldnamen können sich ohne Vorwarnung ändern.
const THREADS_APP_ID = "238260118697367";
const THREADS_RESERVED = ["explore", "search", "activity", "settings", "login", "about", "privacy", "terms"];

function getThreadsUsernameFromUrl() {
  const match = window.location.pathname.match(/^\/@([^/]+)\/?$/);
  if (!match) return null;
  const username = match[1];
  if (THREADS_RESERVED.includes(username.toLowerCase())) return null;
  return username;
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return null;
}

async function extractThreads() {
  const username = getThreadsUsernameFromUrl();
  if (!username) {
    throw new Error("Kein Threads-Profil auf dieser Seite erkannt.");
  }

  let response;
  try {
    response = await fetch(
      `https://${window.location.hostname}/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        credentials: "include",
        headers: { "x-ig-app-id": THREADS_APP_ID },
      }
    );
  } catch (e) {
    throw new Error(`Anfrage an Threads fehlgeschlagen (${e && e.message ? e.message : "Netzwerk"}).`);
  }

  if (!response.ok) {
    throw new Error(`Threads-API antwortete mit Status ${response.status} (API hat sich evtl. geändert).`);
  }

  const json = await response.json();
  const user = json && json.data && json.data.user;
  const id = user ? pickFirst(user, ["pk", "id", "user_id"]) : null;
  if (!user || !id) {
    throw new Error("Profil-ID nicht in der Threads-Antwort gefunden (API hat sich evtl. geändert).");
  }

  const result = {
    "Profil-ID": id,
    "Benutzername": user.username || username,
    "Anzeigename": pickFirst(user, ["full_name"]),
    "Bio": pickFirst(user, ["biography"]),
    "Privates Konto": typeof user.is_private === "boolean" ? (user.is_private ? "Ja" : "Nein") : null,
    "Verifiziert": typeof user.is_verified === "boolean" ? (user.is_verified ? "Ja" : "Nein") : null,
    "Follower": pickFirst(user, ["follower_count", "text_post_app_follower_count"]),
    "Profilbild": pickFirst(user, ["profile_pic_url_hd", "profile_pic_url", "hd_profile_pic_url_info"]),
  };

  if (result.Profilbild && typeof result.Profilbild === "object") {
    result.Profilbild = result.Profilbild.url || null;
  }

  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

registerExtractor("Threads", extractThreads);
