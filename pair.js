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
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import NodeCache from 'node-cache';

// Configuration
const prefix = process.env.PREFIX || '.';
const sessionName = "session";
const app = express();
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

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

// Helper functions
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

// Main WhatsApp connection function
async function connectToWhatsApp() {
    try {
        console.log('🔧 Initializing WhatsApp connection...');
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📱 Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        const store = createSimpleStore();
        
        const socket = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
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

        // Bind store
        store?.bind(socket.ev);

        // Handle pairing if needed
        if (!socket.authState.creds.registered) {
            console.log('🔐 Device not registered, generating pairing code...');
            await handlePairing(socket);
        }

        // Setup connection handlers
        setupConnectionHandlers(socket, saveCreds);
        
        return socket;
    } catch (error) {
        console.error('❌ Failed to connect to WhatsApp:', error);
        throw error;
    }
}

async function handlePairing(socket) {
    let retries = 3;
    
    while (retries > 0) {
        try {
            await delay(1500);
            const pairName = "MARISELA";
            const code = await socket.requestPairingCode("bot", pairName);
            
            console.log('\n══════════════════════════════════════════════════');
            console.log('📱 PAIRING CODE GENERATED');
            console.log('══════════════════════════════════════════════════');
            console.log(`🔢 Code: ${code}`);
            console.log('══════════════════════════════════════════════════');
            console.log('📋 Instructions:');
            console.log('1. Open WhatsApp on your phone');
            console.log('2. Go to Settings > Linked Devices');
            console.log('3. Tap on "Link a Device"');
            console.log('4. Enter the code above when prompted');
            console.log('══════════════════════════════════════════════════\n');
            
            break;
        } catch (error) {
            retries--;
            console.warn(`⚠️ Failed to generate pairing code, retries left: ${retries}`, error.message);
            
            if (retries === 0) {
                console.error('❌ Failed to generate pairing code after all retries');
                throw error;
            }
            
            await delay(2000 * (3 - retries));
        }
    }
}

function setupConnectionHandlers(socket, saveCreds) {
    // Handle connection updates
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (connection === 'open') {
            console.log(chalk.green.bold('✅ Connected to WhatsApp successfully!'));
            
            // Send welcome message
            try {
                await socket.sendMessage(socket.user.id, {
                    text: `╭─────────────━┈⊷
│ *CONNECTED SUCCESSFULLY *
╰─────────────━┈⊷

╭─────────────━┈⊷
│BOT NAME : Cloud Ai
│DEV : BRUCE BERA
╰─────────────━┈⊷`
                });
            } catch (error) {
                console.error('Failed to send welcome message:', error);
            }
            
            // Update profile status
            try {
                await socket.updateProfileStatus('mᥱrᥴᥱძᥱs ᥲᥴ𝗍і᥎ᥱ:- https://up-tlm1.onrender.com/');
                console.log('✅ Updated profile status');
            } catch (error) {
                console.error('Failed to update profile status:', error);
            }
        } else if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`🔌 Connection closed, status code: ${statusCode}`);
            
            if (shouldReconnect) {
                console.log('🔄 Attempting to reconnect in 10 seconds...');
                setTimeout(async () => {
                    try {
                        await startBot();
                    } catch (error) {
                        console.error('Failed to reconnect:', error);
                    }
                }, 10000);
            } else {
                console.log('❌ Logged out, need new pairing');
                // Clear session and restart
                try {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                    fs.mkdirSync(sessionDir, { recursive: true });
                } catch (error) {
                    console.error('Failed to clear session:', error);
                }
                
                setTimeout(async () => {
                    try {
                        await startBot();
                    } catch (error) {
                        console.error('Failed to restart:', error);
                    }
                }, 5000);
            }
        } else if (connection === 'connecting') {
            console.log('🔄 Connecting to WhatsApp...');
        }
    });
    
    // Save credentials when updated
    socket.ev.on('creds.update', saveCreds);
    
    // Handle messages
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message) return;
        
        console.log('📨 Received message:', message.key.remoteJid);
        
        // Auto-react to status updates
        if (message.key.remoteJid === 'status@broadcast' && message.key.participant) {
            try {
                const emojiList = ['👍', '❤️', '😂', '😮', '😢', '👏'];
                const randomEmoji = emojiList[Math.floor(Math.random() * emojiList.length)];
                
                await socket.sendMessage(
                    message.key.remoteJid,
                    { react: { text: randomEmoji, key: message.key } },
                    { statusJidList: [message.key.participant] }
                );
                
                console.log(`✅ Reacted to status with ${randomEmoji}`);
            } catch (error) {
                console.error('Failed to react to status:', error);
            }
        }
        
        // Handle regular messages (you can add your command handlers here)
        if (message.message && !message.key.fromMe) {
            const text = message.message.conversation || 
                        message.message.extendedTextMessage?.text || 
                        '';
            
            if (text.toLowerCase() === 'ping') {
                await socket.sendMessage(message.key.remoteJid, { text: 'Pong! 🏓' });
            }
            
            if (text.toLowerCase() === 'hello') {
                await socket.sendMessage(message.key.remoteJid, { 
                    text: 'Hello! I am Cloud Ai bot. How can I help you?' 
                });
            }
        }
    });
    
    // Handle calls
    socket.ev.on('call', async (call) => {
        console.log('📞 Incoming call from:', call);
        // You can add call handling logic here
    });
    
    // Handle group updates
    socket.ev.on('group-participants.update', async (update) => {
        console.log('👥 Group participants updated:', update);
        // You can add group handling logic here
    });
}

async function startBot() {
    console.log('🚀 Starting WhatsApp Bot...');
    console.log(`📁 Session directory: ${sessionDir}`);
    console.log(`🌐 Server port: ${PORT}`);
    
    try {
        const socket = await connectToWhatsApp();
        console.log('🤖 Bot is ready!');
        return socket;
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        
        // Retry after delay
        console.log('🔄 Retrying in 15 seconds...');
        setTimeout(startBot, 15000);
    }
}

// Setup Express server
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp Bot - Cloud Ai</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    color: white;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: rgba(255, 255, 255, 0.1);
                    padding: 30px;
                    border-radius: 15px;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                }
                h1 {
                    text-align: center;
                    margin-bottom: 30px;
                    font-size: 2.5em;
                    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
                }
                .status {
                    background: rgba(255, 255, 255, 0.2);
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                }
                .instructions {
                    background: rgba(0, 0, 0, 0.2);
                    padding: 20px;
                    border-radius: 10px;
                    margin-top: 20px;
                }
                code {
                    background: rgba(0, 0, 0, 0.3);
                    padding: 10px 15px;
                    border-radius: 5px;
                    display: block;
                    margin: 10px 0;
                    font-family: monospace;
                    font-size: 1.2em;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 WhatsApp Bot - Cloud Ai</h1>
                
                <div class="status">
                    <h2>🟢 Bot Status: Running</h2>
                    <p><strong>Port:</strong> ${PORT}</p>
                    <p><strong>Authentication:</strong> Pairing Code</p>
                    <p><strong>Session:</strong> Local Storage</p>
                </div>
                
                <div class="instructions">
                    <h3>📱 Pairing Instructions:</h3>
                    <p>If this is your first time running the bot:</p>
                    <ol>
                        <li>Check the console for the pairing code</li>
                        <li>Open WhatsApp on your phone</li>
                        <li>Go to Settings → Linked Devices</li>
                        <li>Tap "Link a Device"</li>
                        <li>Enter the code shown in console</li>
                    </ol>
                    <p><em>Note: The bot will automatically reconnect if disconnected.</em></p>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Start server
app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    console.log(`🔗 Access at: http://localhost:${PORT}`);
});

// Start the bot
startBot();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});
