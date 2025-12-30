const express = require('express');
const path = require('path');
const app = express();
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 50900;
const { 
  qrRoute,
  pairRoute
} = require('./routes');
const { initializeBotSystem } = require('./bot-runner');

require('events').EventEmitter.defaultMaxListeners = 2000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/qr', qrRoute);
app.use('/code', pairRoute);

app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({
        status: 200,
        success: true,
        service: 'Gifted-Md Bot Runner',
        timestamp: new Date().toISOString(),
        activeBots: Object.keys(global.activeBots || {}).length,
        mongoConnected: require('./database').isConnected,
        pluginsLoaded: require('./plugin-loader').plugins.size
    });
});

// Initialize bot system
initializeBotSystem().then(success => {
  if (success) {
    app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════╗
║   Gifted-MD Bot Runner Started!      ║
╠══════════════════════════════════════╣
║  MongoDB: ${require('./database').isConnected ? '✅ Connected' : '❌ Disconnected'}
║  Plugins: ${require('./plugin-loader').plugins.size} loaded
║  Port: ${PORT}
║  URL: http://localhost:${PORT}
╚══════════════════════════════════════╝
`);
    });
  } else {
    console.error('❌ Failed to initialize bot system');
    process.exit(1);
  }
});

module.exports = app;
