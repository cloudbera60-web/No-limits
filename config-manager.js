const fs = require('fs').promises;
const path = require('path');

class ConfigManager {
    constructor() {
        this.config = {};
        this.configPath = path.join(__dirname, 'config.json');
    }

    async loadConfig() {
        try {
            // Load from environment variables
            this.config = this.loadFromEnv();
            
            // Try to load from config.json (overrides .env)
            try {
                const data = await fs.readFile(this.configPath, 'utf8');
                const jsonConfig = JSON.parse(data);
                this.config = { ...this.config, ...jsonConfig };
                console.log('✅ Configuration loaded from config.json');
            } catch (error) {
                console.log('📝 No config.json found, using .env only');
            }
            
            console.log('✅ Configuration loaded successfully');
            return this.config;
        } catch (error) {
            console.error('❌ Error loading configuration:', error);
            this.config = this.loadFromEnv();
            return this.config;
        }
    }

    loadFromEnv() {
        return {
            // Server
            PORT: parseInt(process.env.PORT) || 50900,
            NODE_ENV: process.env.NODE_ENV || 'production',
            
            // MongoDB
            MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017',
            MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || 'giftedmd',
            SESSION_TTL_DAYS: parseInt(process.env.SESSION_TTL_DAYS) || 7,
            
            // Bot Configuration
            PREFIX: process.env.BOT_PREFIX || '.',
            OWNER_NUMBER: process.env.OWNER_NUMBER || '1234567890',
            OWNER_NAME: process.env.OWNER_NAME || 'Gifted Tech',
            BOT_NAME: process.env.BOT_NAME || 'GIFTED-MD',
            MODE: process.env.BOT_MODE || 'public',
            
            // URLs
            MENU_IMAGE: process.env.MENU_IMAGE || 'https://gitcdn.giftedtech.co.ke/image/AZO_image.jpg',
            REPO_URL: process.env.REPO_URL || 'https://github.com/mauricegift/gifted-md',
            SUPPORT_URL: process.env.SUPPORT_URL || 'https://t.me/mouricedevs',
            CHANNEL_URL: process.env.CHANNEL_URL || 'https://whatsapp.com/channel/0029Vb3hlgX5kg7G0nFggl0Y',
            
            // Connection Settings
            MAX_RECONNECT_ATTEMPTS: parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 3,
            RECONNECT_DELAY: parseInt(process.env.RECONNECT_DELAY_MS) || 5000,
            
            // Features
            AUTO_REACT: process.env.AUTO_REACT === 'true',
            AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN === 'true',
            AUTO_STATUS_REPLY: process.env.AUTO_STATUS_REPLY === 'true',
            REJECT_CALL: process.env.REJECT_CALL === 'true',
            WELCOME: process.env.WELCOME_MESSAGE === 'true',
            
            // Description
            DESCRIPTION: 'Advanced WhatsApp Bot by Gifted Tech'
        };
    }

    get(key, defaultValue = null) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }

    set(key, value) {
        this.config[key] = value;
        return this.saveToJson();
    }

    async saveToJson() {
        try {
            await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving config to JSON:', error);
            return false;
        }
    }

    getAll() {
        return { ...this.config };
    }
}

const configManager = new ConfigManager();
module.exports = configManager;
