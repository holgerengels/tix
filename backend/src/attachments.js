const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');
const { verifyToken } = require('./auth');
const Ticket = require('./models/ticket');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

let bucket;
mongoose.connection.on('open', () => {
    bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'attachments' });
});

// Upload: Raw body stream → GridFS
router.post('/tickets/:id/attachments', verifyToken, async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        const filename = decodeURIComponent(req.headers['x-filename'] || 'unnamed');
        const contentType = req.headers['x-content-type'] || 'application/octet-stream';
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);

        if (contentLength > MAX_FILE_SIZE) {
            return res.status(413).json({ message: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` });
        }

        const uploadStream = bucket.openUploadStream(filename, {
            contentType,
            metadata: { ticketId: ticket._id.toString(), uploadedBy: req.user.username }
        });

        req.pipe(uploadStream);

        uploadStream.on('finish', async () => {
            const meta = {
                fileId: uploadStream.id.toString(),
                filename,
                contentType,
                size: uploadStream.length,
                uploadedBy: req.user.username,
                uploadedAt: new Date()
            };

            const attachments = ticket.get('attachments') || [];
            attachments.push(meta);
            ticket.set('attachments', attachments);
            ticket.markModified('attachments');
            await ticket.save();

            res.status(201).json(meta);
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

// Delete: GridFS + Ticket array
router.delete('/attachments/:fileId', verifyToken, async (req, res) => {
    try {
        const fileId = req.params.fileId;
        const fileObjectId = new ObjectId(fileId);

        // Find ticket containing this attachment
        const ticket = await Ticket.findOne({ 'attachments.fileId': fileId });
        if (!ticket) return res.status(404).json({ message: 'Attachment not found' });

        // Check permission: uploader or edit access
        const attachment = (ticket.get('attachments') || []).find(a => a.fileId === fileId);
        const { canEdit } = require('./workflow');
        if (attachment?.uploadedBy !== req.user.username && !canEdit(ticket.type, req.user.groups)) {
            return res.status(403).json({ message: 'Not authorized to delete this attachment' });
        }

        // Remove from GridFS
        await bucket.delete(fileObjectId);

        // Remove from ticket
        const attachments = (ticket.get('attachments') || []).filter(a => a.fileId !== fileId);
        ticket.set('attachments', attachments);
        ticket.markModified('attachments');
        await ticket.save();

        res.json({ message: 'Attachment deleted' });
    } catch (err) {
        console.error('Attachment delete error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
