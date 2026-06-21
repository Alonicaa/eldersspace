const twilio = require('twilio');

class SmsService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;

    if (this.accountSid && this.authToken && this.phoneNumber) {
      this.client = twilio(this.accountSid, this.authToken);
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
      console.warn('⚠️ SMS Service: Twilio not configured. OTP will be logged to console only.');
    }
  }

  /**
   * Send OTP via SMS
   * @param {string} phoneNumber - Recipient phone number (e.g., +66850479951)
   * @param {string} otp - OTP code to send
   * @returns {Promise<Object>} - Response with success status and message/SID
   */
  async sendOtp(phoneNumber, otp) {
    console.log(`📱 OTP for ${phoneNumber}: ${otp}`);

    if (!this.isConfigured) {
      return {
        success: true,
        message: 'OTP sent (development mode)',
        isDevelopment: true
      };
    }

    try {
      const message = await this.client.messages.create({
        body: `รหัส OTP ของคุณ: ${otp} (ใช้ได้เพียง 5 นาที)`,
        from: this.phoneNumber,
        to: phoneNumber
      });

      console.log(`✅ SMS sent successfully. SID: ${message.sid}`);
      return {
        success: true,
        message: 'OTP sent via SMS',
        messageSid: message.sid
      };
    } catch (error) {
      console.error('❌ SMS sending failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send verification message
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - Custom message to send
   * @returns {Promise<Object>}
   */
  async sendMessage(phoneNumber, message) {
    if (!this.isConfigured) {
      console.log(`📱 Message to ${phoneNumber}: ${message}`);
      return {
        success: true,
        message: 'Message sent (development mode)',
        isDevelopment: true
      };
    }

    try {
      const sms = await this.client.messages.create({
        body: message,
        from: this.phoneNumber,
        to: phoneNumber
      });

      console.log(`✅ Message sent successfully. SID: ${sms.sid}`);
      return {
        success: true,
        message: 'Message sent via SMS',
        messageSid: sms.sid
      };
    } catch (error) {
      console.error('❌ SMS sending failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new SmsService();
