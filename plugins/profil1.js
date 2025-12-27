import axios from 'axios';

const apiBaseUrl = 'https://cloud-tech-tces.onrender.com'; // Your API endpoint

const getPairingCode = async (m, Matrix) => {
  const textRaw = m.body.trim();
  const [cmdRaw, ...rest] = textRaw.split(' ');
  const cmd = cmdRaw.toLowerCase();
  const text = rest.join(' ').trim();

  const validCommands = ['pair', 'getsession', 'paircode', 'pairingcode'];

  if (validCommands.includes(cmd)) {
    if (!text) return m.reply('Please provide a phone number with country code.');

    const phoneNumberMatch = text.match(/^(\+\d{1,3})(\d+)$/);
    if (!phoneNumberMatch) return m.reply('Please provide a valid phone number with country code.');

    const countryCode = phoneNumberMatch[1];
    const phoneNumber = phoneNumberMatch[2];

    try {
      await m.React('🕘');

      const response = await axios.post(apiBaseUrl, {
        phoneNumber: countryCode + phoneNumber
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = response.data;

      if (result.pairingCode) {
        const message = `Pairing Code: ${result.pairingCode}\nStatus: ${result.status}`;
        await m.reply(message);
        await m.React('✅');
      } else {
        throw new Error('Invalid response from the server.');
      }
    } catch (error) {
      console.error('Error fetching pairing code:', error.message);
      m.reply('Error fetching pairing code.');
      await m.React('❌');
    }
  }
};

export default getPairingCode;
