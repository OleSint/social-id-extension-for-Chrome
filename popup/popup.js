const SUPPORTED_HOSTS = [
  "www.instagram.com",
  "twitter.com",
  "x.com",
  "www.tiktok.com",
  "www.facebook.com",
  "m.facebook.com",
  "www.youtube.com",
  "www.reddit.com",
  "old.reddit.com",
  "bsky.app",
  "github.com",
  "www.twitch.tv",
  "www.pinterest.com",
  "www.threads.net",
  "www.threads.com",
  "steamcommunity.com",
];

const contentEl = document.getElementById("content");
const platformLabelEl = document.getElementById("platform-label");
const refreshBtn = document.getElementById("refresh");

function isSupportedHost(hostname) {
  return SUPPORTED_HOSTS.includes(hostname);
}

function renderHint(text) {
  contentEl.innerHTML = `<p class="hint">${text}</p>`;
}

function renderError(text) {
  contentEl.innerHTML = `<p class="error">${text}</p>`;
}

const IMAGE_KEYS = ["Profilbild", "Banner", "Medium"];

function guessImageExtension(url) {
  const match = url.match(/\.(jpe?g|png|webp|gif|bmp|mp4|webm|mov)(?:[?#]|$)/i);
  return match ? match[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

const CONTENT_TYPE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

function extensionFromContentType(contentType) {
  if (CONTENT_TYPE_EXTENSIONS[contentType]) return CONTENT_TYPE_EXTENSIONS[contentType];
  const sub = (contentType || "").split("/")[1];
  return sub || "bin";
}

// Mastodon hat keinen festen content_scripts-Eintrag (siehe mastodonProbe
// weiter unten), daher läuft der Medien-Abruf für Mastodon-Beiträge über
// executeScript statt über chrome.tabs.sendMessage wie bei den anderen
// Plattformen (deren gemeinsamer FETCH_MEDIA_AS_DATA_URL-Handler in
// common.js registriert ist).
async function mastodonFetchMediaProbe(url) {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return { success: false, error: `Status ${res.status}` };
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^(image|video)\//.test(contentType)) {
      return {
        success: false,
        error: `Unerwarteter Inhaltstyp (${contentType || "unbekannt"}) – vermutlich kein direkter Medien-Link.`,
      };
    }
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Lesen fehlgeschlagen."));
      reader.readAsDataURL(blob);
    });
    return { success: true, dataUrl, contentType };
  } catch (e) {
    return { success: false, error: "Anfrage fehlgeschlagen (Netzwerk)." };
  }
}

async function fetchMediaDataUrl(tab, url, isMastodon) {
  if (isMastodon) {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: mastodonFetchMediaProbe,
      args: [url],
    });
    return injection && injection.result;
  }
  return chrome.tabs.sendMessage(tab.id, { type: "FETCH_MEDIA_AS_DATA_URL", url });
}

function renderData(platform, data) {
  platformLabelEl.textContent = platform;
  const textEntries = Object.entries(data).filter(([key]) => !IMAGE_KEYS.includes(key));
  const imageEntries = Object.entries(data).filter(([key]) => IMAGE_KEYS.includes(key));

  const rows = textEntries
    .map(([key, value]) => {
      const isId = key.toLowerCase().includes("id");
      const escapedValue = String(value).replace(/</g, "&lt;");
      if (isId) {
        return `<tr class="id-row"><td class="key">${key}</td><td class="value"><span>${escapedValue}</span><button class="copy-btn" data-copy="${escapedValue}">Kopieren</button></td></tr>`;
      }
      return `<tr><td class="key">${key}</td><td class="value">${escapedValue}</td></tr>`;
    })
    .join("");
  contentEl.innerHTML = `<table>${rows}</table>`;

  contentEl.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = "Kopiert!";
      setTimeout(() => (btn.textContent = "Kopieren"), 1200);
    });
  });

  imageEntries.forEach(([key, url]) => {
    const block = document.createElement("div");
    block.className = "image-block";

    const label = document.createElement("div");
    label.className = "image-label";
    label.textContent = key;
    block.appendChild(label);

    const img = document.createElement("img");
    img.className = "image-preview";
    img.referrerPolicy = "no-referrer";
    img.alt = key;
    img.addEventListener("error", () => {
      img.replaceWith(Object.assign(document.createElement("p"), {
        className: "hint",
        textContent: "Keine Vorschau möglich (Plattform blockt das Einbetten) – Download funktioniert trotzdem.",
      }));
    });
    img.src = url;
    block.appendChild(img);

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "download-btn";
    downloadBtn.textContent = `${key} herunterladen`;

    if (key === "Medium") {
      // Postings-Medien (im Gegensatz zu Profilbildern) liegen häufig hinter
      // signierten/geschützten CDN-URLs, die ohne die Session-Cookies der
      // Seite eine HTML-Fehler-/Login-Seite statt der echten Datei liefern.
      // Daher: Fetch innerhalb der Seite + Content-Type-Prüfung statt
      // direktem chrome.downloads.download() auf die rohe URL.
      downloadBtn.addEventListener("click", async () => {
        downloadBtn.disabled = true;
        downloadBtn.textContent = "Lade Medium…";
        try {
          const tab = await getActiveTab();
          const result = await fetchMediaDataUrl(tab, url, platform === "Mastodon");
          if (!result || !result.success) {
            throw new Error((result && result.error) || "Unbekannter Fehler.");
          }
          const ext = extensionFromContentType(result.contentType);
          const safePlatform = platform.replace(/[^a-zA-Z0-9]+/g, "_");
          await chrome.downloads.download({
            url: result.dataUrl,
            filename: `medium_${safePlatform}.${ext}`,
            saveAs: true,
          });
          downloadBtn.textContent = `${key} herunterladen`;
        } catch (e) {
          downloadBtn.textContent = `Fehler: ${e.message}`;
        } finally {
          downloadBtn.disabled = false;
        }
      });
    } else {
      downloadBtn.addEventListener("click", () => {
        const ext = guessImageExtension(url);
        const safePlatform = platform.replace(/[^a-zA-Z0-9]+/g, "_");
        const safeKey = key.replace(/[^a-zA-Z0-9]+/g, "_");
        chrome.downloads.download({
          url,
          filename: `${safeKey}_${safePlatform}.${ext}`,
          saveAs: true,
        });
      });
    }
    block.appendChild(downloadBtn);

    contentEl.appendChild(block);
  });

  if (platform === "Facebook" && (data["Benutzername"] || data["Anzeigename"])) {
    renderFacebookSearchBlock(data["Benutzername"] || data["Anzeigename"]);
  }

  const postsLink = getPostsLinkForPlatform(platform, data);
  if (postsLink) {
    renderLinkButtonBlock(postsLink.label, postsLink.url);
  }

  if (platform === "Reddit" && data["Benutzername"]) {
    renderRedditArchiveBlock(data);
  }

  if (platform === "Bluesky" && data["Handle"]) {
    renderBlueskyArchiveBlock(data);
  }

  if (platform === "Mastodon" && data["Benutzername"]) {
    renderMastodonArchiveBlock(data);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRedditArchiveHtml(username, profileData, items) {
  const generatedAt = new Date().toLocaleString("de-DE");
  const profileRows = Object.entries(profileData || {})
    .filter(([key]) => key !== "Profilbild")
    .map(([key, value]) => `<tr><td class="key">${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join("");

  const itemsHtml = items
    .map((item) => {
      const date = item.created_utc ? new Date(item.created_utc * 1000).toLocaleString("de-DE") : "";
      const permalink = item.permalink ? `https://www.reddit.com${item.permalink}` : null;
      if (item.kind === "t3") {
        const body = item.selftext ? `<p>${escapeHtml(item.selftext).replace(/\n/g, "<br>")}</p>` : "";
        return `<article class="post">
          <div class="meta">📝 Beitrag in r/${escapeHtml(item.subreddit || "")} · ${date} · ${item.score ?? 0} Punkte · ${item.num_comments ?? 0} Kommentare</div>
          <h3>${permalink ? `<a href="${permalink}" target="_blank">${escapeHtml(item.title || "")}</a>` : escapeHtml(item.title || "")}</h3>
          ${body}
        </article>`;
      }
      return `<article class="comment">
        <div class="meta">💬 Kommentar in r/${escapeHtml(item.subreddit || "")} · ${date} · ${item.score ?? 0} Punkte${item.link_title ? ` · zu „${escapeHtml(item.link_title)}"` : ""}</div>
        <p>${escapeHtml(item.body || "").replace(/\n/g, "<br>")}</p>
        ${permalink ? `<a class="permalink" href="${permalink}" target="_blank">Zum Original →</a>` : ""}
      </article>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Reddit-Sicherung u/${escapeHtml(username)} – ${generatedAt}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px; margin: 24px auto; padding: 0 16px; color: #1a1a1b; }
  h1 { font-size: 22px; }
  table { border-collapse: collapse; margin: 12px 0 24px; }
  td { padding: 3px 10px 3px 0; vertical-align: top; }
  td.key { color: #666; }
  article { border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; margin-bottom: 12px; }
  article.comment { background: #f8f9fa; }
  .meta { font-size: 12px; color: #666; margin-bottom: 6px; }
  h3 { margin: 0 0 6px; }
  a.permalink { font-size: 12px; }
  footer { margin-top: 24px; font-size: 11px; color: #999; }
</style>
</head>
<body>
  <h1>Reddit-Sicherung: u/${escapeHtml(username)}</h1>
  <table>${profileRows}</table>
  <p>${items.length} Beiträge/Kommentare gesichert, gesammelt am ${generatedAt}.</p>
  ${itemsHtml}
  <footer>Erstellt mit Social ID Viewer. Hinweis: Reddits Listing-API liefert in der Regel nur die letzten ca. 1000 Einträge eines Profils.</footer>
</body>
</html>`;
}

function renderRedditArchiveBlock(profileData) {
  const block = document.createElement("div");
  block.className = "image-block";

  const btn = document.createElement("button");
  btn.className = "download-btn";
  btn.textContent = "Profil als HTML sichern";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Sammle Beiträge… (kann etwas dauern, Popup bitte offen lassen)";
    try {
      const tab = await getActiveTab();
      const response = await chrome.tabs.sendMessage(tab.id, { type: "BUILD_REDDIT_ARCHIVE" });
      if (!response || !response.success) {
        throw new Error((response && response.error) || "Unbekannter Fehler.");
      }
      const html = buildRedditArchiveHtml(response.username, profileData, response.items);
      const safeName = response.username.replace(/[^a-zA-Z0-9]+/g, "_");
      const dateStr = new Date().toISOString().slice(0, 10);
      await downloadHtmlBlob(html, `reddit_${safeName}_backup_${dateStr}.html`);
      btn.textContent = `Fertig: ${response.items.length} Beiträge/Kommentare gesichert`;
    } catch (e) {
      btn.textContent = `Fehler: ${e.message} – erneut versuchen`;
      btn.disabled = false;
    }
  });
  block.appendChild(btn);
  contentEl.appendChild(block);
}

function downloadHtmlBlob(html, filename) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  return chrome.downloads.download({ url, filename, saveAs: true });
}

function buildBlueskyArchiveHtml(handle, profileData, items) {
  const generatedAt = new Date().toLocaleString("de-DE");
  const profileRows = Object.entries(profileData || {})
    .filter(([key]) => !["Profilbild", "Banner"].includes(key))
    .map(([key, value]) => `<tr><td class="key">${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join("");

  const itemsHtml = items
    .map((item) => {
      const post = item.post;
      if (!post) return "";
      const record = post.record || {};
      const date = record.createdAt ? new Date(record.createdAt).toLocaleString("de-DE") : "";
      const text = escapeHtml(record.text || "").replace(/\n/g, "<br>");
      const isRepost = !!item.reason;
      const counts = `${post.likeCount ?? 0} Likes · ${post.repostCount ?? 0} Reposts · ${post.replyCount ?? 0} Antworten`;

      let mediaHtml = "";
      if (post.embed && Array.isArray(post.embed.images)) {
        mediaHtml = post.embed.images
          .map((img) => `<img src="${img.fullsize}" alt="${escapeHtml(img.alt || "")}" loading="lazy">`)
          .join("");
      } else if (post.embed && post.embed.external) {
        mediaHtml = `<div class="embed-link"><a href="${post.embed.external.uri}" target="_blank">${escapeHtml(post.embed.external.title || post.embed.external.uri)}</a></div>`;
      }

      const likersHtml =
        item.likers && item.likers.length
          ? `<div class="likers">❤️ Geliked von: ${item.likers.map((h) => escapeHtml(h)).join(", ")}</div>`
          : "";

      const repliesHtml =
        item.replies && item.replies.length
          ? `<div class="replies">${item.replies
              .map(
                (r) =>
                  `<div class="reply"><strong>@${escapeHtml(r.handle)}</strong> (${r.createdAt ? new Date(r.createdAt).toLocaleString("de-DE") : ""}): ${escapeHtml(r.text).replace(/\n/g, "<br>")} <span class="meta">${r.likeCount ?? 0} Likes</span></div>`
              )
              .join("")}</div>`
          : "";

      return `<article class="post">
        <div class="meta">${isRepost ? "🔁 Repost · " : ""}${date} · ${counts}</div>
        <p>${text}</p>
        ${mediaHtml}
        ${likersHtml}
        ${repliesHtml}
      </article>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Bluesky-Sicherung @${escapeHtml(handle)} – ${generatedAt}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px; margin: 24px auto; padding: 0 16px; color: #0f1419; }
  h1 { font-size: 22px; }
  table { border-collapse: collapse; margin: 12px 0 24px; }
  td { padding: 3px 10px 3px 0; vertical-align: top; }
  td.key { color: #666; }
  article { border: 1px solid #ddd; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
  .meta { font-size: 12px; color: #666; margin-bottom: 6px; }
  img { max-width: 100%; border-radius: 6px; margin-top: 6px; display: block; }
  .likers { font-size: 12px; margin-top: 8px; color: #555; }
  .replies { margin-top: 10px; border-top: 1px solid #eee; padding-top: 8px; }
  .reply { font-size: 13px; margin-bottom: 6px; }
  .reply .meta { display: inline; }
  .embed-link { margin-top: 6px; font-size: 13px; }
  footer { margin-top: 24px; font-size: 11px; color: #999; }
</style>
</head>
<body>
  <h1>Bluesky-Sicherung: @${escapeHtml(handle)}</h1>
  <table>${profileRows}</table>
  <p>${items.length} Beiträge gesichert (inkl. Antworten & Likern, soweit verfügbar), gesammelt am ${generatedAt}.</p>
  ${itemsHtml}
  <footer>Erstellt mit Social ID Viewer. Begrenzt auf die letzten 100 Beiträge pro Sicherung.</footer>
</body>
</html>`;
}

function renderBlueskyArchiveBlock(profileData) {
  const block = document.createElement("div");
  block.className = "image-block";

  const btn = document.createElement("button");
  btn.className = "download-btn";
  btn.textContent = "Profil als HTML sichern";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Sammle Beiträge, Antworten & Liker… (kann etwas dauern, Popup bitte offen lassen)";
    try {
      const tab = await getActiveTab();
      const response = await chrome.tabs.sendMessage(tab.id, { type: "BUILD_BLUESKY_ARCHIVE" });
      if (!response || !response.success) {
        throw new Error((response && response.error) || "Unbekannter Fehler.");
      }
      const html = buildBlueskyArchiveHtml(response.handle, profileData, response.items);
      const safeName = response.handle.replace(/[^a-zA-Z0-9]+/g, "_");
      const dateStr = new Date().toISOString().slice(0, 10);
      await downloadHtmlBlob(html, `bluesky_${safeName}_backup_${dateStr}.html`);
      btn.textContent = `Fertig: ${response.items.length} Beiträge gesichert`;
    } catch (e) {
      btn.textContent = `Fehler: ${e.message} – erneut versuchen`;
      btn.disabled = false;
    }
  });
  block.appendChild(btn);
  contentEl.appendChild(block);
}

// Mastodon hat keinen festen content_scripts-Eintrag (siehe mastodonProbe
// weiter unten), daher läuft die Sicherung über dieselbe activeTab +
// scripting.executeScript-Technik statt über chrome.tabs.sendMessage.
async function mastodonArchiveProbe() {
  function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return div.textContent.trim();
  }
  const match = location.pathname.match(/^\/@([^/]+)\/?$/);
  if (!match) {
    return { success: false, error: "Keine Mastodon-Profil-URL erkannt." };
  }
  const username = match[1];
  try {
    const lookupRes = await fetch(`https://${location.hostname}/api/v1/accounts/lookup?acct=${encodeURIComponent(username)}`);
    if (!lookupRes.ok) {
      return { success: false, error: `Account-Lookup fehlgeschlagen (Status ${lookupRes.status}).` };
    }
    const account = await lookupRes.json();

    const MAX_POSTS = 100;
    const statuses = [];
    let maxId = null;
    while (statuses.length < MAX_POSTS) {
      const url = `https://${location.hostname}/api/v1/accounts/${account.id}/statuses?limit=40&exclude_replies=false${maxId ? `&max_id=${maxId}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) break;
      const batch = await res.json();
      if (!batch.length) break;
      statuses.push(...batch);
      maxId = batch[batch.length - 1].id;
      if (batch.length < 40) break;
    }
    statuses.length = Math.min(statuses.length, MAX_POSTS);

    for (const status of statuses) {
      try {
        const ctxRes = await fetch(`https://${location.hostname}/api/v1/statuses/${status.id}/context`);
        if (ctxRes.ok) {
          const ctx = await ctxRes.json();
          status._replies = (ctx.descendants || []).map((d) => ({
            handle: d.account ? d.account.acct : "?",
            text: stripHtml(d.content),
            createdAt: d.created_at,
            likeCount: d.favourites_count ?? 0,
          }));
        }
      } catch (e) {
        // Kontext ggf. nicht verfügbar – kein Abbruch der gesamten Sicherung
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    return { success: true, username: account.username, hostname: location.hostname, statuses };
  } catch (e) {
    return { success: false, error: "Anfrage fehlgeschlagen (Netzwerk)." };
  }
}

function buildMastodonArchiveHtml(username, hostname, profileData, statuses) {
  const generatedAt = new Date().toLocaleString("de-DE");
  const profileRows = Object.entries(profileData || {})
    .filter(([key]) => !["Profilbild", "Banner"].includes(key))
    .map(([key, value]) => `<tr><td class="key">${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join("");

  const div = document.createElement("div");
  function stripHtmlLocal(html) {
    div.innerHTML = html || "";
    return div.textContent.trim();
  }

  const itemsHtml = statuses
    .map((status) => {
      const date = status.created_at ? new Date(status.created_at).toLocaleString("de-DE") : "";
      const text = escapeHtml(stripHtmlLocal(status.content)).replace(/\n/g, "<br>");
      const counts = `${status.favourites_count ?? 0} Likes · ${status.reblogs_count ?? 0} Boosts · ${status.replies_count ?? 0} Antworten`;
      const mediaHtml = (status.media_attachments || [])
        .map((m) => (m.type === "image" ? `<img src="${m.url}" alt="${escapeHtml(m.description || "")}" loading="lazy">` : `<div class="embed-link"><a href="${m.url}" target="_blank">Medien-Anhang (${escapeHtml(m.type)})</a></div>`))
        .join("");
      const repliesHtml =
        status._replies && status._replies.length
          ? `<div class="replies">${status._replies
              .map(
                (r) =>
                  `<div class="reply"><strong>@${escapeHtml(r.handle)}</strong> (${r.createdAt ? new Date(r.createdAt).toLocaleString("de-DE") : ""}): ${escapeHtml(r.text).replace(/\n/g, "<br>")} <span class="meta">${r.likeCount} Likes</span></div>`
              )
              .join("")}</div>`
          : "";
      return `<article class="post">
        <div class="meta">${date} · ${counts}</div>
        <p>${text}</p>
        ${mediaHtml}
        ${repliesHtml}
        <a class="permalink" href="${status.url}" target="_blank">Zum Original →</a>
      </article>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Mastodon-Sicherung @${escapeHtml(username)}@${escapeHtml(hostname)} – ${generatedAt}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px; margin: 24px auto; padding: 0 16px; color: #1a1a2e; }
  h1 { font-size: 22px; }
  table { border-collapse: collapse; margin: 12px 0 24px; }
  td { padding: 3px 10px 3px 0; vertical-align: top; }
  td.key { color: #666; }
  article { border: 1px solid #ddd; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
  .meta { font-size: 12px; color: #666; margin-bottom: 6px; }
  img { max-width: 100%; border-radius: 6px; margin-top: 6px; display: block; }
  .replies { margin-top: 10px; border-top: 1px solid #eee; padding-top: 8px; }
  .reply { font-size: 13px; margin-bottom: 6px; }
  a.permalink { font-size: 12px; }
  footer { margin-top: 24px; font-size: 11px; color: #999; }
</style>
</head>
<body>
  <h1>Mastodon-Sicherung: @${escapeHtml(username)}@${escapeHtml(hostname)}</h1>
  <table>${profileRows}</table>
  <p>${statuses.length} Beiträge gesichert (inkl. Antworten, soweit verfügbar), gesammelt am ${generatedAt}.</p>
  ${itemsHtml}
  <footer>Erstellt mit Social ID Viewer. Begrenzt auf die letzten 100 Beiträge pro Sicherung. Wer einen Beitrag geliked hat, ist über die Mastodon-API meist nicht öffentlich einsehbar.</footer>
</body>
</html>`;
}

function renderMastodonArchiveBlock(profileData) {
  const block = document.createElement("div");
  block.className = "image-block";

  const btn = document.createElement("button");
  btn.className = "download-btn";
  btn.textContent = "Profil als HTML sichern";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Sammle Beiträge & Antworten… (kann etwas dauern, Popup bitte offen lassen)";
    try {
      const tab = await getActiveTab();
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: mastodonArchiveProbe,
      });
      const response = injection && injection.result;
      if (!response || !response.success) {
        throw new Error((response && response.error) || "Unbekannter Fehler.");
      }
      const html = buildMastodonArchiveHtml(response.username, response.hostname, profileData, response.statuses);
      const safeName = response.username.replace(/[^a-zA-Z0-9]+/g, "_");
      const dateStr = new Date().toISOString().slice(0, 10);
      await downloadHtmlBlob(html, `mastodon_${safeName}_backup_${dateStr}.html`);
      btn.textContent = `Fertig: ${response.statuses.length} Beiträge gesichert`;
    } catch (e) {
      btn.textContent = `Fehler: ${e.message} – erneut versuchen`;
      btn.disabled = false;
    }
  });
  block.appendChild(btn);
  contentEl.appendChild(block);
}

// Reddit, Bluesky, Mastodon und X bieten – anders als Facebook – einen
// offiziellen, direkten Weg, alle öffentlichen Beiträge inkl. Antworten eines
// Nutzers zu sehen, ohne Namens-Rätselraten in einer allgemeinen Suche.
function getPostsLinkForPlatform(platform, data) {
  if (platform === "Reddit" && data["Benutzername"]) {
    return {
      label: "Alle Beiträge & Kommentare anzeigen",
      url: `https://www.reddit.com/user/${encodeURIComponent(data["Benutzername"])}/comments/`,
    };
  }
  if (platform === "Bluesky" && data["Handle"]) {
    return {
      label: "Beiträge & Antworten anzeigen",
      url: `https://bsky.app/profile/${encodeURIComponent(data["Handle"])}/replies`,
    };
  }
  if (platform === "Mastodon" && data["Benutzername"]) {
    const match = data["Benutzername"].match(/^@([^@]+)@(.+)$/);
    if (match) {
      return {
        label: "Beiträge & Antworten anzeigen",
        url: `https://${match[2]}/@${encodeURIComponent(match[1])}/with_replies`,
      };
    }
  }
  if (platform === "X / Twitter" && data["Benutzername"]) {
    return {
      label: "Tweets & Antworten anzeigen",
      url: `https://x.com/search?q=${encodeURIComponent("from:" + data["Benutzername"])}&src=typed_query&f=live`,
    };
  }
  return null;
}

function renderLinkButtonBlock(label, url) {
  const block = document.createElement("div");
  block.className = "image-block";

  const btn = document.createElement("button");
  btn.className = "download-btn";
  btn.textContent = label;
  btn.addEventListener("click", () => chrome.tabs.create({ url }));
  block.appendChild(btn);

  contentEl.appendChild(block);
}

// Eine reine "Im Profil suchen" (facebook.com/profile/<id>/search/) findet laut
// Erfahrungswerten öffentliche Kommentare unter fremden Beiträgen nicht
// zuverlässig. Die globale Facebook-Suche nach dem Namen (search/posts/?q=...)
// liefert das deutlich verlässlicher, daher wird hier immer der Name als
// Suchbegriff verwendet statt frei wählbarer Begriffe innerhalb des Profils.
function renderFacebookSearchBlock(displayName) {
  const block = document.createElement("div");
  block.className = "image-block";

  const label = document.createElement("div");
  label.className = "image-label";
  label.textContent = "Nach Namen suchen (findet öffentliche Kommentare zuverlässiger)";
  block.appendChild(label);

  const row = document.createElement("div");
  row.className = "search-row";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "search-input";
  input.value = displayName;
  row.appendChild(input);

  const searchBtn = document.createElement("button");
  searchBtn.className = "download-btn";
  searchBtn.textContent = "Suchen";
  const openSearch = () => {
    const term = input.value.trim();
    if (!term) return;
    const url = `https://www.facebook.com/search/posts/?q=${encodeURIComponent(term)}`;
    chrome.tabs.create({ url });
  };
  searchBtn.addEventListener("click", openSearch);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openSearch();
  });
  row.appendChild(searchBtn);

  block.appendChild(row);
  contentEl.appendChild(block);
}

// Mastodon ist dezentral (jede Instanz eine eigene Domain), daher gibt es
// dafür keinen festen Eintrag in content_scripts/manifest.json. Stattdessen
// wird per activeTab + scripting.executeScript ad hoc geprüft, ob die
// gerade geöffnete Domain eine Mastodon-kompatible (öffentliche!) API
// bereitstellt – ganz ohne breite Host-Berechtigungen für alle Domains.
async function mastodonProbe() {
  function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return div.textContent.trim();
  }

  const postMatch = location.pathname.match(/^\/@[^/]+\/(\d+)\/?$/);
  if (postMatch) {
    try {
      const res = await fetch(`https://${location.hostname}/api/v1/statuses/${postMatch[1]}`);
      if (!res.ok) {
        return { success: false, error: `Mastodon-API antwortete mit Status ${res.status}.` };
      }
      const status = await res.json();
      const mediaUrl =
        status.media_attachments && status.media_attachments[0] ? status.media_attachments[0].url : null;
      const data = {
        "Gepostet am": status.created_at ? new Date(status.created_at).toLocaleString("de-DE") : null,
        "Text": stripHtml(status.content) || null,
        "Likes": status.favourites_count ?? null,
        "Boosts": status.reblogs_count ?? null,
        "Antworten": status.replies_count ?? null,
        "Medium": mediaUrl,
      };
      Object.keys(data).forEach((k) => (data[k] === null || data[k] === undefined) && delete data[k]);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: "Anfrage fehlgeschlagen (Netzwerk)." };
    }
  }

  const match = location.pathname.match(/^\/@([^/]+)\/?$/);
  if (!match) {
    return { success: false, error: "Keine Mastodon-Profil-URL erkannt (Format: instanz.tld/@name)." };
  }
  const username = match[1];
  try {
    const res = await fetch(
      `https://${location.hostname}/api/v1/accounts/lookup?acct=${encodeURIComponent(username)}`
    );
    if (!res.ok) {
      return { success: false, error: `Keine Mastodon-kompatible API gefunden (Status ${res.status}).` };
    }
    const acc = await res.json();
    if (!acc || !acc.id) {
      return { success: false, error: "Profil-ID nicht in der Antwort gefunden." };
    }
    const data = {
      "Profil-ID": acc.id,
      "Benutzername": `@${acc.username}@${location.hostname}`,
      "Anzeigename": acc.display_name || null,
      "Bio": stripHtml(acc.note) || null,
      "Erstellt am": acc.created_at ? acc.created_at.slice(0, 10) : null,
      "Follower": acc.followers_count ?? null,
      "Folgt": acc.following_count ?? null,
      "Beiträge": acc.statuses_count ?? null,
      "Bot-Account": typeof acc.bot === "boolean" ? (acc.bot ? "Ja" : "Nein") : null,
      "Privates Konto": typeof acc.locked === "boolean" ? (acc.locked ? "Ja" : "Nein") : null,
      "Profilbild": acc.avatar || null,
      "Banner": acc.header || null,
    };
    Object.keys(data).forEach((k) => (data[k] === null || data[k] === undefined) && delete data[k]);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: "Anfrage fehlgeschlagen (Netzwerk oder keine Mastodon-Instanz)." };
  }
}

async function tryMastodonFallback(tab) {
  renderHint("Prüfe auf Mastodon/Fediverse-Profil…");
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: mastodonProbe,
    });
    const result = injection && injection.result;
    if (result && result.success) {
      renderData("Mastodon", result.data);
    } else {
      renderHint((result && result.error) || "Diese Plattform wird (noch) nicht unterstützt.");
    }
  } catch (e) {
    renderHint("Diese Plattform wird (noch) nicht unterstützt.");
  }
  renderMastodonIdOpenerBlock(tab);
}

// "Profil per ID öffnen": auf Plattformen, bei denen man die ID nicht einfach
// in die URL einsetzen kann (z. B. Instagram, X), bräuchte es zusätzlich eine
// zuverlässige ID→Username-Auflösung. Hier sind nur die Plattformen
// aufgenommen, bei denen das entweder gar nicht nötig ist (ID direkt in der
// URL nutzbar) oder über eine stabile, öffentliche API zuverlässig
// funktioniert.
function getIdOpenerConfig(hostname) {
  if (hostname === "www.facebook.com" || hostname === "m.facebook.com") {
    return {
      platform: "Facebook",
      placeholder: "Numerische ID (z. B. 100012345678901)",
      build: (id) => `https://www.facebook.com/profile.php?id=${encodeURIComponent(id)}`,
    };
  }
  if (hostname === "www.instagram.com") {
    return {
      platform: "Instagram",
      placeholder: "Numerische User-ID",
      build: (id) => `https://www.instagram.com/uid/${encodeURIComponent(id)}`,
    };
  }
  if (hostname === "www.tiktok.com") {
    return {
      platform: "TikTok",
      placeholder: "Numerische User-ID",
      build: (id) => `https://www.tiktok.com/@${encodeURIComponent(id)}`,
    };
  }
  if (hostname === "www.youtube.com") {
    return {
      platform: "YouTube",
      placeholder: "Channel-ID (UC…)",
      build: (id) => `https://www.youtube.com/channel/${encodeURIComponent(id)}`,
    };
  }
  if (hostname === "bsky.app") {
    return {
      platform: "Bluesky",
      placeholder: "DID (did:plc:…) oder Handle",
      build: (id) => `https://bsky.app/profile/${encodeURIComponent(id)}`,
    };
  }
  if (hostname === "steamcommunity.com") {
    return {
      platform: "Steam",
      placeholder: "SteamID64 (17-stellig)",
      build: (id) => `https://steamcommunity.com/profiles/${encodeURIComponent(id)}`,
    };
  }
  if (hostname === "github.com") {
    return {
      platform: "GitHub",
      placeholder: "Numerische User-ID",
      lookup: async (id) => {
        const res = await fetch(`https://api.github.com/user/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`GitHub-API antwortete mit Status ${res.status}.`);
        const json = await res.json();
        if (!json.login) throw new Error("Kein GitHub-Nutzer mit dieser ID gefunden.");
        return `https://github.com/${json.login}`;
      },
    };
  }
  return null;
}

function renderIdOpenerBlock(config) {
  const block = document.createElement("div");
  block.className = "image-block";

  const label = document.createElement("div");
  label.className = "image-label";
  label.textContent = `${config.platform}-Profil per ID öffnen`;
  block.appendChild(label);

  if (config.warning) {
    const warning = document.createElement("div");
    warning.className = "hint";
    warning.style.marginBottom = "4px";
    warning.textContent = config.warning;
    block.appendChild(warning);
  }

  const row = document.createElement("div");
  row.className = "search-row";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "search-input";
  input.placeholder = config.placeholder || "ID eingeben…";
  row.appendChild(input);

  const btn = document.createElement("button");
  btn.className = "download-btn";
  btn.textContent = "Öffnen";
  const openById = async () => {
    const id = input.value.trim();
    if (!id) return;
    btn.disabled = true;
    btn.textContent = "Suche…";
    try {
      const url = config.build ? config.build(id) : await config.lookup(id);
      chrome.tabs.create({ url });
      btn.textContent = "Öffnen";
    } catch (e) {
      btn.textContent = `Fehler: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  };
  btn.addEventListener("click", openById);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openById();
  });
  row.appendChild(btn);

  block.appendChild(row);
  contentEl.appendChild(block);
}

// Mastodon: ID→Username-Auflösung ist instanzspezifisch (jede Domain hat ihre
// eigene API), läuft daher wie die anderen Mastodon-Funktionen über
// activeTab + scripting.executeScript statt über einen festen Endpunkt.
async function mastodonLookupByIdProbe(id) {
  try {
    const res = await fetch(`https://${location.hostname}/api/v1/accounts/${encodeURIComponent(id)}`);
    if (!res.ok) {
      return { success: false, error: `Mastodon-API antwortete mit Status ${res.status}.` };
    }
    const acc = await res.json();
    if (!acc.username) {
      return { success: false, error: "Kein Account mit dieser ID gefunden." };
    }
    return { success: true, url: `https://${location.hostname}/@${acc.username}` };
  } catch (e) {
    return { success: false, error: "Anfrage fehlgeschlagen." };
  }
}

function renderMastodonIdOpenerBlock(tab) {
  renderIdOpenerBlock({
    platform: "Mastodon",
    placeholder: "Numerische Account-ID",
    lookup: async (id) => {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: mastodonLookupByIdProbe,
        args: [id],
      });
      const result = injection && injection.result;
      if (!result || !result.success) {
        throw new Error((result && result.error) || "Unbekannter Fehler.");
      }
      return result.url;
    },
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function run() {
  platformLabelEl.textContent = "";
  renderHint("Lade…");

  const tab = await getActiveTab();
  if (!tab || !tab.url) {
    renderHint("Kein aktiver Tab gefunden.");
    return;
  }

  let hostname;
  try {
    hostname = new URL(tab.url).hostname;
  } catch (e) {
    renderHint("Diese Seite wird nicht unterstützt.");
    return;
  }

  if (!isSupportedHost(hostname)) {
    await tryMastodonFallback(tab);
    return;
  }

  const idConfig = getIdOpenerConfig(hostname);

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PROFILE" });
    if (!response) {
      renderError("Keine Antwort vom Content-Script. Seite neu laden und erneut versuchen.");
      if (idConfig) renderIdOpenerBlock(idConfig);
      return;
    }
    if (!response.success) {
      platformLabelEl.textContent = response.platform || "";
      renderError(response.error || "Unbekannter Fehler bei der Extraktion.");
      if (idConfig) renderIdOpenerBlock(idConfig);
      return;
    }
    renderData(response.platform, response.data);
    if (idConfig) renderIdOpenerBlock(idConfig);
  } catch (e) {
    renderError("Content-Script nicht erreichbar. Seite neu laden und erneut versuchen.");
    if (idConfig) renderIdOpenerBlock(idConfig);
  }
}

refreshBtn.addEventListener("click", run);
run();
