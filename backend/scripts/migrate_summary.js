/**
 * Migration: Compute and set `summary` field for all existing tickets.
 * 
 * Usage:  node scripts/migrate_summary.js
 * 
 * This reads the workflow templates from config/ and applies them
 * to each ticket to populate the `summary` field for fulltext search.
 */

const mongoose = require('mongoose');
const connectDB = require('../src/db');
const Ticket = require('../src/models/ticket');
const workflowEngine = require('../src/workflow');
const { evaluateTemplate } = require('../src/validation');

function computeSummary(ticketData, wf) {
    if (!wf || !wf.template) return '';
    try {
        const data = typeof ticketData.toObject === 'function' ? ticketData.toObject() : ticketData;
        const result = evaluateTemplate(wf.template, data);
        return typeof result === 'string' ? result.trim() : String(result || '').trim();
    } catch (e) {
        return '';
    }
}

async function migrate() {
    await connectDB();

    const tickets = await Ticket.find({});
    console.log(`Found ${tickets.length} tickets to migrate.`);

    let updated = 0;
    let skipped = 0;
    let noTemplate = 0;

    for (const ticket of tickets) {
        const wf = workflowEngine.getWorkflowForType(ticket.type);
        if (!wf || !wf.template) {
            noTemplate++;
            continue;
        }

        const summary = computeSummary(ticket, wf);
        if (summary === (ticket.summary || '')) {
            skipped++;
            continue;
        }

        await Ticket.updateOne({ _id: ticket._id }, { $set: { summary } });
        updated++;
    }

    console.log(`\nMigration complete:`);
    console.log(`  Updated:     ${updated}`);
    console.log(`  Skipped:     ${skipped} (summary unchanged)`);
    console.log(`  No template: ${noTemplate}`);
    console.log(`  Total:       ${tickets.length}`);

    await mongoose.disconnect();
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
