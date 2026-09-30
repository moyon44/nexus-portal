# Files

With the [Nextcloud](integrations.md#nextcloud) (app password) and / or
[kDrive](integrations.md#kdrive-infomaniak) integrations set up, your files are
reachable in three places.

## In the sidebar: *Stockage*

Under your folders, *Nextcloud* and *kDrive* unfold like a tree. Each folder
loads its content when you open it, one level at a time, so large drives stay
fast. Click a file to open it in its web app, in a new tab.

Hovering a folder (always visible on touch screens) shows:

- ☁︎⤴ **send files** into it (on a phone: photo library, camera or the Files app);
- 📁+ **new folder** inside it;
- ↗ **open it** on the web.

You can also **drop files** from your computer onto any folder. *Tout voir*
opens the Files page.

## The Files page

*Fichiers* in the sidebar or in Ctrl K.

- **Nextcloud / kDrive** switch at the top right (remembered).
- **Breadcrumb** to go back to any level, ↰ to go up one.
- **List**: folders first, then files with an icon per type (PDF, image, Word,
  Excel, video…), last change and size. Click *Nom*, *Modifié* or *Taille* to
  sort, again to reverse.
- **Search** covers the whole drive, not just the open folder. Each result
  shows where it is; 📂 takes you to its folder, ↗ opens it.
- **Nouveau dossier**: type a name, Enter.
- **Déposer**, or drop files **anywhere on the page**: a frame shows where they
  will go, and each file gets a progress bar.

## In the palette

<kbd>Ctrl</kbd>+<kbd>K</kbd>, 3+ letters: matching files from both drives appear
in *Fichiers*; Enter opens one.

## Rules

- **Nothing is overwritten**: a file whose name is taken is saved as
  « name (2).pdf » (kDrive numbers them its own way), and you're told.
- **Deleting** isn't possible from the portal (on purpose); do it in the apps.
- **kDrive's root** only holds its spaces (*Private*, shared folders…):
  Infomaniak accepts no file or folder there, so the portal greys *Déposer* and
  *Nouveau dossier* out until you open one of them.
- The portal acts with the **rights of the account** whose credentials you
  gave (the Nextcloud app password, the kDrive token).

## Limits

- **100 MB per file.** That's what Cloudflare's free plan lets through per
  request; the portal refuses larger files up front with a clear message. If
  your portal isn't behind such a proxy you can raise it in three places:
  - `MAX_UPLOAD` in `backend/src/routes/integrations.ts`;
  - `MAX_UPLOAD` in `lib/storage.ts`;
  - `client_max_body_size` in `nginx.conf`, block
    `location ~ ^/api/integrations/(nextcloud|kdrive)/upload`.

  kDrive's simple upload accepts up to 1 GB per file.
- Files are **streamed** from the browser to Nextcloud or kDrive through the
  backend, never stored on the portal's server.
- kDrive: Infomaniak allows 60 API calls a minute. Browsing and searching use
  one call each, so normal use stays far below.

## How the links open

| | Nextcloud | kDrive |
| --- | --- | --- |
| File | `https://<your Nextcloud tile>/f/<file id>` (Nextcloud opens it in its folder) | `https://ksuite.infomaniak.com/<account>/kdrive/app/drive/<drive>/redirect/<file id>` |
| Folder | `…/apps/files/files/<id>?dir=<path>` | `…/kdrive/app/drive/<drive>/files/<folder id>` |

Nextcloud links use the address of your Nextcloud **tile** (its public address)
rather than the LAN address the backend uses, so they open from anywhere.
