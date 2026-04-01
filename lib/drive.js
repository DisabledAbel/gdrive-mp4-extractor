const FILE_ID_PATTERNS = [
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/i,
  /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{10,})/i,
  /drive\.google\.com\/uc\?(?:[^\s#]*&)?id=([a-zA-Z0-9_-]{10,})/i,
  /[?&]id=([a-zA-Z0-9_-]{10,})/i,
  /^([a-zA-Z0-9_-]{10,})(?:\.mp4)?$/i
];

function extractFileId(raw = '') {
  return extractDriveParams(raw).fileId;
}

function extractDriveParams(raw = '') {
  const value = String(raw).trim();
  if (!value) return { fileId: null, resourceKey: null };

  let fileId = null;
  for (const pattern of FILE_ID_PATTERNS) {
    const match = value.match(pattern);
    if (match?.[1]) {
      fileId = match[1];
      break;
    }
  }

  if (!fileId) return { fileId: null, resourceKey: null };

  const resourceKeyMatch = value.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/i)
    || value.match(/[?&]rk=([a-zA-Z0-9_-]+)/i);

  return {
    fileId,
    resourceKey: resourceKeyMatch?.[1] || null
  };
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
  const encodedUrlMatch = html.match(/"downloadUrl":"([^"]+)"/i)
    || html.match(/'downloadUrl':'([^']+)'/i);
  if (!encodedUrlMatch?.[1]) return null;

  return encodedUrlMatch[1]
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');
}

async function fetchDriveStream(fileId, options = {}) {
  const resourceKey = options.resourceKey || null;
  const baseUrl = new URL('https://drive.google.com/uc');
  baseUrl.searchParams.set('export', 'download');
  baseUrl.searchParams.set('id', fileId);
  if (resourceKey) baseUrl.searchParams.set('resourcekey', resourceKey);

  let url = baseUrl.toString();
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

    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie');
    if (setCookies) {
      updateCookieJar(cookieJar, setCookies);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) break;
      url = ensureResourceKey(location, resourceKey);
      continue;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const confirm = html.match(/[?&]confirm=([0-9A-Za-z_\-]+)/)?.[1]
        || [...cookieJar.entries()].find(([name]) => name.startsWith('download_warning'))?.[1];

      if (confirm) {
        const confirmUrl = new URL('https://drive.google.com/uc');
        confirmUrl.searchParams.set('export', 'download');
        confirmUrl.searchParams.set('confirm', confirm);
        confirmUrl.searchParams.set('id', fileId);
        if (resourceKey) confirmUrl.searchParams.set('resourcekey', resourceKey);
        url = confirmUrl.toString();
        continue;
      }

      const formActionUrl = extractFormActionUrl(html, fileId, resourceKey);
      if (formActionUrl) {
        url = formActionUrl;
        trace.push('form_action');
        continue;
      }

      const directLink = html.match(/href=["']([^"']*\/uc\?[^"']*export=download[^"']*)["']/i)?.[1]
        || html.match(/id=["']uc-download-link["'][^>]*href=["']([^"']+)["']/i)?.[1];
      if (directLink) {
        const nextUrl = attachResourceKeyToUrl(decodeEscapedUrl(directLink), resourceKey);
        if (nextUrl) {
          url = nextUrl;
          trace.push('direct_link');
          continue;
        }
        trace.push('invalid_direct_link');
      }

      const downloadUrl = extractGoogleDownloadUrl(html);
      if (downloadUrl) {
        const nextUrl = attachResourceKeyToUrl(decodeEscapedUrl(downloadUrl), resourceKey);
        if (nextUrl) {
          url = nextUrl;
          trace.push('embedded_download_url');
          continue;
        }
        if (resourceKey && !actionUrl.searchParams.has('resourcekey')) {
          actionUrl.searchParams.set('resourcekey', resourceKey);
        }
        trace.push('invalid_embedded_download_url');
      }

      const directHrefMatch = html.match(/id=["']uc-download-link["'][^>]*href=["']([^"']+)["']/i);
      if (directHrefMatch?.[1]) {
        const nextUrl = new URL(directHrefMatch[1].replace(/&amp;/g, '&'), 'https://drive.google.com');
        if (resourceKey && !nextUrl.searchParams.has('resourcekey')) {
          nextUrl.searchParams.set('resourcekey', resourceKey);
        }
        url = nextUrl.toString();
        continue;
      }

      const downloadUrl = extractGoogleDownloadUrl(html);
      if (downloadUrl) {
        const nextUrl = new URL(downloadUrl, 'https://drive.google.com');
        if (resourceKey && !nextUrl.searchParams.has('resourcekey')) {
          nextUrl.searchParams.set('resourcekey', resourceKey);
        }
        url = nextUrl.toString();
        continue;
      }

      const downloadUrl = extractGoogleDownloadUrl(html);
      if (downloadUrl) {
        url = attachResourceKeyToUrl(downloadUrl, resourceKey);
        trace.push('embedded_download_url');
        continue;
      }

      const category = classifyDriveInterstitial(html);
      throw new Error(`Drive returned an HTML interstitial page instead of media. category=${category}; attempts=${trace.join('>') || 'none'}`);
    }

    if (!response.ok || !response.body) {
      throw new Error(`Drive response failed with status ${response.status}.`);
    }

    return response;
  }

  throw new Error(`Unable to resolve a downloadable stream from Google Drive. attempts=${trace.join('>') || 'none'}`);
}

module.exports = {
  extractFileId,
  extractDriveParams,
  sanitizeFileName,
  fetchDriveStream,
  classifyDriveInterstitial
};
