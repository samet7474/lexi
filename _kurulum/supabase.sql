-- =============================================================================
-- Lexi — Supabase kurulumu
--
-- Nereye: Supabase panelinde sol menü → SQL Editor → New query → yapıştır → Run.
-- Bir kez çalıştırılır. Tekrar çalıştırmak zarar vermez (hepsi "varsa dokunma").
--
-- Tasarım kararı: her kullanıcının TÜM verisi tek bir JSON belgesi olarak durur.
-- Uygulamanın birleştirme motoru zaten tam veri nesneleri üzerinde çalışıyor
-- (app.js bölüm 11), o yüzden veritabanının kelime kelime bilmesine gerek yok.
-- =============================================================================

create table if not exists lexi_users (
    slug        text primary key,                       -- 'karpuz'
    name        text not null,                          -- 'Karpuz'
    pin_hash    text not null,                          -- istemcide üretilir
    data        jsonb not null default '{}'::jsonb,     -- tüm vault
    updated_at  timestamptz not null default now()
);

alter table lexi_users enable row level security;

-- ---------------------------------------------------------------- Okuma
-- Karpuz'un kararı: kelimeler herkese görünür. Ama pin_hash görünmez —
-- sütun izniyle kısıtlanıyor, çünkü RLS satır düzeyinde çalışır, sütun düzeyinde değil.
revoke all on lexi_users from anon;
grant select (slug, name, data, updated_at) on lexi_users to anon;

drop policy if exists "herkes okuyabilir" on lexi_users;
create policy "herkes okuyabilir" on lexi_users for select to anon using (true);

-- ---------------------------------------------------------------- Yazma
-- Doğrudan yazma yok. Tek kapı bu fonksiyon; PIN'i burada kontrol ediyor.
-- security definer: fonksiyon tablo sahibinin yetkisiyle çalışır, anon'un değil.
create or replace function lexi_save(p_slug text, p_name text, p_pin text, p_data jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
    mevcut text;
    yeni   timestamptz;
begin
    if p_slug is null or length(p_slug) = 0 then
        raise exception 'kullanici adi bos';
    end if;

    select pin_hash into mevcut from lexi_users where slug = p_slug;

    if mevcut is null then
        insert into lexi_users (slug, name, pin_hash, data)
        values (p_slug, p_name, p_pin, p_data)
        returning updated_at into yeni;
    elsif mevcut = p_pin then
        update lexi_users
           set data = p_data, name = p_name, updated_at = now()
         where slug = p_slug
        returning updated_at into yeni;
    else
        raise exception 'PIN yanlis';
    end if;

    return yeni;
end;
$$;

grant execute on function lexi_save(text, text, text, jsonb) to anon;

-- ---------------------------------------------------------------- Bakım
-- Bir kullanıcıyı silmek (uygulamadan yapılamaz, bilerek):
--     delete from lexi_users where slug = 'kullanici-adi';
-- Kimler var:
--     select slug, name, updated_at, jsonb_array_length(data->'words') as kelime
--       from lexi_users order by updated_at desc;

-- =============================================================================
-- Dürüst not: PIN güvenlik değil, eşiktir.
-- Dört haneli bir sayı denenerek bulunabilir ve karıştırma fonksiyonu istemcide,
-- yani herkesin görebileceği yerde. Amaç sırrı saklamak değil; kazara ya da şaka
-- olsun diye başkasının verisinin üstüne yazmayı zorlaştırmak.
-- Gerçek gizlilik gerekirse Supabase Auth'a geçmek gerekir — o ayrı bir karar.
-- =============================================================================
