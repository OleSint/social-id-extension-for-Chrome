// Snapchat: öffentliche Web-Profile (snapchat.com/add/<name>) betten ihre
// Daten im Next.js-eigenen __NEXT_DATA__-Script-Tag ein. Erstellungs-/
// Änderungsdatum stehen zusätzlich als Klartext-Zeitstempel im Seitenquelltext.

function getSnapchatUsernameFromUrl() {
  const match = window.location.pathname.match(/^\/(?:add\/|@)([^/]+)/);
  return match ? match[1] : null;
}

function extractSnapchat() {
  const username = getSnapchatUsernameFromUrl();
  if (!username) {
    throw new Error("Kein Snapchat-Profil auf dieser Seite erkannt (URL-Format: snapchat.com/add/name).");
  }

  const scriptTag = document.getElementById("__NEXT_DATA__");
  if (!scriptTag) {
    throw new Error("Snapchat-Daten konnten nicht gefunden werden. Seite ggf. neu laden.");
  }

  let parsed;
  try {
    parsed = JSON.parse(scriptTag.textContent);
  } catch (e) {
    throw new Error("Snapchat-Daten konnten nicht gelesen werden (Format hat sich evtl. geändert).");
  }

  const profileInfo = findKeyDeep(parsed, "publicProfileInfo");
  if (!profileInfo) {
    throw new Error("Dieses Snapchat-Profil ist nicht öffentlich oder Daten wurden nicht gefunden.");
  }

  const html = document.documentElement.innerHTML;
  const createdMatch = html.match(/"dateCreated":"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)"/);
  const modifiedMatch = html.match(/"dateModified":"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)"/);

  const result = {
    "Benutzername": profileInfo.username || username,
    "Anzeigename": profileInfo.title || null,
    "Bio": profileInfo.bio || null,
    "Standort": profileInfo.address || null,
    "Website": profileInfo.websiteUrl || null,
    "Erstellt am": createdMatch ? new Date(createdMatch[1]).toLocaleString("de-DE") : null,
    "Zuletzt geändert am": modifiedMatch ? new Date(modifiedMatch[1]).toLocaleString("de-DE") : null,
  };

  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

registerExtractor("Snapchat", extractSnapchat);
