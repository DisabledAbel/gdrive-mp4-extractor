const path = require('path');
const express = require('express');
const resolveHandler = require('./api/resolve');
const mp4Handler = require('./api/mp4/[fileId]');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/resolve', (req, res) => {
  resolveHandler(req, res);
});

app.get('/api/mp4/:fileId', (req, res) => {
  req.query = { ...req.query, fileId: req.params.fileId };
  mp4Handler(req, res);
});

app.get('/mp4/:fileId.mp4', (req, res) => {
  req.query = { ...req.query, fileId: req.params.fileId };
  mp4Handler(req, res);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`gdrive-mp4-extractor running at http://localhost:${port}`);
});
