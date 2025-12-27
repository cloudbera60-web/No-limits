import { promises as fs } from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

// File paths
const featureFile = path.resolve(__dirname, '../feature_status.json');
const profileFile = path.resolve(__dirname, '../chat_profile.json');
const memoryFile = path.resolve(__dirname, '../chat_memory.json');

// Helper functions
async function readJSON(file, fallback = {}) {
  try {
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

async function writeJSON(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

function splitText(text, maxLength = 200) {
  const parts = [];
  let current = '';
  for (const word of text.split(' ')) {
    if ((current + word).length > maxLength) {
      parts.push(current.trim());
      current = '';
    }
    current += word + ' ';
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const aiPartner = async (m, conn) => {
  const text = m.body?.trim().toLowerCase();
  const sender = m.sender;

  // Load data
  const [profile, memory, feature] = await Promise.all([
    readJSON(profileFile),
    readJSON(memoryFile),
    readJSON(featureFile)
  ]);

  // Handle mode switching
  if (['gf on', 'gf off', 'bf on', 'bf off'].includes(text)) {
    if (m.sender.split(':')[0] !== conn.user.id.split(':')[0]) return;

    const [mode, state] = text.split(' ');
    feature[mode] = state === 'on';
    await writeJSON(featureFile, feature);

    await conn.sendMessage(m.from, {
      text: `✅ ${mode.toUpperCase()} mode has been ${feature[mode] ? 'enabled' : 'disabled'}.`
    }, { quoted: m });
    return;
  }

  // Check active mode
  const mode = feature.gf ? 'gf' : feature.bf ? 'bf' : null;
  if (!mode) return;

  // Initialize profile if new user
  if (!profile[sender]) {
    profile[sender] = { gender: null };
    await writeJSON(profileFile, profile);
    await conn.sendMessage(m.from, {
      text: '👋 Hi! Before we begin, are you male or female? Reply with "male" or "female".'
    }, { quoted: m });
    return;
  }

  // Handle gender selection
  if (!profile[sender].gender) {
    if (!['male', 'female'].includes(text)) {
      await conn.sendMessage(m.from, {
        text: 'Please reply with "male" or "female" to continue.'
      }, { quoted: m });
      return;
    }
    profile[sender].gender = text;
    await writeJSON(profileFile, profile);
    await conn.sendMessage(m.from, {
      text: `Thanks! Let's start chatting as ${text === 'male' ? 'boyfriend' : 'girlfriend'} mode.`
    }, { quoted: m });
    return;
  }

  // Initialize memory if new conversation
  if (!memory[sender]) memory[sender] = [];

  try {
    await m.react('❤️');
    
    // Add user message to memory
    memory[sender].push({ role: 'user', content: text });
    
    // Get last 10 messages for context
    const context = memory[sender].slice(-10);

    // Call AI API
    const res = await fetch('https://bera-tech-api-site-i7n3.onrender.com/api/ai/gpt4o?q=', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: context }),
      timeout: 30000
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json();
    const reply = data.result || "I'm here for you.";

    // Add AI response to memory
    memory[sender].push({ role: 'assistant', content: reply });
    await writeJSON(memoryFile, memory);

    // Send text reply
    await conn.sendMessage(m.from, { text: reply }, { quoted: m });

    // Generate voice messages in chunks
    const voice = profile[sender].gender === 'male' ? 'Josh' : 'Bella';
    const textParts = splitText(reply);

    for (const part of textParts) {
      try {
        const voiceRes = await fetch(
          `https://api.fakeyou.com/tts?text=${encodeURIComponent(part)}&voice=${voice}`,
          { timeout: 15000 }
        );
        
        if (!voiceRes.ok) continue; // Skip if voice fails
        
        const voiceBuffer = await voiceRes.buffer();
        await conn.sendMessage(m.from, {
          audio: voiceBuffer,
          mimetype: 'audio/mp4',
          ptt: true
        }, { quoted: m });
      } catch (voiceError) {
        console.error('Voice generation failed:', voiceError);
      }
    }

    await m.react('✅');
  } catch (err) {
    console.error('AI Partner Error:', err);
    await conn.sendMessage(m.from, {
      text: '⚠️ Something went wrong. Try again later.'
    }, { quoted: m });
    await m.react('❌');
  }
};

export default aiPartner;
