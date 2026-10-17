// Vercel catch-all serverless function: every request under /api/*
// is routed here (filename is a catch-all because of vercel.json),
// and the Express app inside matches the full original path.
const app = require('./app');

module.exports = (req, res) => app(req, res);
