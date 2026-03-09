const fs = require('fs');
const path = require('path');

const configDir = path.join(__dirname);
const files = fs.readdirSync(configDir).filter(f => f.endsWith('.json') && f !== 'settings.json' && f !== 'default.json' && f !== 'vapid.json');

const report = [];

files.forEach(file => {
  const data = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8'));
  const type = data.type;
  
  if (!type) return;

  const access = data.access || [];
  const groupsByPerm = {};
  
  // 1. Group Consistency Check
  access.forEach(a => groupsByPerm[a.name] = a.groups || []);
  
  const creatorCanRead = (groupsByPerm['read'] && groupsByPerm['read'].includes('@creator'));
  const createGroups = groupsByPerm['create'] || [];
  
  let issues = [];
  
  if (createGroups.length > 0 && !creatorCanRead) {
    issues.push(`Ticket-Ersteller (@creator) fehlt in den 'read' Berechtigungen.`);
  }

  // Check if someone can comment without reading
  const commentGroups = groupsByPerm['comment'] || [];
  commentGroups.forEach(g => {
     if (g !== '@creator' && g !== '@assignee' && !(groupsByPerm['read'] || []).includes(g)) {
         issues.push(`Gruppe '${g}' darf kommentieren, aber nicht lesen.`);
     }
  });

  // Check if someone can edit without reading
  const editGroups = groupsByPerm['edit'] || [];
  editGroups.forEach(g => {
     if (g !== '@creator' && g !== '@assignee' && !(groupsByPerm['read'] || []).includes(g)) {
         issues.push(`Gruppe '${g}' darf bearbeiten, aber nicht lesen.`);
     }
  });


  // 2. Auto-Approval Bot Check
  // Find states with 'genehmigen' action
  let hasGenehmigen = false;
  let genehmigenGroups = [];
  
  if (data.workflow) {
    data.workflow.forEach(stateBlock => {
      if (stateBlock.actions) {
        stateBlock.actions.forEach(action => {
          if (action.name.toLowerCase() === 'genehmigen') {
            hasGenehmigen = true;
            action.groups.forEach(g => { if(!genehmigenGroups.includes(g)) genehmigenGroups.push(g) });
          }
        });
      }
    });
  }

  if (hasGenehmigen) {
     // Check if creators intersect with approvers
     const overlap = createGroups.filter(g => genehmigenGroups.includes(g));
     
     if (overlap.length > 0) {
        // Find if there is an auto-approve bot in 'offen.neu' state
        const bots = data.bots || [];
        const hasBot = bots.some(b => 
           b.states && b.states.includes('offen.neu') && 
           (b.script.includes('genehmigen') || b.name.includes('genehmigen'))
        );

        if (!hasBot) {
           issues.push(`Workflow hat Genehmigungsschritt, und Ersteller-Gruppen (${overlap.join(', ')}) können auch genehmigen. Es fehlt jedoch ein Auto-Genehmigungs-Bot ('automatisch_genehmigen').`);
        }
     }
  }

  if (issues.length > 0) {
    report.push({
       file,
       type,
       issues
    });
  }
});

console.log(JSON.stringify(report, null, 2));
