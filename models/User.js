const mongoose = require('mongoose');

// Create indexes when the connection is established
mongoose.connection.on('connected', async () => {
    try {
        // Create indexes with sparse option
        await mongoose.connection.db.collection('users').createIndex({ email: 1 }, { sparse: true });
        await mongoose.connection.db.collection('users').createIndex({ phone: 1 }, { sparse: true });
        console.log('Created indexes successfully');
    } catch (error) {
        console.error('Error creating indexes:', error);
    }
});

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        sparse: true
    },
    phone: {
        type: String,
        sparse: true
    },
    password: {
        type: String,
        required: true
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other'],
        default: null
    },
    age: {
        type: Number,
        min: 1,
        max: 120,
        default: null
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    isPhoneVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationOTP: {
        otp: String,
        expiresAt: Date
    },
    phoneVerificationOTP: {
        otp: String,
        expiresAt: Date
    },
    tokenStatus: {
        pan: { type: Boolean, default: true },
        aadhar: { type: Boolean, default: true },
        gst: { type: Boolean, default: true },
        dl: { type: Boolean, default: true },
        voter: { type: Boolean, default: true },
        ccrv: { type: Boolean, default: true },
        employee: { type: Boolean, default: true },
        rc: { type: Boolean, default: true },
        bank: { type: Boolean, default: true },
        passport: { type: Boolean, default: true },
        mca: { type: Boolean, default: true },
        cowin: { type: Boolean, default: true }
    },
    documents: {
        gstHistory: [{
            number: String,
            businessName: String,
            legalName: String,
            address: String,
            state: String,
            pincode: String,
            registrationDate: Date,
            status: String,
            pan: String,
            constitutionOfBusiness: String,
            taxpayerType: String,
            centerJurisdiction: String,
            stateJurisdiction: String,
            verified: Boolean,
            verificationDate: Date
        }],
        mcaHistory: [{
            type: {
                type: String,
                enum: ['company', 'director', 'din-by-pan', 'pan-by-din', 'by-name'],
                required: true
            },
            companyId: String,
            companyName: String,
            din: String,
            pan: String,
            name: String,
            data: Object,
            verified: Boolean,
            verificationDate: Date,
            error: {
                message: String
            }
        }],
        criminalCourtHistory: [{
            name: String,
            fatherName: String,
            address: String,
            dateOfBirth: Date,
            caseNumber: String,
            courtName: String,
            caseType: String,
            filingDate: Date,
            status: String,
            judgeName: String,
            petitioner: String,
            respondent: String,
            nextHearingDate: Date,
            verified: Boolean,
            verificationDate: Date,
            error: {
                message: String
            }
        }],
        panHistory: [{
            number: String,
            name: String,
            status: String,
            document_type: String,
            aadhaar_linked: Boolean,
            name_match_status: String,
            dob_match_status: String,
            verified: Boolean,
            verificationDate: Date
        }],
        voterHistory: [{
            number: String,
            name: String,
            age: String,
            gender: String,
            district: String,
            state: String,
            assemblyConstituency: String,
            parliamentaryConstituency: String,
            partName: String,
            pollingStation: String,
            husbandName: String,
            verified: Boolean,
            verificationDate: Date
        }],
        dlHistory: [{
            number: String,
            name: String,
            dateOfBirth: Date,
            validFrom: Date,
            validTo: Date,
            address: String,
            state: String,
            pincode: String,
            bloodGroup: String,
            vehicleClasses: [String],
            status: String,
            verified: Boolean,
            verificationDate: Date
        }],
        aadharHistory: [{
            number: String,
            name: String,
            gender: String,
            dateOfBirth: Date,
            address: String,
            state: String,
            pincode: String,
            verified: Boolean,
            verificationDate: Date
        }],
        rcHistory: [{
            number: String,
            ownerName: String,
            vehicleNumber: String,
            vehicleType: String,
            engineNumber: String,
            chassisNumber: String,
            registrationDate: Date,
            validFrom: Date,
            validTo: Date,
            address: String,
            state: String,
            pincode: String,
            verified: Boolean,
            verificationDate: Date
        }],
        bankHistory: [{
            accountNumber: String,
            ifsc: String,
            accountHolderName: String,
            bankName: String,
            branchName: String,
            accountType: String,
            status: String,
            verified: Boolean,
            verificationDate: Date
        }],
        passportHistory: [{
            number: String,
            name: String,
            nationality: String,
            dateOfBirth: Date,
            placeOfBirth: String,
            issueDate: Date,
            expiryDate: Date,
            gender: String,
            address: String,
            verified: Boolean,
            verificationDate: Date
        }],
        employeeHistory: [{
            uan: String,
            name: String,
            employerName: String,
            establishmentCode: String,
            establishmentId: String,
            status: String,
            verified: Boolean,
            verificationDate: Date
        }],
        cowinHistory: [{
            beneficiaryId: String,
            name: String,
            dateOfBirth: Date,
            gender: String,
            mobileNumber: String,
            vaccinationStatus: String,
            doses: [{
                doseNumber: Number,
                vaccineName: String,
                date: Date,
                center: String
            }],
            verified: Boolean,
            verificationDate: Date
        }],
        latestGst: { type: Object },
        latestPan: { type: Object },
        latestVoter: { type: Object },
        latestDL: { type: Object },
        latestAadhar: { type: Object },
        latestRC: { type: Object },
        latestBank: { type: Object },
        latestPassport: { type: Object },
        latestEmployee: { type: Object },
        latestCowin: { type: Object },
        profilePersonalHistory: [{
            phone: String,
            firstName: String,
            fullName: String,
            dateOfBirth: Date,
            pan: String,
            address: String,
            state: String,
            pincode: String,
            data: Object,
            verified: Boolean,
            verificationDate: Date
        }],
        profileNationalIdsHistory: [{
            phone: String,
            firstName: String,
            fullName: String,
            dateOfBirth: Date,
            pan: String,
            address: String,
            state: String,
            pincode: String,
            data: Object,
            verified: Boolean,
            verificationDate: Date
        }],
        profileAddressHistory: [{
            phone: String,
            firstName: String,
            fullName: String,
            dateOfBirth: Date,
            pan: String,
            address: String,
            state: String,
            pincode: String,
            data: Object,
            verified: Boolean,
            verificationDate: Date
        }],
        profilePanHistory: [{
            phone: String,
            firstName: String,
            fullName: String,
            dateOfBirth: Date,
            pan: String,
            address: String,
            state: String,
            pincode: String,
            data: Object,
            verified: Boolean,
            verificationDate: Date
        }],
        latestProfilePersonal: { type: Object },
        latestProfileNationalIds: { type: Object },
        latestProfileAddress: { type: Object },
        latestProfilePan: { type: Object }
    },
    cart: {
        items: [{
            service: String,
            quantity: Number,
            price: Number
        }],
        total: Number
    },
    isSuperAdmin: {
        type: Boolean,
        default: false
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    tokens: {
        pan: { type: Number, default: 0 },
        aadhar: { type: Number, default: 0 },
        gst: { type: Number, default: 0 },
        dl: { type: Number, default: 0 },
        voter: { type: Number, default: 0 },
        ccrv: { type: Number, default: 0 },
        employee: { type: Number, default: 0 },
        rc: { type: Number, default: 0 },
        bank: { type: Number, default: 0 },
        passport: { type: Number, default: 0 },
        mca: { type: Number, default: 0 },
        cowin: { type: Number, default: 0 },
        profile: { type: Number, default: 0 }
    },
    tokenUsage: [{
        service: {
            type: String,
            required: true
        },
        action: {
            type: String,
            required: true,
            enum: ['added', 'used', 'shared', 'activated', 'deactivated', 'deleted']
        },
        amount: {
            type: Number,
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        details: {
            type: String
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Drop the unique index on email if it exists
userSchema.index({ email: 1 }, { unique: false });

// Pre-save hook to create default superadmin
userSchema.pre('save', async function(next) {
    try {
        // Check if this is a new user
        if (this.isNew) {
            // Check if superadmin already exists
            const superadminExists = await this.constructor.findOne({ isSuperAdmin: true });
            
            // If no superadmin exists and this is the default superadmin credentials
            if (!superadminExists && this.email === 'admin@example.com') {
                this.isSuperAdmin = true;
                this.tokens = {
                    pan: 1000,
                    aadhar: 1000,
                    gst: 1000,
                    dl: 1000,
                    voter: 1000,
                    ccrv: 1000,
                    employee: 1000,
                    rc: 1000,
                    bank: 1000,
                    passport: 1000,
                    mca: 1000,
                    cowin: 1000,
                    profile: 1000
                };
            }
        }
        next();
    } catch (error) {
        next(error);
    }
});

module.exports = mongoose.model('User', userSchema); 