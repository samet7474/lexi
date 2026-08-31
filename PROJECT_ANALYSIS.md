# Lexi — Mimari ve Veri Modeli

> Kullanım rehberi `README.md`'de. Bu dosya kodun **nasıl** kurulduğunu anlatır:
> dosya düzeni, veri şeması, göç mantığı ve bir şeyi değiştirirken nereye bakılacağı.
> Kararların **gerekçeleri** vault'ta: `MyMind/🏰 300-Projects/Lexi/Kararlar.md`.

Son güncelleme: 2026-08-30 (Faz 0–4 + senkron altyapısı; şema v6).

## 1. Kısıtlar

Bunlar tercih değil kural. Bir öneri bunlardan birini bozuyorsa öneri yanlıştır.

- **Build adımı yok.** Paket yöneticisi, bundler, npm, derleme yok.
- **Sunucu yok.** Backend, API, AI servisi yok; her şey istemci tarafında.
- **CDN yok.** Dış bağımlılık yok, internetsiz de çalışmalı.
- Üç dosya aynı klasörde durmalı: `index.html` + `style.css` + `app.js`.

## 2. Dizin

| Yol | İçerik |
|---|---|
| `index.html` | Sayfa iskeleti (~380 satır) |
| `style.css` | Tüm görünüm (~560 satır, token tabanlı, 10 bölüm) |
| `app.js` | Tüm mantık (~2480 satır, numaralı bölümlere ayrılmış) |
| `_eski/` | Eski tek parça sürümler (`.html.bak` — çift tıklanınca tarayıcı açmasın diye) ve faz öncesi kod arşivi |
| `_yedekler/` | JSON veri yedekleri; kod klasöründen ayrı tutulur (kişisel veri) |
| `_test/` | Node ile elle çalışan testler. Uygulamaya dâhil değil, `index.html` yüklemez. |
| `_kurulum/` | Supabase SQL'i ve yayınlama rehberi. Uygulamaya dâhil değil. |
| `ikon/` | PWA ikonları (bağımlılıksız üretilmiş PNG) |
| `manifest.json`, `sw.js` | PWA: ana ekrana eklenebilme ve çevrimdışı açılma |
| `CLAUDE.md`, `AGENTS.md` | Ajan kuralları ve kısıtlar; **birlikte** güncellenir |
| `SABITLER.md` | Değişmeyen değerlerin aynası: sürüm, anahtar, adres, eşik, formül |
| `Backlog.md`, `Yapilanlar.md` | Açık işler / kapanan işlerin log'u |

`_eski/` içindekiler aynı `localStorage` anahtarına yazar; açılırlarsa veri bozulur.
Ayrıntı: `_eski/OKU-BENI.md`.

## 3. app.js bölümleri

```
 1. Sabitler ve durum
 2. Yardımcılar (DOM, karıştırma, tarih, bildirim)
 3. Depolama: okuma / kaydetme / otomatik anlık görüntü
 4. Veri tabloları (cümle ve kelime bilgisi sözlükleri)
 5. Şema göçü (migration)
 6. Render: pano, klasörler, kelimeler, sözlük, istatistik
 7. Çalış: günlük akış, boşluk doldurma, SRS      ← ana motor
 8. Test (tanıma kontrolü)
 9. Challenge modları
10. İçe & dışa aktarma (JSON, CSV, Anki)
11. Senkron: cihazlar arası birleştirme
12. Olay bağlama, klavye kısayolları, başlangıç
```

Framework yok. Durum düz global değişkenlerde, render doğrudan DOM'a yazar.
`renderAll()` merkezi tazeleme; ağır işler yalnızca ilgili sekmeye girilince yapılır
(`switchTab`). Listelerde olay delegasyonu kullanılır, her render'da yeniden bağlanmaz.

## 4. Veri modeli

**v6'dan beri depolama kullanıcı başına ayrılmıştır:**

| Anahtar | İçerik |
|---|---|
| `lexi-session-v1` | Bu cihazda açık olan kullanıcı (`{ user: slug }`) |
| `lexi-users-v1` | Cihazda bilinen kullanıcılar: ad + PIN karması |
| `lexi-user-<slug>` | O kullanıcının verisi |
| `lexi-user-<slug>-recovery` | Kurtarma kopyası |
| `lexi-user-<slug>-snapshots` | Son 6 anlık görüntü |
| `lexi-vocabulary-v1` | **Eski**, kullanıcı katmanından önce. Silinmiyor: ilk kullanıcı bunu devralır, dosya geri dönüş için yerinde kalır. |

```js
{
  folders: [{ id:'all', name:'Tüm kelimeler' }, ...],
  words:   [ ...kelime nesneleri... ],
  stats:   { ... },
  darkMode: boolean
}
```

### Kelime

| Alan | Tip | Not |
|---|---|---|
| `id`, `folderId` | string | `'all'` sanal bir görünüm, gerçek klasör değil |
| `eng`, `turk` | string | zorunlu |
| `definition` | string | **v5** — basit İngilizce tanım, anlamın birincil hâli |
| `sentence` | string | boşluk doldurma bundan üretilir |
| `source` | string | **v5** — kelime nerede görüldü |
| `collocation`, `mnemonic`, `difficulty` | string | |
| `synonyms`, `wordFamily` | string | **eski** — formdan kaldırıldı, veri korunuyor |
| `stability`, `cardDifficulty` | number | SRS; zorluk 1–10 |
| `srsLevel`, `nextReview` | number | |
| `lastReviewAt` | number | **v5** — puanın aralık ağırlığı bunu okur |
| `interactions`, `encounters` | number | görülme / değerlendirilme |
| `correctCount`, `wrongCount` | number | |
| `produced`, `producedCorrect` | number | **v5** — üretim denemeleri |
| `updatedAt` | number | **v6** — birleştirmenin tamamı buna dayanır |

### stats

Eski alanlar (`totalFlips`, `flipsByDay`, `ratings`, `streak`, `goal`, `testHistory`,
`challengeRecords`) korunur. v5'te eklenenler:

| Alan | Not |
|---|---|
| `xp`, `xpByDay` | ana skorboard |
| `prodTotal`, `prodCorrect`, `prodByDay` | üretim sayaçları; ısı haritası ve günlük geçmiş bunu okur |
| `lastProductionDate` | seri bunun üzerinden yürür |
| `introToday` | günün "yeni kelimeyle tanış" görevi |
| `updatedAt` | **v6** — tercihlerde (hedef, tema) hangi tarafın kazanacağını belirler |

Kök seviyede **v6**: `tombstones: { words: {id: ms}, folders: {id: ms} }` — silinen
kayıtların izi. İz olmazsa silmediğin cihazdan gelen kopya kaydı geri diriltir.

## 5. Şema göçü

`SCHEMA_VERSION = 5`. `runMigrations()` açılışta çalışır ve **eklemeli**dir — veri silmez.

- `normalizeWords()` eksik alanları tipine göre doldurur (yeni alanlar burada `''`/`0` olur).
- `ensureRealFolders()` sanal `'all'` klasörüne bağlı kalmış kelimeleri gerçek klasöre taşır.
- `productionMigrationDone` bayrağı bir kez çalışır:
  - `lastProductionDate` ← eski `lastStudyDate` (mevcut seri kaybolmasın diye),
  - `backfillLastReview()` her kart için `nextReview − stabilite×gün` hesaplayıp
    `lastReviewAt`i geriye kurar (yoksa ilk turda her kart taban puan verirdi).
- `fillMissingSentences()` **yalnızca** boş ya da eskiden otomatik üretilmiş cümleleri
  doldurur. Elle yazılmış cümleye asla dokunmaz — eski sürümün en yıkıcı hatası buydu.

İçe aktarma da aynı yolu izler: `normalizeWords → ensureRealFolders → backfillLastReview →
fillMissingSentences → saveNow`.

## 6. Çalışma motoru (bölüm 7)

Tek motor, beş mod. `studyCards` artık `{ word, type }` çiftleri tutar; `type` egzersiz
tipidir: `intro` · `cloze` · `produce` · `listen`.

```
buildStudy()      → moda göre kart listesi kurar (flow: yeni + vadesi gelen)
exerciseFor()     → kelime + mod → egzersiz tipi; cümlesi uygun değilse produce'a düşer
showStudyCard()   → sahneyi tipe göre şekillendirir
studyPrimary()    → tek birincil düğme: çevir / cevapla / ilerle / yeni tur
answerStudy()     → değerlendirir, XP verir, SRS'i günceller
```

### Boşluk doldurma üretimi — `clozeParts(word)`

1. `foldForMatch()` ile İ/I/ı sadeleştirilir ve küçültülür. **Küçültmeden önce** yapılır:
   `"İ".toLowerCase()` iki karaktere açılır ve konum hesabını bozar.
2. Cümlede kelime birebir aranır (`\b...\b`).
3. Tutmazsa kaba kök denenir (`stemOf`: ing/ies/ied/ed/es/s atar) — "decide" → "decided".
4. Bulunamazsa `null`; o kart `produce` egzersizine düşer.

Eşleştirme sadeleştirilmiş kopyada yapılır, dilimleme özgün cümlede — uzunluklar birebir
olduğu için konumlar geçerlidir. Bu yüzden `foldForMatch` 1:1 karakter eşlemesi olmalıdır.

Test verisinde 88 kartın 87'si boşluk doldurmaya uygun; uymayan tek kart düzensiz fiil
("bring" → "brought").

### İpucu ve anlam ipucu

**Anlam saklanmaz.** `meaningCueHTML()` boşluğun altına İngilizce tanımı (yoksa Türkçeyi)
her zaman basar. İlk sürümde anlam ipucunun arkasındaydı ve alıştırma "benim aklımdaki
kelimeyi bil"e dönüşüyordu; bu bir dil becerisi değil. Zorluk **biçimi üretmekte** olmalı,
hangi eşanlamlının istendiğini tahmin etmekte değil. Yan etki olarak puan da düzeldi:
her kartta ipucu almak zorunda kalmak XP'yi sistematik olarak kırpıyordu.

`hintLadder()` artık yalnızca biçim açar: ilk harf → ilk üç harf → yarısı
(`letterHint(value, revealed)`). Boşluk doldurmada harfler cümlenin içindeki boşlukta
açılır; diğer modlarda `#studyCues` içinde çip olarak.

### Otomatik cümle tespiti

`isFillerSentence(word)` — cümle `starterSentences` tablosundaki bir değere ya da
`AUTO_SENTENCE()` kalıbına birebir eşitse `true`. Bu cümleler dilbilgisel olarak doğru
ama **bağlamı daraltmaz**; kütüphanede işaretlenir, `filler` filtresiyle süzülür ve
çalışma ekranında düzeltme düğmesi çıkarır.

`openFieldFix()` / `saveFieldFix()` turu bölmeden `definition` ya da `sentence` alanını
düzenler (`FIX_FIELDS` tablosu). Olay bağlama `#studyDetail` üzerinde delegasyonla.

### Cevap değerlendirme

`judgeAnswer(answer, accepted)` → `'correct' | 'near' | 'wrong'`.
`near`, Levenshtein mesafesi 1 (8+ harflilerde 2) olan yazım hatasıdır.
Kabul edilen biçimler: cümledeki gerçek biçim **ve** sözlük biçimi.

### Puan — `productionXP(word, verdict, hintsUsed)`

```
taban = min(40, round(4 + 6·log2(1 + gün farkı)))     gün farkı = now − lastReviewAt
near  → ×0.6      her ipucu → ×0.75 (en az ×0.25)      wrong → 0
```

`recordProduction()` **`markReviewed()`'dan önce** çağrılmalıdır: XP eski `lastReviewAt`i
okur, `markReviewed` onu günceller. Sıra bozulursa her cevap taban puan verir.

Seri `recordProduction` içinde yürür — kart çevirmek seri kazandırmaz.

## 7. Görünüm (Faz 4)

`style.css` baştan yazıldı, `app.js`'e dokunulmadan. **Tek kural: bir kuralın içine
doğrudan renk yazma.** Token bloğu dışında dosyada tek bir hex kodu yok.

### Token'lar

`:root` varsayılan (Sakin) değerleri tanımlar; `body[data-theme='odak']` ve
`body[data-theme='canli']` yalnızca token'ları ezer, tek bir yerleşim kuralı tekrarlanmaz.

| Grup | Token |
|---|---|
| Zemin | `--bg`, `--bg-glow`, `--surface`, `--surface-2` |
| Yazı | `--ink`, `--muted` |
| Çizgi | `--line` |
| Vurgu | `--accent`, `--accent-soft`, `--accent-ink` |
| İkincil vurgu | `--highlight`, `--highlight-soft`, `--highlight-ink` |
| Durum | `--good(-soft)`, `--warn(-soft)`, `--bad(-soft)` |
| Biçim | `--radius`, `--radius-sm`, `--radius-lg`, `--pill` |
| Tipografi | `--font-ui`, `--font-display`, `--font-content` |
| Derinlik | `--shadow`, `--shadow-lift`, `--focus` |

Yeni tema eklemek: `body[data-theme='ad']` bloğu yaz, `THEMES` dizisine ekle, HTML'de
bir `.theme-option` düğmesi koy. Başka hiçbir yere dokunma.

`applyTheme()` (app.js) `data-theme` özniteliğini kurar ve seçimi `data.theme` içine yazar.
Eski `darkMode` bayrağı "odak" temasına karşılık gelir, geriye dönük okunur.

### Yerleşim kararları

- **Üst şerit sabit** (`position: sticky`): kimlik, sekmeler, günün dört sayısı.
- **Çalışma ekranı katlamanın üstünde.** Eski hero + pano + görev çipleri ilk ekranı
  yiyordu; hepsi kaldırıldı ya da taşındı.
- **Hedef göstergesi rozetin dolgusu** (`.goal-fill`). Ayrı bir çizgi olarak denendi,
  "aktif sekme çizgisi" gibi okundu.
- **Klasör kenar çubuğu Kütüphane'nin içinde** — çalışırken klasör seçimi zaten
  `#studyFolder`'dan yapılıyor.
- **Nadir işler `<details class="menu">` içinde**; açılıp kapanması için JS yok.
- Sistem yazı tipleri; CDN yasağı yüzünden dışarıdan font çekilmiyor.
- `color-mix()` yalnızca üst şerit zemininde ve önünde taban değerle kullanılıyor;
  desteklenmeyen tarayıcıda kural düşse de şerit saydam kalmaz.

## 8. Senkron: birleştirme motoru (bölüm 11)

Cihazlar arası senkronun **veri kaybettirmeyen** çekirdeği. Ağ katmanı henüz yok;
bu bölüm saf ve test edilebilir hâlde duruyor.

`mergeData(local, remote)` → yeni bir veri nesnesi. Girdileri değiştirmez.

| Ne | Kural | Neden |
|---|---|---|
| Kelime / klasör | id başına `updatedAt` büyük olan | "Son yazan kazanır" tablette yapılan çalışmayı siler |
| Silinen kayıt | İz (`tombstones`) kaydın son değişikliğinden **sonraysa** silinir | İz yoksa kayıt geri dirilir |
| Silme vs sonraki düzenleme | Düzenleme kazanır | Silme kazara olabilir, düzenleme olamaz |
| Günlük sayaçlar | Gün başına **büyük olan** | Toplama, aynı oturum iki kez senkronlanınca kalıcı şişirir |
| Tek yönlü sayaçlar | Büyük olan | Geri gitmemeleri gerekiyor |
| Toplam XP | Günlerin toplamı ile mevcut değerin büyüğü | Türetilebilir olması sürüklenmeyi (drift) önler |
| Seri | Son üretim tarihi ileride olan taraf; tarih eşitse büyük seri | Bayat ama uzun seri kazanmamalı |
| Tercih (hedef, tema) | `stats.updatedAt` yeni olan taraftan | |
| Bozuk / yarım uzak veri | Yerel aynen döner | **Senkron hiçbir koşulda veri silmemeli** |

`touch(item)` her mutasyondan sonra çağrılmalı. **Çağırmayı unutmak = o değişikliğin
senkronda sessizce kaybolması.** Kelimeye dokunan yerler: form kaydetme, `markReviewed`,
`recordProduction`, `recordFlip`, `saveFieldFix`, içe aktarma, `fillMissingSentences`.

`deleteWord` / `deleteFolder` → `markDeleted(kind, id)`. İzler 120 günde bir temizlenir.

**Testler:** `node _test/merge-test.js` (23 senaryo). Birleştirmeye dokunan her
değişiklikten sonra çalıştır.

### İçe aktarma da bu motoru kullanıyor
`importBackup` eskiden yedekteki `stats`'ı **sessizce yok sayıyordu**: başka bir cihaza
JSON ile geçince kelimeler geliyor, XP / seri / geçmiş sıfırlanıyordu. Artık `mergeStats`
ile birleştiriliyor ve `tombstones` de taşınıyor.

### Supabase bağlantısı (bölüm 12)

Yerel-öncelikli. Uygulama her zaman `localStorage`'dan çalışır; bu katman arka planda
uzlaştırır. `SUPABASE_KEY` boşsa senkron tamamen kapalıdır ve hiçbir şey değişmez.

**Akış: çek → birleştir → kaydet → yaz.** Sıra kritik: önce yazsaydık, yeni bir cihazdaki
boş yerel veri bulut kopyasının üstüne biner ve her şey silinirdi.

| Uç | Nasıl |
|---|---|
| Kullanıcı listesi | `GET lexi_users?select=slug,name,updated_at` |
| Çekme | `GET lexi_users?slug=eq.<slug>&select=data,updated_at` |
| Yazma | `POST rpc/lexi_save` — PIN kontrolü veritabanında |

Hata durumunda **yerel veriye dokunulmaz**. Ağ hatası `offline`, diğerleri `error`
durumuna düşer; ikisi de üst şeritteki `#syncStatus` çipinde görünür.
Yazma `SYNC_PUSH_DELAY` ile toplanır — her tuşta ağa çıkılmaz.

SQL kurulumu: `_kurulum/supabase.sql`. PIN karması istemcide üretilir ve veritabanına
öyle gider; **PIN güvenlik değil eşiktir** (bkz. o dosyanın sonundaki not).

### PWA (manifest.json + sw.js)

Service worker stratejisi **önce ağ, olmazsa önbellek**. Tersi (önce önbellek) daha hızlı
açar ama güncelleme kimseye inmez — arkadaşlar aylarca eski sürümde kalır.
Supabase istekleri hiç yakalanmaz (`origin !== self.location.origin` → doğrudan ağa),
yoksa senkron bayat veri okurdu.

Uygulama değişince `sw.js` içindeki `CACHE` sürümü artırılmalı; `activate` eski
önbellekleri siler. Kayıt yalnızca `http(s)` üzerinde yapılır — `file://` ile açıldığında
tarayıcı izin vermiyor ve konsolu hatayla dolduruyordu.

**Doğrulanmadı:** service worker kaydı gömülü test tarayıcısında engelleniyor
(dosya erişilebilir, içerik tipi ve sözdizimi doğru, ama `register()` hata veriyor).
Gerçek adreste telefondan denenmeli.

## 9. Bir şeyi değiştirirken

| Değiştireceğin şey | Bakılacak yer |
|---|---|
| Kart alanı eklemek | `normalizeWords`, form (`index.html` + `wordForm.onsubmit`), `editWord`, `buildBackup`, `importBackup`, `importCsv`/`exportCsv`, `searchHaystack` |
| Yeni çalışma modu | `EXERCISE_LABELS`, `exerciseFor`, `promptHTML`, `hintLadder`, `acceptedForms`, `#studyMode` seçenekleri |
| Puan formülü | `productionXP` — tek yer |
| Kayda yeni alan | Mutasyon yerlerinde `touch()` çağrıldığından emin ol, sonra `node _test/merge-test.js` |
| SRS aralıkları | `markReviewed` — tek yer |
| Renk / biçim / tipografi | `style.css` token bloğu — tek yer |
| Yeni tema | `body[data-theme='ad']` bloğu + `THEMES` dizisi + bir `.theme-option` düğmesi |

`node --check app.js` sözdizimini doğrular. Elle test için klasörü basit bir statik
sunucuyla açmak yeterli; `file://` ile de çalışır.

## 10. Bilinen açıklar

- **Cihaz değişiminde veri taşınmıyor.** Yalnızca o tarayıcının `localStorage`'ında;
  JSON dışa/içe aktarma dışında senkron yok.
- **Düzensiz fiiller** boşluk doldurmada yakalanmıyor (kök eşleştirme yetmiyor).
- **`app.js` tek dosya ~2450 satır.** Bölmek build'siz kısıt yüzünden riskli; karar verilmedi.
- **Tanım alanı boş.** Mevcut 88 kartın tamamında `definition` yok; kütüphane filtresi
  ("Tanımı olmayanlar") bunu bir iş kuyruğuna çeviriyor.
