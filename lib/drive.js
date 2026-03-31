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


function driveError(message, statusCode = 502, code = 'DRIVE_FETCH_FAILED') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function sanitizeFileName(value) {
  return String(value || 'video')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'video';
}

function decodeEscapedUrl(raw) {
  return raw
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');
}

function extractDownloadUrlFromHtml(html, fallbackUrl, fileId) {
  const jsonDownloadUrl = html.match(/"downloadUrl":"([^"]+)"/i)?.[1];
  if (jsonDownloadUrl) {
    return decodeEscapedUrl(jsonDownloadUrl);
  }

  const hrefDownloadUrl = html.match(/href="([^"]*(?:uc\?export=download|drive\.usercontent\.google\.com\/download)[^"]*)"/i)?.[1];
  if (hrefDownloadUrl) {
    return new URL(hrefDownloadUrl.replace(/&amp;/g, '&'), fallbackUrl).toString();
  }

  const confirm = html.match(/[?&]confirm=([0-9A-Za-z_\-]+)/)?.[1];
  if (confirm) {
    return `https://drive.google.com/uc?export=download&confirm=${encodeURIComponent(confirm)}&id=${encodeURIComponent(fileId)}`;
  }

  return null;
}

function extractConfirmFromCookies(response) {
  const setCookie = response.headers.get('set-cookie') || '';
  const token = setCookie.match(/download_warning[^=]*=([^;]+)/i)?.[1];
  return token ? decodeURIComponent(token) : null;
}

async function fetchDriveStream(fileId, options = {}) {
  let url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;

  for (let i = 0; i < 7; i += 1) {
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

    const cookieConfirm = extractConfirmFromCookies(response);
    if (cookieConfirm) {
      url = `https://drive.google.com/uc?export=download&confirm=${encodeURIComponent(cookieConfirm)}&id=${encodeURIComponent(fileId)}`;
      continue;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const extractedUrl = extractDownloadUrlFromHtml(html, url, fileId);
      if (extractedUrl) {
        url = extractedUrl;
        continue;
      }

      throw driveError('Drive returned an HTML interstitial page instead of media. Ensure file is shared publicly.', 403, 'DRIVE_INTERSTITIAL');
    }

    if (!response.ok || !response.body) {
      throw driveError(`Drive response failed with status ${response.status}.`, response.status, 'DRIVE_HTTP_ERROR');
    }

    return response;
  }

  throw driveError('Unable to resolve a downloadable stream from Google Drive. Ensure the file is public and downloadable.', 504, 'DRIVE_RESOLVE_TIMEOUT');
}

module.exports = {
  extractFileId,
  sanitizeFileName,
  fetchDriveStream,
  driveError
};
