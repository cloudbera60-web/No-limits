const { MongoClient } = require('mongodb');

class Database {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
            this.client = new MongoClient(mongoUri, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            
            await this.client.connect();
            this.db = this.client.db('giftedmd');
            this.isConnected = true;
            
            console.log('✅ MongoDB connected successfully');
            
            // Create indexes
            await this.db.collection('sessions').createIndex({ sessionId: 1 }, { unique: true });
            await this.db.collection('sessions').createIndex({ updatedAt: 1 }, { expireAfterSeconds: 86400 * 7 }); // 7 days TTL
            await this.db.collection('users').createIndex({ userId: 1 }, { unique: true });
            
            return true;
        } catch (error) {
            console.error('❌ MongoDB connection error:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    async saveSession(sessionId, authState) {
        if (!this.isConnected) return false;
        
        try {
            const sessionData = {
                sessionId,
                creds: authState.creds,
                keys: authState.keys,
                updatedAt: new Date()
            };
            
            await this.db.collection('sessions').updateOne(
                { sessionId },
                { $set: sessionData },
                { upsert: true }
            );
            
            console.log(`💾 Session saved to DB: ${sessionId}`);
            return true;
        } catch (error) {
            console.error('Error saving session:', error.message);
            return false;
        }
    }

    async getSession(sessionId) {
        if (!this.isConnected) return null;
        
        try {
            const session = await this.db.collection('sessions').findOne({ sessionId });
            if (session) {
                return {
                    creds: session.creds,
                    keys: session.keys
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting session:', error.message);
            return null;
        }
    }

    async deleteSession(sessionId) {
        if (!this.isConnected) return false;
        
        try {
            await this.db.collection('sessions').deleteOne({ sessionId });
            console.log(`🗑️ Session deleted from DB: ${sessionId}`);
            return true;
        } catch (error) {
            console.error('Error deleting session:', error.message);
            return false;
        }
    }

    async close() {
        if (this.client) {
            await this.client.close();
            this.isConnected = false;
            console.log('🔒 MongoDB connection closed');
        }
    }
}

// Singleton instance
const dbInstance = new Database();
module.exports = dbInstance;
