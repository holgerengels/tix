const { getUsers } = require('../auth');

(async () => {
    try {
        const users = await getUsers();
        // Case-insensitive find
        const user = users.find(u => u.username.toLowerCase() === 'holger_engels');
        if (user) {
            console.log(`User: ${user.username}`);
            console.log(`Groups: ${JSON.stringify(user.groups)}`);
            const isTeacher = user.groups.includes('Lehrkräfte');
            console.log(`Is in Lehrkräfte? ${isTeacher}`);
        } else {
            console.log('User not found');
        }
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
