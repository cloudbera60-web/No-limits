const path = require('path');
const pino = require('pino');
const { makeWASocket, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');

class BotRunner {
    constructor(sessionId, authState) {
        this.sessionId = sessionId;
        this.authState = authState;
        this.socket = null;
        this.isRunning = false;
        this.startedAt = new Date();
        this.msgRetryCounterCache = new NodeCache();
    }

    async start() {
        try {
            console.log(`🤖 Starting bot for session: ${this.sessionId}`);
            
            const { version } = await fetchLatestBaileysVersion();
            
            this.socket = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                browser: ["GIFTED-MD", "safari", "3.3"],
                auth: this.authState,
                getMessage: async (key) => {
                    return { conversation: "GIFTED MD WhatsApp User Bot" };
                },
                msgRetryCounterCache: this.msgRetryCounterCache
            });

            // Store in global active bots
            global.activeBots = global.activeBots || {};
            global.activeBots[this.sessionId] = {
                socket: this.socket,
                startedAt: this.startedAt,
                sessionId: this.sessionId,
                instance: this
            };

            // Setup event handlers
            this.setupEventHandlers();
            
            this.isRunning = true;
            console.log(`✅ Bot started successfully for session: ${this.sessionId}`);
            
            // Send welcome message
            await this.sendWelcomeMessage();
            
            return this.socket;
            
        } catch (error) {
            console.error(`❌ Failed to start bot for ${this.sessionId}:`, error);
            throw error;
        }
    }

    setupEventHandlers() {
        const { socket } = this;
        
        // Connection update handler
        socket.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    console.log(`♻️ Reconnecting bot ${this.sessionId}...`);
                    setTimeout(() => this.reconnect(), 5000);
                } else {
                    console.log(`❌ Bot ${this.sessionId} logged out`);
                    this.stop();
                }
            } else if (connection === 'open') {
                console.log(`✅ Bot ${this.sessionId} connected successfully!`);
            }
        });

        // Creds update handler
        socket.ev.on('creds.update', async (creds) => {
            console.log(`🔑 Creds updated for ${this.sessionId}`);
        });

        // Message handler
        socket.ev.on("messages.upsert", async (chatUpdate) => {
            try {
                const m = chatUpdate.messages[0];
                if (!m.message) return;
                
                const messageType = Object.keys(m.message)[0];
                const from = m.key.remoteJid;
                const sender = m.key.participant || from;
                const pushName = m.pushName || 'User';
                
                // Check if it's a text message
                if (messageType === 'conversation' || m.message[messageType]?.text) {
                    const body = m.message[messageType]?.text || m.message.conversation || '';
                    
                    // Basic command handling
                    if (body.startsWith('.') || body.startsWith('!') || body.startsWith('/')) {
                        const prefix = body[0];
                        const cmd = body.slice(1).split(' ')[0].toLowerCase();
                        const args = body.slice(prefix.length + cmd.length + 1);
                        
                        await this.handleCommand(cmd, args, m, socket, pushName);
                    }
                }
            } catch (error) {
                console.error(`Error in message handler for ${this.sessionId}:`, error);
            }
        });

        // Auto-reaction
        socket.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const m = chatUpdate.messages[0];
                if (!m.key.fromMe && m.message) {
                    // Auto-react with random emoji
                    const emojis = ['❤️', '😂', '😮', '😢', '👏', '🔥', '⭐', '🎉'];
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                    
                    await socket.sendMessage(m.key.remoteJid, {
                        react: {
                            text: randomEmoji,
                            key: m.key
                        }
                    });
                }
            } catch (err) {
                // Silent fail for auto-react
            }
        });
    }

    async handleCommand(cmd, args, m, sock, pushName) {
        const from = m.key.remoteJid;
        
        switch(cmd) {
            case 'ping':
            case 'speed':
                const start = Date.now();
                await sock.sendMessage(from, { text: `🏓 Pong!` }, { quoted: m });
                const latency = Date.now() - start;
                await sock.sendMessage(from, { text: `⏱️ Latency: ${latency}ms` });
                break;
                
            case 'menu':
            case 'help':
            case 'list':
                const menu = `
🤖 *GIFTED-MD BOT MENU*

📁 *Download Commands:*
• .play [song] - Download music
• .ytmp3 [url] - YouTube to MP3
• .ytmp4 [url] - YouTube to MP4

🔧 *Utility Commands:*
• .ping - Check bot speed
• .owner - Get owner contact
• .menu - Show this menu

🎮 *Fun Commands:*
• .sticker - Create sticker from image
• .attp [text] - Create animated text

⚙️ *Bot Info:*
• Bot ID: ${this.sessionId}
• Uptime: ${this.getUptime()}
• User: ${pushName}

*Use .help [command] for more info*`;
                await sock.sendMessage(from, { text: menu }, { quoted: m });
                break;
                
            case 'owner':
                await sock.sendMessage(from, { 
                    text: `👑 *Bot Owner*\n\nContact: +1234567890\n\nThis bot is powered by Gifted Tech` 
                }, { quoted: m });
                break;
                
            case 'play':
                if (!args) {
                    await sock.sendMessage(from, { text: 'Please provide a song name. Example: .play shape of you' }, { quoted: m });
                    return;
                }
                await sock.sendMessage(from, { text: `🎵 Searching for "${args}"...` }, { quoted: m });
                // Simulate searching
                setTimeout(async () => {
                    await sock.sendMessage(from, { text: `✅ Found: "${args}"\n\nFeature coming soon!` });
                }, 2000);
                break;
                
            case 'sticker':
                if (m.message?.imageMessage) {
                    await sock.sendMessage(from, { text: `🔄 Creating sticker from image...` }, { quoted: m });
                    setTimeout(async () => {
                        await sock.sendMessage(from, { text: `✅ Sticker created! (Feature simulation)` });
                    }, 1500);
                } else {
                    await sock.sendMessage(from, { text: `Please send an image with caption .sticker` }, { quoted: m });
                }
                break;
                
            case 'attp':
                if (!args) {
                    await sock.sendMessage(from, { text: 'Please provide text. Example: .attp Hello' }, { quoted: m });
                    return;
                }
                await sock.sendMessage(from, { 
                    text: `✨ Creating animated text for: "${args}"\n\nFeature coming soon!` 
                }, { quoted: m });
                break;
                
            case 'info':
            case 'botinfo':
                const info = `
🤖 *BOT INFORMATION*

• *Name:* GIFTED-MD
• *Version:* 2.0.0
• *Session ID:* ${this.sessionId}
• *Uptime:* ${this.getUptime()}
• *Status:* ✅ Running
• *User:* ${pushName}
• *Features:* 10+ commands

*Powered by Gifted Tech*`;
                await sock.sendMessage(from, { text: info }, { quoted: m });
                break;
                
            default:
                await sock.sendMessage(from, { 
                    text: `❓ Unknown command: .${cmd}\n\nType .menu to see available commands.` 
                }, { quoted: m });
        }
    }

    getUptime() {
        const uptime = Date.now() - this.startedAt;
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    async sendWelcomeMessage() {
        try {
            const welcomeMsg = `*🤖 GIFTED-MD Bot Activated!*

✅ Your bot is now running successfully!
✅ All features are available
✅ Use .menu to see commands
✅ Bot ID: ${this.sessionId}

*Powered by Gifted Tech*`;

            await this.socket.sendMessage(this.socket.user.id, {
                text: welcomeMsg
            });
            
            console.log(`📨 Welcome message sent for ${this.sessionId}`);
        } catch (error) {
            console.error('Error sending welcome message:', error);
        }
    }

    async reconnect() {
        if (this.isRunning) {
            await this.stop();
            await this.start();
        }
    }

    async stop() {
        this.isRunning = false;
        if (this.socket) {
            try {
                await this.socket.ws.close();
            } catch (error) {
                console.error('Error closing socket:', error);
            }
        }
        if (global.activeBots && global.activeBots[this.sessionId]) {
            delete global.activeBots[this.sessionId];
        }
        console.log(`🛑 Bot stopped: ${this.sessionId}`);
    }

    getStatus() {
        return {
            sessionId: this.sessionId,
            isRunning: this.isRunning,
            startedAt: this.startedAt,
            uptime: this.getUptime(),
            user: this.socket?.user?.id || 'Not connected'
        };
    }
}

// Function to start a bot instance
async function startBotInstance(sessionId, authState) {
    const bot = new BotRunner(sessionId, authState);
    await bot.start();
    return bot;
}

// Function to stop a bot instance
function stopBotInstance(sessionId) {
    if (global.activeBots && global.activeBots[sessionId]) {
        global.activeBots[sessionId].instance.stop();
        return true;
    }
    return false;
}

// Function to get all active bots
function getActiveBots() {
    return global.activeBots || {};
}

module.exports = {
    BotRunner,
    startBotInstance,
    stopBotInstance,
    getActiveBots
};
