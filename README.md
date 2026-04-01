# gdrive-mp4-extractor

A tiny web app that converts a Google Drive share URL (or file ID) into a hosted MP4 endpoint and player-compatible links.

## How it works

1. Paste a Google Drive share URL (or raw file ID).
2. The app generates a Vercel-hosted URL in the format `/mp4/<FILE_ID>.mp4`.
3. Opening that URL calls a serverless function which fetches the Drive file and streams it back as video.

This gives you a stable app URL that behaves like an MP4 endpoint for VLC/Infuse/nPlayer.

## Project structure

- **VLC (desktop):** Hosted MP4 URL.
- **`vlc://` deep link:** Launches VLC with the hosted MP4 URL.
- **Infuse deep link:** Uses `infuse://x-callback-url/play` with the hosted MP4 URL.
- **nPlayer deep link:** Uses the `nplayer-https://...` scheme with the hosted MP4 URL.

## Deploy on Vercel

1. Push this repository to GitHub.
2. Import it into Vercel.
3. Deploy (no build command needed for this static + serverless setup).
4. Open your deployed domain and paste a Drive URL.

The rewrite in `vercel.json` maps `/mp4/:fileId.mp4` to the serverless function at `/api/mp4/:fileId`.

---

- The Google Drive file must be shared as **Anyone with the link**.
- Streaming succeeds only for files Google Drive allows unauthenticated download access to.
- Very large files may be slower due to Drive confirmation/interstitial behavior.
