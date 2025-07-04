const express = require('express');
const router = express.Router();

// Service selection page
router.get('/:service', (req, res) => {
    const { service } = req.params;
    const serviceDetails = {
        pan: {
            name: 'PAN Card Verification',
            price: 50,
            description: 'Verify PAN card details instantly'
        },
        aadhar: {
            name: 'Aadhar Card Verification',
            price: 75,
            description: 'Verify Aadhar card details with OTP'
        },
        gst: {
            name: 'GST Verification',
            price: 100,
            description: 'Verify GST details instantly',
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
        dl: {
            name: 'Driving License Verification',
            price: 60,
            description: 'Verify driving license details'        },
        voter: {
            name: 'Voter ID Verification',
            price: 40,
            description: 'Verify voter ID details'
        },
        cowin: {
            name: 'CoWIN Vaccination Certificate',
            price: 50,
            description: 'Verify and download COVID-19 vaccination certificates'
        },
        ccrv: {
            name: 'Criminal & Court Verification',
            price: 200,
            description: 'Comprehensive background check'
        },
        employee: {
            name: 'Employee Verification',
            price: 200,
            description: 'Verify employee details through EPFO using UAN, PAN, or employer details',
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
        },
        rc: {
            name: 'RC Verification',
            price: 150,
            description: 'Verify vehicle registration certificate details including owner name, vehicle details, and validity.',
            options: ['Registration Number']
        },
        bank: {
            name: 'Bank Verification',
            price: 150,
            description: 'Verify bank account details or UPI ID for secure transactions.',
            options: ['Bank Account Verification', 'UPI Verification']
        },
        passport: {
            name: 'Passport Verification',
            price: 100,
            description: 'Verify Indian passport details, generate and verify MRZ, or fetch passport info.',
            options: [
                { id: 'generate-mrz', name: 'Generate MRZ', description: 'Generate MRZ from passport details' },
                { id: 'verify-mrz', name: 'Verify MRZ', description: 'Verify MRZ code' },
                { id: 'passport-verify', name: 'Passport Verify', description: 'Verify passport details' },
                { id: 'passport-fetch', name: 'Passport Fetch', description: 'Fetch passport info' }
            ]
        }
    };

    // Special handling for passport sub-services
    if (service === 'passport-generate-mrz' || service === 'passport-verify-mrz' || 
        service === 'passport-verify' || service === 'passport-fetch') {
        const baseDetails = serviceDetails.passport;
        let serviceInfo = {
            name: baseDetails.name,
            price: baseDetails.price,
            description: baseDetails.description,
        };

        if (service === 'passport-generate-mrz') {
            serviceInfo.subService = 'generate-mrz';
            serviceInfo.subServiceName = 'Generate MRZ';
        } else if (service === 'passport-verify-mrz') {
            serviceInfo.subService = 'verify-mrz';
            serviceInfo.subServiceName = 'Verify MRZ';
        } else if (service === 'passport-verify') {
            serviceInfo.subService = 'passport-verify';
            serviceInfo.subServiceName = 'Passport Verify';
        } else if (service === 'passport-fetch') {
            serviceInfo.subService = 'passport-fetch';
            serviceInfo.subServiceName = 'Passport Fetch';
        }
        
        return res.render('passport-service', {
            service: 'passport', 
            subService: serviceInfo.subService,
            serviceInfo: serviceInfo,
            user: req.session.user
        });
    }    // Handle the main passport service page
    if (service === 'passport') {
        const serviceInfo = serviceDetails[service];
        return res.render('service-details', {
            service: service,
            serviceInfo: serviceInfo,
            user: req.session.user,
            isMainPassportPage: true
        });
    }
    
    const serviceInfo = serviceDetails[service];
    if (!serviceInfo) {
        return res.redirect('/');
    }

    res.render('service-details', {
        service: service,
        serviceInfo: serviceInfo,
        user: req.session.user
    });
});

module.exports = router;