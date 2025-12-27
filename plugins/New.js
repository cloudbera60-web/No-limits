import pkg from '@whiskeysockets/baileys';
import config from '../../config.cjs';

const silentKeywords = ['bot', 'help', 'support'];
const keywordReplies = {
  bot: '🛠️ I am your assistant.',
  help: '❓ How can I assist you today?',
  support: '⚙️ For support, please contact the administrator.'
};

const SilentKeywordHandler = async (m, Matrix) => {
  const body = m.body?.trim();
  const sender = m.sender;
  const botUser = `${Matrix.user.id.split('@')[0]}@s.whatsapp.net`;

  // No prefix command
  if (silentKeywords.some(keyword => body.toLowerCase().includes(keyword))) {
    if (![config.OWNER_NUMBER, botUser].includes(sender)) return;

    const matchingKeyword = silentKeywords.find(keyword => body.toLowerCase().includes(keyword));
    await m.reply(keywordReplies[matchingKeyword] || '⚠️ Keyword detected, no response set.');
    await m.React('✅');
  }
};

export default SilentKeywordHandler;
