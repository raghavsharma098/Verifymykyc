const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'sg2plzcpnl507618.prod.sin2.secureserver.net',
    port: 465,
    secure: true,
    auth: {
        user: 'verifymykyc@navigantinc.com',
        pass: 'veri_kyc@#1234'
    }
});

// Verify transporter configuration
transporter.verify(function(error, success) {
    if (error) {
        console.error('SMTP Configuration Error:', error);
    } else {
        console.log('SMTP Server is ready to take our messages');
    }
});

const sendVerificationEmail = async (email, otp) => {
    try {
        console.log('Preparing to send email to:', email);
        const mailOptions = {
            from: 'verifymykyc@navigantinc.com',
            to: email,
            subject: 'Email Verification OTP',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Email Verification</h2>
                    <p>Thank you for registering. Please use the following OTP to verify your email address:</p>
                    <div style="background-color: #f4f4f4; padding: 10px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                        <strong>${otp}</strong>
                    </div>
                    <p>This OTP is valid for 10 minutes.</p>
                    <p>If you didn't request this verification, please ignore this email.</p>
                </div>
            `
        };

        console.log('Sending email...');
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', {
            messageId: info.messageId,
            response: info.response,
            accepted: info.accepted,
            rejected: info.rejected
        });
        return true;
    } catch (error) {
        console.error('Error sending email:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            command: error.command
        });
        return false;
    }
};

const sendPasswordResetEmail = async (email, resetUrl) => {
    try {
        console.log('Preparing to send password reset email to:', email);
        const mailOptions = {
            from: 'verifymykyc@navigantinc.com',
            to: email,
            subject: 'Password Reset Request',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Password Reset Request</h2>
                    <p>You requested a password reset. Click the link below to reset your password:</p>
                    <div style="background-color: #f4f4f4; padding: 10px; text-align: center; margin: 20px 0;">
                        <a href="${resetUrl}" style="color: #007bff; text-decoration: none;">Reset Password</a>
                    </div>
                    <p>This link will expire in 1 hour.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                </div>
            `
        };

        console.log('Sending password reset email...');
        const info = await transporter.sendMail(mailOptions);
        console.log('Password reset email sent successfully:', {
            messageId: info.messageId,
            response: info.response,
            accepted: info.accepted,
            rejected: info.rejected
        });
        return true;
    } catch (error) {
        console.error('Error sending password reset email:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            command: error.command
        });
        return false;
    }
};

const sendContactFormEmail = async (name, email, message) => {
    try {
        console.log('Preparing to send contact form email from:', email);
        const mailOptions = {
            from: 'verifymykyc@navigantinc.com',
            to: 'verifymykyc@navigantinc.com',
            subject: 'New Contact Form Submission',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">New Contact Form Submission</h2>
                    <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0;">
                        <p><strong>Name:</strong> ${name}</p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Message:</strong></p>
                        <p style="white-space: pre-wrap;">${message}</p>
                    </div>
                    <p>This message was sent from the contact form on your website.</p>
                </div>
            `
        };

        console.log('Sending contact form email...');
        const info = await transporter.sendMail(mailOptions);
        console.log('Contact form email sent successfully:', {
            messageId: info.messageId,
            response: info.response,
            accepted: info.accepted,
            rejected: info.rejected
        });
        return true;
    } catch (error) {
        console.error('Error sending contact form email:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            command: error.command
        });
        return false;
    }
};

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendContactFormEmail,
    transporter
};