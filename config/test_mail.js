const { sendMail } = require('/app/src/publisher');

const targetEmail = process.argv[2];

if (!targetEmail) {
    console.error("Usage: node test_mail.js <email>");
    process.exit(1);
}

console.log(`Sending test email to ${targetEmail}...`);

sendMail(targetEmail, "Ticket System Test", "This is a test notification from the Ticket System publisher.")
    .then(() => {
        console.log("Mail function finished. Check the console for results.");
        process.exit(0);
    })
    .catch(e => {
        console.error("Error running test:", e);
        process.exit(1);
    });
