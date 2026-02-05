const ldap = require('ldapjs');
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, '../../config/settings.json');
console.log(`Reading settings from: ${settingsPath}`);

if (!fs.existsSync(settingsPath)) {
    console.error('Settings file not found!');
    process.exit(1);
}

const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

if (!settings.server || !settings.server.ldap) {
    console.error('No LDAP configuration found in settings.json');
    process.exit(1);
}

const ldapConfig = settings.server.ldap;

console.log('Testing LDAP Bind...');
console.log(`URL: ${ldapConfig.url}`);
console.log(`BindDN: ${ldapConfig.binddn}`);

const client = ldap.createClient({
    url: ldapConfig.url,
    timeout: 5000,
    connectTimeout: 5000
});

client.on('error', (err) => {
    console.error('LDAP Client Error:', err.message);
    process.exit(1);
});

client.on('connectError', (err) => {
    console.error('LDAP Connect Error:', err.message);
    process.exit(1);
});

client.bind(ldapConfig.binddn, ldapConfig.bindpw, (err) => {
    if (err) {
        console.error('Bind FAILED:', err);
        client.unbind();
        process.exit(1);
    } else {
        console.log('Bind SUCCESSFUL!');
        client.unbind();
        process.exit(0);
    }
});
