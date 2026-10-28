# Lexi — Yapılanlar

`Backlog.md`'den kapanan maddeler tarihiyle buraya iner. Neyi ne zaman bitirdiğim de
kayıttır; gerekçeler vault'taki `Kararlar.md`'de.

## 2026-10-28 — Sadeleştirme (sürüm 2026-10-28.1)
- Uygulama Kütüphane'de değil **Çalış**'ta açılıyor: tek cümle + tek büyük "Başla".
  Kelime yoksa "İlk kelimeni ekle".
- Sekmeler 6 → 2 (**Çalış · Kelimelerim**); Test, Oyunlar, Sözlük, İstatistikler
  ⋯ menüsüne indi. Hiçbiri silinmedi.
- Üst şerit 4 simge → 2 yazılı sayı ("4 gün", "3/10 bugün"); görev şeridi kalktı.
- Mod / kuyruk / klasör seçicileri katlı "Çalışma ayarları"na girdi; klavye satırı
  dokunmatik ekranda gizli.
- Tanışma düğmeleri: Bilmiyordum / Biraz biliyordum / Biliyordum (SRS aynı).
- Her karttaki iki uyarı kutusu → tek "✎ Kartı düzelt"; tanım ve cümle birlikte düzenlenir.
- Kelime formu 3 alan; gerisi "Daha fazla" altında.

## 2026-08-30 — Faz 0–5, tek günde

### Faz 0 · Temizlik
- Eski tek parça HTML'ler `_eski/` altına alındı, uzantıları `.html.bak` yapıldı —
  çift tıklanınca açılmıyorlar, canlı veriyi bozma riski kapandı.
- Yedek JSON'lar `_yedekler/` altına toplandı.

### Faz 1 · Kart yapısı
- `definition` (basit İngilizce tanım) ve `source` alanları eklendi.
- `synonyms` / `wordFamily` formdan kaldırıldı; **veri silinmedi**.
- Form, kelime cümlede geçmiyorsa anında uyarıyor.
- Yeni alanlar JSON / CSV / Anki / yazdırma çıktılarına girdi.

### Faz 2 · Çalışma yönü
- **Boşluk doldurma ana mod** oldu; 88 kartın 87'si uygun.
- Flashcard "tanışma" moduna indi; günlük akış: 5 yeni kelime → vadesi gelenler.
- Yazma sekmesi Çalış'a katlandı: 7 sekme → 6, tek motor beş mod.
- Yazım hatası toleransı (`near`) karara bağlandı.

### Faz 3 · Puan
- XP yalnızca üretimden, aralığın logaritmasıyla ağırlıklı; kelime eklemek 0 puan.
- Seri "siteye girdim"den "bugün üretim yaptım"a geçti; mevcut seri göçte korundu.
- Challenge rekorları ana skorborddan ayrı tutuldu.

### Faz 4 · Görünüm
- Teşhis: sorun renk değil **sıralama**ydı — çalışma ekranı katlamanın altındaydı.
- Hero + pano kartları + görev çipleri kaldırıldı; sabit üst şerit geldi.
- `style.css` token tabanlı baştan yazıldı; token bloğu dışında hex yok.
- Üç tema: Odak (varsayılan) · Sakin · Canlı. Sakin bir kez reddedilip yeniden yazıldı.
- Anlam ipucu varsayılan açık; ipucu merdiveni yalnızca harf açıyor.
- Otomatik cümle tespiti + kütüphane işareti + `filler` filtresi.
- Çalışma ekranında **Tanım ekle / Cümleyi düzelt** — turu bölmeden.

### Faz 5 · Her cihazdan erişim
- **Şema v6 + birleştirme motoru:** `updatedAt`, `tombstones`, `mergeData`;
  23 senaryoluk `_test/merge-test.js`. "Son yazan kazanır" reddedildi.
- İçe aktarmanın istatistikleri yutma hatası bulundu ve düzeltildi (cihaz değişince
  XP / seri / geçmiş sıfırlanıyordu).
- **Kullanıcı katmanı:** kapı, PIN, kişi başına depolama, eski verinin devralınması.
- **Supabase senkronu:** çek → birleştir → kaydet → yaz; üst şeritte durum çipi;
  çevrimdışı / hata ayrımı. Dört tehlikeli senaryo sahte arka uçla kanıtlandı.
- Publishable anahtar bağlandı; gerçek arka uçta uçtan uca doğrulandı.
- Senkron turu sürerken gelen istek düşürülüyordu → sıraya alındı.
- **PWA:** `manifest.json`, `sw.js`, bağımlılıksız üretilmiş ikonlar.
- **Yayına girdi:** https://samet7474.github.io/lexi/ — kişisel klasörler 404,
  service worker aktif, Supabase'e CORS sorunsuz.
- Karpuz gerçek verisiyle girdi: 88 kelime, XP 77, seri 3, şema v6.
- Test hesapları bulutta temizlendi.
- Çalış gezinmesi düzeltildi: sarma yok, cevaplanmış kart tekrar sorulmuyor.
- **Görünür sürüm + service worker'ın güncellemeyi kovalaması** — "düzelttim ama
  telefona inmedi" sorunu kapandı.
- **Sürüm kontrolü kuruldu:** `site` klasörü git deposu oldu, `samet7474/lexi`'ye bağlandı.
  `_yedekler/` ve `_eski/` gitignore'da.

## 2026-08-28
- Tek dosyalık uygulama üçe bölündü: `index.html` + `style.css` + `app.js`.

## 2026-09-01
- Depoya `CLAUDE.md`, `AGENTS.md`, `SABITLER.md`, `Backlog.md`, `Yapilanlar.md` eklendi
  (Avenox proje reçetesinin 2., 5. ve 6. adımları).
