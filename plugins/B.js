import axios from 'axios';

class BingImageSystem {
    constructor() {
        this.triggerWords = ['bing', 'create'];
    }

    isTrigger(message) {
        const text = message?.body?.trim().toLowerCase();
        return this.triggerWords.some(word => text?.startsWith(word));
    }

    async handleMessage(m, Matrix) {
        if (!this.isTrigger(m)) return;

        const [trigger, ...queryParts] = m.body.trim().split(/\s+/);
        const query = queryParts.join(' ');

        if (!query) {
            await m.reply('Please provide a prompt to create an image.');
            return;
        }

        try {
            await m.React('⏳');
            const url = `https://aemt.me/bingimg?text=${encodeURIComponent(query)}`;
            await Matrix.sendMessage(m.chat, {
                image: { url },
                caption: `🐝*AI-Generated Image for:* _${query}_`
            }, { quoted: m });
            await m.React('✅');
        } catch (error) {
            console.error('Bing image fetch error:', error);
            await m.reply('Error generating image. Try again later.');
            await m.React('❌');
        }
    }
}

const bingImage = new BingImageSystem();

const BingImageHandler = async (m, Matrix) => {
    await bingImage.handleMessage(m, Matrix);
};

export default BingImageHandler;
