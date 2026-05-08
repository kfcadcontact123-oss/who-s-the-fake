import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { QUESTION_BANK } from './questions';

dotenv.config();

const PORT = Number(process.env.PORT || 4000);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' }
});

type Role = 'Dân thường' | 'Kẻ mạo danh';
type Phase = 'lobby' | 'answering' | 'reveal' | 'voting' | 'result';

type Player = {
  id: string;
  name: string;
  socketId: string;
  joinedInRound: number;
};

type Room = {
  code: string;
  name: string;
  hostId: string;
  players: Player[];
  phase: Phase;
  roles: Record<string, Role>;
  questionPair?: {
    normal: string;
    imposter: string;
  };
  isPrivate: boolean;
};

const rooms = new Map<string, Room>();
const answers = new Map<string, Map<string, string>>();
const votes = new Map<string, Map<string, string[]>>();
let roundCounter = 0;

// ====================== QUESTION ======================

function getRandomQuestion() {
  return QUESTION_BANK[
    Math.floor(Math.random() * QUESTION_BANK.length)
  ];
}

// ====================== HELPERS ======================

function makeRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

function makeGuestName(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const suffix = Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `nguoi-choi_${suffix}`;
}

function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

function getPlayerBySocket(room: Room, socketId: string) {
  return room.players.find(p => p.socketId === socketId);
}

function emitRoom(room: Room) {
  io.to(room.code).emit('room_updated', {
    ...room,
    roundCounter
  });
}

function assignRoles(players: Player[]): Record<string, Role> {
  const total = players.length;

  const imposterCount = Math.max(
    1,
    Math.min(total - 1, Math.floor(Math.random() * Math.min(3, total - 1)) + 1)
  );

  const shuffled = [...players].sort(() => Math.random() - 0.5);

  const selected = new Set(
    shuffled.slice(0, imposterCount).map(p => p.id)
  );

  const roles: Record<string, Role> = {};

  players.forEach(p => {
    roles[p.id] = selected.has(p.id) ? 'Dân thường' : 'Kẻ mạo danh';
  });

  return roles;
}

// ====================== SOCKET ======================

io.on('connection', (socket: Socket) => {
  console.log('connected', socket.id);

  // ===== CREATE ROOM =====
  socket.on('create_room', (payload, cb) => {
    const code = makeRoomCode();

    const player: Player = {
      id: randomUUID(),
      name: payload?.name || makeGuestName(),
      socketId: socket.id,
      joinedInRound: roundCounter
    };

    const room: Room = {
      code,
      hostId: player.id,
      name: payload?.roomName || `Phòng ${code}`,
      isPrivate: !!payload?.isPrivate,
      players: [player],
      phase: 'lobby',
      roles: {}
    };

    rooms.set(code, room);

    socket.join(code);

    cb?.({ roomCode: code, player });

    emitRoom(room);
  });

  // ===== JOIN ROOM =====
  socket.on('join_room', (payload, cb) => {
    const roomCode = String(payload?.roomCode || '').toUpperCase();
    const room = getRoom(roomCode);

    if (!room) {
      cb?.({ error: 'Room not found' });
      return;
    }

    const { playerId, name } = payload;

// tìm theo playerId
let player = room.players.find(p => p.id === playerId);

if (player) {
  // reconnect
  player.socketId = socket.id;
} else {
  // new player
  player = {
    id: playerId || randomUUID(),
    name: name || makeGuestName(),
    socketId: socket.id,
    joinedInRound: room.phase === 'lobby' ? roundCounter : -1
  };

  room.players.push(player);
}

// QUAN TRỌNG
socket.join(roomCode);

cb?.({ ok: true, player });

emitRoom(room);
  });
  // ===== LEAVE ROOM =====
socket.on('leave_room', ({ roomCode }, cb) => {
  const room = rooms.get(roomCode);
  if (!room) return;

  const player = room.players.find(p => p.socketId === socket.id);
  if (!player) return;

  socket.leave(roomCode);
  player.socketId = '';
   io.to(room.code).emit('player_left', {
    id: player.id,
    name: player.name
  });

  emitRoom(room);
  cb?.({ ok: true }); 

  console.log(`${player.name} left room ${roomCode}`);
});

  // ===== START ROUND =====
  socket.on('start_round', ({ roomCode }) => {
    roundCounter++;
    const room = getRoom(roomCode);
    if (!room) return;
     if (room.phase !== 'lobby' && room.phase !== 'result') {
    return;
  }
  room.players.forEach(p => {
  p.joinedInRound = roundCounter;
});
    if (room.players.length < 2) return;

    const pair = getRandomQuestion();
    room.questionPair = pair;

    room.phase = 'answering';
    const activePlayers = room.players.filter(
  p => p.joinedInRound === roundCounter && p.socketId
);

room.roles = assignRoles(activePlayers);

    answers.set(roomCode, new Map());
    votes.set(roomCode, new Map());

    emitRoom(room);

    room.players.forEach(p => {
  if (p.joinedInRound !== roundCounter) return;

  const role = room.roles[p.id];

  io.to(p.socketId).emit('role_assigned', {
    role,
    question: role === 'Kẻ mạo danh'
      ? pair.imposter
      : pair.normal
  });
});

    let remaining = 60;

    io.to(roomCode).emit('timer', remaining);

    const timer = setInterval(() => {
      remaining--;
      io.to(roomCode).emit('timer', remaining);

      if (remaining <= 0) {
        clearInterval(timer);

        room.phase = 'reveal';
        emitRoom(room);

        io.to(roomCode).emit('answers_revealed', {
          answers: Array.from(answers.get(roomCode)?.entries() || []),
          normalQuestion: room.questionPair?.normal
        });

        setTimeout(() => {
          room.phase = 'voting';
          emitRoom(room);
          io.to(roomCode).emit('voting_started');
        }, 5000);
      }
    }, 1000);
  });

  // ===== SUBMIT ANSWER =====
  socket.on('submit_answer', ({ roomCode, answer }) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const player = getPlayerBySocket(room, socket.id);
    if (!player) return;
    if (player.joinedInRound !== roundCounter) return;

    answers.get(roomCode)?.set(player.id, answer);
  });

  // ===== SUBMIT VOTE (FINAL LOGIC) =====
  socket.on('submit_vote', ({ roomCode, votes: targets }) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const player = getPlayerBySocket(room, socket.id);
    if (!player) return;
    if (player.joinedInRound !== roundCounter) return;

    const roomVotes = votes.get(roomCode);
    if (!roomVotes) return;

    if (roomVotes.has(player.id)) return;
    roomVotes.set(player.id, targets);
    const activePlayers = room.players.filter(
  p => p.joinedInRound === roundCounter && p.socketId
);

if (votes.get(roomCode)!.size === activePlayers.length){
      room.phase = 'result';

      // ===== IMPOSTERS =====
      const imposters = new Set(
        Object.entries(room.roles)
          .filter(([_, role]) => role === 'Kẻ mạo danh')
          .map(([id]) => id)
      );

      // ===== NORMAL PLAYERS ONLY =====
      const normalPlayers = room.players.filter(
  p =>
    room.roles[p.id] === 'Dân thường' &&
    p.joinedInRound === roundCounter &&
    p.socketId
);

      let isWin = true;

      for (const p of normalPlayers) {
        const playerVotes = votes.get(roomCode)?.get(p.id) || [];
        const voteSet = new Set(playerVotes);

        // vote nhầm normal
        for (const id of voteSet) {
          if (!imposters.has(id)) {
            isWin = false;
            break;
          }
        }

        // thiếu imposter
        for (const imp of imposters) {
          if (!voteSet.has(imp)) {
            isWin = false;
            break;
          }
        }

        if (!isWin) break;
      }
      const voteCount: Record<string, number> = {};

for (const p of normalPlayers) {
  const v = votes.get(roomCode)?.get(p.id) || [];

  for (const target of v) {
    // ✅ CHỈ tính nếu target là imposter
    if (imposters.has(target)) {
      voteCount[target] = (voteCount[target] || 0) + 1;
    }
  }
}

// tìm người bị vote nhiều nhất
let mostVoted: string | null = null;
let max = -1;

for (const [id, count] of Object.entries(voteCount)) {
  if (count > max) {
    max = count;
    mostVoted = id;
  }
}

      io.to(roomCode).emit('round_result', {
        voted: Array.from(
          new Set(
            normalPlayers.flatMap(p =>
              votes.get(roomCode)?.get(p.id) || []
            )
          )
        ),
        mostVoted,
        isWin,
        roles: room.roles,
        normalQuestion: room.questionPair?.normal,
        imposterQuestion: room.questionPair?.imposter
      });

      emitRoom(room);
    }
  });

  // ===== DISCONNECT =====
  socket.on('disconnect', () => {
  for (const room of rooms.values()) {
    const leaving = room.players.find(
      p => p.socketId === socket.id
    );

    if (!leaving) continue;

    // KHÔNG XÓA PLAYER
    leaving.socketId = ''; // hoặc null

    // nếu muốn:
    // leaving.isOnline = false;

    io.to(room.code).emit('player_left', {
      id: leaving.id,
      name: leaving.name
    });

    emitRoom(room);
  }

  console.log('disconnect', socket.id);
});
// ===== CHAT =====
socket.on('send_message', ({ roomCode, message }) => {
  const room = getRoom(roomCode);
  if (!room) return;

  const player = getPlayerBySocket(room, socket.id);
  if (!player) return;

  io.to(roomCode).emit('new_message', {
    id: player.id,
    name: player.name,
    message,
    time: Date.now()
  });
});
// ===== TYPING =====
socket.on('typing', ({ roomCode, isTyping }) => {
  const room = getRoom(roomCode);
  if (!room) return;

  const player = getPlayerBySocket(room, socket.id);
  if (!player) return;
  console.log('TYPING:', player.name, isTyping);

  io.to(roomCode).emit('user_typing', {
    id: player.id,
    name: player.name,
    isTyping
  });
});
socket.on('get_rooms', () => {
  const list = Array.from(rooms.values())
  .filter(r => !r.isPrivate && r.players.some(p => p.socketId))
  .map(r => ({
    code: r.code,
    name: r.name,
    players: r.players.filter(p => p.socketId).length,
    hostId: r.hostId,
    phase: r.phase
  }));

  io.emit('rooms_list', list);
});
});
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});