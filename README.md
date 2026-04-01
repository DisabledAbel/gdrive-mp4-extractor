# gdrive-mp4-extractor

A tiny web app that converts a Google Drive share URL (or file ID) into MP4-friendly URLs for VLC/Infuse/nPlayer.

## How it works

1. Paste a Google Drive share URL (or raw file ID).
2. The app extracts the file ID.
3. It generates a direct Google Drive download URL:
   - `https://drive.google.com/uc?export=download&id=<FILE_ID>`
4. It also generates deep-link formats for VLC/Infuse/nPlayer.

## Supported output formats

- **VLC (desktop):** Direct Drive download URL.
- **`vlc://` deep link:** Launches VLC with the direct URL.
- **Infuse deep link:** Uses `infuse://x-callback-url/play` with the direct URL.
- **nPlayer deep link:** Uses the `nplayer-https://...` scheme with the direct URL.

## Important notes

- The Google Drive file must be shared as **Anyone with the link**.
- If the file owner has disabled downloads, playback may fail.
- Some players handle Google Drive redirect/cookie challenges differently; if one player fails, test the same URL directly in a browser first.


## Optional environment variables (Vercel)

If you want the serverless proxy to try Google Drive API media access first, add one of these in Vercel Project Settings → Environment Variables:

- `GOOGLE_DRIVE_API_KEY`
- `GOOGLE_API_KEY`

Notes:
- The API-key path works best for publicly accessible files.
- If API-key access fails, the app falls back to the existing public-link resolution flow.
