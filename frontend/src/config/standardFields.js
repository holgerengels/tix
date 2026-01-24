export const STANDARD_FIELDS = [
    { name: 'title', type: 'text', label: 'Titel', required: true },
    { name: 'description', type: 'RichText', label: 'Beschreibung', required: false },
    { name: 'assignee', type: 'User', label: 'Zugewiesen an', required: false, groups: ["Lehrkräfte"] }
];
