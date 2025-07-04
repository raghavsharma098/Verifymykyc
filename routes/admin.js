const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Blog = require('../models/Blog');
const User = require('../models/User');
const Payment = require('../models/Payment');


// Configure multer for blog image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'public/uploads/blogs';
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Create a safe filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files (jpeg, jpg, png, gif) are allowed!'));
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Admin authentication middleware
const isAdmin = (req, res, next) => {
    if (req.session && req.session.isAdmin) {
        // Set a default admin user for blog creation
        req.session.user = {
            _id: 'admin',
            name: 'Admin'
        };
        next();
    } else {
        res.redirect('/admin/login');
    }
};

// Admin login page
router.get('/login', (req, res) => {
    res.render('admin/login');
});

// Admin login process
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'admin' && password === 'admin123') {
        req.session.isAdmin = true;
        res.redirect('/admin/dashboard');
    } else {
        res.render('admin/login', { error: 'Invalid credentials' });
    }
});


router.get('/admin/dashboard', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalPayments = await Payment.countDocuments(); // Assuming a Payment model
        const totalBlogs = await Blog.countDocuments();

        // You might also fetch pending verifications here if you have a way to count them
        // const pendingVerifications = await Verification.countDocuments({ status: 'pending' });

        res.render('admin/dashboard', {
            user: req.user, // Assuming you pass user data for authentication/sidebar
            totalUsers: totalUsers,
            totalPayments: totalPayments, // Pass the fetched count
            totalBlogs: totalBlogs,
            // pendingVerifications: pendingVerifications // Uncomment if you implement this
            // ... any other data your dashboard needs
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).send('Server Error');
    }
});

// Admin logout
router.get('/logout', (req, res) => {
    req.session.isAdmin = false;
    res.redirect('/admin/login');
});

// Admin dashboard
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        // Fetch counts for dashboard cards
        const totalUsers = await User.countDocuments();
        const totalPayments = await Payment.countDocuments();
        const totalBlogs = await Blog.countDocuments();

        // Fetch all user fields we need (for User Management section)
        const users = await User.find({})
            .select('email phone name tokens createdAt _id')
            .lean();
            
        const blogs = await Blog.find()
            .populate('author', 'name')
            .sort({ createdAt: -1 })
            .lean();

        let payments = await Payment.find()
            .populate({
                path: 'user',
                select: 'name email phone _id',
                model: 'User'
            })
            .sort({ createdAt: -1 })
            .lean();

        // If no payments exist yet, pass an empty array
        if (!payments) {
            payments = [];
        }

        // Log users for debugging
        console.log('Users data:', JSON.stringify(users, null, 2));

        res.render('admin/dashboard', { 
            users, 
            payments,
            blogs,
            title: 'Admin Dashboard',
            totalUsers: totalUsers,
            totalPayments: totalPayments,
            totalBlogs: totalBlogs
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).send('Error fetching dashboard data');
    }
});

// Update user tokens
router.post('/update-tokens', isAdmin, async (req, res) => {
    try {
        const { userId, service, amount } = req.body;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Initialize tokens object if it doesn't exist
        if (!user.tokens) {
            user.tokens = {};
        }

        // Update tokens for the specified service
        user.tokens[service] = (user.tokens[service] || 0) + parseInt(amount);

        // Add token usage record
        user.tokenUsage.push({
            service: service,
            action: 'added',
            amount: parseInt(amount),
            details: 'Tokens added by admin'
        });

        await user.save();

        res.json({
            success: true,
            message: `Successfully added ${amount} tokens for ${service}`,
            updatedTokens: user.tokens[service]
        });
    } catch (error) {
        console.error('Error updating tokens:', error);
        res.status(500).json({ success: false, message: 'Error updating tokens' });
    }
});

// Blog management routes
router.get('/blogs', isAdmin, async (req, res) => {
    try {
        const blogs = await Blog.find().populate('author', 'name');
        res.render('admin/blogs', { 
            blogs: blogs
        });
    } catch (error) {
        console.error('Error fetching blogs:', error);
        res.status(500).send('Error fetching blogs');
    }
});

router.get('/blogs/create', isAdmin, async (req, res) => {
    try {
        res.render('admin/create-blog');
    } catch (error) {
        console.error('Error loading create blog page:', error);
        res.status(500).send('Error loading create blog page');
    }
});

router.post('/blogs/create', isAdmin, upload.single('image'), async (req, res) => {
    try {
        console.log('Received form data:', req.body); // Debug log

        const { title, category, content, metaTitle, metaDescription, metaKeywords, status } = req.body;
        
        // Validate required fields
        if (!title || !title.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Title is required'
            });
        }

        if (!category || !category.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Category is required'
            });
        }

        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Content is required'
            });
        }

        const blog = new Blog({
            title: title.trim(),
            category: category.trim(),
            content: content.trim(),
            image: req.file ? `/uploads/blogs/${req.file.filename}` : null,
            metaTitle: metaTitle ? metaTitle.trim() : title.trim(),
            metaDescription: metaDescription ? metaDescription.trim() : '',
            metaKeywords: metaKeywords ? metaKeywords.trim() : '',
            status: status || 'draft'
        });

        await blog.save();
        res.json({ success: true, message: 'Blog created successfully' });
    } catch (error) {
        console.error('Error creating blog:', error);
        // If there was a file upload error, delete the uploaded file
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }

        res.status(500).json({ 
            success: false, 
            message: error.message || 'Error creating blog'
        });
    }
});

router.get('/blogs/edit/:id', isAdmin, async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) {
            return res.status(404).send('Blog not found');
        }
        res.render('admin/edit-blog', { 
            blog: blog
        });
    } catch (error) {
        console.error('Error loading edit blog page:', error);
        res.status(500).send('Error loading edit blog page');
    }
});

router.post('/blogs/edit/:id', isAdmin, upload.single('image'), async (req, res) => {
    try {
        const { title, category, content, metaTitle, metaDescription, metaKeywords, status } = req.body;
        
        const blog = await Blog.findById(req.params.id);
        if (!blog) {
            return res.status(404).json({ success: false, message: 'Blog not found' });
        }

        blog.title = title;
        blog.category = category;
        blog.content = content;
        if (req.file) {
            blog.image = `/uploads/blogs/${req.file.filename}`;
        }
        blog.metaTitle = metaTitle;
        blog.metaDescription = metaDescription;
        blog.metaKeywords = metaKeywords;
        blog.status = status;

        await blog.save();
        res.json({ success: true, message: 'Blog updated successfully' });
    } catch (error) {
        console.error('Error updating blog:', error);
        res.status(500).json({ success: false, message: 'Error updating blog' });
    }
});

router.post('/blogs/delete/:id', isAdmin, async (req, res) => {
    try {
        await Blog.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Blog deleted successfully' });
    } catch (error) {
        console.error('Error deleting blog:', error);
        res.status(500).json({ success: false, message: 'Error deleting blog' });
    }
});

// Handle image uploads from TinyMCE
router.post('/upload-image', isAdmin, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        // Return the URL of the uploaded image
        res.json({
            location: `/uploads/blogs/${req.file.filename}`
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ error: 'Error uploading image' });
    }
});

module.exports = router;