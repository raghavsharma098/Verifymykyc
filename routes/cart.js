const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const User = require('../models/User');
const Payment = require('../models/Payment');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: '',
    key_secret: ''
});

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ redirect: '/login' });
    }
    next();
};

// Get cart page
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        res.render('cart', { 
            user: req.session.user,
            cart: user.cart || { items: [], total: 0 }
        });
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({ message: 'Error fetching cart' });
    }
});

// Add item to cart
router.post('/add', isAuthenticated, async (req, res) => {
    try {
        const { service, quantity } = req.body;
        const user = await User.findById(req.session.user._id);

        // Service prices
        const prices = {
            pan: 50,
            aadhar: 75,
            gst: 100,
            dl: 60,
            voter: 40,
            ccrv: 200,
            employee: 200,
            rc: 150,
            bank: 150,
            cowin: 50,
            passport: 100,
            mca: 150,
            profile: 100  // Add profile service price
        };

        if (!prices[service]) {
            return res.status(400).json({ message: 'Invalid service' });
        }

        // Initialize cart if it doesn't exist
        if (!user.cart) {
            user.cart = { items: [], total: 0 };
        }

        // Check if item already exists in cart
        const existingItem = user.cart.items.find(item => item.service === service);
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            user.cart.items.push({
                service,
                quantity,
                price: prices[service]
            });
        }

        // Update total
        user.cart.total = user.cart.items.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);

        await user.save();
        res.json({ 
            success: true,
            message: 'Item added to cart',
            viewCartUrl: '/cart'
        });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ message: 'Error adding to cart' });
    }
});

// Update item quantity
router.post('/update', isAuthenticated, async (req, res) => {
    try {
        const { service, change } = req.body;
        const user = await User.findById(req.session.user._id);

        const item = user.cart.items.find(item => item.service === service);
        if (!item) {
            return res.status(404).json({ message: 'Item not found in cart' });
        }

        item.quantity += change;
        if (item.quantity <= 0) {
            user.cart.items = user.cart.items.filter(i => i.service !== service);
        }

        // Update total
        user.cart.total = user.cart.items.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);

        await user.save();
        res.json({ message: 'Cart updated' });
    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(500).json({ message: 'Error updating cart' });
    }
});

// Remove item from cart
router.post('/remove', isAuthenticated, async (req, res) => {
    try {
        const { service } = req.body;
        const user = await User.findById(req.session.user._id);

        user.cart.items = user.cart.items.filter(item => item.service !== service);

        // Update total
        user.cart.total = user.cart.items.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);

        await user.save();
        res.json({ message: 'Item removed from cart' });
    } catch (error) {
        console.error('Error removing from cart:', error);
        res.status(500).json({ message: 'Error removing from cart' });
    }
});

// Get checkout page
router.get('/checkout', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user.cart || user.cart.items.length === 0) {
            return res.redirect('/cart');
        }
        res.render('checkout', { 
            user: req.session.user,
            cart: user.cart
        });
    } catch (error) {
        console.error('Error fetching checkout page:', error);
        res.status(500).json({ message: 'Error fetching checkout page' });
    }
});

// Checkout
router.post('/checkout', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        const { name, email, phone } = req.body;
        
        if (!user.cart || user.cart.items.length === 0) {
            return res.status(400).json({ message: 'Cart is empty' });
        }

        // Update user details if provided
        if (name || email || phone) {
            if (name) user.name = name;
            if (email) user.email = email;
            if (phone) user.phone = phone;
            await user.save();
        }

        // Calculate total with GST
        const subtotal = user.cart.total;
        const gst = subtotal * 0.18;
        const total = subtotal + gst;

        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: Math.round(total * 100), // Amount in paise
            currency: 'INR',
            receipt: `order_${Date.now()}`
        });

        res.json({
            razorpayOrderId: order.id,
            amount: Math.round(total * 100),
            razorpayKey: ''
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ message: 'Error creating order' });
    }
});

// Payment success handler
router.post('/payment-success', isAuthenticated, async (req, res) => {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
        const user = await User.findById(req.session.user._id);

        // Verify payment signature (implement proper verification in production)
        
        // Calculate GST and total
        const subtotal = user.cart.total;
        const gst = subtotal * 0.18;
        const totalAmount = subtotal + gst;

        // Create payment record
        const payment = new Payment({
            user: user._id,
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            amount: subtotal,
            gst: gst,
            totalAmount: totalAmount,
            items: user.cart.items,
            status: 'completed'
        });
        await payment.save();

        // Update tokens based on cart items
        if (user.cart && user.cart.items) {
            user.cart.items.forEach(item => {
                if (user.tokens[item.service] !== undefined) {
                    user.tokens[item.service] += item.quantity;
                }
            });
        }

        // Clear the cart
        user.cart = { items: [], total: 0 };
        
        // Save the updated user
        await user.save();

        // Update session user data
        req.session.user = user;

        res.json({ 
            success: true, 
            message: 'Payment successful and tokens updated',
            tokens: user.tokens
        });
    } catch (error) {
        console.error('Error processing payment success:', error);
        res.status(500).json({ message: 'Error processing payment' });
    }
});

module.exports = router;