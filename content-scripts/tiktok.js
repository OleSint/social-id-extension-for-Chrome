// TikTok: Profil-Daten stecken als JSON in einem Hydration-Script auf der Seite.

const TIKTOK_RESERVED = ["foryou", "following", "live", "upload", "explore", "messages", "tag", "video"];

function getTikTokUsernameFromUrl() {
  const match = window.location.pathname.match(/^\/@([^/]+)\/?$/);
  if (!match) return null;
  const username = match[1];
  if (TIKTOK_RESERVED.includes(username.toLowerCase())) return null;
  return username;
}

function extractTikTok() {
  const username = getTikTokUsernameFromUrl();
  if (!username) {
    throw new Error("Kein TikTok-Profil auf dieser Seite erkannt (URL-Format: tiktok.com/@name).");
  }

  const scriptTag = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
  if (!scriptTag) {
    throw new Error("TikTok-Daten konnten nicht gefunden werden. Seite ggf. neu laden.");
  }

  let parsed;
  try {
    parsed = JSON.parse(scriptTag.textContent);
  } catch (e) {
    throw new Error("TikTok-Daten konnten nicht gelesen werden (Format hat sich evtl. geändert).");
  }

  const userDetail = findKeyDeep(parsed, "webapp.user-detail") || findKeyDeep(parsed, "userInfo");
  const userInfo = userDetail && userDetail.userInfo ? userDetail.userInfo : userDetail;
  const user = userInfo && userInfo.user ? userInfo.user : findKeyDeep(parsed, "user");
  const stats = userInfo && userInfo.stats ? userInfo.stats : findKeyDeep(parsed, "stats");

  if (!user || !user.id) {
    throw new Error("Profil-ID nicht in den Seitendaten gefunden.");
  }

  const result = {
    "Profil-ID": user.id,
    "Benutzername": user.uniqueId || username,
    "Anzeigename": user.nickname || null,
    "Bio": user.signature || null,
    "Erstellt am": formatUnixSeconds(user.createTime),
    "Nutzername zuletzt geändert am": user.uniqueIdModifyTime ? formatUnixSeconds(user.uniqueIdModifyTime) : null,
    "Verifiziert": typeof user.verified === "boolean" ? (user.verified ? "Ja" : "Nein") : null,
    "Sec-UID": user.secUid || null,
    "Privates Konto": typeof user.privateAccount === "boolean" ? (user.privateAccount ? "Ja" : "Nein") : null,
    "Region": user.region || null,
    "Business-Konto": user.commerceUserInfo && typeof user.commerceUserInfo.commerceUser === "boolean"
      ? (user.commerceUserInfo.commerceUser ? "Ja" : "Nein")
      : null,
    "TikTok-Shop-Verkäufer": typeof user.ttSeller === "boolean" ? (user.ttSeller ? "Ja" : "Nein") : null,
    "Favoriten öffentlich": typeof user.openFavorite === "boolean" ? (user.openFavorite ? "Ja" : "Nein") : null,
    "Virtueller/KI-Account": typeof user.isADVirtual === "boolean" ? (user.isADVirtual ? "Ja" : "Nein") : null,
    "Profilbild": user.avatarLarger || user.avatarMedium || user.avatarThumb || null,
  };

  if (stats) {
    result["Follower"] = stats.followerCount ?? null;
    result["Folgt"] = stats.followingCount ?? null;
    result["Likes gesamt"] = stats.heartCount ?? null;
    result["Videos"] = stats.videoCount ?? null;
  }

  Object.keys(result).forEach((k) => result[k] === null && delete result[k]);
  return result;
}

registerExtractor("TikTok", extractTikTok);
