const { extractDriveParams } = require('../lib/drive');

function getPublicOrigin(req) {
  const rawProtocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim().toLowerCase();
  const protocol = rawProtocol === 'http' ? 'http' : 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL || 'localhost:3000').split(',')[0].trim();
  return `${protocol}://${host}`;
}

function appendQuery(url, key, value) {
  if (!value) return url;
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

module.exports = async function handler(req, res) {
  try {
    const input = req.query.input || req.query.url || req.body?.input || req.body?.url;
    const { fileId, resourceKey } = extractDriveParams(input);

    if (!fileId) {
      res.status(400).json({ error: 'Please provide a valid Google Drive URL or file ID.' });
      return;
    }

    const origin = getPublicOrigin(req);
    const safeFileId = encodeURIComponent(fileId);

    let mp4Url = `${origin}/mp4/${safeFileId}.mp4`;
    let m3uUrl = `${origin}/m3u/${safeFileId}.m3u8`;

    if (resourceKey) {
      mp4Url = appendQuery(mp4Url, 'rk', resourceKey);
      m3uUrl = appendQuery(m3uUrl, 'rk', resourceKey);
    }

    res.status(200).json({
      fileId,
      resourceKey,
      mp4Url,
      m3uUrl
    });
  } catch (error) {
    res.status(502).json({
      error: 'Unable to validate this Google Drive video link.',
      detail: error.message
    });
  }
};
