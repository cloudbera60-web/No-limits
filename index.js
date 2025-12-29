const express = require('express');
const path = require('path');
const app = express();
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 50900;
const { 
  qrRoute,
  pairRoute
} = require('./routes');
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
        activeBots: Object.keys(global.activeBots || {}).length
    });
});

// Endpoint to view active bots (admin)
app.get('/active-bots', (req, res) => {
    const activeBots = global.activeBots || {};
    const botsList = Object.keys(activeBots).map(id => ({
        sessionId: id,
        startedAt: activeBots[id].startedAt,
        user: activeBots[id].socket?.user?.id || 'Unknown'
    }));
    
    res.json({
        activeBots: botsList,
        count: botsList.length
    });
});

// Endpoint to stop a specific bot
app.get('/stop-bot/:id', (req, res) => {
    const { id } = req.params;
    const { stopBotInstance } = require('./bot-runner');
    
    if (stopBotInstance(id)) {
        res.json({ success: true, message: `Bot ${id} stopped` });
    } else {
        res.status(404).json({ success: false, message: `Bot ${id} not found` });
    }
});

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║   Gifted-MD Bot Runner Started!      ║
╠══════════════════════════════════════╣
║  Port: ${PORT}                         ║
║  URL: http://localhost:${PORT}          ║
║                                      ║
║  Endpoints:                          ║
║  • /          - Home page            ║
║  • /pair      - Pair code page       ║
║  • /qr        - QR code page         ║
║  • /health    - Health check         ║
║  • /active-bots - View active bots   ║
╚══════════════════════════════════════╝
`);
    console.log('✅ Server is ready! Bots will start automatically after pairing.');
});

// Initialize global bot storage
global.activeBots = {};

module.exports = app;
