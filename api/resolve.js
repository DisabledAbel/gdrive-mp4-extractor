const { extractFileId } = require('../lib/drive');

module.exports = async function handler(req, res) {
  try {
    const input = req.query.input || req.query.url || req.body?.input || req.body?.url;
    const fileId = extractFileId(input);

    if (!fileId) {
      res.status(400).json({ error: 'Please provide a valid Google Drive URL or file ID.' });
      return;
    }

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const mp4Url = `${protocol}://${host}/mp4/${fileId}.mp4`;

    res.status(200).json({
      fileId,
      mp4Url
    });
  } catch (error) {
    res.status(502).json({
      error: 'Unable to validate this Google Drive video link.',
      detail: error.message
    });
  }
};
