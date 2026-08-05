<template>
  <div class="page">
    <div class="page-title">管理端登录</div>
    <div class="page-sub">请输入管理员密码</div>
    <div class="card">
      <div v-if="error" class="msg msg-error">{{ error }}</div>
      <div class="field">
        <label>管理员密码</label>
        <input v-model="password" type="password" placeholder="请输入管理员密码" @keyup.enter="login" />
      </div>
      <button class="btn" :disabled="loading" @click="login">
        {{ loading ? '登录中...' : '登 录' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { request, setToken } from '../api';

const router = useRouter();
const password = ref('');
const error = ref('');
const loading = ref(false);

async function login() {
  error.value = '';
  if (!password.value) { error.value = '请输入密码'; return; }
  loading.value = true;
  try {
    const r = await request('/api/admin/login', { method: 'POST', body: { password: password.value } });
    if (r.ok && r.token) {
      setToken(r.token);
      router.replace('/admin');
    } else {
      error.value = r.message || '登录失败';
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
