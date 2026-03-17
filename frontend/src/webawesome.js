import '@awesome.me/webawesome/dist/styles/themes/default.css';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/button-group/button-group.js';
import '@awesome.me/webawesome/dist/components/input/input.js';
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/checkbox/checkbox.js';
import '@awesome.me/webawesome/dist/components/slider/slider.js';
import '@awesome.me/webawesome/dist/components/switch/switch.js';
import '@awesome.me/webawesome/dist/components/avatar/avatar.js';

import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/select/select.js';
import '@awesome.me/webawesome/dist/components/option/option.js';
import '@awesome.me/webawesome/dist/components/textarea/textarea.js';
import '@awesome.me/webawesome/dist/components/tab-group/tab-group.js';
import '@awesome.me/webawesome/dist/components/tab/tab.js';
import '@awesome.me/webawesome/dist/components/tab-panel/tab-panel.js';
import '@awesome.me/webawesome/dist/components/spinner/spinner.js';
import '@awesome.me/webawesome/dist/components/tag/tag.js';
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/divider/divider.js';
import '@awesome.me/webawesome/dist/components/dialog/dialog.js';
import '@awesome.me/webawesome/dist/components/popover/popover.js';
import '@awesome.me/webawesome/dist/components/popup/popup.js';
import { registerIconLibrary } from '@awesome.me/webawesome/dist/components/icon/library.js';

registerIconLibrary('default', {
    resolver: name => `https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/${name}.svg`
});
