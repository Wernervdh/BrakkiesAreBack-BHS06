const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Public uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// In-memory data store (clean start for real event)
let profiles = [
  { id: 'admin_1', display_name: '06BrakkieAdmin', email: null, is_organizer: true, created_at: new Date().toISOString() }
];

let photos = [];

let messages = [];

let thenNowProfiles = [];

// Multer storage for uploaded files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`);
  }
});
const upload = multer({ storage });

// Create HTTP server and WebSocket server for live cross-device broadcasting
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(eventType, table, payload) {
  const msg = JSON.stringify({ eventType, table, data: payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// In-memory set for deleted IDs across all entities
let deletedIds = new Set();

// REST Endpoints
app.get('/api/photos', (req, res) => {
  res.json(photos);
});

app.post('/api/photos', upload.single('file'), (req, res) => {
  const author_name = req.body.author_name || 'Anonymous';
  const prompt_tag = req.body.prompt_tag || 'Mid-laugh';

  // Construct absolute reachable URL for the client's host
  const host = req.get('host');
  const protocol = req.protocol;
  const imageUrl = req.file
    ? `${protocol}://${host}/uploads/${req.file.filename}`
    : req.body.image_url;

  const newPhoto = {
    id: 'photo_' + Date.now(),
    created_at: new Date().toISOString(),
    author_name,
    prompt_tag,
    image_url: imageUrl,
    likes_count: 0,
    is_approved: true
  };

  photos = [newPhoto, ...photos];
  broadcast('INSERT', 'photos', newPhoto);
  res.status(201).json(newPhoto);
});

app.post('/api/photos/:id/like', (req, res) => {
  const photo = photos.find(p => p.id === req.params.id);
  if (photo) {
    photo.likes_count += 1;
    broadcast('UPDATE', 'photos', photo);
    return res.json(photo);
  }
  res.status(404).json({ error: 'Photo not found' });
});

app.get('/api/messages', (req, res) => {
  const { category } = req.query;
  if (category) {
    return res.json(messages.filter(m => m.category === category));
  }
  res.json(messages);
});

app.post('/api/messages', (req, res) => {
  const { author_name, content, category } = req.body;
  const newMsg = {
    id: 'msg_' + Date.now(),
    created_at: new Date().toISOString(),
    author_name: author_name.trim(),
    content: content.trim(),
    category
  };
  messages = [newMsg, ...messages];
  broadcast('INSERT', 'messages', newMsg);
  res.status(201).json(newMsg);
});

// Uploads for then-and-now (two images)
app.post('/api/then-now', upload.fields([{ name: 'yearbook_file', maxCount: 1 }, { name: 'current_file', maxCount: 1 }]), (req, res) => {
  const student_name = req.body.student_name || 'Classmate';
  const host = req.get('host');
  const protocol = req.protocol;

  const yearbookFile = req.files?.['yearbook_file']?.[0];
  const currentFile = req.files?.['current_file']?.[0];

  const yearbook_image_url = yearbookFile
    ? `${protocol}://${host}/uploads/${yearbookFile.filename}`
    : (req.body.yearbook_image_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500');

  const current_image_url = currentFile
    ? `${protocol}://${host}/uploads/${currentFile.filename}`
    : (req.body.current_image_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500');

  const newProfile = {
    id: 'tn_' + Date.now(),
    student_name,
    yearbook_image_url,
    current_image_url,
    votes_most_changed: 0
  };

  thenNowProfiles = [newProfile, ...thenNowProfiles];
  broadcast('INSERT', 'then_now_profiles', newProfile);

  // Also publish it as a Then & Now photo collage/item in the Paparazzi Wall!
  const collagePhoto = {
    id: 'photo_' + Date.now(),
    created_at: new Date().toISOString(),
    author_name: student_name,
    prompt_tag: 'Then & Now',
    image_url: current_image_url,
    likes_count: 0,
    is_approved: true
  };
  photos = [collagePhoto, ...photos];
  broadcast('INSERT', 'photos', collagePhoto);

  res.status(201).json(newProfile);
});

app.get('/api/then-now', (req, res) => {
  res.json(thenNowProfiles);
});

app.post('/api/then-now/:id/vote', (req, res) => {
  const profile = thenNowProfiles.find(p => p.id === req.params.id);
  if (profile) {
    profile.votes_most_changed += 1;
    broadcast('UPDATE', 'then_now_profiles', profile);
    return res.json(profile);
  }
  res.status(404).json({ error: 'Profile not found' });
});

// Profiles (Guest Registry / Who's Here) Endpoints
app.get('/api/profiles', (req, res) => {
  res.json(profiles);
});

app.post('/api/profiles', (req, res) => {
  const { display_name, email } = req.body;
  if (!display_name || !display_name.trim()) {
    return res.status(400).json({ error: 'Display name is required' });
  }

  // Check if profile already exists by name
  const isSpecialAdmin = display_name.trim().toLowerCase() === '06brakkieadmin';
  const cleanName = display_name.trim();

  // Validate name & surname unless special admin
  if (!isSpecialAdmin) {
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length < 2 || parts[0].length < 2 || parts[1].length < 2) {
      return res.status(400).json({
        error: 'Please enter both your first name and surname.'
      });
    }
  }

  const existingIndex = profiles.findIndex(
    p => p.display_name.toLowerCase() === cleanName.toLowerCase()
  );

  let profile;
  if (existingIndex >= 0) {
    profile = profiles[existingIndex];
    if (email) profile.email = email.trim();
    if (isSpecialAdmin) profile.is_organizer = true;
    profile.last_active = new Date().toISOString();
  } else {
    profile = {
      id: 'u_' + Date.now(),
      display_name: cleanName,
      email: email ? email.trim() : null,
      is_organizer: isSpecialAdmin,
      created_at: new Date().toISOString()
    };
    profiles = [profile, ...profiles];
    broadcast('INSERT', 'profiles', profile);
  }

  res.status(201).json(profile);
});

// Admin deletion endpoints for moderation (photos, messages, profiles)
app.delete('/api/photos/:id', (req, res) => {
  const targetId = req.params.id;
  const deleted = photos.find(p => p.id === targetId);
  if (deleted) {
    photos = photos.filter(p => p.id !== targetId);
    broadcast('DELETE', 'photos', deleted);
    return res.json({ success: true, deleted });
  }
  res.status(404).json({ error: 'Photo not found' });
});

app.delete('/api/messages/:id', (req, res) => {
  const targetId = req.params.id;
  const deleted = messages.find(m => m.id === targetId);
  if (deleted) {
    messages = messages.filter(m => m.id !== targetId);
    broadcast('DELETE', 'messages', deleted);
    return res.json({ success: true, deleted });
  }
  res.status(404).json({ error: 'Message not found' });
});

app.delete('/api/profiles/:id', (req, res) => {
  const targetId = req.params.id;
  const deleted = profiles.find(p => p.id === targetId);
  if (deleted) {
    profiles = profiles.filter(p => p.id !== targetId);
    broadcast('DELETE', 'profiles', deleted);
    return res.json({ success: true, deleted });
  }
  res.status(404).json({ error: 'Profile not found' });
});

app.delete('/api/then-now/:id', (req, res) => {
  const targetId = req.params.id;
  const deleted = thenNowProfiles.find(tn => tn.id === targetId);
  if (deleted) {
    thenNowProfiles = thenNowProfiles.filter(tn => tn.id !== targetId);
    broadcast('DELETE', 'then_now_profiles', deleted);
    return res.json({ success: true, deleted });
  }
  res.status(404).json({ error: 'Profile not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend synchronization server running at http://0.0.0.0:${PORT}`);
});
