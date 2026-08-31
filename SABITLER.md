# Lexi — Sabitler

Değişmeyen değerler tek yerde. **Bu dosya tek gerçek kaynak değil, aynadır:** değerlerin
kendisi kodda yaşar (build adımı yok, bir `config.js` eklemek dördüncü bir dosya ve yeni
bir `<script>` demek olurdu). Burası "bu değer neydi, nerede duruyor, değiştirirken
yanında ne değişir" sorusunun cevabıdır.

Bir sabiti değiştirdiğinde **bu tabloyu da güncelle.** Değer burada ve kodda farklıysa
kod haklıdır; tablo bozuktur.

Son eşitleme: 2026-09-01.

## Kimlik ve adres

| Ne | Değer | Nerede |
| --- | --- | --- |
| Canlı adres | `https://samet7474.github.io/lexi/` | GitHub Pages, `main` dalı |
| Depo | `github.com/samet7474/lexi` | `git remote -v` |
| Yerel klasör | `C:\Users\samet\OneDrive\Desktop\site` | |
| Supabase projesi | `atizezifilmxuqxjrjnt` | `SUPABASE_URL` — app.js §12 |
| Publishable anahtar | `sb_publishable_gIIesmnDKhfQR5GweQmgLQ_BMjWBeDt` | `SUPABASE_KEY` — app.js §12 |
| Tablolar / fonksiyon | `lexi_users`, `rpc/lexi_save` | `_kurulum/supabase.sql` |

Publishable anahtar **bilerek açıktır**; yetkisi RLS ve `lexi_save` ile sınırlı.
`service_role` anahtarı depoya asla girmez.

## Sürümler — birlikte artar

| Sabit | Değer | Yer |
| --- | --- | --- |
| `APP_VERSION` | `2026-08-30.4` | app.js §1 — menüde görünür |
| `CACHE` | `lexi-v4` | sw.js |
| `SCHEMA_VERSION` | `6` | app.js §1 |

Davranış değiştiğinde `APP_VERSION` **ve** `CACHE` birlikte artar; artmazsa telefonlara
yeni sürüm inmez. `SCHEMA_VERSION` yalnızca veri şeması değişince artar ve `runMigrations()`
içine eklemeli (veri silmeyen) bir adım gerektirir.

## Depolama anahtarları (localStorage)

| Anahtar | İçerik |
| --- | --- |
| `lexi-session-v1` | Bu cihazda açık kullanıcı |
| `lexi-users-v1` | Cihazda bilinen kullanıcılar: ad + PIN karması |
| `lexi-user-<slug>` | O kullanıcının verisi |
| `lexi-user-<slug>-recovery` | Kurtarma kopyası |
| `lexi-user-<slug>-snapshots` | Son 6 anlık görüntü |
| `lexi-vocabulary-v1` | **Eski**, kullanıcı katmanından önce; ilk kullanıcı devralır, silinmez |
| `lexi-dev-sync` | `'1'` ise localhost'ta senkron açılır (varsayılan kapalı) |

## Eşikler ve ayarlar (app.js)

| Sabit | Değer | Ne yapar |
| --- | --- | --- |
| `PAGE_SIZE` | 40 | Liste sayfalama |
| `SNAPSHOT_LIMIT` | 6 | Saklanan anlık görüntü sayısı |
| `SNAPSHOT_MIN_GAP_MS` | 5 dk | İki anlık görüntü arası en az süre |
| `HARD_THRESHOLD` | 6.5 | `cardDifficulty` bunun üstündeyse "zorlandığım" |
| `TOMBSTONE_TTL_DAYS` | 120 | Silinme izleri bu kadar taşınır |
| `DEFAULT_FOLDER_NAME` | `Genel` | |
| `NEW_PER_SESSION` | 5 | Günlük akışta bir turda kaç yeni kelime |
| `FALLBACK_ROUND` | 20 | Vadesi gelen yoksa kaç kart karıştırılır |
| `XP_MAX` | 40 | Tek üretimden alınabilecek en yüksek puan |
| `SYNC_PUSH_DELAY` | 8000 ms | Yazma toplama gecikmesi |
| `SYNC_TIMEOUT` | 12000 ms | Ağ isteği zaman aşımı |

## Formüller — tek yerde durur

| Ne | Fonksiyon | Kural |
| --- | --- | --- |
| Puan | `productionXP()` | `min(40, round(4 + 6·log2(1 + günFarkı)))`; `near` ×0.6; her ipucu ×0.75, en az ×0.25; `wrong` 0 |
| SRS aralığı | `markReviewed()` | Tekrar: zorluk +1, stabilite ×0.5, 10 dk · Zor: +0.5, ×1.2 · Kolay: −0.5, ×(2.2 − zorluk/10) |
| Yazım toleransı | `judgeAnswer()` | Levenshtein 1 (8+ harflide 2) → `near` |

Puan formülünü değiştirmek tek dosyada tek fonksiyonu değiştirmektir; başka yerde
kopyası yoktur. Aynısı SRS için de geçerli.

## PWA

| Ne | Değer |
| --- | --- |
| Önbellek stratejisi | Önce ağ, olmazsa önbellek |
| Önbelleklenen kabuk | `./`, `index.html`, `style.css`, `app.js`, `manifest.json`, iki ikon |
| Tema/zemin rengi | `#0d0f13` (manifest.json) |
| Kayıt koşulu | Yalnızca `http(s)`; `file://` üzerinde kayıt yapılmaz |

Supabase istekleri service worker tarafından **hiç yakalanmaz**; yakalansa senkron
bayat veri okurdu.
