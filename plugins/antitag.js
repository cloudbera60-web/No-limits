import config from '../config.cjs';

const antitag = async (m, Matrix) => {
    if (!m.from.endsWith('@g.us')) return; // Only works in groups

    const text = m.body?.toLowerCase()?.trim() || '';
    const isOwner = [config.OWNER_NUMBER + '@s.whatsapp.net'].includes(m.sender);
    const isBot = m.sender === Matrix.user.id.split(':')[0] + '@s.whatsapp.net';

    // Initialize group settings
    if (!global.antitag) global.antitag = {};
    if (!global.antitag[m.from]) global.antitag[m.from] = false;

    // Command handling
    if (text === 'antitag on') {
        if (!isOwner && !isBot) return;
        global.antitag[m.from] = true;
        return Matrix.sendMessage(m.from, { 
            text: '🔒 *Anti-Tag Activated*\nNow blocking mentions of bot/owner'
        });
    }

    if (text === 'antitag off') {
        if (!isOwner && !isBot) return;
        global.antitag[m.from] = false;
        return Matrix.sendMessage(m.from, { text: '🔓 Anti-Tag deactivated' });
    }

    // Protection logic
    if (global.antitag[m.from] && m.mentionedJid?.length) {
        const botNumber = Matrix.user.id.split(':')[0] + '@s.whatsapp.net';
        const ownerNumber = config.OWNER_NUMBER + '@s.whatsapp.net';
        
        // Check if bot or owner is mentioned
        const mentionedProtected = m.mentionedJid.some(jid => 
            jid === botNumber || jid === ownerNumber
        );

        if (mentionedProtected && !isOwner && !isBot) {
            try {
                // 1. Delete the offending message
                await Matrix.sendMessage(m.from, { delete: m.key });
                
                // 2. Send warning
                await Matrix.sendMessage(m.from, {
                    text: `⚠️ @${m.sender.split('@')[0]}! Don't tag ${m.mentionedJid.includes(botNumber) ? 'the bot' : 'the owner'}!`,
                    mentions: [m.sender]
                });
                
                // 3. (Optional) Add warning strike
                if (!global.userWarnings) global.userWarnings = {};
                global.userWarnings[m.sender] = (global.userWarnings[m.sender] || 0) + 1;
                
            } catch (error) {
                console.error('Anti-tag action failed:', error);
            }
        }
    }
};

export default antitag;
