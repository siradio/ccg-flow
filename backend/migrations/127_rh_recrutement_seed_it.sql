-- Seed « banque IT » du sous-module Tests de recrutement : 9 catégories, 50 questions (QCM à
-- réponse unique, 1 point), et le modèle « Test stagiaire IT » avec 3 variantes de 30 questions
-- (20 communes + 10 spécifiques). Généré à partir de la maquette HTML fournie. Additif & idempotent
-- (garde : ne s'exécute que si la question IT-COM-01 n'existe pas encore). Les variantes snapshotent
-- le contenu des questions (immuable), comme le fait l'application.
DO $$
DECLARE v_tpl INT;
BEGIN
  IF EXISTS (SELECT 1 FROM rh_recrutement_questions WHERE code = 'IT-COM-01') THEN RETURN; END IF;

  -- Catégories
  INSERT INTO rh_recrutement_categories (code, nom, ordre) VALUES ('MAINT', 'Maintenance informatique', 10);
  INSERT INTO rh_recrutement_categories (code, nom, ordre) VALUES ('RES', 'Réseaux et câblage', 20);
  INSERT INTO rh_recrutement_categories (code, nom, ordre) VALUES ('VIDEO', 'Caméras & pointeuses (vidéosurveillance)', 30);
  INSERT INTO rh_recrutement_categories (code, nom, ordre) VALUES ('SEC', 'Cybersécurité', 40);
  INSERT INTO rh_recrutement_categories (code, nom, ordre) VALUES ('SUP', 'Support utilisateurs', 50);
  INSERT INTO rh_recrutement_categories (code, nom, ordre) VALUES ('ERP', 'ERP et bureautique', 60);
  INSERT INTO rh_recrutement_categories (code, nom, ordre) VALUES ('SPEC_A', 'Spécifique variante A — Maintenance / Réseaux / Vidéo', 70);
  INSERT INTO rh_recrutement_categories (code, nom, ordre) VALUES ('SPEC_B', 'Spécifique variante B — Support / ERP / Données', 80);
  INSERT INTO rh_recrutement_categories (code, nom, ordre) VALUES ('SPEC_C', 'Spécifique variante C — Développement / SQL', 90);

  -- Questions + options
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-01', 'Un ordinateur ne démarre plus. Quelle est la première vérification à effectuer ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'MAINT'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Réinstaller Windows', false, 0),
    ('Vérifier l’alimentation électrique et les branchements', true, 1),
    ('Remplacer le disque dur', false, 2),
    ('Changer la RAM', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-02', 'Un ordinateur devient particulièrement lent. Que faut-il faire en premier ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'MAINT'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Formater le disque', false, 0),
    ('Remplacer l’écran', false, 1),
    ('Vérifier les processus et ressources dans le gestionnaire des tâches', true, 2),
    ('Désinstaller tous les logiciels', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-03', 'Une imprimante réseau n’imprime plus. Que vérifier ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'MAINT'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Acheter une imprimante', false, 0),
    ('Réinstaller Windows', false, 1),
    ('Supprimer les documents', false, 2),
    ('Alimentation, réseau et file d’impression', true, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-04', 'En quoi consiste la maintenance préventive ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'MAINT'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Attendre une panne', false, 0),
    ('Effectuer des contrôles réguliers pour prévenir les pannes', true, 1),
    ('Remplacer tous les ordinateurs', false, 2),
    ('Réparer uniquement les équipements défectueux', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-05', 'Quel est le rôle d’un onduleur (UPS) ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'MAINT'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Augmenter le débit Internet', false, 0),
    ('Refroidir les ordinateurs', false, 1),
    ('Assurer temporairement l’alimentation en cas de coupure', true, 2),
    ('Stocker les sauvegardes', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-06', 'Quelle commande Windows affiche la configuration IP ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'RES'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('ipconfig', true, 0),
    ('mkdir', false, 1),
    ('format', false, 2),
    ('tasklist', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-07', 'À quoi sert ping ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'RES'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Installer un logiciel', false, 0),
    ('Modifier un mot de passe', false, 1),
    ('Supprimer une IP', false, 2),
    ('Tester l’accessibilité réseau d’un équipement', true, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-08', 'Quel équipement connecte plusieurs ordinateurs sur un réseau local filaire ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'RES'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Onduleur', false, 0),
    ('Switch', true, 1),
    ('Scanner', false, 2),
    ('Disque externe', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-09', 'Quel connecteur est généralement utilisé pour Ethernet ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'RES'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('HDMI', false, 0),
    ('VGA', false, 1),
    ('RJ45', true, 2),
    ('USB', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-10', 'Un seul utilisateur n’a plus Internet. Que faire en premier ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'RES'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Redémarrer le routeur de l’entreprise', false, 0),
    ('Contacter le fournisseur Internet', false, 1),
    ('Réinstaller Windows', false, 2),
    ('Vérifier la connexion et la configuration réseau du poste', true, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-11', 'Quel est le rôle d’un NVR ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'VIDEO'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Distribuer Internet', false, 0),
    ('Enregistrer et gérer les flux des caméras IP', true, 1),
    ('Alimenter les ordinateurs', false, 2),
    ('Gérer les comptes de messagerie', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-12', 'Une caméra IP ne transmet plus d’image. Que vérifier en priorité ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'VIDEO'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Son alimentation et sa connexion réseau', true, 0),
    ('Le clavier du responsable IT', false, 1),
    ('La licence Office', false, 2),
    ('La résolution de l’écran uniquement', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-13', 'Comment assurer le bon fonctionnement des caméras et pointeuses ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'VIDEO'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Attendre les réclamations', false, 0),
    ('Tout redémarrer chaque jour', false, 1),
    ('Remplacer chaque mois', false, 2),
    ('Effectuer des contrôles réguliers et documenter les anomalies', true, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-14', 'Un e-mail suspect demande un mot de passe. Que faire ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SEC'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Cliquer sur le lien', false, 0),
    ('Transférer à tous', false, 1),
    ('Ne pas cliquer et signaler au service IT', true, 2),
    ('Communiquer son mot de passe', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-15', 'Quelle est la meilleure pratique pour les mots de passe ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SEC'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Mot de passe unique et robuste par compte', true, 0),
    ('Même mot de passe partout', false, 1),
    ('Partager avec les collègues', false, 2),
    ('Utiliser sa date de naissance', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-16', 'Un collaborateur quitte définitivement l’entreprise. Que faire ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SEC'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Laisser son compte actif', false, 0),
    ('Désactiver ses accès et récupérer les équipements', true, 1),
    ('Partager son mot de passe', false, 2),
    ('Supprimer tous les fichiers de l’entreprise', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-17', 'Quel incident traiter en priorité ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SUP'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Panne bloquant toute une unité de production', true, 0),
    ('Changement de fond d’écran', false, 1),
    ('Installation non urgente', false, 2),
    ('Remplacement d’une souris fonctionnelle', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-18', 'Vous ne savez pas résoudre un incident. Que faire ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SUP'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Ignorer', false, 0),
    ('Documenter, vérifier et solliciter le responsable IT', true, 1),
    ('Modifier au hasard', false, 2),
    ('Prétendre avoir résolu', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-19', 'Quelle formule Excel additionne A1 à A10 ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'ERP'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('=TOTAL(A1:A10)', false, 0),
    ('=MOYENNE(A1:A10)', false, 1),
    ('=SOMME(A1:A10)', true, 2),
    ('=CALCUL(A1:A10)', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-COM-20', 'Quel est le rôle principal d’un ERP comme CCG Flow ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'ERP'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Centraliser et gérer les processus de l’entreprise', true, 0),
    ('Remplacer les équipements', false, 1),
    ('Installer les antivirus', false, 2),
    ('Gérer uniquement les e-mails', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VA-01', 'Deux postes ont la même IP. Quel risque ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_A'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Conflit IP', true, 0),
    ('Disque plein', false, 1),
    ('Virus certain', false, 2),
    ('Débit doublé', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VA-02', 'Quel outil vérifie un câble RJ45 ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_A'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Testeur réseau', true, 0),
    ('Antivirus', false, 1),
    ('NVR', false, 2),
    ('Onduleur', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VA-03', 'Caméra joignable mais sans image sur le NVR : que vérifier ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_A'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Flux vidéo et identifiants', true, 0),
    ('RAM du PC', false, 1),
    ('Clavier', false, 2),
    ('DNS public uniquement', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VA-04', 'Dossier partagé inaccessible : que vérifier ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_A'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Réseau et permissions', true, 0),
    ('Écran', false, 1),
    ('Batterie', false, 2),
    ('Date de fabrication', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VA-05', 'Après une coupure, plusieurs caméras sont hors ligne : que vérifier ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_A'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Alimentation et switches PoE', true, 0),
    ('Historique navigateur', false, 1),
    ('Licence Office', false, 2),
    ('Clavier', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VA-06', 'Quel est le rôle du PoE ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_A'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Alimenter un équipement via Ethernet', true, 0),
    ('Chiffrer les fichiers', false, 1),
    ('Attribuer les IP', false, 2),
    ('Compresser les images', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VA-07', 'Un poste reçoit une IP 169.254.x.x : quelle piste vérifier ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_A'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Disponibilité DHCP', true, 0),
    ('Résolution écran', false, 1),
    ('Mémoire vidéo', false, 2),
    ('Imprimante', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VA-08', 'Avant de poser un câble en hauteur, que faire ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_A'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Vérifier autorisation et moyens de sécurité adaptés', true, 0),
    ('Monter sur une chaise', false, 1),
    ('Travailler seul sans prévenir', false, 2),
    ('Couper toute la production', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VA-09', 'Une pointeuse ne synchronise plus : que vérifier ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_A'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Connectivité et service de synchronisation', true, 0),
    ('Fond écran', false, 1),
    ('Clavier du PC', false, 2),
    ('Format du papier', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VA-10', 'Après réparation, quelle action clôture correctement un ticket ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_A'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Tester avec utilisateur et documenter', true, 0),
    ('Effacer le ticket', false, 1),
    ('Changer tous les mots de passe', false, 2),
    ('Fermer sans test', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VB-01', 'Quel outil Power BI transforme les données ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_B'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Power Query', true, 0),
    ('Word', false, 1),
    ('Git', false, 2),
    ('Defender', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VB-02', 'Quelle clause SQL filtre les lignes ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_B'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('WHERE', true, 0),
    ('ORDER BY', false, 1),
    ('DROP', false, 2),
    ('INSERT', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VB-03', 'Une réception est saisie deux fois dans ERP : que faire ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_B'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Identifier le doublon et suivre la correction validée', true, 0),
    ('Effacer toutes les réceptions', false, 1),
    ('Modifier stock sans trace', false, 2),
    ('Ignorer', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VB-04', 'Quel est le rôle d’une clé primaire ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_B'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Identifier une ligne de façon unique', true, 0),
    ('Chiffrer un fichier', false, 1),
    ('Trier un écran', false, 2),
    ('Attribuer une IP', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VB-05', 'Quelle fonction Excel somme selon un critère ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_B'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('SOMME.SI', true, 0),
    ('MAX', false, 1),
    ('NB', false, 2),
    ('MOYENNE', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VB-06', 'Un utilisateur ne voit pas un module ERP : que vérifier ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_B'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Rôles et permissions', true, 0),
    ('RAM du serveur uniquement', false, 1),
    ('Écran', false, 2),
    ('Imprimante', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VB-07', 'Un rapport de ventes double les montants après jointure : quelle piste ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_B'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Cardinalité et doublons des clés', true, 0),
    ('Couleur du graphique', false, 1),
    ('Police', false, 2),
    ('Navigateur', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VB-08', 'Avant un import Excel dans ERP, que vérifier ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_B'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Formats, champs obligatoires et doublons', true, 0),
    ('Fond écran', false, 1),
    ('Nom du PC uniquement', false, 2),
    ('Taille du clavier', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VB-09', 'Une application fonctionne pour tous sauf un utilisateur : première piste ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_B'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Session, droits et poste utilisateur', true, 0),
    ('Réinstaller le serveur', false, 1),
    ('Supprimer la base', false, 2),
    ('Couper Internet', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VB-10', 'Comment traiter un écart de stock ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_B'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Comparer mouvements et justificatifs puis faire valider la correction', true, 0),
    ('Écraser le stock', false, 1),
    ('Supprimer le produit', false, 2),
    ('Ignorer', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VC-01', 'Que signifie HTTP 500 ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_C'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Erreur interne serveur', true, 0),
    ('Succès', false, 1),
    ('Redirection permanente', false, 2),
    ('Page introuvable', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VC-02', 'Quel est le rôle de Git ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_C'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Gérer les versions du code', true, 0),
    ('Configurer caméras', false, 1),
    ('Remplacer SQL', false, 2),
    ('Gérer imprimantes', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VC-03', 'Quelle opération SQL combine des tables liées ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_C'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('JOIN', true, 0),
    ('DROP', false, 1),
    ('DELETE', false, 2),
    ('TRUNCATE', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VC-04', 'Un utilisateur accède à des données administrateur : que vérifier ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_C'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Autorisations côté serveur', true, 0),
    ('Résolution écran', false, 1),
    ('Police', false, 2),
    ('Taille disque', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VC-05', 'Connexion PostgreSQL impossible : que vérifier ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_C'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Serveur, réseau et paramètres de connexion', true, 0),
    ('Thème graphique', false, 1),
    ('Clavier', false, 2),
    ('Fond écran', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VC-06', 'Comment éviter une injection SQL ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_C'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Requêtes paramétrées', true, 0),
    ('Concaténer les entrées', false, 1),
    ('Masquer le bouton', false, 2),
    ('Changer le CSS', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VC-07', 'Quel code HTTP indique une ressource introuvable ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_C'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('404', true, 0),
    ('200', false, 1),
    ('201', false, 2),
    ('301', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VC-08', 'Avant un déploiement correctif, que faire ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_C'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Tester et prévoir un retour arrière', true, 0),
    ('Modifier directement en production', false, 1),
    ('Effacer les logs', false, 2),
    ('Désactiver les sauvegardes', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VC-09', 'Une application devient lente : quelle démarche ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_C'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Examiner logs, métriques et requêtes', true, 0),
    ('Changer le logo', false, 1),
    ('Supprimer la base', false, 2),
    ('Augmenter tous les délais sans diagnostic', false, 3)
  ) AS v(libelle, bon, ordre);
  WITH nq AS (
    INSERT INTO rh_recrutement_questions (code, intitule, category_id, niveau, type, points, actif)
    SELECT 'IT-VC-10', 'Où stocker les secrets de connexion en production ?', c.id, 'moyen', 'qcm_unique', 1, true FROM rh_recrutement_categories c WHERE c.code = 'SPEC_C'
    RETURNING id)
  INSERT INTO rh_recrutement_question_options (question_id, libelle, bon, ordre)
  SELECT nq.id, v.libelle, v.bon, v.ordre FROM nq, (VALUES
    ('Gestionnaire de secrets ou configuration serveur protégée', true, 0),
    ('Code JavaScript public', false, 1),
    ('Git public', false, 2),
    ('URL publique', false, 3)
  ) AS v(libelle, bon, ordre);

  -- Modèle de test « Test stagiaire IT » (40 min, auto) + variantes A/B/C
  INSERT INTO rh_recrutement_templates (titre, description, poste, consignes, duree_min, mode_correction, statut)
  VALUES ('Test stagiaire IT', 'QCM de recrutement — stagiaire informatique (30 questions, 40 minutes).', 'Stagiaire informatique', 'Installez-vous au calme avec une connexion stable. Le chronomètre démarre au clic sur « Commencer ». Une seule bonne réponse par question.', 40, 'auto', 'publie')
  RETURNING id INTO v_tpl;
  INSERT INTO rh_recrutement_template_variants (template_id, code, libelle, ordre) VALUES (v_tpl, 'A', 'Variante A', 0);
  INSERT INTO rh_recrutement_template_variants (template_id, code, libelle, ordre) VALUES (v_tpl, 'B', 'Variante B', 1);
  INSERT INTO rh_recrutement_template_variants (template_id, code, libelle, ordre) VALUES (v_tpl, 'C', 'Variante C', 2);

  -- Questions des variantes (snapshot immuable)
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 0, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-01'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 1, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-02'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 2, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-03'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 3, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-04'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 4, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-05'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 5, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-06'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 6, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-07'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 7, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-08'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 8, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-09'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 9, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-10'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 10, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-11'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 11, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-12'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 12, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-13'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 13, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-14'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 14, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-15'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 15, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-16'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 16, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-17'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 17, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-18'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 18, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-19'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 19, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-20'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 20, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VA-01'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 21, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VA-02'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 22, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VA-03'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 23, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VA-04'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 24, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VA-05'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 25, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VA-06'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 26, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VA-07'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 27, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VA-08'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 28, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VA-09'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 29, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VA-10'
  WHERE vr.template_id = v_tpl AND vr.code = 'A';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 0, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-01'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 1, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-02'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 2, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-03'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 3, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-04'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 4, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-05'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 5, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-06'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 6, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-07'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 7, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-08'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 8, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-09'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 9, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-10'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 10, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-11'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 11, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-12'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 12, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-13'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 13, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-14'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 14, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-15'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 15, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-16'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 16, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-17'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 17, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-18'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 18, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-19'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 19, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-20'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 20, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VB-01'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 21, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VB-02'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 22, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VB-03'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 23, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VB-04'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 24, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VB-05'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 25, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VB-06'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 26, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VB-07'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 27, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VB-08'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 28, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VB-09'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 29, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VB-10'
  WHERE vr.template_id = v_tpl AND vr.code = 'B';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 0, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-01'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 1, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-02'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 2, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-03'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 3, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-04'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 4, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-05'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 5, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-06'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 6, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-07'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 7, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-08'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 8, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-09'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 9, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-10'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 10, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-11'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 11, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-12'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 12, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-13'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 13, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-14'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 14, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-15'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 15, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-16'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 16, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-17'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 17, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-18'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 18, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-19'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 19, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-COM-20'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 20, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VC-01'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 21, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VC-02'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 22, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VC-03'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 23, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VC-04'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 24, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VC-05'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 25, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VC-06'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 26, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VC-07'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 27, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VC-08'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 28, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VC-09'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
  INSERT INTO rh_recrutement_variant_questions (variant_id, question_id, ordre, snapshot)
  SELECT vr.id, q.id, 29, jsonb_build_object('question_id', q.id, 'intitule', q.intitule, 'type', q.type, 'points', q.points, 'niveau', q.niveau, 'category_id', q.category_id,
    'options', (SELECT jsonb_agg(jsonb_build_object('libelle', o.libelle, 'bon', o.bon, 'ordre', o.ordre) ORDER BY o.ordre) FROM rh_recrutement_question_options o WHERE o.question_id = q.id))
  FROM rh_recrutement_template_variants vr JOIN rh_recrutement_questions q ON q.code = 'IT-VC-10'
  WHERE vr.template_id = v_tpl AND vr.code = 'C';
END $$;
