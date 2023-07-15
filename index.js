require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const express = require('express');
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
// app.use('/public', express.static('public'));
const server = http.createServer(app);
const bodyParser = require('body-parser');
const io = new Server(server);
app.use(express.urlencoded({ extended: true }));
const methodOverride = require('method-override'); // form 태그에서 PUT 요청을 하기 위해...
app.use(methodOverride('_method'));

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');

app.use(bodyParser.json());
app.use(session({ secret: process.env.SESSION_SECRET, resave: true, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
app.set('view engine', 'ejs');

const mariadb = require('mariadb');

const pool = mariadb.createPool({
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_DATABASE,
});

passport.use(
	new LocalStrategy(
		{
			usernameField: 'userId',
			passwordField: 'password',
			session: true,
			passReqToCallback: false,
		},
		function (userId, password, done) {
			console.log(`userId, password 확인 : ${userId}, ${password}`);

			pool.getConnection()
				.then((conn) => {
					conn.query('SELECT * FROM member WHERE userId = ?', [userId])
						.then((result) => {
							// console.log('확인 result', result);
							conn.release();

							if (result.length === 0) return done(null, false, { message: '존재하지 않는 아이디입니다.' });

							const user = result[0];
							// console.log('확인 user', user);

							if (password === user.password) {
								return done(null, user);
							} else {
								return done(null, false, { message: '비밀번호가 올바르지 않습니다.' });
							}
						})
						.catch((err) => {
							conn.release();
							return done(err);
						});
				})
				.catch((err) => {
					return done(err);
				});
		}
	)
);

passport.serializeUser(function (user, done) {
	done(null, user.userId);
});

// 로그인한 유저의 세션 아이디를 바탕으로 개인정보를 DB에서 찾는 역할
passport.deserializeUser(function (userId, done) {
	// id를 사용하여 실제 사용자 객체를 검색
	pool.getConnection()
		.then((conn) => {
			conn.query('SELECT * FROM member WHERE userId = ?', [userId])
				.then((result) => {
					console.log(`[deserializeUser] - result 확인 : ${result}`);
					conn.release();

					if (result.length === 0) return done(null, false);

					const user = result[0];
					return done(null, user);
				})
				.catch((err) => {
					conn.release();
					return done(err);
				});
		})
		.catch((err) => {
			return done(err);
		});
});

// 인증 확인 미들웨어
function isAuthenticated(req, res, next) {
	if (req.isAuthenticated()) {
		return next();
	}
	res.redirect('/login');
}

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

app.get('/login', function (req, res) {
	res.render('login.ejs');
});
app.get('/', function (req, res) {
	res.render('login.ejs');
});

app.get('/index', isAuthenticated, function (req, res) {
	console.log(`req.user 확인 : ${req.user}`);
	res.render('index.ejs', { 사용자: req.user });
});

// 로그인
app.post('/login', passport.authenticate('local', { failureRedirect: '/fail' }), (req, res) => {
	console.log(`[post/login] req 확인: ${req}`);
	console.log('로그인 성공');
	// res.status(200).json({ message: '로그인 성공' });
	res.redirect('/index');
});

server.listen(7000, () => {
	console.log('Server working on port 7000');
	console.log('http://localhost:7000/login');
});

server.on('error', (err) => {
	console.log('Error opening server');
});
