const { extractDriveParams } = require('../lib/drive');

module.exports = async function handler(req, res) {
  try {
    const input = req.query.input || req.query.url || req.body?.input || req.body?.url;
    const { fileId, resourceKey } = extractDriveParams(input);

    if (!fileId) {
      const isFolderLike = /drive\.google\.com\/drive\/(?:folders\/|my-drive(?:\/|$)|shared-with-me(?:\/|$))/i.test(String(input || ''));
      res.status(400).json({
        error: isFolderLike
          ? 'This is a Google Drive folder/location URL. Please provide a file URL (…/file/d/FILE_ID/...).'
          : 'Unrecognized input. Please provide a Google Drive file URL or raw file ID.'
      });
      return;
    }

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'localhost';
    const mp4Url = new URL(`${protocol}://${host}/mp4/${fileId}.mp4`);
    if (resourceKey) mp4Url.searchParams.set('rk', resourceKey);

    const downloadUrl = new URL(mp4Url.toString());
    downloadUrl.searchParams.set('download', '1');
    const movUrl = new URL(`${protocol}://${host}/mp4/${fileId}.mov`);
    if (resourceKey) movUrl.searchParams.set('rk', resourceKey);

    const downloadMovUrl = new URL(movUrl.toString());
    downloadMovUrl.searchParams.set('download', '1');

    res.status(200).json({
      fileId,
      resourceKey,
      mp4Url: mp4Url.toString(),
      movUrl: movUrl.toString(),
      downloadUrl: downloadUrl.toString(),
      downloadMovUrl: downloadMovUrl.toString()
    });
  } catch (error) {
    res.status(502).json({
      error: 'Unable to validate this Google Drive video link.',
      detail: error.message
    });
  }
};
