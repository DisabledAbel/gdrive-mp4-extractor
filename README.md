# gdrive-mp4-extractor

Turn Google Drive share links into direct MP4 URLs for VLC, Infuse, and nPlayer — no backend, no installs, just open and go.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/DisabledAbel/gdrive-mp4-extractor)

---

## What it does

Google Drive share links (`drive.google.com/file/d/…`) don't work directly in media players. This tool converts them into stream-ready URLs you can paste straight into VLC, Infuse, nPlayer, or any app that accepts direct links.

Everything runs in your browser. There's no server, no account, and nothing to install.

---

## Usage

1. Visit the live site on Vercel
2. Paste your Google Drive share URL
3. Copy the generated direct link
4. Open it in your media player of choice

No setup needed — it's already deployed and ready to use.

---

## Compatibility

| App | Platform | Status |
|-----|----------|--------|
| VLC | iOS, Android, Desktop | ✅ |
| Infuse | iOS, tvOS, macOS | ✅ |
| nPlayer | iOS, Android | ✅ |
| Any direct-link player | — | ✅ |

---

## Supported URL formats

```
https://drive.google.com/file/d/FILE_ID/view?usp=sharing
https://drive.google.com/file/d/FILE_ID/view
https://drive.google.com/open?id=FILE_ID
```

---

## Requirements

- The file must be set to **"Anyone with the link can view"** in Google Drive sharing settings
- The file must be an MP4 (or other direct-playable format)

---

## Deploy your own

This project is a single static HTML file — deploy it anywhere that serves static sites.

**Vercel (recommended)**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/DisabledAbel/gdrive-mp4-extractor)

---

## How it works

The tool extracts the file ID from your share URL and constructs a `drive.google.com/uc?export=download&id=FILE_ID` link, which Google Drive serves as a direct download/stream endpoint compatible with media players.

---

## Notes

- Large files (>100MB) may hit Google's virus-scan confirmation page. Some players handle this automatically; others may not.
- Links are not permanent — if the file owner changes permissions or deletes the file, the link will stop working.
- This tool does not upload, store, or transmit your URLs anywhere.

---

## License

MIT
