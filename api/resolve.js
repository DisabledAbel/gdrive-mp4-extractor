const { extractFileId, fetchDriveStream } = require('../lib/drive');

module.exports = async function handler(req, res) {
  try {
    const input = req.query.input || req.query.url || req.body?.input || req.body?.url;
    const fileId = extractFileId(input);

    if (!fileId) {
      res.status(400).json({
        error: 'Please provide a valid Google Drive URL or file ID.',
        code: 'INVALID_INPUT'
      });
      return;
    }

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    if (!host) {
      res.status(500).json({ error: 'Missing request host header.', code: 'MISSING_HOST' });
      return;
    }

    const mp4Url = `${protocol}://${host}/mp4/${fileId}.mp4`;
    let validated = false;
    let warning = '';
    let contentType = null;

    try {
      const probeResponse = await fetchDriveStream(fileId, { rangeProbe: true });
      contentType = probeResponse.headers.get('content-type') || null;
      probeResponse.body?.cancel();
      validated = true;
    } catch (error) {
      warning = error.message;
    }

    res.status(200).json({
      fileId,
      mp4Url,
      validated,
      warning,
      contentType
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message || 'Unexpected resolve error.',
      code: error.code || 'RESOLVE_UNKNOWN'
    });
  }
};
