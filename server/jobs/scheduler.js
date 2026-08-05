/**
 * 定时任务：
 * 1. 每 60 秒检查到期访客，回收设备上的临时人脸权限（有效期默认 24 小时）
 * 2. 每周固定时间（默认周一 03:00）自动清理访客照片（只删照片，保留记录）
 */
const { db, getMeta, setMeta } = require('../db');
const dahua = require('../dahuaService');
const { clearPhotos } = require('../utils/photoCleaner');
const { loadConfig } = require('../utils/configLoader');

let runningRevoke = false;

/** 回收已过期的设备人脸权限 */
async function revokeExpired() {
  if (runningRevoke) return;
  runningRevoke = true;
  try {
    const rows = db.prepare(`
      SELECT id, device_user_id FROM visitors
      WHERE status = 'active' AND device_removed = 0
        AND expire_at IS NOT NULL
        AND expire_at <= datetime('now','localtime')
    `).all();

    for (const r of rows) {
      if (!r.device_user_id) {
        db.prepare("UPDATE visitors SET device_removed = 1, status = 'expired' WHERE id = ?").run(r.id);
        continue;
      }
      try {
        const result = await dahua.removeFaceUser(r.device_user_id);
        if (result.ok) {
          db.prepare("UPDATE visitors SET device_removed = 1, status = 'expired' WHERE id = ?").run(r.id);
          console.log(`[scheduler] 已回收过期访客权限: ${r.device_user_id}`);
        } else {
          console.error(`[scheduler] 回收失败: ${r.device_user_id} ${result.message}`);
        }
      } catch (e) {
        // 设备未配置或不可达时不标记，等待下次重试
        console.error(`[scheduler] 回收异常: ${r.device_user_id} ${e.message}`);
      }
    }
  } finally {
    runningRevoke = false;
  }
}

/** 判断是否需要执行每周照片清理 */
function shouldWeeklyClean(now) {
  const cfg = loadConfig();
  const targetDay = cfg.policy.weeklyCleanDay ?? 1; // 1 = 周一
  const targetHour = cfg.policy.weeklyCleanHour ?? 3;
  const isoDay = now.getDay() === 0 ? 7 : now.getDay();
  if (isoDay !== targetDay || now.getHours() < targetHour) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function weeklyClean() {
  const now = new Date();
  const dateKey = shouldWeeklyClean(now);
  if (!dateKey) return;
  const last = getMeta('last_weekly_clean');
  if (last === dateKey) return;
  try {
    const count = clearPhotos();
    setMeta('last_weekly_clean', dateKey);
    console.log(`[scheduler] 每周自动清理完成，共删除 ${count} 张访客照片（记录已保留）`);
  } catch (e) {
    console.error('[scheduler] 每周清理失败:', e.message);
  }
}

function start() {
  // 启动时补做一次过期回收与周清理检查
  revokeExpired().catch(() => {});
  weeklyClean();
  setInterval(() => {
    revokeExpired().catch(() => {});
    weeklyClean();
  }, 60 * 1000);
  console.log('[scheduler] 定时任务已启动（过期权限回收 / 每周照片清理）');
}

module.exports = { start, revokeExpired, weeklyClean };
