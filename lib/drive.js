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

async function fetchDriveStream(fileId, options = {}) {
  let url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;

  for (let i = 0; i < 5; i += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; gdrive-mp4-extractor/1.0)',
        ...(options.rangeProbe ? { range: 'bytes=0-1' } : {})
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

      const actionMatch = html.match(/<form[^>]+id=["']download-form["'][^>]*action=["']([^"']+)["']/i);
      if (actionMatch?.[1]) {
        const actionUrl = new URL(actionMatch[1], 'https://drive.google.com');
        const inputMatches = [...html.matchAll(/<input[^>]+name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi)];
        for (const [, name, value] of inputMatches) {
          if (!actionUrl.searchParams.has(name)) {
            actionUrl.searchParams.set(name, value);
          }
        }
        if (!actionUrl.searchParams.has('id')) {
          actionUrl.searchParams.set('id', fileId);
        }
        url = actionUrl.toString();
        continue;
      }

      const directHrefMatch = html.match(/id=["']uc-download-link["'][^>]*href=["']([^"']+)["']/i);
      if (directHrefMatch?.[1]) {
        url = new URL(directHrefMatch[1].replace(/&amp;/g, '&'), 'https://drive.google.com').toString();
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

module.exports = {
  extractFileId,
  sanitizeFileName,
  fetchDriveStream
};
