const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json());

let waitingUsers = [];
let onlineCount = 0;
let leaderboard = JSON.parse(fs.readFileSync('scores.json', 'utf8') || '[]');

io.on('connection', (socket) => {
    onlineCount++;
    io.emit('online_update', onlineCount);
    socket.emit('update_leaderboard', leaderboard.filter(u => u.score > 0));

    socket.on('find_partner', (params) => {
        socket.profile = params;
        let partner = waitingUsers.find(user => {
            return (socket.profile.targetGender === 'any' || user.profile.gender === socket.profile.targetGender) &&
                   (socket.profile.targetAge === 'any' || user.profile.age === socket.profile.targetAge) &&
                   user.id !== socket.id;
        });

        if (partner) {
            waitingUsers = waitingUsers.filter(u => u.id !== partner.id);
            const roomName = `room_${socket.id}_${partner.id}`;
            socket.partnerId = partner.id;
            partner.partnerId = socket.id;
            socket.join(roomName);
            partner.join(roomName);
            // Даем команду начать WebRTC соединение
            io.to(socket.id).emit('partner_found', { room: roomName, initiator: true });
            io.to(partner.id).emit('partner_found', { room: roomName, initiator: false });
        } else {
            waitingUsers.push(socket);
        }
    });

    socket.on('webrtc_signal', (data) => {
        if (socket.partnerId) {
            io.to(socket.partnerId).emit('webrtc_signal', data);
        }
    });

    socket.on('message', (data) => socket.to(data.room).emit('message', data.text));

    const disconnectPartner = () => {
        if (socket.partnerId) {
            io.to(socket.partnerId).emit('partner_left');
            const pSocket = io.sockets.sockets.get(socket.partnerId);
            if (pSocket) pSocket.partnerId = null;
            socket.partnerId = null;
        }
        waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
    };

    socket.on('next_partner', disconnectPartner);
    socket.on('disconnect', () => {
        onlineCount--;
        io.emit('online_update', onlineCount);
        disconnectPartner();
    });

    socket.on('save_score', (data) => {
        let idx = leaderboard.findIndex(u => u.name === data.name);
        if (idx !== -1) {
            if (data.score > leaderboard[idx].score) leaderboard[idx].score = data.score;
        } else { leaderboard.push(data); }
        leaderboard.sort((a, b) => b.score - a.score);
        leaderboard = leaderboard.slice(0, 5);
        fs.writeFileSync('scores.json', JSON.stringify(leaderboard));
        io.emit('update_leaderboard', leaderboard);
    });
});

http.listen(3000, () => console.log('BogdanBOG Pro Audio: http://localhost:3000'));