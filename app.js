const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const User = require('./models/User');
const SharedDashboard = require('./models/SharedDashboard');
const crypto = require('crypto');
const { sendVerificationEmail, sendPasswordResetEmail, sendContactFormEmail, transporter } = require('./utils/emailConfig');
const axios = require('axios');
const Blog = require('./models/Blog');
const dashboardRoutes = require('./routes/dashboard');
const fs = require('fs');

const app = express();

// Connect to MongoDB
mongoose.connect('mongodb+srv://gavenue110907:%4099Gavenue%40@cluster0.shcyv.mongodb.net/api?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.error('MongoDB connection error:', err);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true in production with HTTPS
}));

// Middleware to make user available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/cart', require('./routes/cart'));
app.use('/verification', require('./routes/verification'));
app.use('/services', require('./routes/services'));
app.use('/history', require('./routes/history'));
app.use('/admin', require('./routes/admin'));
app.use('/profile', require('./routes/profile'));
app.use('/superadmin', require('./routes/superadmin'));
app.use('/', require('./routes/auth'));

// Mount routes
app.use('/dashboard', dashboardRoutes);

// Add bank verification route
app.post('/verify-bank', require('./routes/verification').post('/verify-bank'));

// Home route
app.get('/', async (req, res) => {
    try {
        const blogs = await Blog.find({ status: 'published' })
            .sort({ createdAt: -1 })
            .limit(6);
        res.render('newhome', { 
            user: req.session.user,
            blogs: blogs
        });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.status(500).send('Error loading home page');
    }
});

app.get('/services', (req, res) => {
    res.render('service', { user: req.session.user || null });
});

app.get('/service/:slug', (req, res) => {
    const slug = req.params.slug;
    const servicesPath = path.join(__dirname, 'service.json');
    fs.readFile(servicesPath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Service data not found');
        const services = JSON.parse(data);
        const service = services.find(s => s.slug === slug);
        if (!service) return res.status(404).send('Service not found');
        // Find related services
        const related = services.filter(s => service.related && service.related.includes(s.slug));
        res.render('service-product', {
            user: req.session.user || null,
            service,
            related
        });
    });
});

app.get('/dashboard/service', isAuthenticated, async (req, res) => {
    try {
        // Get fresh user data from database
        const user = await User.findById(req.session.user._id).lean();
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }
        
        // Update session with latest user data
        req.session.user = user;
        
        res.render('newdashboard', { user });
    } catch (error) {
        console.error('Dashboard service error:', error);
        res.status(500).render('error', {
            message: 'Error loading dashboard'
        });
    }
});

app.get('/about', (req, res) => {
    res.render('about', { user: req.session.user || null });
});

// Login page
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('login');
});

// Forgot Password Routes
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password');
});

app.get('/disclaimer', (req, res) => {
    res.render('disclaimer');
});

app.get('/helper',(req,res)=>{
    res.render('helper')
});

app.get('/return',(req,res)=>{
    res.render('return')
});

app.get('/safety',(req,res)=>{
    res.render('safety')
});

app.get('/policy',(req,res)=>{
    res.render('policy')
});

app.get('/contact', (req, res) => {
    res.render('contact');
});

app.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'No account found with this email address' 
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // Token valid for 1 hour
        await user.save();

        // Send reset email
        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
        const emailSent = await sendPasswordResetEmail(user.email, resetUrl);
        
        if (!emailSent) {
            throw new Error('Failed to send reset email');
        }

        res.json({ 
            success: true, 
            message: 'Password reset instructions sent to your email' 
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error processing password reset request' 
        });
    }
});

app.get('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.render('reset-password', { 
                error: 'Password reset token is invalid or has expired' 
            });
        }

        res.render('reset-password', { token: req.params.token });
    } catch (error) {
        console.error('Reset password error:', error);
        res.render('reset-password', { 
            error: 'Error processing password reset request' 
        });
    }
});

app.post('/reset-password/:token', async (req, res) => {
    try {
        const { password } = req.body;
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password reset token is invalid or has expired' 
            });
        }

        // Update password
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ 
            success: true, 
            message: 'Password has been reset successfully' 
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error resetting password' 
        });
    }
});

// Register page
app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('register');
});

// Login route with superadmin logic
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Always check for hardcoded superadmin first
        if (email === 'admin@example.com' && password === 'admin123') {
            req.session.user = {
                email,
                isSuperAdmin: true
            };
            return res.redirect('/superadmin/dashboard');
        }

        // Prevent DB login for admin@example.com with wrong password
        if (email === 'admin@example.com') {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (user.isSuperAdmin) {
            if (password === user.password) {
                req.session.user = user;
                return res.redirect('/superadmin/dashboard');
            }
        } else {
            if (!user.isEmailVerified) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Please verify your email first' 
                });
            }

            if (password === user.password) {
                req.session.user = user;
                return res.redirect('/dashboard');
            }
        }

        res.status(401).json({ success: false, message: 'Invalid credentials' });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});



// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

// Middleware to check and deduct tokens
function deductToken(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    const user = req.session.user;
    const service = req.path.split('/').pop().split('-')[0]; // Extract service name from path

    // Check if tokens exist and are greater than 0
    if (!user.tokens || user.tokens[service] <= 0) {
        return res.status(403).json({ success: false, message: `No tokens available for ${service.toUpperCase()} verification.` });
    }

    // Check if tokens are active
    if (!user.tokenStatus || user.tokenStatus[service] === false) {
        return res.status(403).json({ success: false, message: `${service.toUpperCase()} tokens are currently inactive. Please contact the administrator.` });
    }

    // Deduct one token
    user.tokens[service] -= 1;
    
    // Update the user in the database
    User.findByIdAndUpdate(user._id, { $set: { [`tokens.${service}`]: user.tokens[service] } }, { new: true })
        .then(updatedUser => {
            if (!updatedUser) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }
            req.session.user = updatedUser;
            next();
        })
        .catch(err => {
            console.error('Error updating tokens:', err);
            res.status(500).json({ success: false, message: 'Internal server error' });
        });
}

// Middleware to check and deduct RC tokens
function deductRcToken(req, res, next) {
    const user = req.session.user;
    if (!user || user.tokens.rc <= 0) {
        const errorMessage = 'No tokens available for RC verification.';
        return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
    }
    // Deduct one token
    user.tokens.rc -= 1;
    // Update the user in the database
    User.findByIdAndUpdate(user._id, { $set: { 'tokens.rc': user.tokens.rc } }, { new: true })
        .then(updatedUser => {
            req.session.user = updatedUser; // Update session
            next();
        })
        .catch(err => {
            console.error('Error updating tokens:', err);
            const errorMessage = 'Error updating tokens. Please try again.';
            return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
        });
}

// Middleware to check RC tokens availability
function checkRcToken(req, res, next) {
    const user = req.session.user;
    if (!user || user.tokens.rc <= 0) {
        const errorMessage = 'No tokens available for RC verification.';
        return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
    }
    next();
}

// RC Verification Routes
app.get('/rc-fetch-detailed', checkRcToken, (req, res) => {
    res.render('rc-fetch-detailed');
});

app.get('/rc-fetch-detailed-challan', checkRcToken, (req, res) => {
    res.render('rc-fetch-detailed-challan');
});

app.get('/rc-fetch-by-chassis', checkRcToken, (req, res) => {
    res.render('rc-fetch-by-chassis');
});

// Middleware to check and deduct GST tokens
function deductGstToken(req, res, next) {
    const user = req.session.user;
    if (!user || user.tokens.gst <= 0) {
        const errorMessage = 'No tokens available for GST verification.';
        return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
    }
    // Deduct one token
    user.tokens.gst -= 1;
    // Update the user in the database
    User.findByIdAndUpdate(user._id, { $set: { 'tokens.gst': user.tokens.gst } }, { new: true })
        .then(updatedUser => {
            req.session.user = updatedUser; // Update session
            next();
        })
        .catch(err => {
            console.error('Error updating tokens:', err);
            const errorMessage = 'Error updating tokens. Please try again.';
            return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
        });
}

// Apply the middleware to the GST service routes
app.get('/gst-fetch-detailed', (req, res) => {
    res.render('gst-fetch-detailed');
});

app.get('/gst-fetch-by-pan', (req, res) => {
    res.render('gst-fetch-by-pan');
});

app.get('/gst-fetch-by-name', (req, res) => {
    res.render('gst-fetch-by-name');
});

app.get('/gst-fetch-contact-details', (req, res) => {
    res.render('gst-fetch-contact-details');
});

app.get('/gst-fetch-by-mobile', (req, res) => {
    res.render('gst-fetch-by-mobile');
});

app.get('/dashboard/identity', (req, res) => {
    res.render('service-identity');
});
app.get('/dashboard/assets', (req, res) => {
    res.render('service-asset');
});
app.get('/dashboard/vaccination', (req, res) => {
    res.render('service-vaccination');
});
app.get('/dashboard/income', (req, res) => {
    res.render('service-income');
});
app.get('/dashboard/business', (req, res) => {
    res.render('service-business');
});
app.get('/dashboard/employment', (req, res) => {
    res.render('service-employment');
});


// Middleware to check and deduct MCA tokens
function deductMcaToken(req, res, next) {
    const user = req.session.user;
    if (!user || user.tokens.mca <= 0) {
        const errorMessage = 'No tokens available for MCA verification.';
        return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
    }
    // Deduct one token
    user.tokens.mca -= 1;
    // Update the user in the database
    User.findByIdAndUpdate(user._id, { $set: { 'tokens.mca': user.tokens.mca } }, { new: true })
        .then(updatedUser => {
            req.session.user = updatedUser; // Update session
            next();
        })
        .catch(err => {
            console.error('Error updating tokens:', err);
            const errorMessage = 'Error updating tokens. Please try again.';
            return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
        });
}

// Apply the middleware to the MCA service routes
app.get('/mca-fetch-company', checkMcaToken, (req, res) => {
    res.render('mca-fetch-company');
});

app.get('/mca-fetch-director', checkMcaToken, (req, res) => {
    res.render('mca-fetch-director');
});

app.get('/mca-fetch-by-name', checkMcaToken, (req, res) => {
    res.render('mca-fetch-by-name');
});

app.get('/mca-fetch-din-by-pan', checkMcaToken, (req, res) => {
    res.render('mca-fetch-din-by-pan');
});

app.get('/mca-fetch-pan-by-din', checkMcaToken, (req, res) => {
    res.render('mca-fetch-pan-by-din');
});

app.get('/blog', async (req, res) => {
    try {
        const blogs = await Blog.find({ status: 'published' })
            .sort({ createdAt: -1 })
            .limit(6);
        res.render('blog', { 
            user: req.session.user,
            blogs: blogs
        });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.status(500).send('Error loading home page');
    }
});

// Add new route for individual blog posts
app.get('/blog/:slug', async (req, res) => {
    try {
        const blog = await Blog.findOne({ 
            slug: req.params.slug,
            status: 'published'
        });
        
        if (!blog) {
            return res.status(404).render('error', { 
                message: 'Blog post not found',
                user: req.session.user
            });
        }

        // Get related blogs (same category, excluding current blog)
        const relatedBlogs = await Blog.find({
            category: blog.category,
            _id: { $ne: blog._id },
            status: 'published'
        })
        .sort({ createdAt: -1 })
        .limit(3);

        res.render('blog-detail', { 
            user: req.session.user,
            blog: blog,
            relatedBlogs: relatedBlogs
        });
    } catch (error) {
        console.error('Error loading blog post:', error);
        res.status(500).render('error', { 
            message: 'Error loading blog post',
            user: req.session.user
        });
    }
});

app.post('/mca-fetch-pan-by-din', deductMcaToken, (req, res) => {
    res.json({ success: true });
});

// Middleware to check and deduct CoWIN tokens
function deductCowinToken(req, res, next) {
    const user = req.session.user;
    if (!user || user.tokens.cowin <= 0) {
        const errorMessage = 'No tokens available for CoWIN verification.';
        return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
    }
    // Deduct one token
    user.tokens.cowin -= 1;
    // Update the user in the database
    User.findByIdAndUpdate(user._id, { $set: { 'tokens.cowin': user.tokens.cowin } }, { new: true })
        .then(updatedUser => {
            req.session.user = updatedUser; // Update session
            next();
        })
        .catch(err => {
            console.error('Error updating tokens:', err);
            const errorMessage = 'Error updating tokens. Please try again.';
            return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
        });
}

// Apply the middleware to the CoWIN service routes
app.get('/cowin-generate-otp', deductCowinToken, (req, res) => {
    res.render('cowin-generate-otp');
});

app.post('/cowin-generate-otp', deductCowinToken, (req, res) => {
    res.json({ success: true });
});

app.get('/cowin-validate-otp', deductCowinToken, (req, res) => {
    res.render('cowin-validate-otp');
});

app.post('/cowin-validate-otp', deductCowinToken, (req, res) => {
    res.json({ success: true });
});

app.get('/cowin-beneficiaries', deductCowinToken, (req, res) => {
    res.render('cowin-beneficiaries');
});

app.post('/cowin-beneficiaries', deductCowinToken, (req, res) => {
    res.json({ success: true });
});

// Middleware to check and deduct bank tokens
function deductBankToken(req, res, next) {
    const user = req.session.user;
    if (!user || user.tokens.bank <= 0) {
        const errorMessage = 'No tokens available for bank verification.';
        return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
    }
    // Deduct one token
    user.tokens.bank -= 1;
    // Update the user in the database
    User.findByIdAndUpdate(user._id, { $set: { 'tokens.bank': user.tokens.bank } }, { new: true })
        .then(updatedUser => {
            req.session.user = updatedUser; // Update session
            next();
        })
        .catch(err => {
            console.error('Error updating tokens:', err);
            const errorMessage = 'Error updating tokens. Please try again.';
            return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
        });
}

// Bank Verification Routes
app.get('/bank-verification', (req, res) => {
    res.render('bank-verification');
});

app.get('/bank-verify', (req, res) => {
    res.render('bank-verify');
});

app.get('/bank-verify-penniless', (req, res) => {
    res.render('bank-verify-penniless');
});

app.get('/bank-verify-hybrid', (req, res) => {
    res.render('bank-verify-hybrid');
});

// Bank Verification API Routes
app.post('/bank-verify', deductBankToken, (req, res) => {
    res.json({ success: true });
});

app.post('/bank-verify-penniless', deductBankToken, (req, res) => {
    res.json({ success: true });
});

app.post('/bank-verify-hybrid', deductBankToken, (req, res) => {
    res.json({ success: true });
});

// Middleware to check and deduct employee tokens
function deductEmployeeToken(req, res, next) {
    const user = req.session.user;
    if (!user || user.tokens.employee <= 0) {
        const errorMessage = 'No tokens available for employee verification.';
        return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
    }
    // Deduct one token
    user.tokens.employee -= 1;
    // Update the user in the database
    User.findByIdAndUpdate(user._id, { $set: { 'tokens.employee': user.tokens.employee } }, { new: true })
        .then(updatedUser => {
            req.session.user = updatedUser; // Update session
            next();
        })
        .catch(err => {
            console.error('Error updating tokens:', err);
            const errorMessage = 'Error updating tokens. Please try again.';
            return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
        });
}

// Employee Verification Routes
app.get('/employee-verification', (req, res) => {
    res.render('employee-verification');
});

app.get('/terms-and-conditions', (req, res) => {
    res.render('term-condition');
});

app.get('/privacy-policy', (req, res) => {
    res.render('privacy-policy');
});
app.get('/refund-policy', (req, res) => {
    res.render('refund-policy');
});

app.get('/employee-fetch-uan', (req, res) => {
    res.render('employee-fetch-uan');
});

app.get('/employee-fetch-uan-by-pan', (req, res) => {
    res.render('employee-fetch-uan-by-pan');
});

app.get('/employee-verify-employer', (req, res) => {
    res.render('employee-verify-employer');
});

// Employee Verification API Routes
app.post('/employee-fetch-uan', deductEmployeeToken, (req, res) => {
    res.json({ success: true });
});

app.post('/employee-fetch-uan-by-pan', deductEmployeeToken, (req, res) => {
    res.json({ success: true });
});

app.post('/employee-verify-employer', deductEmployeeToken, (req, res) => {
    res.json({ success: true });
});

// Middleware to check and deduct PAN tokens
function deductPanToken(req, res, next) {
    const user = req.session.user;
    if (!user || user.tokens.pan <= 0) {
        const errorMessage = 'No tokens available for PAN verification.';
        return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
    }
    // Deduct one token
    user.tokens.pan -= 1;
    // Update the user in the database
    User.findByIdAndUpdate(user._id, { $set: { 'tokens.pan': user.tokens.pan } }, { new: true })
        .then(updatedUser => {
            req.session.user = updatedUser; // Update session
            next();
        })
        .catch(err => {
            console.error('Error updating tokens:', err);
            const errorMessage = 'Error updating tokens. Please try again.';
            return res.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
        });
}

// PAN Verification Routes
app.get('/pan-verify', (req, res) => {
    res.render('pan-verify');
});

// PAN Verification API Routes
app.post('/pan-verify', deductPanToken, async (req, res) => {
    try {
        const { panNumber, name, date_of_birth, consent } = req.body;
        
        // Make the actual API request
        const options = {
            method: 'POST',
            url: 'https://api.gridlines.io/pan-api/v3/verify',
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': 'yjVR74jEmdRwhn8GzO6Fpr2pZ3lE6Q28'
            },
            data: {
                pan_id: panNumber,
                name: name,
                date_of_birth: date_of_birth,
                consent: consent
            }
        };

        console.log('Making PAN verification request:', options.data);
        const response = await axios.request(options);
        console.log('PAN verification response:', response.data);

        // Get fresh user data
        const user = await User.findById(req.session.user._id);
        if (!user) {
            throw new Error('User not found');
        }

        // Initialize documents object if it doesn't exist
        if (!user.documents) {
            user.documents = {};
        }

        // Initialize panHistory array if it doesn't exist
        if (!user.documents.panHistory) {
            user.documents.panHistory = [];
        }

        // Create verification data
        const verificationData = {
            number: panNumber,
            name: name,
            status: response.data.data.pan_data.status,
            document_type: response.data.data.pan_data.document_type,
            aadhaar_linked: response.data.data.pan_data.aadhaar_linked,
            name_match_status: response.data.data.pan_data.name_match_status,
            dob_match_status: response.data.data.pan_data.dob_match_status,
            verified: true,
            verificationDate: new Date()
        };

        // Add to history
        user.documents.panHistory.push(verificationData);
        
        // Update latest PAN verification
        user.documents.latestPan = verificationData;
        
        // Save user document
        await user.save();
        console.log('PAN verification saved successfully for user:', user._id);

        // Update session with new token count and verification history
        req.session.user = user.toObject();

        // Return the complete API response
        res.json({
            success: true,
            data: response.data,
            remainingTokens: user.tokens.pan
        });
    } catch (error) {
        console.error('Error in PAN verification:', error);
        res.status(500).json({
            success: false,
            message: error.response?.data?.message || 'Error processing PAN verification',
            remainingTokens: req.session.user.tokens.pan
        });
    }
});

// Middleware to check if user is superadmin
function checkSuperadmin(req, res, next) {
    if (!req.session.user || !req.session.user.isSuperAdmin) {
        return res.status(403).json({ 
            success: false, 
            message: 'Access denied. Superadmin privileges required.' 
        });
    }
    next();
}

// Superadmin routes
app.get('/superadmin/dashboard', checkSuperadmin, async (req, res) => {
    try {
        res.render('superadmin-dashboard');
    } catch (error) {
        console.error('Error rendering superadmin dashboard:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// Get all users with their tokens
app.get('/superadmin/user-tokens', checkSuperadmin, async (req, res) => {
    try {
        // Find all users except superadmins
        const users = await User.find({ 
            isSuperAdmin: { $ne: true },
            tokenUsage: { $exists: true, $ne: [] } // Only users with token usage history
        }).select('email tokens _id tokenUsage');
        
        // Filter users who have had tokens added by superadmin
        const filteredUsers = users.filter(user => {
            return user.tokenUsage && user.tokenUsage.some(usage => 
                usage.action === 'added' && usage.details === 'Tokens added by superadmin'
            );
        });
        
        // Log the filtered users for debugging
        console.log('Filtered users with superadmin-added tokens:', filteredUsers);
        
        res.json(filteredUsers);
    } catch (error) {
        console.error('Error fetching user tokens:', error);
        res.status(500).json({ success: false, message: 'Error fetching user tokens' });
    }
});

// Get usage details for a specific user
app.get('/superadmin/user-usage/:userId', checkSuperadmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Get all services
        const services = ['pan', 'aadhar', 'gst', 'dl', 'voter', 'ccrv', 'employee', 'rc', 'bank', 'passport', 'mca', 'cowin'];
        
        // Calculate token statistics for each service
        const tokenStats = services.reduce((acc, service) => {
            // Get tokens added by super admin
            const addedBySuperAdmin = user.tokenUsage
                .filter(usage => usage.service.toLowerCase() === service && 
                               usage.action === 'added' && 
                               usage.details === 'Tokens added by superadmin')
                .reduce((sum, record) => sum + record.amount, 0);

            // Only include services that have tokens added by super admin
            if (addedBySuperAdmin > 0) {
                // Get current available tokens
                const currentTokens = user.tokens?.[service] || 0;

                acc[service] = {
                    addedBySuperAdmin,
                    currentTokens
                };
            }
            return acc;
        }, {});

        res.json({
            success: true,
            email: user.email,
            tokenStats
        });
    } catch (error) {
        console.error('Error fetching user usage:', error);
        res.status(500).json({ success: false, message: 'Error fetching usage details' });
    }
});

// Add tokens to user
app.post('/superadmin/share-dashboard', checkSuperadmin, async (req, res) => {
    try {
        const { email, services } = req.body;

        // Find the user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Initialize tokens object if it doesn't exist
        if (!user.tokens) {
            user.tokens = {};
        }

        // Add tokens for each service
        for (const service of services) {
            if (service.tokens > 0) {
                // Add tokens to user's account
                user.tokens[service.name] = (user.tokens[service.name] || 0) + service.tokens;

                // Track token usage
                if (!user.tokenUsage) {
                    user.tokenUsage = [];
                }

                user.tokenUsage.push({
                    service: service.name,
                    action: 'added',
                    amount: service.tokens,
                    timestamp: new Date(),
                    details: `Tokens added by superadmin`
                });
            }
        }

        await user.save();
        res.json({ success: true, message: 'Tokens added successfully' });
    } catch (error) {
        console.error('Error adding tokens:', error);
        res.status(500).json({ success: false, message: 'Error adding tokens' });
    }
});

// Middleware to check shared dashboard access
function checkSharedAccess(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

// Helper function to deduct token
async function deductToken(userId, serviceName) {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Get the shared dashboard for this user
        const dashboard = await SharedDashboard.findOne({
            sharedWith: user.email,
            isActive: true
        });

        if (!dashboard) {
            throw new Error('No active shared dashboard found');
        }

        // Find the service in the dashboard
        const service = dashboard.services.find(s => s.name === serviceName);
        if (!service || service.tokens <= 0) {
            throw new Error(`No tokens available for ${serviceName} verification in shared dashboard`);
        }

        // Deduct token from shared dashboard
        service.tokens -= 1;
        
        // Add usage record to shared dashboard
        service.usage.push({
            date: new Date(),
            count: 1
        });

        // Add usage record to user's token usage history
        user.tokenUsage.push({
            service: serviceName,
            action: 'used',
            amount: 1,
            details: 'Token used from shared dashboard'
        });

        await Promise.all([dashboard.save(), user.save()]);
        return dashboard;
    } catch (error) {
        console.error('Error deducting token:', error);
        throw error;
    }
}

// Shared Dashboard Routes
app.get('/shared-dashboard', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await SharedDashboard.findOne({ 
            sharedWith: req.session.user.email,
            isActive: true 
        });

        if (!dashboard) {
            return res.status(403).render('error', {
                sorry: 'Sorry!',
                title: 'You don\'t have any Shared Dashboard.',
                message: 'Please contact the dashboard owner for access',
                error: {
                    code: 'DASH_403'
                }
            });
        }

        const sharedTokens = {};
        dashboard.services.forEach(service => {
            sharedTokens[service.name] = service.tokens;
        });
        res.render('shared-dashboard', { sharedTokens });
    } catch (error) {
        console.error('Error loading shared dashboard:', error);
        res.status(500).render('error', {
            title: 'Server Error',
            message: 'An unexpected error occurred while loading the shared dashboard. Please try again later.',
            error: {
                code: 'DASH_500'
            }
        });
    }
});

// Shared Service Routes
app.get('/shared/:service', checkSharedAccess, async (req, res) => {
    try {
        const { service } = req.params;
        const dashboard = await getSharedDashboard(req.session.user.email);
        
        // Map route service names to dashboard service names
        const serviceNameMap = {
            'gst-fetch-detailed': 'gst',
            'gst-fetch-by-pan': 'gst',
            'gst-fetch-by-name': 'gst',
            'gst-fetch-contact-details': 'gst',
            'gst-fetch-by-mobile': 'gst',
            'dl-verify': 'dl',
            'dl-fetch-by-name': 'dl',
            'dl-fetch-by-dob': 'dl',
            'pan-verify': 'pan',
            'pan-fetch-by-name': 'pan',
            'pan-fetch-by-dob': 'pan',
            'aadhar-verify': 'aadhar',
            'voter-verify': 'voter',
            'ccrv-verify': 'ccrv',
            'ccrv-fetch-by-name': 'ccrv',
            'ccrv-fetch-by-dob': 'ccrv',
            'employee-fetch-uan': 'employee',
            'employee-fetch-uan-by-pan': 'employee',
            'employee-verify-employer': 'employee',
            'rc-fetch-detailed': 'rc',
            'rc-fetch-detailed-challan': 'rc',
            'rc-fetch-by-chassis': 'rc',
            'bank-verify': 'bank',
            'bank-verify-penniless': 'bank',
            'bank-verify-hybrid': 'bank',
            'passport-verify': 'passport',
            'passport-fetch-by-name': 'passport',
            'passport-fetch-by-dob': 'passport',
            'mca-fetch-company': 'mca',
            'mca-fetch-director': 'mca',
            'mca-fetch-by-name': 'mca',
            'mca-fetch-din-by-pan': 'mca',
            'mca-fetch-pan-by-din': 'mca',
            'cowin-generate-otp': 'cowin',
            'cowin-validate-otp': 'cowin',
            'cowin-beneficiaries': 'cowin'
        };

        // Get the base service name from the map
        const baseServiceName = serviceNameMap[service];
        if (!baseServiceName) {
            return res.status(404).json({
                success: false,
                message: `Service ${service} not found`
            });
        }

        // Check if service exists in shared dashboard
        const serviceConfig = dashboard.services.find(s => s.name === baseServiceName);
        if (!serviceConfig) {
            return res.status(403).json({
                success: false,
                message: `Service ${baseServiceName} is not available in your shared dashboard`
            });
        }

        // Deduct token before rendering
        await deductToken(req.session.user._id, baseServiceName);
        
        // Render the appropriate service page
        res.render(service);
    } catch (error) {
        console.error(`Error in ${req.params.service} verification:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/shared/:service', checkSharedAccess, async (req, res) => {
    try {
        const { service } = req.params;
        const dashboard = await getSharedDashboard(req.session.user.email);
        
        // Map route service names to dashboard service names
        const serviceNameMap = {
            'gst-fetch-detailed': 'gst',
            'gst-fetch-by-pan': 'gst',
            'gst-fetch-by-name': 'gst',
            'gst-fetch-contact-details': 'gst',
            'gst-fetch-by-mobile': 'gst',
            'dl-verify': 'dl',
            'dl-fetch-by-name': 'dl',
            'dl-fetch-by-dob': 'dl',
            'pan-verify': 'pan',
            'pan-fetch-by-name': 'pan',
            'pan-fetch-by-dob': 'pan',
            'aadhar-verify': 'aadhar',
            'voter-verify': 'voter',
            'ccrv-verify': 'ccrv',
            'ccrv-fetch-by-name': 'ccrv',
            'ccrv-fetch-by-dob': 'ccrv',
            'employee-fetch-uan': 'employee',
            'employee-fetch-uan-by-pan': 'employee',
            'employee-verify-employer': 'employee',
            'rc-fetch-detailed': 'rc',
            'rc-fetch-detailed-challan': 'rc',
            'rc-fetch-by-chassis': 'rc',
            'bank-verify': 'bank',
            'bank-verify-penniless': 'bank',
            'bank-verify-hybrid': 'bank',
            'passport-verify': 'passport',
            'passport-fetch-by-name': 'passport',
            'passport-fetch-by-dob': 'passport',
            'mca-fetch-company': 'mca',
            'mca-fetch-director': 'mca',
            'mca-fetch-by-name': 'mca',
            'mca-fetch-din-by-pan': 'mca',
            'mca-fetch-pan-by-din': 'mca',
            'cowin-generate-otp': 'cowin',
            'cowin-validate-otp': 'cowin',
            'cowin-beneficiaries': 'cowin'
        };

        // Get the base service name from the map
        const baseServiceName = serviceNameMap[service];
        if (!baseServiceName) {
            return res.status(404).json({
                success: false,
                message: `Service ${service} not found`
            });
        }

        // Check if service exists in shared dashboard
        const serviceConfig = dashboard.services.find(s => s.name === baseServiceName);
        if (!serviceConfig) {
            return res.status(403).json({
                success: false,
                message: `Service ${baseServiceName} is not available in your shared dashboard`
            });
        }

        // Deduct token before processing
        await deductToken(req.session.user._id, baseServiceName);

        // Make the actual API request based on service
        const options = {
            method: 'POST',
            url: `https://api.gridlines.io/${baseServiceName}-api/v3/verify`,
            headers: {
                'X-Auth-Type': 'API-Key',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': 'yjVR74jEmdRwhn8GzO6Fpr2pZ3lE6Q28'
            },
            data: {
                ...req.body,
                consent: 'Y'
            }
        };

        const response = await axios.request(options);
        
        if (response.data && response.data.data) {
            res.json({
                success: true,
                data: response.data.data,
                remainingTokens: serviceConfig.tokens
            });
        } else {
            res.json({
                success: false,
                message: 'No data found'
            });
        }
    } catch (error) {
        console.error(`Error in ${req.params.service} verification:`, error);
        res.status(500).json({
            success: false,
            message: error.response?.data?.message || `Error processing ${req.params.service} verification`
        });
    }
});

// Token count endpoint
app.get('/shared/token-counts', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await SharedDashboard.findOne({ 
            sharedWith: req.session.user.email,
            isActive: true 
        });

        if (!dashboard) {
            return res.status(403).json({ 
                success: false, 
                message: 'No shared dashboard found' 
            });
        }

        const tokenCounts = {};
        dashboard.services.forEach(service => {
            tokenCounts[service.name] = service.tokens;
        });
        res.json(tokenCounts);
    } catch (error) {
        console.error('Error getting token counts:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Usage history endpoint
app.get('/shared/usage-history', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await SharedDashboard.findOne({ 
            sharedWith: req.session.user.email,
            isActive: true 
        });

        if (!dashboard) {
            return res.status(403).json({ 
                success: false, 
                message: 'No shared dashboard found' 
            });
        }

        res.json(dashboard.services);
    } catch (error) {
        console.error('Error getting usage history:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create default superadmin
app.get('/create-default-superadmin', async (req, res) => {
    try {
        // Check if superadmin already exists
        const existingSuperadmin = await User.findOne({ isSuperAdmin: true });
        if (existingSuperadmin) {
            return res.json({ 
                success: false, 
                message: 'Superadmin already exists',
                credentials: {
                    email: 'admin@example.com',
                    password: 'admin123'
                }
            });
        }

        // Create default superadmin
        const superadmin = new User({
            name: 'Super Admin',
            email: 'admin@example.com',
            password: 'admin123',
            phone: '9999999999',
            isSuperAdmin: true,
            tokens: {
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
                cowin: 1000
            }
        });

        await superadmin.save();
        res.json({ 
            success: true, 
            message: 'Default superadmin created successfully',
            credentials: {
                email: 'admin@example.com',
                password: 'admin123'
            }
        });
    } catch (error) {
        console.error('Error creating default superadmin:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Shared Service Routes
app.get('/shared/pan-verify', checkSharedAccess, async (req, res) => {
    res.redirect('/pan-verify');
});

app.post('/shared/pan-verify', checkSharedAccess, async (req, res) => {
    res.redirect('/pan-verify');
});

app.get('/shared/pan-fetch-by-name', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        res.render('pan-fetch-by-name');
    } catch (error) {
        console.error('Error in PAN fetch by name:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/shared/pan-fetch-by-name', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'pan');
        // Handle the actual API request here
        res.json({ success: true });
    } catch (error) {
        console.error('Error in PAN fetch by name:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/pan-fetch-by-dob', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'pan');
        res.render('pan-fetch-by-dob-verification');
    } catch (error) {
        console.error('Error in PAN fetch by DOB:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Aadhar routes
app.get('/shared/aadhar-verify', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'aadhar');
        res.render('aadhar-verification');
    } catch (error) {
        console.error('Error in Aadhar verification:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GST routes
app.get('/shared/gst-fetch-detailed', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        res.render('gst-fetch-detailed');
    } catch (error) {
        console.error('Error in GST fetch detailed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/shared/gst-fetch-detailed', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'gst');
        // Handle the actual API request here
        res.json({ success: true });
    } catch (error) {
        console.error('Error in GST fetch detailed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/gst-fetch-by-pan', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'gst');
        res.render('gst-fetch-by-pan-verification');
    } catch (error) {
        console.error('Error in GST fetch by PAN:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/gst-fetch-by-name', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'gst');
        res.render('gst-fetch-by-name-verification');
    } catch (error) {
        console.error('Error in GST fetch by name:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/gst-fetch-contact-details', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'gst');
        res.render('gst-fetch-contact-details-verification');
    } catch (error) {
        console.error('Error in GST fetch contact details:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/gst-fetch-by-mobile', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'gst');
        res.render('gst-fetch-by-mobile-verification');
    } catch (error) {
        console.error('Error in GST fetch by mobile:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DL routes
app.get('/shared/dl-verify', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'dl');
        res.render('dl-verify');
    } catch (error) {
        console.error('Error in DL verify:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/shared/dl-verify', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'dl');
        // Handle the actual API request here
        res.json({ success: true });
    } catch (error) {
        console.error('Error in DL verify:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/dl-fetch-by-name', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'dl');
        res.render('dl-fetch-by-name-verification');
    } catch (error) {
        console.error('Error in DL fetch by name:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/dl-fetch-by-dob', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'dl');
        res.render('dl-fetch-by-dob-verification');
    } catch (error) {
        console.error('Error in DL fetch by DOB:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Voter ID routes
app.get('/voter-verify', async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user || !user.tokens || !user.tokens.voter || user.tokens.voter <= 0) {
            return res.status(400).render('error', {
                message: 'You don\'t have enough tokens for Voter ID verification. Please purchase tokens first.'
            });
        }
        res.render('voter-verify', { 
            user: req.session.user,
            title: 'Voter ID Verification'
        });
    } catch (error) {
        console.error('Error rendering voter verification page:', error);
        res.status(500).render('error', { message: 'An error occurred while loading the page.' });
    }
});

// DL Verification Routes
app.get('/dl-verify', async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user || !user.tokens || !user.tokens.dl || user.tokens.dl <= 0) {
            return res.status(400).render('error', {
                message: 'You don\'t have enough tokens for Driving License verification. Please purchase tokens first.'
            });
        }
        res.render('dl-verify', { 
            user: req.session.user,
            title: 'Driving License Verification'
        });
    } catch (error) {
        console.error('Error rendering driving license verification page:', error);
        res.status(500).render('error', { message: 'An error occurred while loading the page.' });
    }
});

// DL Verification API route
app.post('/verification/fetch-dl', async (req, res) => {
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

        // Check if no records were found
        if (response.data.data.code === '1001') {
            return res.json({
                success: false,
                message: 'No driving license records were found for the provided details.'
            });
        }

        // Extract DL details from response
        const dlData = response.data.data.dl_data;
        if (!dlData) {
            return res.json({
                success: false,
                message: 'No driving license details found in the response.'
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
        
        // Deduct one token AFTER successful API response
        user.tokens.dl -= 1;
        
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

// CCRV routes
app.get('/shared/ccrv-verify', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'ccrv');
        res.render('ccrv-verification');
    } catch (error) {
        console.error('Error in CCRV verify:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/ccrv-fetch-by-name', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'ccrv');
        res.render('ccrv-fetch-by-name-verification');
    } catch (error) {
        console.error('Error in CCRV fetch by name:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/ccrv-fetch-by-dob', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'ccrv');
        res.render('ccrv-fetch-by-dob-verification');
    } catch (error) {
        console.error('Error in CCRV fetch by DOB:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Employee routes
app.get('/shared/employee-fetch-uan', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'employee');
        res.render('employee-fetch-uan-verification');
    } catch (error) {
        console.error('Error in Employee fetch UAN:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/employee-fetch-uan-by-pan', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'employee');
        res.render('employee-fetch-uan-by-pan-verification');
    } catch (error) {
        console.error('Error in Employee fetch UAN by PAN:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/employee-verify-employer', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'employee');
        res.render('employee-verify-employer-verification');
    } catch (error) {
        console.error('Error in Employee verify employer:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// RC routes
app.get('/shared/rc-fetch-detailed', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'rc');
        res.render('rc-fetch-detailed-verification');
    } catch (error) {
        console.error('Error in RC fetch detailed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/rc-fetch-detailed-challan', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'rc');
        res.render('rc-fetch-detailed-challan-verification');
    } catch (error) {
        console.error('Error in RC fetch detailed challan:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/rc-fetch-by-chassis', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'rc');
        res.render('rc-fetch-by-chassis-verification');
    } catch (error) {
        console.error('Error in RC fetch by chassis:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Bank routes
app.get('/shared/bank-verify', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'bank');
        res.render('bank-verify-verification');
    } catch (error) {
        console.error('Error in Bank verify:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/bank-verify-penniless', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'bank');
        res.render('bank-verify-penniless-verification');
    } catch (error) {
        console.error('Error in Bank verify penniless:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/bank-verify-hybrid', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'bank');
        res.render('bank-verify-hybrid-verification');
    } catch (error) {
        console.error('Error in Bank verify hybrid:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Passport routes
app.get('/shared/passport-verify', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'passport');
        res.render('passport-verification');
    } catch (error) {
        console.error('Error in Passport verify:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/passport-fetch-by-name', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'passport');
        res.render('passport-fetch-by-name-verification');
    } catch (error) {
        console.error('Error in Passport fetch by name:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/passport-fetch-by-dob', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'passport');
        res.render('passport-fetch-by-dob-verification');
    } catch (error) {
        console.error('Error in Passport fetch by DOB:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// MCA routes
app.get('/shared/mca-fetch-company', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'mca');
        res.render('mca-fetch-company-verification');
    } catch (error) {
        console.error('Error in MCA fetch company:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/mca-fetch-director', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'mca');
        res.render('mca-fetch-director-verification');
    } catch (error) {
        console.error('Error in MCA fetch director:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/mca-fetch-by-name', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'mca');
        res.render('mca-fetch-by-name-verification');
    } catch (error) {
        console.error('Error in MCA fetch by name:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/mca-fetch-din-by-pan', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'mca');
        res.render('mca-fetch-din-by-pan-verification');
    } catch (error) {
        console.error('Error in MCA fetch DIN by PAN:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/mca-fetch-pan-by-din', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'mca');
        res.render('mca-fetch-pan-by-din-verification');
    } catch (error) {
        console.error('Error in MCA fetch PAN by DIN:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// CoWIN routes
app.get('/shared/cowin-generate-otp', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'cowin');
        res.render('cowin-generate-otp-verification');
    } catch (error) {
        console.error('Error in CoWIN generate OTP:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/cowin-validate-otp', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'cowin');
        res.render('cowin-validate-otp-verification');
    } catch (error) {
        console.error('Error in CoWIN validate OTP:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/shared/cowin-beneficiaries', checkSharedAccess, async (req, res) => {
    try {
        const dashboard = await getSharedDashboard(req.session.user.email);
        await deductToken(req.session.user._id, 'cowin');
        res.render('cowin-beneficiaries-verification');
    } catch (error) {
        console.error('Error in CoWIN beneficiaries:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Logout route
app.get('/logout', (req, res) => {
    // Destroy the session
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ success: false, message: 'Error logging out' });
        }
        // Clear the session cookie
        res.clearCookie('connect.sid');
        // Redirect to login page
        res.redirect('/login');
    });
});

// Contact form route
app.post('/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;

        // Validate required fields
        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                message: 'Please fill in all required fields'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        // Send email
        const emailSent = await sendContactFormEmail(name, email, message);
        if (!emailSent) {
            return res.status(500).json({
                success: false,
                message: 'Failed to send message. Please try again later.'
            });
        }

        res.json({
            success: true,
            message: 'Your message has been sent successfully. We will get back to you soon.'
        });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while sending your message. Please try again later.'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Add checkout route
app.get('/checkout', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.redirect('/cart/checkout');
});

// Toggle token status
app.post('/superadmin/toggle-token-status', checkSuperadmin, async (req, res) => {
    try {
        const { userId, service } = req.body;

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Initialize tokenStatus if it doesn't exist
        if (!user.tokenStatus) {
            user.tokenStatus = {};
        }

        // Toggle the status
        user.tokenStatus[service] = !user.tokenStatus[service];

        // Add status change record to token usage
        if (!user.tokenUsage) {
            user.tokenUsage = [];
        }

        user.tokenUsage.push({
            service: service,
            action: user.tokenStatus[service] ? 'activated' : 'deactivated',
            amount: user.tokens[service] || 0,
            timestamp: new Date(),
            details: `Tokens ${user.tokenStatus[service] ? 'activated' : 'deactivated'} by superadmin`
        });

        await user.save();
        res.json({ 
            success: true, 
            message: `Successfully ${user.tokenStatus[service] ? 'activated' : 'deactivated'} ${service.toUpperCase()} tokens`,
            status: user.tokenStatus[service]
        });
    } catch (error) {
        console.error('Error toggling token status:', error);
        res.status(500).json({ success: false, message: 'Error toggling token status' });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Helper function to get shared dashboard
async function getSharedDashboard(email) {
    const dashboard = await SharedDashboard.findOne({ 
        sharedWith: email,
        isActive: true 
    });

    if (!dashboard) {
        throw new Error('No shared dashboard found');
    }

    return dashboard;
}

// Start server
const PORT = process.env.PORT || 3049;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Token usage history route
app.get('/token-usage', checkSharedAccess, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Group token usage by service
        const usageByService = {};
        user.tokenUsage.forEach(usage => {
            if (!usageByService[usage.service]) {
                usageByService[usage.service] = {
                    added: 0,
                    used: 0,
                    shared: 0,
                    history: []
                };
            }
            usageByService[usage.service][usage.action] += usage.amount;
            usageByService[usage.service].history.push({
                action: usage.action,
                amount: usage.amount,
                timestamp: usage.timestamp,
                details: usage.details
            });
        });

        // Sort history by timestamp
        Object.values(usageByService).forEach(service => {
            service.history.sort((a, b) => b.timestamp - a.timestamp);
        });

        res.render('token-usage', { usageByService });
    } catch (error) {
        console.error('Error fetching token usage:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete tokens from user
app.post('/superadmin/delete-tokens', checkSuperadmin, async (req, res) => {
    try {
        const { userId, service } = req.body;

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Calculate tokens added by super admin for each service
        const superAdminTokens = {};
        const services = ['pan', 'aadhar', 'gst', 'dl', 'voter', 'ccrv', 'employee', 'rc', 'bank', 'passport', 'mca', 'cowin'];
        
        services.forEach(serviceName => {
            const addedBySuperAdmin = user.tokenUsage
                .filter(usage => usage.service.toLowerCase() === serviceName && 
                               usage.action === 'added' && 
                               usage.details === 'Tokens added by superadmin')
                .reduce((sum, record) => sum + record.amount, 0);
            
            if (addedBySuperAdmin > 0) {
                superAdminTokens[serviceName] = addedBySuperAdmin;
            }
        });

        // If service is 'all', remove all super admin added tokens
        if (service === 'all') {
            let totalRemoved = 0;
            Object.entries(superAdminTokens).forEach(([serviceName, amount]) => {
                if (user.tokens && user.tokens[serviceName]) {
                    // Subtract only the amount added by super admin
                    user.tokens[serviceName] = Math.max(0, user.tokens[serviceName] - amount);
                    totalRemoved += amount;

                    // Add deletion record to token usage
                    if (!user.tokenUsage) {
                        user.tokenUsage = [];
                    }

                    user.tokenUsage.push({
                        service: serviceName,
                        action: 'deleted',
                        amount: amount,
                        timestamp: new Date(),
                        details: 'Super admin tokens deleted'
                    });
                }
            });

            await user.save();
            res.json({ 
                success: true, 
                message: `Successfully deleted ${totalRemoved} super admin tokens`,
                remainingTokens: user.tokens
            });
        } else {
            // Delete tokens for specific service
            const amountToRemove = superAdminTokens[service] || 0;
            if (amountToRemove > 0 && user.tokens && user.tokens[service]) {
                // Subtract only the amount added by super admin
                user.tokens[service] = Math.max(0, user.tokens[service] - amountToRemove);

                // Add deletion record to token usage
                if (!user.tokenUsage) {
                    user.tokenUsage = [];
                }

                user.tokenUsage.push({
                    service: service,
                    action: 'deleted',
                    amount: amountToRemove,
                    timestamp: new Date(),
                    details: 'Super admin tokens deleted'
                });

                await user.save();
                res.json({ 
                    success: true, 
                    message: `Successfully deleted ${amountToRemove} ${service.toUpperCase()} tokens added by super admin`,
                    remainingTokens: user.tokens
                });
            } else {
                res.json({ 
                    success: false, 
                    message: `No ${service.toUpperCase()} tokens added by super admin found for this user` 
                });
            }
        }
    } catch (error) {
        console.error('Error deleting tokens:', error);
        res.status(500).json({ success: false, message: 'Error deleting tokens' });
    }
});

// Migration route to update existing users with tokenStatus
app.get('/migrate-token-status', async (req, res) => {
    try {
        // Find all users without tokenStatus field
        const users = await User.find({ tokenStatus: { $exists: false } });
        console.log(`Found ${users.length} users to update`);

        // Default token status values
        const defaultTokenStatus = {
            pan: true,
            aadhar: true,
            gst: true,
            dl: true,
            voter: true,
            ccrv: true,
            employee: true,
            rc: true,
            bank: true,
            passport: true,
            mca: true,
            cowin: true
        };

        // Update each user
        for (const user of users) {
            user.tokenStatus = defaultTokenStatus;
            await user.save();
            console.log(`Updated user: ${user.email}`);
        }

        res.json({
            success: true,
            message: `Successfully updated ${users.length} users with tokenStatus field`
        });
    } catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({
            success: false,
            message: 'Error during migration: ' + error.message
        });
    }
});

// Middleware to check MCA tokens availability
function checkMcaToken(req, res, next) {
    const user = req.session.user;
    if (!user || !user.tokens || !user.tokens.mca || user.tokens.mca <= 0) {
        return res.redirect(`/dashboard?error=${encodeURIComponent('No tokens available for MCA verification.')}`);
    }
    next();
}

// Apply the middleware to the MCA service routes
app.get('/mca-fetch-company', checkMcaToken, (req, res) => {
    res.render('mca-fetch-company');
});

app.get('/mca-fetch-director', checkMcaToken, (req, res) => {
    res.render('mca-fetch-director');
});

app.get('/mca-fetch-by-name', checkMcaToken, (req, res) => {
    res.render('mca-fetch-by-name');
});

app.get('/mca-fetch-din-by-pan', checkMcaToken, (req, res) => {
    res.render('mca-fetch-din-by-pan');
});

app.get('/mca-fetch-pan-by-din', checkMcaToken, (req, res) => {
    res.render('mca-fetch-pan-by-din');
});