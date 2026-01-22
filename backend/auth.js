const jwt = require('jsonwebtoken');

const MOCK_USERS = [
    { username: 'admin', password: 'password', groups: ['Admin'] },
    { username: 'lehrer1', password: 'password', groups: ['Lehrkräfte'] },
    { username: 'lehrer2', password: 'password', groups: ['Lehrkräfte'] },
    { username: 'schulleitung', password: 'password', groups: ['Schulleitung'] },
    { username: 'sekretariat', password: 'password', groups: ['Vertretungsplan'] }
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

module.exports = { login, verifyToken };
