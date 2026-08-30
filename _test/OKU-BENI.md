# Testler

Uygulamanın çalışması için gerekli **değil**. Buradaki dosyalar `index.html` tarafından
yüklenmez; build adımı, paket yöneticisi veya bağımlılık yok. Sadece Node kuruluysa
elle çalıştırılır. Klasör adı `_` ile başlıyor: barındırmada da yayınlanmaz.

## merge-test.js

Cihazlar arası **birleştirme motorunun** senaryo testleri (`app.js` → bölüm 11).

Bu motor yanlış çalışırsa **veri kaybedilir** — tablette yaptığın çalışma telefonu
açınca silinir. O yüzden birleştirmeye dokunan her değişiklikten sonra çalıştır:

```
node _test/merge-test.js
```

Kapsadığı durumlar:
- Yeni düzenlemenin eskisini yenmesi (iki yönde de aynı sonuç)
- Silinen kaydın diğer cihazdan geri dirilmemesi
- Silmeden **sonra** düzenlenen kaydın yaşaması (silme kazara olabilir, düzenleme olamaz)
- Günlük sayaçların aynı oturum iki kez senkronlanınca şişmemesi
- Serinin son üretim tarihi ileride olan tarafı seçmesi
- Bozuk ya da yarım uzak verinin yerel veriyi silmemesi
- Birleştirmenin girdileri değiştirmemesi (saf fonksiyon)
