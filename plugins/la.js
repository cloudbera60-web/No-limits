const DeleteChat = async (m, Matrix) => {
  const body = m.body.toLowerCase();
  const triggers = ['deletechat', 'delchat', 'dchat', 'clearchat', 'cleanchat'];
  if (!triggers.includes(body) || !m.key.fromMe) return;

  try {
    await Matrix.chatModify(
      {
        delete: true,
        lastMessages: [{ key: m.key, messageTimestamp: m.messageTimestamp }],
      },
      m.chat
    );

    await m.react('✅');
    await m.reply('✅ *Silva MD* has successfully deleted this chat from your view.');
  } catch (e) {
    console.error('DeleteChat Error:', e);
    await m.reply('❌ *Failed to delete this chat.*');
    await m.react('❌');
  }
};

export default DeleteChat;
