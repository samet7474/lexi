# Lexi — atölye kuralları

Lexi, İngilizce kelimeleri **üreterek** öğrenme uygulaması. Sunucusuz, build'siz, tek sayfa.
Canlı: https://samet7474.github.io/lexi/ · Depo: `github.com/samet7474/lexi`

Bu dosya bir yönlendiricidir. Gerçek için güncel dosyaları oku, buradan varsayma.

## Değişmez kısıtlar
Tercih değil kural. Bir öneri bunlardan birini bozuyorsa öneri yanlıştır.
- **Build adımı yok.** npm, bundler, paket yöneticisi, derleme yok.
- **Yazılan sunucu kodu yok.** Mantık istemcide; Supabase yalnızca veri deposu.
- **CDN yok.** Dış bağımlılık yok; font dâhil hiçbir şey dışarıdan çekilmez.
- `index.html` + `style.css` + `app.js` aynı klasörde durur.
- **Ürün ekseni:** puan yalnızca üretimden gelir, aralık uzunluğuna göre ağırlıklıdır;
  seri "bugün üretim yaptım"a bağlıdır. Bu ekseni bozan öneri yanlıştır.

## Nereye bakılır
| Ne | Yer |
| --- | --- |
| Kullanım rehberi | `README.md` |
| Mimari, veri şeması, "şunu değiştireceğim, nereye bakayım" | `PROJECT_ANALYSIS.md` |
| Değişmeyen değerler (sürüm, anahtar, adres, eşikler) | `SABITLER.md` |
| Açık işler | `Backlog.md` (biten madde `Yapilanlar.md`'ye taşınır) |
| Kararların **gerekçesi** | vault: `MyMind/🏰 300-Projects/Lexi/Kararlar.md` |
| Ham fikir ve tartışma | vault: `MyMind/🏰 300-Projects/Lexi/Fikirler.md` |

Kod klasörü karar tutmaz, vault kod tutmaz. Beyin ayrı, atölye ayrı.

## Çalışma kuralları
- **Bir dosyayı değiştirmeden önce oku.** `app.js` 3000+ satır; varsayımla yazmak bozar.
- **Kayda dokunan her mutasyondan sonra `touch()` çağır.** Unutmak, o değişikliğin
  senkronda sessizce kaybolması demektir.
- Birleştirmeye (bölüm 11) dokunduysan `node _test/merge-test.js` çalıştır — 23 senaryo.
- Her değişiklikten sonra `node --check app.js`.
- **Uygulama davranışı değiştiyse `APP_VERSION` ve `sw.js` içindeki `CACHE` birlikte artar.**
  Artmazsa "düzelttim ama telefona inmedi" yaşanır.
- `_eski/` içine dokunma, oradan kod kopyalama; o dosyalar aynı depolama anahtarına yazar.
- `_yedekler/` kişisel veridir, commit edilmez (gitignore'da).
- Test verisiyle canlı arka uca bağlanma; önce `localStorage.clear()`.
- Rutin işler için izin isteme, commit dâhil — yap, sonra söyle. `git push` bunun dışında.
- Karpuz'a verilen komutlar **PowerShell 5.1** sözdiziminde olur: `&&` yok, `;` kullan.

## Senkron kuralı
`CLAUDE.md` ve `AGENTS.md` birlikte yaşar. **Birini güncelleyen diğerini de günceller.**
Aynı gerçeğin iki okuyucuya bakan yüzü; bir kural, bir yol veya bir yasak değiştiğinde
iki dosyada da değişir. Yalnız birini güncellemek, ajanların farklı gerçeklerle
çalışması demektir.

## Devir kuralı
Her anlamlı oturum iz bırakır: `Backlog.md` güncellenir, gerekçe doğduysa vault'taki
`Kararlar.md`'ye yazılır.
