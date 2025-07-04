const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Dashboard page
router.get('/', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        // Get fresh user data from database
        const user = await User.findById(req.session.user._id).lean();
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }

        // Update session with latest user data
        req.session.user = user;

        if (req.xhr || req.headers.accept.includes('application/json')) {
            // Return JSON for AJAX requests
            return res.json({
                success: true,
                tokens: user.tokens,
                documents: user.documents
            });
        }

        // Render dashboard for regular requests
        res.render('dashboard', {
            user: user,
            tokens: user.tokens,
            documents: user.documents
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        if (req.xhr || req.headers.accept.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Error loading dashboard data'
            });
        }
        res.status(500).render('error', {
            message: 'Error loading dashboard'
        });
    }
});

// Update token count
router.post('/update-tokens', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        const user = await User.findById(req.session.user._id);
        if (!user) {
            req.session.destroy();
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update session with latest user data
        req.session.user = user;

        res.json({
            success: true,
            tokens: user.tokens
        });
    } catch (error) {
        console.error('Token update error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating token count'
        });
    }
});

// Services page
router.get('/services', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const user = await User.findById(req.session.user._id).lean();
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }

        res.render('services', {
            user: user,
            title: 'Services'
        });
    } catch (error) {
        console.error('Error rendering services page:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router; 