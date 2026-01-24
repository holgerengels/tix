const jwt = require('jsonwebtoken');

const MOCK_USERS = [
    { username: 'admin', password: 'password', groups: ['Admin', 'Schulleitung', 'Stundenplanung'] },
    { username: 'lehrer1', password: 'password', groups: ['Lehrkräfte'] },
    { username: 'lehrer2', password: 'password', groups: ['Lehrkräfte'] },
    { username: 'schulleiter', password: 'password', groups: ['Schulleitung', 'Lehrkräfte'] },
    { username: 'stundenplaner', password: 'password', groups: ['Stundenplanung', 'Lehrkräfte'] },
    { username: 'hausmeister', password: 'password', groups: ['Hausmeister'] },
    { username: 'netzwerker', password: 'password', groups: ['Netzwerkteam', 'Lehrkräfte'] },
];

const SECRET_KEY = 'supersecretkey'; // In prod, use .env

const login = (username, password) => {
    const user = MOCK_USERS.find(u => u.username === username && u.password === password);
    if (user) {
        const token = jwt.sign({ username: user.username, groups: user.groups }, SECRET_KEY, { expiresIn: '8h' });
        return { token, user: { username: user.username, groups: user.groups } };
    }
    return null;
};

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: 'No token provided' });

    jwt.verify(token.split(' ')[1], SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ message: 'Failed to authenticate token' });
        req.user = decoded;
        next();
    });
};

const getUsers = () => MOCK_USERS.map(({ password, ...u }) => u);

module.exports = { login, verifyToken, getUsers };
