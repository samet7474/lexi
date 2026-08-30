/* =========================================================================
   Lexi — Kelime Çalışma Alanı
   Tek sayfalık, sunucusuz kelime öğrenme uygulaması.

   Bölümler:
     1. Sabitler ve durum
     2. Yardımcılar (DOM, karıştırma, tarih, bildirim)
     3. Depolama: okuma / kaydetme / otomatik anlık görüntü
     4. Veri tabloları (cümle ve kelime bilgisi sözlükleri)
     5. Şema göçü (migration)
     6. Render: pano, klasörler, kelimeler, sözlük, istatistik
     7. Çalış: günlük akış, boşluk doldurma, SRS
     8. Test (tanıma kontrolü)
     9. Challenge modları
    10. İçe & dışa aktarma (JSON, CSV, Anki)
    11. Senkron: cihazlar arası birleştirme
    12. Senkron: Supabase bağlantısı
    13. Olay bağlama, klavye kısayolları, başlangıç
   ========================================================================= */
'use strict';

/* ---------------------------------------------------------------- 1. Sabitler */

const LEGACY_KEY = 'lexi-vocabulary-v1';            // kullanıcı katmanından önceki tek veri
const LEGACY_RECOVERY_KEY = 'lexi-vocabulary-recovery-v1';
const SESSION_KEY = 'lexi-session-v1';             // bu cihazda kim açık
const USERS_KEY = 'lexi-users-v1';                 // bu cihazda bilinen kullanıcılar

const storageKey = name => `lexi-user-${name}`;
const recoveryKey = name => `lexi-user-${name}-recovery`;
const snapshotKey = name => `lexi-user-${name}-snapshots`;

const SCHEMA_VERSION = 6;
const PAGE_SIZE = 40;
const SNAPSHOT_LIMIT = 6;
const SNAPSHOT_MIN_GAP_MS = 5 * 60 * 1000;
const HARD_THRESHOLD = 6.5;          // cardDifficulty >= bu ise "zorlandığım"
const DEFAULT_FOLDER_NAME = 'Genel';
const CHALLENGE_MODES = { flash:'Hızlı hatırlama', quiz:'Anlamını seç', english:'İngilizcesini seç', infinite:'Sonsuz mod', matching:'Eşleştirme', falling:'Düşen kelimeler' };

const TOMBSTONE_TTL_DAYS = 120;      // Silinme izleri sonsuza kadar taşınmaz.

const EMPTY_DATA = () => ({ folders:[{ id:'all', name:'Tüm kelimeler' }], words:[], tombstones:{ words:{}, folders:{} } });

/* ---------------------------------------------------------------- 2. Yardımcılar */

const $ = id => document.getElementById(id);

function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

/** Fisher–Yates: `sort(() => Math.random() - .5)` yanlı ve yavaştır. */
function shuffle(list) {
    const items = [...list];
    for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

/** Listeden `count` adet rastgele öğe — tamamını karıştırmadan. */
function sampleFrom(list, count) {
    if (list.length <= count) return shuffle(list);
    const picked = new Set();
    const result = [];
    let guard = 0;
    while (result.length < count && guard < count * 20) {
        const index = Math.floor(Math.random() * list.length);
        guard += 1;
        if (picked.has(index)) continue;
        picked.add(index);
        result.push(list[index]);
    }
    return result;
}

/** Yerel saate göre YYYY-MM-DD. (toISOString UTC verir; TR'de gece 00-03 arası yanlış güne yazardı.) */
function dayKey(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function todayKey() { return dayKey(); }

function daysBetween(fromKey, toKey) {
    const from = new Date(`${fromKey}T00:00:00`);
    const to = new Date(`${toKey}T00:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return Infinity;
    return Math.round((to - from) / 86400000);
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/**
 * Bir kaydın "en son ne zaman değişti" damgasını günceller.
 * Cihazlar arası birleştirmenin tamamı bu damgaya dayanıyor: bir alanı elle
 * değiştirip `touch` çağırmayı unutmak, o değişikliğin senkronda sessizce
 * kaybolması demek.
 */
function touch(item, at = Date.now()) {
    if (item) item.updatedAt = at;
    return item;
}

function ensureTombstones() {
    if (!data.tombstones || typeof data.tombstones !== 'object') data.tombstones = {};
    if (!data.tombstones.words) data.tombstones.words = {};
    if (!data.tombstones.folders) data.tombstones.folders = {};
    return data.tombstones;
}

/**
 * Silinen kaydın izini bırakır. İz olmazsa, silmediğin cihazdan gelen kopya
 * bir sonraki birleştirmede kaydı geri diriltir.
 */
function markDeleted(kind, id, at = Date.now()) {
    ensureTombstones()[kind][id] = at;
}

function toast(message, tone = '') {
    const host = $('toastHost');
    if (!host) return;
    const node = document.createElement('div');
    node.className = `toast ${tone}`.trim();
    node.textContent = message;
    host.appendChild(node);
    setTimeout(() => node.remove(), 3600);
}

function debounce(fn, wait) {
    let timer = null;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}

/** Bir olayın form alanı içinde olup olmadığı — klavye kısayollarını bastırmak için. */
function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/* ---------------------------------------------------------------- 3. Depolama */

function readStoredData(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        return value && Array.isArray(value.words) && Array.isArray(value.folders) ? value : null;
    } catch (error) {
        return null;
    }
}

function readJSON(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        return value && typeof value === 'object' ? value : fallback;
    } catch (error) {
        return fallback;
    }
}

/** Kullanıcı adı bir anahtar; boşluk ve büyük/küçük harf farkı ayrı kişi yaratmasın. */
function normalizeUserName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 24);
}
function userSlug(name) {
    return normalizeUserName(name).toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, '-');
}

/**
 * PIN **güvenlik değil**, eşiktir: kazara ya da şaka olsun diye başkasının verisini
 * silmeyi zorlaştırır. Dört haneli bir sayı zaten denenerek bulunabilir; burada
 * amaç sırrı saklamak değil, yanlışlıkla yazmayı engellemek.
 * (SubtleCrypto bilerek kullanılmadı: `file://` üzerinde tanımsız oluyor.)
 */
function pinHash(pin) {
    let hash = 0x811c9dc5;
    for (const char of String(pin || '')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
}

function knownUsers() { return readJSON(USERS_KEY, {}) || {}; }

function rememberUser(name, pin) {
    const users = knownUsers();
    const slug = userSlug(name);
    users[slug] = { name: normalizeUserName(name), pin: pinHash(pin), at: Date.now() };
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

let activeUser = '';                                // slug
let activeUserName = '';                            // görünen ad
let lastSnapshotAt = 0;
let quotaWarned = false;

/** Kullanıcının verisini okur; ana kopya bozuksa kurtarma kopyasına düşer. */
function loadUserData(slug) {
    const primary = readStoredData(storageKey(slug));
    const recovery = readStoredData(recoveryKey(slug));
    if (primary && (!recovery || primary.words.length >= recovery.words.length)) return primary;
    return recovery || EMPTY_DATA();
}

let data = EMPTY_DATA();

function writeKey(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        // Kota dolmuş olabilir: önce eski anlık görüntüleri at, sonra tekrar dene.
        try {
            localStorage.removeItem(snapshotKey(activeUser));
            localStorage.setItem(key, value);
            if (!quotaWarned) { toast('Depolama doldu, eski otomatik yedekler silindi.', 'warn'); quotaWarned = true; }
            return true;
        } catch (retryError) {
            if (!quotaWarned) { toast('Kaydedilemedi — tarayıcı depolaması dolu. Yedeğini dışa aktar.', 'warn'); quotaWarned = true; }
            return false;
        }
    }
}

function readSnapshots() {
    if (!activeUser) return [];
    try {
        const list = JSON.parse(localStorage.getItem(snapshotKey(activeUser)) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (error) {
        return [];
    }
}

function pushSnapshot(serialized) {
    const now = Date.now();
    if (now - lastSnapshotAt < SNAPSHOT_MIN_GAP_MS) return;
    lastSnapshotAt = now;
    const snapshots = readSnapshots();
    snapshots.unshift({ at: now, words: data.words.length, payload: serialized });
    writeKey(snapshotKey(activeUser), JSON.stringify(snapshots.slice(0, SNAPSHOT_LIMIT)));
    if (isTabActive('stats')) renderBackupList();
}

/**
 * Kaydetme. Eskiden her kart çevirmede iki kez tüm kelime dizisi taranıp
 * JSON iki kez üretiliyordu; artık yazma işi tek sefere indirgenip ertelendi.
 */
let savePending = false;

function flushSave() {
    if (!savePending) return;
    // Kullanıcı seçilmeden yazma: yanlış kişinin verisinin üstüne yazmaktan iyidir.
    if (!activeUser) { savePending = false; return; }
    savePending = false;
    const serialized = JSON.stringify(data);
    if (!writeKey(storageKey(activeUser), serialized)) return;
    if (data.words.length > 0) writeKey(recoveryKey(activeUser), serialized);
    pushSnapshot(serialized);
}

const scheduleFlush = debounce(flushSave, 400);

function save() {
    savePending = true;
    scheduleFlush();
    if (typeof syncAfterSave === 'function') syncAfterSave();
}

/** Sekme kapanırken bekleyen yazmayı garantiye al. */
function saveNow() {
    savePending = true;
    flushSave();
}


/* ---------------------------------------------------------------- 3b. Kullanıcı kapısı */

/**
 * Bu cihazda hangi kullanıcının açık olduğunu yönetir.
 * Veri kullanıcı başına ayrı anahtarda durur; kullanıcı değiştirmek veriyi
 * silmez, sadece hangi kopyanın yükleneceğini değiştirir.
 */
function localUserList() {
    return Object.entries(knownUsers())
        .map(([slug, info]) => ({
            slug,
            name: info?.name || slug,
            words: (readStoredData(storageKey(slug))?.words || []).length,
            at: Number(info?.at) || 0
        }))
        .sort((a, b) => b.at - a.at);
}

/** Kullanıcı katmanından önceki tek veri; sahiplenilmezse olduğu yerde durur. */
function legacyData() {
    const legacy = readStoredData(LEGACY_KEY) || readStoredData(LEGACY_RECOVERY_KEY);
    return legacy && legacy.words.length ? legacy : null;
}

function renderUserGate() {
    const users = localUserList();
    const legacy = legacyData();
    $('gateUsers').innerHTML = users.length
        ? users.map(user =>
            `<button type="button" class="gate-user" data-slug="${escapeHTML(user.slug)}">`
            + `<strong>${escapeHTML(user.name)}</strong><span>${user.words} kelime</span></button>`
        ).join('')
        : '';
    $('gateUsersWrap').classList.toggle('hidden', !users.length);
    $('gateLegacy').classList.toggle('hidden', !legacy || users.length > 0);
    if (legacy && !users.length) {
        $('gateLegacyText').textContent =
            `Bu cihazda ${legacy.words.length} kelimelik bir veri var. Bir ad yazarsan o veri sana bağlanır.`;
    }
    $('gateError').textContent = '';
}

async function showRemoteUsers() {
    const remote = await fetchRemoteUsers();
    if (!remote.length || !$('userGate') || $('userGate').classList.contains('hidden')) return;
    const local = new Set(localUserList().map(user => user.slug));
    const extra = remote.filter(row => !local.has(row.slug));
    if (!extra.length) return;
    $('gateUsersWrap').classList.remove('hidden');
    $('gateUsers').insertAdjacentHTML('beforeend', extra.map(row =>
        `<button type="button" class="gate-user" data-slug="${escapeHTML(row.slug)}" data-name="${escapeHTML(row.name || row.slug)}">`
        + `<strong>${escapeHTML(row.name || row.slug)}</strong><span>başka cihazda</span></button>`
    ).join(''));
}

function openUserGate() {
    renderUserGate();
    showRemoteUsers();
    $('userGate').classList.remove('hidden');
    $('gateName').value = '';
    $('gatePin').value = '';
    $('gateName').focus();
}

/**
 * Kullanıcıyı açar. Yeni kullanıcıysa cihazda kayıtlı olmayan veriyle başlar;
 * eskiden gelen tek veri varsa ve henüz kimse sahiplenmediyse ona devredilir.
 */
function enterUser(name, pin) {
    const clean = normalizeUserName(name);
    const slug = userSlug(clean);
    if (!clean || !slug) { $('gateError').textContent = 'Bir kullanıcı adı yaz.'; return false; }
    if (!/^\d{4}$/.test(String(pin))) { $('gateError').textContent = 'PIN dört rakam olmalı.'; return false; }

    const users = knownUsers();
    const existing = users[slug];
    if (existing && existing.pin && existing.pin !== pinHash(pin)) {
        $('gateError').textContent = 'PIN yanlış.';
        return false;
    }

    // İlk kullanıcı, kullanıcı katmanından önceki veriyi devralır.
    if (!existing && !localStorage.getItem(storageKey(slug))) {
        const legacy = !Object.keys(users).length ? legacyData() : null;
        if (legacy) writeKey(storageKey(slug), JSON.stringify(legacy));
    }

    rememberUser(clean, pin);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: slug }));
    activeUser = slug;
    activeUserName = clean;
    startSession();
    return true;
}

function switchUser() {
    flushSave();
    localStorage.removeItem(SESSION_KEY);
    activeUser = '';
    activeUserName = '';
    data = EMPTY_DATA();
    openUserGate();
}

/* ---------------------------------------------------------------- 4. Veri tablolari */

const wordLearningDetails = {
    'just as':['similarly, in the same way','just as I expected','just (adv) / justice (n)'], 'fade':['dim, disappear','fade away','fade (v/n) / faded (adj)'], 'briefly':['shortly, quickly','speak briefly','brief (adj) / briefly (adv)'], 'collapse':['fall down, breakdown','collapse under pressure','collapse (v/n) / collapsed (adj)'],
    'demonstrate':['show, prove','demonstrate a skill','demonstrate (v) / demonstration (n)'], 'attract':['draw, appeal to','attract attention','attract (v) / attractive (adj) / attraction (n)'], 'announce':['declare, report','announce the results','announce (v) / announcement (n)'], 'appeal':['request, attraction','appeal to voters','appeal (v/n) / appealing (adj)'],
    'overestimated':['overrated, misjudged','overestimate the cost','estimate (v/n) / overestimate (v) / estimation (n)'], 'desire':['wish, want','desire for success','desire (v/n) / desirable (adj)'], 'further':['additional, more','further information','further (adj/adv) / furthermore (adv)'], 'enormous':['huge, massive','enormous pressure','enormous (adj) / enormously (adv)'],
    'engaging':['interesting, appealing','engaging story','engage (v) / engaging (adj) / engagement (n)'], 'appealing':['attractive, inviting','appealing idea','appeal (v/n) / appealing (adj)'], 'exceptional':['extraordinary, outstanding','exceptional talent','exception (n) / exceptional (adj)'], 'consider':['think about, regard','consider an option','consider (v) / consideration (n) / considerate (adj)'],
    'i̇nnovative':['creative, original','innovative solution','innovate (v) / innovation (n) / innovative (adj)'], 'innovative':['creative, original','innovative solution','innovate (v) / innovation (n) / innovative (adj)'], 'executive':['manager, director','executive decision','execute (v) / executive (n/adj) / execution (n)'], 'brought':['carried, delivered','bring something back','bring (v) / brought (past)'],
    'situation':['condition, circumstance','difficult situation','situate (v) / situation (n)'], 'declare':['announce, state','declare an intention','declare (v) / declaration (n)'], 'bankruptcy':['insolvency, failure','declare bankruptcy','bankrupt (adj/v/n) / bankruptcy (n)'], 'spectacular':['amazing, impressive','spectacular view','spectacle (n) / spectacular (adj)'],
    'ambition':['goal, aspiration','achieve an ambition','ambition (n) / ambitious (adj)'], 'unsettling':['disturbing, worrying','unsettling feeling','unsettle (v) / unsettling (adj)'], 'ruin':['destroy, wreck','ruin a plan','ruin (v/n) / ruined (adj)'], 'stylish':['fashionable, smart','stylish clothes','style (n/v) / stylish (adj)'],
    'quite':['rather, fairly','quite difficult','quite (adv)'], 'unclear':['vague, confusing','unclear instructions','clear (adj/v) / unclear (adj) / clearly (adv)'], 'pretend':['act, make believe','pretend to be','pretend (v) / pretence (n)'], 'court':['tribunal, law court','go to court','court (n/v) / courtroom (n)'],
    'across':['over, through','across the street','across (prep/adv)'], 'moreover':['besides, furthermore','moreover, it is useful','moreover (adv)'], 'confident':['sure, self-assured','feel confident','confidence (n) / confident (adj) / confidently (adv)'], 'stuff':['things, belongings','personal stuff','stuff (n/v) / stuffed (adj)'],
    'describe':['explain, portray','describe a person','describe (v) / description (n) / descriptive (adj)'], 'bring':['carry, take','bring good news','bring (v) / brought (past)'], 'vein':['blood vessel, source','a vein of gold','vein (n) / venous (adj)'], 'decide':['choose, determine','decide to leave','decide (v) / decision (n) / decisive (adj)'],
    'into':['inside, in','get into trouble','into (prep)'], 'decision':['choice, judgment','make a decision','decide (v) / decision (n) / decisive (adj)'], 'impulsive':['spontaneous, rash','impulsive purchase','impulse (n) / impulsive (adj)'], 'affordable':['inexpensive, reasonably priced','affordable housing','afford (v) / affordable (adj)'],
    'concern':['worry, matter','raise a concern','concern (v/n) / concerned (adj)'], 'refuse':['reject, decline','refuse an offer','refuse (v) / refusal (n)'], 'landlord':['property owner, lessor','contact the landlord','landlord (n) / landlady (n)'], 'threaten':['warn, intimidate','threaten to leave','threat (n) / threaten (v) / threatening (adj)'],
    'opportunity':['chance, opening','take an opportunity','opportunity (n) / opportunistic (adj)'], 'guarantee':['assure, promise','guarantee a result','guarantee (v/n) / guaranteed (adj)'], 'collaboration':['cooperation, partnership','close collaboration','collaborate (v) / collaboration (n)'], 'investor':['backer, financier','foreign investor','invest (v) / investor (n) / investment (n)'],
    'among':['amid, amongst','among friends','among (prep)'], 'considerable':['substantial, significant','considerable amount','consider (v) / considerable (adj)'], 'sue':['take to court, litigate','sue for damages','sue (v) / lawsuit (n)'], 'traditional':['conventional, customary','traditional values','tradition (n) / traditional (adj)'],
    'disease':['illness, sickness','prevent disease','disease (n) / diseased (adj)'], 'instead of':['rather than, in place of','instead of waiting','instead (adv)'], 'persuade':['convince, influence','persuade someone to','persuade (v) / persuasion (n) / persuasive (adj)'], 'unpredictable':['uncertain, changeable','unpredictable weather','predict (v) / prediction (n) / unpredictable (adj)'],
    'revolutionary':['radical, groundbreaking','revolutionary change','revolution (n) / revolutionize (v) / revolutionary (adj)'], 'inspire':['motivate, encourage','inspire confidence','inspire (v) / inspiration (n) / inspiring (adj)'], 'claim':['assert, allege','claim responsibility','claim (v/n) / claimant (n)'], 'convincing':['persuasive, credible','convincing argument','convince (v) / convincing (adj) / convincingly (adv)'],
    'couch':['sofa, settee','sit on the couch','couch (n/v)'], 'crisis':['emergency, turning point','economic crisis','crisis (n) / critical (adj)'], 'entrepreneur':['business owner, founder','successful entrepreneur','enterprise (n) / entrepreneur (n) / entrepreneurial (adj)'], 'journalist':['reporter, correspondent','newspaper journalist','journal (n) / journalist (n) / journalistic (adj)'],
    'pay attention':['notice, concentrate','pay attention to','attention (n) / attentive (adj)'], 'dizzy':['light-headed, giddy','feel dizzy','dizzy (adj) / dizziness (n)'], 'apparently':['seemingly, reportedly','apparently true','appear (v) / apparent (adj) / apparently (adv)'], 'encourage':['support, urge','encourage someone to','encourage (v) / encouragement (n) / encouraging (adj)'],
    'fraud':['scam, deception','commit fraud','fraud (n) / fraudulent (adj)'], 'needle':['pin, syringe','needle and thread','needle (n/v)'], 'several':['various, numerous','several times','several (det/pron)'], 'superior':['better, higher-quality','superior quality','superiority (n) / superior (adj/n)'],
    'mosquito':['insect, gnat','mosquito bite','mosquito (n)'], 'ineffective':['useless, unsuccessful','ineffective treatment','effect (n/v) / effective (adj) / ineffective (adj)'], 'insult':['offend, slight','an insult to someone','insult (v/n) / insulting (adj)'], 'lease':['rental agreement, let','sign a lease','lease (n/v) / lessee (n) / lessor (n)'],
    'corporate':['business, commercial','corporate world','corporation (n) / corporate (adj)'], 'awful':['terrible, horrible','awful weather','awe (n/v) / awful (adj)'], 'accuse':['blame, charge','accuse someone of','accuse (v) / accusation (n)'], 'customer-oriented':['customer-focused, service-minded','customer-oriented approach','orient (v) / orientation (n) / oriented (adj)'],
    'sparkle':['shine, glitter','sparkle in the light','sparkle (v/n) / sparkling (adj)'], 'trouble':['problem, difficulty','get into trouble','trouble (v/n) / troublesome (adj)'], 'prick':['poke, sting','a prick of pain','prick (v/n) / prickly (adj)'], 'patient':['calm, tolerant','be patient','patience (n) / patient (adj/n)'], 'ambitious':['determined, aspiring','ambitious goal','ambition (n) / ambitious (adj)']
};
const starterSentences = {
    'just as':'Just as I was leaving, the phone rang.', 'fade':'The old photo began to fade in the sun.', 'briefly':'She briefly explained the problem to us.', 'collapse':'The old chair may collapse if you stand on it.',
    'demonstrate':'The teacher will demonstrate the game for the class.', 'attract':'Bright colors attract many children.', 'announce':'They will announce the winner tomorrow.', 'appeal':'The simple design has a strong appeal for young people.',
    'overestimated':'I overestimated the time needed for the journey.', 'desire':'He has a strong desire to learn English.', 'further':'Please contact me if you need further information.', 'enormous':'An enormous tree stood in front of the house.',
    'engaging':'The story is engaging, so I want to read more.', 'appealing':'The clean room looked appealing to the visitors.', 'exceptional':'She did an exceptional job on her first day.', 'consider':'Please consider my idea before you decide.',
    'innovative':'The company has an innovative way to save energy.', 'i̇nnovative':'The company has an innovative way to save energy.', 'executive':'The executive spoke to the workers after lunch.', 'brought':'She brought her book to class.',
    'situation':'We need to stay calm in this situation.', 'declare':'The mayor will declare the park open tomorrow.', 'bankruptcy':'The small shop closed after bankruptcy.', 'spectacular':'We watched a spectacular sunset by the sea.',
    'ambition':'Her ambition is to become a doctor.', 'unsettling':'The strange noise was unsettling at night.', 'ruin':'Heavy rain can ruin a picnic.', 'stylish':'He bought a stylish jacket for the party.',
    'quite':'The test was quite easy for me.', 'unclear':'The last question was unclear to the students.', 'pretend':'The children pretend to be pirates.', 'court':'The lawyer went to court in the morning.',
    'across':'We walked across the street together.', 'moreover':'The room is cheap; moreover, it is near the station.', 'confident':'After practice, she felt confident about the test.', 'stuff':'Please put your stuff in this box.',
    'describe':'Can you describe the man you saw?', 'bring':'Please bring your passport tomorrow.', 'vein':'The nurse found a vein in his arm.', 'decide':'We must decide before the shop closes.',
    'into':'Put the keys into the bag.', 'decision':'Making this decision was not easy.', 'impulsive':'Buying that expensive phone was impulsive.', 'affordable':'This small apartment is affordable for students.',
    'concern':'My main concern is my mother’s health.', 'refuse':'I had to refuse the invitation because I was ill.', 'landlord':'Our landlord fixed the broken window.', 'threaten':'Do not threaten people when you are angry.',
    'opportunity':'This job is a good opportunity for me.', 'guarantee':'This ticket does not guarantee a seat.', 'collaboration':'The project was successful because of our collaboration.', 'investor':'The investor gave money to the new company.',
    'among':'She found her keys among the books.', 'considerable':'We made considerable progress this week.', 'sue':'They may sue the company after the accident.', 'traditional':'My family eats a traditional meal on holidays.',
    'disease':'Regular exercise can help prevent disease.', 'instead of':'I drank water instead of soda.', 'persuade':'I tried to persuade my brother to come with us.', 'unpredictable':'The weather is unpredictable in spring.',
    'revolutionary':'The new machine brought a revolutionary change.', 'inspire':'My teacher inspires me to work hard.', 'claim':'He claims that he saw the accident.', 'convincing':'Her answer was clear and convincing.',
    'couch':'We sat on the couch and watched a film.', 'crisis':'The family stayed together during the crisis.', 'entrepreneur':'The young entrepreneur opened a small bakery.', 'journalist':'The journalist asked the player several questions.',
    'pay attention':'Please pay attention to the road.', 'dizzy':'I felt dizzy after standing up quickly.', 'apparently':'Apparently, the train will arrive late.', 'encourage':'My parents encourage me to read every day.',
    'fraud':'The police arrested the man for fraud.', 'needle':'Be careful; the needle is very sharp.', 'several':'I called several friends after the meeting.', 'superior':'This fabric is superior to the cheaper one.',
    'mosquito':'A mosquito kept me awake last night.', 'ineffective':'The old medicine was ineffective for my pain.', 'insult':'It is never kind to insult another person.', 'lease':'We signed a one-year lease for the flat.',
    'corporate':'She left her corporate job to open a cafe.', 'awful':'The weather was awful, so we stayed at home.', 'accuse':'Do not accuse him without proof.', 'customer-oriented':'This customer-oriented shop listens to its visitors.',
    'sparkle':'The stars sparkle in the clear night sky.', 'trouble':'Call me if you have any trouble with the computer.', 'prick':'I felt a small prick on my finger.', 'patient':'The patient waited quietly for the doctor.',
    'ambitious':'He is ambitious and wants to start his own business.'
};

/* ---------------------------------------------------------------- 5. Şema göçü */

const AUTO_SENTENCE = (eng, turk) => `I learned that “${eng}” means “${turk}” in English.`;

function ensureStatsShape() {
    data.stats = Object.assign({
        reviewedToday: 0, lastStudyDate: '', dayStamp: '', streak: 0, goal: 10,
        totalFlips: 0, flipsByDay: {}, ratings: { again: 0, hard: 0, easy: 0 },
        // Faz 3: puan uretimden gelir. XP ve uretim sayaci ayri tutulur.
        xp: 0, xpByDay: {}, prodByDay: {}, prodTotal: 0, prodCorrect: 0,
        lastProductionDate: '', introToday: 0
    }, data.stats || {});
    data.stats.flipsByDay = data.stats.flipsByDay || {};
    data.stats.xpByDay = data.stats.xpByDay || {};
    data.stats.prodByDay = data.stats.prodByDay || {};
    data.stats.ratings = Object.assign({ again: 0, hard: 0, easy: 0 }, data.stats.ratings || {});
    data.stats.testHistory = Array.isArray(data.stats.testHistory) ? data.stats.testHistory : [];
    data.stats.challengeRecords = Object.assign(
        { flash: 0, quiz: 0, english: 0, infinite: 0, matching: 0, falling: 0 },
        data.stats.challengeRecords || {}
    );
    // Eskiden yalnızca "quiz" modunun rekoru tutuluyordu; onu yeni tabloya taşı.
    const legacy = Number(data.stats.challengeHighScore) || 0;
    if (legacy > data.stats.challengeRecords.quiz) data.stats.challengeRecords.quiz = legacy;
    data.stats.challengeHighScore = data.stats.challengeRecords.quiz;
}

/** Kelime alanlarını tek geçişte normalleştirir. Eskiden her kaydetmede iki kez çalışıyordu. */
function normalizeWords() {
    let changed = false;
    data.words.forEach(word => {
        const stability = Number(word.stability);
        if (!Number.isFinite(stability) || stability <= 0) { word.stability = 1; changed = true; }
        else if (word.stability !== stability) { word.stability = stability; changed = true; }

        const difficulty = Number(word.cardDifficulty);
        if (!Number.isFinite(difficulty)) { word.cardDifficulty = 5; changed = true; }
        else {
            const clamped = Math.min(10, Math.max(1, difficulty));
            if (word.cardDifficulty !== clamped) { word.cardDifficulty = clamped; changed = true; }
        }

        ['synonyms', 'collocation', 'wordFamily', 'mnemonic', 'sentence', 'difficulty', 'definition', 'source'].forEach(field => {
            if (typeof word[field] !== 'string') { word[field] = ''; changed = true; }
        });

        ['interactions', 'encounters', 'correctCount', 'wrongCount', 'srsLevel', 'nextReview', 'lastReviewAt', 'produced', 'producedCorrect'].forEach(field => {
            const value = Number(word[field]);
            if (!Number.isFinite(value) || value < 0) { word[field] = 0; changed = true; }
            else if (word[field] !== value) { word[field] = value; changed = true; }
        });

        // Eşleştirme oyunu bu iki alanı kelimenin kendisine yazıp kaydediyordu;
        // sonraki turda kartlar "zaten eşleşmiş" görünüp oynanamaz hâle geliyordu.
        if ('matched' in word) { delete word.matched; changed = true; }
        if ('matchedAt' in word) { delete word.matchedAt; changed = true; }

        const details = wordLearningDetails[String(word.eng || '').trim().toLocaleLowerCase('en-US')];
        if (details) {
            ['synonyms', 'collocation', 'wordFamily'].forEach((field, index) => {
                if (!word[field].trim()) { word[field] = details[index]; changed = true; }
            });
        }
    });
    return changed;
}

/**
 * "all" sanal bir görünüm, gerçek bir klasör değil. Ona bağlı kalan kelimeler
 * dışa aktarmada sessizce düşüyordu; hepsini gerçek bir klasöre taşı.
 */
function ensureRealFolders() {
    if (!data.folders.some(folder => folder.id === 'all')) {
        data.folders.unshift({ id: 'all', name: 'Tüm kelimeler' });
    }
    const validIds = new Set(data.folders.filter(folder => folder.id !== 'all').map(folder => folder.id));
    const orphans = data.words.filter(word => !validIds.has(word.folderId));
    if (!orphans.length) return false;
    const target = findOrCreateFolder(DEFAULT_FOLDER_NAME);
    orphans.forEach(word => { word.folderId = target.id; });
    return true;
}

function findOrCreateFolder(name) {
    const key = name.toLocaleLowerCase('tr-TR');
    let folder = data.folders.find(item => item.id !== 'all' && item.name.toLocaleLowerCase('tr-TR') === key);
    if (!folder) {
        folder = touch({ id: uid(), name });
        data.folders.push(folder);
    }
    return folder;
}

function defaultFolderId() {
    return activeFolder !== 'all' ? activeFolder : findOrCreateFolder(DEFAULT_FOLDER_NAME).id;
}

/**
 * Yalnızca BOŞ ya da eskiden otomatik üretilmiş cümleleri doldurur.
 * Eski sürüm bu fonksiyonu her açılışta çalıştırıp koşulsuz üzerine yazıyordu:
 * elle yazdığın her örnek cümle bir sonraki yenilemede siliniyordu.
 */
function fillMissingSentences() {
    let changed = false;
    data.words.forEach(word => {
        const eng = String(word.eng || '').trim();
        const turk = String(word.turk || '').trim();
        if (!eng) return;
        const current = String(word.sentence || '').trim();
        // Kullanıcının kendi yazdığı cümleye asla dokunma.
        if (current && current !== AUTO_SENTENCE(eng, turk)) return;
        const starter = starterSentences[eng.toLocaleLowerCase('en-US')];
        if (starter && current !== starter) { word.sentence = starter; touch(word); changed = true; }
    });
    if (changed) save();
}

const STARTER_SENTENCE_SET = new Set(Object.values(starterSentences).map(sentence => sentence.trim()));

/**
 * Cümle Karpuz'un yazdığı mı, kodun içindeki hazır tablodan mı geldi?
 * Otomatik cümleler dilbilgisel olarak doğru ama bağlamı **daraltmıyor**:
 * "The clean room looked ___ to the visitors" boşluğuna on beş kelime oturur.
 * Kaynaktaki gerçek cümle her zaman daha iyi çalışır.
 */
function isFillerSentence(word) {
    const sentence = String(word?.sentence || '').trim();
    if (!sentence) return false;
    if (STARTER_SENTENCE_SET.has(sentence)) return true;
    return sentence === AUTO_SENTENCE(String(word.eng || '').trim(), String(word.turk || '').trim());
}

/** Hâlâ otomatik doldurulmuş kalıp cümle taşıyan kelime sayısı (bilgi amaçlı). */
function placeholderSentenceCount() {
    return data.words.filter(word => {
        const current = String(word.sentence || '').trim();
        return current === AUTO_SENTENCE(String(word.eng || '').trim(), String(word.turk || '').trim());
    }).length;
}

/**
 * Puan aralık uzunluğuna bakar ama eski kartlarda "son çalışılma anı" kaydı yok.
 * Planlanan tekrardan stabilite kadar geriye sayarak kur; yoksa hepsi taban puan verirdi.
 */
function backfillLastReview() {
    let changed = false;
    data.words.forEach(word => {
        if (!word.lastReviewAt && word.nextReview && word.stability) {
            word.lastReviewAt = Math.max(0, Math.round(word.nextReview - word.stability * 86400000));
            changed = true;
        }
    });
    return changed;
}

function runMigrations() {
    ensureStatsShape();
    let changed = normalizeWords();
    if (ensureRealFolders()) changed = true;

    if (!data.stats.encounterMigrationDone) {
        data.stats.totalFlips = Math.max(
            data.stats.totalFlips || 0,
            data.words.reduce((total, word) => total + (Number(word.encounters) || 0), 0)
        );
        data.words.forEach(word => {
            word.interactions = Math.max(word.interactions || 0, Number(word.encounters) || 0);
        });
        data.stats.encounterMigrationDone = true;
        changed = true;
    }

    // v6: birleştirme damgası. Eski kayıtlarda yok; şimdiye kurmak yanlış olurdu
    // (her kayıt "az önce değişti" görünürdü), o yüzden bilinen en son etkinliğe kur.
    ensureTombstones();
    data.words.forEach(word => {
        if (Number.isFinite(Number(word.updatedAt)) && Number(word.updatedAt) > 0) return;
        word.updatedAt = Number(word.lastReviewAt) || Number(word.nextReview) || 1;
        changed = true;
    });
    data.folders.forEach(folder => {
        if (!Number(folder.updatedAt)) { folder.updatedAt = 1; changed = true; }
    });
    if (!Number(data.stats.updatedAt)) { data.stats.updatedAt = Date.now(); changed = true; }

    // Faz 3'e gecerken mevcut seri kaybolmasin: eski "calistigim gun" alanini devral.
    if (!data.stats.productionMigrationDone) {
        if (!data.stats.lastProductionDate) data.stats.lastProductionDate = data.stats.lastStudyDate || '';
        backfillLastReview();
        data.stats.productionMigrationDone = true;
        changed = true;
    }

    if (data.stats.schemaVersion !== SCHEMA_VERSION) {
        data.stats.schemaVersion = SCHEMA_VERSION;
        changed = true;
    }
    if (changed) save();
}

/* ---------------------------------------------------------------- Durum */

let activeTab = 'library';
let activeFolder = 'all';
let editingId = null;
let folderBeingEdited = null;

let studyCards = [];
let studyIndex = 0;
let revealed = false;
let studyFinished = false;

let wordPage = 1;
let statsPage = 1;
let dictionaryPage = 1;

let testCards = [];
let testPool = [];
let testIndex = 0;
let testScore = 0;
let testResults = [];

let challengeCards = [];
let challengeIndex = 0;
let challengeRevealed = false;
let challengeCorrect = false;
let challengeScored = false;
let challengeScore = 0;
let challengeCombo = 0;
let challengeLives = 3;
let challengeTimer = null;
let challengeSeconds = 20;
let challengeLimit = 20;
let challengeResultDetail = '';
let matchingTiles = [];
let matchingSelected = null;
let matchingMatched = 0;
let matchingAttempts = 0;
let matchingStartedAt = 0;

function isTabActive(name) { return activeTab === name; }

/* ---------------------------------------------------------------- Seslendirme */

const speechSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let cachedVoice = null;

function pickVoice() {
    if (!speechSupported) return null;
    // getVoices() ilk çağrıda boş dönebilir; sesler yüklendiğinde tekrar denenir.
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    return voices.find(voice => voice.lang && voice.lang.toLowerCase() === 'en-us')
        || voices.find(voice => voice.lang && voice.lang.toLowerCase().startsWith('en'))
        || null;
}

if (speechSupported) {
    cachedVoice = pickVoice();
    window.speechSynthesis.addEventListener('voiceschanged', () => { cachedVoice = pickVoice(); });
}

function speakText(text) {
    const value = String(text || '').trim();
    if (!speechSupported || !value) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = 'en-US';
    if (!cachedVoice) cachedVoice = pickVoice();
    if (cachedVoice) utterance.voice = cachedVoice;
    window.speechSynthesis.speak(utterance);
}

function setupSpeechSupport() {
    if (!speechSupported) document.querySelectorAll('.speak-button').forEach(button => button.classList.add('hidden'));
}

/* ---------------------------------------------------------------- 6. Render */

/** Arama metni kelime başına bir kez kurulur; her tuş vuruşunda yeniden birleştirilmez. */
const searchCache = new WeakMap();

function searchHaystack(word) {
    let value = searchCache.get(word);
    if (value === undefined) {
        value = `${word.eng} ${word.turk} ${word.definition} ${word.sentence} ${word.source} ${word.collocation} ${word.synonyms} ${word.wordFamily}`
            .toLocaleLowerCase('tr-TR');
        searchCache.set(word, value);
    }
    return value;
}

function invalidateSearch(word) { if (word) searchCache.delete(word); }

function matchesLevel(word, level) {
    if (level === 'all') return true;
    if (level === 'hard') return (word.cardDifficulty || 5) >= HARD_THRESHOLD;
    if (level === 'none') return !String(word.difficulty || '').trim();
    // Kartı eksik olanları toplu iş kuyruğu gibi süz.
    if (level === 'nodef') return !String(word.definition || '').trim();
    if (level === 'nocloze') return !clozeParts(word);
    if (level === 'nosource') return !String(word.source || '').trim();
    if (level === 'filler') return isFillerSentence(word);
    return word.difficulty === level;
}

function currentWords() {
    return activeFolder === 'all' ? data.words : data.words.filter(word => word.folderId === activeFolder);
}

function folderName(id) {
    return data.folders.find(folder => folder.id === id)?.name || 'Tüm kelimeler';
}

function isDue(word, now = Date.now()) { return !word.nextReview || word.nextReview <= now; }

function dueCount(list = data.words) {
    const now = Date.now();
    let total = 0;
    for (const word of list) if (isDue(word, now)) total += 1;
    return total;
}

/**
 * Gün dönümü bakımı.
 * `dayStamp` uygulamanın en son açıldığı gün, `lastStudyDate` ise gerçekten
 * kart değerlendirilen son gün. İkisini ayırmak gerekiyor: eski kod her ikisi
 * için tek alan kullandığı için seri, gün atlansa bile hiç sıfırlanmıyordu.
 */
function ensureDailyState() {
    const today = todayKey();
    if (data.stats.dayStamp === today) return;
    data.stats.dayStamp = today;
    data.stats.reviewedToday = 0;
    data.stats.challengeDoneToday = 0;
    data.stats.introToday = 0;
    // Seri "siteye girdim"e degil "uretim yaptim"a bagli (Faz 3 karari).
    const gap = data.stats.lastProductionDate ? daysBetween(data.stats.lastProductionDate, today) : Infinity;
    if (gap > 1) data.stats.streak = 0;
    save();
}

function renderDashboard() {
    const goal = data.stats.goal || 10;
    const today = todayKey();
    const produced = data.stats.prodByDay[today] || 0;
    const due = dueCount();

    $('dueStat').textContent = due;
    $('streakStat').textContent = data.stats.streak || 0;
    $('xpStat').textContent = `+${data.stats.xpByDay[today] || 0}`;
    $('xpStat').title = `Bugün +${data.stats.xpByDay[today] || 0} XP · toplam ${data.stats.xp || 0} XP`;
    $('goalText').textContent = `${Math.min(produced, goal)} / ${goal}`;
    $('goalSelect').value = goal;
    $('goalBar').style.width = `${Math.min(100, (produced / goal) * 100)}%`;

    // Görevler de üretime bakar: kart çevirmek görev tamamlamaz.
    const tasks = [
        { label: `${goal} üretim tamamla`, done: produced >= goal },
        { label: 'Yeni bir kelimeyle tanış', done: (data.stats.introToday || 0) >= 1 },
        { label: 'Vadesi geleni bitir', done: Boolean(data.words.length) && due === 0 }
    ];
    $('taskList').innerHTML = tasks.map(task =>
        `<div class="task ${task.done ? 'done' : ''}"><span class="task-mark">${task.done ? '✓' : ''}</span><span>${task.label}</span></div>`
    ).join('');
}

function renderFolders() {
    $('folderList').innerHTML = data.folders.map(folder => {
        const count = folder.id === 'all'
            ? data.words.length
            : data.words.filter(word => word.folderId === folder.id).length;
        const tools = folder.id !== 'all'
            ? `<div class="folder-tools"><button class="folder-tool rename-folder" data-id="${folder.id}" title="Klasörü yeniden adlandır">✎</button><button class="folder-tool delete-folder" data-id="${folder.id}" title="Klasörü sil">×</button></div>`
            : '';
        return `<div class="folder-row ${folder.id === activeFolder ? 'active' : ''}"><button class="folder" data-folder="${folder.id}"><span>▰ &nbsp;${escapeHTML(folder.name)}</span><span class="count">${count}</span></button>${tools}</div>`;
    }).join('');
}

function renderPager(elementId, total, page, changePage) {
    const pages = Math.ceil(total / PAGE_SIZE);
    const element = $(elementId);
    if (pages <= 1) { element.innerHTML = ''; return; }
    element.innerHTML = `<button ${page === 1 ? 'disabled' : ''} data-page="${page - 1}">←</button><span>Sayfa ${page} / ${pages}</span><button ${page === pages ? 'disabled' : ''} data-page="${page + 1}">→</button>`;
    element.querySelectorAll('button:not(:disabled)').forEach(button => {
        button.onclick = () => changePage(Number(button.dataset.page));
    });
}

function wordRowHTML(word, options = {}) {
    const meta = options.showLevel
        ? `<span class="tag">${escapeHTML(word.difficulty || 'Seviye yok')}</span>`
        : `<div class="row-actions"><button class="small-button edit" data-id="${word.id}">Düzenle</button><button class="small-button delete" data-id="${word.id}">Sil</button></div>`;
    return `<article class="word-row">`
        + `<div class="word-with-speech"><div class="word">${escapeHTML(word.eng)}</div>`
        + `<button class="speak-button" data-speak-text="${escapeHTML(word.eng)}" title="İngilizceyi dinle" aria-label="İngilizceyi dinle">🔊</button></div>`
        + `<div>${word.definition ? `<div class="definition">${escapeHTML(word.definition)}</div>` : ''}`
        + `<div class="meaning">${escapeHTML(word.turk)}</div>`
        + `<div class="sentence-preview">${escapeHTML(word.sentence || 'Cümle eklenmemiş')}</div>`
        + `${renderWordFlags(word)}`
        + `${renderWordExtras(word)}${options.showLevel ? '' : renderMnemonicSuggestion(word)}</div>`
        + `${meta}</article>`;
}

/** Kartin eksigini kutuphanede gorunur kilar: ne yoksa calisma da o kadar zayif olur. */
function renderWordFlags(word) {
    const flags = [];
    if (String(word.source || '').trim()) flags.push(`<span class="word-flag source">${escapeHTML(word.source)}</span>`);
    // Eksik tanım her satırda uyarı olarak durmaz — filtreye taşındı, yoksa 88 kart 88 uyarı olur.
    if (!clozeParts(word)) flags.push('<span class="word-flag warn">cümlede kelime geçmiyor</span>');
    else if (isFillerSentence(word)) flags.push('<span class="word-flag warn">otomatik cümle</span>');
    return flags.length ? `<div class="word-flags">${flags.join('')}</div>` : '';
}

function renderWordExtras(word, className = 'word-extra') {
    const items = [
        ['Kalıp kullanım', word.collocation],
        ['Eş anlamlılar', word.synonyms],
        ['Kelime ailesi', word.wordFamily]
    ].filter(item => String(item[1] || '').trim());
    if (!items.length) return '';
    return `<details class="${className}"><summary>Ek bilgiler</summary>`
        + items.map(item => `<p><strong>${item[0]}:</strong> ${escapeHTML(item[1])}</p>`).join('')
        + `</details>`;
}

function renderMnemonicSuggestion(word) {
    return word.cardDifficulty >= 7 && !String(word.mnemonic || '').trim()
        ? '<span class="mnemonic-suggestion">Hatırlama notu eklemek faydalı olabilir</span>'
        : '';
}

function renderWords() {
    const query = ($('searchWords').value || '').trim().toLocaleLowerCase('tr-TR');
    const level = $('levelFilter').value;
    const words = currentWords().filter(word =>
        (!query || searchHaystack(word).includes(query)) && matchesLevel(word, level)
    );

    wordPage = Math.min(Math.max(1, wordPage), Math.max(1, Math.ceil(words.length / PAGE_SIZE)));
    $('folderTitle').textContent = folderName(activeFolder);
    const pool = currentWords();
    const missingDefinition = pool.filter(word => !String(word.definition || '').trim()).length;
    const missingCloze = pool.filter(word => !clozeParts(word)).length;
    const gaps = [];
    const fillerCount = pool.filter(word => isFillerSentence(word)).length;
    if (missingDefinition) gaps.push(`${missingDefinition} tanımsız`);
    if (fillerCount) gaps.push(`${fillerCount} otomatik cümle`);
    if (missingCloze) gaps.push(`${missingCloze} cümlesi uygun değil`);
    $('wordCount').textContent = `${words.length} kelime${gaps.length ? ` · ${gaps.join(' · ')}` : ''}`;

    const start = (wordPage - 1) * PAGE_SIZE;
    $('wordList').innerHTML = words.slice(start, start + PAGE_SIZE).map(word => wordRowHTML(word)).join('')
        || '<div class="empty">Bu aramada kelime bulunamadı.</div>';
    renderPager('wordPagination', words.length, wordPage, page => { wordPage = page; renderWords(); });
}

function renderDictionary() {
    const query = ($('dictionarySearch').value || '').trim().toLocaleLowerCase('tr-TR');
    const level = $('dictionaryLevel').value;
    const words = data.words
        .filter(word => (!query || searchHaystack(word).includes(query)) && matchesLevel(word, level))
        .sort((a, b) => a.eng.localeCompare(b.eng, 'en'));

    // Eskiden liste 100 kelimede kesiliyordu ve gerisine ulaşmanın yolu yoktu.
    dictionaryPage = Math.min(Math.max(1, dictionaryPage), Math.max(1, Math.ceil(words.length / PAGE_SIZE)));
    const start = (dictionaryPage - 1) * PAGE_SIZE;

    $('dictionaryMeta').textContent = `${words.length} kelime`;
    $('dictionaryList').innerHTML = words.slice(start, start + PAGE_SIZE)
        .map(word => wordRowHTML(word, { showLevel: true })).join('')
        || '<div class="empty">Aradığın kelime bulunamadı.</div>';
    renderPager('dictionaryPagination', words.length, dictionaryPage, page => { dictionaryPage = page; renderDictionary(); });
}

function printDictionary() {
    const query = ($('dictionarySearch').value || '').trim().toLocaleLowerCase('tr-TR');
    const level = $('dictionaryLevel').value;
    const words = data.words
        .filter(word => (!query || searchHaystack(word).includes(query)) && matchesLevel(word, level))
        .sort((a, b) => a.eng.localeCompare(b.eng, 'en'));
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast('Yazdırma penceresi engellendi.', 'warn'); return; }
    printWindow.document.write(
        `<title>Lexi sözlük</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd}</style>`
        + `<h1>Lexi sözlük</h1><p>${words.length} kelime</p>`
        + `<table><tr><th>İngilizce</th><th>Tanım</th><th>Türkçe</th><th>Örnek cümle</th><th>Seviye</th></tr>`
        + words.map(word => `<tr><td>${escapeHTML(word.eng)}</td><td>${escapeHTML(word.definition || '')}</td><td>${escapeHTML(word.turk)}</td><td>${escapeHTML(word.sentence || '')}</td><td>${escapeHTML(word.difficulty || '—')}</td></tr>`).join('')
        + `</table>`
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

/* ---- İstatistikler ---- */

function renderTestHistory() {
    $('testHistoryList').innerHTML = data.stats.testHistory.length
        ? data.stats.testHistory.slice(0, 10).map(result =>
            `<div class="analysis-row ${result.correct / result.total >= .7 ? 'good' : 'bad'}"><div><strong>${escapeHTML(result.date)}</strong><br>${result.correct} / ${result.total} doğru · %${Math.round((result.correct / result.total) * 100)}</div><strong>${result.score} puan</strong></div>`
        ).join('')
        : '<div class="subtle">Henüz tamamlanmış test yok.</div>';
}

function renderHeatmap() {
    const cells = [];
    const counts = [];
    for (let offset = 89; offset >= 0; offset -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        const key = dayKey(date);
        counts.push({ key, count: data.stats.prodByDay[key] || 0 });
    }
    const peak = Math.max(1, ...counts.map(item => item.count));
    counts.forEach(item => {
        const level = item.count === 0 ? 0 : Math.min(4, Math.ceil((item.count / peak) * 4));
        cells.push(`<div class="heat-cell" data-level="${level}" title="${item.key}: ${item.count} üretim"></div>`);
    });
    $('heatmap').innerHTML = cells.join('');
}

function renderRecords() {
    $('recordGrid').innerHTML = Object.entries(CHALLENGE_MODES).map(([key, label]) =>
        `<div class="record-card"><small>${label}</small><strong>${data.stats.challengeRecords[key] || 0}</strong></div>`
    ).join('');
}

function renderStruggling() {
    const scored = data.words
        .map(word => {
            const attempts = (word.correctCount || 0) + (word.wrongCount || 0);
            return { word, attempts, wrong: word.wrongCount || 0, accuracy: attempts ? (word.correctCount || 0) / attempts : null };
        })
        .filter(item => item.attempts >= 2 && item.accuracy !== null && item.accuracy < 1)
        .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong)
        .slice(0, 12);

    $('strugglingList').innerHTML = scored.length
        ? scored.map(item =>
            `<div class="analysis-row bad"><div><strong>${escapeHTML(item.word.eng)}</strong><br>${escapeHTML(item.word.turk)}</div><strong>%${Math.round(item.accuracy * 100)} · ${item.wrong} hata</strong></div>`
        ).join('')
        : '<div class="subtle">Yeterli veri yok. Test ve challenge çözdükçe burası dolar.</div>';
}

function renderBackupList() {
    const snapshots = readSnapshots();
    $('backupList').innerHTML = snapshots.length
        ? snapshots.map((snapshot, index) =>
            `<div class="backup-row"><span>${new Date(snapshot.at).toLocaleString('tr-TR')} · ${snapshot.words} kelime</span><button class="small-button restore-snapshot" data-index="${index}">Bu hâle dön</button></div>`
        ).join('')
        : '<div class="subtle">Henüz otomatik yedek yok.</div>';
}

function renderStats() {
    const today = todayKey();
    const ratings = data.stats.ratings;

    const prodTotal = data.stats.prodTotal || 0;
    $('xpTotalStat').textContent = data.stats.xp || 0;
    $('xpTodayStat').textContent = data.stats.xpByDay[today] || 0;
    $('prodTotalStat').textContent = prodTotal;
    $('prodAccuracyStat').textContent = prodTotal
        ? `%${Math.round(((data.stats.prodCorrect || 0) / prodTotal) * 100)}`
        : '—';
    $('averageStabilityStat').textContent =
        `${(data.words.reduce((total, word) => total + word.stability, 0) / Math.max(1, data.words.length)).toFixed(1)} gün`;

    $('easyCount').textContent = ratings.easy || 0;
    $('hardCount').textContent = ratings.hard || 0;
    $('againCount').textContent = ratings.again || 0;
    const peak = Math.max(1, ratings.easy || 0, ratings.hard || 0, ratings.again || 0);
    $('easyBar').style.width = `${((ratings.easy || 0) / peak) * 100}%`;
    $('hardBar').style.width = `${((ratings.hard || 0) / peak) * 100}%`;
    $('againBar').style.width = `${((ratings.again || 0) / peak) * 100}%`;

    // Günlük geçmiş de üretimi gösterir: kart çevirmek değil, yazmak sayılır.
    const history = Object.entries(data.stats.prodByDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30);
    const maxDay = Math.max(1, ...history.map(item => item[1]));
    $('dailyHistory').innerHTML = history.length
        ? history.map(([day, count]) =>
            `<div class="history-row"><span>${day}</span><div class="history-bar"><span style="width:${(count / maxDay) * 100}%"></span></div><strong>${count} · +${data.stats.xpByDay[day] || 0} XP</strong></div>`
        ).join('')
        : '<div class="subtle">Henüz üretim kaydı yok. Çalış sekmesinde bir tur yap.</div>';

    renderTestHistory();
    renderHeatmap();
    renderRecords();
    renderStruggling();
    renderBackupList();

    const names = new Map(data.folders.map(folder => [folder.id, folder.name]));
    const rows = [...data.words].sort((a, b) => (b.interactions || 0) - (a.interactions || 0));
    statsPage = Math.min(Math.max(1, statsPage), Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
    const start = (statsPage - 1) * PAGE_SIZE;
    $('statsTable').innerHTML = rows.slice(start, start + PAGE_SIZE).map(word => {
        const attempts = (word.correctCount || 0) + (word.wrongCount || 0);
        const accuracy = attempts ? `%${Math.round(((word.correctCount || 0) / attempts) * 100)}` : '—';
        return `<tr><td>${escapeHTML(word.eng)}</td><td>${escapeHTML(names.get(word.folderId) || '—')}</td><td>${word.interactions || 0} · ${accuracy}</td></tr>`;
    }).join('') || '<tr><td colspan="3">Henüz çalışma kaydı yok.</td></tr>';
    renderPager('statsPagination', rows.length, statsPage, page => { statsPage = page; renderStats(); });
}

/** İstatistik sekmesi görünür değilken ağır tabloyu yeniden kurmanın anlamı yok. */
function refreshStats() { if (isTabActive('stats')) renderStats(); }

function refreshFolderSelects() {
    const options = data.folders.map(folder => `<option value="${folder.id}">${escapeHTML(folder.name)}</option>`).join('');
    ['studyFolder', 'testFolder', 'challengeFolder'].forEach(id => {
        const select = $(id);
        const previous = select.value;
        select.innerHTML = options;
        select.value = data.folders.some(folder => folder.id === previous) ? previous : activeFolder;
    });
}

/**
 * Kütüphane görünümünü tazeler. Eskiden bu fonksiyon çalışma destesini ve
 * challenge turunu da sıfırlıyordu — kelime eklemek seansı bozuyordu.
 */
function renderAll() {
    ensureDailyState();
    renderDashboard();
    renderFolders();
    renderWords();
    refreshFolderSelects();
    if (isTabActive('dictionary')) renderDictionary();
    refreshStats();
}

/* ---------------------------------------------------------------- 7. Çalış (üretim + SRS) */

function folderPool(selectId) {
    const id = $(selectId)?.value || activeFolder;
    return id === 'all' ? data.words : data.words.filter(word => word.folderId === id);
}

const QUEUE_LABELS = {
    due: 'vadesi gelen',
    new: 'hiç çalışılmamış',
    hard: 'zorlandığın',
    all: 'toplam'
};

const EXERCISE_LABELS = {
    intro: 'Yeni kelime · tanış',
    cloze: 'Cümledeki boşluğu doldur',
    produce: 'Anlamı oku, kelimeyi yaz',
    listen: 'Dinle, duyduğun kelimeyi yaz'
};

const NEW_PER_SESSION = 5;                                  // Bir turda kaç yeni kelimeyle tanışılır.
const FALLBACK_ROUND = 20;                                  // Vadesi gelen yoksa kaç kart karıştırılır.
const XP_MAX = 40;

/* ---- Boşluk doldurma altyapısı ---- */

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Kaba kök: "decides"/"deciding" → "decid". Çekimli biçimi cümlede bulabilmek için. */
function stemOf(value) {
    const base = String(value || '').toLocaleLowerCase('en-US');
    for (const suffix of ['ing', 'ies', 'ied', 'ed', 'es', 's']) {
        if (base.length - suffix.length >= 3 && base.endsWith(suffix)) return base.slice(0, -suffix.length);
    }
    return base;
}

/**
 * Örnek cümleyi boşluklu hâle getirir.
 * Önce birebir eşleşme aranır, tutmazsa çekimli biçim ("decide" → "decided").
 * Hiçbiri tutmazsa null döner; o kart boşluk doldurma yerine üretim sorusuna düşer.
 */
/**
 * Türkçe klavyeden gelen İ/I/ı harflerini İngilizce eşleştirme için sadeleştirir.
 * Küçültmeden önce yapılır: "İ".toLowerCase() iki karaktere açılıp konum hesabını bozuyor.
 */
function foldForMatch(value) {
    return String(value || '').replace(/[İIı]/g, 'i').toLowerCase();
}

function clozeParts(word) {
    const sentence = String(word?.sentence || '').trim();
    const target = String(word?.eng || '').trim();
    if (!sentence || !target) return null;

    // Eşleştirme sadeleştirilmiş kopyada yapılır, dilimleme özgün cümlede: uzunluklar birebir.
    const haystack = foldForMatch(sentence);
    const needle = foldForMatch(target);
    if (haystack.length !== sentence.length) return null;

    let match = haystack.match(new RegExp(`\\b${escapeRegExp(needle)}\\b`));
    if (!match) {
        const stem = stemOf(needle.split(/\s+/)[0]);
        if (stem.length >= 3) match = haystack.match(new RegExp(`\\b${escapeRegExp(stem)}[a-z']*\\b`));
    }
    if (!match) return null;

    const surface = sentence.slice(match.index, match.index + match[0].length);
    const before = sentence.slice(0, match.index);
    const after = sentence.slice(match.index + match[0].length);
    // Cümle kelimenin kendisinden ibaretse boşluk doldurmanın bağlam değeri yok.
    if (!before.trim() && !after.trim()) return null;
    return { before, surface, after };
}

/** "resilient" → "r········" — ilk harf ipucu, uzunluğu da gösterir. */
function letterHint(value, revealed = 1) {
    const text = String(value || '').trim();
    if (!text) return '—';
    let shown = 0;
    return text.split('').map(char => {
        if (!/[a-zA-Z']/.test(char)) return char;
        shown += 1;
        return shown <= revealed ? char : '·';
    }).join('');
}

/** Kelimedeki harf sayısı — ipucu merdiveninin kaç basamak olacağını belirler. */
function letterCount(value) {
    return String(value || '').replace(/[^a-zA-Z']/g, '').length;
}

/* ---- Cevap değerlendirme ---- */

/** Levenshtein mesafesi — yazım hatasını tam yanlıştan ayırmak için. */
function editDistance(a, b) {
    if (a === b) return 0;
    if (!a.length || !b.length) return Math.max(a.length, b.length);
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= b.length; j += 1) {
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        previous = current;
    }
    return previous[b.length];
}

function normalizeAnswer(value) {
    return foldForMatch(value).trim().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ');
}

/**
 * 'correct' | 'near' | 'wrong'.
 * Karar: yazım hatası tam yanlış sayılmaz ama tam puan da almaz — doğru yazılış gösterilir.
 */
function judgeAnswer(answer, accepted) {
    const given = normalizeAnswer(answer);
    if (!given) return 'wrong';
    const forms = accepted.map(normalizeAnswer).filter(Boolean);
    if (forms.includes(given)) return 'correct';
    for (const form of forms) {
        const tolerance = form.length >= 8 ? 2 : form.length >= 4 ? 1 : 0;
        if (tolerance && editDistance(given, form) <= tolerance) return 'near';
    }
    return 'wrong';
}

/* ---- Puan (Faz 3) ---- */

/**
 * Puan üretimden gelir ve aralık uzunluğuna göre ağırlıklıdır: bir kelimeyi üç hafta
 * sonra hatırlamak, on dakika sonra hatırlamaktan değerlidir. Kullanılan her ipucu
 * puanın dörtte birini götürür. Kelime eklemek 0 puandır — hiç çağrılmaz.
 */
function productionXP(word, verdict, hintsUsed) {
    if (verdict === 'wrong') return 0;
    const last = Number(word.lastReviewAt) || 0;
    const gapDays = last ? Math.max(0, (Date.now() - last) / 86400000) : 0;
    let xp = Math.min(XP_MAX, Math.round(4 + 6 * Math.log2(1 + gapDays)));
    if (verdict === 'near') xp = Math.round(xp * 0.6);
    xp = Math.round(xp * Math.max(0.25, 1 - 0.25 * hintsUsed));
    return Math.max(1, xp);
}

/**
 * Bir üretim denemesini kaydeder. Seri, günlük sayaç ve XP buradan yürür.
 * `markReviewed`'dan ÖNCE çağrılmalı: aralık hesabı `lastReviewAt`in eski değerini okur.
 */
function recordProduction(word, verdict, hintsUsed) {
    ensureDailyState();
    const today = todayKey();
    const gained = productionXP(word, verdict, hintsUsed);

    word.produced = (word.produced || 0) + 1;
    if (verdict !== 'wrong') word.producedCorrect = (word.producedCorrect || 0) + 1;
    touch(word);
    data.stats.updatedAt = Date.now();

    data.stats.prodTotal = (data.stats.prodTotal || 0) + 1;
    if (verdict !== 'wrong') data.stats.prodCorrect = (data.stats.prodCorrect || 0) + 1;
    data.stats.prodByDay[today] = (data.stats.prodByDay[today] || 0) + 1;
    data.stats.reviewedToday = data.stats.prodByDay[today];

    if (gained) {
        data.stats.xp = (data.stats.xp || 0) + gained;
        data.stats.xpByDay[today] = (data.stats.xpByDay[today] || 0) + gained;
    }

    // Seri "siteye girdim"e değil "bugün üretim yaptım"a bağlı; doğru bilmek şart değil.
    if (data.stats.lastProductionDate !== today) {
        const gap = data.stats.lastProductionDate ? daysBetween(data.stats.lastProductionDate, today) : Infinity;
        data.stats.streak = gap === 1 ? (data.stats.streak || 0) + 1 : 1;
        data.stats.lastProductionDate = today;
        data.stats.lastStudyDate = today;
    }
    return gained;
}

/* ---- Kuyruk ve tur kurulumu ---- */

function queueCards(pool, queue) {
    const now = Date.now();
    if (queue === 'due') {
        // En çok gecikmiş kart önce gelsin.
        return pool.filter(word => isDue(word, now)).sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));
    }
    if (queue === 'new') return pool.filter(word => !(word.interactions || 0));
    if (queue === 'hard') return pool.filter(word => (word.cardDifficulty || 5) >= HARD_THRESHOLD);
    return [...pool];
}

function studyMode() { return $('studyMode')?.value || 'flow'; }

/** Kelime + mod → hangi egzersiz. Cümlesi boşluk doldurmaya uygun değilse üretime düşer. */
function exerciseFor(word, mode) {
    if (mode === 'intro') return 'intro';
    if (mode === 'listen') return speechSupported ? 'listen' : 'produce';
    if (mode === 'produce') return 'produce';
    if (mode === 'flow' && !(word.interactions || 0)) return 'intro';
    return clozeParts(word) ? 'cloze' : 'produce';
}

let studyHints = 0;
let studyAnswered = false;
let sessionProduced = 0;
let sessionCorrect = 0;
let sessionXP = 0;

/**
 * Çalışma turunu kurar.
 * Varsayılan "Günlük akış": önce en fazla beş yeni kelimeyle tanış, sonra vadesi
 * gelenleri üretimle çalış. Tanıma yönü (kart) artık ana mod değil.
 */
function buildStudy() {
    const pool = folderPool('studyFolder');
    const mode = studyMode();
    const queue = $('studyQueue').value;
    $('studyQueue').disabled = mode === 'flow';
    let note = '';
    let cards = [];

    if (mode === 'flow') {
        const fresh = pool.filter(word => !(word.interactions || 0)).slice(0, NEW_PER_SESSION);
        const due = queueCards(pool, 'due').filter(word => (word.interactions || 0));
        cards = [
            ...fresh.map(word => ({ word, type: 'intro' })),
            ...due.map(word => ({ word, type: exerciseFor(word, 'flow') }))
        ];
        if (!cards.length && pool.length) {
            cards = shuffle(pool).slice(0, FALLBACK_ROUND).map(word => ({ word, type: exerciseFor(word, 'cloze') }));
            note = 'Vadesi gelen kart yok — karışık bir üretim turu hazırladım.';
        }
    } else {
        let picked = queueCards(pool, queue);
        if (!picked.length && queue === 'due' && pool.length) {
            picked = queueCards(pool, 'all');
            note = 'Vadesi gelen kart yok — tüm kartlar gösteriliyor.';
        }
        if (mode === 'cloze') {
            const usable = picked.filter(word => clozeParts(word));
            if (usable.length) picked = usable;
            else if (picked.length) note = note || 'Boşluk doldurulacak cümle yok — anlamdan kelimeye soruldu.';
        }
        picked = queue === 'due' && !note ? picked : shuffle(picked);
        cards = picked.map(word => ({ word, type: exerciseFor(word, mode) }));
    }

    studyCards = cards;
    studyIndex = 0;
    studyFinished = false;
    sessionProduced = 0;
    sessionCorrect = 0;
    sessionXP = 0;
    $('studyQueueBadge').textContent = `${dueCount(pool)} vadesi geldi`;
    showStudyCard(note);
}

/* ---- Ekran ---- */

/** İpucu merdiveni: ekranda zaten yazan şey ipucu olarak tekrar sunulmaz. */
/**
 * İpucu merdiveni artık yalnızca **biçim** açar, anlam açmaz.
 * Anlam bedava verilir (bkz. meaningCueHTML): soru "benim aklımdaki kelimeyi bil"
 * değil, "anlamını biliyorsun, şimdi İngilizcesini üret" olmalı. Anlamı saklamak
 * alıştırmayı akıl okumaya çeviriyordu.
 */
function hintLadder(entry) {
    if (entry.type === 'intro') return [];
    const letters = letterCount(acceptedForms(entry)[0]);
    const ladder = [{ label: 'İlk harf', reveal: 1 }];
    if (letters > 3) ladder.push({ label: 'İlk üç harf', reveal: 3 });
    if (letters > 6) ladder.push({ label: 'Yarısı', reveal: Math.ceil(letters / 2) });
    return ladder;
}

/** Kaç harfin açık olduğu — 0 ise hiç ipucu alınmamış. */
function revealedLetters(entry) {
    const ladder = hintLadder(entry);
    return studyHints > 0 && ladder.length ? ladder[Math.min(studyHints, ladder.length) - 1].reveal : 0;
}

/**
 * Anlam ipucu: varsayılan olarak açık.
 * Birincil hâli İngilizce tanım; yoksa Türkçeye düşer ve eksiği görünür kılar.
 */
function meaningCueHTML(word) {
    const definition = String(word.definition || '').trim();
    if (definition) return `<div class="stage-cue-line">${escapeHTML(definition)}</div>`;
    return `<div class="stage-cue-line turk">${escapeHTML(word.turk)}`
        + `<span class="cue-nudge">İngilizce tanım yazarsan bu satır İngilizce olur</span></div>`;
}

function acceptedForms(entry) {
    const parts = entry.type === 'cloze' ? clozeParts(entry.word) : null;
    return parts ? [parts.surface, entry.word.eng] : [entry.word.eng];
}

function promptHTML(entry) {
    const word = entry.word;
    if (entry.type === 'intro') return `<div class="stage-word">${escapeHTML(word.eng)}</div>`;
    if (entry.type === 'listen') return '<div class="stage-word">🎧</div><div class="stage-sub">Sesi dinle, kelimeyi yaz</div>';
    if (entry.type === 'cloze') {
        const parts = clozeParts(word) || { before: '', surface: word.eng, after: '' };
        const revealed = revealedLetters(entry);
        const blank = revealed ? escapeHTML(letterHint(parts.surface, revealed)) : '______';
        return `<div class="stage-sentence">${escapeHTML(parts.before)}<span class="cloze-blank">${blank}</span>${escapeHTML(parts.after)}</div>`
            + meaningCueHTML(word);
    }
    const meaning = String(word.definition || '').trim() || word.turk;
    const isDefinition = Boolean(String(word.definition || '').trim());
    return `<div class="stage-sub">${isDefinition ? 'İngilizce tanım' : 'Türkçe anlam'}</div>`
        + `<div class="stage-meaning">${escapeHTML(meaning)}</div>`;
}

function studyDetailHTML(word) {
    const rows = [
        ['Tanım', word.definition],
        ['Türkçe', word.turk],
        ['Cümle', word.sentence],
        ['Kalıp', word.collocation],
        ['Kaynak', word.source],
        ['Hatırlama notu', word.mnemonic]
    ].filter(row => String(row[1] || '').trim());
    // Kartın eksiğini akışın içinde kapatabilmek, kütüphaneye gitmekten çok daha ucuz.
    const gaps = [];
    if (!String(word.definition || '').trim()) {
        gaps.push(['definition', 'İngilizce tanım yok — anlamı en keskin daraltan alan bu.', 'Tanım ekle']);
    }
    if (isFillerSentence(word)) {
        gaps.push(['sentence', 'Bu cümle otomatik üretildi — kaynakta gördüğün gerçek cümle daha iyi çalışır.', 'Cümleyi düzelt']);
    }
    const nudge = gaps.map(([field, text, label]) =>
        `<div class="detail-nudge" data-field="${field}"><span>${text}</span>`
        + `<button type="button" class="small-button" data-fix-field="${field}" data-fix-id="${word.id}">${label}</button></div>`
    ).join('');
    return `<div class="detail-head"><strong>${escapeHTML(word.eng)}</strong></div>`
        + rows.map(row => `<p><span>${row[0]}</span> ${escapeHTML(row[1])}</p>`).join('')
        + nudge;
}

const FIX_FIELDS = {
    definition: { placeholder: 'Basit İngilizce tanım — sözlükteki learner tanımı gibi...', empty: 'Tanım boş olamaz.' },
    sentence: { placeholder: 'Kelimeyi gördüğün gerçek cümleyi yaz...', empty: 'Cümle boş olamaz.' }
};

/** Çalışma akışını bırakmadan kartın eksik alanını doldurur. */
function openFieldFix(field, id) {
    const word = data.words.find(item => item.id === id);
    const host = $('studyDetail').querySelector(`.detail-nudge[data-field="${field}"]`);
    if (!word || !host || !FIX_FIELDS[field]) return;
    host.innerHTML = `<textarea class="sentence-draft" rows="2" placeholder="${escapeHTML(FIX_FIELDS[field].placeholder)}"></textarea>`
        + `<div class="detail-nudge-actions"><button type="button" class="small-button" data-cancel-fix="1">Vazgeç</button>`
        + `<button type="button" class="small-button" data-save-field="${field}" data-fix-id="${word.id}">Kaydet</button></div>`;
    host.querySelector('textarea').focus();
}

function saveFieldFix(field, id) {
    const word = data.words.find(item => item.id === id);
    const draft = $('studyDetail').querySelector('.sentence-draft');
    if (!word || !draft || !FIX_FIELDS[field]) return;
    const value = draft.value.trim();
    if (!value) { toast(FIX_FIELDS[field].empty, 'warn'); return; }
    word[field] = value;
    touch(word);
    invalidateSearch(word);
    save();
    $('studyDetail').innerHTML = studyDetailHTML(word);
    if (field === 'sentence' && !clozeParts(word)) toast('Kaydedildi ama kelime bu cümlede geçmiyor.', 'warn');
    else toast('Kart güncellendi.', 'good');
    renderWords();
    renderDashboard();
}

function renderCues() {
    const entry = studyCards[studyIndex];
    if (!entry) { $('studyCues').innerHTML = ''; return; }
    const ladder = hintLadder(entry);
    const revealed = revealedLetters(entry);
    // Boşluk doldurmada harfler cümlenin içindeki boşlukta açılır, ayrıca çip gösterilmez.
    $('studyCues').innerHTML = revealed && entry.type !== 'cloze'
        ? `<div class="cue"><span>Harfler</span> ${escapeHTML(letterHint(acceptedForms(entry)[0], revealed))}</div>`
        : '';
    $('studyHint').disabled = studyAnswered || studyHints >= ladder.length;
    $('studyHint').textContent = studyHints >= ladder.length ? 'İpucu kalmadı' : `İpucu (${ladder.length - studyHints})`;
}

function showStudyCard(note = '') {
    const entry = studyCards[studyIndex];
    studyHints = 0;
    studyAnswered = false;
    revealed = false;

    const showGroups = (production, rating) => {
        $('studyProduceActions').classList.toggle('hidden', !production);
        $('studyAnswer').classList.toggle('hidden', !production);
        $('studyRating').classList.toggle('hidden', !rating);
    };

    if (studyFinished) {
        $('studyKicker').textContent = 'Tur tamamlandı';
        $('studyMeta').textContent = 'Tur tamamlandı';
        $('progressBar').style.width = '100%';
        $('studyPrompt').innerHTML = '<div class="stage-word">🎉</div>'
            + `<div class="stage-sub">${sessionProduced} üretim · ${sessionCorrect} doğru · +${sessionXP} XP</div>`;
        $('studyCues').innerHTML = '';
        $('studyFeedback').textContent = '';
        $('studyFeedback').className = 'stage-feedback';
        $('studyDetail').classList.add('hidden');
        $('studySpeak').classList.add('hidden');
        $('prevCard').classList.add('hidden');
        showGroups(false, false);
        $('studyPrimary').classList.remove('hidden');
        $('studyPrimary').textContent = 'Yeni tur';
        return;
    }

    if (!entry) {
        $('studyKicker').textContent = 'Kart yok';
        $('studyMeta').textContent = 'Bu kuyrukta kart yok';
        $('progressBar').style.width = '0%';
        $('studyPrompt').innerHTML = '<div class="stage-sub">Kütüphaneden kelime ekleyerek başla.</div>';
        $('studyCues').innerHTML = '';
        $('studyFeedback').textContent = note;
        $('studyFeedback').className = 'stage-feedback';
        $('studyDetail').classList.add('hidden');
        $('studySpeak').classList.add('hidden');
        $('prevCard').classList.add('hidden');
        showGroups(false, false);
        $('studyPrimary').classList.add('hidden');
        return;
    }

    const production = entry.type !== 'intro';
    // İlk kartta "Önceki" diye bir şey yok; eskiden basınca turun sonuna sarıyordu.
    $('prevCard').classList.toggle('hidden', studyIndex === 0);
    $('studyKicker').textContent = EXERCISE_LABELS[entry.type];
    $('studyMeta').textContent = `${studyIndex + 1} / ${studyCards.length} kart`
        + (sessionProduced ? ` · bu tur ${sessionCorrect}/${sessionProduced} · +${sessionXP} XP` : ` · ${QUEUE_LABELS[$('studyQueue').value]}`);
    $('progressBar').style.width = `${((studyIndex + 1) / studyCards.length) * 100}%`;
    $('studyPrompt').innerHTML = promptHTML(entry);
    $('studyDetail').classList.add('hidden');
    $('studyDetail').innerHTML = studyDetailHTML(entry.word);
    $('studyFeedback').textContent = note;
    $('studyFeedback').className = 'stage-feedback';
    $('studySpeak').dataset.speakText = `${entry.word.eng}. ${entry.word.sentence || ''}`;
    // Tanıma yönünü sızdırmamak için: üretim sorusunda kelime cevaplanmadan seslendirilmez.
    $('studySpeak').classList.toggle('hidden', !speechSupported || (production && entry.type !== 'listen'));

    $('studyAnswer').value = '';
    $('studyAnswer').disabled = false;
    $('studyAnswer').readOnly = false;
    $('studyPrimary').classList.remove('hidden');
    showGroups(production, false);
    renderCues();

    if (entry.done) {
        // Bu kart bu turda zaten çalışıldı: geri dönüldüğünde tekrar sorulmaz.
        if (production) restoreAnsweredCard(entry);
        else {
            revealed = true;
            $('studyDetail').classList.remove('hidden');
            $('studySpeak').classList.toggle('hidden', !speechSupported);
            $('studyFeedback').textContent = entry.rating
                ? `Bu kartı “${RATING_LABELS[entry.rating]}” olarak işaretledin.` : '';
        }
    } else if (production) {
        $('studyAnswer').focus();
        if (entry.type === 'listen') speakText(entry.word.eng);
    }

    $('studyPrimary').textContent = primaryLabel();
}

function revealHint() {
    const entry = studyCards[studyIndex];
    if (!entry || studyAnswered || entry.type === 'intro') return;
    if (studyHints >= hintLadder(entry).length) return;
    studyHints += 1;
    $('studyPrompt').innerHTML = promptHTML(entry);
    renderCues();
    $('studyAnswer').focus();
}

/** Tanışma kartını çevirir: yeni kelimeyi ilk kez tam hâliyle gösterir. */
function revealCard() {
    const entry = studyCards[studyIndex];
    if (!entry || studyFinished || entry.type !== 'intro' || revealed || entry.done) return;
    revealed = true;
    recordFlip(entry.word);
    $('studyDetail').classList.remove('hidden');
    $('studySpeak').classList.toggle('hidden', !speechSupported);
    $('studyPrimary').classList.add('hidden');
    $('studyRating').classList.remove('hidden');
    $('studyFeedback').textContent = 'Nasıl hatırladığını seç — 1 tekrar · 2 zor · 3 kolay';
}

/** Bir kartın görülmesi. */
function recordFlip(word) {
    if (!word) return;
    const today = todayKey();
    data.stats.totalFlips = (data.stats.totalFlips || 0) + 1;
    data.stats.flipsByDay[today] = (data.stats.flipsByDay[today] || 0) + 1;
    data.stats.introToday = (data.stats.introToday || 0) + 1;
    word.interactions = (word.interactions || 0) + 1;
    touch(word);
    data.stats.updatedAt = Date.now();
    save();
    renderDashboard();
    refreshStats();
}

/**
 * Aralıklı tekrar güncellemesi.
 * Seri ve günlük sayaç artık burada değil `recordProduction` içinde: kart çevirmek
 * seri kazandırmıyor, üretim kazandırıyor.
 */
function markReviewed(word, rating) {
    if (!word) return;
    const now = Date.now();
    word.encounters = (word.encounters || 0) + 1;

    if (rating === 'again') {
        word.cardDifficulty = Math.min(10, word.cardDifficulty + 1);
        word.stability = Math.max(1, word.stability * 0.5);
        word.nextReview = now + 10 * 60 * 1000;
        word.srsLevel = 0;
        word.wrongCount = (word.wrongCount || 0) + 1;
    } else if (rating === 'hard') {
        word.cardDifficulty = Math.min(10, word.cardDifficulty + 0.5);
        word.stability *= 1.2;
        word.nextReview = now + word.stability * 86400000;
        word.srsLevel = Math.max(1, word.srsLevel || 0);
        word.wrongCount = (word.wrongCount || 0) + 1;
    } else {
        word.cardDifficulty = Math.max(1, word.cardDifficulty - 0.5);
        word.stability *= 2.2 - word.cardDifficulty / 10;
        word.nextReview = now + word.stability * 86400000;
        word.srsLevel = (word.srsLevel || 0) + 1;
        word.correctCount = (word.correctCount || 0) + 1;
    }

    word.lastReviewAt = now;
    touch(word, now);
    data.stats.ratings[rating] = (data.stats.ratings[rating] || 0) + 1;
    data.stats.updatedAt = now;
    ensureDailyState();
    save();
    renderDashboard();
    refreshStats();
}

/** Birincil düğmenin yazısı — tek yerden, yoksa üç ayrı yerde tutarsızlaşıyor. */
function primaryLabel() {
    if (studyFinished) return 'Yeni tur';
    const entry = studyCards[studyIndex];
    if (!entry) return '';
    if (entry.type === 'intro' && !entry.done && !revealed) return 'Kartı çevir';
    if (entry.type !== 'intro' && !studyAnswered) return 'Cevapla';
    return studyIndex + 1 >= studyCards.length ? 'Turu bitir →' : 'Sonraki →';
}

function verdictText(entry) {
    return entry.verdict === 'correct'
        ? `${VERDICT_TEXT.correct} +${entry.gained} XP`
        : `${VERDICT_TEXT[entry.verdict]} Doğrusu: ${entry.word.eng}${entry.gained ? ` · +${entry.gained} XP` : ''}`;
}

/**
 * Daha önce cevaplanmış bir karta geri dönüldüğünde onu **yeniden cevaplatmaz**,
 * verdiğin cevabı gösterir. Aksi hâlde geri gidip aynı kartı tekrar tekrar
 * cevaplayarak XP toplamak mümkün olurdu — puanı anlamsız kılan bir açık.
 */
function restoreAnsweredCard(entry) {
    studyAnswered = true;
    $('studyAnswer').value = entry.answer || '';
    $('studyAnswer').readOnly = true;
    $('studyFeedback').className = `stage-feedback ${entry.verdict}`;
    $('studyFeedback').textContent = verdictText(entry);
    $('studyDetail').classList.remove('hidden');
    $('studySpeak').classList.toggle('hidden', !speechSupported);
    $('studyHint').disabled = true;
    $('studySkip').disabled = true;
}

const VERDICT_TEXT = {
    correct: '✓ Doğru.',
    near: '≈ Az kalmıştı — yazım hatası.',
    wrong: '✕ Bu sefer olmadı.'
};

/** Üretim cevabını değerlendirir; SRS notu cevaptan ve kullanılan ipucundan çıkar. */
function answerStudy(skipped = false) {
    const entry = studyCards[studyIndex];
    if (!entry || studyFinished || studyAnswered || entry.type === 'intro') return;
    const verdict = skipped ? 'wrong' : judgeAnswer($('studyAnswer').value, acceptedForms(entry));
    studyAnswered = true;

    // Sıra önemli: XP eski `lastReviewAt`i okur, `markReviewed` onu günceller.
    const gained = recordProduction(entry.word, verdict, studyHints);
    const rating = verdict === 'wrong' ? 'again' : (verdict === 'correct' && !studyHints) ? 'easy' : 'hard';
    markReviewed(entry.word, rating);

    sessionProduced += 1;
    if (verdict !== 'wrong') sessionCorrect += 1;
    sessionXP += gained;

    // Sonucu kartın üstünde sakla: geri dönüldüğünde tekrar cevaplatılmaz.
    entry.done = true;
    entry.verdict = verdict;
    entry.gained = gained;
    entry.answer = skipped ? '' : $('studyAnswer').value;

    $('studyAnswer').readOnly = true;
    $('studyAnswer').blur();
    $('studyFeedback').className = `stage-feedback ${verdict}`;
    $('studyFeedback').textContent = verdictText(entry);
    $('studyDetail').classList.remove('hidden');
    $('studySpeak').classList.toggle('hidden', !speechSupported);
    $('studyHint').disabled = true;
    $('studySkip').disabled = true;
    $('studyPrimary').textContent = primaryLabel();
}

function advanceStudy() {
    if (studyIndex + 1 >= studyCards.length) {
        studyFinished = true;
        showStudyCard();
        toast(`Tur bitti · ${sessionProduced} üretim · +${sessionXP} XP`, 'good');
        return;
    }
    studyIndex += 1;
    $('studySkip').disabled = false;
    showStudyCard();
}

const RATING_LABELS = { again: 'Tekrar', hard: 'Zor', easy: 'Kolay' };

function rateCurrentCard(rating) {
    const entry = studyCards[studyIndex];
    if (!entry || studyFinished || entry.type !== 'intro' || !revealed) return;
    if (entry.done) return;                 // aynı kartı iki kez değerlendirme
    entry.done = true;
    entry.rating = rating;
    markReviewed(entry.word, rating);
    advanceStudy();
}

/** Tek birincil düğme: tur bittiyse yeni tur, tanışmada çevir, üretimde cevapla/ilerle. */
function studyPrimary() {
    if (studyFinished) { buildStudy(); return; }
    const entry = studyCards[studyIndex];
    if (!entry) return;
    if (entry.type === 'intro') { revealCard(); return; }
    if (studyAnswered) advanceStudy(); else answerStudy(false);
}

/**
 * Birleştirmeden sonra `data.words` tamamen yeni nesnelerle değişiyor; elimizdeki
 * tur o eski nesneleri tutuyor. Yeniden kurmak yerine id üzerinden yeni nesnelere
 * bağla: bulunduğun kart, cevapladıkların ve tur ilerlemesi korunur.
 */
function rebindStudyCards() {
    const byId = new Map(data.words.map(word => [word.id, word]));
    const kalan = studyCards.filter(entry => byId.has(entry.word.id));
    kalan.forEach(entry => { entry.word = byId.get(entry.word.id); });
    const suanki = studyCards[studyIndex];
    studyCards = kalan;
    if (!studyCards.length) { buildStudy(); return; }
    const yeniYer = suanki ? studyCards.findIndex(entry => entry.word.id === suanki.word.id) : -1;
    studyIndex = yeniYer >= 0 ? yeniYer : Math.min(studyIndex, studyCards.length - 1);
    if (isTabActive('study')) showStudyCard();
}

/** Gezinme. Sarma yok: ilk karttan geriye gidilmez, son karttan ileri gidilmez. */
function moveStudy(step) {
    if (!studyCards.length) return;
    if (studyFinished) { studyFinished = false; studyIndex = 0; showStudyCard(); return; }
    const target = studyIndex + step;
    if (target < 0 || target >= studyCards.length) return;
    studyIndex = target;
    $('studySkip').disabled = false;
    showStudyCard();
}

/* ---------------------------------------------------------------- 8. Test */

function startTest() {
    testPool = folderPool('testFolder');
    if (!testPool.length) { toast('Bu klasörde kelime yok.', 'warn'); return; }
    testCards = sampleFrom(testPool, 10);
    testIndex = 0;
    testScore = 0;
    testResults = [];
    $('testSetup').classList.add('hidden');
    $('testResult').classList.add('hidden');
    $('testGame').classList.remove('hidden');
    showTestQuestion();
}

/** Çeldiriciler artık tüm klasörden rastgele geliyor — eskiden hep destenin ilk üç kartıydı. */
function buildChoices(card, pool, valueOf, total = 4) {
    const answer = valueOf(card);
    const seen = new Set([answer.toLocaleLowerCase('tr-TR')]);
    const distractors = [];
    for (const candidate of shuffle(pool)) {
        if (distractors.length >= total - 1) break;
        if (candidate.id === card.id) continue;
        const value = valueOf(candidate);
        const key = value.toLocaleLowerCase('tr-TR');
        if (!value || seen.has(key)) continue;   // aynı anlam iki kez şık olmasın
        seen.add(key);
        distractors.push(value);
    }
    return shuffle([answer, ...distractors]);
}

function showTestQuestion() {
    const card = testCards[testIndex];
    const choices = buildChoices(card, testPool, item => item.turk);
    $('testWord').textContent = card.eng;
    $('testSpeak').dataset.speakText = card.eng;
    $('testProgress').textContent = `${testIndex + 1} / ${testCards.length}`;
    $('testScore').textContent = testScore;
    $('testFeedback').textContent = '';
    $('nextTest').classList.add('hidden');
    $('testOptions').innerHTML = choices.map((choice, index) =>
        `<button data-index="${index}" data-correct="${choice === card.turk}"><span class="opt-key">${index + 1}</span> ${escapeHTML(choice)}</button>`
    ).join('');
}

function answerTest(button) {
    const card = testCards[testIndex];
    if (!card || button.disabled) return;
    const correct = button.dataset.correct === 'true';
    $('testOptions').querySelectorAll('button').forEach(item => {
        item.disabled = true;
        if (item.dataset.correct === 'true') item.classList.add('correct');
    });
    if (!correct) button.classList.add('wrong');
    testResults.push({ word: card.eng, answer: button.textContent.trim().replace(/^\d+\s*/, ''), correct, meaning: card.turk });
    $('testFeedback').textContent = correct ? '✓ Doğru cevap. +10 puan' : `✕ Yanlış. Doğru cevap: ${card.turk}`;
    if (correct) testScore += 10;
    markReviewed(card, correct ? 'easy' : 'again');
    $('testScore').textContent = testScore;
    $('nextTest').classList.remove('hidden');
}

function saveTestAnalysis() {
    const correct = testResults.filter(result => result.correct).length;
    const result = {
        date: new Date().toLocaleString('tr-TR'),
        total: testResults.length,
        correct,
        score: testScore,
        details: testResults
    };
    data.stats.testHistory.unshift(result);
    data.stats.testHistory = data.stats.testHistory.slice(0, 10);
    save();
    return result;
}

function showTestAnalysis(result) {
    $('testResultAnalysis').innerHTML = result.details.map(item =>
        `<div class="analysis-row ${item.correct ? 'good' : 'bad'}"><div><strong>${escapeHTML(item.word)}</strong><br>${item.correct ? 'Doğru cevap' : `Cevabın: ${escapeHTML(item.answer)}`}</div><strong>${item.correct ? '✓' : `Doğrusu: ${escapeHTML(item.meaning)}`}</strong></div>`
    ).join('');
}

function nextTestQuestion() {
    testIndex += 1;
    if (testIndex >= testCards.length) {
        const result = saveTestAnalysis();
        $('testGame').classList.add('hidden');
        $('testResult').classList.remove('hidden');
        $('testResultText').textContent = `${testCards.length} soruda ${result.correct} doğru, ${testScore} puan topladın.`;
        showTestAnalysis(result);
        refreshStats();
    } else {
        showTestQuestion();
    }
}

/* ---------------------------------------------------------------- 9. Challenge */

let matchingMeanings = [];
let challengePool = [];

function challengeMode() { return $('challengeMode').value; }

/** Challenge de artık klasör seçimine uyar; eskiden her modda tüm kelimeleri kullanıyordu. */
function refreshChallengePool() {
    challengePool = folderPool('challengeFolder');
    return challengePool;
}

function stopChallengeTimer() {
    clearInterval(challengeTimer);
    challengeTimer = null;
}

function buildChallenge() {
    stopChallengeTimer();
    refreshChallengePool();
    const mode = challengeMode();
    challengeScore = 0;
    challengeCombo = 0;
    challengeLives = 3;
    challengeSeconds = 0;
    challengeResultDetail = '';
    $('challengePlay').classList.remove('hidden');
    $('challengeResult').classList.add('hidden');

    if (mode === 'matching') return buildMatchingChallenge();
    if (mode === 'falling') return buildFallingChallenge();

    // Diğer modlarda kart alanı önceki turdan kalan tahtayı taşıyor olabilir.
    restoreChallengeCard();
    challengeCards = shuffle(challengePool);
    if (mode !== 'infinite') challengeCards = challengeCards.slice(0, 5);
    challengeIndex = 0;
    updateChallengeHud();
    showChallengeCard();
}

/** Eşleştirme/düşen modları kart alanının içeriğini değiştiriyor; klasik iskeleti geri koy. */
function restoreChallengeCard() {
    const host = $('challengeCard');
    if ($('challengeWord')) return;
    host.innerHTML = '<div><div class="challenge-word" id="challengeWord">Hazır mısın?</div>'
        + '<div class="challenge-answer hidden" id="challengeAnswer"></div>'
        + '<div class="challenge-options hidden" id="challengeOptions"></div>'
        + '<div class="flash-hint" id="challengeHint">Önce anlamını tahmin et, sonra cevabı aç</div></div>';
}

function updateChallengeHud() {
    const mode = challengeMode();
    const untimed = mode === 'flash' || mode === 'falling';
    $('challengeScore').textContent = challengeScore;
    $('challengeCombo').textContent = `x${challengeCombo}`;
    $('challengeLives').textContent = '♥'.repeat(Math.max(0, challengeLives)) + '♡'.repeat(Math.max(0, 3 - challengeLives));
    $('challengeTime').textContent = untimed ? '—' : challengeSeconds;
    // Eşleştirmede saniye yukarı sayıyor; oranı sınırlamazsak çubuk kutudan taşıyordu.
    const ratio = challengeLimit > 0 ? Math.max(0, Math.min(1, challengeSeconds / challengeLimit)) : 1;
    $('challengeTimerBar').style.transform = `scaleX(${ratio})`;
    $('challengeHighScore').textContent = `Rekor: ${data.stats.challengeRecords[mode] || 0}`;
}

function startChallengeTimer() {
    stopChallengeTimer();
    const mode = challengeMode();
    const timerElement = $('challengeTimer');
    if (mode === 'flash' || mode === 'falling') {
        timerElement.classList.add('no-timer');
        challengeLimit = 0;
        updateChallengeHud();
        return;
    }
    timerElement.classList.remove('no-timer');
    challengeLimit = mode === 'infinite' ? 15 : 20;
    challengeSeconds = challengeLimit;
    updateChallengeHud();
    challengeTimer = setInterval(() => {
        challengeSeconds -= 1;
        updateChallengeHud();
        if (challengeSeconds > 0) return;
        stopChallengeTimer();
        challengeCorrect = false;
        challengeScored = true;
        challengeLives -= 1;
        challengeCombo = 0;
        $('challengeHint').textContent = 'Süre doldu. Cevap kaçtı!';
        $('challengeCard').classList.add('shake');
        setTimeout(() => $('challengeCard').classList.remove('shake'), 400);
        updateChallengeHud();
        if (challengeLives <= 0) finishChallenge(false);
        else setTimeout(nextChallenge, 650);
    }, 1000);
}

function showChallengeCard() {
    const mode = challengeMode();
    if (mode === 'matching') return showMatchingChallenge();
    if (mode === 'falling') return showFallingChallenge();

    restoreChallengeCard();
    const card = challengeCards[challengeIndex];
    const choiceMode = mode === 'quiz' || mode === 'english' || mode === 'infinite';
    challengeRevealed = false;
    challengeCorrect = false;
    challengeScored = false;

    $('challengeMeta').textContent = mode === 'infinite'
        ? `${challengeIndex + 1} / ∞`
        : (challengeCards.length ? `${challengeIndex + 1} / ${challengeCards.length}` : '0 / 5');
    $('challengeWord').textContent = card?.eng || 'Önce kelime ekle';
    $('challengeAnswer').textContent = card?.turk || '';
    $('challengeAnswer').classList.add('hidden');
    $('challengeOptions').classList.add('hidden');
    $('challengeOptions').innerHTML = '';
    $('challengeReveal').classList.toggle('hidden', choiceMode);
    $('challengeNext').classList.remove('hidden');
    $('challengeNext').textContent = choiceMode ? 'Sonraki →' : 'Biliyorum →';

    if (card && choiceMode) {
        const valueOf = mode === 'english' ? (item => item.eng) : (item => item.turk);
        const answer = valueOf(card);
        $('challengeWord').textContent = mode === 'english' ? card.turk : card.eng;
        const choices = buildChoices(card, challengePool, valueOf, 3);
        $('challengeOptions').innerHTML = choices.map((choice, index) =>
            `<button data-choice="${index}" data-correct="${choice === answer}"><span class="opt-key">${index + 1}</span> ${escapeHTML(choice)}</button>`
        ).join('');
        $('challengeOptions').classList.remove('hidden');
        $('challengeOptions').dataset.answer = answer;
    } else {
        $('challengeHint').textContent = card
            ? 'Önce anlamını tahmin et, sonra cevabı aç'
            : 'Kütüphaneden kelime ekleyerek başla';
    }
    if (card) startChallengeTimer(); else stopChallengeTimer();
    updateChallengeHud();
}

function answerChallengeChoice(button) {
    if (challengeRevealed) return;
    const card = challengeCards[challengeIndex];
    if (!card) return;
    recordFlip(card);
    challengeRevealed = true;
    challengeCorrect = button.dataset.correct === 'true';
    button.classList.add(challengeCorrect ? 'correct' : 'wrong');
    const correctButton = $('challengeOptions').querySelector('button[data-correct="true"]');
    if (correctButton) correctButton.classList.add('correct');
    $('challengeHint').textContent = challengeCorrect
        ? 'Doğru! Seri büyüyor.'
        : `Doğru cevap: ${$('challengeOptions').dataset.answer}`;
    updateChallengeScore();
}

/* ---- Eşleştirme ---- */

function buildMatchingChallenge() {
    if (challengePool.length < 6) {
        challengeCards = [];
        matchingTiles = [];
        $('challengeCard').innerHTML = '<div class="empty">Eşleştirme için bu klasörde en az 6 kelime gerekir.</div>';
        $('challengeReveal').classList.add('hidden');
        $('challengeNext').classList.add('hidden');
        return;
    }
    // Eskiden eşleşme bilgisi doğrudan kelime nesnesine yazılıp kaydediliyordu;
    // artık oyun durumu ayrı tutuluyor, veri kirlenmiyor.
    matchingTiles = sampleFrom(challengePool, 6).map(word => ({ word, matched: false }));
    matchingMeanings = shuffle(matchingTiles);
    matchingSelected = null;
    matchingMatched = 0;
    matchingAttempts = 0;
    matchingStartedAt = Date.now();
    challengeLimit = 0;
    $('challengeTimer').classList.add('no-timer');
    showMatchingChallenge();
    updateChallengeHud();
    challengeTimer = setInterval(() => {
        challengeSeconds = Math.floor((Date.now() - matchingStartedAt) / 1000);
        $('challengeTime').textContent = challengeSeconds;
    }, 1000);
}

function showMatchingChallenge() {
    $('challengeMeta').textContent = `${matchingMatched} / 6`;
    // Tahta bir kez kurulur. Eski kod her doğru eşleşmede tüm sütunları yeniden
    // karıştırıyordu, bu da oyunu takip edilemez hâle getiriyordu.
    $('challengeCard').innerHTML = `<div class="matching-board">`
        + `<div class="matching-column"><h3>İngilizce kelimeler</h3>`
        + matchingTiles.map((tile, index) => `<button class="matching-card" data-match-word="${index}">${escapeHTML(tile.word.eng)}</button>`).join('')
        + `</div><div class="matching-column"><h3>Türkçe anlamları</h3>`
        + matchingMeanings.map(tile => `<button class="matching-card" data-match-meaning="${escapeHTML(tile.word.id)}">${escapeHTML(tile.word.turk)}</button>`).join('')
        + `</div></div>`;
    $('challengeReveal').classList.add('hidden');
    $('challengeNext').classList.add('hidden');
}

function selectMatchingWord(index, button) {
    const tile = matchingTiles[index];
    if (!tile || tile.matched) return;
    document.querySelectorAll('[data-match-word]').forEach(item => item.classList.remove('selected'));
    matchingSelected = index;
    button.classList.add('selected');
}

function selectMatchingMeaning(wordId, button) {
    if (matchingSelected === null) return;
    const tile = matchingTiles[matchingSelected];
    if (!tile || tile.matched) return;
    matchingAttempts += 1;
    recordFlip(tile.word);

    if (tile.word.id === wordId) {
        tile.matched = true;
        matchingMatched += 1;
        challengeScore += 100 + challengeCombo * 25;
        challengeCombo += 1;
        markReviewed(tile.word, 'easy');
        button.classList.add('matched');
        button.disabled = true;
        const wordButton = document.querySelector(`[data-match-word="${matchingSelected}"]`);
        if (wordButton) { wordButton.classList.remove('selected'); wordButton.classList.add('matched'); wordButton.disabled = true; }
        matchingSelected = null;
        $('challengeMeta').textContent = `${matchingMatched} / 6`;
        if (matchingMatched === 6) {
            stopChallengeTimer();
            const seconds = Math.floor((Date.now() - matchingStartedAt) / 1000);
            challengeResultDetail = `${seconds} saniyede tamamlandı. Doğruluk: %${Math.round((matchingMatched / matchingAttempts) * 100)}.`;
            updateChallengeHud();
            finishChallenge(true);
            return;
        }
    } else {
        challengeCombo = 0;
        challengeLives -= 1;
        markReviewed(tile.word, 'again');
        button.classList.add('wrong');
        setTimeout(() => button.classList.remove('wrong'), 350);
        matchingSelected = null;
        document.querySelectorAll('[data-match-word]').forEach(item => item.classList.remove('selected'));
        if (challengeLives <= 0) { updateChallengeHud(); finishChallenge(false); return; }
    }
    updateChallengeHud();
}

/* ---- Düşen kelimeler ---- */

function buildFallingChallenge() {
    if (!challengePool.length) {
        challengeCards = [];
        $('challengeCard').innerHTML = '<div class="empty">Bu klasörde kelime yok.</div>';
        return;
    }
    challengeCards = shuffle(challengePool);
    challengeIndex = 0;
    challengeLimit = 0;
    showFallingChallenge();
}

function showFallingChallenge() {
    const card = challengeCards[challengeIndex];
    if (!card) return;
    challengeRevealed = false;
    challengeScored = false;
    $('challengeMeta').textContent = `${challengeIndex + 1} / ∞`;
    $('challengeReveal').classList.add('hidden');
    $('challengeNext').classList.add('hidden');
    $('challengeTimer').classList.add('no-timer');

    const choices = buildChoices(card, challengePool, item => item.turk, 3);
    const duration = Math.max(.9, 3.2 - challengeCombo * .16);

    $('challengeCard').innerHTML = `<div class="falling-arena">`
        + `<div class="falling-word" style="--fall-duration:${duration}s">${escapeHTML(card.eng)}</div>`
        + `<div class="falling-options">`
        + choices.map(choice => `<button data-falling-correct="${choice === card.turk}">${escapeHTML(choice)}</button>`).join('')
        + `</div></div>`;

    // Animasyon `top` yerine `transform` ile yapılıyor (her karede reflow yok);
    // düşülecek mesafeyi arenanın gerçek yüksekliğinden hesapla.
    const arena = $('challengeCard').querySelector('.falling-arena');
    const wordNode = $('challengeCard').querySelector('.falling-word');
    if (arena && wordNode) {
        const travel = Math.max(60, arena.clientHeight - wordNode.offsetHeight - 70);
        wordNode.style.setProperty('--fall-travel', `${travel}px`);
        wordNode.addEventListener('animationend', () => {
            if (challengeScored) return;
            challengeCorrect = false;
            challengeRevealed = true;
            markReviewed(card, 'again');
            updateChallengeScore();
            if (challengeLives <= 0) finishChallenge(false);
            else setTimeout(advanceFalling, 250);
        }, { once: true });
    }
    updateChallengeHud();
}

function answerFalling(button) {
    if (challengeScored) return;
    const card = challengeCards[challengeIndex];
    if (!card) return;
    recordFlip(card);
    challengeRevealed = true;
    challengeCorrect = button.dataset.fallingCorrect === 'true';
    document.querySelectorAll('[data-falling-correct]').forEach(item => {
        item.disabled = true;
        if (item.dataset.fallingCorrect === 'true') item.classList.add('correct');
    });
    if (!challengeCorrect) button.classList.add('wrong');
    markReviewed(card, challengeCorrect ? 'easy' : 'again');
    updateChallengeScore();
    setTimeout(advanceFalling, 250);
}

function advanceFalling() {
    if (challengeLives <= 0) { finishChallenge(false); return; }
    data.stats.challengeDoneToday = (data.stats.challengeDoneToday || 0) + 1;
    save();
    renderDashboard();
    challengeIndex += 1;
    if (challengeIndex >= challengeCards.length) {
        challengeCards = shuffle(challengeCards);
        challengeIndex = 0;
    }
    showFallingChallenge();
}

/* ---- Ortak puanlama ---- */

function updateChallengeScore() {
    if (challengeScored) return;
    challengeScored = true;
    stopChallengeTimer();
    if (challengeCorrect) {
        challengeCombo += 1;
        challengeScore += 100 + (challengeCombo - 1) * 25 + Math.max(0, challengeSeconds) * 3;
        $('challengeCard').classList.add('pulse');
        setTimeout(() => $('challengeCard').classList.remove('pulse'), 400);
    } else {
        challengeCombo = 0;
        challengeLives -= 1;
        $('challengeCard').classList.add('shake');
        setTimeout(() => $('challengeCard').classList.remove('shake'), 400);
    }
    updateChallengeHud();
}

function revealChallenge() {
    if (!challengeCards.length || challengeMode() !== 'flash') return;
    if (!challengeRevealed) {
        recordFlip(challengeCards[challengeIndex]);
        challengeRevealed = true;
        challengeCorrect = true;
        updateChallengeScore();
    } else {
        challengeRevealed = false;
    }
    $('challengeAnswer').classList.toggle('hidden', !challengeRevealed);
    $('challengeHint').textContent = challengeRevealed
        ? 'Hazırsan sonraki karta geç'
        : 'Önce anlamını tahmin et, sonra cevabı aç';
    $('challengeReveal').textContent = challengeRevealed ? 'Cevabı gizle' : 'Cevabı göster';
}

function nextChallenge() {
    const mode = challengeMode();
    if (mode === 'matching' || mode === 'falling') return;
    if (!challengeCards.length) return;
    // Şık modlarında cevap verilmeden "Sonraki"ye basmak can götürmemeli.
    if (!challengeRevealed && mode !== 'flash') return;
    // "Biliyorum →" düğmesi flash modunda doğru bilindiği anlamına gelir.
    if (!challengeScored) { challengeCorrect = mode === 'flash'; updateChallengeScore(); }
    stopChallengeTimer();

    markReviewed(challengeCards[challengeIndex], challengeCorrect ? 'easy' : 'hard');
    data.stats.challengeDoneToday = (data.stats.challengeDoneToday || 0) + 1;
    save();
    renderDashboard();

    if (challengeLives <= 0) { finishChallenge(false); return; }
    challengeIndex += 1;
    if (challengeIndex >= challengeCards.length) {
        if (mode !== 'infinite') { finishChallenge(true); return; }
        challengeCards = shuffle(challengeCards);
        challengeIndex = 0;
    }
    showChallengeCard();
}

function finishChallenge(completed) {
    stopChallengeTimer();
    const mode = challengeMode();
    // Rekor artık her mod için ayrı tutuluyor; eskiden yalnızca "quiz" kaydediliyordu.
    const previous = data.stats.challengeRecords[mode] || 0;
    const newRecord = challengeScore > previous;
    if (newRecord) {
        data.stats.challengeRecords[mode] = challengeScore;
        if (mode === 'quiz') data.stats.challengeHighScore = challengeScore;
        save();
    }
    $('challengePlay').classList.add('hidden');
    $('challengeResult').classList.remove('hidden');
    $('challengeResultTitle').textContent = completed ? 'Tur tamamlandı!' : 'Canların bitti';
    $('challengeResultText').textContent = [
        newRecord ? `Yeni rekor! (${CHALLENGE_MODES[mode]})` : '',
        challengeResultDetail,
        completed ? `Serin x${challengeCombo}.` : 'Bir sonraki turda daha sakin başlayıp seriyi yeniden kurabilirsin.'
    ].filter(Boolean).join(' ');
    $('challengeResultScore').textContent = `${challengeScore} XP`;
    updateChallengeHud();
    renderDashboard();
    refreshStats();
}

/* ---------------------------------------------------------------- Kelime & klasör işlemleri */

function editWord(id) {
    const word = data.words.find(item => item.id === id);
    if (!word) return;
    editingId = id;
    $('engWord').value = word.eng;
    $('turkMeaning').value = word.turk;
    $('wordDefinition').value = word.definition || '';
    $('engSentence').value = word.sentence || '';
    $('wordCollocation').value = word.collocation || '';
    $('wordSource').value = word.source || '';
    $('wordMnemonic').value = word.mnemonic || '';
    $('wordLevel').value = word.difficulty || '';
    $('wordForm').classList.remove('hidden');
    $('engWord').focus();
    $('saveWord').textContent = 'Değişiklikleri kaydet';
}

function deleteWord(id) {
    const word = data.words.find(item => item.id === id);
    if (!word || !confirm(`“${word.eng}” kelimesi silinsin mi?`)) return;
    data.words = data.words.filter(item => item.id !== id);
    markDeleted('words', id);
    invalidateSearch(word);
    save();
    renderAll();
    toast('Kelime silindi.');
}

function openFolderDialog(id = null) {
    folderBeingEdited = id;
    const folder = data.folders.find(item => item.id === id);
    $('folderDialogTitle').textContent = id ? 'Klasörü düzenle' : 'Yeni klasör';
    $('folderName').value = folder?.name || '';
    $('folderDialog').showModal();
    $('folderName').focus();
}

function deleteFolder(id) {
    const folder = data.folders.find(item => item.id === id);
    if (!folder) return;
    const count = data.words.filter(word => word.folderId === id).length;
    if (!confirm(`“${folder.name}” klasörü silinsin mi? ${count} kelime “${DEFAULT_FOLDER_NAME}” klasörüne taşınacak.`)) return;
    // Kelimeler eskiden sanal "all" klasörüne taşınıyor ve yedeğe hiç girmiyordu.
    const target = findOrCreateFolder(DEFAULT_FOLDER_NAME);
    data.words.forEach(word => { if (word.folderId === id) { word.folderId = target.id; touch(word); } });
    data.folders = data.folders.filter(item => item.id !== id);
    markDeleted('folders', id);
    if (activeFolder === id) activeFolder = 'all';
    save();
    renderAll();
}

/* ---------------------------------------------------------------- 10. İçe & dışa aktarma */

function buildBackup() {
    // "all" bir görünüm; gerçek klasörlerin hepsi ve tüm ilerleme alanları dışa aktarılır.
    return {
        app: 'lexi',
        version: SCHEMA_VERSION,
        lastUpdated: Date.now(),
        stats: data.stats,
        // Silinme izleri de taşınmalı: yoksa yedeği başka cihaza aktarınca
        // orada silinmiş kartlar geri dirilir.
        tombstones: data.tombstones,
        decks: data.folders.filter(folder => folder.id !== 'all').map(folder => ({
            id: folder.id,
            name: folder.name,
            cards: data.words.filter(word => word.folderId === folder.id).map(word => ({
                id: word.id,
                question: word.eng,
                answer: word.turk,
                difficulty: word.difficulty || '',
                definition: word.definition || '',
                exampleSentence: word.sentence || '',
                source: word.source || '',
                synonyms: word.synonyms || '',
                collocation: word.collocation || '',
                wordFamily: word.wordFamily || '',
                mnemonic: word.mnemonic || '',
                encounters: word.encounters || 0,
                interactions: word.interactions || 0,
                correctCount: word.correctCount || 0,
                wrongCount: word.wrongCount || 0,
                srsLevel: word.srsLevel || 0,
                nextReview: word.nextReview || 0,
                stability: word.stability || 1,
                cardDifficulty: word.cardDifficulty || 5,
                lastReviewAt: word.lastReviewAt || 0,
                produced: word.produced || 0,
                producedCorrect: word.producedCorrect || 0,
                starred: Boolean(word.starred)
            }))
        }))
    };
}

function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBackup() {
    const backup = buildBackup();
    const count = backup.decks.reduce((total, deck) => total + deck.cards.length, 0);
    downloadFile(`lexi-yedek-${todayKey()}.json`, JSON.stringify(backup, null, 2), 'application/json');
    toast(`${count} kelime dışa aktarıldı.`, 'good');
}

function csvCell(value) {
    const text = String(value ?? '');
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
    const names = new Map(data.folders.map(folder => [folder.id, folder.name]));
    const header = ['Ingilizce', 'Turkce', 'Ornek cumle', 'Seviye', 'Klasor', 'Ingilizce tanim', 'Kalip kullanim', 'Kaynak', 'Hatirlama notu', 'Es anlamlilar', 'Kelime ailesi'];
    const rows = data.words.map(word => [
        word.eng, word.turk, word.sentence, word.difficulty, names.get(word.folderId) || '',
        word.definition, word.collocation, word.source, word.mnemonic, word.synonyms, word.wordFamily
    ].map(csvCell).join(','));
    // Excel'in UTF-8 tanıması için BOM.
    downloadFile(`lexi-${todayKey()}.csv`, '﻿' + [header.join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
    toast(`${data.words.length} kelime CSV olarak indirildi.`, 'good');
}

function exportAnki() {
    // Anki'nin varsayılan içe aktarımı sekmeyle ayrılmış düz metin bekler.
    const clean = value => String(value || '').replace(/[\t\r\n]+/g, ' ').trim();
    const lines = data.words.map(word => {
        const back = [clean(word.definition), clean(word.turk), clean(word.sentence)].filter(Boolean).join('<br>');
        return `${clean(word.eng)}\t${back}\t${clean(word.difficulty)}`;
    });
    downloadFile(`lexi-anki-${todayKey()}.txt`, lines.join('\n'), 'text/plain;charset=utf-8');
    toast('Anki dosyası indirildi (sekme ayraçlı).', 'good');
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const source = text.replace(/^﻿/, '');
    for (let i = 0; i < source.length; i += 1) {
        const char = source[i];
        if (quoted) {
            if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
            else if (char === '"') quoted = false;
            else cell += char;
            continue;
        }
        if (char === '"') { quoted = true; }
        else if (char === ',' || char === ';') { row.push(cell); cell = ''; }
        else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
        else if (char !== '\r') cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(item => item.some(value => String(value).trim()));
}

function importCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error('CSV boş görünüyor.');
    const first = rows[0].map(value => value.trim().toLocaleLowerCase('tr-TR'));
    const hasHeader = first[0].startsWith('ing') || first[0].includes('word') || first[0].includes('front');
    const body = hasHeader ? rows.slice(1) : rows;

    let added = 0;
    let updated = 0;
    body.forEach(row => {
        const eng = String(row[0] || '').trim();
        const turk = String(row[1] || '').trim();
        if (!eng || !turk) return;
        const folder = findOrCreateFolder(String(row[4] || '').trim() || 'İçe aktarılan kelimeler');
        const duplicate = data.words.find(item =>
            item.folderId === folder.id && item.eng.toLocaleLowerCase('tr-TR') === eng.toLocaleLowerCase('tr-TR')
        );
        // Sutun sirasi exportCsv ile ayni.
        const payload = {
            eng, turk,
            sentence: String(row[2] || '').trim(),
            difficulty: String(row[3] || '').trim(),
            definition: String(row[5] || '').trim(),
            collocation: String(row[6] || '').trim(),
            source: String(row[7] || '').trim(),
            mnemonic: String(row[8] || '').trim(),
            synonyms: String(row[9] || '').trim(),
            wordFamily: String(row[10] || '').trim()
        };
        if (duplicate) { Object.assign(duplicate, payload); touch(duplicate); invalidateSearch(duplicate); updated += 1; }
        else {
            data.words.push(touch(Object.assign({
                id: uid(), folderId: folder.id, encounters: 0, interactions: 0,
                correctCount: 0, wrongCount: 0, srsLevel: 0, nextReview: 0,
                produced: 0, producedCorrect: 0, lastReviewAt: 0,
                stability: 1, cardDifficulty: 5, starred: false
            }, payload)));
            added += 1;
        }
    });
    return { added, updated };
}

function importBackup(backup) {
    if (!backup || !Array.isArray(backup.decks)) throw new Error('Geçerli bir Lexi/LinguaAI yedeği bulunamadı.');
    let added = 0;
    let updated = 0;

    backup.decks.forEach(deck => {
        const folder = findOrCreateFolder(String(deck.name || 'İçe aktarılan kelimeler').trim() || 'İçe aktarılan kelimeler');
        (Array.isArray(deck.cards) ? deck.cards : []).forEach(card => {
            const eng = String(card.question || '').trim();
            const turk = String(card.answer || '').trim();
            if (!eng || !turk) return;
            const payload = {
                folderId: folder.id, eng, turk,
                definition: String(card.definition || '').trim(),
                sentence: String(card.exampleSentence || '').trim(),
                source: String(card.source || '').trim(),
                synonyms: String(card.synonyms || '').trim(),
                collocation: String(card.collocation || '').trim(),
                wordFamily: String(card.wordFamily || '').trim(),
                mnemonic: String(card.mnemonic || '').trim(),
                difficulty: String(card.difficulty || '').trim(),
                encounters: Number(card.encounters) || 0,
                interactions: Number(card.interactions) || Number(card.encounters) || 0,
                correctCount: Number(card.correctCount) || 0,
                wrongCount: Number(card.wrongCount) || 0,
                srsLevel: Number(card.srsLevel) || 0,
                nextReview: Number(card.nextReview) || 0,
                stability: Number(card.stability) > 0 ? Number(card.stability) : 1,
                cardDifficulty: Number(card.cardDifficulty) || 5,
                lastReviewAt: Number(card.lastReviewAt) || 0,
                produced: Number(card.produced) || 0,
                producedCorrect: Number(card.producedCorrect) || 0,
                starred: Boolean(card.starred)
            };
            const duplicate = data.words.find(item =>
                item.folderId === folder.id && item.eng.toLocaleLowerCase('tr-TR') === eng.toLocaleLowerCase('tr-TR')
            );
            if (duplicate) { Object.assign(duplicate, payload, { id: duplicate.id }); touch(duplicate); invalidateSearch(duplicate); updated += 1; }
            else { data.words.push(touch(Object.assign({ id: card.id || uid() }, payload))); added += 1; }
        });
    });

    // Eskiden yedekteki `stats` sessizce yok sayılıyordu: başka bir cihaza JSON ile
    // geçince kelimeler geliyor, XP / seri / geçmiş sıfırlanıyordu. Artık birleştiriliyor —
    // her iki yön de korunur, hiçbir sayaç geri gitmez.
    if (backup.stats && typeof backup.stats === 'object') {
        data.stats = mergeStats(data.stats, backup.stats);
    }
    if (backup.tombstones && typeof backup.tombstones === 'object') {
        ensureTombstones();
        data.tombstones.words = mergeTombstones(data.tombstones.words, backup.tombstones.words);
        data.tombstones.folders = mergeTombstones(data.tombstones.folders, backup.tombstones.folders);
        // Yedekte silinmiş görünen kartlar geri dirilmesin.
        data.words = data.words.filter(word => {
            const at = Number(data.tombstones.words[word.id]) || 0;
            return !at || at < (Number(word.updatedAt) || 0);
        });
    }

    const firstDeck = String(backup.decks[0]?.name || '').trim().toLocaleLowerCase('tr-TR');
    activeFolder = data.folders.find(folder => folder.name.toLocaleLowerCase('tr-TR') === firstDeck)?.id || 'all';
    return { added, updated };
}

function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const isCsv = /\.csv$/i.test(file.name);
            const result = isCsv ? importCsv(String(reader.result)) : importBackup(JSON.parse(String(reader.result)));
            normalizeWords();
            ensureRealFolders();
            backfillLastReview();
            fillMissingSentences();
            saveNow();
            renderAll();
            toast(`İçe aktarıldı: ${result.added} yeni, ${result.updated} güncellendi.`, 'good');
        } catch (error) {
            toast(`İçe aktarılamadı: ${error.message}`, 'warn');
        }
    };
    reader.onerror = () => toast('Dosya okunamadı.', 'warn');
    reader.readAsText(file);
}

function restoreSnapshot(index) {
    const snapshot = readSnapshots()[index];
    if (!snapshot) return;
    if (!confirm(`${new Date(snapshot.at).toLocaleString('tr-TR')} tarihli yedeğe dönülsün mü? Şu anki veriler bu yedekle değiştirilecek.`)) return;
    try {
        const restored = JSON.parse(snapshot.payload);
        if (!Array.isArray(restored.words) || !Array.isArray(restored.folders)) throw new Error('bozuk yedek');
        data = restored;
        runMigrations();
        saveNow();
        activeFolder = 'all';
        renderAll();
        buildStudy();
        toast('Yedek geri yüklendi.', 'good');
    } catch (error) {
        toast('Yedek geri yüklenemedi.', 'warn');
    }
}

/* ---------------------------------------------------------------- 11. Senkron: birleştirme

   Aynı hesabın iki cihazı aynı veriyi ayrı ayrı değiştirebilir. Bu bölüm iki hâli
   **kayıpsız** tek hâle indirger. Tasarım kararı: "son yazan kazanır" değil,
   **kayıt bazında en yeni kazanır** — çünkü tablette çalışıp telefonu açınca
   tabletteki ilerlemenin silinmesi bu projedeki en pahalı hata olurdu.
   ------------------------------------------------------------------------------- */

/**
 * Günlük sayaç haritalarını birleştirir (gün → sayı). Gün başına **büyük olan** alınır.
 * Toplama yapılmıyor: aynı oturum iki kez senkronlanırsa toplama kalıcı olarak şişirir,
 * büyüğü almak asla iki kez saymaz. Bedeli, iki cihazda aynı gün yapılan işin
 * eksik sayılması — tek kullanıcı için doğru takas bu.
 */
function mergeDayMap(a, b) {
    const out = Object.assign({}, a || {});
    Object.entries(b || {}).forEach(([key, value]) => {
        out[key] = Math.max(Number(out[key]) || 0, Number(value) || 0);
    });
    return out;
}

function mergeMaxMap(a, b) {
    return mergeDayMap(a, b);
}

/** Silinme izlerini birleştirir ve süresi dolanları atar. */
function mergeTombstones(a, b) {
    const out = Object.assign({}, a || {});
    Object.entries(b || {}).forEach(([id, at]) => {
        out[id] = Math.max(Number(out[id]) || 0, Number(at) || 0);
    });
    const cutoff = Date.now() - TOMBSTONE_TTL_DAYS * 86400000;
    Object.entries(out).forEach(([id, at]) => { if (at < cutoff) delete out[id]; });
    return out;
}

/**
 * Kayıt listelerini id üzerinden birleştirir; her id için `updatedAt` büyük olan kazanır.
 * Silinme izi, kaydın son değişikliğinden **sonraysa** kayıt gitmiş sayılır — yani
 * bir cihazda sildiğin kayıt diğerinden geri dirilmez. Tersine, sildikten sonra öbür
 * cihazda düzenlediysen düzenleme kazanır: silme kazara olmuş olabilir, düzenleme olamaz.
 */
function mergeCollection(localList, remoteList, tombstones) {
    const byId = new Map();
    (localList || []).forEach(item => { if (item && item.id) byId.set(item.id, item); });
    (remoteList || []).forEach(item => {
        if (!item || !item.id) return;
        const current = byId.get(item.id);
        if (!current || (Number(item.updatedAt) || 0) > (Number(current.updatedAt) || 0)) byId.set(item.id, item);
    });
    Object.entries(tombstones || {}).forEach(([id, at]) => {
        const item = byId.get(id);
        if (item && (Number(at) || 0) >= (Number(item.updatedAt) || 0)) byId.delete(id);
    });
    return [...byId.values()];
}

/**
 * İstatistikleri birleştirir.
 * - Günlük haritalar ve tek yönlü sayaçlar: büyük olan.
 * - Tercihler (hedef, tema): `updatedAt` yeni olan taraftan.
 * - Seri: son üretim tarihi ileride olan taraf belirler; tarihler eşitse büyük seri.
 */
function mergeStats(local, remote) {
    const a = local || {};
    const b = remote || {};
    const newer = (Number(b.updatedAt) || 0) > (Number(a.updatedAt) || 0) ? b : a;
    const older = newer === a ? b : a;
    const stats = Object.assign({}, older, newer);

    ['xpByDay', 'prodByDay', 'flipsByDay'].forEach(key => { stats[key] = mergeDayMap(a[key], b[key]); });
    stats.ratings = mergeMaxMap(a.ratings, b.ratings);
    stats.challengeRecords = mergeMaxMap(a.challengeRecords, b.challengeRecords);

    ['prodTotal', 'prodCorrect', 'totalFlips'].forEach(key => {
        stats[key] = Math.max(Number(a[key]) || 0, Number(b[key]) || 0);
    });
    const xpFromDays = Object.values(stats.xpByDay).reduce((total, value) => total + (Number(value) || 0), 0);
    stats.xp = Math.max(xpFromDays, Number(a.xp) || 0, Number(b.xp) || 0);

    const dateA = String(a.lastProductionDate || '');
    const dateB = String(b.lastProductionDate || '');
    if (dateA === dateB) {
        stats.streak = Math.max(Number(a.streak) || 0, Number(b.streak) || 0);
        stats.lastProductionDate = dateA;
    } else {
        const lead = dateA > dateB ? a : b;
        stats.streak = Number(lead.streak) || 0;
        stats.lastProductionDate = lead.lastProductionDate || '';
    }
    stats.lastStudyDate = (String(a.lastStudyDate || '') > String(b.lastStudyDate || ''))
        ? a.lastStudyDate : b.lastStudyDate;

    const history = [...(Array.isArray(a.testHistory) ? a.testHistory : []),
                     ...(Array.isArray(b.testHistory) ? b.testHistory : [])];
    const seen = new Set();
    stats.testHistory = history.filter(item => {
        const key = `${item?.date}|${item?.score}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 10);

    stats.updatedAt = Math.max(Number(a.updatedAt) || 0, Number(b.updatedAt) || 0);
    return stats;
}

/**
 * İki tam veri hâlini birleştirir. Saf fonksiyon: girdileri değiştirmez, yenisini döner.
 * Uzak veri bozuksa yereli aynen döndürür — senkron hiçbir koşulda veri silmemeli.
 */
function mergeData(local, remote) {
    if (!remote || !Array.isArray(remote.words) || !Array.isArray(remote.folders)) return local;

    const tombstones = {
        words: mergeTombstones(local?.tombstones?.words, remote.tombstones?.words),
        folders: mergeTombstones(local?.tombstones?.folders, remote.tombstones?.folders)
    };
    const stats = mergeStats(local?.stats, remote.stats);
    const preferRemote = (Number(remote.stats?.updatedAt) || 0) > (Number(local?.stats?.updatedAt) || 0);

    const merged = {
        folders: mergeCollection(local?.folders, remote.folders, tombstones.folders),
        words: mergeCollection(local?.words, remote.words, tombstones.words),
        stats,
        tombstones,
        theme: (preferRemote ? remote.theme : local?.theme) || local?.theme || remote.theme,
        darkMode: preferRemote ? remote.darkMode : local?.darkMode
    };

    // "all" sanal bir görünüm; birleştirmede kaybolursa klasör listesi çöker.
    if (!merged.folders.some(folder => folder.id === 'all')) {
        merged.folders.unshift({ id: 'all', name: 'Tüm kelimeler', updatedAt: 1 });
    }
    return merged;
}

/* ---------------------------------------------------------------- 12. Senkron: Supabase

   Yerel-öncelikli. Uygulama her zaman localStorage'dan çalışır; bu katman arka planda
   uzlaştırma yapar. Ağ yoksa, arka uç uykudaysa ya da anahtar boşsa uygulama hiçbir şey
   kaybetmeden çalışmaya devam eder.

   Akış: **çek → birleştir → kaydet → yaz.** Sıra önemli — önce yazsaydık, yeni bir
   cihazdaki boş veri bulut kopyasının üstüne biner ve her şey silinirdi.
   ------------------------------------------------------------------------------- */

const SUPABASE_URL = 'https://atizezifilmxuqxjrjnt.supabase.co';
// Bu anahtar bilerek açık: yayınlanabilir (publishable) anahtar, herkesin görmesi için
// tasarlandı. Yetkisi RLS ve `lexi_save` fonksiyonuyla sınırlı — PIN'i okuyamaz,
// doğrudan yazamaz. Gizli olan `service_role` anahtarı buraya ASLA konmaz.
const SUPABASE_KEY = 'sb_publishable_gIIesmnDKhfQR5GweQmgLQ_BMjWBeDt';
const SYNC_PUSH_DELAY = 8000;                  // yazmayı topla, her tuşta ağa çıkma
const SYNC_TIMEOUT = 12000;

let syncState = 'off';                         // off | idle | busy | ok | offline | error
let syncNote = '';
let syncQueued = false;                        // tur sürerken gelen istek düşürülmez, sıraya alınır
let lastPushedAt = 0;

/**
 * Yerelde (localhost) senkron **kapalı**. Sebebi acı deneyim: geliştirirken açık kalan
 * bir test oturumu canlı veritabanına uydurma kullanıcılar yazdı ve elle temizlemek
 * gerekti. Gerçekten yerelde denemek gerekirse:
 *     localStorage.setItem('lexi-dev-sync', '1')
 */
function localGelistirme() {
    return ['localhost', '127.0.0.1', ''].includes(location.hostname)
        && localStorage.getItem('lexi-dev-sync') !== '1';
}

function syncEnabled() {
    return Boolean(SUPABASE_URL && SUPABASE_KEY && activeUser) && !localGelistirme();
}

function setSyncState(state, note = '') {
    syncState = state;
    syncNote = note;
    const chip = $('syncStatus');
    if (!chip) return;
    const labels = { off: '', idle: '⟳', busy: '⟳ senkron', ok: '✓ eşit', offline: '⛌ çevrimdışı', error: '! senkron' };
    chip.textContent = labels[state] || '';
    chip.className = `sync-chip ${state}`;
    chip.title = note || 'Cihazlar arası senkron';
    chip.classList.toggle('hidden', state === 'off');
}

async function supabaseFetch(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT);
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, Object.assign({
            signal: controller.signal,
            headers: Object.assign({
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }, options.headers || {})
        }, options));
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`${response.status} ${text.slice(0, 160)}`);
        }
        return response.status === 204 ? null : await response.json();
    } finally {
        clearTimeout(timer);
    }
}

/** Kapıda gösterilecek kullanıcılar — başka cihazda açılmış hesaplar da görünsün. */
async function fetchRemoteUsers() {
    if (!SUPABASE_URL || !SUPABASE_KEY) return [];
    try {
        const rows = await supabaseFetch('lexi_users?select=slug,name,updated_at&order=updated_at.desc');
        return Array.isArray(rows) ? rows : [];
    } catch (error) {
        return [];
    }
}

async function pullRemote(slug) {
    const rows = await supabaseFetch(`lexi_users?slug=eq.${encodeURIComponent(slug)}&select=data,updated_at`);
    const row = Array.isArray(rows) ? rows[0] : null;
    return row && row.data && Array.isArray(row.data.words) ? row.data : null;
}

async function pushRemote(slug, name, pinHashValue, payload) {
    return supabaseFetch('rpc/lexi_save', {
        method: 'POST',
        body: JSON.stringify({ p_slug: slug, p_name: name, p_pin: pinHashValue, p_data: payload })
    });
}

function activePinHash() {
    return knownUsers()[activeUser]?.pin || '';
}

/**
 * Tam bir uzlaştırma turu. Hata durumunda **yerel veriye dokunulmaz**;
 * senkron hiçbir koşulda veri silmemeli.
 */
async function syncNow(reason = '') {
    if (!syncEnabled()) return;
    // Tur sürerken gelen isteği düşürmek, o sırada yapılan değişikliğin bir sonraki
    // tetiklemeye kadar yazılmaması demekti. Sıraya al.
    if (syncState === 'busy') { syncQueued = true; return; }
    setSyncState('busy');
    try {
        const remote = await pullRemote(activeUser);
        if (remote) {
            const merged = mergeData(data, remote);
            const changed = JSON.stringify(merged) !== JSON.stringify(data);
            if (changed) {
                data = merged;
                runMigrations();
                saveNow();
                renderAll();
                // Turu baştan kurmak, çalışırken senkron gelince kullanıcıyı ilk karta
                // atıyordu. Kartları yeni nesnelere bağla, yeri ve cevapları koru.
                if (studyCards.length) rebindStudyCards(); else if (isTabActive('study')) buildStudy();
            }
        }
        await pushRemote(activeUser, activeUserName || activeUser, activePinHash(), data);
        lastPushedAt = Date.now();
        setSyncState('ok', `Son eşitleme ${new Date().toLocaleTimeString('tr-TR')}${reason ? ` · ${reason}` : ''}`);
    } catch (error) {
        const message = String(error && error.message || error);
        const offline = !navigator.onLine || /abort|failed to fetch|networkerror/i.test(message);
        setSyncState(offline ? 'offline' : 'error', offline
            ? 'Ağ yok — çalışmaya devam et, bağlanınca eşitlenir.'
            : `Eşitlenemedi: ${message}`);
        if (!offline && /PIN/i.test(message)) {
            toast('Bu kullanıcı adı başka bir PIN ile alınmış.', 'warn');
        }
    } finally {
        if (syncQueued) {
            syncQueued = false;
            setTimeout(() => syncNow('bekleyen değişiklik'), 0);
        }
    }
}

const scheduleSync = debounce(() => syncNow(), SYNC_PUSH_DELAY);

/** Kaydetme sonrası senkronu tetikler; `save()` bunu çağırır. */
function syncAfterSave() {
    if (!syncEnabled()) return;
    if (syncState !== 'busy') setSyncState('idle');
    scheduleSync();
}

function bindSync() {
    if (!SUPABASE_URL || !SUPABASE_KEY || localGelistirme()) { setSyncState('off'); return; }
    window.addEventListener('online', () => syncNow('bağlantı geri geldi'));
    window.addEventListener('offline', () => setSyncState('offline', 'Ağ yok.'));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && syncEnabled()) syncNow('sekme kapandı');
    });
}

/* ---------------------------------------------------------------- 13. Olaylar */

function switchTab(name) {
    if (activeTab === 'challenge' && name !== 'challenge') stopChallengeTimer();
    activeTab = name;
    document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
    ['library', 'study', 'test', 'challenge', 'dictionary', 'stats']
        .forEach(view => $(`${view}View`).classList.toggle('hidden', view !== name));

    // Ağır işler yalnızca ilgili sekmeye girilince yapılır.
    if (name === 'study') buildStudy();
    if (name === 'dictionary') renderDictionary();
    if (name === 'stats') renderStats();
    if (name === 'challenge') buildChallenge();
}

function bindEvents() {
    /* --- Kelime formu --- */
    $('wordForm').onsubmit = event => {
        event.preventDefault();
        const eng = $('engWord').value.trim();
        const turk = $('turkMeaning').value.trim();
        if (!eng || !turk) return;
        // synonyms ve wordFamily bilerek yok: formdan kaldirildilar, eski veri korunur.
        const payload = {
            eng, turk,
            definition: $('wordDefinition').value.trim(),
            sentence: $('engSentence').value.trim(),
            collocation: $('wordCollocation').value.trim(),
            source: $('wordSource').value.trim(),
            mnemonic: $('wordMnemonic').value.trim(),
            difficulty: $('wordLevel').value
        };
        if (editingId) {
            const existing = data.words.find(item => item.id === editingId);
            if (existing) { Object.assign(existing, payload); touch(existing); invalidateSearch(existing); }
        } else {
            // Eskiden "Tüm kelimeler" seçiliyken eklenen kelimeler sanal klasöre
            // yazılıyor ve yedeğe hiç girmiyordu.
            data.words.push(touch(Object.assign({
                id: uid(), folderId: defaultFolderId(),
                encounters: 0, interactions: 0, correctCount: 0, wrongCount: 0,
                produced: 0, producedCorrect: 0, lastReviewAt: 0,
                srsLevel: 0, nextReview: 0, stability: 1, cardDifficulty: 5, starred: false,
                synonyms: '', wordFamily: ''
            }, payload)));
        }
        save();
        $('wordForm').reset();
        $('wordForm').classList.add('hidden');
        editingId = null;
        $('saveWord').textContent = 'Kelimeyi kaydet';
        renderAll();
    };
    $('newWord').onclick = () => {
        editingId = null;
        $('wordForm').reset();
        $('wordForm').classList.remove('hidden');
        $('engWord').focus();
        $('saveWord').textContent = 'Kelimeyi kaydet';
    };
    $('cancelEdit').onclick = () => { $('wordForm').classList.add('hidden'); editingId = null; };

    // Boşluk doldurma cümleye bağlı: kelime cümlede geçmiyorsa formda anında söyle.
    const checkSentence = () => {
        const note = $('sentenceNote');
        const draft = { eng: $('engWord').value, sentence: $('engSentence').value };
        if (!draft.eng.trim() || !draft.sentence.trim()) {
            note.textContent = 'kelimeyi gördüğün gerçek cümle en iyisi';
            note.classList.remove('warn');
            return;
        }
        const usable = Boolean(clozeParts(draft));
        note.textContent = usable ? '✓ boşluk doldurmaya uygun' : 'kelime bu cümlede geçmiyor — boşluk doldurma üretilemez';
        note.classList.toggle('warn', !usable);
    };
    $('engSentence').oninput = checkSentence;
    $('engWord').oninput = checkSentence;

    /* --- Olay delegasyonu: listeler her render'da yeniden bağlanmıyor --- */
    $('wordList').addEventListener('click', event => {
        const speak = event.target.closest('.speak-button');
        if (speak) { event.stopPropagation(); speakText(speak.dataset.speakText); return; }
        const edit = event.target.closest('.edit');
        if (edit) return editWord(edit.dataset.id);
        const remove = event.target.closest('.delete');
        if (remove) return deleteWord(remove.dataset.id);
    });
    $('dictionaryList').addEventListener('click', event => {
        const speak = event.target.closest('.speak-button');
        if (speak) speakText(speak.dataset.speakText);
    });
    $('folderList').addEventListener('click', event => {
        const rename = event.target.closest('.rename-folder');
        if (rename) return openFolderDialog(rename.dataset.id);
        const remove = event.target.closest('.delete-folder');
        if (remove) return deleteFolder(remove.dataset.id);
        const folder = event.target.closest('[data-folder]');
        if (!folder) return;
        activeFolder = folder.dataset.folder;
        wordPage = 1;
        renderAll();
    });

    /* --- Klasör dialogu --- */
    $('addFolder').onclick = () => openFolderDialog();
    $('folderForm').onsubmit = event => {
        event.preventDefault();
        const name = $('folderName').value.trim();
        if (!name) return;
        if (folderBeingEdited) {
            const folder = data.folders.find(item => item.id === folderBeingEdited);
            if (folder) { folder.name = name; touch(folder); }
        } else {
            data.folders.push(touch({ id: uid(), name }));
        }
        save();
        $('folderDialog').close();
        renderAll();
    };
    $('cancelFolder').onclick = () => $('folderDialog').close();

    /* --- Yedekleme --- */
    $('importBackup').onclick = () => $('backupFile').click();
    $('backupFile').onchange = event => {
        const file = event.target.files[0];
        if (file) handleImportFile(file);
        event.target.value = '';
    };
    $('exportBackup').onclick = exportBackup;
    $('exportJson').onclick = exportBackup;
    $('exportCsv').onclick = exportCsv;
    $('exportAnki').onclick = exportAnki;
    $('backupList').addEventListener('click', event => {
        const button = event.target.closest('.restore-snapshot');
        if (button) restoreSnapshot(Number(button.dataset.index));
    });

    /* --- Kütüphane filtreleri --- */
    const rerenderWords = debounce(() => { wordPage = 1; renderWords(); }, 140);
    $('searchWords').oninput = rerenderWords;
    $('levelFilter').onchange = () => { wordPage = 1; renderWords(); };

    /* --- Çalış --- */
    $('studyFolder').onchange = buildStudy;
    $('studyQueue').onchange = buildStudy;
    $('studyMode').onchange = buildStudy;
    $('studyPrimary').onclick = studyPrimary;
    $('studyHint').onclick = revealHint;
    $('studySkip').onclick = () => answerStudy(true);
    $('studySpeak').onclick = event => { event.stopPropagation(); speakText($('studySpeak').dataset.speakText); };
    $('studyDetail').addEventListener('click', event => {
        const fix = event.target.closest('[data-fix-field]');
        if (fix) return openFieldFix(fix.dataset.fixField, fix.dataset.fixId);
        const saveIt = event.target.closest('[data-save-field]');
        if (saveIt) return saveFieldFix(saveIt.dataset.saveField, saveIt.dataset.fixId);
        const cancel = event.target.closest('[data-cancel-fix]');
        if (cancel) {
            const entry = studyCards[studyIndex];
            if (entry) $('studyDetail').innerHTML = studyDetailHTML(entry.word);
        }
    });
    $('prevCard').onclick = () => moveStudy(-1);
    $('studyAnswer').onkeydown = event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        studyPrimary();
    };
    document.querySelectorAll('.study-rating button').forEach(button => {
        button.onclick = () => rateCurrentCard(button.dataset.rating);
    });

    /* --- Test --- */
    $('testFolder').onchange = () => {
        $('testGame').classList.add('hidden');
        $('testResult').classList.add('hidden');
        $('testSetup').classList.remove('hidden');
    };
    $('startTest').onclick = startTest;
    $('restartTest').onclick = startTest;
    $('nextTest').onclick = nextTestQuestion;
    $('testSpeak').onclick = () => speakText($('testSpeak').dataset.speakText);
    $('testOptions').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button) answerTest(button);
    });

    /* --- Sözlük --- */
    const rerenderDictionary = debounce(() => { dictionaryPage = 1; renderDictionary(); }, 140);
    $('dictionarySearch').oninput = rerenderDictionary;
    $('dictionaryLevel').onchange = () => { dictionaryPage = 1; renderDictionary(); };
    $('printDictionary').onclick = printDictionary;

    /* --- Challenge --- */
    $('challengeMode').onchange = buildChallenge;
    $('challengeFolder').onchange = buildChallenge;
    $('challengeRestart').onclick = buildChallenge;
    $('challengeReveal').onclick = revealChallenge;
    $('challengeNext').onclick = nextChallenge;
    $('challengeCard').addEventListener('click', event => {
        const choice = event.target.closest('#challengeOptions button');
        if (choice) return answerChallengeChoice(choice);
        const falling = event.target.closest('[data-falling-correct]');
        if (falling) return answerFalling(falling);
        const wordTile = event.target.closest('[data-match-word]');
        if (wordTile) return selectMatchingWord(Number(wordTile.dataset.matchWord), wordTile);
        const meaningTile = event.target.closest('[data-match-meaning]');
        if (meaningTile) return selectMatchingMeaning(meaningTile.dataset.matchMeaning, meaningTile);
    });

    /* --- Kullanıcı --- */
    $('switchUser').onclick = switchUser;

    /* --- Genel --- */
    $('goalSelect').onchange = event => {
        data.stats.goal = Number(event.target.value);
        data.stats.updatedAt = Date.now();
        save();
        renderDashboard();
    };
    $('themePicker').addEventListener('click', event => {
        const option = event.target.closest('.theme-option');
        if (!option) return;
        applyTheme(option.dataset.theme);
        save();
    });
    document.querySelectorAll('.tab').forEach(tab => { tab.onclick = () => switchTab(tab.dataset.tab); });

    // Bekleyen yazma sekme kapanmadan diske insin.
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'hidden') return;
        saveNow();
        if (activeTab === 'challenge') stopChallengeTimer();
    });
}

function bindUserGate() {
    $('gateForm').onsubmit = event => {
        event.preventDefault();
        enterUser($('gateName').value, $('gatePin').value);
    };
    $('gateUsers').addEventListener('click', event => {
        const button = event.target.closest('.gate-user');
        if (!button) return;
        const info = knownUsers()[button.dataset.slug];
        $('gateName').value = info?.name || button.dataset.name || button.dataset.slug;
        $('gatePin').value = '';
        $('gatePin').focus();
    });
}

/* ---------------------------------------------------------------- Klavye kısayolları */

function bindKeyboard() {
    document.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (isTypingTarget(event.target)) return;
        if (document.querySelector('dialog[open]')) return;

        const key = event.key;
        const digit = Number(key);

        if (activeTab === 'study') {
            if (key === ' ' || key === 'Enter') { event.preventDefault(); studyPrimary(); return; }
            if (digit >= 1 && digit <= 3 && revealed) {
                event.preventDefault();
                rateCurrentCard(['again', 'hard', 'easy'][digit - 1]);
                return;
            }
            if (key === 'h' || key === 'H') { event.preventDefault(); revealHint(); return; }
            if (key === 'ArrowLeft') { event.preventDefault(); moveStudy(-1); return; }
            if (key === 'ArrowRight') { event.preventDefault(); moveStudy(1); return; }
            if (key === 's' || key === 'S') { speakText($('studySpeak').dataset.speakText); return; }
        }

        if (activeTab === 'test' && !$('testGame').classList.contains('hidden')) {
            const buttons = [...$('testOptions').querySelectorAll('button')];
            if (digit >= 1 && digit <= buttons.length) { event.preventDefault(); answerTest(buttons[digit - 1]); return; }
            if (key === 'Enter' && !$('nextTest').classList.contains('hidden')) { event.preventDefault(); nextTestQuestion(); return; }
        }

        if (activeTab === 'challenge') {
            const buttons = [...$('challengeCard').querySelectorAll('#challengeOptions button, [data-falling-correct]')];
            if (digit >= 1 && digit <= buttons.length) {
                event.preventDefault();
                const button = buttons[digit - 1];
                if (button.hasAttribute('data-falling-correct')) answerFalling(button);
                else answerChallengeChoice(button);
                return;
            }
            if (key === ' ') { event.preventDefault(); revealChallenge(); return; }
            if (key === 'Enter') { event.preventDefault(); nextChallenge(); return; }
        }
    });
}

/* ---------------------------------------------------------------- Başlangıç */

/**
 * Tema tek bir `data-theme` özniteliğiyle değişir; bütün renk, köşe yuvarlaklığı ve
 * yazı tipi kararları CSS token'larından gelir. Kod hiçbir renk bilmez.
 * Eski `darkMode` bayrağı "odak" temasına karşılık gelir.
 */
const THEMES = ['sakin', 'odak', 'canli'];

function applyTheme(name) {
    const theme = THEMES.includes(name) ? name : 'odak';
    document.body.dataset.theme = theme;
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.toggle('active', option.dataset.theme === theme);
    });
    data.theme = theme;
    data.darkMode = theme === 'odak';
}

/** Kullanıcı seçildikten sonra uygulamayı ayağa kaldırır. */
function startSession() {
    data = loadUserData(activeUser);
    runMigrations();
    fillMissingSentences();
    applyTheme(data.theme || (data.darkMode === false ? 'sakin' : 'odak'));

    $('userGate').classList.add('hidden');
    $('activeUser').textContent = activeUserName || activeUser;
    renderAll();
    switchTab(activeTab === 'library' ? 'library' : activeTab);
    flushSave();

    // Yeni cihazda önce ÇEKMEK şart: yazsaydık boş yerel veri bulut kopyasını silerdi.
    if (syncEnabled()) syncNow('açılış');
    else setSyncState('off');
}

/**
 * Çevrimdışı çalışabilmek için service worker. Yalnızca http(s) üzerinde kaydedilir:
 * `file://` ile açıldığında tarayıcı buna izin vermiyor ve konsolu hatayla dolduruyor.
 */
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!location.protocol.startsWith('http')) return;
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

function init() {
    registerServiceWorker();
    bindEvents();
    bindKeyboard();
    bindUserGate();
    bindSync();
    setupSpeechSupport();

    const session = readJSON(SESSION_KEY, null);
    const slug = session && typeof session.user === 'string' ? session.user : '';
    const known = knownUsers()[slug];
    if (slug && known) {
        activeUser = slug;
        activeUserName = known.name || slug;
        startSession();
    } else {
        applyTheme('odak');
        openUserGate();
    }
}

init();
