const socket = io();
const remoteAudio = document.getElementById('remoteAudio');

let myNick = localStorage.getItem('bogdan_nick') || ("User_" + Math.floor(Math.random()*999));
localStorage.setItem('bogdan_nick', myNick);

let pc, localStream, myRoom, gLoop;

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { 
            urls: 'turn:openrelay.metered.ca:80', 
            username: 'openrelayproject', 
            credential: 'openrelayproject' 
        }
    ]
};

// Загрузка картинок
const imgBird = new Image(); imgBird.src = 'assets/bird.png';
const imgBg = new Image(); imgBg.src = 'assets/background-day.png';
const imgPipe = new Image(); imgPipe.src = 'assets/pipe.png';

socket.on('online_update', c => document.getElementById('online-count').innerText = c);

document.getElementById('startBtn').onclick = async () => {
    // 1. Сначала железно получаем микрофон (Пункт 3 из твоей статьи)
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Микрофон получен");
        
        // Разблокируем аудио-движок браузера (Пункт 2 из твоей статьи)
        remoteAudio.play().catch(() => {}); 
    } catch (e) {
        alert("Ошибка: Нужен доступ к микрофону!");
        return;
    }

    const p = {
        gender: document.getElementById('myGender').value,
        age: document.getElementById('myAge').value,
        targetGender: document.getElementById('targetGender').value,
        targetAge: document.getElementById('targetAge').value,
        nick: myNick
    };
    socket.emit('find_partner', p);
    document.getElementById('startBtn').innerText = 'ИЩЕМ...';
};

socket.on('partner_found', async (data) => {
    myRoom = data.room;
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('chat-screen').classList.remove('hidden');
    document.getElementById('chat-messages').innerHTML = '<div><i>Собеседник найден!</i></div>';
    
    // Создаем соединение (Пункт 3: ДО Offer добавляем треки)
    await createPeerConnection(data.initiator);
});

async function createPeerConnection(isInitiator) {
    pc = new RTCPeerConnection(rtcConfig);

    // Добавляем треки ДО создания оффера (Важное исправление!)
    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
        console.log("Получен поток от собеседника");
        if (remoteAudio.srcObject !== event.streams[0]) {
            remoteAudio.srcObject = event.streams[0]; // Привязываем к <audio> (Пункт 1)
        }
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { candidate: event.candidate });
        }
    };

    if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { sdp: pc.localDescription });
    }
}

socket.on('signal', async (data) => {
    if (!pc) return;
    if (data.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (pc.remoteDescription.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('signal', { sdp: pc.localDescription });
        }
    } else if (data.candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {}
    }
});

socket.on('partner_left', () => {
    document.getElementById('chat-messages').innerHTML += '<div><b style="color:#da3633">Собеседник ушел</b></div>';
    if(pc) { pc.close(); pc = null; }
    remoteAudio.srcObject = null;
});

// ЧАТ И ИГРА
document.getElementById('nextBtn').onclick = () => location.reload();
function send() {
    const i = document.getElementById('msgInput');
    if(!i.value || !myRoom) return;
    socket.emit('message', { room: myRoom, text: i.value });
    addMsg(i.value, true);
    i.value = '';
}
document.getElementById('sendBtn').onclick = send;
document.getElementById('msgInput').onkeydown = e => { if(e.key === 'Enter') send(); };
socket.on('message', t => addMsg(t, false));

function addMsg(t, isMy) {
    const m = document.getElementById('chat-messages');
    const d = document.createElement('div');
    if(isMy) d.className = 'my-msg';
    d.innerText = t;
    m.appendChild(d);
    m.scrollTop = m.scrollHeight;
}

function toggleGame() {
    const layer = document.getElementById('game-overlay');
    layer.classList.toggle('hidden');
    if(!layer.classList.contains('hidden')) runFlappy();
    else clearInterval(gLoop);
}

function runFlappy() {
    const cvs = document.getElementById('gameCanvas');
    const ctx = cvs.getContext('2d');
    let bird = {y:200, v:0, w:34, h:24}, pipes = [], score=0, frame=0;
    window.onclick = () => bird.v = -6;
    window.onkeydown = e => { if(e.code==='Space') bird.v = -6; };
    gLoop = setInterval(() => {
        bird.v += 0.4; bird.y += bird.v;
        if(frame++ % 80 == 0) pipes.push({x:300, h:Math.random()*150+50});
        pipes.forEach(p => p.x -= 3);
        if(bird.y > 400 || bird.y < 0) {
            socket.emit('save_score', {name: myNick, score: score});
            alert('Счет: ' + score); toggleGame(); return;
        }
        if(imgBg.complete) ctx.drawImage(imgBg, 0, 0, 300, 400);
        else { ctx.fillStyle='#4ec0ca'; ctx.fillRect(0,0,300,400); }
        if(imgBird.complete) ctx.drawImage(imgBird, 50, bird.y, bird.w, bird.h);
        else { ctx.fillStyle='yellow'; ctx.fillRect(50, bird.y, 20, 20); }
        pipes.forEach(p => {
            if(imgPipe.complete) {
                ctx.save(); ctx.translate(p.x + 25, p.h); ctx.rotate(Math.PI);
                ctx.drawImage(imgPipe, -25, 0, 50, 400); ctx.restore();
                ctx.drawImage(imgPipe, p.x, p.h + 110, 50, 400);
            } else {
                ctx.fillStyle='green'; ctx.fillRect(p.x, 0, 50, p.h); ctx.fillRect(p.x, p.h+110, 50, 400);
            }
            if(60 > p.x && 40 < p.x+50 && (bird.y < p.h || bird.y + bird.h > p.h+110)) bird.y = 500;
            if(p.x === 0) score++;
        });
        document.getElementById('g-score').innerText = score;
    }, 25);
}

socket.on('update_leaderboard', d => {
    document.getElementById('leader-list').innerHTML = d.map(i => `<div>${i.name}: <b>${i.score}</b></div>`).join('');
});