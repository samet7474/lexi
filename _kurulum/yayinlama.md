# Siteyi yayınlama — GitHub Pages

Amaç: uygulamanın bir adresi olsun ki telefonda ve tablette açılabilsin.
Terminal, komut, kurulum yok — hepsi tarayıcıdan, sürükle bırak.

## 1. Depo aç

1. `github.com` → sağ üstte **+** → **New repository**
2. **Repository name:** `lexi`
3. **Public** seç (Private olursa Pages ücretli plan ister)
4. Başka hiçbir kutuya dokunma → **Create repository**

## 2. Dosyaları yükle

Açılan sayfada **"uploading an existing file"** bağlantısına tıkla.
Masaüstündeki `site` klasöründen **şu altısını** sürükle:

```
index.html
style.css
app.js
manifest.json
sw.js
ikon/          (klasörün kendisi)
```

Sonra aşağıda **Commit changes**.

### Yüklemeyeceklerin — önemli

| Klasör | Neden |
|---|---|
| `_yedekler/` | **Kelime verin var. Public depoda herkes indirebilir.** |
| `_eski/` | Eski sürümler, gereksiz |
| `_test/` | Testler, uygulamaya dâhil değil |
| `_kurulum/` | Bu dosya ve SQL, gereksiz |

Yanlışlıkla yüklersen: depoda dosyaya gir → sağ üstteki çöp kutusu → sil.
(Not: `_` ile başlayan klasörleri GitHub Pages zaten yayınlamaz, ama depoda
görünür kalırlar — yani yine de yükleme.)

## 3. Pages'i aç

1. Depoda üstten **Settings**
2. Sol menüden **Pages**
3. **Source:** `Deploy from a branch`
4. **Branch:** `main` ve klasör `/ (root)` → **Save**
5. 1-2 dakika bekle, sayfayı yenile — yeşil bir kutuda adres çıkar:

```
https://<kullanıcı-adın>.github.io/lexi/
```

## 4. Telefonda ve tablette

1. Adresi tarayıcıda aç
2. **"Kim çalışıyor?"** ekranında bilgisayardaki **aynı ad ve aynı PIN**
3. Kelimeler buluttan iner, sağ üstte `✓ eşit` görürsün
4. Chrome menüsü (⋮) → **Ana ekrana ekle** → artık uygulama gibi açılır ve
   internet olmadan da çalışır

## 5. Sonra bir şey değişirse

Uygulamayı güncellediğimde: değişen dosyaları GitHub'da aynı yere tekrar yükle
(**Add file → Upload files**, aynı adla; üzerine yazar).

Telefonda eski sürüm görünürse `sw.js` içindeki `CACHE = 'lexi-v1'` satırındaki
sürümün artması gerekiyor demektir — bunu ben yaparım, sen sadece dosyayı yükle.

## Bilinenler

- **PWA kısmı gerçek cihazda denenmedi.** Dosyalar doğru, ama service worker'ın
  kaydı ancak gerçek adreste görülebilir. İlk açılışta sorun çıkarsa Chrome'da
  sayfayı bir kez yenile.
- **Adres herkese açık.** Bilen herkes girip kullanabilir — zaten istenen buydu.
  Uygulamanın kodu açık; **veriler ayrı bir yerde** (Supabase), depoda değil.
