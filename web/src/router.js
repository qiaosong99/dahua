import { createRouter, createWebHashHistory } from 'vue-router';
import Visitor from './views/Visitor.vue';
import Login from './views/Login.vue';
import Admin from './views/Admin.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/visit' },
    { path: '/visit', name: 'visit', component: Visitor },
    { path: '/login', name: 'login', component: Login },
    { path: '/admin', name: 'admin', component: Admin }
  ]
});

export default router;
