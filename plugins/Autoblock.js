import pkg from '@whiskeysockets/baileys'; const { jidDecode } = pkg; import config from '../../config.cjs';

const AutoBlock = async (m, Matrix) => { const blockedPrefixes = [ '+234' /*Nigeria '+263', // Zimbabwe '+91'   // India*/ ];

// Only act on new chats/messages
Matrix.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.key || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    if (!jid.endsWith('@s.whatsapp.net')) return;

    const number = jid.split('@')[0];

    // If number starts with any of the blocked prefixes
    if (blockedPrefixes.some(prefix => number.startsWith(prefix.replace('+', '')))) {
        try {
            await Matrix.updateBlockStatus(jid, 'block');
            console.log(`Blocked: ${number}`);
            await Matrix.sendMessage(config.ownerJid, {
                text: `Auto-blocked number: +${number}`
            });
        } catch (e) {
            console.error(`Failed to block ${jid}:`, e);
        }
    }
});

};

export default AutoBlock;
