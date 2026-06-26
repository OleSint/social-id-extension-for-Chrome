// Steam: jedes Profil lässt sich mit dem Anhang "?xml=1" als XML-Feed abrufen –
// ein altes, aber bis heute funktionierendes öffentliches Feature der
// Steam Community, das keinen API-Key benötigt (im Gegensatz zur offiziellen
// Steam-Web-API). Bei privaten Profilen liefert der Feed nur eingeschränkte
// Daten – das hängt von der Privatsphäre-Einstellung des jeweiligen Nutzers ab.

function getSteamProfilePathFromUrl() {
  const path = window.location.pathname;
  if (/^\/(id|profiles)\/[^/]+\/?$/.test(path)) return path;
  return null;
}

function stripHtml(html) {
  if (!html) return null;
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent.trim() || null;
}

function getTagText(doc, tagName) {
  const el = doc.querySelector(tagName);
  return el ? el.textContent.trim() : null;
}

async function extractSteam() {
  const profilePath = getSteamProfilePathFromUrl();
  if (!profilePath) {
    throw new Error("Kein Steam-Profil auf dieser Seite erkannt.");
  }

  const xmlUrl = `${window.location.origin}${profilePath}?xml=1`;
  const response = await fetch(xmlUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Steam antwortete mit Status ${response.status}.`);
  }

  const text = await response.text();
  const doc = new DOMParser().parseFromString(text, "text/xml");

  const errorTag = doc.querySelector("error");
  if (errorTag) {
    throw new Error(`Steam-Profil konnte nicht geladen werden: ${errorTag.textContent.trim()}`);
  }

  const steamId64 = getTagText(doc, "steamID64");
  if (!steamId64) {
    throw new Error("SteamID64 nicht in der Profil-Antwort gefunden.");
  }

  const vacBanned = getTagText(doc, "vacBanned");
  const isLimited = getTagText(doc, "isLimitedAccount");

  const result = {
    "Profil-ID (SteamID64)": steamId64,
    "Anzeigename": getTagText(doc, "steamID"),
    "Vanity-URL": getTagText(doc, "customURL"),
    "Echtname": getTagText(doc, "realname"),
    "Bio": stripHtml(getTagText(doc, "summary")),
    "Erstellt am": getTagText(doc, "memberSince"),
    "Standort": getTagText(doc, "location"),
    "Online-Status": getTagText(doc, "stateMessage") || getTagText(doc, "onlineState"),
    "Privatsphäre": getTagText(doc, "privacyState"),
    "VAC-Bann": vacBanned !== null ? (vacBanned === "1" ? "Ja" : "Nein") : null,
    "Eingeschränktes Konto": isLimited !== null ? (isLimited === "1" ? "Ja" : "Nein") : null,
    "Profilbild": getTagText(doc, "avatarFull"),
  };

  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

registerExtractor("Steam", extractSteam);
