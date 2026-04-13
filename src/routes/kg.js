const express = require('express');
const db      = require('../config/db');
const { kgAdmin } = require('../middleware/auth');
const router  = express.Router();

router.use(kgAdmin);

// 현재 사용자의 kindergarten_id 추출 헬퍼
function getKgId(req) {
  if (req.user.role === 'super') {
    // 슈퍼는 쿼리/바디에서 받음
    return parseInt(req.query.kgId || req.body.kindergarten_id || 0);
  }
  return req.user.kindergarten_id;
}

// ── 대시보드 요약 ─────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  const kgId = getKgId(req);
  const today = new Date().toISOString().slice(0, 10);

  const classrooms  = db.prepare('SELECT COUNT(*) AS c FROM classrooms WHERE kindergarten_id=?').get(kgId).c;
  const students    = db.prepare('SELECT COUNT(*) AS c FROM students s JOIN classrooms c ON c.id=s.classroom_id WHERE c.kindergarten_id=?').get(kgId).c;
  const todayRes    = db.prepare(`SELECT COUNT(*) AS c FROM reservations r JOIN students s ON s.id=r.student_id JOIN classrooms c ON c.id=s.classroom_id WHERE c.kindergarten_id=? AND r.reserve_date=?`).get(kgId, today).c;
  const announced   = db.prepare(`SELECT COUNT(*) AS c FROM reservations r JOIN students s ON s.id=r.student_id JOIN classrooms c ON c.id=s.classroom_id WHERE c.kindergarten_id=? AND r.reserve_date=? AND r.status='announced'`).get(kgId, today).c;

  res.json({ success: true, data: { classrooms, students, todayRes, announced } });
});

// ── 반(교실) ─────────────────────────────────────────────────
router.get('/classrooms', (req, res) => {
  const kgId = getKgId(req);
  const rows = db.prepare(`
    SELECT c.*, COUNT(s.id) AS student_count
    FROM classrooms c LEFT JOIN students s ON s.classroom_id=c.id
    WHERE c.kindergarten_id=? GROUP BY c.id ORDER BY c.id
  `).all(kgId);
  res.json({ success: true, data: rows });
});

router.post('/classrooms', (req, res) => {
  const kgId = getKgId(req);
  const { name, emoji, teacher } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '반 이름을 입력해주세요.' });
  const r = db.prepare('INSERT INTO classrooms (kindergarten_id,name,emoji,teacher) VALUES (?,?,?,?)').run(kgId, name, emoji || '🏫', teacher || '');
  res.json({ success: true, id: r.lastInsertRowid });
});

router.put('/classrooms/:id', (req, res) => {
  const kgId = getKgId(req);
  const { name, emoji, teacher } = req.body;
  const cls = db.prepare('SELECT * FROM classrooms WHERE id=? AND kindergarten_id=?').get(req.params.id, kgId);
  if (!cls) return res.status(404).json({ success: false, message: '반을 찾을 수 없습니다.' });
  db.prepare('UPDATE classrooms SET name=?,emoji=?,teacher=? WHERE id=?').run(name, emoji, teacher, req.params.id);
  res.json({ success: true });
});

router.delete('/classrooms/:id', (req, res) => {
  const kgId = getKgId(req);
  db.prepare('DELETE FROM classrooms WHERE id=? AND kindergarten_id=?').run(req.params.id, kgId);
  res.json({ success: true });
});

// ── 원생 ─────────────────────────────────────────────────────
router.get('/students', (req, res) => {
  const kgId = getKgId(req);
  const clsFilter = req.query.classroom_id ? `AND s.classroom_id=${parseInt(req.query.classroom_id)}` : '';
  const rows = db.prepare(`
    SELECT s.*, c.name AS classroom_name, c.emoji AS classroom_emoji
    FROM students s JOIN classrooms c ON c.id=s.classroom_id
    WHERE c.kindergarten_id=? ${clsFilter}
    ORDER BY c.id, s.name
  `).all(kgId);
  res.json({ success: true, data: rows });
});

router.post('/students', (req, res) => {
  const kgId = getKgId(req);
  const { classroom_id, name, age, emoji } = req.body;
  // 해당 반이 이 유치원 소속인지 검증
  const cls = db.prepare('SELECT id FROM classrooms WHERE id=? AND kindergarten_id=?').get(classroom_id, kgId);
  if (!cls) return res.status(403).json({ success: false, message: '해당 반에 접근 권한이 없습니다.' });
  const r = db.prepare('INSERT INTO students (classroom_id,name,age,emoji) VALUES (?,?,?,?)').run(classroom_id, name, age, emoji || '🧒');
  res.json({ success: true, id: r.lastInsertRowid });
});

router.put('/students/:id', (req, res) => {
  const kgId = getKgId(req);
  const { name, age, emoji, classroom_id } = req.body;
  const stu = db.prepare('SELECT s.id FROM students s JOIN classrooms c ON c.id=s.classroom_id WHERE s.id=? AND c.kindergarten_id=?').get(req.params.id, kgId);
  if (!stu) return res.status(403).json({ success: false, message: '접근 권한이 없습니다.' });
  db.prepare('UPDATE students SET name=?,age=?,emoji=?,classroom_id=? WHERE id=?').run(name, age, emoji, classroom_id, req.params.id);
  res.json({ success: true });
});

router.delete('/students/:id', (req, res) => {
  const kgId = getKgId(req);
  const stu = db.prepare('SELECT s.id FROM students s JOIN classrooms c ON c.id=s.classroom_id WHERE s.id=? AND c.kindergarten_id=?').get(req.params.id, kgId);
  if (!stu) return res.status(403).json({ success: false, message: '접근 권한이 없습니다.' });
  db.prepare('DELETE FROM family_members WHERE student_id=?').run(req.params.id);
  db.prepare('DELETE FROM students WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── 가족 ─────────────────────────────────────────────────────
router.get('/students/:stuId/family', (req, res) => {
  const rows = db.prepare('SELECT * FROM family_members WHERE student_id=? ORDER BY id').all(req.params.stuId);
  res.json({ success: true, data: rows });
});

router.post('/students/:stuId/family', (req, res) => {
  const { name, relation, phone, notify_type } = req.body;
  if (!name || !phone) return res.status(400).json({ success: false, message: '이름과 연락처를 입력해주세요.' });
  const r = db.prepare('INSERT INTO family_members (student_id,name,relation,phone,notify_type) VALUES (?,?,?,?,?)').run(req.params.stuId, name, relation, phone, notify_type || '예약 알림 수신');
  res.json({ success: true, id: r.lastInsertRowid });
});

router.put('/family/:id', (req, res) => {
  const { name, relation, phone, notify_type } = req.body;
  db.prepare('UPDATE family_members SET name=?,relation=?,phone=?,notify_type=? WHERE id=?').run(name, relation, phone, notify_type, req.params.id);
  res.json({ success: true });
});

router.delete('/family/:id', (req, res) => {
  db.prepare('DELETE FROM family_members WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── 예약 ─────────────────────────────────────────────────────
router.get('/reservations', (req, res) => {
  const kgId = getKgId(req);
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT r.*, s.name AS student_name, s.emoji AS student_emoji,
           c.name AS classroom_name, c.emoji AS classroom_emoji
    FROM reservations r
    JOIN students  s ON s.id=r.student_id
    JOIN classrooms c ON c.id=s.classroom_id
    WHERE c.kindergarten_id=? AND r.reserve_date=?
    ORDER BY r.pickup_time
  `).all(kgId, date);
  res.json({ success: true, data: rows });
});

router.put('/reservations/:id/cancel', (req, res) => {
  db.prepare("UPDATE reservations SET status='cancelled' WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

router.post('/reservations/:id/announce', (req, res) => {
  const row = db.prepare(`
    SELECT r.*, s.name AS student_name, c.name AS classroom_name, c.emoji AS classroom_emoji, c.kindergarten_id,
      COALESCE(bs.default_ment,'{반} {이름} 학부모님, 하원 준비해 주세요') AS ment_template
    FROM reservations r
    JOIN students s ON s.id=r.student_id
    JOIN classrooms c ON c.id=s.classroom_id
    LEFT JOIN broadcast_settings bs ON bs.classroom_id=c.id
    WHERE r.id=?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: '예약을 찾을 수 없습니다.' });

  const ment = row.ment_template.replace(/\{이름\}/g, row.student_name).replace(/\{반\}/g, row.classroom_emoji + ' ' + row.classroom_name);
  db.prepare("UPDATE reservations SET status='announced',announced_at=datetime('now','localtime') WHERE id=?").run(row.id);
  db.prepare("INSERT INTO broadcast_logs (kindergarten_id,reservation_id,student_name,classroom_name,ment,type) VALUES (?,?,?,?,?,'manual')")
    .run(row.kindergarten_id, row.id, row.student_name, row.classroom_name, ment);
  res.json({ success: true, ment });
});

// ── 방송 로그 ─────────────────────────────────────────────────
router.get('/broadcast-logs', (req, res) => {
  const kgId = getKgId(req);
  const rows = db.prepare('SELECT * FROM broadcast_logs WHERE kindergarten_id=? ORDER BY id DESC LIMIT 100').all(kgId);
  res.json({ success: true, data: rows });
});

// ── 방송 설정 ─────────────────────────────────────────────────
router.get('/broadcast-settings', (req, res) => {
  const kgId = getKgId(req);
  const classrooms = db.prepare('SELECT * FROM classrooms WHERE kindergarten_id=? ORDER BY id').all(kgId);
  const settings   = db.prepare('SELECT * FROM broadcast_settings WHERE kindergarten_id=?').all(kgId);
  const defaultMent = settings.find(s=>s.classroom_id==null)?.default_ment || '{반} {이름} 학부모님, 하원 준비해 주세요';
  const noticeMins  = settings.find(s=>s.classroom_id==null)?.notice_minutes || 10;
  res.json({ success: true, data: { classrooms, settings, defaultMent, noticeMins } });
});

router.put('/broadcast-settings', (req, res) => {
  const kgId = getKgId(req);
  const { classroom_id, notice_minutes, default_ment } = req.body;
  const existing = db.prepare('SELECT id FROM broadcast_settings WHERE kindergarten_id=? AND (classroom_id IS ? OR classroom_id=?)').get(kgId, classroom_id || null, classroom_id || null);
  if (existing) {
    db.prepare("UPDATE broadcast_settings SET notice_minutes=?,default_ment=?,updated_at=datetime('now','localtime') WHERE id=?").run(notice_minutes, default_ment, existing.id);
  } else {
    db.prepare('INSERT INTO broadcast_settings (kindergarten_id,classroom_id,notice_minutes,default_ment) VALUES (?,?,?,?)').run(kgId, classroom_id || null, notice_minutes, default_ment);
  }
  res.json({ success: true });
});

// 유치원 정보 조회
router.get('/kindergarten', (req, res) => {
  const kgId = getKgId(req);
  const kg = db.prepare('SELECT * FROM kindergartens WHERE id=?').get(kgId);
  if (!kg) return res.json({ success: false, message: '유치원 정보 없음' });
  res.json({ success: true, data: kg });
});

// 유치원 정보 수정
router.put('/kindergarten', (req, res) => {
  const kgId = getKgId(req);
  const { name, director, phone, address } = req.body;
  db.prepare('UPDATE kindergartens SET name=COALESCE(?,name), director=COALESCE(?,director), phone=COALESCE(?,phone), address=COALESCE(?,address) WHERE id=?')
    .run(name||null, director||null, phone||null, address||null, kgId);
  const kg = db.prepare('SELECT * FROM kindergartens WHERE id=?').get(kgId);
  res.json({ success: true, data: kg });
});

module.exports = router;
