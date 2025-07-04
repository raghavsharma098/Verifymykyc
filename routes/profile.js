const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// Helper function to deduct token
async function deductToken(userId, serviceName) {
    const user = await User.findById(userId);
    if (!user || user.tokens[serviceName] <= 0) {
        throw new Error(`No tokens available for ${serviceName} verification`);
    }
    user.tokens[serviceName] -= 1;
    await user.save();
    return user;
}

// Personal Profile Routes
router.get('/fetch-personal', isAuthenticated, (req, res) => {
    res.render('profile-fetch-personal');
});

router.post('/fetch-personal', isAuthenticated, async (req, res) => {
    try {
        // Deduct token first
        const user = await deductToken(req.session.user._id, 'profile');
        req.session.user = user; // Update session with new token count

        const formData = {
            phone: req.body.phone,
            first_name: req.body.full_name.split(' ')[0],
            full_name: req.body.full_name,
            date_of_birth: req.body.date_of_birth,
            pan: req.body.pan,
            address: req.body.address,
            state: req.body.state,
            pincode: req.body.pincode,
            consent: 'Y',
            consent_text: 'I hereby provide my consent to fetch my personal profile information.'
        };

        const options = {
            method: 'POST',
            url: 'https://api.gridlines.io/profile-api/individual/fetch-personal-profile',
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-API-Key': 'yjVR74jEmdRwhn8GzO6Fpr2pZ3lE6Q28'
            },
            data: formData
        };

        const response = await axios.request(options);
        
        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize profilePersonalHistory array if it doesn't exist
        if (!user.documents.profilePersonalHistory) {
            user.documents.profilePersonalHistory = [];
        }

        // Create verification data
        const verificationData = {
            phone: formData.phone,
            firstName: formData.first_name,
            fullName: formData.full_name,
            dateOfBirth: new Date(formData.date_of_birth),
            pan: formData.pan,
            address: formData.address,
            state: formData.state,
            pincode: formData.pincode,
            data: response.data,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.profilePersonalHistory.push(verificationData);
        
        // Update latest profile personal verification
        user.documents.latestProfilePersonal = verificationData;
        
        // Save user document
        await user.save();
        console.log('Personal profile verification saved successfully for user:', user._id);

        // Get fresh user data to ensure accurate token count
        const updatedUser = await User.findById(req.session.user._id);
        req.session.user = updatedUser;

        res.json({ 
            success: true, 
            data: response.data,
            remainingTokens: updatedUser.tokens.profile,
            message: 'Profile fetched successfully'
        });
    } catch (error) {
        console.error('Profile verification error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.response?.data?.message || error.message 
        });
    }
});

// National IDs Routes
router.get('/fetch-national-ids', isAuthenticated, (req, res) => {
    res.render('profile-fetch-national-ids');
});

router.post('/fetch-national-ids', isAuthenticated, async (req, res) => {
    try {
        // Deduct token first
        const user = await deductToken(req.session.user._id, 'profile');
        req.session.user = user;

        const options = {
            method: 'POST',
            url: 'https://api.gridlines.io/profile-api/individual/fetch-national-ids',
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-API-Key': 'yjVR74jEmdRwhn8GzO6Fpr2pZ3lE6Q28'
            },
            data: req.body
        };

        const response = await axios.request(options);
        
        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize profileNationalIdsHistory array if it doesn't exist
        if (!user.documents.profileNationalIdsHistory) {
            user.documents.profileNationalIdsHistory = [];
        }

        // Create verification data
        const verificationData = {
            phone: req.body.phone,
            firstName: req.body.first_name,
            fullName: req.body.full_name,
            dateOfBirth: new Date(req.body.date_of_birth),
            pan: req.body.pan,
            address: req.body.address,
            state: req.body.state,
            pincode: req.body.pincode,
            data: response.data,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.profileNationalIdsHistory.push(verificationData);
        
        // Update latest profile national IDs verification
        user.documents.latestProfileNationalIds = verificationData;
        
        // Save user document
        await user.save();
        console.log('National IDs verification saved successfully for user:', user._id);

        // Get fresh user data
        const updatedUser = await User.findById(req.session.user._id);
        req.session.user = updatedUser;

        res.json({ 
            success: true, 
            data: response.data,
            remainingTokens: updatedUser.tokens.profile,
            message: 'National IDs fetched successfully'
        });
    } catch (error) {
        console.error('Profile verification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Address Routes
router.get('/fetch-address', isAuthenticated, (req, res) => {
    res.render('profile-fetch-address');
});

router.post('/fetch-address', isAuthenticated, async (req, res) => {
    try {
        // Deduct token first
        const user = await deductToken(req.session.user._id, 'profile');
        req.session.user = user;

        const options = {
            method: 'POST',
            url: 'https://api.gridlines.io/profile-api/individual/fetch-address',
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-API-Key': 'yjVR74jEmdRwhn8GzO6Fpr2pZ3lE6Q28'
            },
            data: req.body
        };

        const response = await axios.request(options);
        
        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize profileAddressHistory array if it doesn't exist
        if (!user.documents.profileAddressHistory) {
            user.documents.profileAddressHistory = [];
        }

        // Create verification data
        const verificationData = {
            phone: req.body.phone,
            firstName: req.body.first_name,
            fullName: req.body.full_name,
            dateOfBirth: new Date(req.body.date_of_birth),
            pan: req.body.pan,
            address: req.body.address,
            state: req.body.state,
            pincode: req.body.pincode,
            data: response.data,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.profileAddressHistory.push(verificationData);
        
        // Update latest profile address verification
        user.documents.latestProfileAddress = verificationData;
        
        // Save user document
        await user.save();
        console.log('Address verification saved successfully for user:', user._id);

        // Get fresh user data
        const updatedUser = await User.findById(req.session.user._id);
        req.session.user = updatedUser;

        res.json({ 
            success: true, 
            data: response.data,
            remainingTokens: updatedUser.tokens.profile,
            message: 'Address fetched successfully'
        });
    } catch (error) {
        console.error('Profile verification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PAN Routes
router.get('/fetch-pan', isAuthenticated, (req, res) => {
    res.render('profile-fetch-pan');
});

router.post('/fetch-pan', isAuthenticated, async (req, res) => {
    try {
        // Deduct token first
        const user = await deductToken(req.session.user._id, 'profile');
        req.session.user = user;

        const options = {
            method: 'POST',
            url: 'https://api.gridlines.io/profile-api/individual/fetch-pan',
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-API-Key': 'yjVR74jEmdRwhn8GzO6Fpr2pZ3lE6Q28'
            },
            data: req.body
        };

        const response = await axios.request(options);
        
        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize profilePanHistory array if it doesn't exist
        if (!user.documents.profilePanHistory) {
            user.documents.profilePanHistory = [];
        }

        // Create verification data
        const verificationData = {
            phone: req.body.phone,
            firstName: req.body.first_name,
            fullName: req.body.full_name,
            dateOfBirth: new Date(req.body.date_of_birth),
            pan: req.body.pan,
            address: req.body.address,
            state: req.body.state,
            pincode: req.body.pincode,
            data: response.data,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.profilePanHistory.push(verificationData);
        
        // Update latest profile PAN verification
        user.documents.latestProfilePan = verificationData;
        
        // Save user document
        await user.save();
        console.log('PAN verification saved successfully for user:', user._id);

        // Get fresh user data
        const updatedUser = await User.findById(req.session.user._id);
        req.session.user = updatedUser;

        res.json({ 
            success: true, 
            data: response.data,
            remainingTokens: updatedUser.tokens.profile,
            message: 'PAN details fetched successfully'
        });
    } catch (error) {
        console.error('Profile verification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router; 