const { Readable } = require('stream');

const FILE_ID_PATTERNS = [
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/i,
  /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{10,})/i,
  /drive\.google\.com\/uc\?(?:[^\s#]*&)?id=([a-zA-Z0-9_-]{10,})/i,
  /[?&]id=([a-zA-Z0-9_-]{10,})/i,
  /^([a-zA-Z0-9_-]{10,})$/
];

function extractFileId(raw = '') {
  const value = String(raw).trim();
  if (!value) return null;

  for (const pattern of FILE_ID_PATTERNS) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function sanitizeFileName(value) {
  return String(value || 'video')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'video';
}

async function fetchDriveStream(fileId) {
  let url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;

  for (let i = 0; i < 5; i += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; gdrive-mp4-extractor/1.0)'
      }
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) break;
      url = new URL(location, url).toString();
      continue;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const confirm = html.match(/[?&]confirm=([0-9A-Za-z_\-]+)/)?.[1];
      if (confirm) {
        url = `https://drive.google.com/uc?export=download&confirm=${encodeURIComponent(confirm)}&id=${encodeURIComponent(fileId)}`;
        continue;
      }

      throw new Error('Drive returned an HTML interstitial page instead of media.');
    }

    if (!response.ok || !response.body) {
      throw new Error(`Drive response failed with status ${response.status}.`);
    }

    return response;
  }

  throw new Error('Unable to resolve a downloadable stream from Google Drive.');
}

module.exports = async function handler(req, res) {
  try {
    const rawId = req.query.fileId || req.query.id || req.query.url;
    const fileId = extractFileId(rawId);

    if (!fileId) {
      res.status(400).json({ error: 'Missing or invalid Google Drive file ID.' });
      return;
    }

    const driveResponse = await fetchDriveStream(fileId);
    const upstreamContentType = driveResponse.headers.get('content-type') || 'video/mp4';
    const upstreamLength = driveResponse.headers.get('content-length');
    const upstreamDisposition = driveResponse.headers.get('content-disposition') || '';
    const matchedName = upstreamDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const fileName = sanitizeFileName(decodeURIComponent(matchedName?.[1] || matchedName?.[2] || fileId));

    res.statusCode = 200;
    res.setHeader('Content-Type', upstreamContentType.includes('video') ? upstreamContentType : 'video/mp4');
    if (upstreamLength) res.setHeader('Content-Length', upstreamLength);
    res.setHeader('Content-Disposition', `inline; filename="${fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`}"`);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    Readable.fromWeb(driveResponse.body).pipe(res);
  } catch (error) {
    res.status(502).json({
      error: 'Could not fetch video from Google Drive.',
      detail: error.message
    });
  }
};
