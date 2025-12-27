import fetch from 'node-fetch';
import config from '../../config.cjs';

const imageTriggerWords = ['imagine', 'create'];

const generateImage = async (m, sock) => {
    const isOwner = m.sender === config.OWNER_NUMBER + '@s.whatsapp.net';
    const messageText = m.body.toLowerCase().trim();

    const triggerWord = imageTriggerWords.find(word => messageText.startsWith(word));
    if (!triggerWord) return;

    if (!isOwner) {
        return await sock.sendMessage(m.from, { text: '*⛔ Only the bot owner can use this command!*' }, { quoted: m });
    }

    const prompt = m.body.slice(triggerWord.length).trim();
    if (!prompt) {
        return await sock.sendMessage(m.from, { text: '*❌ Please provide a prompt to generate an image.*' }, { quoted: m });
    }

    try {
        const apiUrl = `https://api.siputzx.my.id/api/ai/flux?prompt=${encodeURIComponent(prompt)}`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        if (!data || !data.url) {
            return await sock.sendMessage(m.from, { text: '*❌ Failed to generate image. Try again later.*' }, { quoted: m });
        }

        await sock.sendMessage(m.from, {
            image: { url: data.url },
            caption: `*Prompt:* ${prompt}`
        }, { quoted: m });

    } catch (err) {
        console.error(err);
        await sock.sendMessage(m.from, { text: '*⚠️ An error occurred while generating the image.*' }, { quoted: m });
    }
};

export default generateImage;
