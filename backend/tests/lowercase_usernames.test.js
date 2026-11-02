const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { clearDatabase, closeDatabase } = require('./setup');

const User = require('../src/models/user');
const Subscription = require('../src/models/subscription');
const PushSubscription = require('../src/models/pushSubscription');
const Comment = require('../src/models/comment');
const Log = require('../src/models/log');
const Ticket = require('../src/models/ticket');

const connectDB = require('../src/db');
const { login, verifyToken, generateRefreshToken, refreshAccessToken, extendAccessToken } = require('../src/auth');

beforeAll(async () => {
    await connectDB();
    if (mongoose.connection.readyState !== 1) {
        await new Promise(resolve => mongoose.connection.once('connected', resolve));
    }
});

beforeEach(async () => {
    await clearDatabase();
    await User.deleteMany({ username: /testcase/i });
});

afterAll(async () => {
    await closeDatabase();
});

describe('Strict lowercase usernames across Mongo models and JWT tokens', () => {

    describe('JWT Token casing', () => {
        it('should generate lowercase username in JWT on login (mock devmode)', async () => {
            const result = await login('Admin', 'password');
            expect(result).not.toBeNull();
            expect(result.user.username).toBe('admin');

            const decoded = jwt.decode(result.token);
            expect(decoded.username).toBe('admin');
        });

        it('should normalize req.user.username in verifyToken middleware', () => {
            const req = {
                headers: {
                    authorization: `Bearer ${jwt.sign({ username: 'MixedCaseUser' }, 'supersecretkey')}`
                }
            };
            const res = {};
            const next = jest.fn();

            verifyToken(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(req.user.username).toBe('mixedcaseuser');
        });

        it('should preserve lowercase in refresh and extend tokens', async () => {
            const refreshTok = generateRefreshToken('UpPeRcAsE', ['Lehrkräfte']);
            const decodedRef = jwt.decode(refreshTok);
            expect(decodedRef.username).toBe('uppercase');

            const refreshed = await refreshAccessToken(refreshTok);
            expect(refreshed.user.username).toBe('uppercase');
            expect(jwt.decode(refreshed.token).username).toBe('uppercase');

            const extended = extendAccessToken('AnOtHeRuSeR', ['Lehrkräfte']);
            expect(extended.user.username).toBe('anotheruser');
            expect(jwt.decode(extended.token).username).toBe('anotheruser');
        });
    });

    describe('Mongo Schema casing', () => {
        it('User model should lowercase username and substitutedBy', async () => {
            const user = await User.create({
                username: 'TestCaseUser1',
                displayName: 'Test Case',
                substitutedBy: ['TestCaseSub1', 'TESTCASESUB2']
            });
            expect(user.username).toBe('testcaseuser1');
            expect(user.substitutedBy).toEqual(['testcasesub1', 'testcasesub2']);

            const found = await User.findById(user._id).lean();
            expect(found.username).toBe('testcaseuser1');
            expect(found.substitutedBy).toEqual(['testcasesub1', 'testcasesub2']);
        });

        it('Subscription model should lowercase userId', async () => {
            const sub = await Subscription.create({
                userId: 'TestCaseUser_Sub',
                name: 'Test Sub',
                filter: { type: ['IT-Ticket'] }
            });
            expect(sub.userId).toBe('testcaseuser_sub');

            const found = await Subscription.findById(sub._id).lean();
            expect(found.userId).toBe('testcaseuser_sub');
        });

        it('PushSubscription model should lowercase userId', async () => {
            const push = await PushSubscription.create({
                userId: 'TestCaseUser_Push',
                subscription: { endpoint: 'https://example.com/push' }
            });
            expect(push.userId).toBe('testcaseuser_push');

            const found = await PushSubscription.findById(push._id).lean();
            expect(found.userId).toBe('testcaseuser_push');
        });

        it('Ticket model should lowercase creator, assignee, starredBy, and link creator', async () => {
            const ticket = await Ticket.create({
                type: 'IT-Ticket',
                title: 'Case Test Ticket',
                creator: 'CrEaToRuSeR',
                assignee: 'AsSiGnEeUsEr',
                starredBy: ['StArReDuSeR1', 'StArReDuSeR2'],
                links: [{
                    type: 'relates',
                    ticket: 'TKT-100',
                    creator: 'LiNkCrEaToR'
                }]
            });

            expect(ticket.creator).toBe('creatoruser');
            expect(ticket.assignee).toBe('assigneeuser');
            expect(ticket.starredBy).toEqual(['starreduser1', 'starreduser2']);
            expect(ticket.links[0].creator).toBe('linkcreator');

            const found = await Ticket.findById(ticket._id).lean();
            expect(found.creator).toBe('creatoruser');
            expect(found.assignee).toBe('assigneeuser');
            expect(found.starredBy).toEqual(['starreduser1', 'starreduser2']);
            expect(found.links[0].creator).toBe('linkcreator');
        });

        it('Comment model should lowercase creator and mentions', async () => {
            const ticket = await Ticket.create({
                type: 'IT-Ticket',
                title: 'Comment Ticket',
                creator: 'creator'
            });

            const comment = await Comment.create({
                ticket: ticket._id,
                text: 'Hello @MeNtIoNuSeR',
                creator: 'CoMmEnTuSeR',
                mentions: ['MeNtIoNuSeR1', 'MeNtIoNuSeR2']
            });

            expect(comment.creator).toBe('commentuser');
            expect(comment.mentions).toEqual(['mentionuser1', 'mentionuser2']);

            const found = await Comment.findById(comment._id).lean();
            expect(found.creator).toBe('commentuser');
            expect(found.mentions).toEqual(['mentionuser1', 'mentionuser2']);
        });

        it('Log model should lowercase editor', async () => {
            const ticket = await Ticket.create({
                type: 'IT-Ticket',
                title: 'Log Ticket',
                creator: 'creator'
            });

            const log = await Log.create({
                ticket: ticket._id,
                editor: 'EdItOrUsEr',
                action: 'state_changed'
            });

            expect(log.editor).toBe('editoruser');

            const found = await Log.findById(log._id).lean();
            expect(found.editor).toBe('editoruser');
        });
    });
});
