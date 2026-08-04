-- Business Unit optionnelle sur une demande d'achat, à titre informatif (traçabilité de l'activité
-- à laquelle l'achat se rattache). Ne concerne en pratique que l'entité SOGUIPAL, à laquelle sont
-- rattachées les Business Units côté métier. NULL = non renseignée / « Toutes les BU ». N'a aucun
-- impact sur le circuit de validation (les BU ne sont pas liées aux entités dans le modèle).
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS business_unit_id INTEGER REFERENCES business_units(id);
