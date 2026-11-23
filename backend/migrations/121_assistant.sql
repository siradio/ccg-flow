-- Assistant « CCG Flow » — un compagnon 100 % à base de règles (AUCUNE clé IA, aucun appel externe).
-- Deux usages : annoncer les nouveautés de l'app et répondre aux questions via une FAQ interrogeable
-- (moteur de score par mots-clés côté serveur). Le personnage (nom, genre, avatar, accueil) est
-- configurable par le super_admin et stocké dans app_settings (comme le bandeau de connexion).
-- Migration additive & idempotente.

-- ─── Personnage de l'assistant (configuration GLOBALE dans app_settings) ──────────────────────────
-- Valeurs par défaut : assistant ACTIVÉ, personnage neutre nommé « Flo » (clin d'œil à CCG Flow).
INSERT INTO app_settings (key, value) VALUES ('assistant_enabled', 'true')    ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('assistant_name', 'Flo')        ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('assistant_gender', 'neutre')   ON CONFLICT (key) DO NOTHING; -- fille | garcon | neutre
INSERT INTO app_settings (key, value) VALUES ('assistant_avatar', '🤖')       ON CONFLICT (key) DO NOTHING; -- emoji
INSERT INTO app_settings (key, value) VALUES ('assistant_greeting', '')        ON CONFLICT (key) DO NOTHING; -- vide = message dérivé du nom/genre

-- ─── Nouveautés (annonces diffusées dans l'app) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assistant_news (
  id          SERIAL PRIMARY KEY,
  titre       TEXT NOT NULL,
  contenu     TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'nouveau',        -- nouveau | amelioration | correctif
  module_key  TEXT,                                   -- étiquette de module (optionnelle), ex. 'qhse'
  lien        TEXT,                                   -- lien interne optionnel, ex. '/qhse'
  date_pub    DATE NOT NULL DEFAULT CURRENT_DATE,
  epingle     BOOLEAN NOT NULL DEFAULT false,         -- remonté en tête de liste
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_news_actif ON assistant_news (actif, date_pub DESC);

-- ─── FAQ (base de connaissances interrogeable, sans IA) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assistant_faq (
  id          SERIAL PRIMARY KEY,
  question    TEXT NOT NULL,
  reponse     TEXT NOT NULL DEFAULT '',
  mots_cles   TEXT NOT NULL DEFAULT '',               -- mots-clés additionnels pour le score (séparés par des espaces/virgules)
  module_key  TEXT,
  lien        TEXT,                                   -- lien interne optionnel vers l'écran concerné
  ordre       INTEGER NOT NULL DEFAULT 100,           -- sert aussi à ordonner les suggestions de départ
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_faq_actif ON assistant_faq (actif, ordre);

-- ─── Amorçage : quelques entrées utiles (seulement si les tables sont vides) ───────────────────────
-- Donne un assistant immédiatement exploitable ; le super_admin complète/édite ensuite depuis l'admin.
INSERT INTO assistant_news (titre, contenu, type, module_key, lien, epingle)
SELECT * FROM (VALUES
  ('Bienvenue dans votre assistant', 'Je vous annonce les nouveautés de CCG Flow et je réponds à vos questions sur l''application. Posez-moi une question dans l''onglet « Poser une question ».', 'nouveau', NULL, NULL, true),
  ('Module QHSE / Laboratoire disponible', 'Le module Qualité & laboratoire (LIMS) est désormais en ligne : référentiels, analyses, non-conformités, libération des lots et expéditions. L''accès s''attribue par le super_admin.', 'nouveau', 'qhse', '/qhse', false),
  ('Production : la saisie du jour ne liste que les produits finis', 'L''écran de relevé de production n''affiche plus que les produits finis de la business unit, pour une saisie plus claire.', 'amelioration', 'production', '/production/releve', false)
) AS v(titre, contenu, type, module_key, lien, epingle)
WHERE NOT EXISTS (SELECT 1 FROM assistant_news);

INSERT INTO assistant_faq (question, reponse, mots_cles, module_key, lien, ordre)
SELECT * FROM (VALUES
  ('Comment saisir la production du jour ?', 'Ouvrez Production → Relevé du jour, choisissez la business unit et la date, saisissez les quantités produites par produit fini, puis Enregistrer. Seuls les produits finis de la BU sont listés.', 'production saisie releve jour quantite produit fini tonnage', 'production', '/production/releve', 10),
  ('Comment faire une demande d''achat ?', 'Allez dans Demandes d''achat → Nouvelle demande. Renseignez les articles et quantités, puis soumettez : la demande part automatiquement dans le circuit de validation.', 'achat demande da nouvelle commande fournisseur devis bon', 'achats', '/purchase-requests/new', 20),
  ('Comment poser une demande de congé ou d''absence ?', 'Dans RH → Mes demandes, cliquez sur une nouvelle demande d''absence ou de congé, remplissez les dates et le motif, puis soumettez pour validation.', 'rh conge absence demande salarie permission jour repos', 'rh', '/rh/mes-demandes', 30),
  ('Comment réinitialiser ou changer mon mot de passe ?', 'Votre mot de passe se gère depuis votre compte. Si vous l''avez oublié, contactez le super_admin / support IT qui pourra le réinitialiser.', 'mot de passe password connexion login oublie reinitialiser compte', NULL, NULL, 40),
  ('À quoi sert la business unit (BU) ?', 'La business unit cloisonne les données (production, stock, commerce…) par activité. Vos accès et vos saisies sont filtrés selon les BU qui vous sont attribuées.', 'bu business unit activite cloisonnement acces perimetre', NULL, NULL, 50),
  ('Comment consulter l''état du stock ?', 'Ouvrez Stock → Consultation & stock actuel pour voir les quantités en stock, les lots et leur valorisation, filtrables par entrepôt et par produit.', 'stock etat actuel consultation lot inventaire quantite entrepot', 'stock', '/stock/etat', 60)
) AS v(question, reponse, mots_cles, module_key, lien, ordre)
WHERE NOT EXISTS (SELECT 1 FROM assistant_faq);
