# Tix Frontend: Workflow and Form System

The Tix system uses JSON schemas to define ticket types, states, actions, and UI layouts, backed by a high-performance Vue 3 form engine.

## 1. Schema Definitions: Workflow and Grid Layout

The `grid` array enables multi-column alignment without sacrificing field order on narrow screens. Using dots (`.`) as spacers ensures that related fields line up horizontally in desktop mode.

```json
"grid": [
    "title title title type",
    "date date numberOfPersons .",
    "room room . .",
]
```

### Row Visibility and Static Tokens
The `DynamicForm` logic automatically hides rows that consist only of:
1.  **Invisible functional components** (determined via evaluated visibility expressions).
2.  **Static placement tokens** (`.`).

## 2. Dynamic Visibility and Expression Logic

Visibility and behavior (like `readonly`) of fields and validations are controlled by template expressions (e.g., `{{ticket.field === true}}`).

### Conditional Readonly Logic
While `visible` expressions remove a field entirely from the layout (and potentially the grid row, if it was the only field), the `readonly` property can also be dynamic. This is used to "lock" a field based on another field's state without removing it from the user's view.

**Pattern**:
```json
{
    "name": "breakfastTime",
    "label": "Bereitstellung bis:",
    "type": "Time",
    "readonly": "{{ticket.breakfast === false}}"
}
```
This ensures the field remains in the grid but is uneditable until the "breakfast" checkbox is checked.

### Reactivity Pattern: Progressive Discovery
Visibility expressions allow fields to be dynamically revealed as users fill out the form. 

### Implementation Insight: Native Proxy Access
The frontend uses a `with(ticket) { ... }` block inside a sandboxed `eval` context to evaluate these expressions. This ensures that the JavaScript engine's variable lookup hits the Vue proxy's `get` trap directly.

This allows Vue to track dependencies on properties that are **initially undefined**. By accessing the proxy, Vue registers the dependency, ensuring that the first time a property is set, the field visibility is correctly updated.

```javascript
const func = new Function('ticket', 'helpers', `
    with(helpers) {
        with(ticket) {
            return ${expr};
        }
    }
`);
```

### Graceful Expression Fallbacks
The template evaluation engine (`evaluation.js`) must prioritize stability. If an expression (whether boolean or string-replacement) fails due to a `SyntaxError` or runtime exception, the evaluator **must catch the error and return the original template string** (e.g., `{{ ticket.invalid && syntax !! }}`).

**Rationale**:
- Prevents breaking field visibility or form logic when schemas contain temporary errors.
- Returning `false` or `undefined` by default can lead to buggy UI states that are hard to debug.
- Preserving the original token allows for easier identification of the failing expression in the final output or console.

### Sibling Dependencies: The `:context` Prop
Some complex fields (like the `Termin` field) require access to the values of other fields (e.g., `date`) to fetch related data (like room availability).

The `DynamicForm` maintains this by passing the entire `modelValue` (the ticket object proxy) down as a `context` prop to every `FormField`. This allows child components to watch sibling properties.

```html
<FormField 
  :field="field"
  :context="modelValue"
  :modelValue="modelValue[field.name]"
/>
```

**Architectural Lesson**: Rely on native Vue reactivity rather than manual `JSON.stringify` caching or object cloning to force re-renders.

## 3. High-Performance Form Engine

### Stable Prop Watchers
To prevent redundant API re-fetches (e.g., LDAP users) when parent components re-render, child components should avoid watching the entire `field` object. Instead, they should watch specific derived properties or primitive keys.

**Correct Pattern:**
```javascript
const userGroupsKey = computed(() => (props.field.groups || []).join(','));

watch(userGroupsKey, () => {
    if (props.field.type === 'User') {
        fetchUsers();
    }
}, { immediate: true });
```
This ensures logic is only called if the actual requirements change, ignoring object reference changes that happen when expressions are re-evaluated.

### Hierarchical State Naming
Workflow states follow a `category.state` pattern (e.g., `offen.neu`, `offen.genehmigt`, `geschlossen.ok`). Actions are mapped to specific states and restricted to user groups.

## 4. Reusable Component Patterns

### 4.1. Select Multiple (Data Consolidation)
For forms with many related boolean flags (e.g., a list of food/drinks), avoid creating individual boolean fields (`bfKaffee`, `bfWasser`, etc.). This bloats the schema and complicates the grid layout.

**Better Pattern**: Use a `Select` field with `multiple: true`.
- **JSON Configuration**:
  ```json
  {
      "name": "bfDrinksAndFood",
      "label": "Getränke und Speisen",
      "type": "Select",
      "multiple": true,
      "options": ["Kaffee", "Wasser", "Brezeln", "Obst"]
  }
  ```
- **Architectural Safeguard**: Always provide an empty array `[]` as a fallback for multiple selections instead of an empty string `''`. This prevents downstream logic from crashing when it expects `.length` or `.some()` on the field value.
- **Benefits**:
    - **Clean Grid**: Occupies one cell instead of ten.
    - **Schema Simplicity**: One key in the document stores all selections.
    - **Extensibility**: Adding new options doesn't require schema or UI changes.
