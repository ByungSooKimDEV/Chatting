const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const path = require('path');
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);

const bodyParser = require('body-parser');
const mariadb = require('mariadb');
require('dotenv').config();

const pool = mariadb.createPool({
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_DATABASE,
});

app.use(bodyParser.json());

// 회원 목록 조회
app.get('/users', (req, res) => {
	pool.getConnection()
		.then((conn) => {
			conn.query('SELECT * FROM member')
				.then((rows) => {
					res.json(rows);
					console.log(rows);
					conn.release();
				})
				.catch((err) => {
					conn.release();
					res.status(500).json({ error: err });
				});
		})
		.catch((err) => {
			res.status(500).json({ error: err });
		});
});

// 회원 추가
app.post('/users', (req, res) => {
	const { userId, alias } = req.body;
	const userIcon = '/kakaoimg/kakaoicon.png';
	pool.getConnection()
		.then((conn) => {
			conn.query('INSERT INTO member ( userId, alias, userIcon) VALUES (?, ?, ?)', [userId, alias, userIcon])
				.then(() => {
					res.sendStatus(201);
					conn.release();
				})
				.catch((err) => {
					conn.release();
					res.status(500).json({ error: err });
				});
		})
		.catch((err) => {
			res.status(500).json({ error: err });
		});
});

// 로그인
app.post('/user/login', (req, res) => {
	const { userId, password } = req.body;
	pool.getConnection()
		.then((conn) => {
			conn.query('select * from member WHERE userId = ? and password =?', [userId, password])
				.then((result) => {
					res.status(201).json(result);
					console.log('확인', result);
					conn.release();
				})
				.catch((err) => {
					conn.release();
					res.status(500).json({ error: err });
				});
		})
		.catch((err) => {
			res.status(500).json({ error: err });
		});
});

// 회원 수정
app.put('/users/:memberCode', (req, res) => {
	const { memberCode } = req.params;
	const { userId, alias } = req.body;
	pool.getConnection()
		.then((conn) => {
			conn.query('UPDATE users SET userId = ?, alias = ? WHERE memberCode = ?', [userId, alias, memberCode])
				.then(() => {
					res.sendStatus(200);
					conn.release();
				})
				.catch((err) => {
					conn.release();
					res.status(500).json({ error: err });
				});
		})
		.catch((err) => {
			res.status(500).json({ error: err });
		});
});

// 회원 삭제
app.delete('/users/:memberCode', (req, res) => {
	const { memberCode } = req.params;
	pool.getConnection()
		.then((conn) => {
			conn.query('DELETE FROM users WHERE memberCode = ?', [memberCode])
				.then(() => {
					res.sendStatus(200);
					conn.release();
				})
				.catch((err) => {
					conn.release();
					res.status(500).json({ error: err });
				});
		})
		.catch((err) => {
			res.status(500).json({ error: err });
		});
});

io.on('connection', async (socket) => {
	socket.emit('message', { msg: `Welcome ${socket.id}` });
	console.log('connection>>', socket.id, socket.handshake.query);

	// join room
	socket.on('join', (joinedRoomId, newRoomId) => {
		// console.log('join 1 >>', newRoomId);
		if (joinedRoomId) socket.leave(joinedRoomId);
		socket.join(newRoomId);
		// console.log('join 2 >>', newRoomId);
		socket.emit('message', { msg: `Join success ${newRoomId}` });
	});

	socket.on('message', (message) => {
		console.log('message>>', message);
		socket.to(message.room).emit('message', { room: message.room, msg: message.msg });
	});

	// socket.on('rooms', function (fn) {
	// 	if (fn) fn(Object.keys(socket.rooms));
	// });

	socket.on('message-for-one', (socketId, msg) => {
		socket.to(socketId).emit('message', { msg: msg });
	});

	socket.on('disconnecting', function () {
		console.log('disconnecting>>', socket.id, Object.keys(socket.rooms));
	});

	socket.on('disconnect', () => {
		console.log('disconnect>>', socket.id, Object.keys(socket.rooms));
		// leave room
		// room.leaveRoom();
	});
});

server.listen(7000, () => {
	console.log('Server working on port 7000');
});

server.on('error', (err) => {
	console.log('Error opening server');
});
