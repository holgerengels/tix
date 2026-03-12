const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');
const { verifyToken } = require('./auth');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

let bucket;
mongoose.connection.on('open', () => {
    bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'attachments' });
});

// Upload: Raw body stream → GridFS (no ticket required)
router.post('/attachments', verifyToken, async (req, res) => {
    try {
        const filename = decodeURIComponent(req.headers['x-filename'] || 'unnamed');
        const contentType = req.headers['x-content-type'] || 'application/octet-stream';
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);

        if (contentLength > MAX_FILE_SIZE) {
            return res.status(413).json({ message: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` });
        }

        const uploadStream = bucket.openUploadStream(filename, {
            contentType,
            metadata: { uploadedBy: req.user.username }
        });

        req.pipe(uploadStream);

        uploadStream.on('finish', () => {
            res.status(201).json({
                fileId: uploadStream.id.toString(),
                filename,
                contentType,
                size: uploadStream.length,
                uploadedBy: req.user.username,
                uploadedAt: new Date()
            });
        });

        uploadStream.on('error', (err) => {
            console.error('GridFS upload error:', err);
            res.status(500).json({ error: err.message });
        });
    } catch (err) {
        console.error('Attachment upload error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Download: GridFS → Response stream
router.get('/attachments/:fileId', verifyToken, async (req, res) => {
    try {
        const fileId = new ObjectId(req.params.fileId);

        const files = await bucket.find({ _id: fileId }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        const file = files[0];
        res.set('Content-Type', file.contentType || 'application/octet-stream');
        res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
        res.set('Content-Length', file.length);

        const downloadStream = bucket.openDownloadStream(fileId);
        downloadStream.pipe(res);

        downloadStream.on('error', (err) => {
            console.error('GridFS download error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: err.message });
            }
        });
    } catch (err) {
        console.error('Attachment download error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete: GridFS file
router.delete('/attachments/:fileId', verifyToken, async (req, res) => {
    try {
        const fileId = req.params.fileId;
        const fileObjectId = new ObjectId(fileId);

        // Check file exists
        const files = await bucket.find({ _id: fileObjectId }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Check permission: uploader or edit access
        const file = files[0];
        const { canEdit } = require('./workflow');
        const Ticket = require('./models/ticket');
        const ticket = await Ticket.findOne({ 'attachments.fileId': fileId });

        if (file.metadata?.uploadedBy !== req.user.username) {
            if (!ticket || !canEdit(ticket.type, req.user.groups)) {
                return res.status(403).json({ message: 'Not authorized to delete this attachment' });
            }
        }

        // Remove from GridFS
        await bucket.delete(fileObjectId);

        // Remove from ticket if associated
        if (ticket) {
            const attachments = (ticket.get('attachments') || []).filter(a => a.fileId !== fileId);
            ticket.set('attachments', attachments);
            ticket.markModified('attachments');
            await ticket.save();
        }

        res.json({ message: 'Attachment deleted' });
    } catch (err) {
        console.error('Attachment delete error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
