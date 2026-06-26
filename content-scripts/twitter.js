// X/Twitter: nutzt den internen GraphQL-Endpoint der Web-App (gleiche Auth wie
// die Seite selbst: Bearer-Token der Web-App + ct0-Cookie als CSRF-Header).
// Hinweis: X ändert queryId/Endpunkte häufiger ohne Vorwarnung – das ist die
// fragilste der hier implementierten Plattformen. Bei Fehlern zeigt das Popup
// eine verständliche Meldung statt eines Absturzes.
const TWITTER_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const TWITTER_USER_BY_SCREEN_NAME_QUERY_ID = "G3KGOASz96M-Qu0nwmGXNg";
const TWITTER_RESERVED = [
  "home", "explore", "notifications", "messages", "i", "settings", "search",
  "compose", "logout", "tos", "privacy", "about",
];

function getTwitterUsernameFromUrl() {
  const match = window.location.pathname.match(/^\/([A-Za-z0-9_]+)\/?$/);
  if (!match) return null;
  const username = match[1];
  if (TWITTER_RESERVED.includes(username.toLowerCase())) return null;
  return username;
}

async function extractTwitter() {
  const username = getTwitterUsernameFromUrl();
  if (!username) {
    throw new Error("Kein X/Twitter-Profil auf dieser Seite erkannt.");
  }

  const csrfToken = getCookie("ct0");
  if (!csrfToken) {
    throw new Error("Kein ct0-Cookie gefunden. Bitte eingeloggt sein.");
  }

  const variables = encodeURIComponent(JSON.stringify({ screen_name: username, withSafetyModeUserFields: true }));
  const features = encodeURIComponent(
    JSON.stringify({
      hidden_profile_likes_enabled: true,
      hidden_profile_subscriptions_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      subscriptions_verification_info_is_identity_verified_enabled: false,
      subscriptions_verification_info_verified_since_enabled: true,
      highlights_tweets_tab_ui_enabled: true,
      responsive_web_twitter_article_notes_tab_enabled: true,
      subscriptions_feature_can_gift_premium: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
    })
  );

  const url = `https://${window.location.hostname}/i/api/graphql/${TWITTER_USER_BY_SCREEN_NAME_QUERY_ID}/UserByScreenName?variables=${variables}&features=${features}`;

  let response;
  try {
    response = await fetch(url, {
      credentials: "include",
      headers: {
        authorization: `Bearer ${TWITTER_BEARER}`,
        "x-csrf-token": csrfToken,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
      },
    });
  } catch (e) {
    throw new Error("Anfrage an X fehlgeschlagen (Netzwerk).");
  }

  if (!response.ok) {
    throw new Error(`X-API antwortete mit Status ${response.status} (API hat sich evtl. geändert).`);
  }

  const json = await response.json();
  const user = findKeyDeep(json, "result");
  const legacy = user && user.legacy;
  const restId = user && user.rest_id;

  if (!restId || !legacy) {
    throw new Error("Profil-ID nicht in der X-Antwort gefunden (API hat sich evtl. geändert).");
  }

  const websiteUrl =
    legacy.entities && legacy.entities.url && legacy.entities.url.urls && legacy.entities.url.urls[0]
      ? legacy.entities.url.urls[0].expanded_url
      : null;

  const result = {
    "Profil-ID": restId,
    "Benutzername": legacy.screen_name || username,
    "Anzeigename": legacy.name || null,
    "Bio": legacy.description || null,
    "Erstellt am": legacy.created_at ? new Date(legacy.created_at).toISOString().slice(0, 10) : null,
    "Verifiziert (legacy)": typeof legacy.verified === "boolean" ? (legacy.verified ? "Ja" : "Nein") : null,
    "Blue-Verified": typeof user.is_blue_verified === "boolean" ? (user.is_blue_verified ? "Ja" : "Nein") : null,
    "Geschütztes Konto": typeof legacy.protected === "boolean" ? (legacy.protected ? "Ja" : "Nein") : null,
    "Follower": legacy.followers_count ?? null,
    "Folgt": legacy.friends_count ?? null,
    "Tweets": legacy.statuses_count ?? null,
    "Gefällt mir-Angaben": legacy.favourites_count ?? null,
    "Medien": legacy.media_count ?? null,
    "Listen-Mitgliedschaften": legacy.listed_count ?? null,
    "Standort": legacy.location || null,
    "Website": websiteUrl,
    "Profilbild": legacy.profile_image_url_https
      ? legacy.profile_image_url_https.replace(/_normal(\.[a-zA-Z]+)$/, "$1")
      : null,
  };

  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

registerExtractor("X / Twitter", extractTwitter);
