import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import {
  makeWASocket,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  getContentType,
  Browsers,
  delay,
  proto,
  prepareWAMessageMedia,
  downloadContentFromMessage,
  generateWAMessageFromContent
} from '@whiskeysockets/baileys';

import { Handler, Callupdate, GroupUpdate } from './data/index.js';
import config from './config.cjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const sessionDir = path.join(__dirname, 'session');
const prefix = process.env.PREFIX || config.PREFIX;
const orange = chalk.bold.hex("#FFA500");
const lime = chalk.bold.hex("#32CD32");
let useQR = false;
let initialConnection = true;

const MAIN_LOGGER = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
});
const logger = MAIN_LOGGER.child({});
logger.level = "trace";

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

let sock = null;
let pairingCode = null;
let isRegistered = false;

async function initializeWhatsApp() {
    try {
        console.log('🔄 Initializing WhatsApp connection...');
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        
        isRegistered = state.creds.registered;
        
        const { version } = await fetchLatestBaileysVersion();
        console.log(`🤖 Using WA v${version.join('.')}`);
        
        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: useQR,
            browser: Browsers.macOS('Safari'),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 2000,
            maxRetries: 5,
            syncFullHistory: false,
            generateHighQualityLinkPreview: false
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('QR Code received');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                if (shouldReconnect) {
                    console.log('🔄 Connection closed, reconnecting...');
                    setTimeout(async () => {
                        await initializeWhatsApp();
                    }, 5000);
                } else {
                    console.log('❌ Session logged out, clearing...');
                    if (fs.existsSync(sessionDir)) {
                        fs.rmSync(sessionDir, { recursive: true });
                        fs.mkdirSync(sessionDir, { recursive: true });
                    }
                    sock = null;
                    isRegistered = false;
                }
            } else if (connection === 'open') {
                console.log('✅ Connection open');
                
                if (initialConnection) {
                    console.log(chalk.green("Connected Successfully! 🤍"));
                    
                    if (sock.user?.id) {
                        sock.sendMessage(sock.user.id, { 
                            image: { url: "https://files.catbox.moe/pf270b.jpg" }, 
                            caption: `*Hello there User! 👋🏻* 

> Simple, Straightforward, But Loaded With Features 🎊. Meet WhatsApp Bot.

*Thanks for using 🚩* 

> Join WhatsApp Channel: ⤵️  
https://whatsapp.com/channel/0029VajJoCoLI8YePbpsnE3q

- *YOUR PREFIX:* = ${prefix}

Don't forget to give a star to the repo ⬇️  
https://github.com/DEVELOPER-BERA/CLOUD-AI

> © REGARDS`
                        });
                    }
                    initialConnection = false;
                } else {
                    console.log(chalk.blue("♻️ Connection reestablished after restart."));
                }
            }

            if (!isRegistered && sock && connection === 'connecting') {
                try {
                    await delay(1500);
                    const pair = "MARISELA";
                    pairingCode = await sock.requestPairingCode(pair);
                    console.log(`📱 Generated pairing code: ${pairingCode}`);
                } catch (error) {
                    console.error('❌ Failed to generate pairing code:', error);
                }
            }
        });

        sock.ev.on("messages.upsert", async chatUpdate => {
            try {
                await Handler(chatUpdate, sock, logger);
                
                const mek = chatUpdate.messages[0];
                if (!mek?.key?.fromMe && config.AUTO_REACT) {
                    if (mek.message) {
                        const { emojis, doReact } = await import('./lib/autoreact.cjs');
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await doReact(randomEmoji, mek, sock);
                    }
                }
                
                if (mek.key && mek.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_SEEN) {
                    await sock.readMessages([mek.key]);
                    
                    if (config.AUTO_STATUS_REPLY) {
                        const fromJid = mek.key.participant || mek.key.remoteJid;
                        const customMessage = config.STATUS_READ_MSG || '✅ Auto Status Seen';
                        await sock.sendMessage(fromJid, { text: customMessage }, { quoted: mek });
                    }
                }
            } catch (err) {
                console.error('Error in messages.upsert handler:', err);
            }
        });

        sock.ev.on("call", async (json) => await Callupdate(json, sock));

        sock.ev.on("group-participants.update", async (messag) => await GroupUpdate(sock, messag));

        if (config.MODE === "public") {
            sock.public = true;
        } else if (config.MODE === "private") {
            sock.public = false;
        }

        return sock;
    } catch (error) {
        console.error('❌ Failed to initialize WhatsApp:', error);
        throw error;
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});

app.get('/pair', (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});

app.get('/api/pairing-code', (req, res) => {
    if (pairingCode) {
        res.json({ code: pairingCode });
    } else {
        res.status(404).json({ error: 'No pairing code available. Try connecting first.' });
    }
});

app.get('/api/status', (req, res) => {
    const status = {
        connected: !!sock && sock.user?.id,
        registered: isRegistered,
        pairingCode: pairingCode,
        userId: sock?.user?.id
    };
    res.json(status);
});

app.post('/api/connect', async (req, res) => {
    try {
        await initializeWhatsApp();
        res.json({ success: true, message: 'Connection initialized. Check for pairing code.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

async function start() {
    try {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });

        await initializeWhatsApp();
        
    } catch (error) {
        console.error('❌ Failed to start:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (sock) {
        sock.end();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    if (sock) {
        sock.end();
    }
    process.exit(0);
});

start();
