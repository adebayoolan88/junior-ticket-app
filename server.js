require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;
const CSV_PATH = path.join(__dirname, 'players.csv');
let pendingSubmissions = [];

// ✅ CORS middleware for frontend and local access
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://junior-ticket-ui.vercel.app',
    'null'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Basic auth for admin interface
app.use('/admin', basicAuth({
  users: { 'admin': process.env.APPROVE_PASSWORD },
  challenge: true
}));
app.use('/admin', express.static(path.join(__dirname, 'public')));

// ✅ Rate limiting for /submit (5 submissions/hour per IP)
const submissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many submissions from this device. Try again in an hour.',
  standardHeaders: true,
  legacyHeaders: false
});

// ✅ Create CSV file if not present
if (!fs.existsSync(CSV_PATH)) {
  fs.writeFileSync(CSV_PATH, 'Name,JuniorTickets\n', 'utf8');
}

// ✅ Routes

app.get('/', (req, res) => {
  res.send('Junior Ticket API is running.');
});

app.get('/leaderboard', (req, res) => {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.trim().split('\n').slice(1);
  const data = lines.map(line => {
    const [name, tickets] = line.split(',');
    return { name, tickets: parseInt(tickets) };
  });
  res.json(data);
});

app.post('/submit', submissionLimiter, (req, res) => {
  const { name, action } = req.body;
  if (!name || !action) return res.status(400).send('Missing fields.');
  pendingSubmissions.push({ name, action });
  sendEmail(name, action);
  res.send('Submission received and pending approval.');
});

app.post('/approve', (req, res) => {
  const { name } = req.body;
  const index = pendingSubmissions.findIndex(s => s.name === name);
  if (index === -1) return res.status(404).send('Submission not found.');
  updateCSV(name, 1);
  pendingSubmissions.splice(index, 1);
  res.send('Submission approved.');
});

app.post('/deduct', (req, res) => {
  const { name } = req.body;
  updateCSV(name, -1, res);
});

app.post('/add-tickets', (req, res) => {
  const { name, amount } = req.body;
  const ticketCount = parseInt(amount);
  if (!name || isNaN(ticketCount) || ticketCount <= 0) {
    return res.status(400).send('Invalid name or ticket amount.');
  }
  updateCSV(name, ticketCount, res);
});

app.post('/deduct-tickets', (req, res) => {
  const { name, amount } = req.body;
  const ticketCount = parseInt(amount);
  if (!name || isNaN(ticketCount) || ticketCount <= 0) {
    return res.status(400).send('Invalid name or ticket amount.');
  }
  updateCSV(name, -ticketCount, res);
});

// ✅ Helpers

function updateCSV(name, delta, res = null) {
  const lines = fs.readFileSync(CSV_PATH, 'utf8').trim().split('\n');
  let found = false;
  const updated = lines.map((line, idx) => {
    if (idx === 0) return line;
    const [player, tickets] = line.split(',');
    if (player === name) {
      found = true;
      return `${player},${Math.max(parseInt(tickets) + delta, 0)}`;
    }
    return line;
  });
  if (!found && delta > 0) updated.push(`${name},${delta}`);
  fs.writeFileSync(CSV_PATH, updated.join('\n'), 'utf8');

  if (res) {
    res.send(`${Math.max(delta, 0)} ticket(s) ${delta > 0 ? 'added to' : 'deducted from'} ${name}.`);
  }
}

function sendEmail(name, action) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    subject: 'New Junior Ticket Submission',
    text: `Player: ${name}\nAction: ${action}`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) console.error('Email error:', err);
    else console.log('Email sent:', info.response);
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
