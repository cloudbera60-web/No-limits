// Load environment variables first
require('dotenv').config();

const express = require('express');
const path = require('path');
const app = express();
const bodyParser = require("body-parser");
const { initializeBotSystem } = require('./bot-runner');
const configManager = require('./config-manager');
const database = require('./database');

// Get port from config
const PORT = configManager.get('PORT') || 50900;

const { 
  qrRoute,
  pairRoute
} = require('./routes');

require('events').EventEmitter.defaultMaxListeners = 2000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/qr', qrRoute);
app.use('/code', pairRoute);

app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', async (req, res) => {
    const pluginLoader = require('./plugin-loader');
    
    res.json({
        status: 200,
        success: true,
        service: 'Gifted-Md Bot Runner',
        environment: configManager.get('NODE_ENV'),
        timestamp: new Date().toISOString(),
        activeBots: Object.keys(global.activeBots || {}).length,
        mongoConnected: database.isConnected,
        pluginsLoaded: pluginLoader.plugins.size,
        config: {
            botName: configManager.get('BOT_NAME'),
            mode: configManager.get('MODE'),
            prefix: configManager.get('PREFIX')
        }
    });
});

// MongoDB Dashboard
app.get('/dashboard', async (req, res) => {
    try {
        if (!database.isConnected) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        const stats = await database.getDashboardStats();
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                name: configManager.get('MONGODB_DB_NAME'),
                cluster: 'MongoDB Atlas'
            },
            stats: stats || {
                message: 'Statistics not available yet',
                connected: false
            }
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch dashboard data',
            message: error.message 
        });
    }
});

// Admin endpoints
app.get('/admin/stats', async (req, res) => {
    const auth = req.headers.authorization;
    const adminToken = process.env.ADMIN_TOKEN || configManager.get('ADMIN_TOKEN');
    
    if (!adminToken || auth !== `Bearer ${adminToken}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const activeBots = global.activeBots || {};
        const botsList = Object.keys(activeBots).map(id => ({
            sessionId: id,
            startedAt: activeBots[id].startedAt,
            connectionState: activeBots[id].instance?.connectionState || 'unknown',
            uptime: activeBots[id].instance?.getUptime ? activeBots[id].instance.getUptime() : 'unknown'
        }));
        
        const dbStats = database.isConnected ? await database.getDashboardStats() : null;
        
        res.json({
            bots: {
                active: botsList,
                total: botsList.length
            },
            database: {
                connected: database.isConnected,
                stats: dbStats
            },
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                nodeVersion: process.version
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Initialize bot system
async function startServer() {
    try {
        console.log('⚙️ Loading configuration...');
        await configManager.loadConfig();
        
        console.log('🔗 Connecting to MongoDB Atlas...');
        const dbConnected = await database.connect();
        
        if (dbConnected) {
            console.log('✅ MongoDB Atlas connected successfully');
        } else {
            console.log('⚠️ Running without database persistence');
        }
        
        console.log('📦 Loading plugins...');
        const pluginLoader = require('./plugin-loader');
        const pluginCount = await pluginLoader.loadPlugins();
        console.log(`✅ ${pluginCount} plugin(s) loaded`);
        
        console.log('🤖 Starting bot system...');
        const systemReady = await initializeBotSystem();
        
        if (systemReady) {
            app.listen(PORT, () => {
                const config = configManager.getAll();
                console.log(`
╔══════════════════════════════════════════════════════╗
║           GIFTED-MD BOT RUNNER v2.0                  ║
╠══════════════════════════════════════════════════════╣
║  📍 Port: ${PORT}                                       ║
║  🌐 Environment: ${config.NODE_ENV}                      ║
║  🤖 Bot Name: ${config.BOT_NAME}                          ║
║  👑 Owner: ${config.OWNER_NAME}                           ║
║  🔧 Prefix: ${config.PREFIX}                              ║
║  🌍 Mode: ${config.MODE}                                  ║
║  🗄️  MongoDB: ${database.isConnected ? '✅ Atlas Connected' : '❌ Disconnected'}
║  📦 Plugins: ${pluginCount} loaded                         ║
║  🔗 URL: http://localhost:${PORT}                         ║
║  📊 Dashboard: http://localhost:${PORT}/dashboard         ║
╚══════════════════════════════════════════════════════╝
                `);
                console.log('✅ Server is ready!');
                console.log(`• Visit http://localhost:${PORT} for the home page`);
                console.log(`• Visit http://localhost:${PORT}/pair for pairing`);
                console.log(`• Visit http://localhost:${PORT}/dashboard for MongoDB stats`);
                
                // Update bot stats every 5 minutes
                if (database.isConnected) {
                    setInterval(() => {
                        database.updateBotStats().catch(() => {});
                    }, 300000);
                }
            });
        } else {
            console.error('❌ Failed to initialize bot system');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Server startup error:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    await database.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n👋 Received termination signal...');
    await database.close();
    process.exit(0);
});

// Start the server
startServer();

module.exports = app;
