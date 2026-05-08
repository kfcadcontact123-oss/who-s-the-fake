'use client';
import Image from 'next/image';

import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';

export default function Home() {
  const [code, setCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [showMobileRooms, setShowMobileRooms] = useState(false);
  const [confirmedName, setConfirmedName] = useState<string | null>(null);

  const [rooms, setRooms] = useState<any[]>([]);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  //LOAD ROOM LIST
  useEffect(() => {
  const loadRooms = () => {
    socket.emit('get_rooms');
  };

  if (socket.connected) {
    loadRooms();
  } else {
    socket.once('connect', loadRooms);
    socket.connect();
  }

  socket.on('rooms_list', setRooms);

  return () => {
    socket.off('rooms_list', setRooms);
  };
}, []);

  // ===== CONFIRM NAME =====
  const confirmName = () => {
    if (!name.trim()) {
      alert('Nhập tên đã');
      return;
    }
    let playerId = sessionStorage.getItem('playerId');

if (!playerId) {
  playerId = crypto.randomUUID();
  sessionStorage.setItem('playerId', playerId);
}
    sessionStorage.setItem('name', name);
    setConfirmedName(name);
  };

  // ===== CREATE ROOM =====
  const createRoom = () => {
  if (!confirmedName) {
    alert('Bạn chưa xác nhận tên');
    return;
  }

  const create = () => {
    socket.emit('create_room', {
    name: confirmedName,
    roomName: roomName.trim() || undefined,
    isPrivate
  }, 
  (data: any) => {
      if (!data?.roomCode) {
        alert('Tạo phòng thất bại');
        return;
      }

      window.location.href = `/room/${data.roomCode}`;
    });
  };

  if (socket.connected) {
    create();
  } else {
    socket.once('connect', create);
    socket.connect();
  }
};

  // ===== JOIN ROOM =====
  const joinRoom = (roomCode?: string) => {
    if (!confirmedName) {
      alert('Bạn chưa xác nhận tên');
      return;
    }

    const finalCode = roomCode || code.trim().toUpperCase();

    if (!finalCode) {
      alert('Nhập mã phòng');
      return;
    }

    window.location.href = `/room/${finalCode}`;
  };

  return (
    <main className="home-container">
      <div className='home-sidebar'>

    <div className="hero">
  <Image
    src="/logo.png"
    alt="Who's The Fake"
    width={220}
    height={220}
    className="hero-logo"
    priority
  />

  <h1 className="home-title">
    Tìm kẻ mạo danh
  </h1>
</div>
    {/*nút list phòng cho điện thoại */}
    <button
  className="mobile-room-btn"
  onClick={() => setShowMobileRooms(true)}
>
  Danh sách phòng
</button>

    {/* NAME */}
    <div className="section">
      <input
        className="input"
        placeholder="Tên của bạn"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={!!confirmedName}
      />

      <button className="btn" onClick={confirmName} disabled={!!confirmedName}>
        {confirmedName ? 'Đã xác nhận' : 'Xác nhận tên'}
      </button>

      {confirmedName && (
        <p className="welcome">Xin chào <b>{confirmedName}</b> </p>
      )}
    </div>
    

    {/* CREATE ROOM */}
    <div className="section card">
      <h3>Tạo phòng</h3>

      <input
        className="input"
        placeholder="Tên phòng (tuỳ chọn)"
        value={roomName}
        onChange={(e) => setRoomName(e.target.value)}
        disabled={!confirmedName}
      />

      <label className="checkbox">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          disabled={!confirmedName}
        />
        Phòng riêng
      </label>

      <button className="btn" onClick={createRoom} disabled={!confirmedName}>
        Tạo phòng
      </button>
    </div>

    {/* JOIN */}
    <div className="section card">
      <h3>Vào phòng</h3>

      <input
        className="input"
        placeholder="Nhập mã phòng"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        disabled={!confirmedName}
      />

      <button className="btn" onClick={() => joinRoom()}>
        Vào phòng
      </button>
    </div>
    </div>
    <div className={`home-rooms ${showMobileRooms ? 'open' : ''}`}>
    {/* ROOM LIST */}
    <div className="section">
      <h2>Danh sách phòng</h2>

      {rooms.length === 0 && <p className="empty">Chưa có phòng nào</p>}

      <div className="room-list">
        {rooms.map((r) => (
          <div
            key={r.code}
            className="room-item"
            onMouseEnter={() => setHoveredRoom(r.code)}
            onMouseLeave={() => setHoveredRoom(null)}
            onClick={() => joinRoom(r.code)}
          >
            <div>
              <b>{r.name}</b>
              <p>{r.players} người</p>
            </div>

            {r.isPrivate && <span className="badge">Phòng riêng</span>}

            {hoveredRoom === r.code && (
              <div className="room-tooltip">
                <p><b>Mã:</b> {r.code}</p>
                <p><b>Người chơi:</b> {r.players}</p>
                <p><b>Trạng thái:</b> {r.phase}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
    <button
  className="mobile-close-room"
  onClick={() => setShowMobileRooms(false)}
>
  ← Quay lại
</button>
    </div>
</main>
  );
}