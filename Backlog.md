# Lexi — Backlog

Yalnızca **açık** işler. Biten madde silinmez, tarihiyle `Yapilanlar.md`'ye taşınır.
Gerekçeler ve tartışma burada değil: vault `MyMind/🏰 300-Projects/Lexi/` altında
`Kararlar.md` (neden) ve `Fikirler.md` (ham fikir). Burası "ne yapılacak" listesidir.

Güncelleme: 2026-09-01

## Şimdi — darboğaz veri, özellik değil

88 kartın hiçbirinde İngilizce tanım yok ve hepsinin cümlesi otomatik. Sistem bunu
görünür ve düzeltilebilir kıldı; kalan iş Karpuz'un elinde.

- [ ] Çalışırken çıkan kartta **Tanım ekle** düğmesini kullan (tur bölünmüyor).
- [ ] Otomatik cümleli kartlarda kitapta/videoda gördüğün gerçek cümleyi yaz.
- [ ] Kütüphane filtreleriyle toplu çalış: *Tanımı olmayanlar · Cümlesi otomatik olanlar*.
- [ ] Bir hafta böyle gidip bak: boşluk doldurmadaki belirsizlik hissi geçti mi?

## Doğrulanmamış

- [ ] **Telefon/tablet saha testi:** ana ekrana ekleme, uçak modunda açılış, aynı
      kullanıcı + PIN ile kelimelerin inmesi. (Sürüm 2026-08-30.4 telefonda açıldı;
      çevrimdışı ve ana ekran denenmedi.)

## Bakım

- [ ] **Dokümanlar kodun gerisinde.** `PROJECT_ANALYSIS.md` §5 `SCHEMA_VERSION = 5`
      diyor (gerçek: 6), satır sayıları eski (`app.js` ~2480 değil 3280), §10'daki
      "cihaz değişiminde veri taşınmıyor" açığı senkronla kapandı. `README.md`'nin
      "Veri Saklama" tablosu kullanıcı katmanı öncesi anahtarları gösteriyor ve
      senkrondan hiç söz etmiyor.

## Karar bekleyen

- [ ] **Test sekmesi kalsın mı?** Artık XP vermiyor, tanıma kontrolü yapıyor.
      Challenge'ın bir modu mu olsun? Bir süre kullanıp karar ver.
- [ ] **Üç tema da kalsın mı?** Kullanılmayan tema bakım yüküdür.
- [ ] **`app.js` tek dosya (3280 satır) bölünsün mü?** Build yasağı yüzünden bölmek
      `<script>` çoğaltmak demek; riski faydasından büyük olabilir.
- [ ] **Kullanıcı silme** uygulamadan yapılamıyor, yalnızca SQL'den. Gerekli mi?

## Sonrası — konuşulmadı

- [ ] **Tanım doldurma turu.** Kütüphanede tek tek düzenlemek yorucu; "sıradaki karta
      tanım yaz" akışı işi hızlandırabilir.
- [ ] **Düzensiz fiiller.** Kök eşleştirme "bring → brought"u yakalamıyor. 88 kartta
      1 kartı kurtarır; kelime sayısı artınca bak.
- [ ] **Kartın kendi geçmişi.** `produced` / `producedCorrect` veride var ama hiçbir
      yerde gösterilmiyor. Kart açılınca "4 kez ürettin, 3'ü doğru" satırı.
- [ ] Sonsuz mod ve Eşleştirme dışındaki Challenge modlarına zorluk seviyesi.
