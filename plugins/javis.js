import axios from 'axios';

const javisToggles = {}; // key: chat ID, value: boolean

const javisHandler = async (m, Matrix) => {
  const chatId = m.isGroup ? m.chat : m.sender;
  const body = m.body.trim();

  // Toggle
  if (body.toLowerCase() === 'javis on') {
    javisToggles[chatId] = true;
    return m.reply('Javis has been activated.');
  }

  if (body.toLowerCase() === 'javis off') {
    javisToggles[chatId] = false;
    return m.reply('Javis has been deactivated.');
  }

  // Skip if not toggled on
  if (!javisToggles[chatId]) return;

  // Trigger check (non-prefix, case-insensitive)
  const lowerBody = body.toLowerCase();
  if (!lowerBody.startsWith('javis')) return;

  const query = body.slice(5).trim(); // remove "javis"
  if (!query) return m.reply('Yes?');

  try {
    await m.React('⏳');

    const res = await axios.get(`https://bk9.fun/ai/jeeves-chat2?q=${encodeURIComponent(query)}`);
    const result = res.data?.response || 'No response from Javis.';

    await m.reply(result);
    await m.React('✅');
  } catch (err) {
    console.error('Javis Error:', err.message);
    await m.reply('Javis encountered an error.');
    await m.React('❌');
  }
};

export default javisHandler;
