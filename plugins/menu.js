// plugins/menu.js - Fixed version
const moment = require('moment-timezone');

// Create a simple user stats function
const getUserStats = async (user) => {
    // Return dummy stats - you can implement real stats here
    return { 
        menuCount: Math.floor(Math.random() * 100) + 1,
        lastUsed: moment().format('YYYY-MM-DD HH:mm:ss')
    };
};

// Menu handler function
const menu = async (m, Matrix) => {
    try {
        console.log(`📋 Menu command received from ${m.sender}`);
        
        const currentTime = moment().format('HH');
        let greeting = "Good Day";
        if (currentTime < 12) greeting = "Good Morning";
        else if (currentTime < 18) greeting = "Good Afternoon";
        else greeting = "Good Evening";

        const lastUpdated = moment().format('LLLL');
        const userStats = await getUserStats(m.sender);

        const mainMenu = `
✨ *Welcome to Mercedes Mini Bot!* ✨

🖐️ ${greeting}, ${m.pushName || 'User'}! 🎉

📅 *Last Updated:* ${lastUpdated}
📊 *Your Stats:* Used ${userStats.menuCount} times today

🎯 *MAIN COMMANDS:*
• .menu - Show this menu
• .ping - Check bot latency
• .alive - Check bot status
• .owner - Contact owner

📥 *DOWNLOAD MENU:*
• .apk - Download APK files
• .play - Search Play Store
• .video - Download videos
• .song - Download songs
• .ytmp3 - YouTube to MP3
• .ytmp4 - YouTube to MP4

🤖 *AI MENU:*
• .ai - Chat with AI
• .gemini - Google Gemini AI
• .dalle - Image generation

🛠️ *TOOLS MENU:*
• .calculator - Calculator
• .tempmail - Temporary email
• .tts - Text to speech
• .shorten - URL shortener

👥 *GROUP MENU:*
• .groupinfo - Group information
• .hidetag - Hidden tag
• .tagall - Tag all members
• .antilink - Anti-link settings

⚡ *AUTO FEATURES:*
✅ Auto-view status
✅ Auto-like status
✅ Auto-newsletter reactions
✅ Auto-session management

💾 *STORAGE:* MongoDB Atlas
🔄 *AUTO-RECONNECT:* Enabled
🧹 *AUTO-CLEANUP:* Inactive sessions

📞 *OWNER:* 254740007567
🌐 *WEBSITE:* https://up-tlm1.onrender.com/

📌 *TIP:* Use . before any command (e.g., .menu)`;

        const menuImageUrl = 'https://i.ibb.co/zhm2RF8j/vision-v.jpg';

        // Try to send with image first
        try {
            await Matrix.sendMessage(m.from, {
                image: { url: menuImageUrl },
                caption: mainMenu,
                contextInfo: { 
                    mentionedJid: [m.sender],
                    forwardingScore: 999,
                    isForwarded: false
                }
            });
            console.log(`✅ Menu sent with image to ${m.sender}`);
        } catch (imageError) {
            console.log(`⚠️ Image failed, sending text-only menu to ${m.sender}:`, imageError.message);
            
            // Fallback to text only
            await Matrix.sendMessage(m.from, {
                text: mainMenu,
                contextInfo: { 
                    mentionedJid: [m.sender],
                    forwardingScore: 999,
                    isForwarded: false
                }
            });
            console.log(`✅ Text menu sent to ${m.sender}`);
        }
        
    } catch (error) {
        console.error('❌ Error in menu plugin:', error);
        
        // Try to send error message
        try {
            await Matrix.sendMessage(m.from, {
                text: `❌ Error displaying menu: ${error.message}\n\nPlease try again or contact owner.`
            });
        } catch (e) {
            console.error('Failed to send error message:', e);
        }
    }
};

// Export the menu function
module.exports = menu;
