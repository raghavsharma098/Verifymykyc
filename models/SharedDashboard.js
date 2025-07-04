const mongoose = require('mongoose');

const sharedDashboardSchema = new mongoose.Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sharedWith: {
        type: String,
        required: true
    },
    services: [{
        name: {
            type: String,
            required: true
        },
        tokens: {
            type: Number,
            required: true,
            default: 0
        },
        usage: [{
            date: {
                type: Date,
                default: Date.now
            },
            count: {
                type: Number,
                default: 1
            }
        }]
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('SharedDashboard', sharedDashboardSchema); 