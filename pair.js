import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import chalk from 'chalk';
import dotenv from 'dotenv';
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  getContentType,
  Browsers,
  delay,
  jidNormalizedUser,
  proto,
  prepareWAMessageMedia,
  downloadContentFromMessage,
  generateWAMessageFromContent
} from '@whiskeysockets/baileys';
import { Handler, Callupdate, GroupUpdate } from './data/index.js';
import config from './config.cjs';
import pkg from './lib/autoreact.cjs';
const { emojis, doReact } = pkg;
const prefix = process.env.PREFIX || config.PREFIX;
const sessionName = "session";
const orange = chalk.bold.hex("#FFA500");
const lime = chalk.bold.hex("#32CD32");
let useQR = false;
let initialConnection = true;
const PORT = process.env.PORT || 3000;

const MAIN_LOGGER = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
});
const logger = MAIN_LOGGER.child({});
logger.level = "trace";

const msgRetryCounterCache = new Map();

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const sessionDir = path.join(__dirname, 'session');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

// Session Management Maps (from pair.js)
const activeSockets = new Map();
const socketCreationTime = new Map();
const disconnectionTime = new Map();
const sessionHealth = new Map();
const reconnectionAttempts = new Map();
const lastBackupTime = new Map();
const otpStore = new Map();
const pendingSaves = new Map();
const restoringNumbers = new Set();
const sessionConnectionStatus = new Map();
const stores = new Map();
const followedNewsletters = new Map();

// Configuration (from pair.js)
const botConfig = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💗', '🩵', '🥺', '🫶', '😶'],
    AUTO_REACT_NEWSLETTERS: 'true',
    NEWSLETTER_JIDS: ['120363299029326322@newsletter','120363401297349965@newsletter','120363339980514201@newsletter','120363420947784745@newsletter','120363296314610373@newsletter'],
    NEWSLETTER_REACT_EMOJIS: ['🐥', '🤭', '♥️', '🙂', '☺️', '🩵', '🫶'],
    PREFIX: prefix,
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/JXaWiMrpjWyJ6Kd2G9FAAq?mode=ems_copy_t',
    NEWSLETTER_JID: '120363299029326322@newsletter',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb6V5Xl6LwHgkapiAI0V',
    IMAGE_PATH: 'https://i.ibb.co/zhm2RF8j/vision-v.jpg',
    OWNER_NUMBER: '254740007567',
    TRANSFER_OWNER_NUMBER: '254740007567',
    NEWS_JSON_URL: 'https://raw.githubusercontent.com/boychalana9-max/mage/refs/heads/main/main.json?token=GHSAT0AAAAAADJU6UDFFZ67CUOLUQAAWL322F3RI2Q'
};

// Helper functions from pair.js
function isSocketReady(socket) {
    if (!socket) return false;
    return socket.ws && socket.ws.readyState === socket.ws.OPEN;
}

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function getSriLankaTimestamp() {
    const moment = require('moment-timezone');
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

async function updateAboutStatus(socket) {
    const aboutStatus = 'mᥱrᥴᥱძᥱs ᥲᥴ𝗍і᥎ᥱ:- https://up-tlm1.onrender.com/';
    try {
        if (isSocketReady(socket)) {
            await socket.updateProfileStatus(aboutStatus);
            console.log(`✅ Auto-updated About status`);
        } else {
            console.log('⏭️ Skipping About status update - socket not ready');
        }
    } catch (error) {
        console.error('❌ Failed to update About status:', error);
    }
}

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

        try {
            if (botConfig.AUTO_RECORDING === 'true' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            if (botConfig.AUTO_VIEW_STATUS === 'true') {
                let retries = botConfig.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        console.log('Auto-viewed status');
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) throw error;
                        await delay(1000 * (botConfig.MAX_RETRIES - retries));
                    }
                }
            }

            if (botConfig.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = botConfig.AUTO_LIKE_EMOJI[Math.floor(Math.random() * botConfig.AUTO_LIKE_EMOJI.length)];
                let retries = botConfig.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } },
                            { statusJidList: [message.key.participant] }
                        );
                        console.log(`Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (botConfig.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}

function setupNewsletterHandlers(socket, number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        const isNewsletter = botConfig.NEWSLETTER_JIDS.some(jid =>
            message.key.remoteJid === jid ||
            message.key.remoteJid?.includes(jid)
        );

        if (!isNewsletter || botConfig.AUTO_REACT_NEWSLETTERS !== 'true') return;

        try {
            if (!isSocketReady(socket)) {
                console.log('⏭️ Skipping newsletter reaction - socket not ready');
                return;
            }

            const messageId = message.newsletterServerId || 
                             message.key.id || 
                             message.message?.extendedTextMessage?.contextInfo?.stanzaId ||
                             message.message?.conversation?.contextInfo?.stanzaId;

            if (!messageId) {
                console.warn('⚠️ No valid message ID found for newsletter:', message.key.remoteJid);
                return;
            }

            const randomEmoji = botConfig.NEWSLETTER_REACT_EMOJIS[
                Math.floor(Math.random() * botConfig.NEWSLETTER_REACT_EMOJIS.length)
            ];

            console.log(`🔄 Attempting to react to newsletter message: ${messageId}`);

            let retries = botConfig.MAX_RETRIES;
            while (retries > 0) {
                try {
                    if (!isSocketReady(socket)) {
                        console.log('⏭️ Socket not ready, skipping reaction attempt');
                        break;
                    }

                    if (socket.newsletterReactMessage) {
                        await socket.newsletterReactMessage(
                            message.key.remoteJid,
                            messageId.toString(),
                            randomEmoji
                        );
                        console.log(`✅ Auto-reacted to newsletter ${message.key.remoteJid} with ${randomEmoji}`);
                        break;
                    } else if (socket.sendMessage) {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { 
                                react: { 
                                    text: randomEmoji, 
                                    key: message.key 
                                } 
                            }
                        );
                        console.log(`✅ Fallback reaction sent to newsletter ${message.key.remoteJid} with ${randomEmoji}`);
                        break;
                    } else {
                        console.warn('⚠️ No reaction method available for newsletter');
                        break;
                    }
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Newsletter reaction attempt failed, retries left: ${retries}`, error.message);
                    
                    if (retries === 0) {
                        console.error(`❌ Failed to react to newsletter ${message.key.remoteJid}:`, error.message);
                    } else {
                        await delay(2000 * (botConfig.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error('❌ Newsletter reaction error:', error);
        }
    });
}

function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        sessionConnectionStatus.set(sanitizedNumber, connection);

        if (qr) {
            console.log('QR Code received for:', sanitizedNumber);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message || '';
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            disconnectionTime.set(sanitizedNumber, Date.now());
            sessionHealth.set(sanitizedNumber, 'disconnected');
            sessionConnectionStatus.set(sanitizedNumber, 'closed');

            if (statusCode === DisconnectReason.loggedOut || 
                statusCode === DisconnectReason.badSession ||
                errorMessage.includes('Bad MAC') || 
                errorMessage.includes('bad-mac') || 
                errorMessage.includes('decrypt')) {

                console.log(`❌ Bad MAC/Invalid session detected for ${number}, cleaning up...`);
                sessionHealth.set(sanitizedNumber, 'invalid');
                
                setTimeout(async () => {
                    console.log(`🗑️ Cleaning invalid session: ${sanitizedNumber}`);
                    if (activeSockets.has(sanitizedNumber)) {
                        const sock = activeSockets.get(sanitizedNumber);
                        try {
                            if (sock?.ws) {
                                sock.ws.close();
                            } else if (sock?.end) {
                                sock.end();
                            } else if (sock?.logout) {
                                await sock.logout();
                            }
                        } catch (e) {
                            console.error('Error closing socket:', e.message);
                        }
                        activeSockets.delete(sanitizedNumber);
                    }
                }, 60000);
            } else if (shouldReconnect) {
                console.log(`🔄 Connection closed for ${number}, attempting reconnect...`);
                sessionHealth.set(sanitizedNumber, 'reconnecting');

                const attempts = reconnectionAttempts.get(sanitizedNumber) || 0;
                if (attempts < 3) {
                    await delay(10000);
                    activeSockets.delete(sanitizedNumber);
                    stores.delete(sanitizedNumber);

                    start();
                } else {
                    console.log(`❌ Max reconnection attempts reached for ${number}`);
                }
            } else {
                console.log(`❌ Session logged out for ${number}`);
            }
        } else if (connection === 'open') {
            console.log(`✅ Connection open: ${number}`);
            sessionHealth.set(sanitizedNumber, 'active');
            sessionConnectionStatus.set(sanitizedNumber, 'open');
            reconnectionAttempts.delete(sanitizedNumber);
            disconnectionTime.delete(sanitizedNumber);
        } else if (connection === 'connecting') {
            sessionHealth.set(sanitizedNumber, 'connecting');
            sessionConnectionStatus.set(sanitizedNumber, 'connecting');
        }
    });
}

async function setupMessageHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        sessionHealth.set(sanitizedNumber, 'active');

        if (botConfig.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
            } catch (error) {
                console.error('❌ Failed to set recording presence:', error);
            }
        }
    });
}

async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;

        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const deletionTime = getSriLankaTimestamp();

        const message = formatMessage(
            'ᴀᴜᴛᴏ ᴍᴇssᴀɢᴇ ᴅᴇʟᴇᴛᴇ ᴅᴇᴛᴇᴄᴛᴇᴅ',
            `ᴍᴇssᴀɢᴇ ᴅᴇᴛᴇᴄᴛᴇᴅ \n📋 ғʀᴏᴍ: ${messageKey.remoteJid}\n🍁 ᴅᴇᴛᴇᴄᴛɪᴏɴ ᴛɪᴍᴇ: ${deletionTime}`,
            'ᴍᴇʀᴄᴇᴅᴇs ᴍɪɴɪ'
        );

        try {
            await socket.sendMessage(userJid, {
                image: { url: botConfig.IMAGE_PATH },
                caption: message
            });
            console.log(`🗑️ Auto-notified deletion for ${number}`);
        } catch (error) {
            console.error('❌ Failed to send deletion notification:', error);
        }
    });
}

async function start() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`🤖 JAWAD-MD using WA v${version.join('.')}, isLatest: ${isLatest}`);
        
        // Check if session needs pairing
        if (!state.creds.registered) {
            console.log("🔐 Session not registered, preparing for pairing...");
            useQR = true;
        } else {
            console.log("🔒 Session found, proceeding without QR code.");
        }
        
        const store = {
            bind: () => {},
            loadMessage: async () => undefined,
            saveMessage: () => {},
            messages: {}
        };
        
        const Matrix = makeWASocket({
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
            generateHighQualityLinkPreview: false,
            getMessage: async (key) => {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || undefined;
                }
                return undefined;
            }
        });

        // Bind store
        store?.bind(Matrix.ev);

        // Setup all handlers from pair.js
        setupStatusHandlers(Matrix);
        setupMessageHandlers(Matrix, 'default');
        setupAutoRestart(Matrix, 'default');
        setupNewsletterHandlers(Matrix, 'default');
        handleMessageRevocation(Matrix, 'default');

        // Setup handlers from index.js
        Matrix.ev.on("messages.upsert", async chatUpdate => await Handler(chatUpdate, Matrix, logger));
        Matrix.ev.on("call", async (json) => await Callupdate(json, Matrix));
        Matrix.ev.on("group-participants.update", async (messag) => await GroupUpdate(Matrix, messag));

        if (config.MODE === "public") {
            Matrix.public = true;
        } else if (config.MODE === "private") {
            Matrix.public = false;
        }

        // Auto-react from index.js
        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.key.fromMe && config.AUTO_REACT) {
                    if (mek.message) {
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await doReact(randomEmoji, mek, Matrix);
                    }
                }
            } catch (err) {
                console.error('Error during auto reaction:', err);
            }
        });
        
        // Auto-status seen from index.js
        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                const fromJid = mek.key.participant || mek.key.remoteJid;
                if (!mek || !mek.message) return;
                if (mek.key.fromMe) return;
                if (mek.message?.protocolMessage || mek.message?.ephemeralMessage || mek.message?.reactionMessage) return; 
                if (mek.key && mek.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_SEEN) {
                    await Matrix.readMessages([mek.key]);
                    
                    if (config.AUTO_STATUS_REPLY) {
                        const customMessage = config.STATUS_READ_MSG || '✅ Auto Status Seen Bot By JAWAD-MD';
                        await Matrix.sendMessage(fromJid, { text: customMessage }, { quoted: mek });
                    }
                }
            } catch (err) {
                console.error('Error handling messages.upsert event:', err);
            }
        });

        Matrix.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    console.log("🔄 Reconnecting...");
                    setTimeout(start, 5000);
                }
            } else if (connection === 'open') {
                if (initialConnection) {
                    console.log(chalk.green("Connected Successfully cloud Ai 🤍"));
                    
                    // Send welcome message
                    Matrix.sendMessage(Matrix.user.id, { 
                        image: { url: "https://files.catbox.moe/pf270b.jpg" }, 
                        caption: `*Hello there User! 👋🏻* 

> Simple, Straightforward, But Loaded With Features 🎊. Meet CLOUD-AI WhatsApp Bot.

*Thanks for using CLOUD AI 🚩* 

> Join WhatsApp Channel: ⤵️  
https://whatsapp.com/channel/0029VajJoCoLI8YePbpsnE3q

- *YOUR PREFIX:* = ${prefix}

Don't forget to give a star to the repo ⬇️  
https://github.com/DEVELOPER-BERA/CLOUD-AI

> © REGARDS BERA`
                    });
                    
                    // Update about status
                    updateAboutStatus(Matrix);
                    
                    // Follow newsletters
                    const followed = new Set();
                    for (const newsletterJid of botConfig.NEWSLETTER_JIDS) {
                        try {
                            if (isSocketReady(Matrix) && !followed.has(newsletterJid)) {
                                if (Matrix.newsletterFollow) {
                                    await Matrix.newsletterFollow(newsletterJid);
                                    console.log(`✅ Auto-followed newsletter: ${newsletterJid}`);
                                    followed.add(newsletterJid);
                                }
                            }
                        } catch (error) {
                            console.error(`❌ Failed to follow newsletter ${newsletterJid}:`, error.message);
                        }
                    }
                    
                    initialConnection = false;
                } else {
                    console.log(chalk.blue("♻️ Connection reestablished after restart."));
                }
            }
        });
        
        Matrix.ev.on('creds.update', saveCreds);

        // Handle pairing if needed
        if (!state.creds.registered && useQR) {
            console.log("📱 Generating pairing code...");
            try {
                const pair = "MARISELA";
                const code = await Matrix.requestPairingCode("bot", pair);
                console.log(`📱 Generated pairing code: ${code}`);
                
                // Store in active sockets for API access
                activeSockets.set('pairing', Matrix);
                socketCreationTime.set('pairing', Date.now());
            } catch (error) {
                console.error('❌ Failed to generate pairing code:', error);
            }
        } else {
            // Store active socket
            const number = Matrix.user?.id?.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '') || 'default';
            activeSockets.set(number, Matrix);
            socketCreationTime.set(number, Date.now());
            sessionHealth.set(number, 'active');
            sessionConnectionStatus.set(number, 'open');
        }

    } catch (error) {
        console.error('Critical Error:', error);
        setTimeout(start, 10000);
    }
}

// Express Server Setup
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes from pair.js
app.get('/pair', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    if (activeSockets.has(sanitizedNumber)) {
        const isActive = sessionHealth.get(sanitizedNumber) === 'active';
        return res.status(200).send({
            status: isActive ? 'already_connected' : 'reconnecting',
            message: isActive ? 'This number is already connected and active' : 'Session is reconnecting',
            health: sessionHealth.get(sanitizedNumber) || 'unknown',
            connectionStatus: sessionConnectionStatus.get(sanitizedNumber) || 'unknown'
        });
    }

    try {
        const { state } = await useMultiFileAuthState(sessionDir);
        if (!state.creds.registered) {
            const pair = "MARISELA";
            const code = await activeSockets.get('pairing')?.requestPairingCode(sanitizedNumber, pair);
            if (code) {
                return res.send({ code });
            }
        }
        res.status(400).send({ error: 'Pairing not available' });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

app.get('/active', (req, res) => {
    const activeNumbers = [];
    const healthData = {};

    for (const [number, socket] of activeSockets) {
        if (sessionHealth.get(number) === 'active') {
            activeNumbers.push(number);
            healthData[number] = {
                health: sessionHealth.get(number) || 'unknown',
                connectionStatus: sessionConnectionStatus.get(number) || 'unknown',
                uptime: socketCreationTime.get(number) ? Date.now() - socketCreationTime.get(number) : 0,
                isActive: true
            };
        }
    }

    res.status(200).send({
        count: activeNumbers.length,
        numbers: activeNumbers,
        health: healthData
    });
});

app.get('/ping', (req, res) => {
    const activeCount = Array.from(activeSockets.keys()).filter(num => sessionHealth.get(num) === 'active').length;

    res.status(200).send({
        status: 'active',
        message: 'AUTO SESSION MANAGER is running',
        activeSessions: activeCount,
        totalSockets: activeSockets.size
    });
});

app.delete('/session/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (activeSockets.has(sanitizedNumber)) {
            const socket = activeSockets.get(sanitizedNumber);
            if (socket?.ws) {
                socket.ws.close();
            }
            activeSockets.delete(sanitizedNumber);
        }

        res.status(200).send({
            status: 'success',
            message: `Session ${sanitizedNumber} deleted successfully`
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Failed to delete session',
            error: error.message
        });
    }
});

// Root route from index.js
app.get('/', (req, res) => {
    res.send('Hello World!');
});

// Start server and bot
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    start();
});
