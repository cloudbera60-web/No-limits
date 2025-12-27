import config from '../config.cjs';

let typingInterval;

const startFakeTyping = async (Matrix, chatId) => {
  if (!config.AUTO_TYPING || typingInterval) return;
  
  typingInterval = setInterval(async () => {
    // Random typing duration between 3-8 seconds
    const duration = 3000 + Math.random() * 5000;
    
    await Matrix.sendPresenceUpdate('composing', chatId);
    await new Promise(resolve => setTimeout(resolve, duration));
    await Matrix.sendPresenceUpdate('paused', chatId);
    
    // Random break before next typing session
    await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 10000));
  }, 15000); // Check every 15 seconds
};

const autotypingCommand = async (m, Matrix) => {
  const botNumber = await Matrix.decodeJid(Matrix.user.id);
  const isCreator = [botNumber, config.OWNER_NUMBER + '@s.whatsapp.net'].includes(m.sender);
  const command = m.body.trim().toLowerCase();

  if (command === 'autotyping on' || command === 'autotyping off') {
    if (!isCreator) return m.reply("*🚫 OWNER ONLY*");

    config.AUTO_TYPING = command === 'autotyping on';
    
    if (config.AUTO_TYPING) {
      startFakeTyping(Matrix, m.from);
      await Matrix.sendMessage(m.from, {
        text: "⌨️ Fake typing ACTIVATED\n" +
              "Bot will now randomly show typing indicators in chats"
      }, { quoted: m });
    } else {
      clearInterval(typingInterval);
      typingInterval = null;
      await Matrix.sendMessage(m.from, {
        text: "🚫 Fake typing DEACTIVATED"
      }, { quoted: m });
    }
  }
};

// Activate on incoming messages
export const handleIncoming = async (m, Matrix) => {
  if (config.AUTO_TYPING && !typingInterval) {
    startFakeTyping(Matrix, m.from);
  }
};

export default autotypingCommand;
