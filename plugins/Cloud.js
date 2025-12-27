import fetch from 'node-fetch';

const LyricsFetcher = async (m, { conn }) => {
  const body = m.body.toLowerCase();
  if (!m.key.fromMe || (!body.startsWith('lyrics') && !body.startsWith('lyric'))) return;

  const query = m.body.slice(body.startsWith('lyrics') ? 6 : 5).trim();
  if (!query) return m.reply('❌ *Please provide a song title.*\n\nExample: `lyrics faded`');

  await m.react('🎵');

  try {
    // Get lyrics
    const res = await fetch(`https://api.dreaded.site/api/lyrics?title=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!data?.lyrics) {
      await m.react('❌');
      return m.reply(`❌ *Lyrics not found for:* ${query}`);
    }

    await m.reply(`🎼 *Lyrics for:* ${data.title || query}\n\n${data.lyrics}`);

    // Get YouTube video
    const searchRes = await fetch(`https://api.dreaded.site/api/ytsearch?q=${encodeURIComponent(query)} song`);
    const searchData = await searchRes.json();

    const videoUrl = searchData?.result?.[0]?.url;
    if (!videoUrl) {
      await m.react('❌');
      return m.reply(`❌ *No YouTube results found for:* ${query}`);
    }

    // Download MP3
    const musicRes = await fetch(`https://apis.davidcyriltech.my.id/download/ytmp3?url=${videoUrl}`);
    const music = await musicRes.json();

    if (!music?.result?.url) {
      await m.react('❌');
      return m.reply(`❌ *Unable to download audio for:* ${query}`);
    }

    await conn.sendMessage(m.chat, {
      audio: { url: music.result.url },
      mimetype: 'audio/mpeg',
      ptt: false,
      fileName: `${query}.mp3`
    }, { quoted: m });

    await m.react('✅');

  } catch (err) {
    console.error('LyricsFetcher Error:', err);
    await m.react('❌');
    m.reply('❌ *An error occurred while processing your request.*');
  }
};

export default LyricsFetcher;
