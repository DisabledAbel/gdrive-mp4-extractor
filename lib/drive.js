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



function decodeEscapedUrl(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/\u003d/g, '=')
    .replace(/\u0026/g, '&')
    .replace(/\\//g, '/');
}

function safeParseUrl(value, base = 'https://drive.google.com') {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

function classifyDriveInterstitial(html) {
  const body = String(html || '').toLowerCase();
  if (body.includes('quota exceeded') || body.includes('too many users have viewed')) return 'quota_exceeded';
  if (body.includes('access denied') || body.includes('you need access') || body.includes('request access')) return 'permission_denied';
  if (body.includes('cannot scan this file for viruses') || body.includes('virus scan warning')) return 'virus_scan_warning';
  if (body.includes('google drive - file not found') || body.includes('file you have requested does not exist')) return 'file_not_found';
  if (body.includes('cannot download this file at this time')) return 'temporary_blocked';
  return 'unknown_interstitial';
}

function buildDriveDownloadUrl(fileId, resourceKey, extra = {}) {
  const url = new URL('https://drive.google.com/uc');
  url.searchParams.set('export', 'download');
  url.searchParams.set('id', fileId);
  if (resourceKey) url.searchParams.set('resourcekey', resourceKey);

  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function attachResourceKeyToUrl(url, resourceKey) {
  const nextUrl = safeParseUrl(url);
  if (!nextUrl) return null;
  if (resourceKey && !nextUrl.searchParams.has('resourcekey')) {
    nextUrl.searchParams.set('resourcekey', resourceKey);
  }
  return nextUrl.toString();
}

function extractFormActionUrl(html, fileId, resourceKey) {
  const formMatch = html.match(/<form[^>]+action=["']([^"']+)["'][^>]*>/i);
  if (!formMatch?.[1]) return null;

  const formTag = formMatch[0] || '';
  const hasPostMethod = /method=["']post["']/i.test(formTag);
  const actionUrl = safeParseUrl(formMatch[1]);
  if (!actionUrl) return null;

  const inputMatches = [...html.matchAll(/<input[^>]+name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi)];
  for (const [, name, value] of inputMatches) {
    if (!actionUrl.searchParams.has(name)) actionUrl.searchParams.set(name, value);
  }

  if (!actionUrl.searchParams.has('id')) actionUrl.searchParams.set('id', fileId);
  if (!actionUrl.searchParams.has('export')) actionUrl.searchParams.set('export', 'download');
  if (resourceKey && !actionUrl.searchParams.has('resourcekey')) {
    actionUrl.searchParams.set('resourcekey', resourceKey);
  }

  if (hasPostMethod) {
    return buildDriveDownloadUrl(fileId, resourceKey, Object.fromEntries(actionUrl.searchParams.entries()));
  }

  return actionUrl.toString();
}

async function fetchDriveStream(fileId, options = {}) {
  const resourceKey = options.resourceKey || null;
  let url = buildDriveDownloadUrl(fileId, resourceKey);
  const cookieJar = new Map();
  const trace = [];

  for (let i = 0; i < 9; i += 1) {
    const cookieHeader = buildCookieHeader(cookieJar);
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; gdrive-mp4-extractor/1.0)',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...(options.range ? { range: options.range } : {}),
        ...(options.rangeProbe ? { range: 'bytes=0-1' } : {})
      }
    });

    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie');
    if (setCookies) updateCookieJar(cookieJar, setCookies);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) break;
      const redirectUrl = attachResourceKeyToUrl(location, resourceKey);
      if (!redirectUrl) {
        trace.push('invalid_redirect_url');
        continue;
      }
      url = redirectUrl;
      trace.push('redirect');
      continue;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      const html = await response.text();

      const confirm = html.match(/[?&]confirm=([0-9A-Za-z_\-]+)/)?.[1]
        || [...cookieJar.entries()].find(([name]) => name.startsWith('download_warning'))?.[1];
      if (confirm) {
        const uuid = html.match(/[?&]uuid=([0-9a-f-]{8,})/i)?.[1];
        url = buildDriveDownloadUrl(fileId, resourceKey, { confirm, ...(uuid ? { uuid } : {}) });
        trace.push('confirm_token');
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
        trace.push('invalid_embedded_download_url');
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
