const path = require('path');
const fs = require('fs');
const { serialize } = require('../lib/Serializer'); // From first codebase
const { Handler, Callupdate, GroupUpdate } = require('../data/index'); // From first codebase
const config = require('../config.cjs'); // From first codebase
const pino = require('pino');
const { makeWASocket, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const chalk = require('chalk');
const NodeCache = require('node-cache');

class BotRunner {
    constructor(sessionId, authState) {
        this.sessionId = sessionId;
        this.authState = authState;
        this.socket = null;
        this.isRunning = false;
        this.botInfo = {};
        this.msgRetryCounterCache = new NodeCache();
    }

    async start() {
        try {
            console.log(chalk.blue(`🤖 Starting bot for session: ${this.sessionId}`));
            
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
            global.activeBots[this.sessionId] = {
                socket: this.socket,
                startedAt: new Date(),
                sessionId: this.sessionId
            };

            // Setup event handlers from first codebase
            this.setupEventHandlers();
            
            this.isRunning = true;
            console.log(chalk.green(`✅ Bot started successfully for session: ${this.sessionId}`));
            
            // Send welcome message
            await this.sendWelcomeMessage();
            
            return this.socket;
            
        } catch (error) {
            console.error(chalk.red(`❌ Failed to start bot for ${this.sessionId}:`), error);
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
                    console.log(chalk.yellow(`♻️ Reconnecting bot ${this.sessionId}...`));
                    setTimeout(() => this.reconnect(), 5000);
                } else {
                    console.log(chalk.red(`❌ Bot ${this.sessionId} logged out`));
                    this.stop();
                }
            } else if (connection === 'open') {
                console.log(chalk.green(`✅ Bot ${this.sessionId} connected successfully!`));
            }
        });

        // Creds update handler
        socket.ev.on('creds.update', async () => {
            // Handle credential updates if needed
        });

        // Message handler from first codebase
        socket.ev.on("messages.upsert", async chatUpdate => {
            try {
                // Use the Handler from first codebase
                await Handler(chatUpdate, socket, pino({ level: 'silent' }));
            } catch (error) {
                console.error(`Error in message handler for ${this.sessionId}:`, error);
            }
        });

        // Call handler from first codebase
        socket.ev.on("call", async (json) => {
            try {
                await Callupdate(json, socket);
            } catch (error) {
                console.error(`Error in call handler for ${this.sessionId}:`, error);
            }
        });

        // Group update handler from first codebase
        socket.ev.on("group-participants.update", async (messag) => {
            try {
                await GroupUpdate(socket, messag);
            } catch (error) {
                console.error(`Error in group handler for ${this.sessionId}:`, error);
            }
        });

        // Auto-reaction and status handling (from first codebase)
        socket.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.key.fromMe && config.AUTO_REACT) {
                    if (mek.message) {
                        const emojis = ['❤️', '😂', '😮', '😢', '👏', '🔥', '⭐', '🎉'];
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await socket.sendMessage(mek.key.remoteJid, {
                            react: {
                                text: randomEmoji,
                                key: mek.key
                            }
                        });
                    }
                }
            } catch (err) {
                console.error('Error during auto reaction:', err);
            }
        });
    }

    async sendWelcomeMessage() {
        try {
            const welcomeMsg = `*🤖 GIFTED-MD Bot Activated!*

✅ Your bot is now running successfully!
✅ All features are available
✅ Use ${config.PREFIX || '.'}menu to see commands
✅ Bot ID: ${this.sessionId}

*Powered by Gifted Tech*`;

            await this.socket.sendMessage(this.socket.user.id, {
                text: welcomeMsg
            });
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
        delete global.activeBots[this.sessionId];
        console.log(chalk.yellow(`🛑 Bot stopped: ${this.sessionId}`));
    }

    getStatus() {
        return {
            sessionId: this.sessionId,
            isRunning: this.isRunning,
            startedAt: this.startedAt,
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
    if (global.activeBots[sessionId]) {
        global.activeBots[sessionId].stop();
        return true;
    }
    return false;
}

// Function to get all active bots
function getActiveBots() {
    return global.activeBots;
}

module.exports = {
    BotRunner,
    startBotInstance,
    stopBotInstance,
    getActiveBots
};
