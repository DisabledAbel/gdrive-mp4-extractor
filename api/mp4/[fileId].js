const { Readable } = require('stream');
const { extractFileId, fetchDriveStream, sanitizeFileName } = require('../../lib/drive');

function sendJsonError(res, statusCode, error, code) {
  if (res.headersSent) {
    res.end();
    return;
  }

  res.status(statusCode).json({ error, code });
}

module.exports = async function handler(req, res) {
  try {
    const rawId = req.query.fileId || req.query.id || req.query.url;
    const fileId = extractFileId(rawId);

    if (!fileId) {
      sendJsonError(res, 400, 'Missing or invalid Google Drive file ID.', 'INVALID_INPUT');
      return;
    }

    const driveResponse = await fetchDriveStream(fileId);
    const upstreamContentType = driveResponse.headers.get('content-type') || 'video/mp4';
    const upstreamLength = driveResponse.headers.get('content-length');
    const upstreamDisposition = driveResponse.headers.get('content-disposition') || '';
    const matchedName = upstreamDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const fileName = sanitizeFileName(decodeURIComponent(matchedName?.[1] || matchedName?.[2] || fileId));

    res.statusCode = 200;
    res.setHeader('Content-Type', upstreamContentType.includes('video') ? upstreamContentType : 'video/mp4');
    if (upstreamLength) res.setHeader('Content-Length', upstreamLength);
    res.setHeader('Content-Disposition', `inline; filename="${fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`}"`);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    const stream = Readable.fromWeb(driveResponse.body);
    stream.on('error', () => {
      if (!res.headersSent) {
        sendJsonError(res, 502, 'Stream failed while proxying video.', 'STREAM_PIPE_ERROR');
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (error) {
    sendJsonError(
      res,
      error.statusCode || 502,
      error.message || 'Could not fetch video from Google Drive.',
      error.code || 'MP4_PROXY_ERROR'
    );
  }
};
