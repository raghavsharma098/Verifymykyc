// Remove all SMSCountry and axios logic. Replace sendSMS with a simple logger.
async function sendSMS(phoneNumber, message) {
    // Extract OTP from message for clarity
    const otpNumber = message.replace(/[^0-9]/g, '').slice(0, 6);
    console.log(`\n[OTP for ${phoneNumber}]: ${otpNumber}\n(Full message: ${message})`);
    return true;
}

module.exports = {
    sendSMS
}; 