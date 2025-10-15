const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { store, findByBooking } = require('./src/services/store');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
const prisma = new PrismaClient();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images and videos are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname + '/../public'));
app.use('/uploads', express.static(uploadsDir));

// Capture API configuration
const CAPTURE_CONFIG = {
  baseURL: process.env.NUMBERS_API_BASE || 'https://api.numbersprotocol.io/api/v3',
  apiKey: process.env.NUMBERS_API_KEY,
  commitPath: process.env.NUMBERS_COMMIT_PATH || '/nit/commits',
  getNidPath: process.env.NUMBERS_GET_NID_PATH || '/nit/assets/',
  queryPath: process.env.NUMBERS_QUERY_PATH || '/nit/search',
  isLive: process.env.USE_NUMBERS_LIVE === 'true'
};

// Explorer configuration
const EXPLORER_CONFIG = {
  txBase: process.env.EXPLORER_TX_BASE || 'https://explorer.numbers.example/tx/',
  assetBase: process.env.EXPLORER_ASSET_BASE || 'https://explorer.numbers.example/asset/'
};

// Database storage using Prisma
// Removed in-memory storage in favor of SQLite

// Root endpoint - serve the main page
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: __dirname + '/../public' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    mode: CAPTURE_CONFIG.isLive ? 'LIVE' : 'TEST',
    timestamp: new Date().toISOString(),
    capture: {
      baseURL: CAPTURE_CONFIG.baseURL,
      isConfigured: !!CAPTURE_CONFIG.apiKey
    }
  });
});

// Submit photo to Capture API
async function submitPhotoToCapture(fileData, bookingId, uploadedBy) {
  if (!CAPTURE_CONFIG.apiKey || CAPTURE_CONFIG.apiKey === 'YOUR_CAPTURE_TOKEN') {
    console.log('⚠️  Capture API key not configured, skipping photo submission');
    return {
      txHash: `0x${crypto.randomBytes(32).toString('hex')}`,
      nid: `nid_${crypto.randomBytes(16).toString('hex')}`,
      cid: `cid_${crypto.randomBytes(16).toString('hex')}`,
      status: 'mock'
    };
  }

  try {
    const FormData = require('form-data');
    const form = new FormData();
    
    // Read actual photo file
    const photoBuffer = fs.readFileSync(fileData.path);
    
    // Upload actual photo file to blockchain
    form.append('asset_file', photoBuffer, {
      filename: fileData.originalname,
      contentType: fileData.mimetype
    });
    
    // Photo metadata
    form.append('headline', `Photo for booking ${bookingId}`);
    form.append('caption', `Evidence photo uploaded by ${uploadedBy} for booking ${bookingId}`);
    
    // Custom metadata
    const customMetadata = {
      proofsy_media: {
        bookingId: bookingId,
        uploadedBy: uploadedBy,
        fileName: fileData.originalname,
        fileSize: fileData.size,
        mimeType: fileData.mimetype,
        uploadedAt: new Date().toISOString(),
        source: 'Proofsy - Photo Evidence'
      }
    };
    
    form.append('nit_commit_custom', JSON.stringify(customMetadata));

    const response = await axios.post(
      `${CAPTURE_CONFIG.baseURL}/assets/`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `token ${CAPTURE_CONFIG.apiKey}`
        }
      }
    );

    console.log('✅ Photo submitted to Capture API');
    console.log('Photo NID:', response.data.cid);
    
    const nid = response.data.cid || response.data.id;
    const workflowId = response.data.post_creation_workflow_id || response.data.task_id;
    const txHash = workflowId || `pending_${nid}`;
    
    return {
      nid: nid,
      txHash: txHash,
      cid: response.data.cid,
      assetUrl: response.data.asset_file,
      status: 'committed'
    };
  } catch (error) {
    console.error('❌ Photo Capture API error:', error.response?.data || error.message);
    return null;
  }
}

// Submit event to Capture API
async function submitToCapture(eventData, idempotencyKey) {
  if (!CAPTURE_CONFIG.apiKey || CAPTURE_CONFIG.apiKey === 'YOUR_CAPTURE_TOKEN') {
    console.log('⚠️  Capture API key not configured, skipping submission');
    // Return mock data for demo purposes
    return {
      txHash: `0x${crypto.randomBytes(32).toString('hex')}`,
      nid: `nid_${crypto.randomBytes(16).toString('hex')}`,
      status: 'committed'
    };
  }

  try {
    const FormData = require('form-data');
    const form = new FormData();
    
    // Create dummy file for event (as required by Numbers Protocol)
    const eventFileName = `${eventData.eventType}_${idempotencyKey}.txt`;
    const eventFileContent = JSON.stringify({
      eventType: eventData.eventType,
      bookingId: eventData.bookingId,
      timestamp: eventData.occurredAt
    }, null, 2);
    
    form.append('asset_file', Buffer.from(eventFileContent), {
      filename: eventFileName,
      contentType: 'text/plain'
    });
    
    // Event headline
    form.append('headline', `${eventData.eventType} - ${eventData.bookingId}`);
    
    // Event caption
    form.append('caption', `Rental event: ${eventData.eventType} for booking ${eventData.bookingId}`);
    
    // Event metadata as custom commit data
    const customMetadata = {
      proofsy: {
        eventType: eventData.eventType,
        bookingId: eventData.bookingId,
        propertyId: eventData.propertyId,
        actor: eventData.actor,
        occurredAt: eventData.occurredAt,
        metadata: eventData.metadata,
        idempotencyKey: idempotencyKey,
        source: 'Proofsy - Rental Booking System'
      }
    };
    
    form.append('nit_commit_custom', JSON.stringify(customMetadata));

    const response = await axios.post(
      `${CAPTURE_CONFIG.baseURL}/assets/`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `token ${CAPTURE_CONFIG.apiKey}`
        }
      }
    );

    console.log('✅ Event submitted to Capture API');
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    // Extract nid and transaction info from response
    const nid = response.data.cid || response.data.id;
    
    // Note: Real blockchain tx hash is available AFTER async commit completes
    // workflow_id is just a reference ID, not the actual blockchain tx hash
    // Real tx hash format: 0x... (available in commit history via Nit module)
    const workflowId = response.data.post_creation_workflow_id || response.data.task_id;
    
    // For now, use workflow_id as placeholder - user should verify via NID on explorer
    const txHash = workflowId || `pending_${nid}`;
    
    return {
      nid: nid,
      txHash: txHash,  // This is workflow_id, not real blockchain tx hash
      assetCid: response.data.cid,
      assetUrl: response.data.asset_file,
      status: 'pending_blockchain_commit',
      workflowId: workflowId,
      note: 'Blockchain tx hash will be available after async commit completes. Verify using NID on Numbers Protocol explorer.',
      fullResponse: response.data
    };
  } catch (error) {
    console.error('❌ Capture API error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

// Create event endpoint
app.post('/api/events', async (req, res) => {
  try {
    const { event } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];

    if (!event) {
      return res.status(400).json({ error: 'Event data is required' });
    }

    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Idempotency-Key header is required' });
    }

    // Check for duplicate idempotency key using Prisma
    const existingEvent = await store.getByIdempotencyKey(idempotencyKey);
    if (existingEvent) {
      return res.status(409).json({ error: 'Event already processed' });
    }

    // Submit to Capture API
    const captureResult = await submitToCapture(event, idempotencyKey);
    
    if (!captureResult) {
      return res.status(500).json({ error: 'Failed to submit to Capture API' });
    }

    // Store event in database
    const eventData = {
      idempotencyKey,
      event,
      receipt: {
        txHash: captureResult.txHash,
        nid: captureResult.nid,
        chain: 'numbers-mainnet'
      }
    };

    await store.save(eventData);

    res.json({
      success: true,
      eventId: captureResult.nid,
      captureResult: {
        txHash: captureResult.txHash,
        nid: captureResult.nid
      }
    });

  } catch (error) {
    console.error('Error processing event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get events timeline
app.get('/api/events', async (req, res) => {
  try {
    const { bookingId } = req.query;

    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId query parameter is required' });
    }

    const events = await findByBooking(bookingId);
    
    const withLinks = events.map(event => ({
      id: event.receipt.nid,
      eventType: event.event.eventType,
      bookingId: event.event.bookingId,
      propertyId: event.event.propertyId,
      actor: event.event.actor,
      occurredAt: event.event.occurredAt,
      receivedAt: new Date().toISOString(),
      metadata: event.event.metadata,
      captureTxHash: event.receipt.txHash,
      captureNid: event.receipt.nid,
      links: {
        // Note: TX link disabled because txHash is workflow_id (UUID), not real blockchain tx hash
        // Real tx hash (0x...) will be available after async blockchain commit completes
        // tx: undefined,  // Intentionally omitted to avoid 404 on explorer
        asset: EXPLORER_CONFIG.assetBase ? EXPLORER_CONFIG.assetBase + event.receipt.nid : undefined
      }
    }));
    
    res.json({
      bookingId,
      events: withLinks
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload media file endpoint
app.post('/api/media/upload', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { bookingId, eventId, uploadedBy } = req.body;

    if (!uploadedBy) {
      return res.status(400).json({ error: 'uploadedBy is required' });
    }

    // Submit photo directly to blockchain
    const captureResult = await submitPhotoToCapture(req.file, bookingId, uploadedBy);
    
    // Check if blockchain submission was successful
    if (!captureResult || !captureResult.nid) {
      // Clean up uploaded file if blockchain submission failed
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(502).json({ 
        error: 'Failed to submit photo to blockchain. Please try again.',
        details: 'Blockchain submission failed or returned invalid response'
      });
    }
    
    // Save media file info to database with blockchain proof
    const mediaFile = await prisma.mediaFile.create({
      data: {
        originalName: req.file.originalname,
        fileName: req.file.filename,
        filePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedBy: uploadedBy,
        bookingId: bookingId || null,
        eventId: eventId || null,
        verified: true,
        captureCid: captureResult.cid,
        captureTxHash: captureResult.txHash,
        captureNid: captureResult.nid
      }
    });
    
    res.json({
      success: true,
      mediaId: mediaFile.id,
      file: {
        id: mediaFile.id,
        originalName: mediaFile.originalName,
        fileName: mediaFile.fileName,
        fileSize: mediaFile.fileSize,
        mimeType: mediaFile.mimeType,
        url: `/uploads/${mediaFile.fileName}`,
        uploadedAt: mediaFile.createdAt,
        verified: mediaFile.verified
      },
      blockchain: {
        nid: captureResult.nid,
        txHash: captureResult.txHash,
        assetUrl: captureResult.assetUrl
      },
      message: 'Photo uploaded and submitted to blockchain!'
    });

  } catch (error) {
    console.error('Error uploading file:', error);
    
    // Clean up uploaded file if database save failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Verify media file with C2PA
app.post('/api/media/:mediaId/verify', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { c2paSignature } = req.body;

    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaId }
    });

    if (!mediaFile) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    // TODO: Implement actual C2PA verification
    // For now, we'll simulate the verification process
    const isVerified = c2paSignature && c2paSignature.length > 0;

    if (isVerified) {
      // Submit to Numbers Protocol Capture API for blockchain proof
      const captureResult = await submitMediaToCapture(mediaFile, c2paSignature);
      
      const updatedMedia = await prisma.mediaFile.update({
        where: { id: mediaId },
        data: {
          c2paSignature: c2paSignature,
          captureCid: captureResult?.cid || null,
          captureTxHash: captureResult?.txHash || null,
          captureNid: captureResult?.nid || null,
          verified: true
        }
      });

      res.json({
        success: true,
        verified: true,
        media: updatedMedia,
        captureResult: captureResult
      });
    } else {
      res.status(400).json({ 
        success: false, 
        verified: false, 
        error: 'Invalid C2PA signature' 
      });
    }

  } catch (error) {
    console.error('Error verifying media:', error);
    res.status(500).json({ error: 'Failed to verify media file' });
  }
});

// Get media files for a booking
app.get('/api/media', async (req, res) => {
  try {
    const { bookingId } = req.query;

    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId query parameter is required' });
    }

    const mediaFiles = await prisma.mediaFile.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' }
    });

    const mediaWithUrls = mediaFiles.map(file => ({
      ...file,
      url: `/uploads/${file.fileName}`,
      links: {
        // Note: TX link disabled - captureTxHash is workflow_id (UUID), not real blockchain tx
        // tx: undefined,  // Intentionally omitted to avoid 404
        asset: file.captureNid ? EXPLORER_CONFIG.assetBase + file.captureNid : undefined
      }
    }));

    res.json({
      bookingId,
      mediaFiles: mediaWithUrls
    });

  } catch (error) {
    console.error('Error fetching media files:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit media to Capture API for blockchain proof
async function submitMediaToCapture(mediaFile, c2paSignature) {
  if (!CAPTURE_CONFIG.apiKey || CAPTURE_CONFIG.apiKey === 'YOUR_CAPTURE_TOKEN') {
    console.log('⚠️  Capture API key not configured, skipping media submission');
    return {
      cid: `mock_cid_${crypto.randomBytes(16).toString('hex')}`,
      txHash: `0x${crypto.randomBytes(32).toString('hex')}`,
      nid: `nid_${crypto.randomBytes(16).toString('hex')}`,
      status: 'mock'
    };
  }

  try {
    // Read file data
    const fileData = fs.readFileSync(mediaFile.filePath);
    
    // Create form data for file upload
    const FormData = require('form-data');
    const form = new FormData();
    
    form.append('file', fileData, {
      filename: mediaFile.originalName,
      contentType: mediaFile.mimeType
    });
    
    form.append('metadata', JSON.stringify({
      bookingId: mediaFile.bookingId,
      eventId: mediaFile.eventId,
      c2paSignature: c2paSignature,
      uploadedBy: mediaFile.uploadedBy,
      uploadedAt: mediaFile.createdAt.toISOString()
    }));

    const response = await axios.post(
      `${CAPTURE_CONFIG.baseURL}/nit/assets`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${CAPTURE_CONFIG.apiKey}`
        }
      }
    );

    console.log('✅ Media submitted to Capture:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Capture API error for media:', error.response?.data || error.message);
    return null;
  }
}

// Start server
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📊 Health check: http://${HOST}:${PORT}/api/health`);
  console.log(`🎯 Capture mode: ${CAPTURE_CONFIG.isLive ? 'LIVE' : 'TEST'}`);
  if (!CAPTURE_CONFIG.apiKey || CAPTURE_CONFIG.apiKey === 'YOUR_CAPTURE_TOKEN') {
    console.log('⚠️  Remember to update NUMBERS_API_KEY in .env file');
  }
});
