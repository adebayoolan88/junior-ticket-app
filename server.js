require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const app = express();
const PORT = 3000;

const CSV_PATH = path.join(__dirname, 'players.csv');
const FRONTEND_PATH = path.join(__dirname, 'junior-ticket-ui');
let pendingSubmissions = [];

app.use(bodyParser.json());

// Serve landing page first
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_PATH, 'intro.html'));
});

// Serve static frontend assets
app.use(express.static(FRONTEND_PATH));

// Ensure CSV exists
if (!fs.existsSync(CSV_PATH)) {
  fs.writeFileSync(CSV_PATH, 'Name,JuniorTickets\n', 'utf8');
}

// Submission
app.post('/submit', (req, res) => {
  const { name, action } = req.body;
  pendingSubmissions.push({ name, action });
  sendEmail(name, action);
  res.send('Submission received and pending approval.');
});

// Approve
app.post('/approve', (req, res) => {
  const { name } = req.body;
  const index = pendingSubmissions.findIndex(s => s.name === name);
  if (index === -1) return res.status(404).send('Submission not found.');
  updateCSV(name);
  pendingSubmissions.splice(index, 1);
  res.send('Submission approved.');
});

// Deduct
app.post('/deduct', (req, res) => {
  const { name } = req.body;
  const lines = fs.readFileSync(CSV_PATH, 'utf8').trim().split('\n');
  let found = false;

  const updated = lines.map((line, idx) => {
    if (idx === 0) return line;
    const [player, tickets] = line.split(',');
    if (player === name) {
      found = true;
      return `${player},${Math.max(parseInt(tickets) - 1, 0)}`;
    }
    return line;
  });

  if (!found) return res.status(404).send('Player not found.');
  fs.writeFileSync(CSV_PATH, updated.join('\n'), 'utf8');
  res.send(`1 ticket deducted from ${name}.`);
});

// Leaderboard
app.get('/leaderboard', (req, res) => {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.trim().split('\n').slice(1);
  const data = lines.map(line => {
    const [name, tickets] = line.split(',');
    return { name, tickets: parseInt(tickets) };
  });
  res.json(data);
});

// Helper: Update CSV
function updateCSV(name) {
  const lines = fs.readFileSync(CSV_PATH, 'utf8').trim().split('\n');
  let found = false;

  const updated = lines.map((line, idx) => {
    if (idx === 0) return line;
    const [player, tickets] = line.split(',');
    if (player === name) {
      found = true;
      return `${player},${parseInt(tickets) + 1}`;
    }
    return line;
  });

  if (!found) updated.push(`${name},1`);
  fs.writeFileSync(CSV_PATH, updated.join('\n'), 'utf8');
}

// Helper: Email
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
    text: `Player: ${name}\nAction: ${action}\nApprove via /approve endpoint`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) console.error('Email error:', err);
    else console.log('Email sent:', info.response);
  });
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
