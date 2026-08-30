/* Birleştirme motorunun senaryo testleri. `node merge-test.js` ile çalışır. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function pick(name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('bulunamadi: ' + name);
    let depth = 0, j = i;
    for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (!depth) { j++; break; } }
    }
    return src.slice(i, j);
}

const TTL = src.match(/const TOMBSTONE_TTL_DAYS = (\d+);/)[1];
eval(`var TOMBSTONE_TTL_DAYS = ${TTL};`
    + pick('mergeDayMap') + pick('mergeMaxMap') + pick('mergeTombstones')
    + pick('mergeCollection') + pick('mergeStats') + pick('mergeData'));

let pass = 0, fail = 0;
function check(name, condition, detail) {
    if (condition) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

const T = Date.now();
const base = (words, stats, tombstones) => ({
    folders: [{ id: 'all', name: 'Tüm kelimeler', updatedAt: 1 }, { id: 'f1', name: 'kitap', updatedAt: T - 9000 }],
    words: words || [],
    stats: Object.assign({ updatedAt: T - 9000, xpByDay: {}, prodByDay: {}, flipsByDay: {}, ratings: {}, challengeRecords: {}, testHistory: [] }, stats || {}),
    tombstones: Object.assign({ words: {}, folders: {} }, tombstones || {})
});
const word = (id, over) => Object.assign({ id, folderId: 'f1', eng: id, turk: id, updatedAt: T - 5000 }, over || {});

console.log('\n— Kayıt birleştirme —');
{
    const A = base([word('w1', { eng: 'eski', updatedAt: T - 5000 })]);
    const B = base([word('w1', { eng: 'yeni', updatedAt: T - 1000 })]);
    check('yeni düzenleme kazanır', mergeData(A, B).words[0].eng === 'yeni');
    check('ters yönde de aynı sonuç', mergeData(B, A).words[0].eng === 'yeni');
}
{
    const A = base([word('w1'), word('w2')]);
    const B = base([word('w1'), word('w3')]);
    const m = mergeData(A, B);
    check('iki taraftaki yeni kelimeler birleşir', m.words.length === 3, 'gelen: ' + m.words.length);
}
{
    const A = base([], null, { words: { w1: T - 1000 } });
    const B = base([word('w1', { updatedAt: T - 5000 })]);
    check('silinen kelime geri dirilmez', mergeData(A, B).words.length === 0);
    check('ters yönde de dirilmez', mergeData(B, A).words.length === 0);
}
{
    const A = base([], null, { words: { w1: T - 5000 } });
    const B = base([word('w1', { eng: 'sonra düzenlendi', updatedAt: T - 1000 })]);
    const m = mergeData(A, B);
    check('silmeden SONRA düzenlenen kayıt yaşar', m.words.length === 1 && m.words[0].eng === 'sonra düzenlendi');
}
{
    const eski = T - 200 * 86400000;
    const A = base([], null, { words: { w9: eski } });
    check('süresi dolmuş silinme izi atılır', Object.keys(mergeData(A, base([])).tombstones.words).length === 0);
}
{
    const A = base([word('w1')]);
    const B = base([word('w1')]);
    B.folders = [];
    check('"all" klasörü hiçbir koşulda kaybolmaz', mergeData(A, B).folders.some(f => f.id === 'all'));
}

console.log('\n— İstatistik birleştirme —');
{
    const A = base([], { xpByDay: { '2026-08-29': 40, '2026-08-30': 10 }, xp: 50, prodTotal: 6 });
    const B = base([], { xpByDay: { '2026-08-30': 25, '2026-08-31': 15 }, xp: 40, prodTotal: 4 });
    const s = mergeData(A, B).stats;
    check('gün başına büyük olan alınır', s.xpByDay['2026-08-30'] === 25, JSON.stringify(s.xpByDay));
    check('eksik günler taşınır', s.xpByDay['2026-08-29'] === 40 && s.xpByDay['2026-08-31'] === 15);
    check('toplam XP günlerden türetilir', s.xp === 80, 'xp=' + s.xp);
    check('aynı oturum iki kez sayılmaz', mergeData(A, A).stats.xp === 50);
    check('tek yönlü sayaçta büyük olan', s.prodTotal === 6);
}
{
    const A = base([], { streak: 5, lastProductionDate: '2026-08-30' });
    const B = base([], { streak: 2, lastProductionDate: '2026-08-28' });
    check('seriyi son üretim tarihi belirler', mergeData(A, B).stats.streak === 5);
    check('ters yönde de aynı', mergeData(B, A).stats.streak === 5);
}
{
    const A = base([], { streak: 3, lastProductionDate: '2026-08-30' });
    const B = base([], { streak: 4, lastProductionDate: '2026-08-30' });
    check('tarih eşitse büyük seri', mergeData(A, B).stats.streak === 4);
}
{
    const A = base([], { goal: 10, updatedAt: T - 5000 });
    const B = base([], { goal: 30, updatedAt: T - 100 });
    check('tercih yeni taraftan gelir', mergeData(A, B).stats.goal === 30);
}
{
    const A = base([], { challengeRecords: { quiz: 140, flash: 20 } });
    const B = base([], { challengeRecords: { quiz: 90, matching: 55 } });
    const r = mergeData(A, B).stats.challengeRecords;
    check('rekorlarda büyük olan', r.quiz === 140 && r.flash === 20 && r.matching === 55);
}
{
    const h = { date: '30.08.2026 12:00', score: 80, total: 10, correct: 8 };
    const A = base([], { testHistory: [h] });
    const B = base([], { testHistory: [h, { date: '29.08.2026 10:00', score: 60 }] });
    check('test geçmişi tekrarlanmaz', mergeData(A, B).stats.testHistory.length === 2);
}

console.log('\n— Güvenlik —');
{
    const A = base([word('w1'), word('w2')]);
    check('bozuk uzak veri yereli silmez', mergeData(A, null).words.length === 2);
    check('yarım uzak veri yereli silmez', mergeData(A, { words: [] }).words.length === 2);
    const before = JSON.stringify(A);
    mergeData(A, base([word('w3')]));
    check('birleştirme girdiyi değiştirmez', JSON.stringify(A) === before);
}
{
    // İki cihaz aynı kelimeyi farklı zamanlarda çalıştı: ilerleme kaybolmamalı
    const A = base([word('w1', { produced: 3, xp: 0, updatedAt: T - 3000, srsLevel: 2 })]);
    const B = base([word('w1', { produced: 5, updatedAt: T - 500, srsLevel: 4 })]);
    const m = mergeData(A, B);
    check('daha yeni çalışma hâli kazanır', m.words[0].produced === 5 && m.words[0].srsLevel === 4);
}

console.log(`\n${pass} geçti, ${fail} kaldı\n`);
process.exit(fail ? 1 : 0);
