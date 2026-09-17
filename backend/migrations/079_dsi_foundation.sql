-- ============================================================================
-- Module DSI — L0 : fondations (référentiels administrables, SLA, compteurs de
-- numérotation, socle pièces jointes générique). Additif et idempotent.
-- Réutilise entities/sites/business_units/suppliers/users/employees existants.
-- ============================================================================

-- 1) Référentiels administrables ---------------------------------------------
CREATE TABLE IF NOT EXISTS dsi_categories (
  id      SERIAL PRIMARY KEY,
  code    TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  actif   BOOLEAN NOT NULL DEFAULT true,
  ordre   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dsi_types (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES dsi_categories(id),
  code        TEXT NOT NULL,
  libelle     TEXT NOT NULL,
  actif       BOOLEAN NOT NULL DEFAULT true,
  ordre       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (code)
);
CREATE INDEX IF NOT EXISTS idx_dsi_types_category ON dsi_types(category_id);

CREATE TABLE IF NOT EXISTS dsi_brands (
  id    SERIAL PRIMARY KEY,
  nom   TEXT NOT NULL UNIQUE,
  actif BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS dsi_ticket_categories (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true, ordre INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dsi_ticket_types (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true, ordre INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dsi_priorities (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL,
  rang INTEGER NOT NULL DEFAULT 0, couleur TEXT, actif BOOLEAN NOT NULL DEFAULT true
);

-- SLA configurable par priorité (jamais codé en dur). Délais en MINUTES.
CREATE TABLE IF NOT EXISTS dsi_sla (
  id                  SERIAL PRIMARY KEY,
  priority_id         INTEGER NOT NULL UNIQUE REFERENCES dsi_priorities(id),
  prise_en_charge_min INTEGER NOT NULL,
  resolution_min      INTEGER NOT NULL,
  seuil_risque_pct    INTEGER NOT NULL DEFAULT 80,
  actif               BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS dsi_maintenance_types (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true, ordre INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dsi_activity_types (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true, ordre INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dsi_risk_categories (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true, ordre INTEGER NOT NULL DEFAULT 0
);

-- 2) Compteurs de numérotation séquentielle annuelle (INC-2026-000123, etc.) --
-- Incrément atomique en transaction : UPDATE ... RETURNING (voir dsi.repository).
CREATE TABLE IF NOT EXISTS dsi_counters (
  scope      TEXT NOT NULL,
  annee      INTEGER NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, annee)
);

-- 3) Socle pièces jointes générique (D1) : réutilise la table `attachments` et le
-- stockage blob. On ajoute un lien polymorphe (source_module/type/id) pour les
-- objets DSI, sans casser le rattachement existant aux achats.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS source_module TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS source_type   TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS source_id     INTEGER;
CREATE INDEX IF NOT EXISTS idx_attachments_source ON attachments(source_module, source_type, source_id);

-- Le CHECK d'origine (001_init, ANONYME) imposait EXACTEMENT une des 3 FK achat
-- non nulle. On le supprime dynamiquement (nom auto-généré) puis on pose un CHECK
-- nommé assoupli : soit un rattachement achat (une seule des 3 FK), soit un
-- rattachement générique (les 3 FK achat nulles + triplet source complet).
DO $$
DECLARE c record;
BEGIN
  -- Supprime toute contrainte CHECK d'attachments portant sur purchase_request_id
  -- (l'ancienne contrainte anonyme), sauf notre contrainte nommée cible.
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'attachments' AND con.contype = 'c'
      AND con.conname <> 'attachments_parent_ck'
      AND pg_get_constraintdef(con.oid) ILIKE '%purchase_request_id%'
  LOOP
    EXECUTE format('ALTER TABLE attachments DROP CONSTRAINT %I', c.conname);
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_parent_ck') THEN
    ALTER TABLE attachments ADD CONSTRAINT attachments_parent_ck CHECK (
      (
        (purchase_request_id IS NOT NULL)::int
      + (quote_id IS NOT NULL)::int
      + (purchase_order_id IS NOT NULL)::int
      ) = 1
      OR (
        purchase_request_id IS NULL AND quote_id IS NULL AND purchase_order_id IS NULL
        AND source_module IS NOT NULL AND source_type IS NOT NULL AND source_id IS NOT NULL
      )
    );
  END IF;
END $$;

-- 4) Seeds des référentiels (idempotents) ------------------------------------
INSERT INTO dsi_categories (code, libelle, ordre) VALUES
  ('poste_travail','Poste de travail',1),
  ('peripherique','Périphérique',2),
  ('reseau','Réseau',3),
  ('serveur_stockage','Serveur & stockage',4),
  ('telephonie','Téléphonie',5),
  ('energie','Énergie',6),
  ('accessoire','Accessoires',7),
  ('autre','Autres équipements IT',8)
ON CONFLICT (code) DO NOTHING;

INSERT INTO dsi_types (category_id, code, libelle, ordre)
SELECT c.id, v.code, v.libelle, v.ordre FROM (VALUES
  ('poste_travail','pc_portable','Ordinateur portable',1),
  ('poste_travail','pc_fixe','Ordinateur fixe',2),
  ('peripherique','ecran','Écran',3),
  ('serveur_stockage','serveur','Serveur',4),
  ('peripherique','imprimante','Imprimante',5),
  ('peripherique','scanner','Scanner',6),
  ('telephonie','telephone','Téléphone',7),
  ('telephonie','smartphone','Smartphone',8),
  ('poste_travail','tablette','Tablette',9),
  ('reseau','routeur','Routeur',10),
  ('reseau','switch','Switch',11),
  ('reseau','point_acces','Point d''accès Wi-Fi',12),
  ('energie','onduleur','Onduleur',13),
  ('serveur_stockage','disque_externe','Disque externe',14),
  ('reseau','cle_4g5g','Clé 4G/5G',15),
  ('accessoire','accessoire','Accessoires',16),
  ('autre','autre','Autre équipement IT',17)
) AS v(cat_code, code, libelle, ordre)
JOIN dsi_categories c ON c.code = v.cat_code
ON CONFLICT (code) DO NOTHING;

INSERT INTO dsi_priorities (code, libelle, rang, couleur) VALUES
  ('critique','Critique',1,'#dc2626'),
  ('haute','Haute',2,'#ea580c'),
  ('normale','Normale',3,'#2563eb'),
  ('basse','Basse',4,'#6b7280')
ON CONFLICT (code) DO NOTHING;

-- SLA par défaut (minutes) — administrable ensuite.
INSERT INTO dsi_sla (priority_id, prise_en_charge_min, resolution_min, seuil_risque_pct)
SELECT p.id, v.pec, v.res, 80 FROM (VALUES
  ('critique',30,240),('haute',60,480),('normale',240,1440),('basse',480,4320)
) AS v(code, pec, res) JOIN dsi_priorities p ON p.code = v.code
ON CONFLICT (priority_id) DO NOTHING;

INSERT INTO dsi_ticket_categories (code, libelle, ordre) VALUES
  ('materiel','Matériel',1),('logiciel','Logiciel',2),('reseau','Réseau',3),
  ('internet','Internet',4),('messagerie','Messagerie',5),('telephonie','Téléphonie',6),
  ('imprimante','Imprimante',7),('acces_compte','Accès / compte utilisateur',8),
  ('securite','Sécurité',9),('erp','ERP / CCG Flow',10),('autre','Autre',11)
ON CONFLICT (code) DO NOTHING;

INSERT INTO dsi_ticket_types (code, libelle, ordre) VALUES
  ('incident','Incident',1),('demande_service','Demande de service',2),
  ('assistance','Assistance',3),('probleme','Problème',4),('autre','Autre',5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO dsi_maintenance_types (code, libelle, ordre) VALUES
  ('preventive','Préventive',1),('corrective','Corrective',2),('reparation','Réparation',3),
  ('mise_a_niveau','Mise à niveau',4),('controle','Contrôle',5),('autre','Autre',6)
ON CONFLICT (code) DO NOTHING;

INSERT INTO dsi_activity_types (code, libelle, ordre) VALUES
  ('install_poste','Installation d''un poste',1),('config_reseau','Configuration réseau',2),
  ('creation_utilisateur','Création d''un utilisateur',3),('install_logiciel','Installation d''un logiciel',4),
  ('intervention_serveur','Intervention serveur',5),('sauvegarde','Sauvegarde',6),
  ('intervention_fournisseur','Intervention fournisseur',7),('maj_systeme','Mise à jour système',8),
  ('controle_securite','Contrôle de sécurité',9),('assistance_utilisateur','Assistance utilisateur',10),
  ('maintenance_reseau','Maintenance réseau',11),('deplacement_site','Déplacement sur site',12),
  ('autre','Autre',13)
ON CONFLICT (code) DO NOTHING;

INSERT INTO dsi_risk_categories (code, libelle, ordre) VALUES
  ('materiel','Matériel',1),('reseau','Réseau',2),('securite','Sécurité',3),
  ('logiciel','Logiciel',4),('fournisseur','Fournisseur',5),('budget','Budget',6),
  ('competences','RH / Compétences',7),('conformite','Conformité',8),('autre','Autre',9)
ON CONFLICT (code) DO NOTHING;
