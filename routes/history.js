const express = require('express');
const router = express.Router();
const User = require('../models/User');

// GET /history - Show verification history page
router.get('/', async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session || !req.session.user || !req.session.user._id) {
            return res.redirect('/login');
        }

        // Get fresh user data to ensure we have the latest verification history
        const user = await User.findById(req.session.user._id).lean();
        
        if (!user) {
            return res.redirect('/login');
        }

        // Render the history page with user data
        res.render('history', { 
            user: user,
            title: 'Verification History'
        });
    } catch (error) {
        console.error('Error fetching verification history:', error);
        res.redirect('/dashboard');
    }
});

module.exports = router; 