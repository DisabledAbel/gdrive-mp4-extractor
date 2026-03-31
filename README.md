# gdrive-mp4-extractor

A tiny single-file web app that converts a Google Drive share URL (or file ID) into player-compatible links for VLC, Infuse, and nPlayer.

## How to use

1. Open `index.html` directly in your browser, or host this repo with GitHub Pages.
2. Paste a Google Drive share link (or raw file ID).
3. Pick one of the output formats.
4. Copy the generated URL or launch it directly with **Open / Launch**.

## Supported output formats

- **VLC (desktop):** Standard Google Drive file-view URL that VLC can often open as a network target.
- **`vlc://` deep link:** Tries to launch VLC directly using a custom protocol handler.
- **Infuse deep link:** Uses `infuse://x-callback-url/play` with a percent-encoded URL payload.
- **nPlayer deep link:** Uses the `nplayer-https://...` scheme to pass an HTTPS URL into nPlayer.

## Important notes

- Your Google Drive file must be shared as **Anyone with the link**.
- Google Drive does **not** expose a stable raw unauthenticated MP4 stream URL; this app generates player-compatible links that VLC, Infuse, and nPlayer resolve on their own.

## GitHub Pages

To publish at `https://USERNAME.github.io/gdrive-mp4-extractor/`:

1. Push this repo to GitHub as `gdrive-mp4-extractor`.
2. In GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **main** and folder **/(root)**, then save.
