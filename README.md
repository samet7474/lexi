# Lexi — Kelime Çalışma Alanı

Lexi, İngilizce kelimeleri bağlamıyla saklamak ve **üreterek** kalıcı hâle getirmek için
yazılmış, sunucusuz bir web uygulamasıdır. Kurulum, build adımı veya internet gerektirmez.

**Canlı: https://samet7474.github.io/lexi/**

Bilgisayarda `index.html`'i çift tıklayarak da açılır.

## Temel fikir

Kelimeyi görünce anlamak (**tanıma**) ile gerektiğinde hafızadan çıkarmak (**üretim**) iki
ayrı beceridir. Lexi ikincisine göre kurulur:

- Ana çalışma modu **boşluk doldurma**: örnek cümle gösterilir, kelime silinmiştir, sen yazarsın.
- Flashcard yalnızca **yeni kelimeyle tanışma** anında kullanılır.
- **Puan üretimden gelir.** Kelime eklemek 0 puandır; puan, aradan zaman geçtikten sonra
  doğru hatırlamaktan gelir ve ara ne kadar uzunsa o kadar yüksektir.
- **Seri**, "siteye girdim"e değil "bugün üretim yaptım"a bağlıdır.

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `index.html` | Sayfa iskeleti |
| `style.css` | Tüm görünüm |
| `app.js` | Tüm uygulama mantığı |
| `_yedekler/` | JSON veri yedekleri (koda dâhil değil) |
| `_eski/` | Eski sürümler — **açma**, `_eski/OKU-BENI.md` sebebini anlatır |
| `CLAUDE.md`, `AGENTS.md` | Ajanlar için kurallar; ikisi birlikte güncellenir |
| `SABITLER.md` | Sürüm, anahtar, adres ve eşikler — tek yerde |
| `Backlog.md`, `Yapilanlar.md` | Açık işler / biten işler |

İlk üçü aynı klasörde durmalıdır.

## Görünüm ve düzen

Uygulama **Çalış** ekranında açılır: tek cümle ("Bugün 12 kelime seni bekliyor") ve
tek büyük **Başla** düğmesi. Kelime yoksa düğme "İlk kelimeni ekle" olur. Mod, kuyruk
ve klasör seçimi bu ekrandaki katlı **Çalışma ayarları**nda; dokunmazsan günlük akış çalışır.

Sayfanın tek sabit parçası **üst şerit**: kimlik, iki sekme (**Çalış · Kelimelerim**) ve
iki sayı: seri (`🔥 4 gün`) ve günün hedefi (`3/10 bugün`, rozetin içinde dolan çubukla).
Bugünkü XP turun sonunda, zamanı gelen kelime sayısı açılış ekranında görünür.

İstatistikler, Sözlük, Test ve Oyunlar (Challenge) sağ üstteki **⋯** menüsünün
"Diğer" bölümünde; tema, günlük hedef ve yedek de orada. Sadeleştirmenin gerekçesi
vault'ta (`Kararlar.md`, 2026-10-28).

### Temalar

Aynı menüden üç tema arasında geçiş yapılır; seçim kaydedilir.

| Tema | Nasıl |
|---|---|
| **Odak** (varsayılan) | Karanlık zemin, tek parlak vurgu, sıkı yerleşim. Odaklanmalık bir araç gibi. |
| **Sakin** | Temiz beyaz, dingin lacivert vurgu, net kontrast. Serif yalnızca İngilizce cümlede. |
| **Canlı** | Parlak, doygun mor vurgu, yuvarlak köşeler. En "oyun" duran seçenek. |

Tema yalnızca `style.css` içindeki token'ları değiştirir; `app.js` hiçbir renk bilmez.

## Sekmeler

**Çalış · Kelimelerim** — gerisi **⋯ → Diğer**: İstatistikler · Sözlük · Test · Oyunlar

### Kelimelerim (kodda `library`)

Kelime ekleme, düzenleme, silme; klasörler; arama; sayfalama.

Formda üç alan görünür: İngilizce, Türkçe, gördüğün cümle. Gerisi **Daha fazla**
altında; düzenlenen kartta o alanlardan biri doluysa açık gelir.

Kart alanları:

| Alan | Ne işe yarar |
|---|---|
| İngilizce kelime | zorunlu |
| Türkçe anlamı | zorunlu; tanım yoksa çalışma ekranında anlam ipucu olarak bu görünür |
| İngilizce tanım | **anlamın birincil hâli** — Cambridge Learner's tarzı basit tanım. Türkçe karşılıktan daha keskin daraltır: "ilgi çekici" interesting/engaging/appealing hepsi olabilir, tanım olmaz. |
| Örnek cümle | boşluk doldurma bundan üretilir; kelimeyi gördüğün gerçek cümle en iyisi |
| Kalıp kullanım | collocation |
| Nerede gördün | kaynak: kitap/sayfa, oyun, video |
| Seviye, hatırlama notu | isteğe bağlı |

Eş anlamlılar ve kelime ailesi formdan kaldırıldı (eski veri **silinmedi**, "Ek bilgiler"
altında görünmeye devam ediyor). Sebep: eş anlamlıyı aynı kartta tutmak karışıklık üretiyor.

Örnek cümleyi yazarken form anında söyler: kelime cümlede geçmiyorsa boşluk doldurma
üretilemez. Filtrelerde **Tanımı olmayanlar / Cümlesi otomatik olanlar / Cümlesi uygun
olmayanlar / Kaynağı yazılmamışlar** seçenekleri, eksik kartları toplu iş kuyruğu gibi
çalışmanı sağlar; başlıktaki sayaç kaç kart eksik olduğunu söyler.

**Otomatik cümle uyarısı.** Uygulamayla gelen hazır örnek cümleler dilbilgisel olarak
doğru ama bağlamı daraltmaz — "The clean room looked ___ to the visitors" boşluğuna on
beş kelime oturur. Bu kartlar `otomatik cümle` diye işaretlenir. Kaynakta gördüğün gerçek
cümleyi yazdığında işaret kalkar.

**Eksikleri akışın içinde kapat.** Çalışırken cevap verdikten sonra kart açılır; altındaki
**✎ Kartı düzelt** bağlantısı tanımı ve cümleyi birlikte düzenletir. Boş bıraktığın alan
eskisini korur. Kelimelerim'e gitmeden, turu bölmeden doldurursun.

### Çalış

Beş mod, tek motor. Üstteki ilk seçici modu, ikincisi hangi kartların geleceğini belirler.

| Mod | Ne yapar |
|---|---|
| **Günlük akış** (varsayılan) | Önce en fazla 5 yeni kelimeyle tanış, sonra vadesi gelenleri üretimle çalış |
| Boşluk doldurma | Cümlede boşluk, kelimeyi yaz |
| Anlamdan kelimeye | Tanımı (yoksa Türkçesini) gör, İngilizceyi yaz |
| Dinle ve yaz | Sesi dinle, duyduğunu yaz |
| Kart (tanışma) | Klasik flashcard + Bilmiyordum / Biraz biliyordum / Biliyordum |

Kuyruk seçenekleri: vadesi gelenler · hiç çalışılmamışlar · zorlandıklarım · tüm kartlar.
(Günlük akışta kuyruk otomatiktir, seçici kapanır.)

**Anlam bedava, biçim iş.** Boşluğun altında kelimenin anlamı **her zaman görünür**
(İngilizce tanım; yoksa Türkçe). Soru "hangi kelime aklımdan geçiyor" değil, "anlamını
biliyorsun, şimdi İngilizcesini üret". Cümlenin işi bilmece kurmak değil, kullanımı
göstermek.

**İpucu merdiveni yalnızca harf açar.** İlk harf → ilk üç harf → yarısı. Her ipucu puanın
dörtte birini götürür. Cümledeki boşluk harfler açıldıkça doldurulur (`a········` →
`app······`).

**Yazım hatası tam yanlış sayılmaz.** Bir (uzun kelimelerde iki) harflik sapma "az kalmıştı"
olur: puanın %60'ını alırsın, doğru yazılış gösterilir, kart "zor" olarak işaretlenir.

Cevap verdiğinde kartın tamamı (tanım, Türkçe, cümle, kalıp, kaynak, not) açılır.

#### Klavye

| Tuş | İşlev |
|---|---|
| `Enter` | Cevapla / sonraki karta geç |
| `H` | Bir sonraki ipucunu aç |
| `Enter` (açılışta) | Başla |
| `1` `2` `3` | Tanışma kartında Bilmiyordum / Biraz biliyordum / Biliyordum |
| `←` | Önceki kart |
| `S` | Seslendir |

### Aralıklı tekrar

Üretim sonucu SRS'i doğrudan besler:

| Sonuç | SRS notu |
|---|---|
| Doğru, ipucusuz | Kolay |
| Doğru ama ipuçlu, ya da yazım hatası | Zor |
| Yanlış / bilmiyorum | Tekrar |

Algoritma SM-2 benzeri, kendi yazılmış:

- **Tekrar:** zorluk +1, stabilite ×0.5, 10 dakika sonra
- **Zor:** zorluk +0.5, stabilite ×1.2, `stabilite` gün sonra
- **Kolay:** zorluk −0.5, stabilite × (2.2 − zorluk/10), `stabilite` gün sonra

### Puan (XP)

```
taban = 4 + 6 × log2(1 + son çalışmadan bu yana geçen gün)     (en çok 40)
yazım hatası → ×0.6
her ipucu    → ×0.75   (en az ×0.25)
yanlış       → 0
```

Yani aynı kelimeyi 10 dakika sonra bilmek ~4 XP, üç hafta sonra bilmek ~34 XP eder.
Challenge puanları bu tabloya karışmaz; kendi rekor tablolarında durur.

### Test · Challenge · Sözlük

- **Test** — 10 soruluk çoktan seçmeli tanıma kontrolü, sonunda analiz. XP vermez.
- **Challenge** — Hızlı hatırlama, Anlamını seç, İngilizcesini seç, Sonsuz mod,
  Eşleştirme, Düşen kelimeler. Her mod için ayrı rekor. Oyun katmanı, ana skorboard değil.
- **Sözlük** — alfabetik liste, arama, yazdırma/PDF.

### İstatistikler

Toplam ve günlük XP, toplam üretim, üretim doğruluğu, ortalama stabilite; değerlendirme
dağılımı; günlük üretim geçmişi; 90 günlük üretim ısı haritası; challenge rekorları;
en çok zorlandığın kelimeler; kelime bazlı tablo; veri ve yedekler.

## Veri Saklama

| Anahtar | İçerik |
|---|---|
| `lexi-vocabulary-v1` | Ana veri |
| `lexi-vocabulary-recovery-v1` | Kurtarma kopyası |
| `lexi-snapshots-v1` | Son 6 otomatik anlık görüntü |

Anlık görüntüler en fazla 5 dakikada bir alınır; **İstatistikler → Veri ve yedekler**
bölümünden tek tıkla geri yüklenir. Tarayıcı verileri temizlenirse yerel kayıtlar silinir —
düzenli olarak dışa aktar.

## İçe ve Dışa Aktarma

| Biçim | Yön | Not |
|---|---|---|
| JSON | içe + dışa | Tüm ilerleme dâhil: stabilite, zorluk, üretim sayaçları, **XP, seri ve geçmiş**, silinen kartların izi. Başka bir cihaza aktarınca hiçbir şey sıfırlanmaz. |
| CSV | içe + dışa | Excel uyumlu (UTF-8 BOM) |
| Anki | dışa | Sekme ayraçlı `.txt`; ön yüz / tanım+Türkçe+cümle / seviye |

CSV sütunları: İngilizce, Türkçe, örnek cümle, seviye, klasör, İngilizce tanım, kalıp
kullanım, kaynak, hatırlama notu, eş anlamlılar, kelime ailesi.

JSON yedekleri LinguaAI'nin `decks` / `cards` yapısıyla uyumludur. İçe aktarmada aynı
isimli klasörler birleştirilir, aynı İngilizce kelime güncellenir.

## Notlar

- Uygulama tamamen istemci tarafında çalışır; AI veya backend servisi kullanmaz.
- Seslendirme tarayıcının `speechSynthesis` desteğine bağlıdır; yoksa ses düğmeleri gizlenir.
- Mimari, veri modeli ve tasarım kararları için `PROJECT_ANALYSIS.md`.
