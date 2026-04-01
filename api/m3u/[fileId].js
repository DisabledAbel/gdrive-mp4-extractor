const { extractDriveParams, sanitizeFileName } = require('../../lib/drive');

module.exports = async function handler(req, res) {
  try {
    const rawId = req.query.fileId || req.query.id || req.query.url;
    const { fileId, resourceKey: parsedResourceKey } = extractDriveParams(rawId);
    const resourceKey = req.query.rk || req.query.resourcekey || parsedResourceKey || null;

    if (!fileId) {
      res.status(400).json({ error: 'Missing or invalid Google Drive file ID.' });
      return;
    }

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const mp4Url = new URL(`${protocol}://${host}/mp4/${fileId}.mp4`);
    if (resourceKey) mp4Url.searchParams.set('rk', resourceKey);

    const fileName = sanitizeFileName(req.query.name || fileId);
    const playlist = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXTINF:-1,' + fileName,
      mp4Url.toString(),
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
