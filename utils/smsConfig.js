const axios = require('axios');

 // Replace with your actual DLT template ID

async function sendSMS(phoneNumber, message) {
    try {
        // Format the message according to the approved template
        // Remove any extra text from the OTP message and use only the OTP number
        const otpNumber = message.replace(/[^0-9]/g, '').slice(0, 6); // Ensure only 6 digits
        const formattedMessage = `"VFMKYC Verification Code: Your OTP is ${otpNumber}. Use this to complete your registration.Valid for 10 minutes.Never share this code with anyone. VFMKYC NAVIGANT INTERNATIONAL PRIVATE LIMITED"`;

        // Use phone number as is, without country code
        const formattedPhone = phoneNumber;
        console.log('SMS Configuration:', {
            user: SMS_COUNTRY_USER,
            sid: SMS_COUNTRY_SID,
            phone: formattedPhone,
            messageLength: formattedMessage.length,
            dltTemplateId: DLT_TEMPLATE_ID,
            formattedMessage: formattedMessage // Log the formatted message for verification
        });

        const params = new URLSearchParams({
            user: SMS_COUNTRY_USER,
            passwd: SMS_COUNTRY_PASSWORD,
            message: formattedMessage,
            sid: SMS_COUNTRY_SID,
            mtype: 'N',
            DR: 'Y',
            mobilenumber: formattedPhone,
            dlt_template_id: DLT_TEMPLATE_ID,
            dlt_content_type: 'TEXT'
        });

        const url = `http://api.smscountry.com/SMSCwebservice_bulk.aspx?${params.toString()}`;
        console.log('SMS API URL:', url);

        const response = await axios.get(url, {
            timeout: 10000, // 10 second timeout
            validateStatus: function (status) {
                return status >= 200 && status < 500; // Accept all responses for logging
            }
        });

        console.log('SMS API Response:', {
            status: response.status,
            data: response.data,
            headers: response.headers
        });

        // Check if SMS was sent successfully
        if (response.data.startsWith('OK:')) {
            console.log('SMS sent successfully with ID:', response.data);
            return true;
        }

        // Log specific error messages
        if (response.data.includes('Invalid User')) {
            console.error('Invalid SMS Country credentials');
            return false;
        }
        if (response.data.includes('Invalid Sender ID')) {
            console.error('Invalid Sender ID (SID)');
            return false;
        }
        if (response.data.includes('Invalid Mobile Number')) {
            console.error('Invalid mobile number format');
            return false;
        }
        if (response.data.includes('Invalid DLT')) {
            console.error('Invalid DLT configuration');
            return false;
        }

        console.log('SMS sending failed. Response:', response.data);
        return false;
    } catch (error) {
        console.error('SMS sending error details:', {
            message: error.message,
            code: error.code,
            response: error.response?.data,
            status: error.response?.status,
            stack: error.stack
        });
        return false;
    }
}

module.exports = {
    sendSMS
}; 