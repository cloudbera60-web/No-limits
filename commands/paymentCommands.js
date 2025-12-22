// commands/paymentCommands.js
const STKService = require('../services/stkService');
const ValidationService = require('../services/validationService');

class PaymentCommands {
    constructor(config) {
        this.config = config;
        this.commandCooldown = new Map(); // Simple rate limiting
    }

    /**
     * Handle .stk command
     */
    async handleSTKCommand(socket, sender, text, messageId) {
        try {
            const userJid = sender;
            const senderNumber = sender.replace('@s.whatsapp.net', '');
            
            // Check permissions (owner/admin only)
            if (!ValidationService.isOwnerOrAdmin(senderNumber, this.config)) {
                await socket.sendMessage(userJid, {
                    text: '⛔ This command is restricted to admins only.'
                });
                return;
            }
            
            // Parse command
            const { phone, amount, reference, name } = ValidationService.parseSTKCommand(text);
            
            // Send processing message
            await socket.sendMessage(userJid, {
                text: `🔄 *Processing STK Push Request*\n\n📱 Phone: ${phone}\n💰 Amount: KES ${amount}\n⏳ Please wait...`,
                quoted: { key: { id: messageId }, message: { conversation: text } }
            });
            
            // Initiate STK Push
            const result = await STKService.initiateSTKPush({
                phone_number: phone,
                amount: amount,
                external_reference: reference,
                customer_name: name
            });
            
            // Send result
            if (result.success) {
                const responseText = `✅ *STK Push Initiated Successfully!*\n\n` +
                    `📱 *Phone:* ${result.data.phone_number}\n` +
                    `💰 *Amount:* KES ${result.data.amount}\n` +
                    `🔢 *Reference:* ${result.data.reference}\n\n` +
                    `📋 *Next Steps:*\n` +
                    `1. Check the phone for M-Pesa prompt\n` +
                    `2. Enter your M-Pesa PIN\n` +
                    `3. Payment will be processed automatically\n\n` +
                    `📊 *Check Status:*\n` +
                    `Use: .stkstatus ${result.data.reference}`;
                
                await socket.sendMessage(userJid, { text: responseText });
            } else {
                const errorText = `❌ *Payment Failed*\n\n` +
                    `*Error:* ${result.error}\n\n` +
                    `⚠️ *Please check:*\n` +
                    `• Phone number format (2547XXXXXXXX)\n` +
                    `• Sufficient balance\n` +
                    `• Valid amount (KES 1-70,000)`;
                
                await socket.sendMessage(userJid, { text: errorText });
            }
            
        } catch (error) {
            console.error('STK Command Error:', error);
            
            // Send error message
            await socket.sendMessage(sender, {
                text: `❌ *Command Error*\n\n${error.message}\n\n` +
                      `💡 *Usage:*\n.stk 254712345678 100 [reference] [customer name]\n` +
                      `Example: .stk 254712345678 500 ORDER-123 John Doe`
            });
        }
    }

    /**
     * Handle .stkstatus command
     */
    async handleSTKStatusCommand(socket, sender, text, messageId) {
        try {
            const userJid = sender;
            const senderNumber = sender.replace('@s.whatsapp.net', '');
            
            // Check permissions
            if (!ValidationService.isOwnerOrAdmin(senderNumber, this.config)) {
                await socket.sendMessage(userJid, {
                    text: '⛔ This command is restricted to admins only.'
                });
                return;
            }
            
            const parts = text.split(/\s+/);
            if (parts.length < 2) {
                await socket.sendMessage(userJid, {
                    text: '❌ *Invalid Format*\n\nUsage: .stkstatus <reference>\nExample: .stkstatus ORDER-123'
                });
                return;
            }
            
            const reference = parts[1];
            
            // Send processing message
            await socket.sendMessage(userJid, {
                text: `🔄 *Checking Transaction Status*\n\n🔢 Reference: ${reference}\n⏳ Please wait...`,
                quoted: { key: { id: messageId }, message: { conversation: text } }
            });
            
            // Check status
            const result = await STKService.checkTransactionStatus(reference);
            
            if (result.success) {
                const statusData = result.data;
                let statusText = `📊 *Transaction Status*\n\n` +
                    `🔢 *Reference:* ${reference}\n`;
                
                // Format based on response structure
                if (statusData.status) {
                    statusText += `📈 *Status:* ${statusData.status}\n`;
                }
                if (statusData.amount) {
                    statusText += `💰 *Amount:* KES ${statusData.amount}\n`;
                }
                if (statusData.transaction_date) {
                    statusText += `📅 *Date:* ${statusData.transaction_date}\n`;
                }
                if (statusData.description) {
                    statusText += `📝 *Description:* ${statusData.description}\n`;
                }
                
                // Add result interpretation
                const lowerStatus = (statusData.status || '').toLowerCase();
                if (lowerStatus.includes('success') || lowerStatus.includes('completed')) {
                    statusText += `\n✅ *Payment Successful!*`;
                } else if (lowerStatus.includes('pending')) {
                    statusText += `\n⏳ *Payment Pending* - Check M-Pesa for confirmation`;
                } else if (lowerStatus.includes('failed') || lowerStatus.includes('cancel')) {
                    statusText += `\n❌ *Payment Failed* - Try again or contact support`;
                }
                
                await socket.sendMessage(userJid, { text: statusText });
            } else {
                await socket.sendMessage(userJid, {
                    text: `❌ *Status Check Failed*\n\nError: ${result.error}\n\n` +
                          `⚠️ Please verify the reference number is correct.`
                });
            }
            
        } catch (error) {
            console.error('STK Status Command Error:', error);
            
            await socket.sendMessage(sender, {
                text: `❌ *Status Check Error*\n\n${error.message}\n\n` +
                      `💡 *Usage:*\n.stkstatus <reference>\nExample: .stkstatus ORDER-123`
            });
        }
    }

    /**
     * Handle .balance command (optional)
     */
    async handleBalanceCommand(socket, sender) {
        try {
            const userJid = sender;
            const senderNumber = sender.replace('@s.whatsapp.net', '');
            
            // Owner only command
            const ownerNumber = this.config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            if (senderNumber !== ownerNumber) {
                await socket.sendMessage(userJid, {
                    text: '⛔ This command is for owner only.'
                });
                return;
            }
            
            await socket.sendMessage(userJid, {
                text: '🔄 Checking wallet balance...'
            });
            
            const result = await STKService.checkWalletBalance();
            
            if (result.success) {
                await socket.sendMessage(userJid, {
                    text: `💰 *Wallet Balance*\n\n${JSON.stringify(result.balance, null, 2)}`
                });
            } else {
                await socket.sendMessage(userJid, {
                    text: `❌ Failed to check balance: ${result.error}`
                });
            }
            
        } catch (error) {
            console.error('Balance Command Error:', error);
            await socket.sendMessage(sender, {
                text: `❌ Balance check error: ${error.message}`
            });
        }
    }
}

module.exports = PaymentCommands;
