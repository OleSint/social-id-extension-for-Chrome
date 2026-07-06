// LinkedIn: bettet seinen internen React/Relay-State in mehreren
// <code id="bpr-guid-*">-Script-Tags ein. Die Struktur ist ein tief
// verschachtelter, normalisierter Graph ohne stabilen Zugriffspfad – daher
// wird hier (wie bei vielen bekannten Bookmarklets für LinkedIn) über eine
// Regex auf dem stringifizierten JSON gesucht statt über direkten
// Property-Zugriff.
//
// Kontaktinfo (E-Mail/Telefon/Website) steht nur in einem separaten Dialog,
// der aktiv geöffnet werden muss. Dieser Extraktor klickt ihn dafür kurz
// automatisch auf und schließt ihn danach wieder – die einzige Stelle in der
// gesamten Extension, die aktiv mit der Seite interagiert statt nur zu lesen.

const LINKEDIN_TARGET_FIELDS = [
  "fullLastNameShown", "formerNameVisibility", "lastName", "firstName",
  "premium", "publicIdentifier", "influencer", "created", "objectUrn",
];

const LINKEDIN_FIELD_LABELS = {
  firstName: "Vorname",
  lastName: "Nachname",
  publicIdentifier: "LinkedIn-Handle",
  created: "Erstellt am",
  premium: "Premium-Konto",
  influencer: "Influencer-Konto",
  fullLastNameShown: "Vollständiger Nachname sichtbar",
  formerNameVisibility: "Frühere Namen sichtbar",
};

function isLinkedInProfilePage() {
  return /^\/in\//.test(window.location.pathname);
}

function decodeLinkedInHtmlEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function waitForSelector(selector, timeoutMs) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeoutMs);
  });
}

function extractLinkedInContactInfo(overlay) {
  const urlPattern = /^https?:\/\/[^\s"]+$/i;
  const emails = Array.from(overlay.querySelectorAll('a[href^="mailto:"]')).map((a) =>
    a.href.replace(/^mailto:/, "").trim()
  );
  const urls = Array.from(overlay.querySelectorAll('a[href^="http"]'))
    .map((a) => (a.href.startsWith("http://") ? a.href.replace("http://", "https://") : a.href))
    .filter((href) => urlPattern.test(href) && !href.includes("linkedin.com") && !href.includes("lnkd.in"));

  const phones = [];
  overlay.querySelectorAll("code").forEach((block) => {
    let data;
    try {
      data = JSON.parse(block.textContent);
    } catch (e) {
      return;
    }
    const findNumbers = (obj) => {
      if (Array.isArray(obj)) {
        obj.forEach(findNumbers);
      } else if (obj && typeof obj === "object") {
        for (const k in obj) {
          if (k === "number" && typeof obj[k] === "string") {
            if (!phones.includes(obj[k].trim())) phones.push(obj[k].trim());
          } else {
            findNumbers(obj[k]);
          }
        }
      }
    };
    findNumbers(data);
  });

  return { emails, urls, phones };
}

async function extractLinkedIn() {
  if (!isLinkedInProfilePage()) {
    throw new Error("Keine LinkedIn-Profilseite erkannt (URL-Format: linkedin.com/in/name).");
  }

  const codeBlocks = Array.from(document.querySelectorAll('code[id^="bpr-guid-"]'));
  if (!codeBlocks.length) {
    throw new Error("Keine LinkedIn-Profildaten gefunden. Seite ggf. neu laden.");
  }

  const result = {};
  const externalLinks = new Set();
  const urlPattern = /^https?:\/\/[^\s"]+$/i;

  for (const block of codeBlocks) {
    let json;
    try {
      json = JSON.parse(decodeLinkedInHtmlEntities(block.innerHTML));
    } catch (e) {
      continue;
    }
    const content = JSON.stringify(json);
    if (!LINKEDIN_TARGET_FIELDS.some((f) => content.includes(`"${f}"`))) continue;

    for (const field of LINKEDIN_TARGET_FIELDS) {
      const regex = new RegExp(`"${field}"\\s*:\\s*(?:"([^"]*)"|(true|false)|(\\d+))`);
      const match = regex.exec(content);
      if (!match) continue;

      const isBoolean = match[2] !== undefined;
      let value = match[1] ?? match[2] ?? match[3];

      if (field === "created" && value) {
        value = new Date(Number(value)).toLocaleString("de-DE");
      }

      if (field === "objectUrn") {
        if (typeof value === "string" && value.startsWith("urn:li:member:")) {
          result["LinkedIn-Profil-ID"] = value.split(":").pop().trim();
        }
        continue;
      }

      const label = LINKEDIN_FIELD_LABELS[field] || field;
      result[label] = isBoolean ? (value === "true" ? "Ja" : "Nein") : value;
    }

    for (const m of content.matchAll(/"hyperlinkOpenExternally"\s*:\s*"([^"]*)"/g)) {
      let url = m[1].trim();
      if (urlPattern.test(url) && !url.includes("linkedin.com") && !url.includes("lnkd.in")) {
        externalLinks.add(url.startsWith("http://") ? url.replace("http://", "https://") : url);
      }
    }
  }

  if (externalLinks.size) {
    result["Externe Links"] = Array.from(externalLinks).join(", ");
  }

  const contactButton = document.querySelector('a[href*="overlay/contact-info"]');
  if (contactButton) {
    contactButton.click();
    const overlay = await waitForSelector('[data-view-name="profile-contact-info"], .artdeco-modal', 3000);
    if (overlay) {
      const { emails, urls, phones } = extractLinkedInContactInfo(overlay);
      if (emails.length) result["E-Mail"] = emails.join(", ");
      if (urls.length) result["Websites (Kontaktinfo)"] = urls.join(", ");
      if (phones.length) result["Telefon"] = phones.join(", ");

      const closeBtn = document.querySelector(".artdeco-modal__dismiss");
      if (closeBtn) closeBtn.click();
    }
  }

  if (!Object.keys(result).length) {
    throw new Error("Keine LinkedIn-Profildaten gefunden (Format hat sich evtl. geändert).");
  }
  return result;
}

registerExtractor("LinkedIn", extractLinkedIn);
