'use client';
import Image from 'next/image';

import { use, useEffect, useRef, useState } from 'react';
import { socket } from '../../../lib/socket';

export default function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const joined = useRef(false);

  const [room, setRoom] = useState<any>(null);
  const [timer, setTimer] = useState(0);
  const [role, setRole] = useState<any>(null);
  const [phase, setPhase] = useState('lobby');

  const [answer, setAnswer] = useState('');
  const [votes, setVotes] = useState<string[]>([]);

  const [revealedAnswers, setRevealedAnswers] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);

  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  const [normalQuestion, setNormalQuestion] = useState('');
  const [imposterQuestion, setImposterQuestion] = useState('');

  const [leftMsg, setLeftMsg] = useState('');
  const activePlayers =
  room?.players?.filter((p:any) => p.socketId).length || 0;

  // ===== CHAT =====
  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const me = room?.players?.find((p: any) => p.id === myId);
  const isActivePlayer =
  me && me.joinedInRound === room?.roundCounter;
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const chatRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<any>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const [showPlayers, setShowPlayers] = useState(false);
  // ===== AUTO SCROLL CHAT =====
  useEffect(() => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

useEffect(() => {
  const playerName = sessionStorage.getItem('name');
  let playerId = sessionStorage.getItem('playerId');

  if (!playerId) {
    playerId = crypto.randomUUID();
    sessionStorage.setItem('playerId', playerId);
  }

  if (!playerName) {
    alert('Chưa nhập tên');
    return;
  }

  // ===== HANDLERS =====
  const handleRoomUpdate = (r: any) => {
    setRoom(r);
    setPhase(r.phase);

    if (r.phase === 'answering' && prevPhaseRef.current !== 'answering') {
      setVotes([]);
      setAnswer('');
      setHasSubmitted(false);
      setHasVoted(false);

      setMessages([]);
      setTypingUsers({});
    }
    prevPhaseRef.current = r.phase;
  };

  const handleTimer = (t: number) => setTimer(t);

  const handleRole = (r: any) => {
    setRole(r);
    setPhase('answering');
  };

  const handleReveal = (data: any) => {
    setRevealedAnswers(data.answers);
    setNormalQuestion(data.normalQuestion);
    setPhase('reveal');
  };

  const handleVoting = () => setPhase('voting');

  const handleResult = (data: any) => {
    setResult(data);
    setImposterQuestion(data.imposterQuestion);
    setPhase('result');
  };

  const handleMessage = (msg: any) => {
    setMessages((prev) => [...prev, msg]);
  };

  const handleTyping = (data: any) => {
    setTypingUsers((prev) => {
      const copy = { ...prev };

      if (data.isTyping) {
        copy[data.id] = data.name;
      } else {
        delete copy[data.id];
      }

      return copy;
    });
  };

  const handlePlayerLeft = (data: any) => {
    setLeftMsg(`${data.name} đã rời phòng`);
    setTimeout(() => setLeftMsg(''), 3000);
  };

  // ===== REGISTER TRƯỚC =====
  socket.on('room_updated', handleRoomUpdate);
  socket.on('timer', handleTimer);
  socket.on('role_assigned', handleRole);
  socket.on('answers_revealed', handleReveal);
  socket.on('voting_started', handleVoting);
  socket.on('round_result', handleResult);
  socket.on('new_message', handleMessage);
  socket.on('user_typing', handleTyping);
  socket.on('player_left', handlePlayerLeft);

  // ===== JOIN SAU =====
  const join = () => {
    if (joined.current) return;
    joined.current = true;

    socket.emit(
  'join_room',
  {
    roomCode: code,
    name: playerName,
    playerId,
  },
  (res: any) => {
    if (res?.error) {
      alert(' Phòng không tồn tại, hãy kiểm tra lại mã');
      window.location.href = '/';
      return;
    }

    if (res?.player) {
      setMyId(res.player.id);
    }
  }
);
  };

  if (socket.connected) {
    join();
  } else {
    socket.once('connect', join);
    socket.connect();
  }

  // ===== CLEANUP =====
  return () => {
    socket.off('room_updated', handleRoomUpdate);
    socket.off('timer', handleTimer);
    socket.off('role_assigned', handleRole);
    socket.off('answers_revealed', handleReveal);
    socket.off('voting_started', handleVoting);
    socket.off('round_result', handleResult);
    socket.off('new_message', handleMessage);
    socket.off('user_typing', handleTyping);
    socket.off('player_left', handlePlayerLeft);
  };
}, [code]);
  useEffect(() => {
  joined.current = false;
}, [code]);

  // ===== ACTIONS =====
  const submitAnswer = () => {
  if (!isActivePlayer) return;

  socket.emit('submit_answer', {
    roomCode: code,
    answer,
  });
  setHasSubmitted(true);
};

  const submitVote = () => {
  if (!isActivePlayer) return;

  socket.emit('submit_vote', {
    roomCode: code,
    votes,
  });
  setHasVoted(true);
};

  const sendMessage = () => {
    if (!chatInput.trim()) return;

    socket.emit('send_message', {
      roomCode: code,
      message: chatInput,
    });

    // stop typing
    socket.emit('typing', {
      roomCode: code,
      isTyping: false,
    });
    setTypingUsers((prev) => {
  const copy = { ...prev };
  delete copy[myId!];
  return copy;
});

    setChatInput('');
  };

  // ===== UI =====
  return (
    <main className="room-container">
      {/* LEFT PANEL */}
      <div className="room-left">
        <div className="room-header">
          <div className="room-header-top">
            <div className="room-topbar">
        <button className="btn back-btn"
          onClick={() => {
  socket.emit('leave_room', { roomCode: code }, () => {
  window.location.href = '/';
});
}}
        >
          Về trang chủ
        </button>
  </div>
        <div className={`phase-pill ${phase}`}>
  {phase}
</div>
        </div>
        <h1>Tên phòng: {room?.name || `Room ${code}`}</h1>
        <div className="room-meta">
<p className="room-code">Mã phòng: {code}</p>
<Image
    src="/logo.png"
    alt="Who's The Fake"
    width={48}
    height={48}
    className="room-logo"
  />
  </div>
{(phase === 'lobby' || phase === 'result') && (
          <button className="btn start-btn"
          disabled={activePlayers < 3}
            onClick={() =>
              socket.emit('start_round', { roomCode: code })
            }
          >
            {
  activePlayers < 3
    ? 'Cần ít nhất 3 người để chơi'
    : phase === 'lobby'
    ? 'Bắt đầu chơi'
    : 'Vòng tiếp theo'
}
          </button>
        )}
</div>
        {leftMsg && (
          <p style={{ color: 'red', fontWeight: 'bold' }}>
            {leftMsg}
          </p>
        )}
        <div className="game-panel">
        {/* ANSWERING */}
        {phase === 'answering' && (
  !isActivePlayer ? (
    <p>Cảnh báo: Bạn vào giữa game, không thể trả lời</p>
  ) : (
          <div className="card">
            
            {role && isActivePlayer && (
  <>
    <h3>Role: {role.role}</h3>
    <div className="question-box">{role.question}</div>
    <div className="timer-box">
  {timer}s
</div>
  </>
)}

            <input className="input"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={!isActivePlayer}
            />

            <button className="btn" onClick={submitAnswer}

              disabled={!isActivePlayer}>
            {hasSubmitted ? 'Đã gửi (có thể sửa)' : 'Gửi'}
            </button>
          </div>
          )
        )}

        {/* REVEAL */}
        {phase === 'reveal' && (
          <div className="card">
            <h3>Câu hỏi dành cho dân thường:</h3>
            <div className="question-box">
  {normalQuestion}
</div>

            <div className="answer-card">
            <h3>Đáp án của các người chơi:</h3>
            {revealedAnswers.map(([id, ans]) => {
              const player = room?.players.find(
                (p: any) => p.id === id
              );
              return (
                <div key={id}>
                  <b>{player?.name}:</b> {ans}
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* VOTING */}
        {phase === 'voting' && ( !isActivePlayer ? (
    <p>Bạn không được bỏ phiếu trong vòng này vì chưa tham gia vòng</p>
  ) : (
          <div className="card">
            <h3>Bỏ phiếu tìm kẻ mạo danh</h3>
            <div className="question-box">
  {normalQuestion}
</div>

            {room?.players
  ?.filter((p: any) => p.socketId &&
    p.joinedInRound === room?.roundCounter)
  .map((p: any) => {
              const found = revealedAnswers.find(
                ([id]) => id === p.id
              );

              return (
                <label key={p.id} style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    disabled={p.id === myId || !isActivePlayer}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setVotes((v) =>
                          Array.from(new Set([...v, p.id]))
                        );
                      } else {
                        setVotes((v) =>
                          v.filter((x) => x !== p.id)
                        );
                      }
                    }}
                  />
                  {p.name} — {found?.[1] || 'chưa trả lời'}
                </label>
              );
            })}

            <button className="btn start-btn" onClick={submitVote} disabled={hasVoted || !isActivePlayer}>
              {hasVoted ? 'Đã bỏ phiếu' : 'Bỏ phiếu'}
            </button>
          </div>
  )
        )}

        {/* RESULT */}
        {phase === 'result' && result && (
  <div className="card">
    <h3>Kết quả</h3><p>
      {result.isWin
        ? 'Dân thường chiến thắng!!!'
        : 'Kẻ mạo danh đã chiến thắng!!!'}
    </p>
    <p>
      Người bị bỏ phiếu nhiều nhất:{' '}
      <b>
        {
          room?.players?.find(
            (p: any) => p.id === result.mostVoted
          )?.name || 'Không có ai'
        }
      </b>
    </p>

    <h4>Câu hỏi cho dân thường:</h4>
    <p>{result.normalQuestion}</p>

    <h4>Câu hỏi cho kẻ mạo danh:</h4>
    <p>{result.imposterQuestion}</p>


    <h4>Vai trò các người chơi trong vòng:</h4>
    <div className="role-grid">
    {Object.entries(result.roles || {}).map(
      ([id, role]: any) => {
        const player = room?.players?.find(
          (p: any) => p.id === id
        );
        return (
          <div
  key={id}
  className={`role-item ${
    role === 'Kẻ mạo danh'
      ? 'imposter'
      : 'normal'
  }`}
>
  <span>{player?.name}</span>

  <b>{role}</b>
</div>
        );
      }
    )}
    </div>
  </div>
)}
      </div>
      </div>

      {/* CHAT PANEL */}
      <div className="room-sidebar">
        <div
  className={`players-panel card mobile-players-panel ${
    showPlayers ? 'open' : ''
  }`}
>
<button
  className="mobile-close-chat"
  onClick={() => setShowPlayers(false)}
>
  ← Quay lại
</button>
  <h3>
    Players ({activePlayers})
  </h3>

  <div className="players-scroll">
    {room?.players
      ?.filter((p:any) => p.socketId)
      .map((p:any) => (
        <div
          key={p.id}
          className="player-item"
        >
          {p.name}
          {p.id === myId ? ' (Bạn)' : ''}
        </div>
      ))}
  </div>

</div>
<div className={`chat-panel ${showMobileChat ? 'open' : ''}`}>
        <h3 style={{ marginBottom: 10 }}>Trò chuyện</h3>
        <button
  className="mobile-close-chat"
  onClick={() => setShowMobileChat(false)}
>
  ← Quay lại
</button>

        {/* MESSAGE LIST */}
        <div
          ref={chatRef}
          className="chat-messages"
        >
          {messages.length === 0 && (
    <div style={{ opacity: 0.5, textAlign: 'center', marginTop: 20 }}>
      Chưa có tin nhắn nào 
    </div>
  )}
          {messages.map((m, i) => (
            <div key={i}>
              <div className={`chat-row ${m.id === myId ? 'me' : ''}`}>
  <div className="chat-bubble">
    <div className="chat-name">{m.name}</div>
    <div>{m.message}</div>
  </div>
</div>
            </div>
          ))}
        </div>

        {/* TYPING */}
        <div className="typing-indicator">
          {(() => {
            const names = Object.entries(typingUsers)
  .filter(([id]) => myId && id !== myId)
  .map(([_, name]) => name);

            if (names.length === 0) return null;
            if (names.length === 1)
              return `${names[0]} đang soạn...`;
            if (names.length <= 3)
              return `${names.join(', ')} đang soạn...`;

            return `${names.length} người đang soạn...`;
          })()}
        </div>

        {/* INPUT */}
        <div className="chat-input">
          <input
            className="input"
            value={chatInput}
            onChange={(e) => {
  const value = e.target.value;
  setChatInput(value);

  if (!myId) return;

  // 👉 nếu có text => đang typing
  if (value.trim().length > 0) {
    socket.emit('typing', {
      roomCode: code,
      isTyping: true,
    });
  } else {
    // 👉 input rỗng => stop typing
    socket.emit('typing', {
      roomCode: code,
      isTyping: false,
    });
  }
}}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendMessage();
            }}
          />
          <button className="btn" onClick={sendMessage}>Gửi</button>
        </div>
      </div>
      </div>
      <button
  className="mobile-chat-btn"
  onClick={() => setShowMobileChat(true)}
>
  Chat
</button>
<button
  className="mobile-player-btn"
  onClick={() => setShowPlayers(true)}
>
  Người chơi
</button>
    </main>
  );
}