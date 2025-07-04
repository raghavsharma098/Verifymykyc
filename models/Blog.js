const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        unique: true,
        sparse: true // This allows null/undefined values while maintaining uniqueness for non-null values
    },
    category: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    image: {
        type: String
    },
    author: {
        type: String,
        default: 'admin'
    },
    status: {
        type: String,
        enum: ['draft', 'published'],
        default: 'draft'
    },
    metaTitle: String,
    metaDescription: String,
    metaKeywords: String,
    tags: {
        type: [String],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Generate slug from title before saving
blogSchema.pre('save', function(next) {
    if (this.isModified('title')) {
        // Generate a unique slug by adding timestamp if needed
        let baseSlug = this.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        
        this.slug = baseSlug;
    }
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Blog', blogSchema);