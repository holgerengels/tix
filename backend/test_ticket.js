const axios = require('axios');
async function main() {
    try {
        const res = await axios.post('http://localhost:3000/api/login', { username: 'admin', password: 'password' });
        const token = res.data.token;

        const ticketData = {
            type: 'IT-Ticket',
            title: 'Test Timeline from Script',
            description: 'This is a test to verify the timeline generation',
            category: 'Medien',
            location: 'Raum 143 (Computer)'
        };

        const createRes = await axios.post('http://localhost:3000/api/tickets', ticketData, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('Ticket Created:', createRes.data.id);
        await new Promise(r => setTimeout(r, 2000));
        
        const getRes = await axios.get('http://localhost:3000/api/tickets', {
             params: { filter: 'all', id: createRes.data.id },
             headers: { Authorization: `Bearer ${token}` }
        });
        
        const fetched = getRes.data[0];
        console.log('Raumbelegung Block Data:', JSON.stringify(fetched.raumbelegung, null, 2));

    } catch (e) {
        console.error(e.response ? e.response.data : e.message);
    }
}
main();
