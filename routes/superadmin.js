const express = require('express');
const router = express.Router();
const User = require('../models/User');

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

// Superadmin dashboard
router.get('/dashboard', checkSuperadmin, async (req, res) => {
    try {
        res.render('superadmin-dashboard');
    } catch (error) {
        console.error('Error rendering superadmin dashboard:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// Get all users with their tokens
router.get('/user-tokens', checkSuperadmin, async (req, res) => {
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
router.get('/user-usage/:userId', checkSuperadmin, async (req, res) => {
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
router.post('/share-dashboard', checkSuperadmin, async (req, res) => {
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

// Delete tokens from user
router.post('/delete-tokens', checkSuperadmin, async (req, res) => {
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

module.exports = router; 