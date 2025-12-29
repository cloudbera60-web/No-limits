const { 
    giftedId,
    removeFile
} = require('../gift');
const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const { startBotInstance } = require('./bot-runner');
const {
    default: giftedConnect,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "session");

router.get('/', async (req, res) => {
    const id = giftedId();
    let responseSent = false;
    let botInstance = null;

    async function GIFTED_QR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));
        
        try {
            let Gifted = giftedConnect({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            Gifted.ev.on('creds.update', saveCreds);
            
            Gifted.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;
                
                if (qr && !responseSent) {
                    const qrImage = await QRCode.toDataURL(qr);
                    if (!res.headersSent) {
                        res.send(`
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <title>GIFTED-MD | QR CODE</title>
                                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                                <style>
                                    /* ... (same CSS as before) ... */
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <h1>GIFTED QR CODE</h1>
                                    <div class="qr-container">
                                        <div class="qr-code pulse">
                                            <img src="${qrImage}" alt="QR Code"/>
                                        </div>
                                    </div>
                                    <p>Scan this QR code with your phone to activate the bot</p>
                                    <p style="color: #ff69b4; font-size: 14px; margin-top: 10px;">
                                        After scanning, the bot will automatically start with all features enabled!
                                    </p>
                                    <a href="./" class="back-btn">Back</a>
                                </div>
                            </body>
                            </html>
                        `);
                        responseSent = true;
                    }
                }

                if (connection === "open") {
                    console.log(`✅ QR connection successful for session: ${id}`);
                    
                    // Start the bot with the authenticated state
                    try {
                        botInstance = await startBotInstance(id, state);
                        
                        // Send success notification
                        await Gifted.sendMessage(Gifted.user.id, {
                            text: `✅ *GIFTED-MD Bot Activated!*\n\nYour bot is now running with full functionality!\n\nUse commands like .menu to get started.\n\nBot ID: ${id}`
                        });
                        
                        // Wait a moment then close the pairing socket
                        await delay(3000);
                        await Gifted.ws.close();
                        
                        // Clean up session directory
                        await removeFile(path.join(sessionDir, id));
                        
                    } catch (botError) {
                        console.error(`❌ Failed to start bot for ${id}:`, botError);
                        
                        await Gifted.sendMessage(Gifted.user.id, {
                            text: `❌ *Bot Startup Failed*\n\nFailed to initialize bot features.\n\nError: ${botError.message}`
                        });
                        
                        await Gifted.ws.close();
                        await removeFile(path.join(sessionDir, id));
                    }
                    
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    await delay(10000);
                    GIFTED_QR_CODE();
                }
            });
        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent) {
                res.status(500).json({ 
                    code: "QR_SERVICE_UNAVAILABLE",
                    message: "QR Service is Currently Unavailable" 
                });
                responseSent = true;
            }
            await removeFile(path.join(sessionDir, id));
        }
    }

    try {
        await GIFTED_QR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await removeFile(path.join(sessionDir, id));
        if (!responseSent) {
            res.status(500).json({ 
                code: "SERVICE_ERROR",
                message: "Service Error" 
            });
        }
    }
});

module.exports = router;
