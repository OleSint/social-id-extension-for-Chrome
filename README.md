# Social ID Viewer

Chrome-Extension, die im Popup die Profil-ID und – sofern verfügbar – weitere
Infos (Erstellungsdatum, Follower, Bio, Verifizierungsstatus, …) zur aktuell
geöffneten Social-Media-Profilseite anzeigt.

## Unterstützte Plattformen (Stand v0.1.0)

| Plattform   | Profil-ID | Erstellungsdatum | Weitere Infos |
|-------------|-----------|-------------------|----------------|
| TikTok      | ✅ | ✅ (`createTime`) | Follower, Likes, Bio, verifiziert, letzte Handle-Änderung, Region, Shop-Verkäufer, Favoriten-Sichtbarkeit, virtueller/KI-Account |
| Reddit      | ✅ | ✅ | Karma, Premium-Status, Profil-Bio & -Follower, E-Mail verifiziert, Mod-/Mitarbeiter-Status |
| YouTube     | ✅ (Channel-ID) | ✅ (Beitrittsdatum, meist nur auf dem „Info"-Tab) | Abonnenten, Beschreibung, Land, Gesamt-Aufrufe |
| Instagram   | ✅ | ❌ (nicht öffentlich, nur Bool „kürzlich beigetreten") | Follower, Bio, privat/verifiziert, Website, geschäftliche Kontaktdaten, Pronomen, Story-Highlights |
| X / Twitter | ✅ | ✅ | Follower, Tweets, Likes, Medien, Listen, geschützt, Blue-Verified, Website, Profilbild (am fragilsten – X ändert die interne API häufig) |
| Facebook    | ⚠️ nur bei `profile.php?id=...` oder wenn im Quelltext auffindbar | ❌ | Anzeigename |
| Bluesky     | ✅ (DID, permanent) | ✅ | Follower, Folgt, Beiträge, Bio, Profilbild/Banner, Labeler-Dienst – **kein Login nötig**, da öffentliche AT-Protocol-API |
| GitHub      | ✅ | ✅ | Bio, Firma, Standort, Website, Repos, Follower – **kein Login nötig**, vollständig öffentliche API |
| Twitch      | ✅ | ✅ | Bio, Follower, Partner-/Affiliate-Status, ob gerade live, Profilbild |
| Pinterest   | ✅ | ❌ (nicht öffentlich) | Bio, Follower, Pins, Boards, Website, verifizierter Händler-Status |
| Threads     | ✅ | ❌ (nicht öffentlich) | Follower, Bio, privat/verifiziert (am fragilsten neben X – reverse-engineerte, undokumentierte API) |
| Mastodon    | ✅ | ✅ | Follower, Folgt, Beiträge, Bio, Bot-Flag, privat/locked, Profilbild/Banner – **kein Login nötig**, generische Erkennung auf jeder Instanz/Domain (kein fester Manifest-Eintrag) |
| Steam       | ✅ (SteamID64, permanent) | ✅ (`memberSince`) | Echtname, Standort, Bio, Online-Status, VAC-Bann, eingeschränktes Konto – **kein Login nötig**, öffentlicher XML-Profil-Feed (`?xml=1`) |

Auf allen Plattformen werden nur die Felder angezeigt, die auf der jeweils
geöffneten Seite tatsächlich verfügbar sind.

**Login-Voraussetzung:** Das Tool nutzt keinen eigenen API-Key. Es greift auf
die internen Endpunkte bzw. eingebetteten Seitendaten zurück, die die
jeweilige Plattform im Browser selbst verwendet – das funktioniert daher nur,
wenn man auf der entsprechenden Plattform im selben Browser eingeloggt ist.
**Ausnahmen (kein Login nötig):** Bluesky (`public.api.bsky.app`), GitHub
(`api.github.com`), Mastodon (`/api/v1/accounts/lookup` jeder Instanz) und
Steam (öffentlicher `?xml=1`-Profil-Feed) nutzen jeweils eine vollständig
öffentliche, unauthentifizierte Quelle. Bei Steam liefert der Feed bei
privaten Profilen allerdings nur eingeschränkte Daten (abhängig von der
Privatsphäre-Einstellung des jeweiligen Nutzers).

## Installation (unpacked / Dev-Modus)

1. Chrome öffnen: `chrome://extensions`
2. Oben rechts **„Entwicklermodus"** aktivieren
3. **„Entpackte Erweiterung laden"** klicken
4. Diesen Ordner (`social-id-extension`) auswählen
5. Auf einer der unterstützten Profilseiten (z. B. `instagram.com/irgendwer`)
   auf das Erweiterungssymbol klicken

## Profilbild-Download

Wo verfügbar, zeigt das Popup unter den Profildaten eine Vorschau des
Profilbilds (und bei Bluesky zusätzlich des Banners) plus einen
„… herunterladen"-Button. Klick darauf öffnet den nativen Speicherdialog von
Chrome (`chrome.downloads`-API mit `saveAs: true`).

Genutzte Auflösung pro Plattform:

| Plattform   | Quelle für das Profilbild |
|-------------|----------------------------|
| Instagram   | `profile_pic_url_hd` (höchste von der API gelieferte Auflösung) |
| X / Twitter | `profile_image_url_https` mit entferntem `_normal`-Suffix (Originalgröße statt 48px-Vorschau) |
| TikTok      | `avatarLarger` (größte der drei von TikTok bereitgestellten Größen) |
| YouTube     | größtes Thumbnail aus `ytInitialData`, Größenparameter der URL auf `=s0` (Original, unskaliert) gesetzt |
| Reddit      | `snoovatar_img` falls vorhanden, sonst `icon_img` |
| Bluesky     | `avatar` bzw. `banner` aus der öffentlichen API (das ist bereits die höchste verfügbare Auflösung) |
| Facebook    | `og:image`-Meta-Tag – einzige ohne Login/API erreichbare Quelle, daher **nicht garantiert die höchstmögliche** Auflösung |
| GitHub      | `avatar_url` mit Größenparameter `?s=460` |
| Twitch      | `profileImageURL(width: 300)` – größte von Twitch für Profilbilder generierte feste Größe |
| Pinterest   | `image_xlarge_url` |
| Threads     | `profile_pic_url_hd` (best effort) |
| Mastodon    | `avatar`/`header` aus der öffentlichen Accounts-API (bereits höchste verfügbare Auflösung) |
| Steam       | `avatarFull` aus dem XML-Feed (184×184 – Steams höchste öffentlich verfügbare Auflösung) |

## Facebook: Suche nach Namen

Bei Facebook erscheint unter den Profildaten zusätzlich ein mit dem
Anzeigenamen vorausgefülltes Suchfeld. Klick auf „Suchen" (oder Enter) öffnet
Facebooks globale Suche (`facebook.com/search/posts/?q=<Name>`) in einem
neuen Tab. Bewusst **nicht** die "Im Profil suchen"-Funktion
(`facebook.com/profile/<id>/search/`) – Erfahrungswerten zufolge findet die
globale Namenssuche öffentlich gemachte Kommentare unter fremden Beiträgen
deutlich zuverlässiger. Das Feld bleibt editierbar, falls zusätzliche
Suchbegriffe sinnvoll sind. Es findet kein eigenes Scraping von Beiträgen
statt – es wird lediglich Facebooks eigene Suche aufgerufen.

## Alle Beiträge & Antworten anzeigen (Reddit, Bluesky, Mastodon, X)

Bei diesen vier Plattformen gibt es – anders als bei Facebook – einen
offiziellen, direkten Weg zu allen öffentlichen Beiträgen und Antworten eines
Nutzers, ohne Namens-Suche. Dafür erscheint ein einzelner Button, der die
jeweilige Plattform-eigene Ansicht in einem neuen Tab öffnet:

| Plattform | Geöffnete URL |
|-----------|---------------|
| Reddit    | `reddit.com/user/<name>/comments/` – offizieller Kommentar-Feed |
| Bluesky   | `bsky.app/profile/<handle>/replies` – Antworten-Tab im Web-Client |
| Mastodon  | `<instanz>/@<name>/with_replies` – öffentliche "Beiträge und Antworten"-Ansicht |
| X/Twitter | `x.com/search?q=from:<name>` – Suche nach allen Tweets/Antworten des Accounts |

Bei Mastodon und X ist das deutlich zuverlässiger als eine Namenssuche, weil
der Nutzername eindeutig ist (anders als bei Facebook, wo Anzeigenamen
mehrdeutig sein können).

## Profil-Sicherung als HTML (aktuell: Reddit, Bluesky, Mastodon)

Bei diesen drei Plattformen erscheint ein Button „Profil als HTML sichern".
Klick darauf sammelt alle Beiträge des Profils über die jeweils öffentliche
API (nicht durch Klonen der Live-Seite) und baut daraus ein eigenständiges,
selbst gestaltetes HTML-Dokument (eigenes CSS, keine externen Ressourcen
außer entfernt verlinkten Bildern), das per Speicherdialog herunterladen
wird.

Warum eine eigene API-Sammlung statt einfach die Seite zu speichern: Viele
moderne Profilseiten laden Beiträge per Infinite-Scroll und entfernen ältere
Einträge wieder aus dem DOM, sobald man weiter nach unten scrollt
("Virtualisierung"). Ein simples "Seite als HTML speichern" am Ende des
Scrollens würde daher nur die untersten Beiträge enthalten. Die Daten-APIs
dieser drei Plattformen liefern dagegen die komplette Liste direkt und
zuverlässig, unabhängig vom Render-Zustand der Seite.

Das fertige HTML lässt sich in jedem Browser ohne Internetverbindung öffnen
und über den normalen Druckdialog auch als PDF speichern. Während der
Sammlung sollte das Popup offen bleiben, da der Vorgang – besonders bei
Bluesky und Mastodon, wo pro Beitrag weitere Anfragen für Antworten/Liker
nötig sind – mehrere Sekunden bis über eine Minute dauern kann.

| Plattform | Quelle | Enthält |
|-----------|--------|---------|
| Reddit    | `overview.json`-Listing (paginiert über `after`, max. 20 Seiten à 100) | Beiträge & Kommentare, Subreddit, Datum, Punkte, Link zum Original |
| Bluesky   | `getAuthorFeed` (max. 100 Beiträge) + pro Beitrag `getPostThread` (Antworten) + `getLikes` (Liker) | Beiträge inkl. Medien, Like-/Repost-/Antwort-Zahlen, vollständige Antworten **und wer geliked hat** |
| Mastodon  | `/accounts/:id/statuses` (max. 100 Beiträge) + pro Beitrag `/statuses/:id/context` (Antworten) | Beiträge inkl. Medien, Like-/Boost-/Antwort-Zahlen, vollständige Antworten – wer geliked hat, ist bei den meisten Instanzen nicht öffentlich einsehbar |

Bekannte Begrenzungen: Reddit liefert ohnehin meist nur die letzten ca. 1000
Einträge eines Profils (Plattform-Limit, keine Beschränkung der Extension);
bei Bluesky/Mastodon ist die Sicherung hier bewusst auf die letzten 100
Beiträge gekappt, um die Anzahl der Anfragen (und damit Lade-/Wartezeit)
begrenzt zu halten.

Dieselbe Technik (eigene API/Daten sammeln statt Live-Seite klonen) ist für
weitere Plattformen geplant, sobald sie sich als technisch sinnvoll
herausstellt. X/Twitter ist technisch ähnlich machbar (gleiche interne API
wie die Profil-Extraktion), aber deutlich bruchanfälliger; bei Instagram,
Threads, TikTok und Pinterest gibt es keine vergleichbar stabile offene API
für vollständige Beitragslisten samt Kommentaren.

## Profil per ID öffnen

Ist man auf einer unterstützten Plattform, aber nicht auf einer Profilseite
(z. B. der Facebook-Startseite), erscheint statt der Profildaten ein
Eingabefeld „Profil per ID öffnen". Das Feld erscheint zusätzlich auch dann,
wenn man bereits auf einem Profil ist – um direkt ein weiteres Profil über
dessen ID aufzurufen, ohne erst zur Plattform-Startseite zurückzugehen.

Hintergrund: Bei manchen Plattformen reicht die ID allein, um direkt zum
Profil zu navigieren (z. B. `facebook.com/profile.php?id=...`), bei anderen
nicht (z. B. Instagram: `instagram.com/<username>`, nicht `<id>`). Aufgenommen
sind hier nur Plattformen, bei denen das entweder direkt über die URL geht
oder über eine stabile, öffentliche API zuverlässig auflösbar ist:

| Plattform | Funktionsweise |
|-----------|-----------------|
| Facebook  | ID direkt in der URL (`profile.php?id=`) |
| Instagram | ID direkt in der URL (`/uid/<id>`) |
| TikTok    | ID direkt in der URL (`/@<id>`) |
| YouTube   | Channel-ID direkt in der URL (`/channel/<ID>`) |
| Bluesky   | DID direkt in der URL (`/profile/<did>`) |
| Steam     | SteamID64 direkt in der URL (`/profiles/<id>`) |
| GitHub    | Lookup über die öffentliche API (`api.github.com/user/<id>` → Username) |
| Mastodon  | Lookup über die öffentliche API der jeweiligen Instanz (`/api/v1/accounts/<id>` → Username) |

Bei X/Twitter, Reddit, Twitch, Pinterest und Threads ist das (noch) nicht
umgesetzt, da es dort keine zuverlässige, öffentliche ID→Profil-Auflösung
gibt, auf die man sich verlassen könnte.

## Funktionsweise

- Pro Plattform gibt es ein eigenes Content-Script (`content-scripts/*.js`),
  das nur auf den jeweiligen Domains geladen wird.
- Jedes Script extrahiert Daten entweder aus im HTML eingebetteten JSON-Objekten
  (TikTok, YouTube, Pinterest) oder über die öffentlichen/internen Endpunkte,
  die die Plattform selbst im Browser nutzt (Reddit, Instagram, X, GitHub,
  Twitch, Threads, Bluesky).
- Das Popup fragt bei jedem Öffnen den aktiven Tab per
  `chrome.tabs.sendMessage` neu ab – funktioniert daher auch nach Navigation
  innerhalb von Single-Page-Apps (Reload des Popups reicht, kein Seiten-Reload
  nötig).
- **Mastodon ist die Ausnahme:** Da das Netzwerk dezentral ist (jede Instanz
  eine eigene Domain), gibt es dafür keinen festen `content_scripts`-Eintrag.
  Stattdessen prüft das Popup über `activeTab` + `scripting.executeScript`
  ad hoc nur die gerade geöffnete Domain auf eine Mastodon-kompatible API –
  ohne dafür breite Host-Berechtigungen für alle Webseiten zu benötigen.

## Bekannte Einschränkungen

- **X/Twitter** nutzt eine interne GraphQL-`queryId`, die X ohne Vorwarnung
  ändert. Schlägt die Anfrage fehl, zeigt das Popup eine Fehlermeldung statt
  falscher Daten.
- **Threads** ist ähnlich fragil wie X – die genutzte API ist nicht
  offiziell dokumentiert und reverse-engineered.
- **Facebook** verschleiert numerische IDs bei Vanity-URLs inzwischen stark –
  nur `profile.php?id=...`-URLs liefern zuverlässig eine ID.
- **Pinterest** durchsucht eine tief verschachtelte, undokumentierte
  Hydration-Struktur – kann bei Layout-Änderungen brechen.
- **Mastodon** funktioniert nur, wenn die jeweilige Instanz die Standard-API
  unter `/api/v1/...` bereitstellt (bei den allermeisten Mastodon-Instanzen
  der Fall, bei stark angepassten Forks evtl. nicht).
- Manche Endpunkte benötigen einen eingeloggten Zustand auf der jeweiligen
  Plattform (z. B. Instagram, X, Threads, Twitch, Pinterest).

## Postings

Ist man auf einer einzelnen Beitragsseite (statt einer Profilseite), zeigt
das Popup statt der Profildaten Infos zu genau diesem Beitrag – das
wichtigste Feld ist dabei immer **„Gepostet am"**. Bewusst schlank gehalten:
wenige Kernfelder statt vollständiger Kommentar-Listen oder einer eigenen
HTML-Sicherung pro Beitrag (das bleibt der Profil-Sicherung vorbehalten).
Wo ein Bild/Video zum Beitrag gehört, erscheint wie beim Profilbild ein
Download-Button.

**Medien-Download-Technik:** Anders als beim Profilbild lädt der Button beim
„Medium"-Feld die Datei nicht direkt über die rohe CDN-URL herunter, sondern
ruft sie zuerst innerhalb der Seite per `fetch()` mit Session-Cookies ab und
prüft den Content-Type. Grund: Viele Postings-Medien liegen hinter
signierten/geschützten URLs (z. B. TikToks `playAddr`, manche
Instagram-Video-URLs), die ohne Cookies/Referrer oft eine
HTML-Fehler-/Login-Seite statt der echten Datei liefern – ein direkter
Download würde diese Fehlerseite unbemerkt unter der erwarteten Dateiendung
speichern. Schlägt der Abruf fehl oder liefert er keinen Bild-/Video-Inhalt,
zeigt der Button eine klare Fehlermeldung statt einer falschen Datei.

| Plattform | Erkannt an | Felder |
|-----------|-----------|--------|
| Facebook  | `/posts/`, `/permalink.php`, `/photo`, `/videos/`, `/reel/` | nur Datum (best effort, aus Unix-Timestamp im Seitenquelltext) |
| Reddit    | `/comments/` in der URL | Datum, Titel, Autor, Subreddit, Punkte, Kommentar-Zahl, Text, Medium |
| Bluesky   | `/profile/<handle>/post/<rkey>` | Datum, Text, Likes/Reposts/Antworten-Zahl, Medium |
| Mastodon  | `/@<user>/<numerische ID>` | Datum, Text, Likes/Boosts/Antworten-Zahl, Medium |
| TikTok    | `/@<user>/video/<id>` | Datum, Beschreibung, Likes/Kommentare/Aufrufe/Shares, Medium (Video) |
| Instagram | `/p/<shortcode>/`, `/reel/<shortcode>/` | Datum, Beschreibung, Likes, Kommentar-Zahl, Medium – am fragilsten, da über mehrere eingebettete JSON-Script-Tags gesucht werden muss (kein vorhersagbarer Variablenname wie bei TikTok) |

Bei X/Twitter, Threads und Pinterest ist das (noch) nicht umgesetzt (gleiche
Gründe wie bei der Profil-Sicherung: technisch möglich, aber bruchanfälliger
über interne, undokumentierte APIs).

## Geplant

- Änderungs-Tracking: eine gespeicherte Profil-Sicherung später erneut
  abrufen und Unterschiede anzeigen (neue Beiträge, Follower-Veränderung, …).
- Postings-Funktion auf X/Twitter, Threads und Pinterest ausweiten.
