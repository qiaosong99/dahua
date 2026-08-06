<template>
  <div class="page">
    <div class="page-title">访客登记</div>
    <div class="page-sub">请填写信息并拍摄人脸照片，完成门禁授权</div>

    <!-- 结果页 -->
    <div v-if="submitted" class="card center">
      <div :style="{ fontSize: '46px', marginTop: '10px' }">{{ result.ok ? '✅' : '❌' }}</div>
      <div style="font-size:16px;font-weight:600;margin:12px 0;">{{ result.message }}</div>
      <div v-if="result.ok" class="text-muted">请前往门禁刷脸进入，权限 24 小时内有效</div>
      <button class="btn mt" @click="reset">再登记一位访客</button>
    </div>

    <!-- 登记表单 -->
    <template v-else>
      <div v-if="error" class="msg msg-error">{{ error }}</div>

      <div class="card">
        <div class="field">
          <label><span class="req">*</span>姓名</label>
          <input v-model.trim="form.name" type="text" maxlength="20" placeholder="请输入真实姓名" />
        </div>
        <div class="field">
          <label><span class="req">*</span>手机号</label>
          <input v-model.trim="form.phone" type="tel" maxlength="11" placeholder="请输入11位手机号" />
        </div>
        <div class="field">
          <label><span class="req">*</span>来访目的</label>
          <select v-model="form.purpose">
            <option value="" disabled>请选择来访目的</option>
            <option v-for="p in purposes" :key="p" :value="p">{{ p }}</option>
            <option value="__other__">其他（请填写）</option>
          </select>
        </div>
        <div class="field" v-if="form.purpose === '__other__'">
          <input v-model.trim="form.otherPurpose" type="text" maxlength="50" placeholder="请填写来访目的" />
        </div>
      </div>

      <!-- 拍照区域 -->
      <div class="card">
        <label style="font-weight:600;display:block;margin-bottom:10px;">
          <span class="req">*</span>人脸照片（请使用正面免冠照）
        </label>

        <!-- 已拍照预览 -->
        <div v-if="photoData" class="center">
          <img :src="photoData" style="width:200px;border-radius:10px;border:1px solid var(--border);" />
          <div class="row-flex mt">
            <button class="btn btn-outline" @click="retake">重新拍摄</button>
          </div>
        </div>

        <!-- 摄像头实时取景 -->
        <div v-else-if="cameraOn" class="camera-box">
          <video ref="videoRef" autoplay playsinline muted></video>
          <div class="face-guide"></div>
          <div class="camera-bar">
            <button class="shutter" :disabled="capturing" @click="capture"></button>
          </div>
          <div class="text-muted center" style="margin-top:8px;">请将面部对准取景框，光线充足</div>
        </div>

        <!-- 未开启摄像头 -->
        <div v-else class="center">
          <button class="btn btn-outline" @click="startCamera">打开前置摄像头拍摄</button>
          <div v-if="cameraError" class="msg msg-error" style="margin-top:10px;text-align:left;">{{ cameraError }}</div>
          <div class="text-muted mt">
            无法打开摄像头？
            <label style="color:var(--primary);cursor:pointer;">
              点此直接拍照/选择照片
              <input type="file" accept="image/*" capture="user" style="display:none;" @change="onFilePick" />
            </label>
          </div>
        </div>
      </div>

      <button class="btn" :disabled="submitting" @click="submit">
        {{ submitting ? '正在提交并授权...' : '提交登记' }}
      </button>
      <div class="text-muted center mt">提交后人脸权限有效期为 24 小时</div>
    </template>
  </div>
</template>

<script setup>
import { reactive, ref, onBeforeUnmount } from 'vue';
import { request } from '../api';

const purposes = ['面试', '商务洽谈', '会议', '快递/外卖', '施工/维修', '参观访问'];

const form = reactive({ name: '', phone: '', purpose: '', otherPurpose: '' });
const error = ref('');
const submitting = ref(false);
const submitted = ref(false);
const result = reactive({ ok: false, message: '' });

// ------- 拍照相关 -------
const cameraOn = ref(false);
const capturing = ref(false);
const photoData = ref('');
const videoRef = ref(null);
const cameraError = ref('');
let stream = null;

async function startCamera() {
  error.value = '';
  cameraError.value = '';
  // 非安全上下文（证书未受信任）时浏览器会禁用摄像头 API，给出明确指引
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraError.value =
      '当前环境无法调用摄像头：浏览器不信任本系统的自签名证书。请在手机设置中安装并信任证书后重新访问，或点击下方“直接拍照/选择照片”。';
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
      audio: false
    });
    cameraOn.value = true;
    await new Promise((r) => setTimeout(r, 100));
    if (videoRef.value) {
      videoRef.value.srcObject = stream;
      await videoRef.value.play().catch(() => {});
    }
  } catch (e) {
    let tip;
    if (e.name === 'NotAllowedError') tip = '相机权限被拒绝，请在浏览器设置中允许相机权限';
    else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') tip = '未检测到可用的前置摄像头';
    else tip = e.message || e.name || '权限被拒绝';
    cameraError.value = '无法打开摄像头：' + tip + '。也可点击下方“直接拍照/选择照片”完成登记。';
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  cameraOn.value = false;
}

/** 将 canvas 压缩为 ≤200KB 的 JPEG dataURL（大华设备要求 10KB~200KB） */
function compressToJpeg(canvas) {
  let quality = 0.9;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 200 * 1024 * 1.37 && quality > 0.3) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return dataUrl;
}

function capture() {
  if (!videoRef.value || capturing.value) return;
  capturing.value = true;
  try {
    const video = videoRef.value;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) { error.value = '摄像头尚未就绪，请稍候再试'; return; }
    // 居中裁剪为竖向 3:4
    const targetRatio = 3 / 4;
    let sw = vw, sh = vh, sx = 0, sy = 0;
    if (vw / vh > targetRatio) {
      sw = vh * targetRatio; sx = (vw - sw) / 2;
    } else {
      sh = vw / targetRatio; sy = (vh - sh) / 2;
    }
    const canvas = document.createElement('canvas');
    const outW = 480, outH = 640;
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
    photoData.value = compressToJpeg(canvas);
    stopCamera();
  } finally {
    capturing.value = false;
  }
}

function retake() {
  photoData.value = '';
  startCamera();
}

function onFilePick(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const outW = 480, outH = 640;
      canvas.width = outW; canvas.height = outH;
      const ctx = canvas.getContext('2d');
      // cover 裁剪
      const scale = Math.max(outW / img.width, outH / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
      photoData.value = compressToJpeg(canvas);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

// ------- 提交 -------
async function submit() {
  error.value = '';
  if (!form.name) { error.value = '请填写姓名'; return; }
  if (!/^1[3-9]\d{9}$/.test(form.phone)) { error.value = '请填写正确的11位手机号'; return; }
  const purpose = form.purpose === '__other__' ? form.otherPurpose : form.purpose;
  if (!purpose) { error.value = '请选择或填写来访目的'; return; }
  if (!photoData.value) { error.value = '请先拍摄人脸照片'; return; }

  submitting.value = true;
  try {
    const r = await request('/api/visitor/register', {
      method: 'POST',
      body: { name: form.name, phone: form.phone, purpose, photo: photoData.value }
    });
    result.ok = !!r.ok;
    result.message = r.message || (r.ok ? '登记成功' : '登记失败');
    submitted.value = true;
  } catch (e) {
    error.value = '提交失败：' + e.message;
  } finally {
    submitting.value = false;
  }
}

function reset() {
  form.name = ''; form.phone = ''; form.purpose = ''; form.otherPurpose = '';
  photoData.value = '';
  submitted.value = false;
  result.ok = false; result.message = '';
  error.value = '';
}

onBeforeUnmount(() => stopCamera());
</script>

<style scoped>
.camera-box {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
}

.camera-box video {
  width: 100%;
  display: block;
  transform: scaleX(-1);
}

.face-guide {
  position: absolute;
  left: 50%;
  top: 42%;
  width: 58%;
  aspect-ratio: 3 / 4;
  transform: translate(-50%, -50%);
  border: 2px dashed rgba(255, 255, 255, 0.85);
  border-radius: 50%;
  pointer-events: none;
}

.camera-bar {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}

.shutter {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  border: 4px solid #fff;
  background: rgba(255, 255, 255, 0.25);
  cursor: pointer;
}

.shutter:active { background: rgba(255, 255, 255, 0.6); }
</style>
