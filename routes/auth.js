const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { sendVerificationEmail } = require('../utils/emailConfig');
const { sendSMS } = require('../utils/smsConfig');

// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Register route
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone, registrationType } = req.body;
        console.log('Registration attempt:', { name, email, phone, registrationType });

        // Validate required fields based on registration type
        if (!name || !password) {
            console.log('Missing required fields');
            return res.status(400).json({ 
                success: false, 
                message: 'Name and password are required' 
            });
        }

        if (registrationType === 'email' && !email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required for email registration'
            });
        }

        if (registrationType === 'phone' && !phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required for phone registration'
            });
        }

        // Validate email format if email registration
        if (registrationType === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                console.log('Invalid email format');
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid email format' 
                });
            }
        }

        // Validate phone format if phone registration
        if (registrationType === 'phone') {
            const phoneRegex = /^\d{10}$/;
            if (!phoneRegex.test(phone)) {
                console.log('Invalid phone format');
                return res.status(400).json({ 
                    success: false, 
                    message: 'Phone number must be 10 digits' 
                });
            }
        }

        // Check if user already exists
        const query = {};
        if (registrationType === 'email') {
            query.email = email;
        } else if (registrationType === 'phone') {
            query.phone = phone;
        }

        const existingUser = await User.findOne(query);
        if (existingUser) {
            console.log('User already exists:', existingUser.email || existingUser.phone);
            return res.status(400).json({ 
                success: false, 
                message: `${registrationType === 'email' ? 'Email' : 'Phone number'} already registered` 
            });
        }

        // Generate OTP based on registration type
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        console.log('Generated OTP:', otp);

        // Create new user with unverified status
        const userData = {
            name,
            password,
            gender: null,
            age: null,
            isEmailVerified: false,
            isPhoneVerified: registrationType === 'phone' ? false : false
        };

        if (registrationType === 'email') {
            userData.email = email;
            userData.emailVerificationOTP = {
                otp,
                expiresAt: otpExpiry
            };
        } else {
            userData.phone = phone;
            userData.phoneVerificationOTP = {
                otp,
                expiresAt: otpExpiry
            };
        }

        const user = new User(userData);

        console.log('Attempting to save user...');
        await user.save();
        console.log('User saved successfully');

        // Send verification based on registration type
        if (registrationType === 'email') {
            console.log('Sending verification email...');
            const emailSent = await sendVerificationEmail(email, otp);
            if (!emailSent) {
                await User.findByIdAndDelete(user._id);
                console.log('Failed to send verification email');
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error sending verification email. Please try again.' 
                });
            }
            console.log('Verification email sent successfully');
        } else if (registrationType === 'phone') {
            console.log('Sending verification SMS...');
            const message = `Your verification code is: ${otp}. Valid for 10 minutes.`;
            try {
                const smsSent = await sendSMS(phone, message);
                if (!smsSent) {
                    await User.findByIdAndDelete(user._id);
                    console.log('Failed to send verification SMS');
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Unable to send SMS. Please check your phone number and try again.' 
                    });
                }
                console.log('Verification SMS sent successfully');
            } catch (smsError) {
                console.error('SMS sending error:', smsError);
                await User.findByIdAndDelete(user._id);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error sending SMS. Please try again later.' 
                });
            }
        }

        res.status(201).json({
            success: true,
            message: `Registration successful. Please verify your ${registrationType}.`
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Error during registration. Please try again.'
        });
    }
});

// Verify OTP route
router.post('/verify-email', async (req, res) => {
    try {
        const { email, otp } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ success: false, message: 'Email already verified' });
        }

        if (!user.emailVerificationOTP || !user.emailVerificationOTP.otp) {
            return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
        }

        if (user.emailVerificationOTP.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
        }

        if (user.emailVerificationOTP.otp !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        // Update user verification status
        user.isEmailVerified = true;
        user.emailVerificationOTP = undefined;
        await user.save();

        res.json({ success: true, message: 'Email verified successfully' });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ success: false, message: 'Error verifying email' });
    }
});

// Resend OTP route
router.post('/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ success: false, message: 'Email already verified' });
        }

        // Generate new OTP
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Update user's OTP
        user.emailVerificationOTP = {
            otp,
            expiresAt: otpExpiry
        };
        await user.save();

        // Send new verification email
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.status(500).json({ success: false, message: 'Error sending verification email' });
        }

        res.json({ success: true, message: 'New OTP sent successfully' });
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ success: false, message: 'Error sending new OTP' });
    }
});

// Login route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (!user.isEmailVerified) {
            return res.status(401).json({ success: false, message: 'Please verify your email first' });
        }

        // Compare passwords directly
        if (user.password !== password) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Set user session
        req.session.user = user;
        res.json({ success: true, message: 'Login successful' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Error during login' });
    }
});

// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Profile route
router.get('/profile', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }
        const user = await User.findById(req.session.user._id);
        res.render('profile', { user });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ message: 'Error loading profile' });
    }
});

// Update profile route
router.post('/update-profile', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const { name, gender, age } = req.body;
        const user = await User.findById(req.session.user._id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Validate gender value
        if (gender && !['male', 'female', 'other'].includes(gender)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid gender value. Must be one of: male, female, other' 
            });
        }

        user.name = name;
        user.gender = gender || null; // Set to null if empty string
        user.age = age;

        await user.save();
        req.session.user = user;

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Error updating profile' });
    }
});

// Delete profile route
router.post('/delete-profile', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        await User.findByIdAndDelete(req.session.user._id);
        req.session.destroy();

        res.json({ success: true, message: 'Profile deleted successfully' });
    } catch (error) {
        console.error('Delete profile error:', error);
        res.status(500).json({ success: false, message: 'Error deleting profile' });
    }
});

// Send Phone OTP for Login
router.post('/send-phone-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        console.log('Send phone OTP request for:', phone);

        // Validate phone format
        const phoneRegex = /^\d{10}$/;
        if (!phoneRegex.test(phone)) {
            console.log('Invalid phone format:', phone);
            return res.status(400).json({
                success: false,
                message: 'Invalid phone number format'
            });
        }

        // Find user by phone number
        console.log('Finding user with phone:', phone);
        const user = await User.findOne({ phone });
        if (!user) {
            console.log('No user found with phone:', phone);
            return res.status(404).json({
                success: false,
                message: 'No account found with this phone number'
            });
        }
        console.log('User found:', user._id);

        // Generate OTP
        const otp = generateOTP();
        console.log('Generated OTP for phone verification:', otp);
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Save OTP to user document
        user.phoneVerificationOTP = {
            otp,
            expiresAt: otpExpiry
        };
        console.log('Saving OTP to user document...');
        await user.save();
        console.log('OTP saved successfully');

        // Send OTP via SMS
        const message = `Your verification code is: ${otp}. Valid for 10 minutes.`;
        console.log('Preparing to send SMS...');
        try {
            console.log('Calling sendSMS function...');
            const smsSent = await sendSMS(phone, message);
            console.log('SMS send result:', smsSent);

            if (!smsSent) {
                console.log('SMS sending failed, clearing OTP...');
                // If SMS fails, clear the OTP
                user.phoneVerificationOTP = undefined;
                await user.save();
                return res.status(500).json({
                    success: false,
                    message: 'Failed to send OTP. Please try again.'
                });
            }

            console.log('SMS sent successfully');
            res.json({
                success: true,
                message: 'OTP sent successfully to your phone'
            });
        } catch (smsError) {
            console.error('SMS sending error details:', {
                message: smsError.message,
                stack: smsError.stack,
                response: smsError.response?.data
            });
            // If SMS fails, clear the OTP
            user.phoneVerificationOTP = undefined;
            await user.save();
            return res.status(500).json({
                success: false,
                message: 'Error sending OTP. Please try again later.'
            });
        }
    } catch (error) {
        console.error('Send phone OTP error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({
            success: false,
            message: 'Error processing request. Please try again.'
        });
    }
});

// Verify Phone OTP for Login
router.post('/verify-phone-otp', async (req, res) => {
    try {
        const { phone, otp } = req.body;

        // Find user by phone number
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'No account found with this phone number'
            });
        }

        // Check if OTP exists and is valid
        if (!user.phoneVerificationOTP || !user.phoneVerificationOTP.otp) {
            return res.status(400).json({
                success: false,
                message: 'No OTP found. Please request a new OTP'
            });
        }

        // Check if OTP has expired
        if (new Date() > user.phoneVerificationOTP.expiresAt) {
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new OTP'
            });
        }

        // Verify OTP
        if (user.phoneVerificationOTP.otp !== otp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP'
            });
        }

        // Clear OTP after successful verification
        user.phoneVerificationOTP = undefined;
        user.isPhoneVerified = true;
        await user.save();

        // Set user session
        req.session.user = user.toObject();
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        res.json({
            success: true,
            message: 'Phone number verified successfully',
            redirect: user.isSuperAdmin ? '/superadmin-dashboard' : '/dashboard'
        });
    } catch (error) {
        console.error('Verify phone OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying OTP'
        });
    }
});

// Resend Phone OTP
router.post('/resend-phone-otp', async (req, res) => {
    try {
        const { phone } = req.body;

        // Find user by phone number
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'No account found with this phone number'
            });
        }

        // Generate new OTP
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Save new OTP to user document
        user.phoneVerificationOTP = {
            otp,
            expiresAt: otpExpiry
        };
        await user.save();

        // Send new OTP via SMS
        const message = `Your new verification code is: ${otp}. Valid for 10 minutes.`;
        const smsSent = await sendSMS(phone, message);

        if (!smsSent) {
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP. Please try again.'
            });
        }

        res.json({
            success: true,
            message: 'New OTP sent successfully to your phone'
        });
    } catch (error) {
        console.error('Resend phone OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Error resending OTP'
        });
    }
});

// Verify Phone OTP for Registration
router.post('/verify-phone', async (req, res) => {
    try {
        const { phone, otp } = req.body;

        // Find user by phone number
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'No account found with this phone number'
            });
        }

        // Check if OTP exists and is valid
        if (!user.phoneVerificationOTP || !user.phoneVerificationOTP.otp) {
            return res.status(400).json({
                success: false,
                message: 'No OTP found. Please request a new OTP'
            });
        }

        // Check if OTP has expired
        if (new Date() > user.phoneVerificationOTP.expiresAt) {
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new OTP'
            });
        }

        // Verify OTP
        if (user.phoneVerificationOTP.otp !== otp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP'
            });
        }

        // Clear OTP after successful verification
        user.phoneVerificationOTP = undefined;
        user.isPhoneVerified = true;
        await user.save();

        res.json({
            success: true,
            message: 'Phone number verified successfully. You can now login.'
        });
    } catch (error) {
        console.error('Verify phone OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying OTP'
        });
    }
});

// Add Email route
router.post('/add-email', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const { email } = req.body;
        const user = await User.findById(req.session.user._id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }

        // Check if email is already registered
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Update user document
        user.email = email;
        user.emailVerificationOTP = {
            otp,
            expiresAt: otpExpiry
        };
        await user.save();

        // Send verification email
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.status(500).json({ success: false, message: 'Error sending verification email' });
        }

        res.json({ success: true, message: 'Email added successfully. Please verify with OTP.' });
    } catch (error) {
        console.error('Add email error:', error);
        res.status(500).json({ success: false, message: 'Error adding email' });
    }
});

// Add Phone route
router.post('/add-phone', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const { phone } = req.body;
        const user = await User.findById(req.session.user._id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Validate phone format
        const phoneRegex = /^\d{10}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ success: false, message: 'Invalid phone number format' });
        }

        // Check if phone is already registered
        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Phone number already registered' });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Update user document
        user.phone = phone;
        user.phoneVerificationOTP = {
            otp,
            expiresAt: otpExpiry
        };
        await user.save();

        // Send verification SMS
        const message = `Your verification code is: ${otp}. Valid for 10 minutes.`;
        const smsSent = await sendSMS(phone, message);
        if (!smsSent) {
            return res.status(500).json({ success: false, message: 'Error sending verification SMS' });
        }

        res.json({ success: true, message: 'Phone added successfully. Please verify with OTP.' });
    } catch (error) {
        console.error('Add phone error:', error);
        res.status(500).json({ success: false, message: 'Error adding phone' });
    }
});

// Send Email OTP route
router.post('/send-email-otp', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const user = await User.findById(req.session.user._id);
        if (!user || !user.email) {
            return res.status(404).json({ success: false, message: 'User or email not found' });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Update user document
        user.emailVerificationOTP = {
            otp,
            expiresAt: otpExpiry
        };
        await user.save();

        // Send verification email
        const emailSent = await sendVerificationEmail(user.email, otp);
        if (!emailSent) {
            return res.status(500).json({ success: false, message: 'Error sending verification email' });
        }

        // Update session
        req.session.user = user;

        res.json({ success: true, message: 'OTP sent successfully to your email' });
    } catch (error) {
        console.error('Send email OTP error:', error);
        res.status(500).json({ success: false, message: 'Error sending OTP' });
    }
});

// Verify Email OTP route
router.post('/verify-email-otp', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const { otp } = req.body;
        const user = await User.findById(req.session.user._id);

        if (!user || !user.email) {
            return res.status(404).json({ success: false, message: 'User or email not found' });
        }

        // Check if OTP exists and is valid
        if (!user.emailVerificationOTP || !user.emailVerificationOTP.otp) {
            return res.status(400).json({ success: false, message: 'No OTP found. Please request a new OTP.' });
        }

        // Check if OTP has expired
        if (new Date() > user.emailVerificationOTP.expiresAt) {
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP.' });
        }

        // Verify OTP
        if (user.emailVerificationOTP.otp !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        // Update user verification status
        user.isEmailVerified = true;
        user.emailVerificationOTP = undefined;
        await user.save();

        // Update session
        req.session.user = user;

        res.json({ success: true, message: 'Email verified successfully' });
    } catch (error) {
        console.error('Verify email OTP error:', error);
        res.status(500).json({ success: false, message: 'Error verifying OTP' });
    }
});

// Resend Email OTP route
router.post('/resend-email-otp', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const user = await User.findById(req.session.user._id);
        if (!user || !user.email) {
            return res.status(404).json({ success: false, message: 'User or email not found' });
        }

        // Generate new OTP
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Update user document
        user.emailVerificationOTP = {
            otp,
            expiresAt: otpExpiry
        };
        await user.save();

        // Send verification email
        const emailSent = await sendVerificationEmail(user.email, otp);
        if (!emailSent) {
            return res.status(500).json({ success: false, message: 'Error sending verification email' });
        }

        res.json({ success: true, message: 'New OTP sent successfully to your email' });
    } catch (error) {
        console.error('Resend email OTP error:', error);
        res.status(500).json({ success: false, message: 'Error sending new OTP' });
    }
});

module.exports = router;