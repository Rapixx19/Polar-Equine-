-- 006_seed.sql — idempotent seed for the three demo horses
-- Safe to re-run; on conflict do nothing.

insert into horses (name, breed, sex) values
  ('Hippo',   'KWPN',           'gelding'),
  ('Venus',   'Holsteiner',     'mare'),
  ('Titan',   'Selle Français', 'gelding')
on conflict do nothing;
