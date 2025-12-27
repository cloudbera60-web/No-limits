import config from '../config.cjs';
import { format, formatDistanceToNow } from 'date-fns';

const juiceQuotes = [
  "999 forever 🦋",
  "Demons in my head 😈",
  "Legends never die 🌙",
  "Empty thoughts 🌀"
];

let startTime = new Date();
let bioInterval;

const updateBio = async (Matrix) => {
  try {
    const runtime = formatDistanceToNow(startTime);
    const dateStr = format(new Date(), 'MMM dd, yyyy');
    const quote = juiceQuotes[Math.floor(Math.random() * juiceQuotes.length)];
    
    await Matrix.updateProfileStatus(`${quote}\n⏱️ ${runtime} | 📅 ${dateStr}`);
    console.log('Bio updated');
  } catch (error) {
    console.error('Bio update failed:', error);
  }
};

const autobioCommand = async (m, Matrix) => {
  const allowedUsers = [
    await Matrix.decodeJid(Matrix.user.id), // Bot
    config.OWNER_NUMBER + '@s.whatsapp.net' // Owner
  ];

  if (!m.body.toLowerCase().startsWith('autobio')) return;
  if (!allowedUsers.includes(m.sender)) return;

  const command = m.body.toLowerCase().split(' ')[1];

  if (command === 'on') {
    config.AUTO_BIO = true;
    await updateBio(Matrix);
    bioInterval = setInterval(() => updateBio(Matrix), 30 * 60 * 1000);
    await m.reply("✨ Auto-Bio ACTIVATED");
  } 
  else if (command === 'off') {
    config.AUTO_BIO = false;
    clearInterval(bioInterval);
    await m.reply("🚫 Auto-Bio DEACTIVATED");
  }
};

// Initialize if enabled in config
if (config.AUTO_BIO) {
  bioInterval = setInterval(() => updateBio(Matrix), 30 * 60 * 1000);
}

export default autobioCommand;
