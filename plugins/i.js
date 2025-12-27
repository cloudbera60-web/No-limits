import fetch from 'node-fetch';

const TextEffect = async (m, { conn, text }) => {
  if (!m.key.fromMe) return;

  const command = m.body?.toLowerCase().trim();
  const botName = 'Core AI';
  const wait = '⏳';
  const done = '✅';

  const noText = `✳️ Please provide some text.\n\n📌 Example: *${command}* FG98`;
  const needsPlus = `✳️ Use *+* to separate parts\n\n📌 Example:\n*${command}* fgmods *+* ${botName}`;

  await m.react(wait);

  let url;
  switch (command) {
    case 'logololi':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/maker/loli', { text }, 'apikey');
      break;
    case 'neon':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/neon', { text }, 'apikey');
      break;
    case 'devil':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/devil', { text }, 'apikey');
      break;
    case 'transformer':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/transformers', { text }, 'apikey');
      break;
    case 'thunder':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/thunder', { text }, 'apikey');
      break;
    case 'graffiti':
      if (!text.includes('+')) throw needsPlus;
      var [a, b] = text.split`+`;
      url = global.API('fgmods', '/api/textpro/graffiti', { text: a, text2: b }, 'apikey');
      break;
    case 'bpink':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/blackpink', { text }, 'apikey');
      break;
    case 'joker':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/joker', { text }, 'apikey');
      break;
    case 'matrix':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/matrix', { text }, 'apikey');
      break;
    case 'wolf':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/logowolf', { text: 'FG98', text2: text }, 'apikey');
      break;
    case 'glow':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/advancedglow', { text }, 'apikey');
      break;
    case 'phlogo':
      if (!text.includes('+')) throw needsPlus;
      var [c, d] = text.split`+`;
      url = global.API('fgmods', '/api/textpro/pornhub', { text: c, text2: d }, 'apikey');
      break;
    case 'ballon':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/ballon', { text }, 'apikey');
      break;
    case 'dmd':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/diamond', { text }, 'apikey');
      break;
    case 'lightglow':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/lightglow', { text }, 'apikey');
      break;
    case 'american':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/American-flag', { text }, 'apikey');
      break;
    case 'halloween':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/halloween', { text }, 'apikey');
      break;
    case 'green':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/green-horror', { text }, 'apikey');
      break;
    case 'glitch':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/impressive-glitch', { text }, 'apikey');
      break;
    case 'paper':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/art-paper-cut', { text }, 'apikey');
      break;
    case 'marvel':
      if (!text.includes('+')) throw needsPlus;
      var [e, f] = text.split`+`;
      url = global.API('fgmods', '/api/textpro/marvel', { text: e, text2: f }, 'apikey');
      break;
    case 'ninja':
      if (!text.includes('+')) throw needsPlus;
      var [g, h] = text.split`+`;
      url = global.API('fgmods', '/api/textpro/ninja', { text: g, text2: h }, 'apikey');
      break;
    case 'future':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/futuristic', { text }, 'apikey');
      break;
    case '3dbox':
      if (!text) throw noText;
      url = global.API('fgmods', '/api/textpro/3dboxtext', { text }, 'apikey');
      break;
    case 'graffiti2':
      if (!text.includes('+')) throw needsPlus;
      var [i, j] = text.split`+`;
      url = global.API('fgmods', '/api/textpro/graffiti2', { text: i, text2: j }, 'apikey');
      break;
    default:
      return;
  }

  if (url) {
    await conn.sendFile(m.chat, url, 'effect.png', `✅ Here you go!\nFrom *${botName}*`, m);
    await m.react(done);
  }
};

TextEffect.customPrefix = /^(logololi|graffiti2|3dbox|future|ninja|marvel|paper|glitch|neon|green|halloween|american|devil|wolf|phlogo|transformer|thunder|graffiti|bpink|joker|matrix|glow|ballon|dmd|lightglow)$/i;
TextEffect.command = new RegExp(); // disables prefix-based commands
TextEffect.diamond = true;

export default TextEffect;
