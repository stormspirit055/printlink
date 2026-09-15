import { createApp } from 'vue';
import { VueQueryPlugin } from '@tanstack/vue-query';
import App from './App.vue';
import { router } from './router';
import { queryClient } from './app/query-client';
import * as ui from './components/ui';
import './index.css';

const app = createApp(App).use(router).use(VueQueryPlugin, { queryClient });
for (const [name, component] of Object.entries(ui)) app.component(name, component);
app.mount('#root');
