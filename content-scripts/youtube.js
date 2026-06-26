// YouTube: Channel-ID steht im canonical-Link, weitere Infos (Beitrittsdatum,
// Abonnentenzahl) stecken im eingebetteten ytInitialData-Objekt.
// Hinweis: Beitrittsdatum, Land und Gesamt-Aufrufe füllt YouTube oft erst,
// wenn man auf dem "Info"-Tab des Kanals ist (.../about), nicht zwingend auf
// der Kanal-Startseite.

function isYoutubeChannelPage() {
  const path = window.location.pathname;
  return /^\/(channel\/|@|c\/|user\/)/.test(path);
}

function extractYoutube() {
  if (!isYoutubeChannelPage()) {
    throw new Error("Keine YouTube-Kanalseite erkannt.");
  }

  const canonical = document.querySelector('link[rel="canonical"]');
  const channelIdMatch = canonical && canonical.href.match(/\/channel\/(UC[\w-]+)/);
  let channelId = channelIdMatch ? channelIdMatch[1] : null;

  const initialData = parseInlineJsonByVarName("var ytInitialData");

  if (!channelId && initialData) {
    channelId = findKeyDeep(initialData, "channelId") || findKeyDeep(initialData, "externalId");
  }

  if (!channelId) {
    throw new Error("Channel-ID konnte nicht gefunden werden.");
  }

  const result = {
    "Channel-ID": channelId,
  };

  if (initialData) {
    const handle = findKeyDeep(initialData, "canonicalBaseUrl");
    const title = findKeyDeep(initialData, "title");
    const subscriberText = findKeyDeep(initialData, "subscriberCountText");
    const joinedText = findKeyDeep(initialData, "joinedDateText");
    const videoCountText = findKeyDeep(initialData, "videoCountText");
    const description = findKeyDeep(initialData, "description");
    const country = findKeyDeep(initialData, "country");
    const viewCountText = findKeyDeep(initialData, "viewCountText");
    const avatarObj = findKeyDeep(initialData, "avatar");
    const thumbnails = avatarObj && avatarObj.thumbnails;

    if (handle) result["Handle"] = handle;
    if (title) result["Kanalname"] = title;
    if (subscriberText) result["Abonnenten"] = subscriberText.simpleText || subscriberText;
    if (joinedText) result["Beigetreten am"] = joinedText.simpleText || joinedText;
    if (videoCountText) result["Videos"] = videoCountText.simpleText || videoCountText;
    if (description) result["Beschreibung"] = typeof description === "string" ? description : null;
    if (country) result["Land"] = country;
    if (viewCountText) result["Aufrufe gesamt"] = viewCountText.simpleText || viewCountText;
    if (thumbnails && thumbnails.length) {
      // YouTube/Google-CDN-Bilder akzeptieren "=s0" als Größenparameter für die
      // unskalierte Originalauflösung statt der sonst nur ~88px großen Vorschau.
      const largest = thumbnails[thumbnails.length - 1].url;
      result["Profilbild"] = largest.replace(/=s\d+[^/]*$/, "=s0");
    }
  }

  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

registerExtractor("YouTube", extractYoutube);
