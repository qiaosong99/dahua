const fs = require('fs');
const path = require('path');
const { db } = require('../db');

const PHOTOS_DIR = path.join(__dirname, '..', 'photos');

/**
 * 清理全部访客照片文件（只删照片，保留访客记录）
 * @returns 清理的照片数量
 */
function clearPhotos() {
  const rows = db.prepare(
    "SELECT id, photo_path FROM visitors WHERE photo_path IS NOT NULL AND photo_path != ''"
  ).all();
  let count = 0;
  for (const r of rows) {
    try {
      const file = path.isAbsolute(r.photo_path)
        ? r.photo_path
        : path.join(PHOTOS_DIR, r.photo_path);
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        count++;
      }
    } catch (e) {
      console.error('[photoCleaner] 删除照片失败:', r.photo_path, e.message);
    }
  }
  db.prepare(
    "UPDATE visitors SET photo_path = NULL, face_removed = 1 WHERE photo_path IS NOT NULL AND photo_path != ''"
  ).run();
  return count;
}

/** 当前照片文件数量 */
function photoCount() {
  try {
    return fs.readdirSync(PHOTOS_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f)).length;
  } catch (_) {
    return 0;
  }
}

module.exports = { PHOTOS_DIR, clearPhotos, photoCount };
