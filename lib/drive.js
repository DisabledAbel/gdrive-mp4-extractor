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

function updateCookieJar(cookieJar, setCookieHeader) {
  if (!setCookieHeader) return;

  const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const rawCookie of setCookies) {
    const cookiePart = String(rawCookie).split(';')[0]?.trim();
    if (!cookiePart) continue;

    const separatorIndex = cookiePart.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = cookiePart.slice(0, separatorIndex).trim();
    const value = cookiePart.slice(separatorIndex + 1).trim();
    if (!key) continue;
    cookieJar.set(key, value);
  }
}

function buildCookieHeader(cookieJar) {
  if (!cookieJar.size) return '';
  return [...cookieJar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

function extractGoogleDownloadUrl(html) {
  const encodedUrlMatch = html.match(/"downloadUrl":"([^"]+)"/i);
  if (!encodedUrlMatch?.[1]) return null;

  return encodedUrlMatch[1]
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');
}

async function fetchDriveStream(fileId, options = {}) {
  let url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  const cookieJar = new Map();

  for (let i = 0; i < 7; i += 1) {
    const cookieHeader = buildCookieHeader(cookieJar);
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; gdrive-mp4-extractor/1.0)',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...(options.rangeProbe ? { range: 'bytes=0-1' } : {})
      }
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      updateCookieJar(cookieJar, setCookie.split(/,(?=\s*[^;,\s]+=)/));
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) break;
      url = new URL(location, url).toString();
      continue;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const confirm = html.match(/[?&]confirm=([0-9A-Za-z_\-]+)/)?.[1]
        || [...cookieJar.entries()].find(([name]) => name.startsWith('download_warning'))?.[1];

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

      const downloadUrl = extractGoogleDownloadUrl(html);
      if (downloadUrl) {
        url = new URL(downloadUrl, 'https://drive.google.com').toString();
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
