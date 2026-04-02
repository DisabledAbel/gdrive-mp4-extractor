const FILE_ID_PATTERNS = [
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/i,
  /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{10,})/i,
  /drive\.google\.com\/uc\?(?:[^\s#]*&)?id=([a-zA-Z0-9_-]{10,})/i,
  /drive\.google\.com\/thumbnail\?(?:[^\s#]*&)?id=([a-zA-Z0-9_-]{10,})/i,
  /docs\.google\.com\/uc\?(?:[^\s#]*&)?id=([a-zA-Z0-9_-]{10,})/i,
  /[?&](?:id|file_id)=([a-zA-Z0-9_-]{10,})/i,
  /^([a-zA-Z0-9_-]{10,})(?:\.(?:mp4|mov))?$/i
];

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getResourceKeyFromValue(value) {
  return String(value || '').match(/[?&](?:resourcekey|rk)=([a-zA-Z0-9_-]+)/i)?.[1] || null;
}

function isDriveNonFilePath(pathname = '') {
  return /\/drive\/(?:folders\/|my-drive(?:\/|$)|shared-with-me(?:\/|$))/i.test(pathname);
}

function extractFromUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();

    if (!host.endsWith('google.com') && !host.endsWith('googleusercontent.com')) {
      return { fileId: null, resourceKey: null };
    }

    const path = parsed.pathname || '';
    if (host.includes('drive.google.com') && isDriveNonFilePath(path)) {
      return { fileId: null, resourceKey: null };
    }

    if (host === 'docs.google.com' && /^\/viewer$/i.test(path)) {
      const nestedUrl = parsed.searchParams.get('url') || '';
      if (nestedUrl) {
        const nested = extractFromUrl(safeDecode(nestedUrl));
        if (nested.fileId) {
          return {
            fileId: nested.fileId,
            resourceKey: nested.resourceKey || getResourceKeyFromValue(value)
          };
        }
      }
      return { fileId: null, resourceKey: null };
    }

    const pathSegments = path.split('/').filter(Boolean);

    const fileSegmentIndex = pathSegments.findIndex((segment) => segment === 'd');
    if (fileSegmentIndex >= 0) {
      const nextSegment = pathSegments[fileSegmentIndex + 1];
      if (nextSegment && /^[a-zA-Z0-9_-]{10,}$/.test(nextSegment)) {
        return {
          fileId: nextSegment,
          resourceKey: getResourceKeyFromValue(value)
        };
      }
    }

    const fromPath = pathSegments.find((segment) => /^[a-zA-Z0-9_-]{20,}$/.test(segment)) || null;
    const fromQuery = parsed.searchParams.get('id')
      || parsed.searchParams.get('file_id')
      || parsed.searchParams.get('docid')
      || null;
    const fileId = fromQuery || fromPath;

    if (!fileId) return { fileId: null, resourceKey: null };

    return {
      fileId,
      resourceKey: getResourceKeyFromValue(value)
    };
  } catch {
    return { fileId: null, resourceKey: null };
  }
}

function extractDriveParams(raw = '') {
  const value = safeDecode(String(raw).trim());
  if (!value) return { fileId: null, resourceKey: null };

  const fromUrl = extractFromUrl(value);
  if (fromUrl.fileId) {
    return fromUrl;
  }

  const fileId = FILE_ID_PATTERNS
    .map((pattern) => value.match(pattern)?.[1] || null)
    .find(Boolean) || null;

  if (!fileId) return { fileId: null, resourceKey: null };

  if (/drive\.google\.com\/drive\/(?:folders\/|my-drive(?:\/|$)|shared-with-me(?:\/|$))/i.test(value)) {
    return { fileId: null, resourceKey: null };
  }

  const resourceKey = getResourceKeyFromValue(value);
  return { fileId, resourceKey };
}

function extractFileId(raw = '') {
  return extractDriveParams(raw).fileId;
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
    if (key) cookieJar.set(key, value);
  }
}

function buildCookieHeader(cookieJar) {
  if (!cookieJar.size) return '';
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function classifyDriveInterstitial(html = '') {
  if (/Google Drive - Quota exceeded/i.test(html)) return 'quota_exceeded';
  if (/Virus scan warning/i.test(html) || /download_warning/i.test(html)) return 'virus_scan_warning';
  if (/You need access|Request access/i.test(html)) return 'permission_denied';
  if (/File not found|404\./i.test(html)) return 'not_found';
  return 'unknown';
}

function decodeEscapedUrl(urlValue = '') {
  return String(urlValue)
    .replace(/&amp;/g, '&')
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');
}

function withResourceKey(urlValue, resourceKey) {
  const nextUrl = new URL(urlValue, 'https://drive.google.com');
  if (resourceKey && !nextUrl.searchParams.has('resourcekey')) {
    nextUrl.searchParams.set('resourcekey', resourceKey);
  }
  return nextUrl.toString();
}

function extractGoogleDownloadUrl(html = '') {
  const encoded = html.match(/"downloadUrl":"([^"]+)"/i)?.[1]
    || html.match(/'downloadUrl':'([^']+)'/i)?.[1]
    || null;
  return encoded ? decodeEscapedUrl(encoded) : null;
}

function extractDownloadLinkFromHtml(html = '', fileId, resourceKey) {
  const directLink = html.match(/id=["']uc-download-link["'][^>]*href=["']([^"']+)["']/i)?.[1]
    || html.match(/href=["']([^"']*\/uc\?[^"']*export=download[^"']*)["']/i)?.[1]
    || null;

  if (directLink) {
    return withResourceKey(decodeEscapedUrl(directLink), resourceKey);
  }

  const embeddedDownloadUrl = extractGoogleDownloadUrl(html);
  if (embeddedDownloadUrl) {
    return withResourceKey(embeddedDownloadUrl, resourceKey);
  }

  const confirm = html.match(/[?&]confirm=([0-9A-Za-z_-]+)/)?.[1] || null;
  if (confirm) {
    const confirmUrl = new URL('https://drive.google.com/uc');
    confirmUrl.searchParams.set('export', 'download');
    confirmUrl.searchParams.set('confirm', confirm);
    confirmUrl.searchParams.set('id', fileId);
    if (resourceKey) confirmUrl.searchParams.set('resourcekey', resourceKey);
    return confirmUrl.toString();
  }

  return null;
}

async function discoverResourceKey(fileId) {
  try {
    const response = await fetch(`https://drive.google.com/file/d/${fileId}/view`, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; gdrive-mp4-extractor/1.0)' }
    });

    const location = response.headers.get('location') || '';
    const fromLocation = location.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/i)?.[1] || null;
    if (fromLocation) return fromLocation;

    if ((response.headers.get('content-type') || '').toLowerCase().includes('text/html')) {
      const html = await response.text();
      return html.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/i)?.[1] || null;
    }

    return null;
  } catch {
    return null;
  }
}

async function resolveDriveDownloadUrl(fileId, options = {}) {
  let resourceKey = options.resourceKey || null;
  if (!resourceKey) {
    resourceKey = await discoverResourceKey(fileId);
  }

  const cookieJar = new Map();
  const candidates = [
    new URL('https://drive.usercontent.google.com/download'),
    new URL('https://drive.google.com/uc')
  ];

  for (const candidate of candidates) {
    candidate.searchParams.set('export', 'download');
    candidate.searchParams.set('id', fileId);
    candidate.searchParams.set('confirm', 't');
    if (resourceKey) candidate.searchParams.set('resourcekey', resourceKey);
  }

  let url = candidates[0].toString();
  let attempts = 0;

  while (attempts < 10) {
    attempts += 1;

    const cookieHeader = buildCookieHeader(cookieJar);
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; gdrive-mp4-extractor/1.0)',
        ...(cookieHeader ? { cookie: cookieHeader } : {})
      }
    });

    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie');
    updateCookieJar(cookieJar, setCookies);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Drive redirect response missing location header.');
      url = withResourceKey(location, resourceKey);
      continue;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      const html = await response.text();

      const warningToken = [...cookieJar.entries()]
        .find(([name]) => name.startsWith('download_warning'))?.[1] || null;
      if (warningToken) {
        const warningUrl = new URL('https://drive.google.com/uc');
        warningUrl.searchParams.set('export', 'download');
        warningUrl.searchParams.set('confirm', warningToken);
        warningUrl.searchParams.set('id', fileId);
        if (resourceKey) warningUrl.searchParams.set('resourcekey', resourceKey);
        url = warningUrl.toString();
        continue;
      }

      const nextUrl = extractDownloadLinkFromHtml(html, fileId, resourceKey);
      if (nextUrl) {
        url = nextUrl;
        continue;
      }

      if (attempts === 1 && url.includes('drive.usercontent.google.com')) {
        url = candidates[1].toString();
        continue;
      }

      throw new Error(`Drive returned an interstitial page (${classifyDriveInterstitial(html)}).`);
    }

    if (!response.ok) {
      throw new Error(`Drive response failed with status ${response.status}.`);
    }

    return { url, response };
  }

  throw new Error('Unable to resolve a downloadable Google Drive stream after multiple attempts.');
}

async function fetchDriveStream(fileId, options = {}) {
  const result = await resolveDriveDownloadUrl(fileId, options);
  if (!result.response.body) {
    throw new Error('Drive returned no response body for media stream.');
  }
  return result.response;
}


module.exports = {
  extractFileId,
  extractDriveParams,
  sanitizeFileName,
  fetchDriveStream,
  resolveDriveDownloadUrl,
  classifyDriveInterstitial
};
