const express = require('express');
const path = require('path');
const app = express();
__path = process.cwd()
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 50900;
const { 
  qrRoute,
  pairRoute
} = require('./routes');
const { startBotInstance } = require('./bot-runner/index.js');
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
    res.json({
        activeBots: global.activeBots || {},
        count: Object.keys(global.activeBots || {}).length
    });
});

app.listen(PORT, () => {
    console.log(`
Bot Runner Server Started!

 Gifted-MD Bot Runner Running on http://localhost:` + PORT);
    console.log('Active bots will start automatically after pairing');
});

// Initialize global bot storage
global.activeBots = {};

module.exports = app;
