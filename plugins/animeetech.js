import axios from 'axios';
import config from '../../config.cjs';

const animeQuote = async (m, sock) => {
  const triggers = ['animequote', 'aq'];
  const match = triggers.find(trigger => m.body?.toLowerCase().startsWith(trigger));

  if (match) {
    try {
      // Try AnimeChan API first (free)
      const { data } = await axios.get('https://animechan.xyz/api/random');
      
      await sock.sendMessage(m.from, {
        text: `🎌 *${data.anime}* (${data.character})\n\n"${data.quote}"`,
        footer: `Powered by ${config.BOT_NAME}`,
        mentions: [m.sender]
      }, { quoted: m });

    } catch (error) {
      // Fallback to ZenQuotes API if AnimeChan fails
      try {
        const { data } = await axios.get('https://animechan.xyz/api/random');
        const quote = data[0].q;
        const character = data[0].a;
        
        await sock.sendMessage(m.from, {
          text: `🎌 Random Anime Quote\n\n"${quote}"\n\n- ${character}`,
          footer: `Fallback API | ${config.BOT_NAME}`,
          mentions: [m.sender]
        }, { quoted: m });

      } catch (err) {
        await sock.sendMessage(m.from, {
          text: '❌ Failed to fetch quotes. Try again later!',
          mentions: [m.sender]
        }, { quoted: m });
      }
    }
  }
};

export default animeQuote;
