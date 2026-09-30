# Troubleshooting

Start with the logs:

```bash
docker compose logs -f backend     # API, integrations, background jobs
docker compose logs -f nexus-portal
docker compose logs -f nginx
```

and with the integration card in *Administration → Intégrations*: *Enregistrer
et tester* shows the error in plain words.

## Installation and access

**The page loads but everything is empty / « Intégrations indisponibles »**
The frontend can't reach the API. Open the portal through nginx (port 80), not
the dev server (2443) directly. From another host name, add it to
`CORS_ORIGINS` (and `ALLOWED_HOSTS`) and `docker compose up -d`.

**« Blocked request. This host is not allowed. »**
Vite's dev server protects against unknown host names: add yours to
`ALLOWED_HOSTS` (`.example.com` for every subdomain).

**A code change in the backend has no effect**
The backend is compiled when it starts: `docker compose up -d --build backend`.

## Integrations

**« Connexion refusée » with qBittorrent**
Wrong user / password, or qBittorrent banned the portal's IP after failed
attempts (the card says so; wait, or lift the ban in its Web UI). If you run a
fork of the portal, note that qBittorrent 5 names its cookie `QBT_SID_<port>`.

**The card shows a login page / HTTP 302 / « API introuvable »**
You used a public address behind an access proxy. Use the LAN address
(`http://192.168.1.10:<port>`).

**Nothing on the tile, but the test is green**
The data goes to the tile chosen in *Tuile*, or the first visible link whose
name contains the service's name. Pick the tile explicitly.

**Nextcloud tile says « ⚠ Mise à jour à terminer »**
Nextcloud's code was updated but its database wasn't (typically: the app
container was recreated while its database was down, and the automatic
upgrade stopped halfway). The site answers 503 meanwhile. Back up Nextcloud's
database, then Ctrl K → « Nextcloud : terminer la mise à jour » (or
`occ upgrade` in its container). Warnings about `oc_federated_invites` or the
`activity_object` index afterwards are expected on Nextcloud 35.

**Nextcloud file search returns nothing**
The file features need the **app password** (and its user), not only the
serverinfo token.

**kDrive: « Clé ou jeton refusé (HTTP 401) »**
You pasted an app password (a short code) instead of an **API token** (a long
string) — see [Integrations → kDrive](integrations.md#kdrive-infomaniak).

**kDrive: « Pas autorisé à cet endroit »**
Nothing can be created at the drive's root: open *Private* (or another space)
first.

**Jellyseerr: « Déjà demandé » / « Déjà disponible »**
On purpose: the portal checks before requesting, because the admin key would
let duplicates through.

**Web results never appear in Ctrl K**
Test from the host: `curl "http://localhost:5010/api/search/web?q=test"`.
- « SearXNG injoignable » → the backend can't reach `SEARXNG_URL` (put it on
  SearXNG's Docker network).
- « refuse le format JSON » (403) → add `json` to `search.formats` in SearXNG's
  `settings.yml` and restart it.

## Files

**« Fichier trop gros »**
100 MB per file through the portal; see [Files → limits](files.md#limits).

**Upload stuck at 0 % behind a proxy / 413 from nginx**
The upload route must reach the portal's nginx, whose special
`location ~ ^/api/integrations/(nextcloud|kdrive)/upload` block allows 100 MB.
If you put another nginx in front, raise its `client_max_body_size` too.

**The upload icon doesn't show on a phone**
It shows on every folder on touch screens; on a computer, hover the folder.

## Home Assistant

**A sensor isn't in the lists**
Unavailable entities are hidden by default (*Masquer les indisponibles*), and
*Capteurs* shows only sensors: try *Tout* with a search.

**A room widget picked odd sensors**
*Remplir depuis une pièce* follows Home Assistant's **areas**: a sensor filed
under the wrong area in Home Assistant ends up in that room here. Fix the area
there, or remove the sensor from the widget.

**« Cette entité n'est dans aucun widget de contrôle »**
Controls only work on entities placed in a *Contrôles* widget: add it to one.

## Display

**The mouse cursor lags**
The animated cursor moves at the page's frame rate: switch on *Mode léger*
(fewer effects), or switch off *Curseur animé* (both per device). On laptops,
a browser's battery saver caps pages at 30 frames per second.

**A theme looks wrong after an update**
Hard-refresh (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>); the installed app
(PWA) keeps its page shell cached for offline use.
