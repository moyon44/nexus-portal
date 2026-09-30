# Integrations

Integrations add live data to a service's tile and, for some, commands in the
Ctrl K palette. Set them up in *Administration → Intégrations*: one card per
service, then *Enregistrer et tester*.

## How they work

- The **backend** calls each service every **20 seconds**; the browser only
  reads the result. Credentials never leave the server (the Admin page only
  knows whether one is stored).
- Use the service's **LAN address**, e.g. `http://192.168.1.10:8096`. A public
  subdomain behind Cloudflare Access, Authelia… answers API calls with its
  login page.
- **Which tile?** Leave *Tuile* on *Automatique* and the first visible link
  whose name contains the integration's name gets the data (a LAN address is
  preferred when two match), or pick the tile yourself.
- If a check fails, the card shows the reason in plain words (wrong key,
  unreachable address, API not found at that address…), and the tile simply
  shows no live line.

## At a glance

| Service | Credentials | On the tile | In Ctrl K |
| --- | --- | --- | --- |
| [qBittorrent](#qbittorrent) | Web UI user + password | ↓ / ↑ speeds; torrents in progress | — |
| [Jellyfin](#jellyfin) | API key | Playbacks in progress, who watches what | — |
| [Sonarr / Radarr](#sonarr-and-radarr) | API key | Today's episodes / films, queue | — |
| [Jellyseerr](#jellyseerr) | API key | Requests pending approval | Search and request films and series |
| [Nextcloud](#nextcloud) | serverinfo token; user + app password | Free space, activity, upgrade alert | Files; maintenance actions |
| [kDrive](#kdrive-infomaniak) | API token + drive number | Free and used space | Files |
| [Home Assistant](#home-assistant) | Long-lived access token | Who's home, or your chosen sensors | — |
| [SearXNG](#searxng-web-search) | none (environment variable) | — | Web results |

## qBittorrent

- **Address**: the Web UI, e.g. `http://192.168.1.10:8080`.
- **Utilisateur / Mot de passe**: the Web UI login.
- Tile: « ↓ 12 Mo/s · ↑ 400 Ko/s »; details list the torrents downloading.
  The tile glows while something downloads.

Works with qBittorrent 4 and 5 (version 5 names its session cookie
`QBT_SID_<port>`). Too many failed logins get the portal's IP banned by
qBittorrent for a while; the card then says so.

## Jellyfin

- **Clé API**: Jellyfin → *Dashboard → API Keys → +*.
- Tile: playbacks in progress; details: « user · Series S01E02 (pause) ».
  New playbacks also show as a notification.

## Sonarr and Radarr

- **Clé API**: *Settings → General → Security → API Key*.
- Tile: « 2 épisodes aujourd'hui · 3 en file »; details list today's releases
  (✓ when the file is there).

## Jellyseerr

(Overseerr uses the same API and should work the same way.)

- **Clé API**: Jellyseerr → *Settings → General → API Key*.
- Tile: « 5 demandes en attente · 30 en cours »; details list the last pending
  requests with their title and who asked. It glows while requests wait.
- **Requesting from Ctrl K**: type a title (3+ letters); the *Demandes* group
  shows films and series with their poster, year and status (*Déjà disponible*,
  *Déjà demandé*, *En partie disponible*). Enter, then Enter again to confirm.
  A series is requested with all its seasons.

> Requests are made with the API key, so Jellyseerr counts them as the
> **admin's**: they are approved at once and sent to Radarr / Sonarr. The
> portal refuses a title already requested or available (Jellyseerr would
> accept duplicates from the admin key).

## Nextcloud

Two independent parts; set up either or both.

**Tile (server figures)** — uses the *serverinfo* app (shipped with Nextcloud):

1. Create a token for it on the Nextcloud host:
   ```bash
   docker exec -u www-data nextcloud php occ config:app:set serverinfo token --value "$(openssl rand -hex 24)"
   docker exec -u www-data nextcloud php occ config:app:get serverinfo token   # copy it
   ```
2. Paste it in **Jeton serverinfo**.

The tile then shows « 1,4 To libres · 2 actifs aujourd'hui »; details: users,
files, shares (and how many public links have no password), app updates,
version. Even without the token, it warns **« ⚠ Mise à jour à terminer »** or
**« ⚠ Mode maintenance »** when Nextcloud is stuck in those states — the case
where its container looks fine but the site is down.

**Files (search, browsing, uploads)** — needs an app password:

1. In Nextcloud: *Personal settings → Security → Devices & sessions*, name it
   « Portail », *Create new app password*. Copy the user name and password it
   shows (the password is shown once).
2. Paste them in **Utilisateur** and **Mot de passe d'application**.

The portal then acts with that account's rights. See [Files](files.md).

**Maintenance actions** — in Ctrl K, type « nextcloud » (2+ letters):
*terminer la mise à jour* (`occ upgrade`), *lancer les tâches de fond*
(`cron.php`), *rescanner les fichiers*, *mettre à jour les apps*, *ajouter les
index manquants*, *activer / quitter le mode maintenance*. Each asks for a
second Enter, runs in the background inside the Nextcloud container (found by
its `nextcloud` image, through the Docker socket), one at a time, and notifies
you when done; the tile shows the last one's result. Only these commands can
be run.

> Back up Nextcloud's database before *terminer la mise à jour*.

## kDrive (Infomaniak)

- **Adresse**: leave `https://api.infomaniak.com` (kDrive is reached through
  Infomaniak's public API).
- **Jeton API**: in the Infomaniak Manager, *Profile → Developer → API tokens*
  (<https://manager.infomaniak.com/v3/ng/profile/user/token/list>), *Create a
  token*, application **kDrive** (scope `drive`). Copy it: it's shown once, and
  it's a long string (a 16-character code is an app password, which the API
  refuses).
- **Numéro du kDrive**: the number after `/drive/` in its web address,
  e.g. `…/kdrive/app/drive/123456/files` → `123456`.
- Tile: « 995 Go libres · 3 % utilisés » (add a link named « kDrive » for the
  tile). Files: see [Files](files.md).

Infomaniak allows 60 API calls a minute; the tile uses 3.

## Home Assistant

- **Jeton**: Home Assistant → your profile → *Security* → *Long-lived access
  tokens* → *Create token*.
- **Entités**: leave empty and pick sensors from *Système → Home Assistant*
  instead (pin 📌). Without any, the tile shows who's home.

Everything else — sensors page, widgets, controls, status bar — is in
[Home Assistant](home-assistant.md).

## SearXNG (web search)

Not a card: set `SEARXNG_URL` in `.env` (default `http://searxng:8080`).

1. In SearXNG's `settings.yml`, allow JSON:
   ```yaml
   search:
     formats:
       - html
       - json
   ```
   and restart it. Without this SearXNG answers « 403 Forbidden ».
2. Let the backend reach it: if SearXNG runs in another compose project, add
   its network to the backend (see the commented `networks:` block in
   `docker-compose.yml`), then `docker compose up -d backend`.

Results appear last in the palette (*Web*), in French, SafeSearch moderate.
