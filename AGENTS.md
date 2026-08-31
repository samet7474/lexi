# Lexi — ajanlar için çalışma kuralları

Claude dışı ajanlar bu dosyayı okur. `CLAUDE.md` ile **aynı gerçeği** anlatır;
o dosya ilişki ve yönlendirme katmanını da taşır, bu dosya işi anlatır.

Lexi: İngilizce kelimeleri **üreterek** öğrenme uygulaması. Sunucusuz, build'siz, tek sayfa.
Canlı: https://samet7474.github.io/lexi/ · Depo: `github.com/samet7474/lexi`
Sahibi: Karpuz. Türkçe konuşulur. Uzun giriş yapma, ilk cümlede işe başla.

## Değişmez kısıtlar
Tercih değil kural. Bir öneri bunlardan birini bozuyorsa öneri yanlıştır.
- **Build adımı yok.** npm, bundler, paket yöneticisi, derleme, TypeScript yok.
- **Yazılan sunucu kodu yok.** Mantık istemcide; Supabase yalnızca veri deposu.
- **CDN yok.** Dış bağımlılık yok; font dâhil hiçbir şey dışarıdan çekilmez.
- `index.html` + `style.css` + `app.js` aynı klasörde durur.
- **Ürün ekseni:** puan yalnızca üretimden gelir, aralık uzunluğuna göre ağırlıklıdır;
  seri "bugün üretim yaptım"a bağlıdır. Bu ekseni bozan öneri yanlıştır.

## Dosya haritası
| Yol | Ne |
| --- | --- |
| `index.html` | Sayfa iskeleti |
| `style.css` | Tüm görünüm; token tabanlı, token bloğu dışında hex yok |
| `app.js` | Tüm mantık; 13 numaralı bölüm, başında içindekiler |
| `sw.js`, `manifest.json`, `ikon/` | PWA |
| `README.md` | Kullanım rehberi |
| `PROJECT_ANALYSIS.md` | Mimari, veri şeması, değişiklik haritası |
| `SABITLER.md` | Değişmeyen değerler ve kodda nerede durdukları |
| `Backlog.md` / `Yapilanlar.md` | Açık işler / biten işler |
| `_test/` | `node _test/merge-test.js` — uygulamaya dâhil değil |
| `_kurulum/` | Supabase SQL'i ve yayınlama rehberi — uygulamaya dâhil değil |
| `_eski/` | Eski sürüm arşivi — **dokunma**, `_eski/OKU-BENI.md` sebebini anlatır |
| `_yedekler/` | Kişisel veri — commit edilmez |

## Dokunma
- `_eski/` ve `_yedekler/` (biri veriyi bozar, biri kişisel).
- `SUPABASE_KEY`: publishable anahtar, bilerek açık. `service_role` anahtarı buraya
  **asla** konmaz.
- Elle yazılmış örnek cümleler: `fillMissingSentences()` yalnızca boş ya da otomatik
  üretilmiş cümleyi doldurur. Bu davranışı gevşetmek eski sürümün en yıkıcı hatasıydı.
- Senkron hiçbir koşulda veri silmez: bozuk/yarım uzak veride yerel aynen döner.

## Değişiklik yaparken
1. Dosyayı **önce oku**; `app.js` 3000+ satır, varsayımla yazmak bozar.
2. Kayda dokunan her mutasyondan sonra `touch()` çağır — unutmak, değişikliğin
   senkronda sessizce kaybolması demektir.
3. `node --check app.js`; birleştirmeye dokunduysan `node _test/merge-test.js` (23 senaryo).
4. Davranış değiştiyse `APP_VERSION` **ve** `sw.js` içindeki `CACHE` birlikte artar.
5. `Backlog.md`'yi güncelle; biten madde tarihiyle `Yapilanlar.md`'ye taşınır.

## Ortam
Windows 11 + **PowerShell 5.1**. Karpuz'a verilen komut PowerShell sözdiziminde olur:
`&&` yok (`;` kullan), `?:` `??` `?.` yok, `head`/`tail`/`which`/`touch` yok.
Dosya açtırma komutu verme; "şu klasöre git, çift tıkla" de.

## Senkron kuralı
`AGENTS.md` ve `CLAUDE.md` birlikte yaşar. **Birini güncelleyen diğerini de günceller.**
Bir kural, bir yol veya bir yasak değiştiğinde iki dosyada da değişir. Yalnız birini
güncellemek, ajanların farklı gerçeklerle çalışması demektir.

## Şişirme
Bu iki dosyanın her satırı her oturumda bağlama giriyor. Uzun anlatım `README.md` ya da
`PROJECT_ANALYSIS.md` içine yazılır; buraya yalnızca kural ve yol yazılır.
