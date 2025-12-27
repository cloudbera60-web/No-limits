

import fetch from 'node-fetch';
import gTTS from 'node-gtts';
import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = (url = import.meta.url) => join(fileURLToPath(url), '../');

const defaultLang = 'en';
const jarvisStatus = {}; // Keeps status per group

// Toggle command: .jarvis on / off
export const toggleJarvis = async (m, { conn, args, isOwner, reply }) => {
  if (!isOwner) return reply('*Only the owner can toggle Jarvis.*');

  const option = args[0]?.toLowerCase();
  if (option === 'on') {
    jarvisStatus[m.chat] = true;
    return reply('*Jarvis has been enabled in this group.* ✅');
  } else if (option === 'off') {
    jarvisStatus[m.chat] = false;
    return reply('*Jarvis has been disabled in this group.* ❌');
  } else {
    return reply('*Usage: .jarvis on / off*');
  }
};

// Jarvis middleware
export async function before(m, { conn }) {
  if (!m.isGroup) return;
  if (!jarvisStatus[m.chat]) return;
  if (!m.quoted || m.quoted.isBaileys) return;
  if (m.fromMe || m.isBaileys) return;
  if (['protocolMessage', 'pollUpdateMessage', 'reactionMessage', 'stickerMessage'].includes(m.mtype)) return;

  try {
    await m.react('⏳');

    const res = await fetch('https://api.simsimi.vn/v1/simtalk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `text=${encodeURIComponent(m.text)}&lc=en`,
    });

    const json = await res.json();
    if (json.status !== '200') return m.reply('*Failed to get reply from Jarvis.*');

    const replyText = json.message;
    const audioPath = await generateTTS(replyText);

    await conn.sendFile(m.chat, audioPath, 'jarvis.opus', replyText, m);
    await m.react('✅');
  } catch (err) {
    console.error(err);
    m.reply('*Error occurred while processing the message.*');
  }
}

async function generateTTS(text, lang = defaultLang) {
  return new Promise((resolve, reject) => {
    const tts = gTTS(lang);
    const filePath = join(__dirname(), 'tmp', `${Date.now()}.wav`);
    tts.save(filePath, text, () => {
      const audio = readFileSync(filePath);
      unlinkSync(filePath);
      resolve(audio);
    });
  });
}
