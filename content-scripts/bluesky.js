// Bluesky: AT Protocol stellt eine vollständig öffentliche, unauthentifizierte
// API bereit (public.api.bsky.app). Im Gegensatz zu den anderen Plattformen
// ist hier also kein Login im Browser nötig – die Daten sind ohnehin für
// jeden öffentlich abrufbar.

function getBlueskyActorFromUrl() {
  const match = window.location.pathname.match(/^\/profile\/([^/]+)/);
  return match ? match[1] : null;
}

function getBlueskyPostFromUrl() {
  const match = window.location.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)/);
  return match ? { actor: match[1], rkey: match[2] } : null;
}

async function extractBlueskyPost(postInfo) {
  let did = postInfo.actor;
  if (!did.startsWith("did:")) {
    const profileRes = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(postInfo.actor)}`
    );
    if (profileRes.ok) {
      const profile = await profileRes.json();
      did = profile.did;
    }
  }

  const uri = `at://${did}/app.bsky.feed.post/${postInfo.rkey}`;
  const threadRes = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0`
  );
  if (!threadRes.ok) {
    throw new Error(`Bluesky-API antwortete mit Status ${threadRes.status}.`);
  }
  const threadJson = await threadRes.json();
  const post = threadJson.thread && threadJson.thread.post;
  if (!post) {
    throw new Error("Beitragsdaten nicht gefunden.");
  }
  const record = post.record || {};

  const mediaUrl =
    post.embed && Array.isArray(post.embed.images) && post.embed.images.length ? post.embed.images[0].fullsize : null;

  const result = {
    "Gepostet am": record.createdAt ? new Date(record.createdAt).toLocaleString("de-DE") : null,
    "Text": record.text || null,
    "Likes": post.likeCount ?? null,
    "Reposts": post.repostCount ?? null,
    "Antworten": post.replyCount ?? null,
    "Medium": mediaUrl,
  };
  Object.keys(result).forEach((k) => (result[k] === null || result[k] === undefined) && delete result[k]);
  return result;
}

async function extractBluesky() {
  const postInfo = getBlueskyPostFromUrl();
  if (postInfo) {
    return extractBlueskyPost(postInfo);
  }

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

// Sicherung: AT Protocol erlaubt es als einzige hier unterstützte Plattform,
// nicht nur die eigenen Beiträge, sondern auch Antworten UND wer einen Post
// geliked hat öffentlich abzurufen – alles ohne Login.
async function collectBlueskyArchive() {
  const actor = getBlueskyActorFromUrl();
  if (!actor) {
    throw new Error("Kein Bluesky-Profil auf dieser Seite erkannt.");
  }

  const profileRes = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`
  );
  if (!profileRes.ok) {
    throw new Error(`Bluesky-API antwortete mit Status ${profileRes.status}.`);
  }
  const profile = await profileRes.json();
  const did = profile.did;

  const MAX_POSTS = 100;
  const items = [];
  let cursor = null;
  while (items.length < MAX_POSTS) {
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const json = await res.json();
    const feed = json.feed || [];
    items.push(...feed);
    cursor = json.cursor;
    if (!cursor || feed.length === 0) break;
  }
  items.length = Math.min(items.length, MAX_POSTS);

  function flattenReplies(node, out) {
    if (!node || !node.replies) return out;
    node.replies.forEach((replyNode) => {
      const p = replyNode.post;
      if (p && p.record) {
        out.push({
          handle: p.author ? p.author.handle : "?",
          text: p.record.text || "",
          createdAt: p.record.createdAt,
          likeCount: p.likeCount ?? 0,
        });
      }
      flattenReplies(replyNode, out);
    });
    return out;
  }

  for (const item of items) {
    const post = item.post;
    if (!post) continue;
    try {
      const likesRes = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.feed.getLikes?uri=${encodeURIComponent(post.uri)}&limit=100`
      );
      if (likesRes.ok) {
        const likesJson = await likesRes.json();
        item.likers = (likesJson.likes || []).map((l) => l.actor.handle);
      }
    } catch (e) {
      // Likes ggf. nicht verfügbar – kein Abbruch der gesamten Sicherung
    }
    try {
      const threadRes = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(post.uri)}&depth=6`
      );
      if (threadRes.ok) {
        const threadJson = await threadRes.json();
        item.replies = flattenReplies(threadJson.thread, []);
      }
    } catch (e) {
      // Thread ggf. nicht verfügbar – kein Abbruch der gesamten Sicherung
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return { did, handle: profile.handle || actor, items };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "BUILD_BLUESKY_ARCHIVE") return;
  collectBlueskyArchive()
    .then((result) => sendResponse({ success: true, ...result }))
    .catch((err) => sendResponse({ success: false, error: err && err.message ? err.message : String(err) }));
  return true;
});
