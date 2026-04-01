const { extractDriveParams } = require('../lib/drive');

function getPublicOrigin(req) {
  const rawProtocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim().toLowerCase();
  const protocol = rawProtocol === 'http' ? 'http' : 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) throw new Error('Missing host header for URL generation.');
  return `${protocol}://${host}`;
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
    const mp4Url = new URL(`/mp4/${fileId}.mp4`, origin);
    const m3uUrl = new URL(`/m3u/${fileId}.m3u8`, origin);
    if (resourceKey) {
      mp4Url.searchParams.set('rk', resourceKey);
      m3uUrl.searchParams.set('rk', resourceKey);
    }

    res.status(200).json({
      fileId,
      resourceKey,
      mp4Url: mp4Url.toString(),
      m3uUrl: m3uUrl.toString()
    });
  } catch (error) {
    res.status(502).json({
      error: 'Unable to validate this Google Drive video link.',
      detail: error.message
    });
  }
};
