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

const IMAGE_KEYS = ["Profilbild", "Banner"];

function guessImageExtension(url) {
  const match = url.match(/\.(jpe?g|png|webp|gif|bmp)(?:[?#]|$)/i);
  return match ? match[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
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
    block.appendChild(downloadBtn);

    contentEl.appendChild(block);
  });

  if (platform === "Facebook" && data["Anzeigename"]) {
    renderFacebookSearchBlock(data["Anzeigename"]);
  }

  const postsLink = getPostsLinkForPlatform(platform, data);
  if (postsLink) {
    renderLinkButtonBlock(postsLink.label, postsLink.url);
  }
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

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PROFILE" });
    if (!response) {
      renderError("Keine Antwort vom Content-Script. Seite neu laden und erneut versuchen.");
      return;
    }
    if (!response.success) {
      platformLabelEl.textContent = response.platform || "";
      renderError(response.error || "Unbekannter Fehler bei der Extraktion.");
      return;
    }
    renderData(response.platform, response.data);
  } catch (e) {
    renderError("Content-Script nicht erreichbar. Seite neu laden und erneut versuchen.");
  }
}

refreshBtn.addEventListener("click", run);
run();
