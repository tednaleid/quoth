import { mount } from 'svelte';
import PopoutApp from './PopoutApp.svelte';

const pinnedTabId = Number(new URLSearchParams(window.location.search).get('tabId'));

const app = mount(PopoutApp, {
  target: document.getElementById('app')!,
  props: { pinnedTabId },
});

export default app;
