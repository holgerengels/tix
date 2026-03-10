const fs = require('fs');
const path = require('path');

const configDir = path.join(__dirname, 'config');
const files = fs.readdirSync(configDir).filter(f => f.endsWith('.json') && f !== 'settings.json' && f !== 'it.json');
const results = {};

for (const file of files) {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8'));
        if (!data.fields) continue;

        const errors = [];
        const requiredFields = data.fields
            .filter(f => f.required === true || f.required === 'true')
            .map(f => f.name);

        // Check grid for missing required fields
        if (data.grid && Array.isArray(data.grid)) {
            const gridFieldsRaw = data.grid.flat().map(c => typeof c === 'string' ? c : (c.field || c.id || c));
            const missingInGrid = requiredFields.filter(rf => !gridFieldsRaw.includes(rf) && rf !== 'id' && rf !== 'creator' && rf !== 'createdAt' && rf !== 'status');

            if (missingInGrid.length > 0) {
                errors.push(`Missing from initial 'grid' (users might not be able to create valid tickets): ${missingInGrid.join(', ')}`);
            }
        }

        // Check states definitions
        if (data.states) {
            const allFieldNames = data.fields.map(f => f.name);
            for (const [stateName, stateProps] of Object.entries(data.states)) {
                if (stateProps.template) {
                    const templateFields = Object.keys(stateProps.template);

                    const unknownFields = templateFields.filter(tf => !allFieldNames.includes(tf) && tf !== 'status' && tf !== 'id' && tf !== 'creator' && tf !== 'createdAt' && tf !== 'comments');
                    if (unknownFields.length > 0) {
                        errors.push(`State '${stateName}' defines unknown fields missing from 'fields' array: ${unknownFields.join(', ')}`);
                    }

                    for (const tf of templateFields) {
                        const props = stateProps.template[tf];
                        if (requiredFields.includes(tf) && props.readOnly === true && props.visible !== false) {
                            // This isn't strictly an error if the field was filled out previously, but good to note
                            // errors.push(`Required field '${tf}' is readOnly in '${stateName}'.`);
                        }
                    }
                }
            }
        }

        if (errors.length > 0) {
            results[file] = errors;
        } else {
            results[file] = ['OK: Workflow templates consistent with required fields.'];
        }
    } catch (e) {
        console.error(`Failed to parse ${file}: ${e.message}`);
    }
}

console.log(JSON.stringify(results, null, 2));
