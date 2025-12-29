const path = require('path');
const pino = require('pino');
const { makeWASocket, fetchLatestBaileysVersion, DisconnectReason, getContentType, jidDecode } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const fs = require('fs');
const os = require('os');
const moment = require('moment-timezone');
const axios = require('axios');
const yts = require('yt-search');

// Import your config
const config = {
    PREFIX: '.',
    OWNER_NUMBER: '1234567890',
    OWNER_NAME: 'Gifted Tech',
    BOT_NAME: 'GIFTED-MD',
    MODE: 'public',
    AUTO_REACT: true,
    MENU_IMAGE: 'https://gitcdn.giftedtech.co.ke/image/AZO_image.jpg',
    DESCRIPTION: 'Advanced WhatsApp Bot by Gifted Tech'
};

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
                const m = this.serializeMessage(chatUpdate.messages[0], socket);
                
                if (!m.message) return;
                
                // Get message body/text
                let body = '';
                if (m.message.conversation) {
                    body = m.message.conversation;
                } else if (m.message.extendedTextMessage?.text) {
                    body = m.message.extendedTextMessage.text;
                } else if (m.message.imageMessage?.caption) {
                    body = m.message.imageMessage.caption;
                } else if (m.message.videoMessage?.caption) {
                    body = m.message.videoMessage.caption;
                }
                
                m.body = body || '';
                
                // Check if message is a command
                if (body && body.startsWith(config.PREFIX)) {
                    const cmd = body.slice(config.PREFIX.length).split(' ')[0].toLowerCase();
                    const args = body.slice(config.PREFIX.length + cmd.length).trim();
                    
                    // Add command and args to m object
                    m.cmd = cmd;
                    m.args = args;
                    m.text = args;
                    
                    console.log(`Command: .${cmd} | Args: ${args} | From: ${m.sender}`);
                    
                    // Handle the command using your exact plugins
                    await this.handleCommand(m, socket, cmd, args);
                }
            } catch (error) {
                console.error(`Error in message handler for ${this.sessionId}:`, error);
            }
        });

        // Auto-reaction
        socket.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const m = chatUpdate.messages[0];
                if (!m.key.fromMe && m.message && config.AUTO_REACT) {
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

    // Serialize message similar to your first codebase
    serializeMessage(message, sock) {
        const m = { ...message };
        
        // Add key properties
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
        
        // Add pushName
        m.pushName = m.pushName || 'User';
        
        // Add reply method (like your plugins expect)
        m.reply = (text, options = {}) => {
            return sock.sendMessage(m.from, { text: text }, { quoted: m, ...options });
        };
        
        // Add React method (like your plugins expect)
        m.React = (emoji) => {
            return sock.sendMessage(m.from, {
                react: {
                    text: emoji,
                    key: m.key
                }
            });
        };
        
        return m;
    }

    decodeJid(jid) {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return decode.user && decode.server && decode.user + '@' + decode.server || jid;
        } else {
            return jid;
        }
    }

    async handleCommand(m, sock, cmd, args) {
        try {
            // Import and run your exact plugins
            switch(cmd) {
                case 'menu':
                case 'help':
                case 'list':
                    await this.runMenuPlugin(m, sock);
                    break;
                    
                case 'play':
                    await this.runPlayPlugin(m, sock);
                    break;
                    
                case 'ping':
                    await this.runPingPlugin(m, sock);
                    break;
                    
                case 'owner':
                    await this.runOwnerPlugin(m, sock);
                    break;
                    
                case 'lyrics':
                case 'lyric':
                    await this.runLyricsPlugin(m, sock);
                    break;
                    
                case 'mode':
                    await this.runModePlugin(m, sock);
                    break;
                    
                default:
                    await m.reply(`❓ Unknown command: .${cmd}\n\nType .menu to see available commands.`);
            }
        } catch (error) {
            console.error(`Error handling command .${cmd}:`, error);
            await m.reply(`❌ Error executing command: .${cmd}\n\n${error.message}`);
        }
    }

    // YOUR EXACT menu.js PLUGIN
    async runMenuPlugin(m, gss) {
        const prefix = config.PREFIX;
        const cmd = m.body.startsWith(prefix) ? m.body.slice(prefix.length).split(" ")[0].toLowerCase() : "";
        const mode = config.MODE === 'public' ? 'public' : 'private';
        const pref = config.PREFIX;

        const validCommands = ['list', 'help', 'menu'];

        if (validCommands.includes(cmd)) {
            // Get time-based greeting
            const time2 = moment().tz("Asia/Colombo").format("HH:mm:ss");
            let pushwish = "";
            if (time2 < "05:00:00") {
                pushwish = `Good Morning 🌄`;
            } else if (time2 < "11:00:00") {
                pushwish = `Good Morning 🌄`;
            } else if (time2 < "15:00:00") {
                pushwish = `Good Afternoon 🌤️`;
            } else if (time2 < "18:00:00") {
                pushwish = `Good Evening 🌇`;
            } else if (time2 < "19:00:00") {
                pushwish = `Good Evening 🌇`;
            } else {
                pushwish = `Good Night 🌙`;
            }

            // Bot uptime
            const uptime = process.uptime();
            const day = Math.floor(uptime / (24 * 3600));
            const hours = Math.floor((uptime % (24 * 3600)) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            const mainMenu = `
╭───「 *${config.BOT_NAME}* 」───✧
│🎖️ Owner : *${config.OWNER_NAME}*
│👤 User : *${m.pushName}*
│⚡ Baileys : *Multi Device*
│💻 Type : *NodeJs*
│🌐 Mode : *${mode}*
│📱 Platform : *${os.platform()}*
│🔧 Prefix : [${prefix}]
│📦 Version : *3.1.0*
╰───────────────✧

> ${pushwish} *${m.pushName}*!

╭───「 *Menu List* 」───✧
│📥 1. Download Menu      
│🔄 2. Converter Menu        
│🤖 3. AI Menu  
│🔧 4. Tools Menu  
│👥 5. Group Menu 
│🔍 6. Search Menu   
│🏠 7. Main Menu
│👑 8. Owner Menu 
│👀 9. Stalk Menu     
│📢 update
╰───────────────✧
> *Reply with the number (1-9)*`;

            // Send menu with image
            await gss.sendMessage(m.from, {
                image: { url: config.MENU_IMAGE || 'https://gitcdn.giftedtech.co.ke/image/AZO_image.jpg' },
                caption: mainMenu,
                contextInfo: {
                    mentionedJid: [m.sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363398040175935@newsletter',
                        newsletterName: "JawadTechX",
                        serverMessageId: 143
                    }
                }
            }, {
                quoted: m
            });

            // Send audio
            await gss.sendMessage(m.from, {
                audio: { url: 'https://github.com/XdTechPro/KHAN-DATA/raw/refs/heads/main/autovoice/menunew.m4a' },
                mimetype: 'audio/mp4',
                ptt: true
            }, { quoted: m });

            console.log(`✅ Menu sent to ${m.sender}`);
        }
    }

    // YOUR EXACT play.js PLUGIN
    async runPlayPlugin(m, gss) {
        const prefix = config.PREFIX;
        const cmd = m.body.startsWith(prefix) ? m.body.slice(prefix.length).split(" ")[0].toLowerCase() : "";
        const args = m.body.slice(prefix.length + cmd.length).trim().split(" ");

        if (cmd === "play") {
            if (args.length === 0 || !args.join(" ")) {
                return m.reply("*Please provide a song name or keywords to search for.*");
            }

            const searchQuery = args.join(" ");
            m.reply("*🎧 Searching for the song...*");

            try {
                const searchResults = await yts(searchQuery);
                if (!searchResults.videos || searchResults.videos.length === 0) {
                    return m.reply(`❌ No results found for "${searchQuery}".`);
                }

                const firstResult = searchResults.videos[0];
                const videoUrl = firstResult.url;

                // First API endpoint (YOUR EXACT API)
                const apiUrl = `https://api.davidcyriltech.my.id/download/ytmp3?url=${videoUrl}`;
                const response = await axios.get(apiUrl);

                if (!response.data.success) {
                    return m.reply(`❌ Failed to fetch audio for "${searchQuery}".`);
                }

                const { title, download_url } = response.data.result;

                // Send the audio file
                await gss.sendMessage(
                    m.from,
                    {
                        audio: { url: download_url },
                        mimetype: "audio/mp4",
                        ptt: false,
                    },
                    { quoted: m }
                );

                m.reply(`✅ *${title}* has been downloaded successfully!`);
            } catch (error) {
                console.error(error);
                m.reply("❌ An error occurred while processing your request.");
            }
        }
    }

    // YOUR EXACT ping.js PLUGIN
    async runPingPlugin(m, Matrix) {
        const prefix = config.PREFIX;
        const cmd = m.body.startsWith(prefix) ? m.body.slice(prefix.length).split(' ')[0].toLowerCase() : '';

        if (cmd === "ping") {
            const start = new Date().getTime();

            const reactionEmojis = ['🔥', '⚡', '🚀', '💨', '🎯', '🎉', '🌟', '💥', '🕐', '🔹'];
            const textEmojis = ['💎', '🏆', '⚡️', '🚀', '🎶', '🌠', '🌀', '🔱', '🛡️', '✨'];

            const reactionEmoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
            let textEmoji = textEmojis[Math.floor(Math.random() * textEmojis.length)];

            // Ensure reaction and text emojis are different
            while (textEmoji === reactionEmoji) {
                textEmoji = textEmojis[Math.floor(Math.random() * textEmojis.length)];
            }

            await m.React(textEmoji);

            const end = new Date().getTime();
            const responseTime = (end - start) / 1000;

            const text = `*GIFTED-MD SPEED: ${responseTime.toFixed(2)}ms ${reactionEmoji}*`;

            await Matrix.sendMessage(m.from, {
                text,
                contextInfo: {
                    mentionedJid: [m.sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363398040175935@newsletter',
                        newsletterName: "JawadTechX",
                        serverMessageId: 143
                    }
                }
            }, { quoted: m });
        }
    }

    // YOUR EXACT owner.js PLUGIN
    async runOwnerPlugin(m, gss) {
        const ownernumber = config.OWNER_NUMBER;
        const prefix = config.PREFIX;
        const cmd = m.body.startsWith(prefix) ? m.body.slice(prefix.length).split(' ')[0].toLowerCase() : '';
        const text = m.body.slice(prefix.length + cmd.length).trim();

        if (cmd === 'owner') {
            try {
                // Send contact using your exact format
                const contactMsg = {
                    contacts: {
                        displayName: 'Bot Owner',
                        contacts: [{
                            displayName: config.OWNER_NAME,
                            vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.OWNER_NAME}\nFN:${config.OWNER_NAME}\nitem1.TEL;waid=${ownernumber}:${ownernumber}\nitem1.X-ABLabel:Click here to chat\nEND:VCARD`
                        }]
                    }
                };
                
                await gss.sendMessage(m.from, contactMsg, { quoted: m });
                await m.React("✅");
            } catch (error) {
                console.error('Error sending owner contact:', error);
                m.reply('Error sending owner contact.');
                await m.React("❌");
            }
        }
    }

    // YOUR EXACT lyrics.js PLUGIN (simplified)
    async runLyricsPlugin(m, Matrix) {
        const prefix = config.PREFIX;
        const cmd = m.body.startsWith(prefix) ? m.body.slice(prefix.length).split(' ')[0].toLowerCase() : '';
        const text = m.body.slice(prefix.length + cmd.length).trim();

        const validCommands = ['lyrics', 'lyric'];

        if (validCommands.includes(cmd)) {
            if (!text) return m.reply(`Hello *_${m.pushName}_,*\n Here's Example Usage: _.lyrics Spectre|Alan Walker._`);
            
            await m.reply('🎵 Fetching lyrics...');
            // You can add the full lyrics API logic here
            await m.reply(`Lyrics feature for "${text}" coming soon!`);
        }
    }

    // YOUR EXACT mode.js PLUGIN (simplified)
    async runModePlugin(m, Matrix) {
        const botNumber = await Matrix.decodeJid(Matrix.user.id);
        const isCreator = [botNumber, config.OWNER_NUMBER + '@s.whatsapp.net'].includes(m.sender);
        const prefix = config.PREFIX;
        const cmd = m.body.startsWith(prefix) ? m.body.slice(prefix.length).split(' ')[0].toLowerCase() : '';
        const text = m.body.slice(prefix.length + cmd.length).trim();

        if (cmd === 'mode') {
            if (!isCreator) {
                await Matrix.sendMessage(m.from, { text: "*📛 THIS IS AN OWNER COMMAND*" }, { quoted: m });
                return;
            }

            if (['public', 'private'].includes(text)) {
                if (text === 'public') {
                    config.MODE = "public";
                    m.reply('Mode has been changed to public.');
                } else if (text === 'private') {
                    config.MODE = "private";
                    m.reply('Mode has been changed to private.');
                }
            } else {
                m.reply("Usage:\n.Mode public/private");
            }
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
✅ Try .play songname to download music
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
