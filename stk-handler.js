const axios = require('axios');
const crypto = require('crypto');

class STKPushHandler {
    constructor() {
        // Your PayHero credentials from .env
        this.authToken = process.env.AUTH_TOKEN || 'Basic eWxmSWYwSm50Zk8zZzFkTHdqcUE6djVWam5qVTVMWDVPRUFsUUJnMEs5VWlhNWU1ajRXNVBRQ3NialZVQg==';
        this.channelId = process.env.CHANNEL_ID || '3762';
        this.provider = process.env.DEFAULT_PROVIDER || 'm-pesa';
        
        // PayHero API endpoints
        this.payheroBase = 'https://api.payhero.co.ke/v1';
    }

    async processSTKPush(phoneNumber, amount, reference = null, customerName = null) {
        try {
            console.log(`💳 Processing STK Push via PayHero: ${phoneNumber} - KES ${amount}`);
            
            // Format phone number
            let formattedPhone = phoneNumber.toString().trim();
            if (formattedPhone.startsWith('0')) {
                formattedPhone = '254' + formattedPhone.substring(1);
            } else if (formattedPhone.startsWith('+')) {
                formattedPhone = formattedPhone.substring(1);
            }

            if (!formattedPhone.startsWith('254') || formattedPhone.length !== 12) {
                return {
                    success: false,
                    error: 'Invalid phone number. Use format: 2547XXXXXXXX or 07XXXXXXXX'
                };
            }

            // Validate amount
            const amountNum = parseFloat(amount);
            if (isNaN(amountNum) || amountNum <= 0 || amountNum > 150000) {
                return {
                    success: false,
                    error: 'Invalid amount. Must be between 1 and 150,000 KES'
                };
            }

            // Generate reference if not provided
            const transactionRef = reference || `STK${Date.now()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
            
            // Prepare PayHero STK Push payload
            const payload = {
                phone_number: formattedPhone,
                amount: amountNum.toFixed(2),
                provider: this.provider,
                channel_id: this.channelId,
                external_reference: transactionRef,
                customer_name: customerName || `Customer-${formattedPhone.slice(-4)}`,
                callback_url: 'https://your-callback-url.com/webhook' // Optional: Add your webhook URL
            };

            console.log('🔄 Sending to PayHero:', {
                phone: formattedPhone,
                amount: amountNum,
                reference: transactionRef,
                channel: this.channelId
            });

            // Direct PayHero API call
            const response = await axios.post(
                `${this.payheroBase}/stk/push`,
                payload,
                {
                    timeout: 30000,
                    headers: {
                        'Authorization': this.authToken,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );

            console.log('✅ PayHero Response:', response.data);

            if (response.data && response.data.request_id) {
                return {
                    success: true,
                    reference: transactionRef,
                    requestId: response.data.request_id,
                    message: 'STK Push initiated successfully',
                    phone: formattedPhone,
                    amount: amountNum,
                    provider: this.provider,
                    timestamp: new Date().toISOString(),
                    data: response.data
                };
            } else {
                return {
                    success: false,
                    error: response.data?.message || 'STK Push failed',
                    data: response.data
                };
            }
        } catch (error) {
            console.error('❌ PayHero STK Push error:', error.response?.data || error.message);
            
            let errorMessage = 'Payment processing failed';
            if (error.response) {
                // PayHero specific error handling
                if (error.response.status === 401) {
                    errorMessage = 'Authentication failed. Check your AUTH_TOKEN';
                } else if (error.response.status === 400) {
                    errorMessage = error.response.data?.message || 'Invalid request parameters';
                } else if (error.response.status === 403) {
                    errorMessage = 'Insufficient permissions or account issue';
                } else if (error.response.data?.message) {
                    errorMessage = error.response.data.message;
                }
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Payment gateway timeout. Please try again';
            }
            
            return {
                success: false,
                error: errorMessage,
                status: error.response?.status,
                details: error.response?.data
            };
        }
    }

    async checkTransactionStatus(reference) {
        try {
            console.log(`🔍 Checking PayHero transaction: ${reference}`);
            
            const response = await axios.get(
                `${this.payheroBase}/transactions/${reference}`,
                {
                    timeout: 15000,
                    headers: {
                        'Authorization': this.authToken,
                        'Accept': 'application/json'
                    }
                }
            );

            console.log('✅ PayHero Status Response:', response.data);

            return {
                success: true,
                data: response.data,
                status: response.data.status,
                message: response.data.message || 'Transaction found'
            };
        } catch (error) {
            console.error('❌ PayHero status check error:', error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Unable to check status',
                status: error.response?.status
            };
        }
    }

    // Get account balance
    async getAccountBalance() {
        try {
            const response = await axios.get(
                `${this.payheroBase}/wallet/balance`,
                {
                    timeout: 15000,
                    headers: {
                        'Authorization': this.authToken,
                        'Accept': 'application/json'
                    }
                }
            );

            return {
                success: true,
                balance: response.data.balance,
                currency: response.data.currency || 'KES',
                data: response.data
            };
        } catch (error) {
            console.error('❌ Balance check error:', error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }
}

module.exports = { STKPushHandler };
