const { Readable } = require('stream');
const { extractDriveParams, sanitizeFileName, fetchDriveStream } = require('../../lib/drive');

module.exports = async function handler(req, res) {
  try {
    const rawId = req.query.fileId || req.query.id || req.query.url;
    const { fileId, resourceKey: parsedResourceKey } = extractDriveParams(rawId);
    const resourceKey = req.query.rk || req.query.resourcekey || parsedResourceKey || null;

    if (!fileId) {
      res.status(400).json({ error: 'Missing or invalid Google Drive file ID.' });
      return;
    }

    const upstreamHeaders = {};
    if (req.headers.range) upstreamHeaders.range = req.headers.range;
    if (req.headers['if-range']) upstreamHeaders['if-range'] = req.headers['if-range'];
    if (req.headers['if-none-match']) upstreamHeaders['if-none-match'] = req.headers['if-none-match'];
    if (req.headers['if-modified-since']) upstreamHeaders['if-modified-since'] = req.headers['if-modified-since'];

    const driveResponse = await fetchDriveStream(fileId, {
      resourceKey,
      headers: upstreamHeaders
    });
    const ext = String(req.query.ext || (String(rawId).toLowerCase().endsWith('.mov') ? 'mov' : 'mp4')).toLowerCase() === 'mov' ? 'mov' : 'mp4';
    const forceDownload = String(req.query.download || req.query.dl || '').toLowerCase() === '1'
      || String(req.query.download || req.query.dl || '').toLowerCase() === 'true';
    const upstreamContentType = driveResponse.headers.get('content-type') || 'video/mp4';
    const upstreamLength = driveResponse.headers.get('content-length');
    const upstreamDisposition = driveResponse.headers.get('content-disposition') || '';
    const upstreamAcceptRanges = driveResponse.headers.get('accept-ranges');
    const upstreamContentRange = driveResponse.headers.get('content-range');
    const upstreamEtag = driveResponse.headers.get('etag');
    const upstreamLastModified = driveResponse.headers.get('last-modified');
    const matchedName = upstreamDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const fileName = sanitizeFileName(decodeURIComponent(matchedName?.[1] || matchedName?.[2] || fileId));

    res.statusCode = driveResponse.status;
    const fallbackType = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
    res.setHeader('Content-Type', upstreamContentType.includes('video') ? upstreamContentType : fallbackType);
    if (upstreamLength) res.setHeader('Content-Length', upstreamLength);
    if (upstreamAcceptRanges) res.setHeader('Accept-Ranges', upstreamAcceptRanges);
    if (upstreamContentRange) res.setHeader('Content-Range', upstreamContentRange);
    if (upstreamEtag) res.setHeader('ETag', upstreamEtag);
    if (upstreamLastModified) res.setHeader('Last-Modified', upstreamLastModified);
    const finalName = fileName.endsWith(`.${ext}`) ? fileName : `${fileName.replace(/\.(mp4|mov)$/i, '')}.${ext}`;
    res.setHeader('Content-Disposition', `${forceDownload ? 'attachment' : 'inline'}; filename="${finalName}"`);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    Readable.fromWeb(driveResponse.body).pipe(res);
  } catch (error) {
    res.status(502).json({
      error: 'Could not fetch video from Google Drive.',
      detail: error.message
    });
  }
};
