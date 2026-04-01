const FILE_ID_PATTERNS = [
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/i,
  /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{10,})/i,
  /drive\.google\.com\/uc\?(?:[^\s#]*&)?id=([a-zA-Z0-9_-]{10,})/i,
  /[?&]id=([a-zA-Z0-9_-]{10,})/i,
  /^([a-zA-Z0-9_-]{10,})(?:\.mp4)?$/i
];

function extractDriveParams(raw = '') {
  const value = String(raw).trim();
  if (!value) return { fileId: null, resourceKey: null };

  const fileId = FILE_ID_PATTERNS
    .map((pattern) => value.match(pattern)?.[1] || null)
    .find(Boolean) || null;

  if (!fileId) return { fileId: null, resourceKey: null };

  const resourceKey = value.match(/[?&](?:resourcekey|rk)=([a-zA-Z0-9_-]+)/i)?.[1] || null;
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


function extractUrlFromCipher(value = '') {
  const params = new URLSearchParams(String(value));
  return params.get('url') || null;
}

async function resolveFromVideoInfo(fileId) {
  const url = new URL('https://drive.google.com/get_video_info');
  url.searchParams.set('docid', fileId);
  url.searchParams.set('hl', 'en');

  const response = await fetch(url.toString(), {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; gdrive-mp4-extractor/1.0)' }
  });
  if (!response.ok) return null;

  const body = await response.text();
  const parsed = new URLSearchParams(body);
  const playerResponseRaw = parsed.get('player_response');
  if (!playerResponseRaw) return null;

  let playerResponse;
  try {
    playerResponse = JSON.parse(playerResponseRaw);
  } catch {
    return null;
  }

  const streamingData = playerResponse?.streamingData;
  if (!streamingData) return null;

  const candidates = [
    ...(Array.isArray(streamingData.formats) ? streamingData.formats : []),
    ...(Array.isArray(streamingData.adaptiveFormats) ? streamingData.adaptiveFormats : [])
  ];

  for (const item of candidates) {
    const directUrl = item?.url || extractUrlFromCipher(item?.signatureCipher || item?.cipher || '');
    if (directUrl) return directUrl;
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

  const videoInfoUrl = await resolveFromVideoInfo(fileId);
  if (videoInfoUrl) {
    const probeResponse = await fetch(videoInfoUrl, {
      redirect: 'manual',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; gdrive-mp4-extractor/1.0)' }
    });

    const redirectLocation = [301, 302, 303, 307, 308].includes(probeResponse.status)
      ? withResourceKey(probeResponse.headers.get('location') || videoInfoUrl, resourceKey)
      : videoInfoUrl;

    const response = await fetch(redirectLocation, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; gdrive-mp4-extractor/1.0)' }
    });

    if (response.ok) {
      return { url: redirectLocation, response };
    }
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
