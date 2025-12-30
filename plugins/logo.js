const axios = require('axios');

const LogoCmd = async (m, Matrix) => {
  const prefix = process.env.BOT_PREFIX || '.';
  const cmd = m.body.startsWith(prefix) ? m.body.slice(prefix.length).split(' ')[0].toLowerCase() : '';
  const text = m.body.slice(prefix.length + cmd.length).trim();

  if (cmd !== 'logo') return;

  const logoTypes = {
    'blackpink': 'https://api.safone.dev/logo?text=',
    'glossysilver': 'https://api.safone.dev/logo?text=',
    'naruto': 'https://api.safone.dev/logo?text=',
    'digitalglitch': 'https://api.safone.dev/logo?text=',
    'pixelglitch': 'https://api.safone.dev/logo?text=',
    'water': 'https://api.safone.dev/logo?text=',
    'bulb': 'https://api.safone.dev/logo?text=',
    'zodiac': 'https://api.safone.dev/logo?text=',
    'water3D': 'https://api.safone.dev/logo?text=',
    'dragonfire': 'https://api.safone.dev/logo?text=',
    'bokeh': 'https://api.safone.dev/logo?text=',
    'queencard': 'https://api.safone.dev/logo?text=',
    'birthdaycake': 'https://api.safone.dev/logo?text=',
    'underwater': 'https://api.safone.dev/logo?text=',
    'glow': 'https://api.safone.dev/logo?text=',
    'wetglass': 'https://api.safone.dev/logo?text=',
    'graffiti': 'https://api.safone.dev/logo?text=',
    'halloween': 'https://api.safone.dev/logo?text=',
    'tattootattoo': 'https://api.safone.dev/logo?text=',
    'luxury': 'https://api.safone.dev/logo?text=',
    'avatar': 'https://api.safone.dev/logo?text=',
    'blood': 'https://api.safone.dev/logo?text=',
    'hacker': 'https://api.safone.dev/logo?text=',
    'paint': 'https://api.safone.dev/logo?text=',
    'rotation': 'https://api.safone.dev/logo?text=',
    'graffiti2': 'https://api.safone.dev/logo?text=',
    'typography': 'https://api.safone.dev/logo?text=',
    'horror': 'https://api.safone.dev/logo?text=',
    'valentine': 'https://api.safone.dev/logo?text=',
    'team': 'https://api.safone.dev/logo?text=',
    'gold': 'https://api.safone.dev/logo?text=',
    'pentakill': 'https://api.safone.dev/logo?text=',
    'galaxy': 'https://api.safone.dev/logo?text=',
    'birthdayflower': 'https://api.safone.dev/logo?text=',
    'pubg': 'https://api.safone.dev/logo?text=',
    'sand3D': 'https://api.safone.dev/logo?text=',
    'wall': 'https://api.safone.dev/logo?text=',
    'womensday': 'https://api.safone.dev/logo?text=',
    'thunder': 'https://api.safone.dev/logo?text=',
    'snow': 'https://api.safone.dev/logo?text=',
    'textlight': 'https://api.safone.dev/logo?text=',
    'sand': 'https://api.safone.dev/logo?text='
  };

  const args = text.split(' ');
  if (args.length < 2) {
    const availableLogos = Object.keys(logoTypes).join(', ');
    return m.reply(`Usage: ${prefix}logo <type> <text>\n\nAvailable types:\n${availableLogos}\n\nExample: ${prefix}logo hacker GIFTED-MD`);
  }

  const logoType = args[0].toLowerCase();
  const logoText = args.slice(1).join(' ');

  if (!logoTypes[logoType]) {
    const availableLogos = Object.keys(logoTypes).join(', ');
    return m.reply(`Invalid logo type. Available types:\n${availableLogos}`);
  }

  try {
    await Matrix.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

    const apiUrl = `https://api.safone.dev/logo?text=${encodeURIComponent(logoText)}&theme=${logoType}`;
    const response = await axios.get(apiUrl);

    if (response.data && response.data.image) {
      await Matrix.sendMessage(m.from, {
        image: { url: response.data.image },
        caption: `> *Logo created for: ${logoText}*\n*Powered by ${process.env.BOT_NAME || 'GIFTED-MD'}*`
      }, { quoted: m });

      await Matrix.sendMessage(m.from, { react: { text: '✅', key: m.key } });
    } else {
      throw new Error('No image returned from API');
    }
  } catch (error) {
    console.error('Logo creation error:', error);
    await m.reply('❌ Failed to create logo. Please try again later.');
    await Matrix.sendMessage(m.from, { react: { text: '❌', key: m.key } });
  }
};

module.exports = LogoCmd;
