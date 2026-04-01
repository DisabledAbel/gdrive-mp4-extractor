const { extractDriveParams, sanitizeFileName } = require('../../lib/drive');

function getPublicOrigin(req) {
  const rawProtocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim().toLowerCase();
  const protocol = rawProtocol === 'http' ? 'http' : 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) throw new Error('Missing host header for URL generation.');
  return `${protocol}://${host}`;
}

function appendQuery(url, key, value) {
  if (!value) return url;
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

module.exports = async function handler(req, res) {
  try {
    const rawId = req.query.fileId || req.query.id || req.query.url;
    const { fileId, resourceKey: parsedResourceKey } = extractDriveParams(rawId);
    const resourceKey = req.query.rk || req.query.resourcekey || parsedResourceKey || null;

    if (!fileId) {
      res.status(400).json({ error: 'Missing or invalid Google Drive file ID.' });
      return;
    }

    const origin = getPublicOrigin(req);
    const safeFileId = encodeURIComponent(fileId);
    let mp4Url = `${origin}/mp4/${safeFileId}.mp4`;
    if (resourceKey) mp4Url = appendQuery(mp4Url, 'rk', resourceKey);

    const fileName = sanitizeFileName(req.query.name || fileId);
    const playlist = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXTINF:-1,' + fileName,
      mp4Url,
      '#EXT-X-ENDLIST'
    ].join('\n');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.m3u8"`);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.send(playlist);
  } catch (error) {
    res.status(502).json({
      error: 'Could not build M3U URL from Google Drive input.',
      detail: error.message
    });
  }
};
