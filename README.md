# GDrive MP4 Extractor

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

Extract direct MP4-compatible stream/download links from Google Drive URLs, with optional server-side resolving + proxy endpoints for better player compatibility.

---

## ✨ Features

- Convert Google Drive share links (or raw file IDs) into playback-ready URLs.
- Generate links for common players:
  - VLC (desktop URL)
  - `vlc://` deep links
  - Infuse deep links
  - nPlayer deep links
- Optional API endpoints for resolving/probing and streaming:
  - `GET /api/resolve`
  - `GET /api/mp4/:fileId`
- Local Express server for development (`npm start`).
- Vercel-ready with clean rewrite route (`/mp4/:fileId.mp4`).

---

## 🎯 Why this project exists

Google Drive share pages are not always directly playable in media apps. This project provides a developer-friendly way to turn share links into URLs that streaming apps can consume more reliably.

---

## 🧪 Demo Example

### Input

```text
https://drive.google.com/file/d/17n4vyhsm2tiR3M8M61hsN3AT6FaQetX9/view
```

### Output

```text
https://drive.google.com/uc?export=download&id=17n4vyhsm2tiR3M8M61hsN3AT6FaQetX9
```

---

## 📦 Installation

```bash
git clone <your-repo-url>
cd gdrive-mp4-extractor
npm install
```

You can also use Yarn:

```bash
yarn
```

---

## 🚀 Usage

After starting the app, open the UI in your browser, paste a Google Drive URL or file ID, choose output format, and copy/open the generated link.

---

## 🛠️ Run Locally (Step-by-Step)

1. **Clone the repository**

```bash
git clone <your-repo-url>
cd gdrive-mp4-extractor
```

2. **Install dependencies**

```bash
npm install
```

3. **Start the local server**

```bash
npm start
```

4. **Open in browser**

```text
http://localhost:3000
```

5. **Example API command usage**

```bash
curl "http://localhost:3000/api/resolve?input=https://drive.google.com/file/d/17n4vyhsm2tiR3M8M61hsN3AT6FaQetX9/view"
```

### Expected output (example)

```json
{
  "fileId": "17n4vyhsm2tiR3M8M61hsN3AT6FaQetX9",
  "mp4Url": "http://localhost:3000/mp4/17n4vyhsm2tiR3M8M61hsN3AT6FaQetX9.mp4",
  "validated": true,
  "warning": "",
  "contentType": "video/mp4"
}
```

---

## ▲ Deploy to Vercel

### 1) Install Vercel CLI

```bash
npm i -g vercel
```

### 2) Deploy (preview)

```bash
vercel
```

### 3) Deploy to production

```bash
vercel --prod
```

Vercel auto-detects Node.js projects and deploys the serverless API routes in `/api`.

### Optional `vercel.json` rewrite

This project already includes:

```json
{
  "rewrites": [
    {
      "source": "/mp4/:fileId.mp4",
      "destination": "/api/mp4/:fileId"
    }
  ]
}
```

### Optional environment variables

Configure either key in **Vercel Project Settings → Environment Variables**:

- `GOOGLE_DRIVE_API_KEY`
- `GOOGLE_API_KEY`

Behavior:
- API key path is attempted first for Drive media access.
- Public-link fallback logic is used if API-key access fails.

---

## 🔌 API Usage

### `GET /api/resolve?input=<drive_url_or_file_id>`

Resolves/probes input and returns:

- `fileId`
- `mp4Url`
- `validated`
- `warning`
- `contentType`

Example:

```bash
curl "http://localhost:3000/api/resolve?input=17n4vyhsm2tiR3M8M61hsN3AT6FaQetX9"
```

### `GET /api/mp4/:fileId`

Proxies/streams Drive media response.

Example:

```bash
curl -I "http://localhost:3000/api/mp4/17n4vyhsm2tiR3M8M61hsN3AT6FaQetX9"
```

---

## 🗂️ Project Structure

```text
gdrive-mp4-extractor/
├─ api/
│  ├─ mp4/[fileId].js
│  └─ resolve.js
├─ lib/
│  └─ drive.js
├─ public/
│  └─ index.html
├─ server.js
├─ vercel.json
├─ package.json
└─ README.md
```

---

## ⚠️ Limitations

- Drive file must be shared as **Anyone with the link**.
- If owner disables downloads, direct playback may fail.
- Some players handle Google redirect/cookie flows differently.
- Google Drive behavior may change over time.

---

## 🛣️ Roadmap

- [ ] Add automated tests for `lib/drive.js` and API routes.
- [ ] Add optional auth flow for private Drive files.
- [ ] Add batch conversion mode (multiple links).
- [ ] Add M3U playlist export helper.
- [ ] Add Dockerfile for one-command self-hosting.

---

## 💡 Tips (M3U / Streaming Apps)

- Use the generated direct URL in M3U entries:

```text
#EXTINF:-1,My Drive Video
https://drive.google.com/uc?export=download&id=<FILE_ID>
```

- If app playback fails, test URL first in browser/VLC desktop.
- Prefer hosted `/mp4/:fileId.mp4` endpoint when your player handles redirects poorly.

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a pull request

Please include clear reproduction/test steps in PRs.

---

## 📄 License

MIT — see [LICENSE](./LICENSE).
