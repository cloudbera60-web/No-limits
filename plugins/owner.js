const ownerContact = async (m, gss) => {
    const ownernumber = process.env.OWNER_NUMBER;
    const prefix = process.env.BOT_PREFIX || '.';
    const cmd = m.body.startsWith(prefix) ? m.body.slice(prefix.length).split(' ')[0].toLowerCase() : '';
    const text = m.body.slice(prefix.length + cmd.length).trim();

    if (cmd === 'owner') {
        try {
            const contactMsg = {
                contacts: {
                    displayName: 'Bot Owner',
                    contacts: [{
                        displayName: process.env.OWNER_NAME || 'Gifted Tech',
                        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${process.env.OWNER_NAME || 'Gifted Tech'}\nFN:${process.env.OWNER_NAME || 'Gifted Tech'}\nitem1.TEL;waid=${ownernumber}:${ownernumber}\nitem1.X-ABLabel:Click here to chat\nEND:VCARD`
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
};

module.exports = ownerContact;
