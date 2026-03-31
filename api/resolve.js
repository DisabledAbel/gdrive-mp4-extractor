const { extractFileId, fetchDriveStream } = require('../lib/drive');

module.exports = async function handler(req, res) {
  const input = req.query.input || req.query.url || req.body?.input || req.body?.url;
  const fileId = extractFileId(input);

  if (!fileId) {
    res.status(400).json({ error: 'Please provide a valid Google Drive URL or file ID.' });
    return;
  }

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
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
    warning = `Validation probe failed: ${error.message}`;
  }

  res.status(200).json({
    fileId,
    mp4Url,
    validated,
    warning,
    contentType
  });
};
