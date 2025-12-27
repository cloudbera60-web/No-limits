const BanUser = async (m, { conn }) => {
  const body = m.body.toLowerCase();
  if (!body.startsWith("ban") || !m.key.fromMe) return;

  const who = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
  if (!who) return m.reply("✳️ *Tag or mention someone to ban.*\n\nExample: ban @user");

  global.db.data.users[who].banned = true;

  await conn.sendMessage(m.chat, {
    text: `✅ *User Banned Successfully*\n\n@${who.split("@")[0]} will no longer be able to use my commands.`,
    mentions: [who]
  });

  await m.react("✅");
};

export default BanUser;
