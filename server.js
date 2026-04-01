const path = require('path');
const express = require('express');
const resolveHandler = require('./api/resolve');
const mp4Handler = require('./api/mp4/[fileId]');

const app = express();
const port = process.env.PORT || 3000;

const publicDir = path.join(__dirname, 'public');

app.use(express.json());
app.use(express.static(publicDir));

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res)).catch(next);
};

app.get('/api/resolve', asyncRoute(resolveHandler));

app.get('/api/mp4/:fileId', asyncRoute((req, res) => {
  req.query = { ...req.query, fileId: req.params.fileId };
  return mp4Handler(req, res);
}));

app.get('/mp4/:fileId.mp4', asyncRoute((req, res) => {
  req.query = { ...req.query, fileId: req.params.fileId };
  return mp4Handler(req, res);
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);

  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(500).json({
    error: 'Internal server error',
    code: 'SERVER_UNHANDLED_ERROR'
  });
});

app.listen(port, () => {
  console.log(`gdrive-mp4-extractor running at http://localhost:${port}`);
});
