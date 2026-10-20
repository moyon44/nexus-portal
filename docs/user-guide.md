# User guide

## The home page

From top to bottom:

- **Greeting and clock** — « Bonjour Alex », the date.
- **Status bar** — services online (click to show only the ones that are down),
  CPU / RAM / disk with their last hour, the weather or your
  [Home Assistant sensors](home-assistant.md#status-bar), the display style
  switcher and *Ajouter*.
- **Favourites dock** — your starred links, like a macOS dock
  (<kbd>1</kbd>…<kbd>9</kbd> open them).
- **Récents** — the last links you opened.
- **Your folders**, one section each, with their links as tiles.
- **Maison** — your [Home Assistant widgets](home-assistant.md#widgets), if you
  put any on the home page (below the links, so they stay on the first screen).

The **sidebar** lists the same folders as a tree: click one to jump to it,
hover a link to light up its tile. Under it, *Stockage* shows your
[Nextcloud and kDrive files](files.md), then the pages: *Wrapped*,
*Fichiers*, *Maison*, *Système*, *Administration*. On a phone the sidebar
opens with the ☰ button.

### Tiles

A tile shows the service's logo (taken from its site, or chosen), name and
status dot: green online, red down (checked every 30 s). Integrations add a
live line (download speed, what's playing…). Response times stay off the
card; a service slower than 1 s says « lent ».

**Hover** a tile for a moment and a card opens:

- **external sites** (not on your network or your domain): the site's share
  image and description, handy to remember what « Refero » or « Bencho » is;
- **your services**: their live lines, response time, availability over
  24 h / 7 days, the container's CPU / RAM and the last action on them from
  the [history](system-and-docker.md#history).

- **Click** opens the link (<kbd>Ctrl</kbd>+click: new tab).
- **Right-click** (or the keyboard's menu key) — on a tile or a link of the
  sidebar: *Ouvrir dans un nouvel onglet*, copy the address, *Ouvrir en SSH*,
  *Redémarrer le conteneur*, *Sélectionner*, *Retourner la carte*, *Détails
  et journaux*, *Ajouter / Modifier le commentaire* (a note shown on the back
  of the card) and *Supprimer le lien*. Deleting takes one click: the island
  at the top offers *Annuler* for a few seconds, and the history can bring the
  link back later.
- **Flip** (<kbd>F</kbd> on the selected tile, or *Retourner la carte*): the
  back shows a **QR code** to open the link on a phone, the full address and
  its notes.
- **Drag** a tile onto another folder in the sidebar or the page to move it.
- **Select several** with <kbd>Shift</kbd>+click: a bar appears to move them,
  star them, restart their containers or delete them (restart asks for a
  second click; delete can be undone).

A « MAJ » pill on a tile means a newer image exists for its container; click
it twice to update (see [System and Docker](system-and-docker.md#image-updates)).

### Adding links

- <kbd>N</kbd>, or *Ajouter* → *Lien*: type or paste an address; the name,
  description and icon are fetched from the page.
- **Paste** an address anywhere on the home page, or **drop** one from the
  browser onto the page or onto a folder.
- *Ajouter* also lists running containers that have no tile yet, pre-filled
  with their name, `http://<server>:<port>` and their container.
- Folders: *Nouveau dossier* at the bottom of the sidebar; drag folders to
  reorder them.
- **GitHub repositories** (`github.com/<owner>/<repo>`) are named after the
  repository, show the owner and their avatar, and go to a *GitHub* folder
  (created if needed). A folder holding only repositories shows compact tiles.
- **Checking links**: *Administration → Services → Vérifier les liens* (also
  run daily) visits every external link, fills a missing or broken icon, an
  empty description and a name that is only the address or a long page title,
  and flags dead links (page gone, site not answering) with « lien mort » on
  their tile. Small icons are stored in the database so they always show.

### Display styles

<kbd>V</kbd> cycles through them, or use the switcher in the status bar
(remembered per device):

| Style | Looks like |
| --- | --- |
| *Cartes* | Tiles with logo, name and live line (default) |
| *Liste* | One row per link, compact |
| *Icônes* | App icons, like a phone home screen |
| *Bento* | Favourites and tiles with live data as large cards |
| *Texte* | A plain start page in columns |

## The command palette

<kbd>Ctrl</kbd>+<kbd>K</kbd> (or <kbd>/</kbd>) is the one search of the
portal. Type anything; results are grouped:

| Group | What | Enter does |
| --- | --- | --- |
| *Liens* | Your links (most used first when nothing is typed) | Opens it (<kbd>Ctrl</kbd>+Enter: new tab) |
| *Catégories* | Your folders | Jumps to it |
| *Actions* | Add a link, show outages, display style, theme, light / dark, SSH, Docker discovery, Wrapped, style studio, lite mode, animated cursor; with 2+ letters also « Redémarrer X », « SSH vers X » and the Nextcloud maintenance actions | Runs it (restarts ask for a second Enter) |
| *Pages* | Home, Système, Home Assistant, Maison, Fichiers, Administration | Opens it |
| *Fichiers* | Nextcloud and kDrive files matching the name (3+ letters) | Opens the file in its app |
| *Demandes* | Films and series from Jellyseerr (3+ letters) | Requests it (second Enter confirms) |
| *Web* | Results from SearXNG (3+ letters), always last | Opens the page |

## Keyboard shortcuts

Press <kbd>?</kbd> for this list in the portal (also « Raccourcis clavier »
in the palette).

| Keys | Action |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> or <kbd>/</kbd> | Command palette |
| <kbd>1</kbd> … <kbd>9</kbd> | Open favourite n° |
| <kbd>G</kbd> then a letter | Go to a folder (the letter is shown next to it in the palette) |
| <kbd>G</kbd> <kbd>A</kbd> | Administration |
| <kbd>N</kbd> | Add a link |
| <kbd>V</kbd> | Next display style |
| <kbd>F</kbd> | Flip the selected tile |
| <kbd>Ctrl</kbd>+click | Open in a new tab |
| <kbd>Shift</kbd>+click | Select several links |
| <kbd>Shift</kbd>+<kbd>F10</kbd> or the Menu key | A tile's actions (like a right-click) |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Palette: open in a new tab · comment: save |
| <kbd>Ctrl</kbd>+<kbd>,</kbd> | Administration |
| <kbd>Esc</kbd> | Close; leave the "outages only" filter |
| <kbd>?</kbd> | Shortcuts help |

## Themes

*Administration → Thème → Apparence → Style*, or « Style » in the palette.

| Theme | In short |
| --- | --- |
| *Standard* | The clean default, light or dark, with your accent colour |
| *Papier* | Cream paper, kraft pills, ink logos, doodles and shaky letters (always light) |
| *Terminal* | Green phosphor CRT: scanlines, curved screen, boot sequence |
| *Verre liquide* | Glass tiles that bend what's behind them (Chrome / Edge; blurred elsewhere) |
| *Plan* | Architect's blueprint: blue grid, white strokes, dimensions |
| *Brutaliste* | Thick borders, offset shadows, huge monospace type |
| *Windows 98* | Teal desktop, bevelled grey windows, a taskbar (Start opens the palette) |
| *Pâte à modeler* | Puffy pastel tiles that squash when clicked |
| *Synthwave* | Neon perspective grid, striped sun, chrome titles (always dark) |

**Style studio** (« Studio de style » in the palette) builds your own: colours,
shapes (corners, borders, shadows), typography, background (grain, vignette,
scanlines) and tiles, with a live preview on the real page, presets and a 🎲
button. A style can be shared as a `NEXUS-…` code that others paste
into their studio.

**Per-device options** (*Administration → Thème → Mise en page*, or the
palette):

- *Mode léger* — drops the effects that cost the graphics chip every frame
  (animated background, blur, looping animations). Switches itself on once if
  the device can't keep up.
- *Curseur animé* — a small themed pointer (a pencil on *Papier*, a drafting
  cross on *Plan*…) with magnetic buttons. Off on touch screens.
- *Mode nuit* — from 11 pm to 6 am, only favourites are shown.

## Extras

- **Notifications** — a "Dynamic Island" at the top of the page tells you when
  a service goes down or comes back, when a Jellyfin playback starts, when an
  action finishes.
- **The creature** — the face in the sidebar logo is *Nexy* (rename it). Click
  it for its card. It grows (egg → baby → teen → adult → legend) with 10 XP
  per hour when every service answers and 5 XP per petting (6 a day). Its mood
  mirrors the server: sick when a service is down, hungry when image updates
  wait (*Nourrir* installs them), dirty when Docker has space to reclaim
  (*Laver* goes to the cleanup), tired when the disk fills or the CPU runs hot,
  asleep at night. It also reacts to what you do: it eats each finished image
  update, takes a bath then burps after a Docker cleanup, digs in the bin when
  a deleted link is restored, sulks while a service keeps falling (two drops
  in 30 minutes), and claps for every full week without an outage. Its card
  has a health book (*Carnet de santé*: outages, meals, baths, films watched…)
  and achievements that unlock accessories.
- **Nexus Wrapped** — your month as a story, Spotify Wrapped style: most
  opened links, uptime, outages… One slide at a time (tap or → to go on, hold
  to pause); the last one can be saved as a PNG. Offered the first days of
  each month for the month before.
- **Easter eggs** — type a word anywhere outside a text field (<kbd>Esc</kbd>
  stops it; they are listed under <kbd>?</kbd>):

  | Word | What happens |
  | --- | --- |
  | `boum` | Gravity: the tiles fall, grab and throw them |
  | `disco` | A mirror ball drops in and the tiles dance on the beat |
  | `matrix` | Green rain made of your services' names |
  | `snake` | A playable Snake that eats your tiles (arrows or ZQSD / WASD) |
  | `404` | The portal pretends to be gone for three seconds |

  A key that starts one of these words waits a moment before acting, so
  <kbd>N</kbd> and <kbd>4</kbd> still work as shortcuts.
- **Installable** — the portal is a PWA: *Add to Home Screen* on a phone gives
  it its own icon and window.
