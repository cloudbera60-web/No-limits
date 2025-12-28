import dotenv from 'dotenv';
dotenv.config();

import {
    makeWASocket,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

// Initialize Express app FIRST
const app = express();
const PORT = process.env.PORT || 3000;

// Other variables
let useQR = false;
let initialConnection = true;

const logger = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
});

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const sessionDir = path.join(__dirname, 'session');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

// Helper function from pair.js
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

// Bad MAC error handling from pair.js
async function handleBadMacError() {
    console.log(`🔧 Handling Bad MAC error for bot`);

    try {
        // Clear session directory
        const sessionPath = path.join(sessionDir);
        if (fs.existsSync(sessionPath)) {
            console.log(`🗑️ Removing corrupted session files`);
            fs.rmSync(sessionPath, { recursive: true, force: true });
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        console.log(`✅ Cleared Bad MAC session`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to handle Bad MAC:`, error);
        return false;
    }
}

// Simple configuration (temporarily replacing config.cjs)
const config = {
    MODE: process.env.MODE || "public",
    PREFIX: process.env.PREFIX || ".",
    AUTO_REACT: process.env.AUTO_REACT || false,
    AUTO_STATUS_REACT: process.env.AUTO_STATUS_REACT || "false"
};

// Main WhatsApp connection function (adapted from pair.js)
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
            printQRInTerminal: useQR,
            browser: ["JOEL-MD", "safari", "3.3"],
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
                return { conversation: "whatsapp user bot" };
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
                await handleBadMacError();
            }
        });

        // Pairing logic from pair.js
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
                    useQR = false; // We're using pairing code, not QR
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Pairing code generation failed, retries: ${retries}`, error.message);

                    // Check for Bad MAC
                    if (error.message?.includes('MAC')) {
                        console.log('🔧 Session corruption detected, cleaning up...');
                        await handleBadMacError();
                        await delay(5000);
                        // Restart connection
                        await start();
                        return;
                    }

                    if (retries === 0) {
                        console.error('❌ Failed to generate pairing code after all retries');
                        // Fall back to QR code
                        useQR = true;
                        console.log('🔄 Falling back to QR code authentication...');
                        break;
                    }
                    await delay(2000 * (3 - retries));
                }
            }
        }

        // Connection update handler (from original index.js)
        socket.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    console.log('🔄 Connection closed, attempting to restart...');
                    setTimeout(() => {
                        start();
                    }, 5000);
                } else {
                    console.log('❌ Logged out, session ended');
                    // Clear session and restart
                    try {
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                        fs.mkdirSync(sessionDir, { recursive: true });
                    } catch (error) {
                        console.error('Failed to clear session:', error);
                    }
                    
                    setTimeout(() => {
                        start();
                    }, 5000);
                }
            } else if (connection === 'open') {
                if (initialConnection) {
                    console.log(chalk.green("Connected Successfully"));
                    socket.sendMessage(socket.user.id, {
                        image: { url: "https://files.catbox.moe/8h0cyi.jpg" },
                        caption: `╭─────────────━┈⊷
│ *CONNECTED SUCCESSFULLY *
╰─────────────━┈⊷

╭─────────────━┈⊷
│BOT NAME : Cloud Ai
│DEV : BRUCE BERA
╰─────────────━┈⊷`
                    }).catch(err => console.error('Failed to send connection message:', err));
                    initialConnection = false;
                } else {
                    console.log(chalk.blue("♻️ Connection reestablished after restart."));
                }
            } else if (connection === 'connecting') {
                console.log('🔄 Connecting to WhatsApp...');
            }
        });

        // Credentials update handler
        socket.ev.on('creds.update', saveCreds);
        
        // Mode configuration
        if (config.MODE === "public") {
            socket.public = true;
        } else if (config.MODE === "private") {
            socket.public = false;
        }

        return socket;

    } catch (error) {
        console.error('Critical Error:', error);
        
        // Check for Bad MAC error
        if (error.message?.includes('Bad MAC') || 
            error.message?.includes('bad-mac') || 
            error.message?.includes('decrypt')) {
            console.log('🔧 Bad MAC error detected, cleaning up and retrying...');
            await handleBadMacError();
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
    
    try {
        await createWhatsAppConnection();
    } catch (error) {
        console.error('Failed to start:', error);
        process.exit(1);
    }
}

// Express server setup (simplified)
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        service: 'whatsapp-bot',
        version: '1.0.0',
        authentication: 'pairing-based',
        session: 'local-storage',
        port: PORT,
        mode: config.MODE
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Start the bot
start();

// Handle process signals
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});
