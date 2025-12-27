import config from '../config.cjs';

const antitaggroup = async (m, Matrix) => {
    if (!m.from.endsWith('@g.us')) return; // Group chats only

    const text = m.body?.toLowerCase()?.trim() || '';
    const isOwner = [config.OWNER_NUMBER + '@s.whatsapp.net'].includes(m.sender);
    const isBot = m.sender === Matrix.user.id.split(':')[0] + '@s.whatsapp.net';

    // Initialize
    if (!global.antitaggroup) global.antitaggroup = {};
    if (!global.antitaggroup[m.from]) {
        global.antitaggroup[m.from] = {
            active: false,
            strictMode: false // Added for status tagging protection
        };
    }

    // Command Handling
    if (text === 'antitaggroup on') {
        if (!isOwner && !isBot) return;
        global.antitaggroup[m.from].active = true;
        return Matrix.sendMessage(m.from, { 
            text: '🛡️ *Group Protection Activated*\n- Blocks invite links\n- Blocks status tagging'
        });
    }

    if (text === 'antitaggroup strict') {
        if (!isOwner && !isBot) return;
        global.antitaggroup[m.from].strictMode = true;
        return Matrix.sendMessage(m.from, { 
            text: '🔐 *Strict Mode Activated*\nWill now remove users who tag groups from status'
        });
    }

    if (text === 'antitaggroup off') {
        if (!isOwner && !isBot) return;
        global.antitaggroup[m.from].active = false;
        return Matrix.sendMessage(m.from, { text: '🔓 Protection deactivated' });
    }

    // Protection Logic
    if (!global.antitaggroup[m.from].active) return;

    // 1. Detect WhatsApp invite links
    const inviteLinkPattern = /(chat|invite)\.whatsapp\.com\/(?:invite\/)?[a-zA-Z0-9_-]+/i;
    const hasInviteLink = inviteLinkPattern.test(text);

    // 2. Detect status tagging (@group mention)
    const isStatusTag = m.mentionedJid?.some(jid => jid.endsWith('@g.us'));

    if ((hasInviteLink || isStatusTag) && !isOwner && !isBot) {
        try {
            // Delete the offending message
            await Matrix.sendMessage(m.from, { delete: m.key });
            
            // Remove user (with strict mode or for any invite link)
            if (global.antitaggroup[m.from].strictMode || hasInviteLink) {
                await Matrix.groupParticipantsUpdate(m.from, [m.sender], 'remove');
            }
            
            // Send warning
            await Matrix.sendMessage(m.from, {
                text: `🚨 @${m.sender.split('@')[0]} ${hasInviteLink ? 'shared group link' : 'tagged group from status'}!`,
                mentions: [m.sender]
            });
            
        } catch (error) {
            console.error('Protection action failed:', error);
        }
    }
};

export default antitaggroup;
