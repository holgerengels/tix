/**
 * useToast composable — toast(), confirm(), prompt() using wa-alert and wa-dialog
 */

/**
 * Show a toast notification using wa-alert's toast() method
 * @param {string} message
 * @param {'primary'|'success'|'neutral'|'warning'|'danger'} variant
 * @param {number} duration - auto-close after ms (0 = manual close only)
 */
export function toast(message, variant = 'primary', duration = 3000) {
  const alert = Object.assign(document.createElement('wa-alert'), {
    variant,
    closable: true,
    duration,
    innerHTML: `<wa-icon slot="icon" name="${getIcon(variant)}"></wa-icon>${escapeHtml(message)}`
  });
  document.body.appendChild(alert);
  alert.toast();
}

/** Convenience wrappers */
toast.success = (msg) => toast(msg, 'success');
toast.error = (msg) => toast(msg, 'danger', 5000);
toast.warning = (msg) => toast(msg, 'warning', 4000);
toast.info = (msg) => toast(msg, 'primary');

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
