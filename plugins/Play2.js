import axios from 'axios';

const play2Handler = async (m, Matrix) => {
  const body = m.body.trim();

  // Check for trigger word
  if (!body.toLowerCase().startsWith('play2')) return;

  const query = body.slice(5).trim(); // remove 'play2'
  if (!query) return m.reply('Please provide a song name or YouTube link.');

  try {
    await m.React('🎶');

    let youtubeUrl = query;

    // If it's not a YouTube link, perform search
    if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
      const ytSearch = await axios.get(`https://api.popcat.xyz/search?q=${encodeURIComponent(query)}`);
      const firstResult = ytSearch.data?.results?.[0];

      if (!firstResult || !firstResult.url) {
        return m.reply('No YouTube results found.');
      }

      youtubeUrl = firstResult.url;
    }

    // Now call your downloader API
    const apiUrl = `https://bk9.fun/download/ytmp3?url=${encodeURIComponent(youtubeUrl)}&type=mp3`;
    const response = await axios.get(apiUrl);

    const { title, thumbnail, audio_url, filesize } = response.data || {};

    if (!audio_url) throw new Error('Audio not found');

    // Send thumbnail card
    await Matrix.sendMessage(m.chat, {
      image: { url: thumbnail },
      caption: `*CLOUD AI DOWNLOADER*\n\n` +
               `*Title:* ${title}\n` +
               `*Size:* ${filesize || 'Unknown'}\n\n` +
               `_Sending your music..._`
    }, { quoted: m });

    // Send the actual audio file
    await Matrix.sendMessage(m.chat, {
      audio: { url: audio_url },
      mimetype: 'audio/mpeg',
      fileName: `${title}.mp3`,
      ptt: false
    }, { quoted: m });

    await m.React('✅');
  } catch (err) {
    console.error('play2 error:', err.message);
    await m.reply('Failed to download the music.');
    await m.React('❌');
  }
};

export default play2Handler;
