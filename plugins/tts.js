import gTTS from 'gtts';

const ttsPlugin = async (m, sock) => {
  const triggers = ['tts', 'speak'];
  const match = triggers.find(trigger => m.body?.toLowerCase().startsWith(trigger));

  if (match) {
    const text = m.body.slice(match.length).trim();
    if (!text) return sock.sendMessage(m.from, { text: '🔊 Example: tts How are you?' }, { quoted: m });

    const gtts = new gTTS(text, 'en');
    gtts.save('tts.mp3', async (err) => {
      if (err) return;
      await sock.sendMessage(m.from, {
        audio: { url: 'tts.mp3' },
        mimetype: 'audio/mpeg',
        ptt: true
      }, { quoted: m });
      fs.unlinkSync('tts.mp3');
    });
  }
};
export default ttsPlugin;
