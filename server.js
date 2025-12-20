// Minimal Express + WebSocket Backend (in-memory demo)
// Für Produktion: Postgres + persistente Speicherung ergänzen.

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Simple CORS for REST
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());

// In-memory state
let match = null;
let throwsLog = []; // {id, playerId, value, mult, score, turn}

// Helpers
const createId = () => Math.random().toString(16).slice(2);
const computeScore = (value, mult) => {
  if (value === 25 && mult === 2) return 50;
  if (value === 25 && mult === 1) return 25;
  return value * mult;
};

// REST
app.post("/api/match", (req, res) => {
  const { mode = "501", players = [] } = req.body || {};
  match = {
    id: createId(),
    mode,
    players: players.map((name, idx) => ({
      id: createId(),
      name,
      order: idx,
      score: mode === "301" ? 301 : 501,
      legs: 0,
      sets: 0,
    })),
    currentIndex: 0,
  };
  throwsLog = [];
  io.emit("match_created", match);
  res.json(match);
});

app.get("/api/match", (_req, res) => {
  if (!match) return res.status(404).json({ error: "no match" });
  res.json({ match, throws: throwsLog });
});

app.post("/api/match/throw", (req, res) => {
  if (!match) return res.status(404).json({ error: "no match" });
  const { playerId, value, mult } = req.body || {};
  const p = match.players.find((x) => x.id === playerId);
  if (!p) return res.status(400).json({ error: "player not found" });
  const score = computeScore(value, mult);

  // simple x01 logic without bust/double-out (demo)
  p.score = Math.max(0, p.score - score);

  const entry = {
    id: createId(),
    playerId,
    value,
    mult,
    score,
    turn: throwsLog.length + 1,
  };
  throwsLog.push(entry);
  match.currentIndex = (match.currentIndex + 1) % match.players.length;
  io.emit("throw_added", { entry, match });
  res.json({ entry, match });
});

// WebSocket
io.on("connection", (socket) => {
  console.log("client connected");
  if (match) socket.emit("match_state", { match, throws: throwsLog });
  socket.on("disconnect", () => console.log("client disconnected"));
});

// Start
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log("Backend läuft auf Port", PORT);
});

