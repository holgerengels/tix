const { getUsers } = require('./auth');

(async () => {
    try {
        console.log('Fetching users...');
        const users = await getUsers();
        const user = users.find(u => u.username === 'holger_engels' || u.username === 'holger.engels'); 
        
        if (user) {
            console.log('User found:', user.username);
            console.log('Groups:', user.groups);
        } else {
            console.log('User holger_engels not found.');
            console.log('All users found:', users.map(u => u.username).join(', '));
        }
    } catch (e) {
        console.error(e);
    }
    process.exit();
})();
