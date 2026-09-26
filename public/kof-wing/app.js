(function() {
  const elements = {
    identity: document.getElementById('identity'),
    lobbyView: document.getElementById('lobbyView'),
    roomView: document.getElementById('roomView'),
    playView: document.getElementById('playView'),
    roomList: document.getElementById('roomList'),
    roomCodeInput: document.getElementById('roomCodeInput'),
    roomCode: document.getElementById('roomCode'),
    inviteLink: document.getElementById('inviteLink'),
    hostName: document.getElementById('hostName'),
    hostState: document.getElementById('hostState'),
    guestName: document.getElementById('guestName'),
    guestState: document.getElementById('guestState'),
    startGameButton: document.getElementById('startGameButton'),
    playRole: document.getElementById('playRole'),
    playRoomCode: document.getElementById('playRoomCode'),
    connectionState: document.getElementById('connectionState'),
    hostGame: document.getElementById('hostGame'),
    guestGame: document.getElementById('guestGame'),
    guestControls: document.getElementById('guestControls'),
    ruffleContainer: document.getElementById('ruffleContainer'),
    hostNotice: document.getElementById('hostNotice'),
    guestNotice: document.getElementById('guestNotice'),
    remoteVideo: document.getElementById('remoteVideo'),
    toast: document.getElementById('toast'),
  };

  const state = {
    player: null,
    socket: null,
    room: null,
    rooms: [],
    autoRoom: new URLSearchParams(location.search).get('room'),
    autoJoinSent: false,
    peerConnection: null,
    pendingIce: [],
    rufflePlayer: null,
    captureStream: null,
    inputSequence: 0,
    pressedInputs: new Set(),
    startingRole: null,
  };

  const keyboardAliases = new Map([
    ['ArrowUp', 'ArrowUp'], ['ArrowDown', 'ArrowDown'], ['ArrowLeft', 'ArrowLeft'], ['ArrowRight', 'ArrowRight'],
    ['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], ['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight'],
    ['KeyJ', 'Numpad1'], ['KeyK', 'Numpad2'], ['KeyL', 'Numpad3'],
    ['KeyU', 'Numpad4'], ['KeyI', 'Numpad5'], ['KeyO', 'Numpad6'],
    ['Digit1', 'Numpad1'], ['Digit2', 'Numpad2'], ['Digit3', 'Numpad3'],
    ['Digit4', 'Numpad4'], ['Digit5', 'Numpad5'], ['Digit6', 'Numpad6'],
    ['Numpad1', 'Numpad1'], ['Numpad2', 'Numpad2'], ['Numpad3', 'Numpad3'],
    ['Numpad4', 'Numpad4'], ['Numpad5', 'Numpad5'], ['Numpad6', 'Numpad6'],
  ]);

  const hostKeyDefinitions = {
    ArrowUp: { key: 'ArrowUp', keyCode: 38, location: 0 },
    ArrowDown: { key: 'ArrowDown', keyCode: 40, location: 0 },
    ArrowLeft: { key: 'ArrowLeft', keyCode: 37, location: 0 },
    ArrowRight: { key: 'ArrowRight', keyCode: 39, location: 0 },
    Numpad1: { key: '1', keyCode: 97, location: 3 },
    Numpad2: { key: '2', keyCode: 98, location: 3 },
    Numpad3: { key: '3', keyCode: 99, location: 3 },
    Numpad4: { key: '4', keyCode: 100, location: 3 },
    Numpad5: { key: '5', keyCode: 101, location: 3 },
    Numpad6: { key: '6', keyCode: 102, location: 3 },
  };

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2400);
  }

  function send(payload) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
      showToast('房间连接尚未就绪');
      return false;
    }
    state.socket.send(JSON.stringify(payload));
    return true;
  }

  function normalizedRoomCode(value) {
    const compact = String(value || '').trim().toUpperCase().replaceAll(' ', '');
    return /^[A-HJ-NP-Z2-9]{6}$/.test(compact) ? `KOF-${compact}` : compact;
  }

  function inviteUrl(roomCode) {
    return `${location.origin}/g/kof-wing/?room=${encodeURIComponent(roomCode)}`;
  }

  function setView(view) {
    elements.lobbyView.classList.toggle('hidden', view !== 'lobby');
    elements.roomView.classList.toggle('hidden', view !== 'room');
    elements.playView.classList.toggle('hidden', view !== 'play');
  }

  function renderRooms() {
    if (!state.rooms.length) {
      elements.roomList.innerHTML = '<p class="empty">暂无公开房间，可创建一个。</p>';
      return;
    }
    elements.roomList.replaceChildren(...state.rooms.map(room => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'room-entry';
      const code = document.createElement('strong');
      code.textContent = room.code;
      const details = document.createElement('span');
      details.textContent = `${room.host} · ${room.players}/${room.capacity} · ${room.state}`;
      button.append(code, details);
      button.addEventListener('click', () => send({ type: 'join_room', roomCode: room.code }));
      return button;
    }));
  }

  function renderRoom() {
    const room = state.room;
    if (!room) {
      setView('lobby');
      return;
    }
    if (room.phase === 'playing') {
      setView('play');
      elements.playRole.textContent = room.role === 'host' ? '1P · 房主游戏端' : '2P · 远程控制端';
      elements.playRoomCode.textContent = room.code;
      elements.hostGame.classList.toggle('hidden', room.role !== 'host');
      elements.guestGame.classList.toggle('hidden', room.role !== 'guest');
      elements.guestControls.classList.toggle('hidden', room.role !== 'guest');
      startForRole(room.role);
      return;
    }
    setView('room');
    elements.roomCode.textContent = room.code;
    elements.inviteLink.textContent = inviteUrl(room.code);
    elements.hostName.textContent = room.host.nickname;
    elements.hostState.textContent = room.host.connected ? '已连接' : '暂时离线';
    elements.guestName.textContent = room.guest?.nickname || '等待第二名玩家';
    elements.guestState.textContent = room.guest ? (room.guest.connected ? '已连接' : '暂时离线') : '空位';
    const canStart = room.role === 'host' && room.guest?.connected;
    elements.startGameButton.hidden = room.role !== 'host';
    elements.startGameButton.disabled = !canStart;
    elements.startGameButton.textContent = canStart ? '开始双人对战' : '等待第二名玩家';
    history.replaceState(null, '', `?room=${encodeURIComponent(room.code)}`);
  }

  function applyRoom(room) {
    const previousCode = state.room?.code;
    state.room = room;
    if (previousCode && previousCode !== room.code) resetRuntime();
    renderRoom();
  }

  async function copyText(value, successMessage) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        if (!document.execCommand('copy')) throw new Error('copy unavailable');
        textarea.remove();
      }
      showToast(successMessage);
    } catch {
      showToast('自动复制不可用，请从页面中手动选择复制');
    }
  }

  async function loadRuffle() {
    if (window.RufflePlayer?.newest) return;
    window.RufflePlayer = window.RufflePlayer || {};
    window.RufflePlayer.config = {
      autoplay: 'on',
      unmuteOverlay: 'hidden',
      letterbox: 'on',
      forceScale: true,
      allowScriptAccess: true,
      warnOnUnsupportedContent: false,
      publicPath: '/g/kof-wing/source/ruffle/',
    };
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/g/kof-wing/source/ruffle/ruffle.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Ruffle 运行时加载失败'));
      document.head.appendChild(script);
    });
  }

  async function waitForCanvas(player) {
    for (let attempt = 0; attempt < 160; attempt++) {
      const canvas = player.shadowRoot?.querySelector('canvas');
      if (canvas && canvas.width > 0 && canvas.height > 0) return canvas;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('无法取得游戏画面，当前 Ruffle 版本不支持局域网串流');
  }

  function resetPeerConnection() {
    state.pendingIce = [];
    if (state.peerConnection) state.peerConnection.close();
    state.peerConnection = null;
    elements.remoteVideo.srcObject = null;
  }

  function ensurePeerConnection() {
    if (state.peerConnection) return state.peerConnection;
    const peerConnection = new RTCPeerConnection({ iceServers: [] });
    state.peerConnection = peerConnection;
    peerConnection.onicecandidate = event => {
      if (event.candidate) send({ type: 'signal', kind: 'ice', payload: event.candidate.toJSON() });
    };
    peerConnection.onconnectionstatechange = () => {
      const connectionState = peerConnection.connectionState;
      elements.connectionState.textContent = {
        connected: '局域网画面已连接', connecting: '正在建立局域网画面…',
        failed: '画面连接失败', disconnected: '画面暂时断开', closed: '画面已关闭',
      }[connectionState] || '正在协商画面…';
    };
    if (state.room?.role === 'guest') {
      peerConnection.ontrack = event => {
        const [stream] = event.streams;
        if (!stream) return;
        elements.remoteVideo.srcObject = stream;
        elements.guestNotice.classList.add('hidden');
        elements.remoteVideo.play().catch(() => {});
      };
    }
    return peerConnection;
  }

  async function flushPendingIce() {
    if (!state.peerConnection?.remoteDescription) return;
    const pending = state.pendingIce.splice(0);
    for (const candidate of pending) await state.peerConnection.addIceCandidate(candidate);
  }

  async function handleSignal(message) {
    try {
      const peerConnection = ensurePeerConnection();
      if (message.kind === 'offer') {
        await peerConnection.setRemoteDescription(message.payload);
        await flushPendingIce();
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        send({ type: 'signal', kind: 'answer', payload: peerConnection.localDescription.toJSON() });
      } else if (message.kind === 'answer') {
        await peerConnection.setRemoteDescription(message.payload);
        await flushPendingIce();
      } else if (message.kind === 'ice') {
        if (peerConnection.remoteDescription) await peerConnection.addIceCandidate(message.payload);
        else state.pendingIce.push(message.payload);
      }
    } catch (error) {
      elements.connectionState.textContent = `画面协商失败：${error.message}`;
    }
  }

  async function startHostGame() {
    if (state.startingRole === 'host' || state.rufflePlayer) return;
    state.startingRole = 'host';
    elements.connectionState.textContent = '正在载入权威游戏实例…';
    try {
      await loadRuffle();
      const ruffle = window.RufflePlayer.newest();
      const player = ruffle.createPlayer();
      state.rufflePlayer = player;
      elements.ruffleContainer.replaceChildren(player);
      await player.load({ url: '/g/kof-wing/source/game.swf', allowScriptAccess: true });
      const canvas = await waitForCanvas(player);
      if (typeof canvas.captureStream !== 'function') throw new Error('浏览器不支持 Canvas 画面采集');
      state.captureStream = canvas.captureStream(30);
      const peerConnection = ensurePeerConnection();
      for (const track of state.captureStream.getTracks()) peerConnection.addTrack(track, state.captureStream);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      send({ type: 'signal', kind: 'offer', payload: peerConnection.localDescription.toJSON() });
      send({ type: 'stream_state', value: 'ready' });
      elements.hostNotice.innerHTML = '<strong>点击游戏画面后开始操作</strong><span>使用 1P 键位选择“双人 / 玩家 VS 玩家”；访客输入会映射为原版 2P 键位。</span>';
      elements.connectionState.textContent = '游戏已启动，等待访客画面连接';
      player.focus();
    } catch (error) {
      send({ type: 'stream_state', value: 'failed' });
      elements.hostNotice.innerHTML = `<strong>游戏启动失败</strong><span>${escapeHtml(error.message)}</span>`;
      elements.connectionState.textContent = '游戏启动失败';
      state.startingRole = null;
    }
  }

  function startGuestGame() {
    if (state.startingRole === 'guest') return;
    state.startingRole = 'guest';
    elements.connectionState.textContent = '等待房主发送局域网画面…';
    ensurePeerConnection();
  }

  function startForRole(role) {
    if (role === 'host') void startHostGame();
    else if (role === 'guest') startGuestGame();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function dispatchRemoteInput(action, code) {
    const definition = hostKeyDefinitions[code];
    if (!definition || !state.rufflePlayer) return;
    const type = action === 'down' ? 'keydown' : 'keyup';
    const event = new KeyboardEvent(type, {
      key: definition.key,
      code,
      location: definition.location,
      bubbles: true,
      cancelable: true,
    });
    for (const property of ['keyCode', 'which']) {
      try { Object.defineProperty(event, property, { get: () => definition.keyCode }); } catch {}
    }
    state.rufflePlayer.dispatchEvent(event);
  }

  function releaseAllInputs(notifyServer) {
    for (const code of Array.from(state.pressedInputs)) sendInput('up', code, notifyServer);
    state.pressedInputs.clear();
    for (const button of document.querySelectorAll('[data-code].active')) button.classList.remove('active');
  }

  function sendInput(action, code, notifyServer = true) {
    if (state.room?.role !== 'guest' || state.room.phase !== 'playing') return;
    if (action === 'down') {
      if (state.pressedInputs.has(code)) return;
      state.pressedInputs.add(code);
    } else {
      if (!state.pressedInputs.has(code)) return;
      state.pressedInputs.delete(code);
    }
    if (notifyServer) send({ type: 'input', action, code, sequence: ++state.inputSequence });
  }

  function resetRuntime() {
    releaseAllInputs(false);
    resetPeerConnection();
    if (state.captureStream) {
      for (const track of state.captureStream.getTracks()) track.stop();
    }
    state.captureStream = null;
    state.rufflePlayer?.remove();
    state.rufflePlayer = null;
    state.startingRole = null;
    elements.ruffleContainer.replaceChildren();
    elements.hostNotice.classList.remove('hidden');
    elements.guestNotice.classList.remove('hidden');
  }

  function leaveRoom() {
    send({ type: 'leave_room' });
    resetRuntime();
    state.room = null;
    history.replaceState(null, '', '/g/kof-wing/');
    setView('lobby');
  }

  function handleMessage(message) {
    if (message.type === 'hello') {
      state.player = message.player;
      state.rooms = message.rooms || [];
      elements.identity.textContent = message.player.nickname;
      renderRooms();
      if (state.autoRoom && !state.autoJoinSent) {
        state.autoJoinSent = true;
        send({ type: 'join_room', roomCode: state.autoRoom });
      }
    } else if (message.type === 'lobby') {
      state.rooms = message.rooms || [];
      renderRooms();
    } else if (['room', 'room_created', 'room_joined'].includes(message.type)) {
      applyRoom(message.room);
    } else if (message.type === 'game_started') {
      startForRole(message.role);
    } else if (message.type === 'signal') {
      void handleSignal(message);
    } else if (message.type === 'remote_input') {
      if (message.action === 'release_all') {
        for (const code of Object.keys(hostKeyDefinitions)) dispatchRemoteInput('up', code);
      } else dispatchRemoteInput(message.action, message.code);
    } else if (message.type === 'room_closed' || message.type === 'left_room') {
      showToast(message.reason || '已离开房间');
      resetRuntime();
      state.room = null;
      history.replaceState(null, '', '/g/kof-wing/');
      setView('lobby');
    } else if (message.type === 'error') {
      showToast(message.message || '操作失败');
    }
  }

  async function connect() {
    const sessionResponse = await fetch('/api/session', { method: 'POST', credentials: 'same-origin' });
    if (!sessionResponse.ok) throw new Error('无法建立平台身份');
    state.player = await sessionResponse.json();
    elements.identity.textContent = state.player.nickname;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/g/kof-wing/ws`);
    state.socket = socket;
    socket.addEventListener('message', event => {
      try { handleMessage(JSON.parse(event.data)); } catch { showToast('收到无效的房间消息'); }
    });
    socket.addEventListener('close', () => {
      elements.connectionState.textContent = '房间服务连接已断开';
      if (state.room) showToast('房间连接已断开，请刷新页面重连');
    });
    socket.addEventListener('error', () => showToast('无法连接局域网房间服务'));
  }

  document.getElementById('createRoomButton').addEventListener('click', () => send({ type: 'create_room' }));
  document.getElementById('joinRoomButton').addEventListener('click', () => {
    const roomCode = normalizedRoomCode(elements.roomCodeInput.value);
    send({ type: 'join_room', roomCode });
  });
  elements.roomCodeInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') document.getElementById('joinRoomButton').click();
  });
  document.getElementById('refreshRoomsButton').addEventListener('click', async () => {
    try {
      const response = await fetch('/g/kof-wing/api/rooms', { credentials: 'same-origin', cache: 'no-store' });
      state.rooms = (await response.json()).rooms || [];
      renderRooms();
    } catch { showToast('房间列表刷新失败'); }
  });
  document.getElementById('copyCodeButton').addEventListener('click', () => {
    if (state.room) void copyText(state.room.code, '已复制完整房间码');
  });
  document.getElementById('copyLinkButton').addEventListener('click', () => {
    if (state.room) void copyText(inviteUrl(state.room.code), '已复制当前房间邀请链接');
  });
  elements.startGameButton.addEventListener('click', () => send({ type: 'start_game' }));
  document.getElementById('leaveRoomButton').addEventListener('click', leaveRoom);
  document.getElementById('leaveGameButton').addEventListener('click', leaveRoom);

  window.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const code = keyboardAliases.get(event.code);
    if (!code || state.room?.role !== 'guest' || state.room.phase !== 'playing') return;
    event.preventDefault();
    if (!event.repeat) sendInput('down', code);
  });
  window.addEventListener('keyup', event => {
    const code = keyboardAliases.get(event.code);
    if (!code || state.room?.role !== 'guest' || state.room.phase !== 'playing') return;
    event.preventDefault();
    sendInput('up', code);
  });
  window.addEventListener('blur', () => releaseAllInputs(true));

  for (const button of document.querySelectorAll('[data-code]')) {
    const code = button.dataset.code;
    const release = event => {
      event.preventDefault();
      button.classList.remove('active');
      sendInput('up', code);
    };
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      button.classList.add('active');
      sendInput('down', code);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', event => event.preventDefault());
  }

  connect().catch(error => {
    elements.identity.textContent = '身份服务不可用';
    showToast(error.message);
  });
})();
