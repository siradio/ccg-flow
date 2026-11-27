-- Suppression complète du sous-module « Tests de recrutement » (annulé avant toute mise en prod).
-- Le code a été retiré (revert des lots) ; cette migration nettoie les tables créées sur
-- l'environnement de développement (migrations 126→129, et 130 évaluations si elle avait été
-- appliquée). Idempotente et sûre partout : `IF EXISTS` → no-op en prod et sur une base vierge.
DROP TABLE IF EXISTS rh_recrutement_attempt_answers    CASCADE;
DROP TABLE IF EXISTS rh_recrutement_attempt_questions   CASCADE;
DROP TABLE IF EXISTS rh_recrutement_attempts            CASCADE;
DROP TABLE IF EXISTS rh_recrutement_evaluations         CASCADE;
DROP TABLE IF EXISTS rh_recrutement_invitations         CASCADE;
DROP TABLE IF EXISTS rh_recrutement_candidates          CASCADE;
DROP TABLE IF EXISTS rh_recrutement_variant_questions   CASCADE;
DROP TABLE IF EXISTS rh_recrutement_template_variants   CASCADE;
DROP TABLE IF EXISTS rh_recrutement_templates           CASCADE;
DROP TABLE IF EXISTS rh_recrutement_question_options    CASCADE;
DROP TABLE IF EXISTS rh_recrutement_questions           CASCADE;
DROP TABLE IF EXISTS rh_recrutement_categories          CASCADE;
DROP TABLE IF EXISTS rh_recrutement_campaigns           CASCADE;
