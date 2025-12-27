import dotenv from 'dotenv';
dotenv.config();

import {
    makeWASocket,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason,
    useMultiFileAuthState,
    getContentType,
    makeCacheableSignalKeyStore,
    jidNormalizedUser
} from '@whiskeysockets/baileys';
import { Handler, Callupdate, GroupUpdate } from './data/index.js';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import moment from 'moment-timezone';
import axios from 'axios';
import config from './config.cjs';
import pkg from './lib/autoreact.cjs';

const { emojis, doReact } = pkg;
const prefix = process.env.PREFIX || config.PREFIX;
const sessionName = "session";
const app = express();
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

const msgRetryCounterCache = new NodeCache();

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const sessionDir = path.join(__dirname, 'session');

// Session management variables (from pair.js)
const activeSockets = new Map();
const sessionConnectionStatus = new Map();
const sessionHealth = new Map();
const disconnectionTime = new Map();
const reconnectionAttempts = new Map();

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

// Helper functions from pair.js
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isSessionActive(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const health = sessionHealth.get(sanitizedNumber);
    const connectionStatus = sessionConnectionStatus.get(sanitizedNumber);
    const socket = activeSockets.get(sanitizedNumber);

    return (
        connectionStatus === 'open' &&
        health === 'active' &&
        socket &&
        socket.user &&
        !disconnectionTime.has(sanitizedNumber)
    );
}

async function updateAboutStatus(socket) {
    const aboutStatus = 'mᥱrᥴᥱძᥱs ᥲᥴ𝗍і᥎ᥱ:- https://up-tlm1.onrender.com/';
    try {
        if (socket?.ws?.readyState === socket?.ws?.OPEN) {
            await socket.updateProfileStatus(aboutStatus);
            console.log(`✅ Auto-updated About status`);
        } else {
            console.log('⏭️ Skipping About status update - socket not ready');
        }
    } catch (error) {
        console.error('❌ Failed to update About status:', error);
    }
}

async function updateSessionStatus(number, status, timestamp) {
    try {
        const sessionStatusPath = './session_status.json';
        let sessionStatus = {};
        
        if (fs.existsSync(sessionStatusPath)) {
            sessionStatus = JSON.parse(fs.readFileSync(sessionStatusPath, 'utf8'));
        }
        
        sessionStatus[number] = {
            status,
            timestamp
        };
        
        fs.writeFileSync(sessionStatusPath, JSON.stringify(sessionStatus, null, 2));
    } catch (error) {
        console.error('❌ Failed to update session status:', error);
    }
}

async function handleBadMacError(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    console.log(`🔧 Handling Bad MAC error for ${sanitizedNumber}`);

    try {
        // Close existing socket if any
        if (activeSockets.has(sanitizedNumber)) {
            const socket = activeSockets.get(sanitizedNumber);
            try {
                if (socket?.ws) {
                    socket.ws.close();
                }
            } catch (e) {
                console.error('Error closing socket:', e.message);
            }
            activeSockets.delete(sanitizedNumber);
        }

        // Clear session directory
        const sessionPath = path.join(sessionDir, `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) {
            console.log(`🗑️ Removing corrupted session files for ${sanitizedNumber}`);
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }

        // Clear all references
        sessionHealth.set(sanitizedNumber, 'bad_mac_cleared');
        reconnectionAttempts.delete(sanitizedNumber);
        disconnectionTime.delete(sanitizedNumber);
        sessionConnectionStatus.delete(sanitizedNumber);

        await updateSessionStatus(sanitizedNumber, 'bad_mac_cleared', new Date().toISOString());

        console.log(`✅ Cleared Bad MAC session for ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to handle Bad MAC for ${sanitizedNumber}:`, error);
        return false;
    }
}

// Create a simple in-memory store (workaround from pair.js)
function createSimpleStore() {
    return {
        bind: () => {},
        loadMessage: async () => undefined,
        saveMessage: () => {},
        messages: {},
        readMessages: () => {},
        clearMessages: () => {}
    };
}

// Main connection function adapted from pair.js
async function createWhatsAppConnection() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

        // Create simple store
        const store = createSimpleStore();

        const socket = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false, // We'll use pairing code instead
            browser: Browsers.macOS('Safari'),
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

        // Store bind
        store?.bind(socket.ev);

        // Add error handler for Bad MAC
        socket.ev.on('error', async (error) => {
            console.error(`❌ Socket error:`, error);

            if (error.message?.includes('Bad MAC') || 
                error.message?.includes('bad-mac') || 
                error.message?.includes('decrypt')) {
                console.log(`🔧 Bad MAC detected, cleaning up session...`);
                await handleBadMacError('bot');
            }
        });

        // Pairing logic
        if (!socket.authState.creds.registered) {
            console.log('📱 Generating pairing code...');
            let retries = 3;
            let code;

            while (retries > 0) {
                try {
                    await delay(1500);
                    const pair = "MARISELA";
                    code = await socket.requestPairingCode("bot", pair);
                    console.log(`📱 Generated pairing code: ${code}`);
                    console.log(`🔗 Please pair your device using this code: ${code}`);
                    console.log(`📋 Instructions: Open WhatsApp > Settings > Linked Devices > Link a Device`);
                    console.log(`📋 Enter this code when prompted: ${code}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Pairing code generation failed, retries: ${retries}`, error.message);

                    // Check for Bad MAC
                    if (error.message?.includes('MAC')) {
                        console.log('🔧 Session corruption detected, cleaning up...');
                        await handleBadMacError('bot');
                        await delay(5000);
                        // Restart connection
                        await start();
                        return;
                    }

                    if (retries === 0) {
                        console.error('❌ Failed to generate pairing code after all retries');
                        throw error;
                    }
                    await delay(2000 * (3 - retries));
                }
            }
        }

        // Connection update handler
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            sessionConnectionStatus.set('bot', connection);
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || '';
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                disconnectionTime.set('bot', Date.now());
                sessionHealth.set('bot', 'disconnected');

                if (statusCode === DisconnectReason.loggedOut || 
                    statusCode === DisconnectReason.badSession ||
                    errorMessage.includes('Bad MAC') || 
                    errorMessage.includes('bad-mac') || 
                    errorMessage.includes('decrypt')) {

                    console.log(`❌ Bad MAC/Invalid session detected, cleaning up...`);
                    sessionHealth.set('bot', 'invalid');
                    await updateSessionStatus('bot', 'invalid', new Date().toISOString());

                    setTimeout(async () => {
                        await handleBadMacError('bot');
                        console.log('🔄 Restarting connection after Bad MAC cleanup...');
                        await start();
                    }, 60000);
                } else if (shouldReconnect) {
                    console.log(`🔄 Connection closed, attempting reconnect...`);
                    sessionHealth.set('bot', 'reconnecting');
                    
                    const attempts = reconnectionAttempts.get('bot') || 0;
                    if (attempts < 3) {
                        reconnectionAttempts.set('bot', attempts + 1);
                        await delay(10000);
                        activeSockets.delete('bot');
                        await start();
                    } else {
                        console.log(`❌ Max reconnection attempts reached, restarting...`);
                        setTimeout(async () => {
                            await start();
                        }, 30000);
                    }
                } else {
                    console.log(`❌ Session logged out, need new pairing...`);
                    await start();
                }
            } else if (connection === 'open') {
                console.log(`✅ Connection open!`);
                sessionHealth.set('bot', 'active');
                sessionConnectionStatus.set('bot', 'open');
                reconnectionAttempts.delete('bot');
                disconnectionTime.delete('bot');
                
                activeSockets.set('bot', socket);
                
                await updateSessionStatus('bot', 'active', new Date().toISOString());
                
                // Update about status
                await updateAboutStatus(socket);
                
                if (initialConnection) {
                    console.log(chalk.green("Connected Successfully"));
                    try {
                        await socket.sendMessage(socket.user.id, {
                            image: { url: "https://files.catbox.moe/8h0cyi.jpg" },
                            caption: `╭─────────────━┈⊷
│ *CONNECTED SUCCESSFULLY *
╰─────────────━┈⊷

╭─────────────━┈⊷
│BOT NAME : Cloud Ai
│DEV : BRUCE BERA
╰─────────────━┈⊷`
                        });
                    } catch (error) {
                        console.error('Failed to send connection message:', error);
                    }
                    initialConnection = false;
                } else {
                    console.log(chalk.blue("♻️ Connection reestablished after restart."));
                }
            } else if (connection === 'connecting') {
                sessionHealth.set('bot', 'connecting');
                console.log('🔄 Connecting to WhatsApp...');
            }
        });

        // Credentials update handler
        socket.ev.on('creds.update', saveCreds);
        
        // Add all event handlers from original index.js
        socket.ev.on("messages.upsert", async chatUpdate => await Handler(chatUpdate, socket, logger));
        socket.ev.on("call", async (json) => await Callupdate(json, socket));
        socket.ev.on("group-participants.update", async (messag) => await GroupUpdate(socket, messag));

        // Mode configuration
        if (config.MODE === "public") {
            socket.public = true;
        } else if (config.MODE === "private") {
            socket.public = false;
        }

        // Auto Reaction to chats
        socket.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.key.fromMe && config.AUTO_REACT) {
                    if (mek.message) {
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await doReact(randomEmoji, mek, socket);
                    }
                }
            } catch (err) {
                console.error('Error during auto reaction:', err);
            }
        });

        // Auto Like Status
        socket.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek || !mek.message) return;

                const contentType = getContentType(mek.message);
                mek.message = (contentType === 'ephemeralMessage')
                    ? mek.message.ephemeralMessage.message
                    : mek.message;

                if (mek.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_REACT === "true") {
                    const jawadlike = await socket.decodeJid(socket.user.id);
                    const emojiList = ['🦖', '💸', '💨', '🦮', '🐕‍🦺', '💯', '🔥', '💫', '💎', '⚡', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '💻', '🤖', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🔔', '👌', '💥', '⛅', '🌟', '🗿', '🇵🇰', '💜', '💙', '🌝', '💚'];
                    const randomEmoji = emojiList[Math.floor(Math.random() * emojiList.length)];

                    await socket.sendMessage(mek.key.remoteJid, {
                        react: {
                            text: randomEmoji,
                            key: mek.key,
                        }
                    }, { statusJidList: [mek.key.participant, jawadlike] });

                    console.log(`Auto-reacted to a status with: ${randomEmoji}`);
                }
            } catch (err) {
                console.error("Auto Like Status Error:", err);
            }
        });

        return socket;

    } catch (error) {
        console.error('Critical Error:', error);
        
        // Check for Bad MAC error
        if (error.message?.includes('Bad MAC') || 
            error.message?.includes('bad-mac') || 
            error.message?.includes('decrypt')) {
            console.log('🔧 Bad MAC error detected, cleaning up and retrying...');
            await handleBadMacError('bot');
            await delay(5000);
            await start();
        } else {
            // Wait and retry for other errors
            console.log('🔄 Connection failed, retrying in 10 seconds...');
            await delay(10000);
            await start();
        }
    }
}

async function start() {
    console.log('🚀 Starting WhatsApp bot with pairing-based authentication...');
    console.log(`📁 Session directory: ${sessionDir}`);
    
    // Clean up old session if needed
    const oldSessionPath = path.join(sessionDir, 'session_bot');
    if (fs.existsSync(oldSessionPath)) {
        console.log('📁 Found existing session, checking if valid...');
    }
    
    try {
        await createWhatsAppConnection();
    } catch (error) {
        console.error('Failed to start:', error);
        process.exit(1);
    }
}

// Express server setup (unchanged)
app.get('index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp Bot</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .container { max-width: 800px; margin: 0 auto; }
                .status { padding: 20px; background: #f0f0f0; border-radius: 5px; }
                .connected { color: green; }
                .disconnected { color: red; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>WhatsApp Bot Status</h1>
                <div class="status">
                    <p>Bot is running with <strong>pairing-based authentication</strong></p>
                    <p>Check the console for pairing code if needed</p>
                    <p>Port: ${PORT}</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`🌐 Web interface: http://localhost:${PORT}`);
});

// Start the bot
start();

// Handle process signals for graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});
