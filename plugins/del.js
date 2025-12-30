const DeleteChat = async (m, Matrix) => {
  try {
    // This plugin works without prefix - only for bot's own messages
    const body = m.body ? m.body.toLowerCase() : '';
    const triggers = ['deletechat', 'delchat', 'dchat', 'clearchat', 'cleanchat'];
    
    // Check if it's one of the trigger words AND the message is from the bot itself
    if (!triggers.includes(body) || !m.key || !m.key.fromMe) return;

    await Matrix.chatModify(
      {
        delete: true,
        lastMessages: [{ key: m.key, messageTimestamp: m.messageTimestamp }],
      },
      m.chat
    );

    await m.react('✅');
    await m.reply(`✅ *${process.env.BOT_NAME || 'GIFTED-MD'}* has successfully deleted this chat from your view.`);
  } catch (e) {
    console.error('DeleteChat Error:', e);
    await m.reply('❌ *Failed to delete this chat.*');
    await m.react('❌');
  }
};

module.exports = DeleteChat;
