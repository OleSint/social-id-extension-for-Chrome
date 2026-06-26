// Bluesky: AT Protocol stellt eine vollständig öffentliche, unauthentifizierte
// API bereit (public.api.bsky.app). Im Gegensatz zu den anderen Plattformen
// ist hier also kein Login im Browser nötig – die Daten sind ohnehin für
// jeden öffentlich abrufbar.

function getBlueskyActorFromUrl() {
  const match = window.location.pathname.match(/^\/profile\/([^/]+)/);
  return match ? match[1] : null;
}

async function extractBluesky() {
  const actor = getBlueskyActorFromUrl();
  if (!actor) {
    throw new Error("Kein Bluesky-Profil auf dieser Seite erkannt (URL-Format: bsky.app/profile/handle).");
  }

  const response = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`
  );
  if (!response.ok) {
    throw new Error(`Bluesky-API antwortete mit Status ${response.status}.`);
  }
  const profile = await response.json();
  if (!profile || !profile.did) {
    throw new Error("Profil-ID (DID) nicht in der Bluesky-Antwort gefunden.");
  }

  const result = {
    "Profil-ID (DID)": profile.did,
    "Handle": profile.handle || actor,
    "Anzeigename": profile.displayName || null,
    "Bio": profile.description || null,
    "Erstellt am": profile.createdAt ? profile.createdAt.slice(0, 10) : null,
    "Follower": profile.followersCount ?? null,
    "Folgt": profile.followsCount ?? null,
    "Beiträge": profile.postsCount ?? null,
    "Betreibt Labeler-Dienst": profile.associated && typeof profile.associated.labeler === "boolean"
      ? (profile.associated.labeler ? "Ja" : "Nein")
      : null,
    "Profilbild": profile.avatar || null,
    "Banner": profile.banner || null,
  };

  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

registerExtractor("Bluesky", extractBluesky);
