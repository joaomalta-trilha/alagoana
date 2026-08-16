-- Tipo de veículo e catálogo de motos
--
-- O cadastro assumia que todo veículo é carro. Na prática entra moto na
-- troca — é o caso mais comum — e eventualmente reboque ou implemento.
--
-- Três decisões que o schema registra:
--
--   1. `marca` deixa de ter nome único e passa a ter (nome, tipo) único.
--      Honda e BMW existem nos dois mundos e significam coisas diferentes: a
--      Honda de carro não vende CG 160. Sem isso, o segundo catálogo não
--      caberia na mesma tabela.
--
--   2. `outro` não tem catálogo, e por isso `marca.tipo` só aceita carro ou
--      moto. Reboque, náutico e implemento são exceção; manter catálogo para
--      exceção é criar lista que ninguém rega.
--
--   3. As marcas de moto chinesas entram de propósito. A omissão deliberada
--      da carga inicial valia só para automóvel; em moto, Haojue e Shineray
--      são volume corrente, especialmente no Nordeste.

create type tipo_veiculo as enum ('carro', 'moto', 'outro');

alter table veiculo add column tipo tipo_veiculo not null default 'carro';
create index veiculo_tipo_idx on veiculo (tipo);

comment on column veiculo.tipo is
  'Todo veículo da carga inicial é carro. O padrão existe para que o cadastro '
  'continue funcionando sem ninguém pensar no assunto no caso comum.';

alter table marca add column tipo tipo_veiculo not null default 'carro';
alter table marca add constraint marca_tipo_com_catalogo check (tipo in ('carro', 'moto'));
alter table marca drop constraint marca_nome_key;
alter table marca add constraint marca_nome_tipo_key unique (nome, tipo);


-- ============================================ catálogo de motos (20 marcas)
with marcas_novas as (
  insert into marca (nome, tipo)
  values ('Aprilia', 'moto'),
         ('BMW', 'moto'),
         ('Dafra', 'moto'),
         ('Ducati', 'moto'),
         ('Haojue', 'moto'),
         ('Harley-Davidson', 'moto'),
         ('Honda', 'moto'),
         ('Husqvarna', 'moto'),
         ('KTM', 'moto'),
         ('Kasinski', 'moto'),
         ('Kawasaki', 'moto'),
         ('MV Agusta', 'moto'),
         ('Piaggio', 'moto'),
         ('Royal Enfield', 'moto'),
         ('Shineray', 'moto'),
         ('Suzuki', 'moto'),
         ('Traxx', 'moto'),
         ('Triumph', 'moto'),
         ('Vespa', 'moto'),
         ('Yamaha', 'moto')
  returning id, nome
)
insert into modelo (marca_id, nome)
select marcas_novas.id, entrada.modelo
  from marcas_novas
  join (values ('Aprilia', 'RS 660'),
         ('Aprilia', 'SR 150'),
         ('Aprilia', 'SR 160'),
         ('Aprilia', 'Tuono 660'),
         ('BMW', 'C 400 X'),
         ('BMW', 'F 750 GS'),
         ('BMW', 'F 800 GS'),
         ('BMW', 'F 850 GS'),
         ('BMW', 'F 900 R'),
         ('BMW', 'F 900 XR'),
         ('BMW', 'G 310 GS'),
         ('BMW', 'G 310 R'),
         ('BMW', 'R 1200 GS'),
         ('BMW', 'R 1250 GS'),
         ('BMW', 'R 1250 RT'),
         ('BMW', 'R nineT'),
         ('BMW', 'S 1000 R'),
         ('BMW', 'S 1000 RR'),
         ('BMW', 'S 1000 XR'),
         ('Dafra', 'Apache 150'),
         ('Dafra', 'Citycom 300'),
         ('Dafra', 'Horizon 150'),
         ('Dafra', 'Next 250'),
         ('Dafra', 'NH 190'),
         ('Dafra', 'Riva 150'),
         ('Dafra', 'Roadwin 250'),
         ('Dafra', 'Speed 150'),
         ('Ducati', 'Diavel'),
         ('Ducati', 'Hypermotard'),
         ('Ducati', 'Monster'),
         ('Ducati', 'Multistrada'),
         ('Ducati', 'Panigale V2'),
         ('Ducati', 'Panigale V4'),
         ('Ducati', 'Scrambler'),
         ('Ducati', 'Streetfighter'),
         ('Ducati', 'SuperSport'),
         ('Haojue', 'Chopper Road 150'),
         ('Haojue', 'DK 150'),
         ('Haojue', 'DR 160'),
         ('Haojue', 'Master Ride 150'),
         ('Haojue', 'NK 150'),
         ('Harley-Davidson', 'Fat Boy'),
         ('Harley-Davidson', 'Forty-Eight'),
         ('Harley-Davidson', 'Heritage Classic'),
         ('Harley-Davidson', 'Iron 883'),
         ('Harley-Davidson', 'Pan America'),
         ('Harley-Davidson', 'Road Glide'),
         ('Harley-Davidson', 'Road King'),
         ('Harley-Davidson', 'Softail Slim'),
         ('Harley-Davidson', 'Sportster S'),
         ('Harley-Davidson', 'Street 750'),
         ('Harley-Davidson', 'Street Bob'),
         ('Harley-Davidson', 'Street Glide'),
         ('Honda', 'ADV 150'),
         ('Honda', 'Africa Twin'),
         ('Honda', 'Biz 110i'),
         ('Honda', 'Biz 125'),
         ('Honda', 'CB 300F Twister'),
         ('Honda', 'CB 500F'),
         ('Honda', 'CB 500X'),
         ('Honda', 'CB 650R'),
         ('Honda', 'CB 1000R'),
         ('Honda', 'CBR 500R'),
         ('Honda', 'CBR 650R'),
         ('Honda', 'CBR 1000RR'),
         ('Honda', 'CG 160 Cargo'),
         ('Honda', 'CG 160 Fan'),
         ('Honda', 'CG 160 Start'),
         ('Honda', 'CG 160 Titan'),
         ('Honda', 'Elite 125'),
         ('Honda', 'Forza 350'),
         ('Honda', 'NC 750X'),
         ('Honda', 'NXR 160 Bros'),
         ('Honda', 'PCX 160'),
         ('Honda', 'Pop 110i'),
         ('Honda', 'Sahara 300'),
         ('Honda', 'XRE 190'),
         ('Honda', 'XRE 300'),
         ('Husqvarna', 'Norden 901'),
         ('Husqvarna', 'Svartpilen 401'),
         ('Husqvarna', 'Vitpilen 401'),
         ('KTM', 'Adventure 390'),
         ('KTM', 'Adventure 890'),
         ('KTM', 'Duke 200'),
         ('KTM', 'Duke 250'),
         ('KTM', 'Duke 390'),
         ('KTM', 'Duke 790'),
         ('KTM', 'RC 390'),
         ('Kasinski', 'Comet 250'),
         ('Kasinski', 'Mirage 250'),
         ('Kasinski', 'Prima 150'),
         ('Kasinski', 'Win 110'),
         ('Kawasaki', 'Ninja 300'),
         ('Kawasaki', 'Ninja 400'),
         ('Kawasaki', 'Ninja 650'),
         ('Kawasaki', 'Ninja ZX-6R'),
         ('Kawasaki', 'Ninja ZX-10R'),
         ('Kawasaki', 'Versys 650'),
         ('Kawasaki', 'Versys 1000'),
         ('Kawasaki', 'Vulcan S'),
         ('Kawasaki', 'Z400'),
         ('Kawasaki', 'Z650'),
         ('Kawasaki', 'Z900'),
         ('Kawasaki', 'Z1000'),
         ('MV Agusta', 'Brutale 800'),
         ('MV Agusta', 'Dragster 800'),
         ('MV Agusta', 'F3 800'),
         ('MV Agusta', 'Turismo Veloce'),
         ('Piaggio', 'Beverly 300'),
         ('Piaggio', 'Liberty 150'),
         ('Piaggio', 'Medley 150'),
         ('Piaggio', 'MP3 300'),
         ('Royal Enfield', 'Classic 350'),
         ('Royal Enfield', 'Continental GT 650'),
         ('Royal Enfield', 'Himalayan'),
         ('Royal Enfield', 'Hunter 350'),
         ('Royal Enfield', 'Interceptor 650'),
         ('Royal Enfield', 'Meteor 350'),
         ('Royal Enfield', 'Scram 411'),
         ('Shineray', 'Jet 50'),
         ('Shineray', 'Phoenix 50'),
         ('Shineray', 'SHI 175'),
         ('Shineray', 'XY 50Q'),
         ('Shineray', 'XY 200'),
         ('Suzuki', 'Bandit 650'),
         ('Suzuki', 'Burgman 125'),
         ('Suzuki', 'DR 160'),
         ('Suzuki', 'GSX-8S'),
         ('Suzuki', 'GSX-R1000'),
         ('Suzuki', 'GSX-S750'),
         ('Suzuki', 'GSX-S1000'),
         ('Suzuki', 'Intruder 125'),
         ('Suzuki', 'V-Strom 650'),
         ('Suzuki', 'V-Strom 1050'),
         ('Suzuki', 'Yes 125'),
         ('Traxx', 'JH 125'),
         ('Traxx', 'Star 50'),
         ('Traxx', 'Work 125'),
         ('Triumph', 'Bonneville T100'),
         ('Triumph', 'Bonneville T120'),
         ('Triumph', 'Rocket 3'),
         ('Triumph', 'Scrambler 900'),
         ('Triumph', 'Speed Triple'),
         ('Triumph', 'Street Triple'),
         ('Triumph', 'Tiger 800'),
         ('Triumph', 'Tiger 900'),
         ('Triumph', 'Trident 660'),
         ('Vespa', 'GTS 300'),
         ('Vespa', 'Primavera 150'),
         ('Vespa', 'Sprint 150'),
         ('Yamaha', 'Crosser 150'),
         ('Yamaha', 'Factor 125'),
         ('Yamaha', 'Factor 150'),
         ('Yamaha', 'Fazer 250'),
         ('Yamaha', 'Fluo 125'),
         ('Yamaha', 'Lander 250'),
         ('Yamaha', 'MT-03'),
         ('Yamaha', 'MT-07'),
         ('Yamaha', 'MT-09'),
         ('Yamaha', 'MT-15'),
         ('Yamaha', 'Neo 125'),
         ('Yamaha', 'NMAX 160'),
         ('Yamaha', 'R3'),
         ('Yamaha', 'R15'),
         ('Yamaha', 'Ténéré 250'),
         ('Yamaha', 'Ténéré 700'),
         ('Yamaha', 'Tracer 900'),
         ('Yamaha', 'XJ6'),
         ('Yamaha', 'XMAX 250'),
         ('Yamaha', 'YZF-R1')
       ) as entrada (marca, modelo) on entrada.marca = marcas_novas.nome;
