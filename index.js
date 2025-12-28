const express = require('express');
const bodyParser = require("body-parser");

const app = express();
__path = process.cwd();

const PORT = process.env.PORT || 8000;
const code = require('./pair');

require('events').EventEmitter.defaultMaxListeners = 500;

// ✅ middleware FIRST
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ✅ routes
app.use('/code', code);

app.get('/pair', (req, res) => {
    res.sendFile(__path + '/pair.html');
});

app.get('/', (req, res) => {
    res.sendFile(__path + '/main.html');
});

// ✅ listen
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
Don't Forget To Give Star ‼️
𝐏𝙾𝚆𝙴𝚁𝙴𝙳 𝐁𝚈 HASHAN-𝐌𝙳
Server running on http://0.0.0.0:${PORT}
`);
});

module.exports = app;
