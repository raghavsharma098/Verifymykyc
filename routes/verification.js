const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const { generatePDF, LEGAL_DISCLAIMER } = require('../utils/pdfGenerator');

// Gridlines API configuration
const GRIDLINES_API_KEY = 'yjVR74jEmdRwhn8GzO6Fpr2pZ3lE6Q28';
const GRIDLINES_API_URL = 'https://api.gridlines.io';

// Quick EKYC API configuration
const QUICK_EKYC_API_KEY = 'efa6b816-b55b-4fae-b528-4d33019e2404';
const QUICK_EKYC_API_URL = 'https://api.quickekyc.com';

const services = {
    gst: {
        name: 'GST Verification',
        description: 'Verify GST details including business name, address, and registration status.',
        price: 100,
        options: [
            {
                id: 'gst',
                name: 'GST Verification',
                description: 'Verify GST details'
            },
            {
                id: 'company',
                name: 'Company Details',
                description: 'Verify company details using CIN number'
            },
            {
                id: 'din',
                name: 'DIN Verification',
                description: 'Verify Director Identification Number'
            },
            {
                id: 'udyam',
                name: 'Udyam Verification',
                description: 'Verify Udyog Aadhaar details'
            }
        ]
    },
    pan: {
        name: 'PAN Verification',
        description: 'Verify PAN details including name and status.',
        price: 100
    },
    voter: {
        name: 'Voter ID Verification',
        description: 'Verify Voter ID details including name, age, and constituency.',
        price: 100
    },
    dl: {
        name: 'Driving License Verification',
        description: 'Verify Driving License details including name, validity, and vehicle classes.',
        price: 100
    },
    aadhar: {
        name: 'Aadhar Verification',
        description: 'Verify Aadhar details including name, address, and biometric verification.',
        price: 100
    },
    employee: {
        name: 'Employee Verification',
        description: 'Verify employee details through EPFO using UAN, PAN, or employer details.',
        price: 200,
        options: [
            {
                id: 'uan',
                name: 'UAN Verification',
                description: 'Verify using UAN number'
            },
            {
                id: 'pan',
                name: 'PAN Verification',
                description: 'Verify using PAN number'
            },
            {
                id: 'employer',
                name: 'Employer Verification',
                description: 'Verify using employer details'
            }
        ]
    }
};

// Additional verification services using Quick EKYC
const additionalServices = {
    bank: {
        name: 'Bank Account Verification',
        description: 'Verify bank account details including account holder name and account status.',
        price: 150
    },
    passport: {
        name: 'Passport Verification',
        description: 'Verify passport details including name, nationality, and validity.',
        price: 200
    },
    face: {
        name: 'Face Verification',
        description: 'Verify face match with government ID documents.',
        price: 100
    },
    rc: {
        name: 'RC Verification',
        description: 'Verify vehicle registration certificate details including owner name, vehicle details, and validity.',
        price: 150
    }
};

// Aadhar verification page route
router.get('/aadhar-verify', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }

        res.render('aadhar-verify', { 
            user: user,
            error: null
        });
    } catch (error) {
        console.error('Error loading Aadhar verification page:', error);
        res.status(500).render('error', {
            message: 'Error loading Aadhar verification page'
        });
    }
});

// Aadhar verification route
router.post('/aadhar-verify', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const { aadhar_number, otp } = req.body;
        
        // Validate required fields
        if (!aadhar_number || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields. Please enter your Aadhar number and OTP.'
            });
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Call Gridlines API to verify OTP
        const requestBody = {
            aadhaar_number: aadhar_number,
            otp: otp,
            reference_id: user.aadharVerificationOTP?.reference_id
        };

        const response = await axios.post(`${GRIDLINES_API_URL}/aadhaar-api/boson/verify-otp`, requestBody, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY,
                'X-Auth-Type': 'API-Key'
            }
        });

        if (!response.data) {
            throw new Error('Invalid response from Gridlines API');
        }

        // Check for specific error codes
        if (response.data.code === '1001') {
            return res.json({
                success: false,
                message: 'No Aadhar records were found for the provided details.'
            });
        }

        if (response.data.code === '1002') {
            return res.json({
                success: false,
                message: 'Invalid Aadhar number format.'
            });
        }

        if (response.data.code === '1003') {
            return res.json({
                success: false,
                message: 'Invalid OTP.'
            });
        }

        // Update user document with Aadhar verification status
        user.isAadharVerified = true;
        user.aadharNumber = aadhar_number;
        user.aadharVerificationOTP = null; // Clear OTP data
        await user.save();

        // Update session
        req.session.user = user;

        res.json({
            success: true,
            message: 'Aadhar verified successfully'
        });
    } catch (error) {
        console.error('Aadhar verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying Aadhar'
        });
    }
});

// Fetch Aadhar details
router.post('/fetch-aadhar', async (req, res) => {
    try {
        const { aadhar_number, consent } = req.body;
        
        // Validate required fields
        if (!aadhar_number || !consent) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields. Please enter your Aadhar number and provide consent.'
            });
        }

        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification'
            });
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.aadhar || user.tokens.aadhar <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for Aadhar verification. Please purchase tokens first.'
            });
        }

        // Call Gridlines API to generate OTP
        const requestBody = {
            aadhaar_number: aadhar_number,
            consent: "Y"
        };

        const response = await axios.post(`${GRIDLINES_API_URL}/aadhaar-api/boson/generate-otp`, requestBody, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY,
                'X-Auth-Type': 'API-Key'
            }
        });

        if (!response.data) {
            throw new Error('Invalid response from Gridlines API');
        }

        // Check for specific error codes
        if (response.data.code === '1001') {
            return res.json({
                success: false,
                message: 'No Aadhar records were found for the provided details.'
            });
        }

        if (response.data.code === '1002') {
            return res.json({
                success: false,
                message: 'Invalid Aadhar number format.'
            });
        }

        if (response.data.code === '1003') {
            return res.json({
                success: false,
                message: 'Consent not provided.'
            });
        }

        // Return success response with OTP reference
        res.json({
            success: true,
            message: 'OTP sent successfully',
            data: {
                reference_id: response.data.reference_id
            }
        });

    } catch (error) {
        console.error('Error in Aadhar OTP generation:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });

        // Handle specific error cases
        if (error.response) {
            if (error.response.status === 401) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid API credentials'
                });
            }
            if (error.response.status === 429) {
                return res.status(429).json({
                    success: false,
                    message: 'Too many requests. Please try again later.'
                });
            }
            return res.status(error.response.status).json({
                success: false,
                message: error.response.data.message || 'Error generating OTP'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error generating OTP. Please try again later.'
        });
    }
});

// Fetch PAN details
router.post('/fetch-pan', async (req, res) => {
    try {
        const { panNumber, name, date_of_birth, consent } = req.body;
        
        // Validate required fields
        if (!panNumber || !name || !date_of_birth || !consent) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields. Please enter PAN number, name, date of birth and provide consent.'
            });
        }

        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification'
            });
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens.pan || user.tokens.pan <= 0) {
            return res.status(400).json({
                success: false,
                message: 'No PAN verification tokens available'
            });
        }

        console.log('Making PAN verification request:', {
            pan_id: panNumber,
            name: name,
            date_of_birth: date_of_birth,
            consent: consent
        });

        // Call Gridlines API to verify PAN
        const response = await axios.post(`${GRIDLINES_API_URL}/pan-api/v3/verify`, {
            pan_id: panNumber,
            name: name,
            date_of_birth: date_of_birth,
            consent: "Y"
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY,
                'X-Auth-Type': 'API-Key'
            }
        });

        console.log('PAN verification response:', response.data);

        if (!response.data || !response.data.data) {
            throw new Error('Invalid response from Gridlines API');
        }

        // Check if no records were found
        if (response.data.data.code === '1001') {
            return res.json({
                success: false,
                message: 'No PAN records were found for the provided details.',
                remainingTokens: user.tokens.pan
            });
        }

        // Deduct one token
        user.tokens.pan -= 1;

        // Add token usage record
        if (!user.tokenUsage) {
            user.tokenUsage = [];
        }
        user.tokenUsage.push({
            service: 'pan',
            action: 'used',
            amount: 1,
            timestamp: new Date(),
            details: 'PAN verification'
        });

        // Update user's PAN details
        user.documents.pan = {
            number: panNumber,
            name: response.data.data.name || 'N/A',
            status: response.data.data.status || 'N/A',
            type: response.data.data.type || 'N/A',
            verified: true,
            verificationDate: new Date()
        };

        await user.save();

        // Update session with new token count
        req.session.user = user.toObject();

        // Return success response
        res.json({
            success: true,
            message: 'PAN verified successfully',
            data: {
                panNumber: panNumber,
                name: response.data.data.name || 'N/A',
                status: response.data.data.status || 'N/A',
                type: response.data.data.type || 'N/A',
                remainingTokens: user.tokens.pan
            }
        });
    } catch (error) {
        console.error('Error in PAN verification:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });

        // Handle specific error cases
        if (error.response?.status === 403) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: The API key does not have permission to access PAN verification services.'
            });
        }

        res.status(500).json({
            success: false,
            message: error.response?.data?.message || error.message || 'Error verifying PAN'
        });
    }
});

// Send OTP for Aadhar verification
router.post('/send-otp', async (req, res) => {
    try {
        const { aadharNumber } = req.body;
        
        // Validate required fields
        if (!aadharNumber) {
            return res.status(400).json({
                success: false,
                message: 'Please enter your Aadhar number.'
            });
        }

        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification'
            });
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.aadhar || user.tokens.aadhar <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for Aadhar verification. Please purchase tokens first.'
            });
        }

        console.log('Sending Aadhar OTP request:', { aadharNumber });
        
        // Call Gridlines API to generate OTP
        const requestBody = {
            aadhaar_number: aadharNumber,
            consent: "Y"
        };
        console.log('Sending request to Gridlines API:', requestBody);

        const response = await axios.post(`${GRIDLINES_API_URL}/aadhaar-api/boson/generate-otp`, requestBody, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY,
                'X-Auth-Type': 'API-Key'
            }
        });

        console.log('Received response from Gridlines API:', response.data);

        if (!response.data || !response.data.data) {
            throw new Error('Invalid response from Gridlines API');
        }

        // Store transaction ID in session for OTP verification
        req.session.aadharTransactionId = response.data.data.transaction_id;

        res.json({ 
            success: true, 
            message: 'OTP sent successfully',
            transactionId: response.data.data.transaction_id
        });
    } catch (error) {
        console.error('Error sending Aadhar OTP:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });

        let errorMessage = 'Error sending OTP';
        if (error.response?.status === 403) {
            errorMessage = 'Access denied: The API key does not have permission to access Aadhar verification services.';
        } else if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(error.response?.status || 500).json({
            success: false,
            message: errorMessage
        });
    }
});

// Verify Aadhar with OTP
router.post('/verify-aadhar', async (req, res) => {
    try {
        const { otp, shareCode } = req.body;
        
        // Validate required fields
        if (!otp) {
            return res.status(400).json({
                success: false,
                message: 'Please enter the OTP.'
            });
        }

        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification'
            });
        }

        // Check if transaction ID exists
        if (!req.session.aadharTransactionId) {
            return res.status(400).json({
                success: false,
                message: 'No active Aadhar verification session. Please generate OTP first.'
            });
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log('Submitting Aadhar OTP:', { otp, shareCode });
        
        // Call Gridlines API to verify OTP
        const requestBody = {
            otp: otp,
            include_xml: true,
            share_code: shareCode || "1234"
        };
        console.log('Sending request to Gridlines API:', requestBody);

        const response = await axios.post(`${GRIDLINES_API_URL}/aadhaar-api/boson/submit-otp`, requestBody, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY,
                'X-Auth-Type': 'API-Key',
                'X-Transaction-ID': req.session.aadharTransactionId
            }
        });

        console.log('Received response from Gridlines API:', response.data);

        if (!response.data || !response.data.data) {
            throw new Error('Invalid response from Gridlines API');
        }

        // Extract Aadhar details from response
        const aadharData = response.data.data.aadhaar_data;
        if (!aadharData) {
            throw new Error('No Aadhar data found in API response');
        }

        console.log('Extracted Aadhar data:', aadharData);

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize verifications array if it doesn't exist
        if (!user.documents.verifications) {
            user.documents.verifications = [];
        }

        // Initialize aadharHistory array if it doesn't exist
        if (!user.documents.aadharHistory) {
            user.documents.aadharHistory = [];
        }

        // Create verification object
        const verificationData = {
            service: 'aadhar',
            result: {
                data: {
                    data: {
                        aadhaar_data: aadharData
                    },
                    verificationDate: new Date()
                }
            }
        };

        // Add to verifications array
        user.documents.verifications.push(verificationData);
        
        // Add to aadharHistory array
        user.documents.aadharHistory.push({
            number: aadharData.aadhaar_number || aadharData.reference_id,
            name: aadharData.name,
            gender: aadharData.gender,
            dateOfBirth: aadharData.date_of_birth,
            careOf: aadharData.care_of,
            house: aadharData.house,
            locality: aadharData.locality,
            district: aadharData.district,
            state: aadharData.state,
            pincode: aadharData.pincode,
            landmark: aadharData.landmark,
            postOffice: aadharData.post_office_name,
            vtcName: aadharData.vtc_name,
            country: aadharData.country,
            documentType: aadharData.document_type,
            referenceId: aadharData.reference_id,
            verified: true,
            verificationDate: new Date()
        });
        
        // Update latest Aadhar verification
        user.documents.aadhar = {
            number: aadharData.aadhaar_number,
            name: aadharData.name,
            gender: aadharData.gender,
            dateOfBirth: aadharData.date_of_birth,
            address: aadharData.address,
            verified: true,
            verificationDate: new Date()
        };
        
        // Deduct one token
        user.tokens.aadhar -= 1;
        
        // Save user document
        await user.save();
        console.log('Aadhar verification saved successfully for user:', user._id);

        // Clear transaction ID from session
        delete req.session.aadharTransactionId;

        // Update session with new token count
        req.session.user = user.toObject();

        // Return success response with complete Aadhar data
        res.json({
            success: true,
            message: 'Aadhar verified successfully',
            data: {
                data: {
                    aadhaar_data: aadharData
                },
                verificationDate: new Date(),
                remainingTokens: user.tokens.aadhar
            }
        });
    } catch (error) {
        console.error('Error verifying Aadhar:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });

        let errorMessage = 'Error verifying Aadhar';
        if (error.response?.status === 403) {
            errorMessage = 'Access denied: The API key does not have permission to access Aadhar verification services.';
        } else if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(error.response?.status || 500).json({
            success: false,
            message: errorMessage
        });
    }
});

// Get verification status
router.get('/status/:phone', async (req, res) => {
    try {
        const phone = req.params.phone;
        console.log('Checking verification status for phone:', phone);

        const user = await User.findOne({ phone });
        if (!user) {
            console.log('User not found for phone:', phone);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const responseData = { success: true, documents: user.documents };
        console.log('Sending verification status:', responseData);
        res.json(responseData);
    } catch (error) {
        console.error('Error getting verification status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error getting verification status',
            error: error.message
        });
    }
});

// Fetch Voter ID details
router.post('/fetch-voter', async (req, res) => {
    try {
        const { voter_id, consent } = req.body;
        
        // Validate required fields
        if (!voter_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields. Please enter your Voter ID number.'
            });
        }

        if (!consent) {
            return res.status(400).json({
                success: false,
                message: 'Please provide consent to fetch Voter ID details.'
            });
        }

        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification'
            });
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.voter || user.tokens.voter <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for Voter ID verification. Please purchase tokens first.'
            });
        }

        console.log('Received Voter ID verification request:', { voter_id });
        
        // Call Gridlines API to fetch Voter ID details
        const options = {
            method: 'POST',
            url: 'https://api.gridlines.io/voter-api/boson/fetch',
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY
            },
            data: {
                voter_id,
                consent: "Y"
            }
        };

        console.log('Sending request to Gridlines API:', options.data);

        const response = await axios.request(options);

        console.log('Received response from Gridlines API:', response.data);

        if (!response.data || !response.data.data) {
            throw new Error('Invalid response from Gridlines API');
        }

        // Check if no records were found
        if (response.data.data.code === '1004') {
            return res.json({
                success: false,
                message: 'No voter records were found for the provided Voter ID.'
            });
        }

        // Extract Voter ID details from response
        const voterData = response.data.data.voter_data;
        const { 
            name,
            age,
            gender,
            district,
            state,
            assembly_constituency_name,
            parliamentary_constituency_name,
            part_name,
            polling_station,
            husband_name
        } = voterData;

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize voterHistory array if it doesn't exist
        if (!user.documents.voterHistory) {
            user.documents.voterHistory = [];
        }

        // Create verification data
        const verificationData = {
            number: voter_id,
            name,
            age,
            gender,
            district,
            state,
            assemblyConstituency: assembly_constituency_name,
            parliamentaryConstituency: parliamentary_constituency_name,
            partName: part_name,
            pollingStation: polling_station,
            husbandName: husband_name,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.voterHistory.push(verificationData);
        
        // Update latest voter verification
        user.documents.latestVoter = verificationData;
        
        // Deduct one token
        user.tokens.voter -= 1;
        
        // Save user document
        await user.save();
        console.log('Voter ID verification saved successfully for user:', user._id);

        // Update session with new token count and verification history
        req.session.user = user.toObject();

        // Return JSON response
        res.json({
            success: true,
            message: 'Voter ID details fetched successfully',
            data: {
                name,
                husbandName: husband_name,
                age,
                gender,
                district,
                state,
                assemblyConstituency: assembly_constituency_name,
                parliamentaryConstituency: parliamentary_constituency_name,
                partName: part_name,
                pollingStation: polling_station,
                verificationDate: new Date().toLocaleDateString(),
                remainingTokens: user.tokens.voter
            }
        });
    } catch (error) {
        console.error('Error in Voter ID verification:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });

        // Handle specific error cases
        let errorMessage = 'Error fetching Voter ID details';
        if (error.response?.status === 403) {
            errorMessage = 'Access denied: The API key does not have permission to access Voter ID verification services. Please contact support.';
        } else if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(error.response?.status || 500).json({
            success: false,
            message: errorMessage
        });
    }
});

// Fetch GST details
router.post('/fetch-gst', async (req, res) => {
    try {
        const { gstin, consent } = req.body;
        
        // Validate required fields
        if (!gstin) {
            return res.status(400).json({
                success: false,
                message: 'Please enter your GSTIN number.'
            });
        }

        if (!consent) {
            return res.status(400).json({
                success: false,
                message: 'Please provide consent to fetch GST details.'
            });
        }

        // Find user by session
        let user = req.session.user;
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification.'
            });
        }

        // Find the user in database
        user = await User.findById(user._id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found. Please log in again.'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.gst || user.tokens.gst <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for GST verification. Please purchase tokens first.'
            });
        }

        // Call Gridlines API to fetch GST details
        const requestBody = {
            gstin,
            consent: "Y"
        };

        const response = await axios.post(`${GRIDLINES_API_URL}/gstin-api/fetch-detailed`, requestBody, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY,
                'X-Auth-Type': 'API-Key'
            }
        });

        if (!response.data || !response.data.data) {
            throw new Error('Invalid response from Gridlines API');
        }

        // Extract GST details from response
        const gstData = response.data.data.gstin_data;

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Add new verification to history
        const verificationHistory = user.documents.gstHistory || [];
        const verificationData = {
            number: gstData.document_id,
            businessName: gstData.trade_name,
            legalName: gstData.legal_name,
            address: gstData.principal_address ? `${gstData.principal_address.street}, ${gstData.principal_address.city}` : '',
            state: gstData.principal_address?.state || '',
            pincode: gstData.principal_address?.pincode || '',
            registrationDate: gstData.date_of_registration,
            status: gstData.status,
            pan: gstData.pan,
            constitutionOfBusiness: gstData.constitution_of_business,
            taxpayerType: gstData.taxpayer_type,
            centerJurisdiction: gstData.center_jurisdiction,
            stateJurisdiction: gstData.state_jurisdiction,
            verified: true,
            verificationDate: new Date()
        };

        verificationHistory.push(verificationData);

        // Update user document
        user.documents.gstHistory = verificationHistory;
        user.documents.latestGst = verificationHistory[verificationHistory.length - 1];
        
        // Deduct one token
        user.tokens.gst -= 1;

        // Add token usage record
        if (!user.tokenUsage) {
            user.tokenUsage = [];
        }

        user.tokenUsage.push({
            service: 'gst',
            action: 'used',
            amount: 1,
            timestamp: new Date(),
            details: `GST verification for ${gstData.document_id}`
        });
        
        await user.save();
        console.log('GST verification saved successfully for user:', user._id);

        // Update session with new token count and verification history
        req.session.user = user.toObject();

        // Return JSON response
        res.json({
            success: true,
            message: 'GST details fetched successfully',
            data: {
                gstin: gstData.document_id,
                businessName: gstData.trade_name || 'Not found',
                legalName: gstData.legal_name || 'Not found',
                pan: gstData.pan || 'Not found',
                address: gstData.principal_address ? `${gstData.principal_address.street}, ${gstData.principal_address.city}` : 'Not found',
                state: gstData.principal_address?.state || 'Not found',
                pincode: gstData.principal_address?.pincode || 'Not found',
                registrationDate: gstData.date_of_registration ? new Date(gstData.date_of_registration).toLocaleDateString() : 'Not found',
                status: gstData.status || 'Not found',
                constitutionOfBusiness: gstData.constitution_of_business || 'Not found',
                taxpayerType: gstData.taxpayer_type || 'Not found',
                centerJurisdiction: gstData.center_jurisdiction || 'Not found',
                stateJurisdiction: gstData.state_jurisdiction || 'Not found',
                verificationDate: new Date().toLocaleDateString(),
                remainingTokens: user.tokens.gst
            }
        });
    } catch (error) {
        console.error('Error in GST verification:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching GST details'
        });
    }
});

// Fetch Driving License details
router.post('/fetch-dl', async (req, res) => {
    try {
        const { dl_number, dob } = req.body;
        
        // Validate required fields
        if (!dl_number || !dob) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields. Please enter your Driving License number and Date of Birth.'
            });
        }

        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification'
            });
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.dl || user.tokens.dl <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for Driving License verification. Please purchase tokens first.'
            });
        }

        console.log('Received DL verification request:', { dl_number, dob });
        
        // Call Gridlines API to fetch DL details
        const requestBody = {
            driving_license_number: dl_number,
            date_of_birth: dob,
            source: 1,
            consent: "Y"
        };
        console.log('Sending request to Gridlines API:', requestBody);

        const response = await axios.post(`${GRIDLINES_API_URL}/dl-api/fetch`, requestBody, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY,
                'X-Auth-Type': 'API-Key'
            }
        });

        console.log('Received response from Gridlines API:', response.data);

        if (!response.data || !response.data.data) {
            throw new Error('Invalid response from Gridlines API');
        }

        // Deduct token for any valid API response
        user.tokens.dl -= 1;

        // Add token usage record
        if (!user.tokenUsage) {
            user.tokenUsage = [];
        }
        user.tokenUsage.push({
            service: 'dl',
            action: 'used',
            amount: 1,
            timestamp: new Date(),
            details: 'DL verification'
        });

        await user.save();
        req.session.user = user.toObject();

        // Check if no records were found
        if (response.data.data.code === '1001') {
            return res.json({
                success: false,
                message: 'No driving license records were found for the provided details.',
                remainingTokens: user.tokens.dl
            });
        }

        // Extract DL details from response
        const dlData = response.data.data.dl_data;
        if (!dlData) {
            return res.json({
                success: false,
                message: 'No driving license details found in the response.',
                remainingTokens: user.tokens.dl
            });
        }

        const { 
            name,
            date_of_birth,
            valid_from,
            valid_to,
            address,
            state,
            pincode,
            blood_group,
            vehicle_classes,
            status
        } = dlData;

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize dlHistory array if it doesn't exist
        if (!user.documents.dlHistory) {
            user.documents.dlHistory = [];
        }

        // Create verification data
        const verificationData = {
            number: dl_number,
            name,
            dateOfBirth: new Date(date_of_birth),
            validFrom: new Date(valid_from),
            validTo: new Date(valid_to),
            address,
            state,
            pincode,
            bloodGroup: blood_group,
            vehicleClasses: vehicle_classes,
            status,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.dlHistory.push(verificationData);
        
        // Update latest DL verification
        user.documents.latestDL = verificationData;
        
        // Save user document
        await user.save();
        console.log('DL verification saved successfully for user:', user._id);

        // Update session with new token count and verification history
        req.session.user = user.toObject();

        // Return JSON response with updated token count
        res.json({
            success: true,
            message: 'Driving License details fetched successfully',
            data: {
                name,
                dateOfBirth: new Date(date_of_birth).toLocaleDateString(),
                validFrom: new Date(valid_from).toLocaleDateString(),
                validTo: new Date(valid_to).toLocaleDateString(),
                address,
                state,
                pincode,
                bloodGroup: blood_group,
                vehicleClasses: vehicle_classes,
                status,
                verificationDate: new Date().toLocaleDateString(),
                remainingTokens: user.tokens.dl
            },
            remainingTokens: user.tokens.dl
        });
    } catch (error) {
        console.error('Error in DL verification:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });

        // Handle specific error cases
        let errorMessage = 'Error fetching Driving License details';
        if (error.response?.status === 403) {
            errorMessage = 'Access denied: The API key does not have permission to access Driving License verification services. Please contact support.';
        } else if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(error.response?.status || 500).json({
            success: false,
            message: errorMessage
        });
    }
});

// Generate Criminal and Court Verification Report
router.post('/generate-ccrv', async (req, res) => {
    try {
        const { name, address, father_name, date_of_birth, consent } = req.body;
        
        // Validate required fields
        if (!name || !address || !father_name || !date_of_birth) {
            return res.status(400).send(`
                <div class="alert alert-danger">
                    Missing required fields. Please fill in all required fields.
                </div>
            `);
        }

        // Validate consent
        if (!consent || consent !== 'Y') {
            return res.status(400).send(`
                <div class="alert alert-danger">
                    Consent is required to proceed with the verification.
                </div>
            `);
        }

        console.log('Received CCRV rapid search request:', { name, address, father_name, date_of_birth, consent });
        
        // Generate a token in the format CCRV_YYYYMMDD_HHMMSS_RANDOM
        const now = new Date();
        const timestamp = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const token = `CCRV_${timestamp}_${random}`;
        
        // Call Gridlines API to perform rapid search
        const requestBody = {
            name,
            address,
            father_name,
            date_of_birth,
            token,
            consent: "Y",
            consent_text: "I provide consent to fetch information",
            source: "API"
        };
        console.log('Sending request to Gridlines API:', requestBody);

        const response = await axios.post(`${GRIDLINES_API_URL}/ccrv-api/rapid/search`, requestBody, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY,
                'X-Auth-Type': 'API-Key',
                'X-Transaction-ID': token
            }
        });

        console.log('Received response from Gridlines API:', response.data);

        if (!response.data || !response.data.data) {
            throw new Error('Invalid response from Gridlines API');
        }

        const { transaction_id } = response.data.data;

        // Store initial verification request
        const user = await User.findOne({ name });
        if (user) {
            user.documents.criminalCourt = {
                transactionId: transaction_id,
                name,
                address,
                fatherName: father_name,
                dateOfBirth: new Date(date_of_birth),
                reportStatus: 'PENDING',
                verified: false,
                verificationDate: new Date()
            };
            await user.save();
        } else {
            const newUser = new User({
                name,
                documents: {
                    criminalCourt: {
                        transactionId: transaction_id,
                        name,
                        address,
                        fatherName: father_name,
                        dateOfBirth: new Date(date_of_birth),
                        reportStatus: 'PENDING',
                        verified: false,
                        verificationDate: new Date()
                    }
                }
            });
            await newUser.save();
        }

        // Return HTML response with transaction ID
        res.send(`
            <div class="alert alert-info">
                <h4>Rapid Search Initiated</h4>
                <p>Your criminal and court verification search is being processed.</p>
                <p><strong>Transaction ID:</strong> ${transaction_id}</p>
                <p><small>Please wait while we fetch your results...</small></p>
                <div id="report-status" class="mt-3">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-2">Fetching results...</p>
                </div>
            </div>
            <script>
                // Function to fetch report status
                function fetchReport() {
                    fetch('/api/verification/fetch-ccrv?transaction_id=${transaction_id}')
                        .then(response => response.text())
                        .then(html => {
                            document.getElementById('report-status').innerHTML = html;
                        })
                        .catch(error => {
                            console.error('Error:', error);
                            document.getElementById('report-status').innerHTML = 
                                '<div class="alert alert-danger">Error fetching results</div>';
                        });
                }

                // Fetch report status every 5 seconds
                setInterval(fetchReport, 5000);
                // Initial fetch
                fetchReport();
            </script>
        `);
    } catch (error) {
        console.error('Error in CCRV rapid search:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });

        let errorMessage = 'Error performing rapid search';
        if (error.response?.status === 403) {
            errorMessage = 'Access denied: The API key does not have permission to access CCRV services.';
        } else if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(error.response?.status || 500).send(`
            <div class="alert alert-danger">
                <h4>Error</h4>
                <p>${errorMessage}</p>
                ${error.response?.data?.error?.code ? `<p><small>Error Code: ${error.response.data.error.code}</small></p>` : ''}
            </div>
        `);
    }
});

// Fetch Criminal and Court Verification Results
router.get('/fetch-ccrv', async (req, res) => {
    try {
        const { transaction_id } = req.query;
        
        if (!transaction_id) {
            return res.status(400).send(`
                <div class="alert alert-danger">
                    Missing transaction ID.
                </div>
            `);
        }

        console.log('Fetching CCRV results for transaction:', transaction_id);

        const response = await axios.get(`${GRIDLINES_API_URL}/ccrv-api/rapid/result`, {
            headers: {
                'Accept': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY,
                'X-Auth-Type': 'API-Key',
                'X-Transaction-ID': transaction_id
            }
        });

        console.log('Received response from Gridlines API:', response.data);

        if (!response.data || !response.data.data) {
            throw new Error('Invalid response from Gridlines API');
        }

        const resultData = response.data.data;
        const { status, result } = resultData;

        // Update user with result data
        const user = await User.findOne({ 'documents.criminalCourt.transactionId': transaction_id });
        if (user) {
            user.documents.criminalCourt.reportStatus = status;
            user.documents.criminalCourt.reportData = result;
            user.documents.criminalCourt.verified = true;
            await user.save();
        }

        if (status === 'PENDING') {
            return res.send(`
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">Search is still in progress...</p>
            `);
        }

        // Return HTML response with result details
        res.send(`
            <div class="alert alert-success">
                <h4>Criminal and Court Verification Results</h4>
                <p><strong>Status:</strong> ${status}</p>
                ${result ? `
                    <div class="mt-3">
                        <h5>Search Results</h5>
                        <pre class="bg-light p-3">${JSON.stringify(result, null, 2)}</pre>
                    </div>
                ` : ''}
                <p><strong>Verified on:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
        `);
    } catch (error) {
        console.error('Error fetching CCRV results:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });

        let errorMessage = 'Error fetching CCRV results';
        if (error.response?.status === 403) {
            errorMessage = 'Access denied: The API key does not have permission to access CCRV services.';
        } else if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(error.response?.status || 500).send(`
            <div class="alert alert-danger">
                <h4>Error</h4>
                <p>${errorMessage}</p>
                ${error.response?.data?.error?.code ? `<p><small>Error Code: ${error.response.data.error.code}</small></p>` : ''}
            </div>
        `);
    }
});

// Get verification details
router.get('/details/:type/:number', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        const { type, number } = req.params;
        const user = await User.findById(req.session.user._id);

        if (!user || !user.documents[type] || !user.documents[type].verified) {
            return res.status(404).json({
                success: false,
                message: 'Verification details not found'
            });
        }

        // Return the stored verification details
        res.json({
            success: true,
            details: user.documents[type].details
        });
    } catch (error) {
        console.error('Error fetching verification details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching verification details'
        });
    }
});

// Download verification PDF
router.get('/download/:type/:number', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        const { type, number } = req.params;
        console.log('Download request:', { type, number }); // Debug log

        const user = await User.findById(req.session.user._id);
        console.log('User found:', !!user); // Debug log

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        let verificationData;
        switch (type) {
            case 'aadhar':
                verificationData = user.documents.aadharHistory?.find(v => v.number === number || v.referenceId === number);
                if (!verificationData) {
                    return res.status(404).json({
                        success: false,
                        message: 'Aadhar verification details not found'
                    });
                }
                break;
            case 'pan':
                verificationData = user.documents.panHistory?.find(v => v.number === number);
                if (!verificationData) {
                    return res.status(404).json({
                        success: false,
                        message: 'PAN verification details not found'
                    });
                }
                break;
            case 'gst':
                verificationData = user.documents.gstHistory?.find(v => v.number === number);
                if (!verificationData) {
                    return res.status(404).json({
                        success: false,
                        message: 'GST verification details not found'
                    });
                }
                break;
            case 'voter':
                verificationData = user.documents.voterHistory?.find(v => v.number === number);
                if (!verificationData) {
                    return res.status(404).json({
                        success: false,
                        message: 'Voter ID verification details not found'
                    });
                }
                break;
            case 'dl':
                verificationData = user.documents.dlHistory?.find(v => v.number === number);
                if (!verificationData) {
                    return res.status(404).json({
                        success: false,
                        message: 'Driving License verification details not found'
                    });
                }
                break;
            case 'rc':
                verificationData = user.documents.rcHistory?.find(v => v.number === number);
                if (!verificationData) {
                    return res.status(404).json({
                        success: false,
                        message: 'RC verification details not found'
                    });
                }
                break;
            case 'bank':
                verificationData = user.documents.bankHistory?.find(v => v.accountNumber === number);
                if (!verificationData) {
                    return res.status(404).json({
                        success: false,
                        message: 'Bank Account verification details not found'
                    });
                }
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid verification type'
                });
        }

        // Generate and send PDF
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            info: {
                Title: `${type.toUpperCase()} Verification Report`,
                Author: 'Verification System',
                Subject: 'Official Verification Document'
            }
        });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${type}-verification.pdf`);

        // Pipe the PDF to the response
        doc.pipe(res);

        // Add header
        doc.fontSize(24)
           .font('Helvetica-Bold')
           .fillColor('#2c3e50')
           .text('VERIFICATION REPORT', { align: 'center' });
        
        doc.moveDown(0.5);
        doc.fontSize(12)
           .font('Helvetica')
           .fillColor('#7f8c8d')
           .text('Official Verification Document', { align: 'center' });
        
        doc.moveDown(2);

        // Add verification type header
        doc.fontSize(18)
           .font('Helvetica-Bold')
           .fillColor('#2c3e50')
           .text(`${type.toUpperCase()} VERIFICATION DETAILS`, { align: 'center' });
        
        doc.moveDown(1);

        // Add a horizontal line
        doc.strokeColor('#bdc3c7')
           .lineWidth(1)
           .moveTo(50, doc.y)
           .lineTo(545, doc.y)
           .stroke();
        
        doc.moveDown(1);

        // Add verification details based on type
        doc.fontSize(12)
           .font('Helvetica')
           .fillColor('#34495e');

        // Helper function to add field with label
        const addField = (label, value) => {
            if (value) {
                doc.font('Helvetica-Bold').text(`${label}:`, { continued: true, indent: 20 })
                   .font('Helvetica').text(` ${value}`, { indent: 0 });
                doc.moveDown(0.5);
            }
        };

        switch (type) {
            case 'aadhar':
                addField('Aadhar Number', verificationData.number || verificationData.referenceId);
                addField('Name', verificationData.name);
                addField('Gender', verificationData.gender);
                addField('Date of Birth', verificationData.dateOfBirth);
                addField('Care Of', verificationData.careOf);
                addField('Address', [
                    verificationData.house,
                    verificationData.locality,
                    verificationData.district,
                    verificationData.state,
                    verificationData.pincode
                ].filter(Boolean).join(', '));
                addField('Landmark', verificationData.landmark || '-');
                addField('Post Office', verificationData.postOffice || '-');
                addField('VTC Name', verificationData.vtcName || '-');
                addField('Country', verificationData.country || '-');
                break;
            case 'pan':
                addField('PAN Number', verificationData.number);
                addField('Name', verificationData.name);
                addField('Date of Birth', verificationData.dateOfBirth);
                addField('Status', verificationData.status);
                addField('Category', verificationData.category);
                addField('Address', verificationData.address);
                addField('State', verificationData.state);
                addField('Pincode', verificationData.pincode);
                break;
            case 'gst':
                if (verificationData.number) addField('GST Number', verificationData.number);
                if (verificationData.businessName) addField('Business Name', verificationData.businessName);
                if (verificationData.legalName) addField('Legal Name', verificationData.legalName);
                if (verificationData.registrationDate) addField('Registration Date', new Date(verificationData.registrationDate).toLocaleDateString());
                if (verificationData.status) addField('Status', `<span class="badge bg-success">${verificationData.status}</span>`);
                if (verificationData.pan) addField('Pan', verificationData.pan);
                if (verificationData.constitutionOfBusiness) addField('Constitution Of Business', verificationData.constitutionOfBusiness);
                if (verificationData.taxpayerType) addField('Taxpayer Type', verificationData.taxpayerType);
                if (verificationData.centerJurisdiction) addField('Center Jurisdiction', verificationData.centerJurisdiction);
                if (verificationData.stateJurisdiction) addField('State Jurisdiction', verificationData.stateJurisdiction);
                if (verificationData.verified !== undefined) addField('Verified', verificationData.verified ? 'true' : 'false');
                if (verificationData.verificationDate) addField('Verification Date', new Date(verificationData.verificationDate).toLocaleString());
                if (verificationData.id) addField('Id', verificationData.id);
                break;
            case 'voter':
                addField('Voter ID Number', verificationData.number);
                addField('Name', verificationData.name);
                addField('Father\'s Name', verificationData.fatherName);
                addField('Date of Birth', verificationData.dateOfBirth ? new Date(verificationData.dateOfBirth).toLocaleDateString() : '-');
                addField('Gender', verificationData.gender);
                addField('Address', verificationData.address);
                addField('State', verificationData.state);
                addField('Pincode', verificationData.pincode);
                addField('Assembly Constituency', verificationData.assemblyConstituency);
                addField('Parliamentary Constituency', verificationData.parliamentaryConstituency);
                break;
            case 'dl':
                addField('DL Number', verificationData.number);
                addField('Name', verificationData.name);
                addField('Date of Birth', verificationData.dateOfBirth ? new Date(verificationData.dateOfBirth).toLocaleDateString() : '-');
                addField('Valid From', verificationData.validFrom ? new Date(verificationData.validFrom).toLocaleDateString() : '-');
                addField('Valid To', verificationData.validTo ? new Date(verificationData.validTo).toLocaleDateString() : '-');
                addField('Status', verificationData.status);
                addField('Blood Group', verificationData.bloodGroup);
                addField('Vehicle Classes', Array.isArray(verificationData.vehicleClasses) ? verificationData.vehicleClasses.join(', ') : '-');
                addField('Address', verificationData.address);
                addField('State', verificationData.state);
                addField('Pincode', verificationData.pincode);
                break;
            case 'rc':
                if (verificationData.number) addField('RC Number', verificationData.number);
                if (verificationData.ownerName) addField('Owner Name', verificationData.ownerName);
                if (verificationData.vehicleNumber) addField('Vehicle Number', verificationData.vehicleNumber);
                if (verificationData.vehicleType) addField('Vehicle Type', verificationData.vehicleType);
                if (verificationData.engineNumber) addField('Engine Number', verificationData.engineNumber);
                if (verificationData.chassisNumber) addField('Chassis Number', verificationData.chassisNumber);
                if (verificationData.registrationDate) addField('Registration Date', new Date(verificationData.registrationDate).toLocaleDateString());
                if (verificationData.validFrom) addField('Valid From', new Date(verificationData.validFrom).toLocaleDateString());
                if (verificationData.validTo) addField('Valid To', new Date(verificationData.validTo).toLocaleDateString());
                if (verificationData.status) addField('Status', `<span class="badge bg-success">${verificationData.status}</span>`);
                if (verificationData.address) addField('Address', verificationData.address);
                if (verificationData.state) addField('State', verificationData.state);
                if (verificationData.pincode) addField('Pincode', verificationData.pincode);
                if (verificationData.vehicleClass) addField('Vehicle Class', verificationData.vehicleClass);
                if (verificationData.fuelType) addField('Fuel Type', verificationData.fuelType);
                if (verificationData.manufacturer) addField('Manufacturer', verificationData.manufacturer);
                if (verificationData.model) addField('Model', verificationData.model);
                if (verificationData.registrationAuthority) addField('Registration Authority', verificationData.registrationAuthority);
                break;
            case 'bank':
                addField('Account Number', verificationData.accountNumber);
                addField('IFSC Code', verificationData.ifscCode);
                addField('Account Holder Name', verificationData.accountHolderName);
                addField('Bank Name', verificationData.bankName);
                addField('Branch Name', verificationData.branchName);
                addField('Account Type', verificationData.accountType);
                addField('Status', verificationData.status ? `<span class="badge bg-success">${verificationData.status}</span>` : 'Active');
                addField('Address', verificationData.address);
                addField('City', verificationData.city);
                addField('State', verificationData.state);
                addField('Pincode', verificationData.pincode);
                break;
        }
        
        // Add verification date in a styled box
        doc.moveDown(1);
        doc.rect(50, doc.y, 495, 40)
           .fillColor('#f8f9fa')
           .fill();
        
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#2c3e50')
           .text('Verification Information', 60, doc.y + 10);
        
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#34495e')
           .text(`Verification Date: ${new Date(verificationData.verificationDate).toLocaleString()}`, 60, doc.y + 5);
        
        // Add new page for legal disclaimer
        doc.addPage();
        
        // Add disclaimer header
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#2c3e50')
           .text('LEGAL DISCLAIMER', { align: 'center' });
        
        doc.moveDown(1);
        
        // Add disclaimer text in a styled box
        doc.rect(50, doc.y, 495, 200)
           .fillColor('#f8f9fa')
           .fill();
        
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#34495e')
           .text(LEGAL_DISCLAIMER, {
               align: 'justify',
               indent: 20,
               width: 475,
               continued: false
           });

        // Add footer with page numbers
        const addFooter = (pageNumber) => {
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#7f8c8d')
               .text(
                   `Page ${pageNumber}`,
                   50,
                   doc.page.height - 50,
                   { align: 'center', width: 495 }
               );
        };

        // Add page numbers to each page
        let pageCount = 1;
        doc.on('pageAdded', () => {
            pageCount++;
        });

        // Add footer to current page
        addFooter(pageCount);

        // Finalize the PDF
        doc.end();
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating PDF'
        });
    }
});

// Verify GST
router.post('/verify-gst', async (req, res) => {
    try {
        const { gstin } = req.body;
        
        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification'
            });
        }

        const userId = req.session.user._id;

        // Get fresh user data
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens.gst || user.tokens.gst <= 0) {
            return res.status(400).json({
                success: false,
                message: 'No GST verification tokens available'
            });
        }

        // Call Gridlines API to verify GST
        const response = await axios.post(`${GRIDLINES_API_URL}/gstin-api/verify`, {
            gstin: gstin,
            consent: "Y"
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY,
                'X-Auth-Type': 'api_key'
            }
        });

        if (response.data.success) {
            // Deduct token
            user.tokens.gst -= 1;

            // Add to GST history
            if (!user.documents.gstHistory) {
                user.documents.gstHistory = [];
            }

            const verificationData = {
                number: gstin,
                businessName: response.data.data.business_name,
                legalName: response.data.data.legal_name,
                address: response.data.data.address,
                state: response.data.data.state,
                pincode: response.data.data.pincode,
                registrationDate: response.data.data.registration_date,
                status: response.data.data.status,
                pan: response.data.data.pan,
                constitutionOfBusiness: response.data.data.constitution_of_business,
                taxpayerType: response.data.data.taxpayer_type,
                centerJurisdiction: response.data.data.center_jurisdiction,
                stateJurisdiction: response.data.data.state_jurisdiction,
                verified: true,
                verificationDate: new Date()
            };

            user.documents.gstHistory.push(verificationData);
            await user.save();

            // Update session with new token count
            req.session.user = user.toObject();

            // Return success response
            res.json({
                success: true,
                message: 'GST verified successfully',
                data: verificationData,
                remainingTokens: user.tokens.gst
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'GST verification failed'
            });
        }
    } catch (error) {
        console.error('Error verifying GST:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Error verifying GST'
        });
    }
});

// Employee Verification Routes
router.post('/fetch-uan', async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification'
            });
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens.employee || user.tokens.employee <= 0) {
            return res.status(400).json({
                success: false,
                message: 'No employee verification tokens available'
            });
        }

        const { mobile_number, pan } = req.body;
        
        // Validate required fields
        if (!mobile_number || !pan) {
            return res.status(400).json({
                success: false,
                message: 'Mobile number and PAN are required'
            });
        }

        console.log('Sending request to Gridlines API:', {
            mobile_number,
            pan,
            consent: "Y"
        });

        const options = {
            method: 'POST',
            url: 'https://api.gridlines.io/epfo-api/fetch-uan',
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY
            },
            data: {
                mobile_number,
                pan,
                consent: "Y"
            }
        };

        const response = await axios.request(options);
        console.log('Received response from Gridlines API:', response.data);
        
        // Check if the response indicates no UAN found
        if (response.data.data && response.data.data.code === '1030') {
            return res.json({
                success: false,
                message: 'No UAN found for the provided details. Please verify the mobile number and PAN and try again.'
            });
        }
        
        if (response.data.success) {
            // Deduct one token
            user.tokens.employee -= 1;
            await user.save();
            
            // Update session
            req.session.user = user.toObject();
        }
        
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching UAN:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });

        let errorMessage = 'Error fetching UAN details';
        if (error.response?.status === 403) {
            errorMessage = 'Access denied: The API key does not have permission to access employee verification services.';
        } else if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(error.response?.status || 500).json({ 
            success: false, 
            message: errorMessage 
        });
    }
});

router.post('/fetch-by-pan', async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification'
            });
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens.employee || user.tokens.employee <= 0) {
            return res.status(400).json({
                success: false,
                message: 'No employee verification tokens available'
            });
        }

        const { pan_number, consent } = req.body;
        
        console.log('Sending request to Gridlines API:', {
            pan_number,
            consent
        });

        const response = await axios.post('https://api.gridlines.io/epfo-api/uan/fetch-by-pan', {
            pan_number,
            consent
        }, {
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY
            }
        });

        console.log('Received response from Gridlines API:', response.data);
        
        // Check if the response indicates no UAN found
        if (response.data.data && response.data.data.code === '1030') {
            return res.json({
                success: false,
                message: 'No UAN found for the provided PAN number. Please verify the PAN number and try again.'
            });
        }
        
        if (response.data.success) {
            // Deduct one token
            user.tokens.employee -= 1;
            await user.save();
            
            // Update session
            req.session.user = user.toObject();
        }
        
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching by PAN:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });

        let errorMessage = 'Error fetching employee details';
        if (error.response?.status === 403) {
            errorMessage = 'Access denied: The API key does not have permission to access employee verification services.';
        } else if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(error.response?.status || 500).json({ 
            success: false, 
            message: errorMessage 
        });
    }
});

router.post('/employer-verify', async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification'
            });
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens.employee || user.tokens.employee <= 0) {
            return res.status(400).json({
                success: false,
                message: 'No employee verification tokens available'
            });
        }

        const { employer_name, establishment_code_number, establishment_id, consent } = req.body;
        
        const response = await fetch('https://api.gridlines.io/epfo-api/employer-verify', {
            method: 'POST',
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY
            },
            body: JSON.stringify({
                employer_name,
                establishment_code_number,
                establishment_id,
                consent
            })
        });

        const data = await response.json();
        
        if (data.success) {
            // Deduct one token
            user.tokens.employee -= 1;
            await user.save();
            
            // Update session
            req.session.user = user.toObject();
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error verifying employer:', error);
        res.status(500).json({ success: false, message: 'Error verifying employer details' });
    }
});

// Additional verification routes using Quick EKYC API
router.post('/verify-bank', async (req, res) => {
    try {
        console.log('Received bank verification request:', req.body);
        const { account_number, ifsc_code, response, verification_type } = req.body;
        const user = await User.findById(req.session.user._id);

        if (!user) {
            console.log('User not found');
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.bank || user.tokens.bank <= 0) {
            console.log('Insufficient tokens');
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for bank account verification'
            });
        }

        if (!response) {
            console.log('No response data provided');
            return res.status(400).json({
                success: false,
                message: 'No verification data provided'
            });
        }

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize bankHistory array if it doesn't exist
        if (!user.documents.bankHistory) {
            user.documents.bankHistory = [];
        }

        // Create verification data
        const verificationData = {
            accountNumber: account_number,
            ifsc: ifsc_code,
            accountHolderName: response.bank_account_verification_data?.name || response.bank_account_data?.name,
            bankName: response.bank_account_verification_data?.bank_name || response.bank_account_data?.bank_name || 'State Bank of India',
            branchName: response.bank_account_verification_data?.branch_name || response.bank_account_data?.branch || 'Branch',
            accountType: response.bank_account_verification_data?.account_type || 'Savings',
            status: response.code === '1000' ? 'Verified' : 'Not Verified',
            verified: response.code === '1000',
            verificationType: verification_type || 'regular',
            verificationDate: new Date()
        };

        console.log('Created verification data:', verificationData);

        // Add to history
        user.documents.bankHistory.push(verificationData);
        
        // Update latest bank verification
        user.documents.latestBank = verificationData;
        
        // Deduct one token
        user.tokens.bank -= 1;
        
        // Save user document
        await user.save();
        console.log('Bank account verification saved successfully for user:', user._id);

        // Update session with new token count and verification history
        req.session.user = user.toObject();

        res.json({
            success: true,
            message: 'Bank account verified successfully',
            data: verificationData,
            remainingTokens: user.tokens.bank
        });
    } catch (error) {
        console.error('Error verifying bank account:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying bank account details: ' + error.message
        });
    }
});

router.post('/verify-passport', async (req, res) => {
    try {
        const { passport_number } = req.body;
        const user = await User.findById(req.session.user._id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.passport || user.tokens.passport <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for passport verification'
            });
        }

        // Make API request
        const response = await axios.post('https://api.gridlines.io/passport-api/v3/verify', {
                passport_number,
                consent: 'Y'
        }, {
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': 'yjVR74jEmdRwhn8GzO6Fpr2pZ3lE6Q28'
            }
        });

        if (!response.data || !response.data.data) {
            throw new Error('Invalid response from API');
        }

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize passportHistory array if it doesn't exist
        if (!user.documents.passportHistory) {
            user.documents.passportHistory = [];
        }

        // Create verification data
        const verificationData = {
            number: passport_number,
            name: response.data.data.name,
            nationality: response.data.data.nationality,
            dateOfBirth: new Date(response.data.data.date_of_birth),
            placeOfBirth: response.data.data.place_of_birth,
            issueDate: new Date(response.data.data.issue_date),
            expiryDate: new Date(response.data.data.expiry_date),
            gender: response.data.data.gender,
            address: response.data.data.address,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.passportHistory.push(verificationData);
        
        // Update latest passport verification
        user.documents.latestPassport = verificationData;
        
        // Deduct one token
        user.tokens.passport -= 1;
        
        // Save user document
        await user.save();
        console.log('Passport verification saved successfully for user:', user._id);
        
        // Update session with new token count and verification history
        req.session.user = user.toObject();

        res.json({
            success: true,
            message: 'Passport verified successfully',
            data: verificationData,
            remainingTokens: user.tokens.passport
        });
    } catch (error) {
        console.error('Error verifying passport:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying passport details'
        });
    }
});

router.post('/verify-employee', async (req, res) => {
    try {
        const { uan, employer_name, establishment_code, establishment_id } = req.body;
        const user = await User.findById(req.session.user._id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.employee || user.tokens.employee <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for employee verification'
            });
        }

        // Make API request
        const response = await axios.post('https://api.gridlines.io/employee-api/v3/verify', {
            uan,
            employer_name,
            establishment_code,
            establishment_id,
            consent: 'Y'
        }, {
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': 'yjVR74jEmdRwhn8GzO6Fpr2pZ3lE6Q28'
            }
        });

        if (!response.data || !response.data.data) {
            throw new Error('Invalid response from API');
        }

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize employeeHistory array if it doesn't exist
        if (!user.documents.employeeHistory) {
            user.documents.employeeHistory = [];
        }

        // Create verification data
        const verificationData = {
            uan,
            name: response.data.data.name,
            employerName: employer_name,
            establishmentCode: establishment_code,
            establishmentId: establishment_id,
            status: response.data.data.status,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.employeeHistory.push(verificationData);
        
        // Update latest employee verification
        user.documents.latestEmployee = verificationData;
        
        // Deduct one token
        user.tokens.employee -= 1;
        
        // Save user document
        await user.save();
        console.log('Employee verification saved successfully for user:', user._id);

        // Update session with new token count and verification history
        req.session.user = user.toObject();

        res.json({ 
            success: true, 
            message: 'Employee verified successfully',
            data: verificationData,
            remainingTokens: user.tokens.employee
        });
    } catch (error) {
        console.error('Error verifying employee:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying employee details'
        });
    }
});

router.post('/verify-cowin', async (req, res) => {
    try {
        const { beneficiary_id } = req.body;
        const user = await User.findById(req.session.user._id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.cowin || user.tokens.cowin <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for CoWIN verification'
            });
        }

        // Make API request
        const response = await axios.post('https://api.gridlines.io/cowin-api/v3/verify', {
            beneficiary_id,
            consent: 'Y'
        }, {
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': 'yjVR74jEmdRwhn8GzO6Fpr2pZ3lE6Q28'
            }
        });

        if (!response.data || !response.data.data) {
            throw new Error('Invalid response from API');
        }

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize cowinHistory array if it doesn't exist
        if (!user.documents.cowinHistory) {
            user.documents.cowinHistory = [];
        }

        // Create verification data
        const verificationData = {
            beneficiaryId: beneficiary_id,
            name: response.data.data.name,
            dateOfBirth: new Date(response.data.data.date_of_birth),
            gender: response.data.data.gender,
            mobileNumber: response.data.data.mobile_number,
            vaccinationStatus: response.data.data.vaccination_status,
            doses: response.data.data.doses.map(dose => ({
                doseNumber: dose.dose_number,
                vaccineName: dose.vaccine_name,
                date: new Date(dose.date),
                center: dose.center
            })),
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.cowinHistory.push(verificationData);
        
        // Update latest CoWIN verification
        user.documents.latestCowin = verificationData;
        
        // Deduct one token
        user.tokens.cowin -= 1;
        
        // Save user document
        await user.save();
        console.log('CoWIN verification saved successfully for user:', user._id);

        // Update session with new token count and verification history
        req.session.user = user.toObject();

        res.json({
            success: true,
            message: 'CoWIN verified successfully',
            data: verificationData,
            remainingTokens: user.tokens.cowin
        });
    } catch (error) {
        console.error('Error verifying CoWIN:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying CoWIN details'
        });
    }
});

// Generate CoWIN OTP
router.post('/generate-cowin-otp', async (req, res) => {
    try {
        const { mobile, consent } = req.body;
        
        // Validate required fields
        if (!mobile || !consent) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields. Please enter your mobile number and provide consent.'
            });
        }

        // Validate mobile number format
        if (!/^[0-9]{10}$/.test(mobile)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid mobile number format. Please enter a valid 10-digit mobile number.'
            });
        }

        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification'
            });
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.cowin || user.tokens.cowin <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for CoWIN verification. Please purchase tokens first.'
            });
        }

        console.log('Sending CoWIN OTP request:', { mobile });
        
        // Call Gridlines API to generate OTP with retry logic
        const maxRetries = 3;
        let retryCount = 0;
        let lastError = null;

        while (retryCount < maxRetries) {
            try {
                const options = {
                    method: 'POST',
                    url: 'https://api.gridlines.io/cowin-api/meson/generate-otp',
                    headers: {
                        'X-Auth-Type': 'API-Key',
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-API-Key': GRIDLINES_API_KEY
                    },
                    data: {
                        mobile: mobile,
                        consent: consent
                    },
                    timeout: 30000 // 30 second timeout
                };

                console.log(`Attempt ${retryCount + 1}: Sending request to Gridlines API:`, {
                    url: options.url,
                    headers: {
                        ...options.headers,
                        'X-API-Key': '***' // Mask API key in logs
                    },
                    data: options.data
                });

                const response = await axios.request(options);

                console.log('Received response from Gridlines API:', {
                    status: response.status,
                    statusText: response.statusText,
                    data: response.data
                });

                if (!response.data) {
                    throw new Error('Invalid response from Gridlines API');
                }

                // Store transaction ID in session for OTP verification
                if (response.data.data && response.data.data.transaction_id) {
                    req.session.cowinTransactionId = response.data.data.transaction_id;
                }

                // Deduct token after successful OTP generation
                user.tokens.cowin -= 1;
                await user.save();

                // Update session with new token count
                req.session.user = user.toObject();

                return res.json({
                    success: true,
                    message: 'OTP generated successfully',
                    data: response.data.data,
                    remainingTokens: user.tokens.cowin
                });

            } catch (error) {
                lastError = error;
                console.error(`Attempt ${retryCount + 1} failed:`, {
                    message: error.message,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data,
                    headers: error.response?.headers
                });
                
                if (error.response?.status === 502 || error.response?.status === 503) {
                    retryCount++;
                    if (retryCount < maxRetries) {
                        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                        console.log(`Waiting ${delay}ms before retry ${retryCount + 1}...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                } else {
                    // For other errors, don't retry
                    break;
                }
            }
        }

        // If we get here, all retries failed
        throw lastError;

    } catch (error) {
        console.error('Error generating CoWIN OTP:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            headers: error.response?.headers
        });
        
        let errorMessage = 'Error generating OTP. Please try again.';
        
        if (error.response) {
            if (error.response.status === 502 || error.response.status === 503) {
                errorMessage = 'The CoWIN service is temporarily unavailable. Please try again in a few minutes.';
            } else if (error.response.data?.message) {
                errorMessage = error.response.data.message;
            }
        }

        res.status(error.response?.status || 500).json({
            success: false,
            message: errorMessage,
            error: error.response?.data || error.message
        });
    }
});

// Criminal Court Verification Routes
router.get('/services/criminal-court', async (req, res) => {
    try {
        res.render('criminal-court-verify', {
            title: 'Criminal Court Verification'
        });
    } catch (error) {
        console.error('Error rendering criminal court verification page:', error);
        res.status(500).render('error', { 
            message: 'Error loading criminal court verification page',
            error: error
        });
    }
});

// Criminal Court Search API
router.post('/criminal-court-search', async (req, res) => {
    try {
        const { name, father_name, address, date_of_birth, consent } = req.body;

        // Validate required fields
        if (!name || !father_name || !address || !date_of_birth || consent !== 'Y') {
            return res.status(400).json({
                success: false,
                message: 'All fields are required and consent must be provided'
            });
        }

        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification'
            });
        }

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.ccrv || user.tokens.ccrv <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for Criminal Court verification. Please purchase tokens first.'
            });
        }

        // Make request to Gridlines API
        const response = await axios({
            method: 'POST',
            url: 'https://api.gridlines.io/ccrv-api/rapid/search',
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY
            },
            data: {
                name,
                father_name,
                address,
                date_of_birth,
                consent
            }
        });

        // Deduct one token after successful API call
        user.tokens.ccrv -= 1;
        await user.save();

        // Update session with new token count
        req.session.user = user.toObject();

        // Return transaction ID for polling
        res.json({
            success: true,
            transaction_id: response.data.transaction_id,
            remainingTokens: user.tokens.ccrv
        });

    } catch (error) {
        console.error('Error in criminal court search:', error);
        res.status(500).json({
            success: false,
            message: error.response?.data?.message || 'Error processing criminal court verification request'
        });
    }
});

// Criminal Court Result API
router.get('/criminal-court-result', async (req, res) => {
    try {
        const { transaction_id } = req.query;

        if (!transaction_id) {
            return res.status(400).json({
                success: false,
                message: 'Transaction ID is required'
            });
        }

        // Make request to Gridlines API
        const response = await axios({
            method: 'GET',
            url: 'https://api.gridlines.io/ccrv-api/rapid/result',
            headers: {
                'X-Auth-Type': 'API-Key',
                'X-Transaction-ID': transaction_id,
                'Accept': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY
            }
        });

        // Check if result is ready
        if (response.data.status === 'pending') {
            return res.json({
                success: true,
                status: 'pending'
            });
        }

        // Return the result data
        res.json({
            success: true,
            data: response.data
        });

    } catch (error) {
        console.error('Error in criminal court result:', error);
        res.status(500).json({
            success: false,
            message: error.response?.data?.message || 'Error fetching criminal court verification result'
        });
    }
});

// Fetch GST details by PAN
router.post('/fetch-gst-by-pan', async (req, res) => {
    try {
        const { pan_number, consent } = req.body;
        
        // Validate required fields
        if (!pan_number) {
            return res.status(400).json({
                success: false,
                message: 'Please enter your PAN number.'
            });
        }

        if (!consent) {
            return res.status(400).json({
                success: false,
                message: 'Please provide consent to fetch GST details.'
            });
        }

        console.log('Received GST verification request by PAN:', { pan_number });
        
        // Call Gridlines API to fetch GST details by PAN
        const requestBody = {
            pan_number,
            consent: "Y"
        };
        console.log('Sending request to Gridlines API:', requestBody);

        const response = await axios.post(`${GRIDLINES_API_URL}/gstin-api/fetch-by-pan`, requestBody, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-API-Key': GRIDLINES_API_KEY,
                'X-Auth-Type': 'API-Key'
            }
        });

        console.log('Received response from Gridlines API:', response.data);

        if (!response.data || !response.data.data) {
            throw new Error('Invalid response from Gridlines API');
        }

        // Check if no records were found
        if (response.data.data.code === '1004') {
            return res.json({
                success: false,
                message: 'No GST records were found for the provided PAN. Please verify the PAN and try again.'
            });
        }

        // Extract GST details from response
        const gstData = response.data.data;
        
        // Check if records were found
        if (gstData.code === '1002' && gstData.results) {
            const results = gstData.results;
            if (!Array.isArray(results) || results.length === 0) {
                return res.json({
                    success: false,
                    message: 'No GST records were found for the provided PAN. Please verify the PAN and try again.'
                });
            }

            // Use the first GST record
            const firstGstRecord = results[0];
            const { 
                gstin,
                status,
                pan,
                legal_name,
                trade_name,
                center_jurisdiction,
                state_jurisdiction,
                constitution_of_business,
                taxpayer_type,
                date_of_registration,
                principal_address
            } = firstGstRecord;

            // Parse registration date safely
            let registrationDate = null;
            if (date_of_registration) {
                try {
                    registrationDate = new Date(date_of_registration);
                    if (isNaN(registrationDate.getTime())) {
                        registrationDate = null;
                    }
                } catch (error) {
                    console.error('Error parsing registration date:', error);
                    registrationDate = null;
                }
            }

            // Extract address details
            const address = principal_address ? {
                street: principal_address.street || '',
                city: principal_address.city || '',
                state: principal_address.state || '',
                pincode: principal_address.pincode || ''
            } : null;

            try {
                // Find user by session
                let user = req.session.user;
                
                if (!user) {
                    return res.status(401).json({
                        success: false,
                        message: 'Please log in to perform verification.'
                    });
                }

                // Find the user in database
                user = await User.findById(user._id);
                if (!user) {
                    return res.status(401).json({
                        success: false,
                        message: 'User not found. Please log in again.'
                    });
                }

                // Check if user has enough tokens
                if (!user.tokens || !user.tokens.gst || user.tokens.gst <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'You don\'t have enough tokens for GST verification. Please purchase tokens first.'
                    });
                }

                // Update user's GST verification history
                if (!user.documents) {
                    user.documents = {};
                }

                // Add new verification to history
                const verificationHistory = user.documents.gstHistory || [];
                const verificationData = {
                    number: gstin || '',
                    businessName: trade_name || '',
                    legalName: legal_name || '',
                    address: address ? `${address.street}, ${address.city}` : '',
                    state: address?.state || '',
                    pincode: address?.pincode || '',
                    registrationDate: registrationDate,
                    status: status || '',
                    pan: pan || '',
                    constitutionOfBusiness: constitution_of_business || '',
                    taxpayerType: taxpayer_type || '',
                    centerJurisdiction: center_jurisdiction || '',
                    stateJurisdiction: state_jurisdiction || '',
                    verified: true,
                    verificationDate: new Date()
                };

                verificationHistory.push(verificationData);

                // Update user document
                user.documents.gstHistory = verificationHistory;
                user.documents.latestGst = verificationHistory[verificationHistory.length - 1];
                
                // Deduct one token
                user.tokens.gst -= 1;
                
                await user.save();
                console.log('GST verification saved successfully for user:', user._id);

                // Update session with new token count and verification history
                req.session.user = user.toObject();

                // Return JSON response
                res.json({
                    success: true,
                    message: 'GST details fetched successfully',
                    data: {
                        gstin: gstin || '',
                        businessName: trade_name || '',
                        legalName: legal_name || '',
                        pan: pan || '',
                        address: address ? `${address.street}, ${address.city}` : '',
                        state: address?.state || '',
                        pincode: address?.pincode || '',
                        registrationDate: registrationDate ? registrationDate.toLocaleDateString() : '',
                        status: status || '',
                        constitutionOfBusiness: constitution_of_business || '',
                        taxpayerType: taxpayer_type || '',
                        centerJurisdiction: center_jurisdiction || '',
                        stateJurisdiction: state_jurisdiction || '',
                        verificationDate: new Date().toLocaleDateString(),
                        remainingTokens: user.tokens.gst
                    }
                });
            } catch (dbError) {
                console.error('Database error:', dbError);
                res.status(500).json({
                    success: false,
                    message: dbError.message || 'Error saving verification details. Please try again.'
                });
            }
        } else {
            res.status(500).json({
                success: false,
                message: 'Unexpected response format from Gridlines API'
            });
        }
    } catch (error) {
        console.error('Error in GST verification:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });

        // Handle specific error cases
        let errorMessage = 'Error fetching GST details';
        if (error.response?.status === 403) {
            errorMessage = 'Access denied: The API key does not have permission to access GST verification services. Please contact support.';
        } else if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(error.response?.status || 500).json({
            success: false,
            message: errorMessage
        });
    }
});

// Fetch GST by name
router.post('/fetch-gst-by-name', async (req, res) => {
    try {
        const { company_name, consent } = req.body;
        
        // Validate required fields
        if (!company_name) {
            return res.status(400).json({
                success: false,
                message: 'Please enter company name.'
            });
        }

        if (!consent) {
            return res.status(400).json({
                success: false,
                message: 'Please provide consent to fetch GST details.'
            });
        }

        // Find user by session
        let user = req.session.user;
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification.'
            });
        }

        // Find the user in database
        user = await User.findById(user._id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found. Please log in again.'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.gst || user.tokens.gst <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for GST verification. Please purchase tokens first.'
            });
        }

        // Deduct one token
        user.tokens.gst -= 1;
        await user.save();

        // Update session with new token count
        req.session.user = user.toObject();

        res.json({
            success: true,
            message: 'Token deducted successfully',
            remainingTokens: user.tokens.gst
        });
    } catch (error) {
        console.error('Error in GST verification by name:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error processing verification request'
        });
    }
});

// Fetch GST contact details
router.post('/fetch-gst-contact-details', async (req, res) => {
    try {
        const { gstin, consent } = req.body;
        
        // Validate required fields
        if (!gstin) {
            return res.status(400).json({
                success: false,
                message: 'Please enter GSTIN.'
            });
        }

        if (!consent) {
            return res.status(400).json({
                success: false,
                message: 'Please provide consent to fetch GST details.'
            });
        }

        // Find user by session
        let user = req.session.user;
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification.'
            });
        }

        // Find the user in database
        user = await User.findById(user._id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found. Please log in again.'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.gst || user.tokens.gst <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for GST verification. Please purchase tokens first.'
            });
        }

        // Deduct one token
        user.tokens.gst -= 1;
        await user.save();

        // Update session with new token count
        req.session.user = user.toObject();

        res.json({
            success: true,
            message: 'Token deducted successfully',
            remainingTokens: user.tokens.gst
        });
    } catch (error) {
        console.error('Error in GST contact details verification:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error processing verification request'
        });
    }
});

// Fetch GST by mobile
router.post('/fetch-gst-by-mobile', async (req, res) => {
    try {
        const { mobile, consent } = req.body;
        
        // Validate required fields
        if (!mobile) {
            return res.status(400).json({
                success: false,
                message: 'Please enter mobile number.'
            });
        }

        if (!consent) {
            return res.status(400).json({
                success: false,
                message: 'Please provide consent to fetch GST details.'
            });
        }

        // Find user by session
        let user = req.session.user;
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification.'
            });
        }

        // Find the user in database
        user = await User.findById(user._id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found. Please log in again.'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.gst || user.tokens.gst <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for GST verification. Please purchase tokens first.'
            });
        }

        // Deduct one token
        user.tokens.gst -= 1;
        await user.save();

        // Update session with new token count
        req.session.user = user.toObject();

        res.json({
            success: true,
            message: 'Token deducted successfully',
            remainingTokens: user.tokens.gst
        });
    } catch (error) {
        console.error('Error in GST verification by mobile:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error processing verification request'
        });
    }
});

// Helper function to parse date safely
const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
};

// Fetch RC details
router.post('/fetch-rc', async (req, res) => {
    try {
        const { rc_number, consent, verification_data } = req.body;

        // Validate required fields
        if (!rc_number) {
            return res.status(400).json({
                success: false,
                message: 'Please enter RC number.'
            });
        }

        if (!consent) {
            return res.status(400).json({
                success: false,
                message: 'Please provide consent to fetch RC details.'
            });
        }

        // Find user by session
        let user = req.session.user;
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification.'
            });
        }

        // Find the user in database
        user = await User.findById(user._id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found. Please log in again.'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.rc || user.tokens.rc <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for RC verification. Please purchase tokens first.'
            });
        }

        // Deduct one token
        user.tokens.rc -= 1;
        
        // Save user document
        await user.save();

        // Check if API response indicates RC does not exist
        if (verification_data.code === '1001') {
            // Update session with new token count
            req.session.user = user.toObject();
            
            return res.json({
                success: false,
                message: 'RC does not exist.',
                remainingTokens: user.tokens.rc
            });
        }

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize rcHistory array if it doesn't exist
        if (!user.documents.rcHistory) {
            user.documents.rcHistory = [];
        }

        // Extract RC details from response
        const rcData = verification_data.data;
        const { 
            owner_name,
            vehicle_number,
            vehicle_type,
            engine_number,
            chassis_number,
            registration_date,
            valid_from,
            valid_to,
            address,
            state,
            pincode
        } = rcData;

        // Create verification data with safe date parsing
        const verificationData = {
            number: rc_number,
            ownerName: owner_name,
            vehicleNumber: vehicle_number,
            vehicleType: vehicle_type,
            engineNumber: engine_number,
            chassisNumber: chassis_number,
            registrationDate: parseDate(registration_date),
            validFrom: parseDate(valid_from),
            validTo: parseDate(valid_to),
            address,
            state,
            pincode,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.rcHistory.push(verificationData);
        
        // Update latest RC verification
        user.documents.latestRC = verificationData;
        
        // Save user document again with history
        await user.save();
        console.log('RC verification saved successfully for user:', user._id);

        // Update session with new token count and verification history
        req.session.user = user.toObject();

        res.json({
            success: true,
            message: 'RC details fetched successfully',
            data: verificationData,
            remainingTokens: user.tokens.rc
        });
    } catch (error) {
        console.error('Error in RC verification:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error processing verification request'
        });
    }
});

// Fetch RC by chassis
router.post('/fetch-rc-by-chassis', async (req, res) => {
    try {
        const { chassis_number, consent, verification_data } = req.body;

        // Validate required fields
        if (!chassis_number) {
            return res.status(400).json({
                success: false,
                message: 'Please enter chassis number.'
            });
        }

        if (!consent) {
            return res.status(400).json({
                success: false,
                message: 'Please provide consent to fetch RC details.'
            });
        }

        // Find user by session
        let user = req.session.user;
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification.'
            });
        }

        // Find the user in database
        user = await User.findById(user._id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found. Please log in again.'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.rc || user.tokens.rc <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for RC verification. Please purchase tokens first.'
            });
        }

        // Deduct one token
        user.tokens.rc -= 1;
        
        // Save user document
        await user.save();

        // Check if API response indicates RC does not exist
        if (verification_data.code === '1001') {
            // Update session with new token count
            req.session.user = user.toObject();
            
            return res.json({
                success: false,
                message: 'RC does not exist.',
                remainingTokens: user.tokens.rc
            });
        }

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize rcHistory array if it doesn't exist
        if (!user.documents.rcHistory) {
            user.documents.rcHistory = [];
        }

        // Extract RC details from response
        const rcData = verification_data.data;
        const { 
            owner_name,
            vehicle_number,
            vehicle_type,
            engine_number,
            registration_date,
            valid_from,
            valid_to,
            address,
            state,
            pincode
        } = rcData;

        // Create verification data with safe date parsing
        const verificationData = {
            number: rcData.rc_number,
            ownerName: owner_name,
            vehicleNumber: vehicle_number,
            vehicleType: vehicle_type,
            engineNumber: engine_number,
            chassisNumber: chassis_number,
            registrationDate: parseDate(registration_date),
            validFrom: parseDate(valid_from),
            validTo: parseDate(valid_to),
            address,
            state,
            pincode,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.rcHistory.push(verificationData);
        
        // Update latest RC verification
        user.documents.latestRC = verificationData;
        
        // Save user document again with history
        await user.save();
        console.log('RC verification saved successfully for user:', user._id);

        // Update session with new token count and verification history
        req.session.user = user.toObject();

        res.json({
            success: true,
            message: 'RC details fetched successfully',
            data: verificationData,
            remainingTokens: user.tokens.rc
        });
    } catch (error) {
        console.error('Error in RC verification by chassis:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error processing verification request'
        });
    }
});

// Fetch RC challan
router.post('/fetch-rc-challan', async (req, res) => {
    try {
        const { rc_number, consent, verification_data } = req.body;

        // Validate required fields
        if (!rc_number) {
            return res.status(400).json({
                success: false,
                message: 'Please enter RC number.'
            });
        }

        if (!consent) {
            return res.status(400).json({
                success: false,
                message: 'Please provide consent to fetch RC details.'
            });
        }

        // Find user by session
        let user = req.session.user;
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification.'
            });
        }

        // Find the user in database
        user = await User.findById(user._id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found. Please log in again.'
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.rc || user.tokens.rc <= 0) {
            return res.status(400).json({
                success: false,
                message: 'You don\'t have enough tokens for RC verification. Please purchase tokens first.'
            });
        }

        // Deduct one token
        user.tokens.rc -= 1;
        
        // Save user document
        await user.save();

        // Check if API response indicates RC does not exist
        if (verification_data.code === '1001') {
            // Update session with new token count
            req.session.user = user.toObject();
            
            return res.json({
                success: false,
                message: 'RC does not exist.',
                remainingTokens: user.tokens.rc
            });
        }

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize rcHistory array if it doesn't exist
        if (!user.documents.rcHistory) {
            user.documents.rcHistory = [];
        }

        // Extract RC details from response
        const rcData = verification_data.data;
        const { 
            owner_name,
            vehicle_number,
            vehicle_type,
            engine_number,
            chassis_number,
            registration_date,
            valid_from,
            valid_to,
            address,
            state,
            pincode,
            challan_details
        } = rcData;

        // Create verification data with safe date parsing
        const verificationData = {
            number: rc_number,
            ownerName: owner_name,
            vehicleNumber: vehicle_number,
            vehicleType: vehicle_type,
            engineNumber: engine_number,
            chassisNumber: chassis_number,
            registrationDate: parseDate(registration_date),
            validFrom: parseDate(valid_from),
            validTo: parseDate(valid_to),
            address,
            state,
            pincode,
            challanDetails: challan_details,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.rcHistory.push(verificationData);
        
        // Update latest RC verification
        user.documents.latestRC = verificationData;
        
        // Save user document again with history
        await user.save();
        console.log('RC verification saved successfully for user:', user._id);

        // Update session with new token count and verification history
        req.session.user = user.toObject();

        res.json({
            success: true,
            message: 'RC challan details fetched successfully',
            data: verificationData,
            remainingTokens: user.tokens.rc
        });
    } catch (error) {
        console.error('Error in RC challan verification:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error processing verification request'
        });
    }
});

// Save DL verification history
router.post('/save-dl-history', async (req, res) => {
    try {
        const { dl_number, dob, consent, verification_data } = req.body;

        // Find user by session
        let user = req.session.user;
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification.'
            });
        }

        // Find the user in database
        user = await User.findById(user._id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found. Please log in again.'
            });
        }

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize dlHistory array if it doesn't exist
        if (!user.documents.dlHistory) {
            user.documents.dlHistory = [];
        }

        // Check if DL doesn't exist
        if (verification_data.code === '1001') {
            const verificationData = {
                number: dl_number,
                dateOfBirth: parseDate(dob),
                verified: false,
                verificationDate: new Date(),
                error: {
                    code: verification_data.code,
                    message: verification_data.message
                }
            };

            // Add to history
            user.documents.dlHistory.push(verificationData);
            
            // Update latest DL verification
            user.documents.latestDL = verificationData;
            
            // Save user document
            await user.save();
            console.log('DL verification (not found) saved successfully for user:', user._id);

            // Update session with verification history
            req.session.user = user.toObject();

            return res.json({
                success: true,
                message: 'DL verification history saved successfully'
            });
        }

        // Create verification data with safe date parsing for successful verification
        const verificationData = {
            number: dl_number,
            name: verification_data.name,
            dateOfBirth: parseDate(dob),
            validFrom: parseDate(verification_data.validFrom),
            validTo: parseDate(verification_data.validTo),
            status: verification_data.status,
            bloodGroup: verification_data.bloodGroup,
            vehicleClasses: verification_data.vehicleClasses,
            address: verification_data.address,
            state: verification_data.state,
            pincode: verification_data.pincode,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.dlHistory.push(verificationData);
        
        // Update latest DL verification
        user.documents.latestDL = verificationData;
        
        // Save user document
        await user.save();
        console.log('DL verification saved successfully for user:', user._id);

        // Update session with verification history
        req.session.user = user.toObject();

        res.json({
            success: true,
            message: 'DL verification history saved successfully'
        });
    } catch (error) {
        console.error('Error in saving DL verification history:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error saving verification history'
        });
    }
});

// Save criminal court verification history
router.post('/save-criminal-court-history', async (req, res) => {
    try {
        const { name, father_name, address, date_of_birth, consent, verification_data } = req.body;

        // Find user by session
        let user = req.session.user;
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification.'
            });
        }

        // Find the user in database
        user = await User.findById(user._id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found. Please log in again.'
            });
        }

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize criminalCourtHistory array if it doesn't exist
        if (!user.documents.criminalCourtHistory) {
            user.documents.criminalCourtHistory = [];
        }

        // Create verification data with safe date parsing
        const verificationData = {
            name,
            fatherName: father_name,
            address,
            dateOfBirth: parseDate(date_of_birth),
            verified: verification_data.status === '200' || verification_data.verified === true,
            verificationDate: new Date(),
            _id: new mongoose.Types.ObjectId() // Add unique ID for each record
        };

        // If verification was successful, add court data
        if (verification_data.status === '200' || verification_data.verified === true) {
            Object.assign(verificationData, {
                caseNumber: verification_data.case_number || '-',
                courtName: verification_data.court_name || '-',
                caseType: verification_data.case_type || '-',
                filingDate: parseDate(verification_data.filing_date),
                status: verification_data.status || '200',
                judgeName: verification_data.judge_name || '-',
                petitioner: verification_data.petitioner || '-',
                respondent: verification_data.respondent || '-',
                nextHearingDate: parseDate(verification_data.next_hearing_date)
            });
        } else {
            // Add error message for failed verification
            verificationData.error = {
                message: verification_data.message || 'No records found'
            };
        }

        // Add to history
        user.documents.criminalCourtHistory.push(verificationData);
        
        // Update latest criminal court verification
        user.documents.latestCriminalCourt = verificationData;
        
        // Save user document
        await user.save();
        console.log('Criminal court verification saved successfully for user:', user._id);

        // Update session with verification history
        req.session.user = user.toObject();

        res.json({
            success: true,
            message: 'Criminal court verification history saved successfully'
        });
    } catch (error) {
        console.error('Error in saving criminal court verification history:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error saving verification history'
        });
    }
});

router.post('/check-tokens', async (req, res) => {
    try {
        const { service } = req.body;
        const user = await User.findById(req.session.user._id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check if tokens exist and are greater than 0
        if (!user.tokens || user.tokens[service] <= 0) {
            return res.status(403).json({ 
                success: false, 
                message: `No tokens available for ${service.toUpperCase()} verification.` 
            });
        }

        // Check if tokens are active
        if (!user.tokenStatus || user.tokenStatus[service] === false) {
            return res.status(403).json({ 
                success: false, 
                message: `${service.toUpperCase()} tokens are currently inactive. Please contact the administrator.` 
            });
        }

        // Deduct one token
        user.tokens[service] -= 1;

        // Add token usage record
        if (!user.tokenUsage) {
            user.tokenUsage = [];
        }

        user.tokenUsage.push({
            service: service,
            action: 'used',
            amount: 1,
            timestamp: new Date(),
            details: `${service.toUpperCase()} verification token used`
        });

        await user.save();

        // Update session
        req.session.user = user;

        res.json({ 
            success: true, 
            message: 'Token deducted successfully',
            remainingTokens: user.tokens[service]
        });
    } catch (error) {
        console.error('Error checking/deducting tokens:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error processing token request' 
        });
    }
});

// Save MCA verification history
router.post('/save-mca-history', async (req, res) => {
    try {
        const { type, data, verified, verificationDate } = req.body;

        // Find user by session
        let user = req.session.user;
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to perform verification.'
            });
        }

        // Find the user in database
        user = await User.findById(user._id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found. Please log in again.'
            });
        }

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize mcaHistory array if it doesn't exist
        if (!user.documents.mcaHistory) {
            user.documents.mcaHistory = [];
        }

        // Create verification data
        const verificationData = {
            type,
            ...data,
            verified,
            verificationDate: verificationDate || new Date(),
            _id: new mongoose.Types.ObjectId() // Add unique ID for each record
        };

        // Add to history
        user.documents.mcaHistory.push(verificationData);
        
        // Update latest MCA verification
        user.documents.latestMCA = verificationData;
        
        // Save user document
        await user.save();
        console.log('MCA verification saved successfully for user:', user._id);

        // Update session with verification history
        req.session.user = user.toObject();

        res.json({
            success: true,
            message: 'MCA verification history saved successfully'
        });
    } catch (error) {
        console.error('Error in saving MCA verification history:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error saving verification history'
        });
    }
});

router.post('/pan-verify', async (req, res) => {
    try {
        const { pan, consent } = req.body;
        
        // Validate required fields
        if (!pan || !consent) {
            return res.status(400).json({ 
                success: false, 
                message: 'PAN number and consent are required' 
            });
        }

        // Get user from session
        const userId = req.session.userId;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Check if user has enough tokens
        if (!user.tokens || !user.tokens.pan || user.tokens.pan <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Insufficient PAN verification tokens' 
            });
        }

        // Call Gridlines API
        const options = {
            method: 'POST',
            url: 'https://api.gridlines.io/pan-api/verify',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.GRIDLINES_API_KEY
            },
            data: {
                pan: pan,
                consent: consent
            }
        };

        const response = await axios(options);
        const panData = response.data;

        // Extract PAN details
        const panDetails = {
            pan: panData.data.pan,
            name: panData.data.name,
            status: panData.data.status,
            lastUpdated: panData.data.last_updated,
            aadhaarSeedingStatus: panData.data.aadhaar_seeding_status,
            aadhaarSeedingDate: panData.data.aadhaar_seeding_date,
            category: panData.data.category,
            gender: panData.data.gender,
            dateOfBirth: panData.data.date_of_birth,
            maskedAadhaar: panData.data.masked_aadhaar,
            email: panData.data.email,
            mobile: panData.data.mobile,
            address: panData.data.address,
            city: panData.data.city,
            state: panData.data.state,
            pincode: panData.data.pincode
        };

        // Initialize documents array if it doesn't exist
        if (!user.documents) {
            user.documents = [];
        }

        // Add PAN verification to documents array
        user.documents.push({
            type: 'pan',
            data: panDetails,
            verified: true,
            verificationDate: new Date()
        });

        // Update latest PAN verification
        user.latestPanVerification = panDetails;

        // Deduct one token
        user.tokens.pan -= 1;

        // Add token usage record with proper timestamp
        if (!user.tokenUsage) {
            user.tokenUsage = [];
        }

        const currentTime = new Date();
        user.tokenUsage.push({
            service: 'pan',
            action: 'used',
            amount: 1,
            timestamp: currentTime,
            details: {
                type: 'verification',
                pan: pan,
                status: panData.data.status,
                verificationDate: currentTime
            }
        });

        // Save user document
        await user.save();

        // Update session
        req.session.user = user;

        res.json({
            success: true,
            message: 'PAN verification successful',
            data: panDetails,
            remainingTokens: user.tokens.pan
        });

    } catch (error) {
        console.error('PAN verification error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify PAN',
            error: error.message
        });
    }
});

module.exports = router;