const { MongoClient } = require('mongodb');
const configManager = require('./config-manager');

class Database {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
        this.config = configManager.getAll();
    }

    async connect() {
        try {
            const mongoUri = this.config.MONGODB_URI;
            const dbName = this.config.MONGODB_DB_NAME;
            const sessionTTLDays = this.config.SESSION_TTL_DAYS;
            
            console.log(`🔗 Connecting to MongoDB Atlas...`);
            
            this.client = new MongoClient(mongoUri, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 15000, // Increased for Atlas
                socketTimeoutMS: 45000,
                connectTimeoutMS: 15000,
                maxPoolSize: 50, // Increased for multiple bot instances
                minPoolSize: 5,
                maxIdleTimeMS: 30000,
                retryWrites: true,
                w: 'majority'
            });
            
            // Test connection
            await this.client.connect();
            
            // Verify connection
            await this.client.db('admin').command({ ping: 1 });
            
            this.db = this.client.db(dbName);
            this.isConnected = true;
            
            console.log(`✅ MongoDB Atlas connected to database: ${dbName}`);
            
            // Create collections if they don't exist
            await this.setupCollections(sessionTTLDays);
            
            // Create indexes
            await this.createIndexes();
            
            return true;
        } catch (error) {
            console.error('❌ MongoDB Atlas connection error:', error.message);
            console.error('Full error:', error);
            this.isConnected = false;
            
            // For development, continue without DB
            if (configManager.isDevelopment()) {
                console.log('⚠️ Continuing without database in development mode');
                return false;
            }
            
            // For production, we might want to exit or use fallback
            console.log('⚠️ Bot will run without database persistence');
            return false;
        }
    }

    async setupCollections(sessionTTLDays) {
        const collections = await this.db.listCollections().toArray();
        const collectionNames = collections.map(col => col.name);
        
        // Create sessions collection with TTL
        if (!collectionNames.includes('sessions')) {
            await this.db.createCollection('sessions');
            console.log('📁 Created sessions collection');
        }
        
        // Create users collection
        if (!collectionNames.includes('users')) {
            await this.db.createCollection('users');
            console.log('📁 Created users collection');
        }
        
        // Create stats collection
        if (!collectionNames.includes('stats')) {
            await this.db.createCollection('stats');
            console.log('📁 Created stats collection');
        }
        
        // Create logs collection
        if (!collectionNames.includes('logs')) {
            await this.db.createCollection('logs');
            console.log('📁 Created logs collection');
        }
        
        // Create command_logs collection
        if (!collectionNames.includes('command_logs')) {
            await this.db.createCollection('command_logs');
            console.log('📁 Created command_logs collection');
        }
    }

    async createIndexes() {
        try {
            // Sessions collection indexes
            await this.db.collection('sessions').createIndex({ sessionId: 1 }, { unique: true });
            await this.db.collection('sessions').createIndex({ updatedAt: 1 });
            await this.db.collection('sessions').createIndex({ lastActivity: 1 });
            
            // Users collection indexes
            await this.db.collection('users').createIndex({ userId: 1 }, { unique: true });
            await this.db.collection('users').createIndex({ lastSeen: 1 });
            await this.db.collection('users').createIndex({ commandCount: 1 });
            
            // Stats collection indexes
            await this.db.collection('stats').createIndex({ date: 1 }, { unique: true });
            await this.db.collection('stats').createIndex({ botCount: 1 });
            
            // Logs collection indexes
            await this.db.collection('logs').createIndex({ timestamp: 1 });
            await this.db.collection('logs').createIndex({ level: 1 });
            
            // Command logs indexes
            await this.db.collection('command_logs').createIndex({ userId: 1 });
            await this.db.collection('command_logs').createIndex({ command: 1 });
            await this.db.collection('command_logs').createIndex({ timestamp: 1 });
            
            console.log('✅ Database indexes created');
        } catch (error) {
            console.error('Error creating indexes:', error.message);
        }
    }

    async saveSession(sessionId, authState) {
        if (!this.isConnected) {
            console.log('⚠️ Database not connected, skipping session save');
            return false;
        }
        
        try {
            const sessionData = {
                sessionId,
                creds: authState.creds,
                keys: authState.keys,
                updatedAt: new Date(),
                lastActivity: new Date(),
                // Add metadata for tracking
                botName: configManager.get('BOT_NAME'),
                createdAt: new Date(),
                status: 'active'
            };
            
            const result = await this.db.collection('sessions').updateOne(
                { sessionId },
                { 
                    $set: sessionData,
                    $setOnInsert: { createdAt: new Date() }
                },
                { upsert: true }
            );
            
            console.log(`💾 Session saved to MongoDB Atlas: ${sessionId}`);
            return true;
        } catch (error) {
            console.error('Error saving session to MongoDB Atlas:', error.message);
            return false;
        }
    }

    async getSession(sessionId) {
        if (!this.isConnected) {
            console.log('⚠️ Database not connected, cannot load session');
            return null;
        }
        
        try {
            const session = await this.db.collection('sessions').findOne({ sessionId });
            if (session) {
                // Update last accessed time
                await this.db.collection('sessions').updateOne(
                    { sessionId },
                    { $set: { lastAccessed: new Date() } }
                );
                
                console.log(`📂 Session loaded from MongoDB Atlas: ${sessionId}`);
                return {
                    creds: session.creds,
                    keys: session.keys
                };
            }
            console.log(`📭 Session not found in MongoDB Atlas: ${sessionId}`);
            return null;
        } catch (error) {
            console.error('Error getting session from MongoDB Atlas:', error.message);
            return null;
        }
    }

    async deleteSession(sessionId) {
        if (!this.isConnected) return false;
        
        try {
            const result = await this.db.collection('sessions').deleteOne({ sessionId });
            if (result.deletedCount > 0) {
                console.log(`🗑️ Session deleted from MongoDB Atlas: ${sessionId}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error deleting session from MongoDB Atlas:', error.message);
            return false;
        }
    }

    // Statistics methods
    async updateBotStats() {
        if (!this.isConnected) return;
        
        try {
            const today = new Date().toISOString().split('T')[0];
            const activeBots = global.activeBots || {};
            const botCount = Object.keys(activeBots).length;
            
            await this.db.collection('stats').updateOne(
                { date: today },
                { 
                    $set: { botCount, updatedAt: new Date() },
                    $inc: { totalConnections: 1 },
                    $setOnInsert: { date: today, createdAt: new Date() }
                },
                { upsert: true }
            );
        } catch (error) {
            // Silent fail for stats
        }
    }

    async logCommand(userId, command, success = true) {
        if (!this.isConnected) return;
        
        try {
            await this.db.collection('command_logs').insertOne({
                userId,
                command,
                success,
                timestamp: new Date(),
                botName: configManager.get('BOT_NAME')
            });
            
            // Update user stats
            await this.db.collection('users').updateOne(
                { userId },
                { 
                    $set: { lastSeen: new Date(), lastCommand: command },
                    $inc: { 
                        commandCount: 1,
                        [`commands.${command}`]: 1,
                        ...(success ? { successCount: 1 } : { errorCount: 1 })
                    },
                    $setOnInsert: { 
                        userId,
                        firstSeen: new Date(),
                        username: userId.split('@')[0]
                    }
                },
                { upsert: true }
            );
        } catch (error) {
            // Silent fail for logging
        }
    }

    async getDashboardStats() {
        if (!this.isConnected) return null;
        
        try {
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            
            const todayStats = await this.db.collection('stats').findOne({ date: today });
            const yesterdayStats = await this.db.collection('stats').findOne({ date: yesterday });
            
            const totalUsers = await this.db.collection('users').countDocuments();
            const totalCommands = await this.db.collection('command_logs').countDocuments();
            const todayCommands = await this.db.collection('command_logs').countDocuments({
                timestamp: { $gte: new Date(today) }
            });
            
            const topCommands = await this.db.collection('command_logs')
                .aggregate([
                    { $group: { _id: "$command", count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 10 }
                ])
                .toArray();
            
            const activeUsers = await this.db.collection('users')
                .countDocuments({ lastSeen: { $gte: new Date(Date.now() - 86400000) } });
            
            return {
                today: todayStats || { botCount: 0, totalConnections: 0 },
                yesterday: yesterdayStats || { botCount: 0, totalConnections: 0 },
                totals: {
                    users: totalUsers,
                    commands: totalCommands,
                    todayCommands
                },
                activeUsers,
                topCommands
            };
        } catch (error) {
            console.error('Error getting dashboard stats:', error);
            return null;
        }
    }

    async close() {
        if (this.client) {
            try {
                await this.client.close();
                this.isConnected = false;
                console.log('🔒 MongoDB Atlas connection closed gracefully');
            } catch (error) {
                console.error('Error closing MongoDB Atlas connection:', error);
            }
        }
    }
}

// Singleton instance
const dbInstance = new Database();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔄 Closing MongoDB connection...');
    await dbInstance.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🔄 Closing MongoDB connection...');
    await dbInstance.close();
    process.exit(0);
});

// Auto-reconnect logic
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

async function checkConnection() {
    if (!dbInstance.isConnected && reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(`Attempting to reconnect to MongoDB (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);
        
        setTimeout(async () => {
            try {
                await dbInstance.connect();
                reconnectAttempts = 0;
            } catch (error) {
                checkConnection();
            }
        }, 5000 * reconnectAttempts); // Exponential backoff
    }
}

// Start connection monitoring
setInterval(() => {
    if (!dbInstance.isConnected) {
        checkConnection();
    }
}, 30000); // Check every 30 seconds

module.exports = dbInstance;
