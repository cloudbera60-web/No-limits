const fs = require('fs').promises;
const path = require('path');

class ConfigManager {
    constructor() {
        this.config = {};
        this.configPath = path.join(__dirname, 'config.json');
    }

    async loadConfig() {
        try {
            const data = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(data);
            console.log('✅ Configuration loaded');
            return this.config;
        } catch (error) {
            // Create default config
            this.config = {
                PREFIX: '.',
                OWNER_NUMBER: '1234567890',
                OWNER_NAME: 'Gifted Tech',
                BOT_NAME: 'GIFTED-MD',
                MODE: 'public',
                AUTO_REACT: true,
                MENU_IMAGE: 'https://gitcdn.giftedtech.co.ke/image/AZO_image.jpg',
                DESCRIPTION: 'Advanced WhatsApp Bot by Gifted Tech',
                MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017',
                MAX_RECONNECT_ATTEMPTS: 3,
                RECONNECT_DELAY: 5000
            };
            
            await this.saveConfig();
            return this.config;
        }
    }

    async saveConfig() {
        try {
            await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving config:', error);
            return false;
        }
    }

    get(key, defaultValue = null) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }

    set(key, value) {
        this.config[key] = value;
        return this.saveConfig();
    }

    getAll() {
        return { ...this.config };
    }
}

const configManager = new ConfigManager();
module.exports = configManager;
