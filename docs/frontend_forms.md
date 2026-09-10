# Tix Frontend: Workflow and Form System

The Tix system uses JSON schemas to define ticket types, states, actions, and UI layouts, backed by a high-performance Vue 3 form engine.

---

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
1. **Invisible functional components** (determined via evaluated visibility expressions).
2. **Static placement tokens** (`.`).

---

## 2. Dynamic Visibility and Expression Logic

Visibility, default values, and behavior (like `readonly`) of fields and validations are controlled by template expressions (e.g., `{{ticket.field === true}}`).

### 2.1 Conditional Readonly Logic
While `visible` expressions remove a field entirely from the layout (and potentially the grid row, if it was the only field), the `readonly` property can also be dynamic. This is used to "lock" a field based on another field's state without removing it from the user's view.

```json
{
    "name": "breakfastTime",
    "label": "Bereitstellung bis:",
    "type": "Time",
    "readonly": "{{ticket.breakfast === false}}"
}
```
This ensures the field remains in the grid but is uneditable until the "breakfast" checkbox is checked.

---

### 2.2 Reactivity Pattern: Native Proxy Access
The frontend uses a `with(helpers) { with(ticket) { ... } }` block inside a sandboxed `Function` context to evaluate expressions. This ensures that the JavaScript engine's variable lookup hits the Vue proxy's `get` trap directly.

```javascript
const func = new Function('ticket', 'helpers', `
    with(helpers) {
        with(ticket) {
            return ${expr};
        }
    }
`);
```

This allows Vue to track dependencies on properties that are **initially undefined**. By accessing the proxy, Vue registers the dependency, ensuring that the first time a property is set, field visibility and computed values are reactively updated.

---

### 2.3 Form Autofill: `computeFills()` (`default` vs. `computed`)

The `computeFills(fields, context)` utility powers automated form derivation:

```javascript
export function computeFills(fields, context) {
    if (!fields) return { defaults: {}, computeds: {} };

    const defaults = {};
    const computeds = {};
    for (const field of fields) {
        const isComputed = !!field.computed;
        const expr = field.computed || field.default;
        if (expr !== undefined && expr !== null) {
            try {
                const value = typeof expr === 'string' ? evaluateTemplate(expr, context) : expr;
                if (value !== undefined && value !== null && value !== '') {
                    if (isComputed) {
                        computeds[field.name] = value;
                    } else {
                        defaults[field.name] = value;
                    }
                }
            } catch (e) {
                console.warn(`Failed to evaluate ${isComputed ? 'computed' : 'default'} for field ${field.name}:`, e);
            }
        }
    }
    return { defaults, computeds };
}
```

* **`defaults` Rule**: Only applied when the target field is currently empty (`undefined`, `null`, `""`, or contains an unevaluated template string). If the user enters a custom value, the default does not overwrite it.
* **`computeds` Rule**: Always applied on field updates, strictly overwriting any existing value.

---

### 2.4 Graceful Expression Fallbacks
The template evaluation engine (`evaluation.js`) prioritizes stability. If an expression fails due to a `SyntaxError` or runtime exception, the evaluator catches the error and returns the original template string (e.g., `{{ ticket.invalid && syntax !! }}`).

**Rationale**:
* Prevents crashing field visibility or form logic when schemas contain temporary errors.
* Preserving the original token allows for easier identification of the failing expression in console logs.

---

### 2.5 Sibling Dependencies: The `:context` Prop
Some complex fields (like the `Termin` field or `ObjectArrayEditor`) require access to the values of sibling fields (e.g., `date`) to fetch related data (like room availability).

The `DynamicForm` maintains this by passing the entire `modelValue` (the ticket object proxy) down as a `context` prop to every `FormField`:

```html
<FormField 
  :field="field"
  :context="modelValue"
  :modelValue="modelValue[field.name]"
/>
```

---

## 3. High-Performance Form Engine

### Stable Prop Watchers
To prevent redundant API re-fetches (e.g., LDAP users) when parent components re-render, child components avoid watching the entire `field` object. Instead, they watch specific derived properties or primitive keys:

```javascript
const userGroupsKey = computed(() => (props.field.groups || []).join(','));

watch(userGroupsKey, () => {
    if (props.field.type === 'User') {
        fetchUsers();
    }
}, { immediate: true });
```

---

## 4. Reusable Component Patterns

### 4.1 Select Multiple (Data Consolidation)
For forms with many related boolean flags (e.g., a list of food/drinks), avoid creating individual boolean fields (`bfKaffee`, `bfWasser`, etc.).

**Better Pattern**: Use a `Select` field with `multiple: true`.
```json
{
    "name": "bfDrinksAndFood",
    "label": "Getränke und Speisen",
    "type": "Select",
    "multiple": true,
    "options": ["Kaffee", "Wasser", "Brezeln", "Obst"]
}
```
* Always provide an empty array `[]` as fallback for multiple selections instead of `''`.

---

### 4.2 `ObjectArrayEditor` (Repeating Table Data)

`ObjectArrayEditor.vue` renders an editable table for repeating structured items (such as conference attendees):

* **Skeleton Row**: The editor automatically appends a light-weight "skeleton" row at the bottom if `fixedLength` is not active. When a user interacts with the skeleton row, it converts into a real row and a new skeleton is generated.
* **Row-Level `computeFills`**: When editing a sub-field (e.g. choosing a `name` from the user picker), `computeFills()` is executed against the row's fields, allowing sibling fields (such as `email: "{{ lookupUserEmail(name) }}"`) to autofill dynamically.
* **Template Safety**: `buildDefaultRow()` filters out dynamic expressions (`{{ ... }}`) so template strings are not written verbatim into empty skeleton rows.
* **Dynamic Constraints**:
  * `fixedLength`: (boolean or expression) disables adding and deleting rows (e.g. `{{ ticket.state !== 'offen.neu' }}`).
  * `fixedOrder`: (boolean or expression) disables row dragging and reordering.
