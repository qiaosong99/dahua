<template>
  <div class="page-wide">
    <div class="row-flex" style="justify-content:space-between;margin-bottom:8px;">
      <div style="font-size:18px;font-weight:700;">访客门禁管理端</div>
      <button class="btn btn-sm btn-outline fit" @click="logout">退出登录</button>
    </div>

    <div class="tabs">
      <button :class="{ active: tab === 'overview' }" @click="tab = 'overview'">概览</button>
      <button :class="{ active: tab === 'records' }" @click="tab = 'records'">访客记录</button>
      <button :class="{ active: tab === 'qrcode' }" @click="openQrTab()">访客二维码</button>
      <button :class="{ active: tab === 'settings' }" @click="tab = 'settings'">维护</button>
    </div>

    <!-- 概览 -->
    <template v-if="tab === 'overview'">
      <div class="stats-grid">
        <div class="stat-card"><div class="num">{{ stats.todayCount }}</div><div class="label">今日访客</div></div>
        <div class="stat-card"><div class="num">{{ stats.weekCount }}</div><div class="label">本周访客</div></div>
        <div class="stat-card"><div class="num">{{ stats.activeCount }}</div><div class="label">当前有效权限</div></div>
        <div class="stat-card"><div class="num">{{ stats.photosCount }}</div><div class="label">现存访客照片</div></div>
      </div>
      <div class="card">
        <div class="row-flex" style="justify-content:space-between;">
          <div>
            <div style="font-weight:600;">门禁机连接状态</div>
            <div class="text-muted mt">
              {{ deviceStatus || (stats.deviceConfigured ? '未测试' : '未配置（请在 server/config.json 填写 device.host）') }}
            </div>
          </div>
          <button class="btn btn-sm fit" :disabled="testing" @click="testDevice">
            {{ testing ? '测试中...' : '测试连接' }}
          </button>
        </div>
      </div>
    </template>

    <!-- 访客记录 -->
    <template v-if="tab === 'records'">
      <div class="card">
        <div class="row-flex" style="flex-wrap:wrap;">
          <input type="date" v-model="filter.start" style="height:38px;border:1px solid var(--border);border-radius:8px;padding:0 8px;" />
          <span class="text-muted fit">至</span>
          <input type="date" v-model="filter.end" style="height:38px;border:1px solid var(--border);border-radius:8px;padding:0 8px;" />
          <input v-model.trim="filter.q" placeholder="姓名/手机号/目的" style="height:38px;border:1px solid var(--border);border-radius:8px;padding:0 8px;min-width:130px;" />
          <button class="btn btn-sm fit" @click="loadReport">查询</button>
          <button class="btn btn-sm btn-outline fit" @click="exportCsv">导出CSV</button>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>姓名</th><th>手机号</th><th>来访目的</th><th>状态</th>
                <th>授权时间</th><th>到期时间</th><th>登记时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!rows.length">
                <td colspan="7" class="center text-muted" style="padding:20px;">暂无记录</td>
              </tr>
              <tr v-for="r in rows" :key="r.id">
                <td>{{ r.name }}</td>
                <td>{{ r.phone }}</td>
                <td>{{ r.purpose }}</td>
                <td><span class="tag" :class="'tag-' + r.status">{{ statusText(r) }}</span></td>
                <td>{{ r.granted_at || '-' }}</td>
                <td>{{ r.expire_at || '-' }}</td>
                <td>{{ r.created_at }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 二维码 -->
    <template v-if="tab === 'qrcode'">
      <div class="card center">
        <div style="font-weight:600;margin-bottom:6px;">访客登记二维码</div>
        <div class="text-muted" style="margin-bottom:12px;">打印后张贴于门口，访客扫码即可登记</div>
        <img v-if="qrUrl" :src="qrUrl" style="width:260px;max-width:80%;" />
        <div class="text-muted mt">{{ visitUrl }}</div>
        <div class="row-flex mt">
          <button class="btn btn-outline" @click="loadQr">刷新二维码</button>
          <a class="btn btn-outline" :href="qrUrl" download="访客登记二维码.png">下载二维码</a>
        </div>
        <div class="text-muted mt" style="font-size:12px;">网络/IP 变化后点此重新生成，二维码会自动指向当前上网 IP</div>
      </div>
    </template>

    <!-- 维护 -->
    <template v-if="tab === 'settings'">
      <div class="card">
        <div style="font-weight:600;margin-bottom:6px;">清理访客照片</div>
        <div class="text-muted" style="margin-bottom:12px;line-height:1.6;">
          删除服务器上保存的全部访客照片文件，访客登记记录（姓名/手机号/来访目的/时间）会完整保留。
          系统每周一凌晨 3:00 会自动执行一次照片清理。
        </div>
        <button class="btn btn-danger" :disabled="clearing" @click="clearPhotos">
          {{ clearing ? '清理中...' : '立即清理全部照片' }}
        </button>
        <div v-if="cleanMsg" class="msg msg-success mt">{{ cleanMsg }}</div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { request, getToken, setToken } from '../api';

const router = useRouter();
const tab = ref('overview');

const stats = reactive({ todayCount: 0, weekCount: 0, activeCount: 0, totalCount: 0, photosCount: 0, deviceConfigured: false });
const deviceStatus = ref('');
const testing = ref(false);
const rows = ref([]);
const filter = reactive({ start: '', end: '', q: '' });
const qrUrl = ref('');
const visitUrl = ref('');
const clearing = ref(false);
const cleanMsg = ref('');

function statusText(r) {
  if (r.status === 'failed') return '下发失败';
  if (r.status === 'expired') return '已到期';
  if (r.device_removed) return '已到期';
  return '权限有效';
}

async function loadStats() {
  try {
    const r = await request('/api/admin/stats');
    Object.assign(stats, r);
  } catch (e) { /* 401 已由 api.js 跳转 */ }
}

async function loadReport() {
  const qs = new URLSearchParams();
  if (filter.start) qs.set('start', filter.start);
  if (filter.end) qs.set('end', filter.end);
  if (filter.q) qs.set('q', filter.q);
  const r = await request('/api/admin/report?' + qs.toString());
  rows.value = r.rows || [];
}

function exportCsv() {
  const qs = new URLSearchParams({ format: 'csv' });
  if (filter.start) qs.set('start', filter.start);
  if (filter.end) qs.set('end', filter.end);
  if (filter.q) qs.set('q', filter.q);
  // 通过 fetch 带 token 下载
  request('/api/admin/report?' + qs.toString()).then(async (res) => {
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `访客报告_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

async function testDevice() {
  testing.value = true;
  deviceStatus.value = '正在测试...';
  try {
    const r = await request('/api/admin/device/test');
    deviceStatus.value = (r.ok ? '✓ ' : '✗ ') + r.message;
  } catch (e) {
    deviceStatus.value = '✗ ' + e.message;
  } finally {
    testing.value = false;
  }
}

async function loadQr() {
  try {
    const token = getToken();
    const res = await fetch('/api/admin/qrcode?t=' + Date.now(), { headers: { Authorization: 'Bearer ' + token } });
    if (res.ok) {
      const blob = await res.blob();
      qrUrl.value = URL.createObjectURL(blob);
    }
    const u = await request('/api/admin/qrcode/url');
    visitUrl.value = u.url || '';
  } catch (_) { /* ignore */ }
}

// 切到二维码页时自动重新加载，保证二维码始终指向当前 IP
function openQrTab() {
  tab.value = 'qrcode';
  loadQr();
}

async function clearPhotos() {
  if (!confirm('确认清理全部访客照片？\n（仅删除照片文件，访客登记记录会保留）')) return;
  clearing.value = true;
  cleanMsg.value = '';
  try {
    const r = await request('/api/admin/photos/clear', { method: 'POST', body: {} });
    cleanMsg.value = r.message || '清理完成';
    loadStats();
  } catch (e) {
    cleanMsg.value = '清理失败：' + e.message;
  } finally {
    clearing.value = false;
  }
}

function logout() {
  setToken('');
  router.replace('/login');
}

onMounted(async () => {
  if (!getToken()) { router.replace('/login'); return; }
  await loadStats();
  await loadReport();
  loadQr();
});
</script>
