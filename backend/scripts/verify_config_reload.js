const axios = require('axios');
const API_URL = 'http://localhost:3000/api';

async function checkConfig() {
    try {
        const tokenRes = await axios.post(`${API_URL}/login`, { username: 'lehrer1', password: 'password' });
        const token = tokenRes.data.token;

        const configRes = await axios.get(`${API_URL}/config`, { headers: { Authorization: `Bearer ${token}` } });
        const abwesenheit = configRes.data['Abwesenheit'];

        if (abwesenheit && abwesenheit.states && abwesenheit.states.some(s => s.label === 'Genehmigt' && s.color === 'yellow')) {
            console.log('[PASS] Config updated successfully: "Genehmigt" label found.');
        } else {
            console.log('[FAIL] Config NOT updated. "Genehmigt" label missing or old config served.');
            console.log('States found:', abwesenheit ? abwesenheit.states : 'None');
        }
    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkConfig();
