// services/validationService.js
class ValidationService {
    /**
     * Validate STK command input
     * @param {string} text - Command text (e.g., ".stk 254712345678 100")
     * @returns {object} Parsed and validated data
     */
    parseSTKCommand(text) {
        const parts = text.split(/\s+/).filter(p => p);
        
        if (parts.length < 3) {
            throw new Error('Invalid format. Use: .stk <phone> <amount> [reference] [name]');
        }
        
        const phone = parts[1];
        const amount = parts[2];
        const reference = parts[3] || null;
        const name = parts.slice(4).join(' ') || null;
        
        return { phone, amount, reference, name };
    }
    
    /**
     * Validate user permissions (owner/admin check)
     */
    isOwnerOrAdmin(senderNumber, config) {
        const ownerNumber = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
        const senderClean = senderNumber.replace(/[^0-9]/g, '');
        
        // Check if sender is owner
        if (senderClean === ownerNumber) {
            return true;
        }
        
        // Optional: Load admin list from config
        const admins = require('../admin.json') || [];
        return admins.includes(senderClean);
    }
    
    /**
     * Simple rate limiting
     */
    rateLimitCheck(userId, command, limit = 5, windowMs = 60000) {
        // Implement basic rate limiting here
        // You can use a simple Map or Redis for production
        return true; // Placeholder
    }
}

module.exports = new ValidationService();
