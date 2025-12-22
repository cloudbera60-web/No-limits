//[file name]: pair.js
//[file content begin]
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const mongoose = require('mongoose');

// PAYHERO IMPORT
const { PayHeroClient } = require('payhero-devkit');

if (fs.existsSync('2nd_dev_config.env')) require('dotenv').config({ path: './2nd_dev_config.env' });

// FIXED BAILEYS IMPORT
const baileysImport = require('@whiskeysockets/baileys');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    DisconnectReason,
    fetchLatestBaileysVersion
} = baileysImport;

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ellyongiro8:QwXDXE6tyrGpUTNb@cluster0.tyxcmm9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

process.env.NODE_ENV = 'production';
process.env.PM2_NAME = 'breshyb';

console.log('🚀 Cloud AI WhatsApp Bot with STK Push');

const config = {
    // General Bot Settings
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💗', '🩵', '🥺', '🫶', '😶'],

    // Command Settings
    PREFIX: '.',
    MAX_RETRIES: 3,

    // File Paths
    ADMIN_LIST_PATH: './admin.json',
    IMAGE_PATH: 'https://i.ibb.co/zhm2RF8j/vision-v.jpg',
    NUMBER_LIST_PATH: './numbers.json',
    SESSION_STATUS_PATH: './session_status.json',
    SESSION_BASE_PATH: './session',

    // Security & OTP
    OTP_EXPIRY: 300000,

    // Owner Details
    OWNER_NUMBER: '254740007567',

    // PAYHERO SETTINGS
    PAYHERO_AUTH_TOKEN: process.env.PAYHERO_AUTH_TOKEN || process.env.AUTH_TOKEN,
    PAYHERO_CHANNEL_ID: process.env.CHANNEL_ID || '3342',
    PAYHERO_DEFAULT_PROVIDER: process.env.DEFAULT_PROVIDER || 'm-pesa',
    SUPPORTED_PROVIDERS: ['Safaricom (2547)', 'Airtel (2541)', 'Telkom (2547)']
};

// Initialize PayHero Client
let payheroClient;
try {
    if (config.PAYHERO_AUTH_TOKEN) {
        payheroClient = new PayHeroClient({
            authToken: config.PAYHERO_AUTH_TOKEN
        });
        console.log('✅ PayHero Client initialized');
    } else {
        console.log('⚠️ PayHero Auth Token not found');
    }
} catch (error) {
    console.error('❌ Failed to initialize PayHero:', error.message);
}

// Session Management Maps
const activeSockets = new Map();
const socketCreationTime = new Map();
const disconnectionTime = new Map();
const sessionHealth = new Map();
const reconnectionAttempts = new Map();
const sessionConnectionStatus = new Map();
const pendingSaves = new Map();
const restoringNumbers = new Set();

// Track STK Push transactions
const pendingTransactions = new Map();
const completedTransactions = new Map();

// MongoDB Connection
let mongoConnected = false;

// MongoDB Schemas
const sessionSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, index: true },
    sessionData: { type: Object, required: true },
    status: { type: String, default: 'active', index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    health: { type: String, default: 'active' }
});

const transactionSchema = new mongoose.Schema({
    reference: { type: String, required: true, unique: true, index: true },
    phone: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, default: 'pending' },
    customer_name: { type: String },
    initiated_by: { type: String },
    initiated_at: { type: Date, default: Date.now },
    completed_at: { type: Date },
    provider: { type: String },
    channel_id: { type: String }
});

const Session = mongoose.model('Session', sessionSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// Initialize MongoDB Connection
async function initializeMongoDB() {
    try {
        if (mongoConnected) return true;

        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            maxPoolSize: 5,
            minPoolSize: 1
        });

        mongoConnected = true;
        console.log('✅ MongoDB connected successfully');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        mongoConnected = false;
        return false;
    }
}

// STK PUSH FUNCTIONS
function formatPhoneForMpesa(phone) {
    if (!phone) return null;
    
    let formattedPhone = phone.toString().trim().replace(/\s+/g, '');
    
    // Remove all non-numeric characters except +
    formattedPhone = formattedPhone.replace(/[^0-9+]/g, '');
    
    // If it starts with +, remove it
    if (formattedPhone.startsWith('+')) {
        formattedPhone = formattedPhone.substring(1);
    }
    
    // Convert to 254 format
    if (formattedPhone.startsWith('0') && formattedPhone.length === 10) {
        // 07xxxxxxxx -> 2547xxxxxxxx
        formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('7') && formattedPhone.length === 9) {
        // 7xxxxxxxx -> 2547xxxxxxxx
        formattedPhone = '254' + formattedPhone;
    } else if (formattedPhone.startsWith('1') && formattedPhone.length === 9) {
        // 1xxxxxxxx -> 2541xxxxxxxx (Airtel)
        formattedPhone = '254' + formattedPhone;
    }
    
    // Final validation - accept 2547 and 2541
    if ((formattedPhone.startsWith('2547') || formattedPhone.startsWith('2541')) && formattedPhone.length === 12) {
        return formattedPhone;
    }
    
    return null;
}

async function initiateSTKPush(phone, amount, customerName = 'Customer', initiatedBy = null) {
    try {
        const formattedPhone = formatPhoneForMpesa(phone);
        
        if (!formattedPhone) {
            throw new Error('Invalid phone number format. Use: 2547xxxxxxxx or 2541xxxxxxxx');
        }
        
        if (amount <= 0) {
            throw new Error('Amount must be greater than 0');
        }
        
        const reference = `STK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const stkPayload = {
            phone_number: formattedPhone,
            amount: parseFloat(amount),
            provider: config.PAYHERO_DEFAULT_PROVIDER,
            channel_id: config.PAYHERO_CHANNEL_ID,
            external_reference: reference,
            customer_name: customerName
        };
        
        console.log('🔄 Initiating STK Push:', stkPayload);
        
        if (!payheroClient) {
            throw new Error('PayHero client not initialized. Check your auth token.');
        }
        
        const response = await payheroClient.stkPush(stkPayload);
        
        console.log('✅ STK Push Response:', response);
        
        // Store transaction in memory
        pendingTransactions.set(reference, {
            phone: formattedPhone,
            amount: amount,
            status: 'pending',
            timestamp: new Date(),
            initiated_by: initiatedBy,
            response: response
        });
        
        // Save to MongoDB
        if (mongoConnected) {
            await Transaction.create({
                reference: reference,
                phone: formattedPhone,
                amount: amount,
                status: 'pending',
                customer_name: customerName,
                initiated_by: initiatedBy,
                provider: config.PAYHERO_DEFAULT_PROVIDER,
                channel_id: config.PAYHERO_CHANNEL_ID
            }).catch(err => console.error('Failed to save transaction:', err));
        }
        
        return {
            success: true,
            reference: reference,
            message: `STK Push sent to ${formattedPhone} for KES ${amount}`,
            data: response
        };
        
    } catch (error) {
        console.error('❌ STK Push Error:', error);
        return {
            success: false,
            error: error.message || 'Failed to initiate STK push'
        };
    }
}

async function checkTransactionStatus(reference) {
    try {
        if (!payheroClient) {
            throw new Error('PayHero client not initialized');
        }
        
        console.log('🔄 Checking transaction status:', reference);
        const response = await payheroClient.transactionStatus(reference);
        
        // Update transaction status
        if (pendingTransactions.has(reference)) {
            const transaction = pendingTransactions.get(reference);
            transaction.status = response.status || 'unknown';
            transaction.updated = new Date();
            
            if (response.status === 'success' || response.status === 'completed') {
                completedTransactions.set(reference, transaction);
                pendingTransactions.delete(reference);
            }
        }
        
        // Update MongoDB
        if (mongoConnected) {
            await Transaction.findOneAndUpdate(
                { reference: reference },
                {
                    status: response.status || 'unknown',
                    completed_at: response.status === 'success' ? new Date() : null
                }
            ).catch(err => console.error('Failed to update transaction:', err));
        }
        
        return {
            success: true,
            data: response
        };
        
    } catch (error) {
        console.error('❌ Transaction Status Error:', error);
        return {
            success: false,
            error: error.message || 'Failed to check transaction status'
        };
    }
}

// Handle .send command
async function handleSendCommand(socket, from, args) {
    try {
        const sender = from.split('@')[0];
        
        // Check if user is authorized (owner only for security)
        if (!isOwner(from)) {
            await socket.sendMessage(from, {
                text: `❌ Only the bot owner can use this command.\nOwner: ${config.OWNER_NUMBER}`
            });
            return;
        }
        
        // Check args: .send amount phone
        if (args.length < 2) {
            await socket.sendMessage(from, {
                text: `⚠️ *Usage:* .send <amount> <phone>\n*Example:* .send 50 254743982206\n\n*Supported formats:*\n• 2547xxxxxxxx (Safaricom)\n• 2541xxxxxxxx (Airtel)\n• 07xxxxxxxx\n• 7xxxxxxxx`
            });
            return;
        }
        
        const amount = parseFloat(args[0]);
        const phone = args[1];
        
        if (isNaN(amount) || amount <= 0) {
            await socket.sendMessage(from, {
                text: `❌ Invalid amount. Please enter a valid number greater than 0.\n*Example:* .send 50 254743982206`
            });
            return;
        }
        
        // Send processing message
        await socket.sendMessage(from, {
            text: `🔄 *Processing STK Push...*\n\n• Amount: KES ${amount}\n• Phone: ${phone}\n• Status: Initiating payment...`
        });
        
        // Initiate STK Push
        const result = await initiateSTKPush(phone, amount, 'WhatsApp User', sender);
        
        if (result.success) {
            await socket.sendMessage(from, {
                text: `✅ *STK Push Initiated!*\n\n• Amount: KES ${amount}\n• Phone: ${phone}\n• Reference: ${result.reference}\n• Status: Payment request sent\n\n📱 Check your phone to enter M-Pesa PIN`
            });
            
            // Schedule status check after 30 seconds
            setTimeout(async () => {
                const status = await checkTransactionStatus(result.reference);
                let statusText = `⏳ *Payment Status* (${result.reference})\n`;
                
                if (status.success && status.data) {
                    statusText += `• Amount: KES ${amount}\n`;
                    statusText += `• Phone: ${phone}\n`;
                    statusText += `• Status: ${status.data.status || 'pending'}\n`;
                    statusText += `• Time: ${new Date().toLocaleTimeString()}`;
                    
                    if (status.data.status === 'success') {
                        statusText = `✅ *PAYMENT SUCCESSFUL!*\n\n${statusText}`;
                    } else if (status.data.status === 'failed') {
                        statusText = `❌ *PAYMENT FAILED*\n\n${statusText}`;
                    }
                } else {
                    statusText += `• Status: Checking...\n• Message: ${status.error || 'Unknown status'}`;
                }
                
                await socket.sendMessage(from, { text: statusText });
            }, 30000);
            
        } else {
            await socket.sendMessage(from, {
                text: `❌ *Payment Failed*\n\n• Amount: KES ${amount}\n• Phone: ${phone}\n• Error: ${result.error}\n\nPlease check:\n1. Phone number format\n2. Sufficient balance\n3. Network connection`
            });
        }
        
    } catch (error) {
        console.error('Send command error:', error);
        await socket.sendMessage(from, {
            text: `❌ Error: ${error.message}\n\nPlease try again or contact support.`
        });
    }
}

// Handle .ping command
async function handlePingCommand(socket, from) {
    try {
        const startTime = Date.now();
        
        // Send initial ping
        await socket.sendMessage(from, {
            text: '🏓 Pinging...'
        });
        
        const endTime = Date.now();
        const latency = endTime - startTime;
        
        // Get bot status
        const activeCount = Array.from(activeSockets.keys()).filter(num => isSessionActive(num)).length;
        
        let statusText = `🏓 *PONG!*\n`;
        statusText += `• Latency: ${latency}ms\n`;
        statusText += `• Status: ✅ Online\n`;
        statusText += `• Active Sessions: ${activeCount}\n`;
        statusText += `• Time: ${new Date().toLocaleTimeString()}\n`;
        statusText += `• PayHero: ${payheroClient ? '✅ Connected' : '❌ Disconnected'}\n`;
        statusText += `• MongoDB: ${mongoConnected ? '✅ Connected' : '❌ Disconnected'}`;
        
        await socket.sendMessage(from, { text: statusText });
        
    } catch (error) {
        console.error('Ping command error:', error);
    }
}

// Handle .payments command
async function handlePaymentsCommand(socket, from, args) {
    try {
        if (!isOwner(from)) {
            await socket.sendMessage(from, {
                text: `❌ Only the bot owner can view payments.`
            });
            return;
        }
        
        let statusText = `💳 *Recent Payments*\n\n`;
        
        // Show pending transactions
        if (pendingTransactions.size > 0) {
            statusText += `*Pending (${pendingTransactions.size}):*\n`;
            let count = 1;
            for (const [ref, tx] of pendingTransactions) {
                if (count > 5) break; // Show only 5
                statusText += `${count}. KES ${tx.amount} → ${tx.phone}\n   Ref: ${ref.substring(0, 12)}...\n`;
                count++;
            }
            statusText += '\n';
        }
        
        // Show completed transactions
        if (completedTransactions.size > 0) {
            statusText += `*Completed (${completedTransactions.size}):*\n`;
            let count = 1;
            for (const [ref, tx] of completedTransactions) {
                if (count > 5) break; // Show only 5
                const timeAgo = moment(tx.timestamp).fromNow();
                statusText += `${count}. KES ${tx.amount} → ${tx.phone}\n   ${timeAgo} - ${tx.status}\n`;
                count++;
            }
        }
        
        if (pendingTransactions.size === 0 && completedTransactions.size === 0) {
            statusText += `No transactions yet.\nUse: .send <amount> <phone>`;
        }
        
        await socket.sendMessage(from, { text: statusText });
        
    } catch (error) {
        console.error('Payments command error:', error);
    }
}

// Handle .menu command
async function handleMenuCommand(socket, from) {
    try {
        const menuText = `📱 *CLOUD AI BOT MENU*\n\n` +
                        `*💰 PAYMENT COMMANDS:*\n` +
                        `• .send <amount> <phone> - Send STK Push\n` +
                        `• .payments - View recent transactions\n` +
                        `• .ping - Check bot response time\n\n` +
                        `*🛠️ UTILITY COMMANDS:*\n` +
                        `• .menu - Show this menu\n` +
                        `• .help - Show help information\n\n` +
                        `*📞 SUPPORT:*\n` +
                        `• Contact: ${config.OWNER_NUMBER}\n` +
                        `• Channel: https://whatsapp.com/channel/0029Vajvy2kEwEjwAKP4SI0x\n\n` +
                        `*💳 SUPPORTED NUMBERS:*\n` +
                        `• Safaricom: 2547xxxxxxxx\n` +
                        `• Airtel: 2541xxxxxxxx\n\n` +
                        `_Made by Developer Bera_`;
        
        await socket.sendMessage(from, { text: menuText });
        
    } catch (error) {
        console.error('Menu command error:', error);
    }
}

// Handle .help command
async function handleHelpCommand(socket, from) {
    try {
        const helpText = `🆘 *CLOUD AI BOT HELP*\n\n` +
                        `*Quick Start:*\n` +
                        `1. Use .send to initiate payments\n` +
                        `2. Check status with .payments\n` +
                        `3. Test connection with .ping\n\n` +
                        `*Examples:*\n` +
                        `• .send 50 254743982206\n` +
                        `• .send 100 254112345678\n` +
                        `• .ping\n` +
                        `• .payments\n\n` +
                        `*Need Help?*\n` +
                        `Contact: ${config.OWNER_NUMBER}\n\n` +
                        `_Made by Developer Bera_`;
        
        await socket.sendMessage(from, { text: helpText });
        
    } catch (error) {
        console.error('Help command error:', error);
    }
}

// MongoDB Session Management Functions
async function saveSessionToMongoDB(number, sessionData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Not saving inactive session to MongoDB: ${sanitizedNumber}`);
            return false;
        }

        // Validate session data
        if (!sessionData || !sessionData.me || !sessionData.myAppStateKeyId) {
            console.warn(`⚠️ Invalid session data: ${sanitizedNumber}`);
            return false;
        }

        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            {
                sessionData: sessionData,
                status: 'active',
                updatedAt: new Date(),
                lastActive: new Date(),
                health: sessionHealth.get(sanitizedNumber) || 'active'
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Session saved to MongoDB: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB save failed for ${number}:`, error.message);
        pendingSaves.set(number, {
            data: sessionData,
            timestamp: Date.now()
        });
        return false;
    }
}

async function loadSessionFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        const session = await Session.findOne({ 
            number: sanitizedNumber,
            status: { $ne: 'deleted' }
        });

        if (session) {
            console.log(`✅ Session loaded from MongoDB: ${sanitizedNumber}`);
            return session.sessionData;
        }

        return null;
    } catch (error) {
        console.error(`❌ MongoDB load failed for ${number}:`, error.message);
        return null;
    }
}

// Create necessary directories
function initializeDirectories() {
    const dirs = [
        config.SESSION_BASE_PATH,
        './temp'
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created directory: ${dir}`);
        }
    });
}

initializeDirectories();

// Check if command is from owner
function isOwner(sender) {
    const senderNumber = sender.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    const ownerNumber = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    return senderNumber === ownerNumber;
}

// **SESSION MANAGEMENT**

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

// Check if socket is ready for operations
function isSocketReady(socket) {
    if (!socket) return false;
    return socket.ws && socket.ws.readyState === socket.ws.OPEN;
}

async function saveSessionLocally(number, sessionData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Skipping local save for inactive session: ${sanitizedNumber}`);
            return false;
        }

        const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);

        await fs.ensureDir(sessionPath);

        await fs.writeFile(
            path.join(sessionPath, 'creds.json'),
            JSON.stringify(sessionData, null, 2)
        );

        console.log(`💾 Active session saved locally: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to save session locally for ${number}:`, error);
        return false;
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        // Try MongoDB
        const sessionData = await loadSessionFromMongoDB(sanitizedNumber);

        if (sessionData) {
            // Save to local for running bot
            await saveSessionLocally(sanitizedNumber, sessionData);
            console.log(`✅ Restored session from MongoDB: ${sanitizedNumber}`);
            return sessionData;
        }

        return null;
    } catch (error) {
        console.error(`❌ Session restore failed for ${number}:`, error.message);
        return null;
    }
}

// Helper function to get message text
function getMessageText(msg) {
    if (!msg.message) return '';
    
    // Check different message types
    if (msg.message.conversation) {
        return msg.message.conversation;
    }
    if (msg.message.extendedTextMessage?.text) {
        return msg.message.extendedTextMessage.text;
    }
    if (msg.message.buttonsResponseMessage?.selectedButtonId) {
        return msg.message.buttonsResponseMessage.selectedButtonId;
    }
    if (msg.message.templateButtonReplyMessage?.selectedId) {
        return msg.message.templateButtonReplyMessage.selectedId;
    }
    
    return '';
}

// **COMMAND HANDLERS**
function setupCommandHandlers(socket, number) {
    console.log(`✅ Command handlers setup for ${number}`);
    
    socket.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast') return;

            const from = msg.key.remoteJid;
            const text = getMessageText(msg);
            
            if (!text || text.trim() === '') return;

            console.log(`📩 Message from ${from}: "${text}"`);
            
            // Check if message starts with command prefix
            if (!text.startsWith(config.PREFIX)) {
                console.log(`⏭️ Not a command: ${text}`);
                return;
            }

            const args = text.slice(config.PREFIX.length).trim().split(/ +/);
            const command = args.shift()?.toLowerCase();

            console.log(`🎯 Command detected: ${command} with args:`, args);

            // Handle commands
            switch (command) {
                case 'send':
                    console.log(`📤 Handling send command from ${from}`);
                    await handleSendCommand(socket, from, args);
                    break;
                    
                case 'ping':
                    console.log(`🏓 Handling ping command from ${from}`);
                    await handlePingCommand(socket, from);
                    break;
                    
                case 'payments':
                case 'tx':
                    console.log(`💰 Handling payments command from ${from}`);
                    await handlePaymentsCommand(socket, from, args);
                    break;
                    
                case 'menu':
                    console.log(`📱 Handling menu command from ${from}`);
                    await handleMenuCommand(socket, from);
                    break;
                    
                case 'help':
                    console.log(`🆘 Handling help command from ${from}`);
                    await handleHelpCommand(socket, from);
                    break;
                    
                default:
                    console.log(`❓ Unknown command: ${command}`);
                    // Send unknown command response
                    await socket.sendMessage(from, {
                        text: `❓ Unknown command: ${command}\nType ".menu" for available commands.`
                    });
                    break;
            }
        } catch (error) {
            console.error('❌ Error in message handler:', error);
        }
    });
}

// Status handlers (keep auto-view and auto-like)
async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

        try {
            if (config.AUTO_RECORDING === 'true' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            if (config.AUTO_VIEW_STATUS === 'true') {
                try {
                    await socket.readMessages([message.key]);
                    console.log('👀 Auto-viewed status');
                } catch (error) {
                    console.warn('Failed to view status:', error.message);
                }
            }

            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                try {
                    await socket.sendMessage(
                        message.key.remoteJid,
                        { react: { text: randomEmoji, key: message.key } },
                        { statusJidList: [message.key.participant] }
                    );
                    console.log(`👍 Reacted to status with ${randomEmoji}`);
                } catch (error) {
                    console.warn('Failed to react to status:', error.message);
                }
            }
        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}

function setupAutoRestart(socket, number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        sessionConnectionStatus.set(sanitizedNumber, connection);

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message || '';
            
            console.log(`🔌 Connection closed for ${sanitizedNumber}: ${errorMessage}`);
            
            disconnectionTime.set(sanitizedNumber, Date.now());
            sessionHealth.set(sanitizedNumber, 'disconnected');
            sessionConnectionStatus.set(sanitizedNumber, 'closed');

            // Don't auto-reconnect - let user manually reconnect
            console.log(`⏸️ Session ${sanitizedNumber} disconnected. Please reconnect manually.`);
            
        } else if (connection === 'open') {
            console.log(`✅ Connection open: ${sanitizedNumber}`);
            sessionHealth.set(sanitizedNumber, 'active');
            sessionConnectionStatus.set(sanitizedNumber, 'open');
            reconnectionAttempts.delete(sanitizedNumber);
            disconnectionTime.delete(sanitizedNumber);
            
            // Save session after successful connection
            setTimeout(async () => {
                try {
                    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
                    const credsPath = path.join(sessionPath, 'creds.json');
                    
                    if (fs.existsSync(credsPath)) {
                        const fileContent = await fs.readFile(credsPath, 'utf8');
                        const credData = JSON.parse(fileContent);
                        await saveSessionToMongoDB(sanitizedNumber, credData);
                    }
                } catch (error) {
                    console.error(`Failed to save session for ${sanitizedNumber}:`, error);
                }
            }, 5000);
        }
    });
}

// Format message helper
function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

// **MAIN PAIRING FUNCTION**
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    console.log(`🔄 Connecting: ${sanitizedNumber}`);

    try {
        await fs.ensureDir(sessionPath);

        // Try to restore session
        const restoredCreds = await restoreSession(sanitizedNumber);
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();
        const logger = pino({ level: 'silent' });

        const socket = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari'),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            syncFullHistory: false,
            generateHighQualityLinkPreview: false,
        });

        socketCreationTime.set(sanitizedNumber, Date.now());
        sessionHealth.set(sanitizedNumber, 'connecting');
        sessionConnectionStatus.set(sanitizedNumber, 'connecting');

        // Setup handlers
        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupAutoRestart(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            try {
                await delay(1500);
                const code = await socket.requestPairingCode(sanitizedNumber, "CLOUD_AI");
                console.log(`📱 Generated pairing code for ${sanitizedNumber}: ${code}`);
                
                if (!res.headersSent) {
                    res.send({ code });
                }
                return socket;
            } catch (error) {
                console.error(`❌ Pairing code generation failed:`, error.message);
                if (!res.headersSent) {
                    res.status(400).send({ error: 'Failed to generate pairing code' });
                }
                throw error;
            }
        }

        socket.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                
                if (isSessionActive(sanitizedNumber)) {
                    try {
                        const fileContent = await fs.readFile(
                            path.join(sessionPath, 'creds.json'),
                            'utf8'
                        );
                        const credData = JSON.parse(fileContent);
                        await saveSessionToMongoDB(sanitizedNumber, credData);
                    } catch (error) {
                        console.error(`Failed to save credentials:`, error);
                    }
                }
            } catch (error) {
                console.error(`❌ Failed to save credentials:`, error);
            }
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if (connection === 'open') {
                try {
                    await delay(3000);
                    const userJid = jidNormalizedUser(socket.user.id);

                    // Update about status
                    try {
                        await socket.updateProfileStatus('CLOUD AI - https://up-tlm1.onrender.com/');
                        console.log(`✅ Updated About status`);
                    } catch (error) {
                        console.error('Failed to update About status:', error);
                    }

                    activeSockets.set(sanitizedNumber, socket);
                    sessionHealth.set(sanitizedNumber, 'active');
                    sessionConnectionStatus.set(sanitizedNumber, 'open');
                    disconnectionTime.delete(sanitizedNumber);
                    restoringNumbers.delete(sanitizedNumber);

                    // Send connection success message
                    const connectionMessage = `✅ *CLOUD AI CONNECTED*\n\n` +
                                            `• Number: ${sanitizedNumber}\n` +
                                            `• Status: ✅ Connected\n` +
                                            `• PayHero: ${payheroClient ? '✅ Ready' : '❌ Offline'}\n` +
                                            `• Storage: ${mongoConnected ? '✅ MongoDB' : '❌ Local'}\n\n` +
                                            `*AVAILABLE COMMANDS:*\n` +
                                            `• .menu - Show all commands\n` +
                                            `• .send <amount> <phone> - Send payment\n` +
                                            `• .ping - Test connection\n` +
                                            `• .payments - View transactions\n` +
                                            `• .help - Get assistance\n\n` +
                                            `_Made by Developer Bera_`;

                    await socket.sendMessage(userJid, { text: connectionMessage });

                    // Save number to list
                    try {
                        let numbers = [];
                        if (fs.existsSync(config.NUMBER_LIST_PATH)) {
                            numbers = JSON.parse(await fs.readFile(config.NUMBER_LIST_PATH, 'utf8'));
                        }
                        if (!numbers.includes(sanitizedNumber)) {
                            numbers.push(sanitizedNumber);
                            await fs.writeFile(config.NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
                        }
                    } catch (error) {
                        console.error('Failed to save number:', error);
                    }

                    console.log(`✅ Session fully connected and active: ${sanitizedNumber}`);
                } catch (error) {
                    console.error('❌ Connection setup error:', error);
                }
            }
        });

        return socket;
    } catch (error) {
        console.error(`❌ Pairing error for ${sanitizedNumber}:`, error);
        
        sessionHealth.set(sanitizedNumber, 'failed');
        sessionConnectionStatus.set(sanitizedNumber, 'failed');
        disconnectionTime.set(sanitizedNumber, Date.now());
        restoringNumbers.delete(sanitizedNumber);

        if (!res.headersSent) {
            res.status(503).send({ 
                error: 'Connection Failed', 
                message: error.message || 'Unknown error',
                details: 'Please try again with a different number or check your internet connection'
            });
        }
        throw error;
    }
}

// **API ROUTES**

router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    if (activeSockets.has(sanitizedNumber)) {
        const isActive = isSessionActive(sanitizedNumber);
        return res.status(200).send({
            status: isActive ? 'already_connected' : 'disconnected',
            message: isActive ? 'This number is already connected' : 'Session is disconnected',
            health: sessionHealth.get(sanitizedNumber) || 'unknown',
            connectionStatus: sessionConnectionStatus.get(sanitizedNumber) || 'unknown'
        });
    }

    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    const activeNumbers = [];
    const healthData = {};

    for (const [number, socket] of activeSockets) {
        if (isSessionActive(number)) {
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
        health: healthData,
        storage: `MongoDB (${mongoConnected ? 'Connected' : 'Not Connected'})`,
        payhero_status: payheroClient ? 'Connected' : 'Not connected'
    });
});

router.get('/ping', (req, res) => {
    const activeCount = Array.from(activeSockets.keys()).filter(num => isSessionActive(num)).length;

    res.status(200).send({
        status: 'active',
        message: 'CLOUD AI WhatsApp Bot is running',
        activeSessions: activeCount,
        totalSockets: activeSockets.size,
        storage: `MongoDB (${mongoConnected ? 'Connected' : 'Not Connected'})`,
        payhero: payheroClient ? 'Connected' : 'Not connected'
    });
});

// STK PUSH API ENDPOINTS
router.post('/stk-push', async (req, res) => {
    try {
        const { phone_number, amount, customer_name } = req.body;
        
        if (!phone_number || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Phone number and amount are required'
            });
        }
        
        const result = await initiateSTKPush(phone_number, amount, customer_name, 'api');
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
        
    } catch (error) {
        console.error('API STK Push error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to initiate STK push'
        });
    }
});

router.get('/transaction-status/:reference', async (req, res) => {
    try {
        const { reference } = req.params;
        
        if (!reference) {
            return res.status(400).json({
                success: false,
                error: 'Transaction reference is required'
            });
        }
        
        const result = await checkTransactionStatus(reference);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
        
    } catch (error) {
        console.error('API Status check error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to check transaction status'
        });
    }
});

// Initialize MongoDB on startup
initializeMongoDB().then(() => {
    console.log('📊 System initialized successfully');
    console.log(`📋 Configuration:
  - Owner: ${config.OWNER_NUMBER}
  - PayHero: ${payheroClient ? 'Connected' : 'Not connected'}
  - MongoDB: ${mongoConnected ? 'Connected' : 'Not connected'}
  - Commands: .menu, .send, .ping, .payments, .help
  - Auto-features: View Status, Like Status, Recording
  - Version: Cloud AI v2.0
    `);
});

// Export the router
module.exports = router;
//[file content end]
