const path = require('path');
const pino = require('pino');
const { makeWASocket, fetchLatestBaileysVersion, DisconnectReason, jidDecode } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const database = require('./database');
const pluginLoader = require('./plugin-loader');
const configManager = require('./config-manager');

class BotRunner {
    constructor(sessionId, authState) {
        this.sessionId = sessionId;
        this.authState = authState;
        this.socket = null;
        this.isRunning = false;
        this.startedAt = new Date();
        this.msgRetryCounterCache = new NodeCache();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = configManager.get('MAX_RECONNECT_ATTEMPTS', 3);
        this.config = configManager.getAll();
        
        // Connection state tracking
        this.connectionState = 'disconnected';
        this.lastActivity = new Date();
    }

    async start() {
        try {
            if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
                console.log(`⏳ Bot ${this.sessionId} is already ${this.connectionState}`);
                return this.socket;
            }
            
            this.connectionState = 'connecting';
            console.log(`🤖 Starting bot for session: ${this.sessionId}`);
            
            // Try to load session from MongoDB first
            if (!this.authState.creds && database.isConnected) {
                const savedSession = await database.getSession(this.sessionId);
                if (savedSession) {
                    console.log(`📂 Loaded session from DB: ${this.sessionId}`);
                    this.authState = savedSession;
                }
            }
            
            const { version } = await fetchLatestBaileysVersion();
            
            this.socket = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                browser: ["GIFTED-MD", "safari", "3.3"],
                auth: this.authState,
                getMessage: async () => ({ conversation: "GIFTED MD WhatsApp User Bot" }),
                msgRetryCounterCache: this.msgRetryCounterCache,
                connectTimeoutMs: 30000,
                keepAliveIntervalMs: 15000,
                emitOwnEvents: true,
                defaultQueryTimeoutMs: 0
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
            this.reconnectAttempts = 0;
            
            console.log(`✅ Bot started successfully for session: ${this.sessionId}`);
            
            // Send welcome message (non-blocking)
            this.sendWelcomeMessage().catch(console.error);
            
            return this.socket;
            
        } catch (error) {
            this.connectionState = 'error';
            console.error(`❌ Failed to start bot for ${this.sessionId}:`, error.message);
            throw error;
        }
    }

    setupEventHandlers() {
        const { socket } = this;
        
        // Save credentials to MongoDB when updated
        socket.ev.on('creds.update', async (creds) => {
            try {
                if (database.isConnected) {
                    await database.saveSession(this.sessionId, { creds, keys: this.authState.keys });
                    console.log(`💾 Saved updated credentials for ${this.sessionId}`);
                }
            } catch (error) {
                console.error('Error saving credentials:', error.message);
            }
        });

        // Connection update handler with MongoDB persistence
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                this.connectionState = 'connected';
                this.lastActivity = new Date();
                console.log(`✅ Bot ${this.sessionId} connected successfully!`);
                this.reconnectAttempts = 0;
                
                // Save session to MongoDB on successful connection
                if (database.isConnected) {
                    await database.saveSession(this.sessionId, this.authState);
                }
            } 
            else if (connection === 'close') {
                this.connectionState = 'disconnected';
                
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    const delay = Math.min(configManager.get('RECONNECT_DELAY', 5000) * this.reconnectAttempts, 30000);
                    
                    console.log(`♻️ Reconnecting bot ${this.sessionId} in ${delay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                    
                    setTimeout(async () => {
                        if (this.isRunning) {
                            await this.reconnect();
                        }
                    }, delay);
                } else {
                    console.log(`🛑 Bot ${this.sessionId} disconnected permanently`);
                    await this.stop();
                }
            }
        });

        // Message handler with plugin system
        socket.ev.on("messages.upsert", async (chatUpdate) => {
            try {
                this.lastActivity = new Date();
                
                const m = this.serializeMessage(chatUpdate.messages[0], socket);
                if (!m.message) return;
                
                const body = this.extractMessageText(m.message);
                if (!body) return;
                
                m.body = body;
                
                // Check if message is a command
                if (body.startsWith(this.config.PREFIX)) {
                    const cmd = body.slice(this.config.PREFIX.length).split(' ')[0].toLowerCase();
                    const args = body.slice(this.config.PREFIX.length + cmd.length).trim();
                    
                    m.cmd = cmd;
                    m.args = args;
                    m.text = args;
                    
                    console.log(`Command: .${cmd} from ${m.sender.substring(0, 8)}...`);
                    
                    // Try to execute as plugin first
                    const pluginResult = await pluginLoader.executePlugin(cmd, m, socket);
                    
                    if (!pluginResult.success) {
                        // If no plugin found, use built-in commands
                        await this.handleBuiltinCommand(m, socket, cmd, args);
                    }
                }
                
                // Auto-reaction
                if (!m.key.fromMe && m.message && this.config.AUTO_REACT) {
                    this.sendAutoReaction(m, socket).catch(() => {});
                }
                
            } catch (error) {
                console.error(`Error processing message for ${this.sessionId}:`, error.message);
            }
        });
    }

    async handleBuiltinCommand(m, sock, cmd, args) {
        switch(cmd) {
            case 'ping':
                const start = Date.now();
                await m.reply(`🏓 Pong!`);
                const latency = Date.now() - start;
                await sock.sendMessage(m.from, { text: `⏱️ Latency: ${latency}ms\n🆔 ${this.sessionId}` });
                break;
                
            case 'menu':
                await this.showSimpleMenu(m, sock);
                break;
                
            case 'plugins':
            case 'pl':
                const plugins = Array.from(pluginLoader.plugins.keys());
                await m.reply(`📦 Loaded Plugins (${plugins.length}):\n${plugins.map(p => `• .${p}`).join('\n')}`);
                break;
                
            case 'status':
                const uptime = this.getUptime();
                const status = `🤖 *Bot Status*\n\n` +
                              `• Session: ${this.sessionId}\n` +
                              `• State: ${this.connectionState}\n` +
                              `• Uptime: ${uptime}\n` +
                              `• Reconnects: ${this.reconnectAttempts}/${this.maxReconnectAttempts}\n` +
                              `• Last Activity: ${this.lastActivity.toLocaleTimeString()}`;
                await m.reply(status);
                break;
                
            case 'reload':
                if (m.sender.includes(this.config.OWNER_NUMBER)) {
                    await m.reply('🔄 Reloading plugins...');
                    await pluginLoader.reloadAllPlugins();
                    await m.reply(`✅ Reloaded ${pluginLoader.plugins.size} plugin(s)`);
                } else {
                    await m.reply('❌ Owner only command');
                }
                break;
                
            default:
                await m.reply(`❓ Unknown command: .${cmd}\n\nType .menu for commands\nType .plugins to see loaded plugins`);
        }
    }

    async showSimpleMenu(m, sock) {
        const menu = `🤖 *${this.config.BOT_NAME}*\n\n` +
                    `👤 User: ${m.pushName}\n` +
                    `🔧 Prefix: ${this.config.PREFIX}\n` +
                    `🆔 Session: ${this.sessionId}\n\n` +
                    `📋 *Commands:*\n` +
                    `• .menu - Show this menu\n` +
                    `• .ping - Check bot speed\n` +
                    `• .play [song] - Download music\n` +
                    `• .owner - Contact owner\n` +
                    `• .plugins - Show loaded plugins\n` +
                    `• .status - Bot status\n\n` +
                    `*Powered by ${this.config.OWNER_NAME}*`;
        
        await m.reply(menu);
    }

    extractMessageText(message) {
        if (message.conversation) return message.conversation;
        if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
        if (message.imageMessage?.caption) return message.imageMessage.caption;
        if (message.videoMessage?.caption) return message.videoMessage.caption;
        return '';
    }

    serializeMessage(message, sock) {
        const m = { ...message };
        
        if (m.key) {
            m.id = m.key.id;
            m.isSelf = m.key.fromMe;
            m.from = this.decodeJid(m.key.remoteJid);
            m.isGroup = m.from.endsWith("@g.us");
            m.sender = m.isGroup
                ? this.decodeJid(m.key.participant)
                : m.isSelf
                ? this.decodeJid(sock.user.id)
                : m.from;
        }
        
        m.pushName = m.pushName || 'User';
        
        m.reply = (text, options = {}) => {
            return new Promise((resolve) => {
                setTimeout(async () => {
                    try {
                        const result = await sock.sendMessage(m.from, { text }, { quoted: m, ...options });
                        resolve(result);
                    } catch (error) {
                        console.error(`Reply failed:`, error.message);
                        resolve(null);
                    }
                }, 100);
            });
        };
        
        m.React = (emoji) => {
            return sock.sendMessage(m.from, {
                react: { text: emoji, key: m.key }
            }).catch(() => {});
        };
        
        return m;
    }

    decodeJid(jid) {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            const decode = jidDecode(jid) || {};
            return decode.user && decode.server ? `${decode.user}@${decode.server}` : jid;
        }
        return jid;
    }

    async sendAutoReaction(m, sock) {
        const emojis = ['❤️', '😂', '😮', '😢', '👏', '🔥', '⭐', '🎉'];
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        
        await sock.sendMessage(m.from, {
            react: { text: randomEmoji, key: m.key }
        }).catch(() => {});
    }

    getUptime() {
        const uptime = Date.now() - this.startedAt;
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }

    async sendWelcomeMessage() {
        try {
            const welcomeMsg = `*🤖 ${this.config.BOT_NAME} Activated!*\n\n` +
                              `✅ Bot is ready!\n` +
                              `🆔 ${this.sessionId}\n` +
                              `🔧 Prefix: ${this.config.PREFIX}\n` +
                              `📢 Use .menu for commands\n\n` +
                              `*Powered by ${this.config.OWNER_NAME}*`;
            
            await this.socket.sendMessage(this.socket.user.id, { text: welcomeMsg });
        } catch (error) {
            // Silent fail
        }
    }

    async reconnect() {
        if (this.isRunning && this.reconnectAttempts < this.maxReconnectAttempts) {
            console.log(`Attempting reconnect for ${this.sessionId}...`);
            try {
                await this.stop();
                await this.start();
            } catch (error) {
                console.error(`Reconnect failed for ${this.sessionId}:`, error.message);
            }
        }
    }

    async stop() {
        this.isRunning = false;
        this.connectionState = 'stopped';
        
        if (this.socket) {
            try {
                await this.socket.ws.close();
            } catch (error) {
                // Ignore close errors
            }
        }
        
        if (global.activeBots && global.activeBots[this.sessionId]) {
            delete global.activeBots[this.sessionId];
        }
        
        console.log(`🛑 Bot stopped: ${this.sessionId}`);
    }
}

// Initialize system
async function initializeBotSystem() {
    try {
        // Load configuration
        await configManager.loadConfig();
        
        // Connect to MongoDB
        await database.connect();
        
        // Load plugins
        await pluginLoader.loadPlugins();
        
        console.log('✅ Bot system initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize bot system:', error);
        return false;
    }
}

// Export functions
async function startBotInstance(sessionId, authState) {
    const bot = new BotRunner(sessionId, authState);
    await bot.start();
    return bot;
}

function stopBotInstance(sessionId) {
    if (global.activeBots && global.activeBots[sessionId]) {
        global.activeBots[sessionId].instance.stop();
        return true;
    }
    return false;
}

function getActiveBots() {
    return global.activeBots || {};
}

module.exports = {
    BotRunner,
    startBotInstance,
    stopBotInstance,
    getActiveBots,
    initializeBotSystem,
    database,
    pluginLoader,
    configManager
};
