/**
 * useToast composable — toast(), confirm(), prompt() using wa-callout and wa-dialog
 */

let toastStack = null;

function getToastStack() {
  if (!toastStack || !document.body.contains(toastStack)) {
    toastStack = document.createElement('div');
    toastStack.className = 'wa-toast-stack';
    toastStack.style.cssText = [
      'position: fixed',
      'top: 1rem',
      'right: 1rem',
      'z-index: 10000',
      'display: flex',
      'flex-direction: column',
      'gap: 0.5rem',
      'max-width: min(28rem, calc(100vw - 2rem))',
      'pointer-events: none'
    ].join(';');
    document.body.appendChild(toastStack);
  }
  return toastStack;
}

/**
 * Show a floating toast notification using wa-callout
 * @param {string} message
 * @param {'brand'|'primary'|'success'|'neutral'|'warning'|'danger'} variant
 * @param {number} duration - auto-close after ms (0 = manual close only)
 */
export async function toast(message, variant = 'brand', duration = 3000) {
  const mappedVariant = variant === 'primary' ? 'brand' : variant;
  const callout = document.createElement('wa-callout');
  callout.setAttribute('variant', mappedVariant);
  callout.style.cssText = [
    'pointer-events: auto',
    'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15)',
    'background: var(--wa-color-surface-default, #fff)',
    'transition: opacity 0.2s ease, transform 0.2s ease'
  ].join(';');

  callout.innerHTML = `
    <wa-icon slot="icon" name="${getIcon(mappedVariant)}"></wa-icon>
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
      <span>${escapeHtml(message)}</span>
      <wa-button appearance="plain" size="small" class="toast-close" style="margin: -0.25rem -0.5rem -0.25rem 0;">
        <wa-icon name="x-lg"></wa-icon>
      </wa-button>
    </div>
  `;

  const stack = getToastStack();
  stack.appendChild(callout);

  let removed = false;
  const removeToast = () => {
    if (removed) return;
    removed = true;
    callout.style.opacity = '0';
    callout.style.transform = 'translateY(-0.5rem)';
    setTimeout(() => {
      callout.remove();
      if (toastStack && toastStack.childElementCount === 0) {
        toastStack.remove();
        toastStack = null;
      }
    }, 200);
  };

  const closeBtn = callout.querySelector('.toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', removeToast);
  }

  if (duration > 0) {
    setTimeout(removeToast, duration);
  }
}

/** Convenience wrappers */
toast.success = (msg) => toast(msg, 'success');
toast.error = (msg) => toast(msg, 'danger', 5000);
toast.warning = (msg) => toast(msg, 'warning', 4000);
toast.info = (msg) => toast(msg, 'brand');

function getIcon(variant) {
  switch (variant) {
    case 'success': return 'check-circle';
    case 'danger': return 'x-circle';
    case 'warning': return 'exclamation-triangle';
    default: return 'info-circle';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Show a confirmation dialog using wa-dialog
 * @param {string} message
 * @param {string} title
 * @returns {Promise<boolean>}
 */
export function confirm(message, title = 'Bestätigung') {
  return new Promise((resolve) => {
    const dialog = document.createElement('wa-dialog');
    dialog.label = title;

    const p = document.createElement('p');
    p.style.cssText = 'margin:0; line-height:1.5';
    p.textContent = message;
    dialog.appendChild(p);

    const footer = document.createElement('div');
    footer.slot = 'footer';
    footer.style.cssText = 'display:flex; gap:0.5rem; justify-content:flex-end';

    const cancelBtn = document.createElement('wa-button');
    cancelBtn.size = 'small';
    cancelBtn.setAttribute('appearance', 'filled');
    cancelBtn.textContent = 'Abbrechen';

    const confirmBtn = document.createElement('wa-button');
    confirmBtn.size = 'small';
    confirmBtn.setAttribute('variant', 'primary');
    confirmBtn.textContent = 'OK';

    footer.append(cancelBtn, confirmBtn);
    dialog.appendChild(footer);
    document.body.appendChild(dialog);

    const cleanup = (result) => {
      dialog.removeEventListener('wa-after-hide', onHide);
      dialog.remove();
      resolve(result);
    };

    const onHide = () => cleanup(false);
    dialog.addEventListener('wa-after-hide', onHide);

    cancelBtn.addEventListener('click', () => {
      dialog.open = false;
    });
    confirmBtn.addEventListener('click', () => {
      dialog.removeEventListener('wa-after-hide', onHide);
      dialog.open = false;
      dialog.addEventListener('wa-after-hide', () => cleanup(true), { once: true });
    });

    requestAnimationFrame(() => { dialog.open = true; });
  });
}

/**
 * Show a prompt dialog with an input field
 * @param {string} message
 * @param {string} title
 * @param {string} defaultValue
 * @returns {Promise<string|null>}
 */
export function prompt(message, title = 'Eingabe', defaultValue = '') {
  return new Promise((resolve) => {
    const dialog = document.createElement('wa-dialog');
    dialog.label = title;

    const p = document.createElement('p');
    p.style.cssText = 'margin:0 0 1rem; line-height:1.5';
    p.textContent = message;
    dialog.appendChild(p);

    const input = document.createElement('wa-input');
    input.value = defaultValue;
    input.autofocus = true;
    dialog.appendChild(input);

    const footer = document.createElement('div');
    footer.slot = 'footer';
    footer.style.cssText = 'display:flex; gap:0.5rem; justify-content:flex-end';

    const cancelBtn = document.createElement('wa-button');
    cancelBtn.size = 'small';
    cancelBtn.setAttribute('appearance', 'filled');
    cancelBtn.textContent = 'Abbrechen';

    const confirmBtn = document.createElement('wa-button');
    confirmBtn.size = 'small';
    confirmBtn.setAttribute('variant', 'primary');
    confirmBtn.textContent = 'OK';

    footer.append(cancelBtn, confirmBtn);
    dialog.appendChild(footer);
    document.body.appendChild(dialog);

    const cleanup = (result) => {
      dialog.removeEventListener('wa-after-hide', onHide);
      dialog.remove();
      resolve(result);
    };

    const onHide = () => cleanup(null);
    dialog.addEventListener('wa-after-hide', onHide);

    cancelBtn.addEventListener('click', () => {
      dialog.open = false;
    });

    const submit = () => {
      const value = input.value;
      dialog.removeEventListener('wa-after-hide', onHide);
      dialog.open = false;
      dialog.addEventListener('wa-after-hide', () => cleanup(value), { once: true });
    };

    confirmBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    requestAnimationFrame(() => { dialog.open = true; });
  });
}

/**
 * Show a prominent error dialog using wa-dialog
 * @param {string} message
 * @param {string} title
 * @returns {Promise<void>}
 */
const activeErrorMessages = new Set();

export function showErrorDialog(message, title = 'Fehler') {
  if (!message) return Promise.resolve();
  if (activeErrorMessages.has(message)) return Promise.resolve();
  activeErrorMessages.add(message);

  return new Promise((resolve) => {
    const dialog = document.createElement('wa-dialog');
    dialog.label = title;

    const content = document.createElement('div');
    content.style.cssText = 'display:flex; align-items:flex-start; gap:1rem;';
    
    const icon = document.createElement('wa-icon');
    icon.name = 'exclamation-circle';
    icon.style.cssText = 'color: var(--wa-color-danger-50); font-size: 2rem; flex-shrink: 0;';
    content.appendChild(icon);

    const p = document.createElement('p');
    p.style.cssText = 'margin:0; line-height:1.5; color: var(--wa-color-neutral-10); max-width: 400px;';
    p.textContent = message.replace(/^Validation failed:\s*/i, '');
    content.appendChild(p);

    dialog.appendChild(content);

    const footer = document.createElement('div');
    footer.slot = 'footer';
    footer.style.cssText = 'display:flex; justify-content:flex-end';

    const confirmBtn = document.createElement('wa-button');
    confirmBtn.size = 'small';
    confirmBtn.setAttribute('variant', 'primary');
    confirmBtn.textContent = 'Verstanden';

    footer.append(confirmBtn);
    dialog.appendChild(footer);
    document.body.appendChild(dialog);

    const cleanup = () => {
      activeErrorMessages.delete(message);
      dialog.removeEventListener('wa-after-hide', onHide);
      dialog.remove();
      resolve();
    };

    const onHide = () => cleanup();
    dialog.addEventListener('wa-after-hide', onHide);

    confirmBtn.addEventListener('click', () => {
      dialog.open = false;
    });

    requestAnimationFrame(() => { dialog.open = true; });
  });
}
