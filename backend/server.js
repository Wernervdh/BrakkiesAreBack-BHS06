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

let profiles = [
  { id: 'u1', display_name: 'Dirk Van Der Merwe', email: 'dirk@brakke06.co.za', is_organizer: true, created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString() },
  { id: 'u2', display_name: 'Anri Smith', email: 'anri@brakke06.co.za', is_organizer: true, created_at: new Date(Date.now() - 1000 * 60 * 100).toISOString() },
  { id: 'u3', display_name: 'Francois Pienaar', email: null, is_organizer: false, created_at: new Date(Date.now() - 1000 * 60 * 80).toISOString() },
  { id: 'u4', display_name: 'Chantal Louw', email: null, is_organizer: false, created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString() }
];

// In-memory data store with realistic seed data
let photos = [
  {
    id: 'p1',
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    author_name: 'Dirk Van Der Merwe',
    prompt_tag: 'Mid-laugh',
    image_url: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800&auto=format&fit=crop&q=60',
    likes_count: 15,
    is_approved: true
  },
  {
    id: 'p2',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    author_name: 'Anri Smith',
    prompt_tag: 'Then & Now',
    image_url: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&auto=format&fit=crop&q=60',
    likes_count: 22,
    is_approved: true
  },
  {
    id: 'p3',
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    author_name: 'Francois Pienaar',
    prompt_tag: 'Unchanged',
    image_url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=60',
    likes_count: 9,
    is_approved: true
  }
];

let messages = [
  {
    id: 'm1',
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    author_name: 'Dirk Van Der Merwe',
    content: 'Welcome everyone to our 20-Year Brackenfell High Reunion! Huge thanks to the organizing committee for all the effort.',
    category: 'thank_you'
  },
  {
    id: 'm2',
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    author_name: 'Anri Smith',
    content: 'Remember Mr. De Klerk’s math classes and hall assemblies? So wonderful to see everyone again tonight!',
    category: 'memory'
  },
  {
    id: 'm3',
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    author_name: 'Francois Pienaar',
    content: 'Prediction for our 30th reunion: Dirk still drives the exact same bakkie and Chantal arrives in her own helicopter.',
    category: 'prediction_30th'
  }
];

let thenNowProfiles = [
  {
    id: 'tn1',
    student_name: 'Dirk Van Der Merwe',
    yearbook_image_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=60',
    current_image_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=60',
    votes_most_changed: 4
  },
  {
    id: 'tn2',
    student_name: 'Anri Smith',
    yearbook_image_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&auto=format&fit=crop&q=60',
    current_image_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&auto=format&fit=crop&q=60',
    votes_most_changed: 7
  },
  {
    id: 'tn3',
    student_name: 'Francois Pienaar',
    yearbook_image_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=60',
    current_image_url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=500&auto=format&fit=crop&q=60',
    votes_most_changed: 12
  }
];

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
  const existingIndex = profiles.findIndex(
    p => p.display_name.toLowerCase() === display_name.trim().toLowerCase()
  );

  let profile;
  if (existingIndex >= 0) {
    profile = profiles[existingIndex];
    if (email) profile.email = email.trim();
    profile.last_active = new Date().toISOString();
  } else {
    profile = {
      id: 'u_' + Date.now(),
      display_name: display_name.trim(),
      email: email ? email.trim() : null,
      is_organizer: false,
      created_at: new Date().toISOString()
    };
    profiles = [profile, ...profiles];
    broadcast('INSERT', 'profiles', profile);
  }

  res.status(201).json(profile);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend synchronization server running at http://0.0.0.0:${PORT}`);
});
