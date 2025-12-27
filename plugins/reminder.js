const reminderPlugin = async (m, sock) => {
  const triggers = ['remind', 'alert'];
  const match = triggers.find(trigger => m.body?.toLowerCase().startsWith(trigger));

  if (match) {
    const text = m.body.slice(match.length).trim();
    const [timeStr, ...message] = text.split(' ');
    const minutes = parseInt(timeStr);

    setTimeout(async () => {
      await sock.sendMessage(m.from, { 
        text: `⏰ *Reminder:* ${message.join(' ')}` 
      }, { quoted: m });
    }, minutes * 60000);

    await sock.sendMessage(m.from, { 
      text: `✅ I'll remind you in ${minutes} minutes!` 
    }, { quoted: m });
  }
};
export default reminderPlugin;
