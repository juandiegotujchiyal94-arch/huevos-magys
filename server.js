const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const SECRET = 'replace_this_with_a_strong_secret_in_production';

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

const db = new sqlite3.Database('./data/eggs.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'vendedor'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    s INTEGER DEFAULT 0,
    m INTEGER DEFAULT 0,
    l INTEGER DEFAULT 0,
    xl INTEGER DEFAULT 0,
    notes TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    type TEXT, -- 'mayor' or 'menor'
    size TEXT, -- 'S','M','L','XL'
    quantity INTEGER,
    price REAL,
    client TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY CHECK (id=1),
    s INTEGER DEFAULT 0,
    m INTEGER DEFAULT 0,
    l INTEGER DEFAULT 0,
    xl INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0
  )`);

  // ensure inventory single row
  db.get("SELECT COUNT(*) as c FROM inventory", (err,row)=>{
    if(err) return console.error(err);
    if(row.c === 0){
      db.run("INSERT INTO inventory (id,s,m,l,xl,total) VALUES (1,0,0,0,0,0)");
    }
  });
});

function updateInventoryFromCollection(obj){
  const {s=0,m=0,l=0,xl=0} = obj;
  db.run(`UPDATE inventory SET s = s + ?, m = m + ?, l = l + ?, xl = xl + ?, total = total + ? WHERE id = 1`,
    [s,m,l,xl, s+m+l+xl]);
}

function updateInventoryFromSale(size, qty){
  const col = {S:'s',M:'m',L:'l',XL:'xl'}[size] || null;
  if(!col) return;
  db.run(`UPDATE inventory SET ${col} = ${col} - ?, total = total - ? WHERE id = 1`, [qty, qty]);
}

// Auth middleware
function authMiddleware(req,res,next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({error:'No token'});
  const token = auth.split(' ')[1];
  jwt.verify(token, SECRET, (err, payload) => {
    if(err) return res.status(401).json({error:'Token invalid'});
    req.user = payload;
    next();
  });
}

// Routes
app.post('/api/register', async (req,res) => {
  const {username, password, role} = req.body;
  if(!username || !password) return res.status(400).json({error:'username and password required'});
  const hash = await bcrypt.hash(password, 10);
  db.run("INSERT INTO users (username,password,role) VALUES (?,?,?)", [username, hash, role || 'vendedor'], function(err){
    if(err) return res.status(400).json({error: err.message});
    res.json({id: this.lastID, username});
  });
});

app.post('/api/login', (req,res) => {
  const {username, password} = req.body;
  if(!username || !password) return res.status(400).json({error:'username and password required'});
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err,row)=>{
    if(err) return res.status(500).json({error:err.message});
    if(!row) return res.status(400).json({error:'user not found'});
    const ok = await bcrypt.compare(password, row.password);
    if(!ok) return res.status(400).json({error:'invalid credentials'});
    const token = jwt.sign({id: row.id, username: row.username, role: row.role}, SECRET, {expiresIn: '7d'});
    res.json({token});
  });
});

// Register collection (recoleccion)
app.post('/api/collections', authMiddleware, (req,res) => {
  const {date, s=0,m=0,l=0,xl=0, notes=''} = req.body;
  const d = date || new Date().toISOString().slice(0,10);
  db.run(`INSERT INTO collections (date,s,m,l,xl,notes) VALUES (?,?,?,?,?,?)`, [d,s,m,l,xl,notes], function(err){
    if(err) return res.status(500).json({error:err.message});
    updateInventoryFromCollection({s,m,l,xl});
    res.json({id:this.lastID, date, s,m,l,xl, notes});
  });
});

// Record sale
app.post('/api/sales', authMiddleware, (req,res) => {
  const {date, type, size, quantity, price, client=''} = req.body;
  const d = date || new Date().toISOString().slice(0,10);
  if(!['mayor','menor'].includes(type)) return res.status(400).json({error:'type must be mayor or menor'});
  if(!['S','M','L','XL'].includes(size)) return res.status(400).json({error:'size must be S,M,L or XL'});
  const qty = parseInt(quantity) || 0;
  db.run(`INSERT INTO sales (date,type,size,quantity,price,client) VALUES (?,?,?,?,?,?)`, [d,type,size,qty,price||0,client], function(err){
    if(err) return res.status(500).json({error:err.message});
    updateInventoryFromSale(size, qty);
    res.json({id:this.lastID, date:type,size, quantity:qty, price, client});
  });
});

// Get inventory
app.get('/api/inventory', authMiddleware, (req,res) => {
  db.get("SELECT s,m,l,xl,total FROM inventory WHERE id=1", [], (err,row)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(row || {s:0,m:0,l:0,xl:0,total:0});
  });
});

// Get collections list (last 100)
app.get('/api/collections', authMiddleware, (req,res) => {
  db.all("SELECT * FROM collections ORDER BY date DESC LIMIT 200", [], (err,rows)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(rows);
  });
});

// Get sales list
app.get('/api/sales', authMiddleware, (req,res) => {
  db.all("SELECT * FROM sales ORDER BY date DESC LIMIT 200", [], (err,rows)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(rows);
  });
});

// Simple admin endpoint to reset DB (for testing) - only admin role
app.post('/api/admin/reset', authMiddleware, (req,res)=>{
  if(req.user.role !== 'admin') return res.status(403).json({error:'forbidden'});
  db.serialize(()=>{
    db.run("DELETE FROM collections");
    db.run("DELETE FROM sales");
    db.run("UPDATE inventory SET s=0,m=0,l=0,xl=0,total=0 WHERE id=1");
    res.json({ok:true});
  });
});

// serve frontend
app.get('/', (req,res) => {
  res.sendFile(path.join(__dirname, 'public','index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{
  console.log('Server running on port', PORT);
});