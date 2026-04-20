/* ===========================
   Smart Study Planner — server.js
   Node.js + Express Backend
=========================== */

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const cors     = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;



const DB   = path.join(__dirname, 'tasks.json');

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve index.html, style.css, app.js

// ---- DB helpers ----
function readTasks() {
  try {
    if (!fs.existsSync(DB)) return [];
    const raw = fs.readFileSync(DB, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

function writeTasks(tasks) {
  fs.writeFileSync(DB, JSON.stringify(tasks, null, 2), 'utf-8');
}

// ---- Routes ----

// GET /tasks — return all tasks
app.get('/tasks', (req, res) => {
  const tasks = readTasks();
  res.json(tasks);
});

// POST /tasks — add a new task
app.post('/tasks', (req, res) => {
  const { text, subject = '', startTime = '', endTime = '', done = false, createdAt } = req.body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Task text is required.' });
  }

  const tasks = readTasks();
  const newTask = {
    id:        Date.now().toString(),
    subject:   subject.trim(),
    text:      text.trim(),
    startTime: startTime || '',
    endTime:   endTime   || '',
    done:      Boolean(done),
    createdAt: createdAt || new Date().toISOString()
  };

  tasks.push(newTask);
  writeTasks(tasks);

  console.log(`[+] Task added: "[${newTask.subject}] ${newTask.text}" (${newTask.startTime}–${newTask.endTime})`);
  res.status(201).json(newTask);
});

// PUT /tasks/:id — update a task (toggle done, edit text)
app.put('/tasks/:id', (req, res) => {
  const tasks = readTasks();
  const idx   = tasks.findIndex(t => t.id === req.params.id);

  if (idx === -1) return res.status(404).json({ error: 'Task not found.' });

  const updated = { ...tasks[idx], ...req.body, id: tasks[idx].id };
  tasks[idx] = updated;
  writeTasks(tasks);

  console.log(`[~] Task updated: "${updated.text}" → done: ${updated.done}`);
  res.json(updated);
});

// DELETE /tasks/:id — remove a task
app.delete('/tasks/:id', (req, res) => {
  let tasks = readTasks();
  const before = tasks.length;
  tasks = tasks.filter(t => t.id !== req.params.id);

  if (tasks.length === before) return res.status(404).json({ error: 'Task not found.' });

  writeTasks(tasks);
  console.log(`[-] Task deleted: ${req.params.id}`);
  res.json({ message: 'Task deleted.' });
});

// ---- 404 fallback ----
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
