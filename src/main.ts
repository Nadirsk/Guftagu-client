import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@/assets/styles/main.css'

import App from './App.vue'
import { installPermissions } from '@/lib/permissions'
import router from '@/router'

const app = createApp(App)

app.use(createPinia())
installPermissions(app)
app.use(router)
app.use(ElementPlus)

app.mount('#app')
