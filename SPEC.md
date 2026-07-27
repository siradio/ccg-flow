# CCG Flow — Cahier des charges v1
## Module : Demande d'achat

**Groupe :** CCG (Comptoir Commercial Général) — holding
**Filiales :** Soguipal (industrie agroalimentaire), PBIC (immobilier / Prestige Business Center)

Ce document cadre la première brique de l'ERP centralisé du groupe : les référentiels communs, la gestion des utilisateurs/rôles, et le module **Demande d'achat** de bout en bout (création → devis → validations en cascade → bon de commande).

Décisions actées pendant le cadrage (voir résumé en fin de document) :
- Rôles de validation **scopés par entité** (un utilisateur a un rôle par entité, cumul possible).
- Référentiels **partagés avec filtre d'entité** (un fournisseur/produit peut servir 1, 2 ou 3 entités).
- Demande de devis envoyée par **email généré par l'outil**.
- Rejet à une étape = **retour à l'étape précédente** avec commentaire obligatoire, pas d'annulation.
- Devises : **GNF + USD/EUR** au choix par demande.
- Notifications **email + in-app**.
- Audit trail **complet** dès v1.
- Étapes Contrôle de Gestion → Finances → DGA **strictement séquentielles**.
- Création de demande ouverte à **tout employé disposant d'un compte**.
- Pièces jointes stockées **en base (BYTEA)**.
- Authentification **email + mot de passe (JWT)**, cohérent avec le projet GSBC existant.
- Stack : **Node.js/Express + PostgreSQL**, hébergement **Azure**.

---

## 1. Entités de données et relations

### 1.1 Référentiels transverses

```
entities (entités du groupe)
  id, code ('CCG'|'SOGUIPAL'|'PBIC'), nom

users
  id, nom, prenom, email (unique), password_hash, actif, employee_id (FK -> employees, nullable), created_at
  -- Pas de suppression d'utilisateur dans l'UI : `actif=false` (désactivation) est la seule
  -- opération offerte (bouton "Désactiver" dans Admin -> Utilisateurs, `PUT /api/users/:id`).
  -- Un utilisateur est référencé par des clés étrangères NOT NULL dans purchase_requests,
  -- approvals, stock_entries.created_by, product_prices.created_by, etc. : le supprimer casserait
  -- ces historiques (ou, si on ajoutait un ON DELETE CASCADE, effacerait silencieusement des
  -- demandes d'achat/saisies de stock/prix réels). Un compte désactivé ne peut plus se connecter
  -- (vérifié dans /api/auth/login) mais reste visible dans tout l'historique qu'il a produit.

user_entity_roles                          -- un utilisateur peut avoir plusieurs rôles, un par entité
  id, user_id (FK), entity_id (FK, nullable si rôle global ex. super_admin), role_code, created_at

employees (employés)                       -- module RH dédié, indépendant du login
  id, matricule, nom, prenom, poste, departement, entity_id (FK), site_id (FK), business_unit_id (FK, nullable),
  manager (texte libre), date_embauche, type_contrat ('CDI'|'CDD'|'Stage'|'Consultant'|'Journalier'),
  statut ('actif'|'inactif'|'sorti'), salaire_mensuel, telephone, email
  -- ancienneté calculée à la volée (AGE(now, date_embauche)), jamais stockée.
  -- "matricule" N'EST PAS unique dans les faits (source Excel : ~59 codes partagés par 2 employés
  -- distincts) : gardé comme champ indexé pour la recherche, jamais comme contrainte d'unicité.
  -- Le champ "Business_Unit" du fichier source mélangeait entité (CCG Groupe, Soguipal) et ligne de
  -- production précise (Yaourt, Tomate, Lait, Mayo/Margarine) : séparé ici en entity_id (toujours
  -- renseigné) + business_unit_id (seulement pour une ligne de production précise, sinon NULL).

sites
  id, entity_id (FK), nom, adresse, ville

warehouses (entrepôts)
  id, site_id (FK), nom, code

machines (machines de production)
  id, site_id (FK), nom, reference, categorie

suppliers (fournisseurs)
  id, nom, contact_nom, contact_email, contact_tel, adresse, actif,
  origine ('Import'|'Local'), pays, categorie, produits_offres,
  mode_paiement, conditions_paiement, a_contrat (BOOLEAN, nullable), commentaires

supplier_entities                          -- junction : quelles entités peuvent utiliser ce fournisseur
  supplier_id (FK), entity_id (FK)

product_categories                         -- configurable par l'admin (pas un enum figé dans le code)
  id, code, nom

business_units                             -- configurable par l'admin : BU Lait, BU Tomate, BU Yaourt, BU Mayo Margarine...
  id, code, nom

products (produits / articles)
  id, code, designation, category_id (FK -> product_categories), business_unit_id (FK -> business_units, nullable),
  unite, actif, seuil_alerte_stock (nullable — voir §3.6, seuil configurable par produit)
  -- Colonnes "produit fini" (référentiel PILCO importé pour le module Stock du Jour, réutilisable
  -- par d'autres modules futurs) : conditionnement (texte libre, ex. "Sachet", "Carton"),
  -- format_taille (numérique, ex. 0.2 pour "200g"), contenu_par_carton, kg_equivalent_carton,
  -- prix_suggere_gnf. Toutes nullable — un produit d'un autre référentiel (ex. fourniture de bureau)
  -- n'a pas besoin de les renseigner.

product_entities                           -- junction : quelles entités peuvent utiliser ce produit
  product_id (FK), entity_id (FK)
```

### 1.2 Moteur de workflow configurable (réutilisable pour les futurs modules)

```
workflow_templates
  id, module_code ('demande_achat'|'bon_commande_commercial'|...), nom, actif

workflow_steps
  id, workflow_template_id (FK), ordre, code ('service_achat'|'controle_gestion'|'finances'|'dga'|...),
  nom, role_code_requis, commentaire_obligatoire_si_refus (bool), comportement_si_refus ('retour_etape_precedente'|'annulation')
```
Le workflow réel décrit par CCG est *inséré comme donnée* dans ces deux tables au premier démarrage (voir §3), pas codé en dur — un futur changement d'ordre ou d'intervenant se fait par configuration, pas par déploiement.

### 1.3 Demande d'achat (cœur du module)

```
purchase_requests (demandes_achat)
  id, numero (ex. DA-SOGUIPAL-2026-0001), entity_id (FK), workflow_template_id (FK),
  requester_user_id (FK), site_id (FK, nullable), objet, justification,
  status ('brouillon'|'soumise'|'en_analyse_achat'|'devis_en_cours'|'devis_selectionne'
          |'en_validation'|'validee'|'rejetee'|'bon_commande_genere'),
  current_step_id (FK -> workflow_steps, nullable une fois terminée),
  devise ('GNF'|'USD'|'EUR'), montant_estime, montant_final,
  created_at, updated_at

purchase_request_lines (lignes de la demande)
  id, purchase_request_id (FK), product_id (FK, nullable si hors catalogue), description_libre,
  quantite, unite, prix_unitaire_estime, prix_unitaire_final, fournisseur_retenu_id (FK, nullable)

quote_requests (demandes de devis)
  id, purchase_request_id (FK), created_by (FK users), created_at, message

quote_request_suppliers (fournisseurs sollicités pour une demande de devis)
  id, quote_request_id (FK), supplier_id (FK), sent_at, statut ('envoye'|'echec_envoi'|'devis_recu'|'refuse')

quotes (devis reçus des fournisseurs)
  id, quote_request_supplier_id (FK), montant, devise, recu_le, selectionne (bool), notes

approvals (validations du workflow, une ligne par étape franchie)
  id, purchase_request_id (FK), workflow_step_id (FK), statut ('en_attente'|'validee'|'refusee'),
  validated_by (FK users, nullable), commentaire, decided_at

purchase_orders (bons de commande générés)
  id, purchase_request_id (FK), numero, supplier_id (FK), montant, devise,
  generated_at, envoye_le (nullable)

attachments (pièces jointes)
  id, purchase_request_id (FK, nullable), quote_id (FK, nullable), purchase_order_id (FK, nullable),
  filename, mimetype, content (BYTEA), taille, uploaded_by (FK users), uploaded_at

audit_log
  id, table_name, record_id, purchase_request_id (dénormalisé pour requête rapide),
  action ('create'|'update'|'validate'|'reject'|'generate_po'|...), user_id (FK), details (JSONB), created_at

notifications
  id, user_id (FK), type, message, lien, lu (bool), created_at
```

### 1.4 Relations clés
- `entities` 1—N `sites`, `employees`, `purchase_requests`
- `users` N—N `entities` via `user_entity_roles` (avec un `role_code` par ligne)
- `products`/`suppliers` N—N `entities` (partage filtré)
- `purchase_requests` 1—N `purchase_request_lines`, `quote_requests`, `approvals`, `attachments`
- `quote_requests` 1—N `quote_request_suppliers` 1—1 `quotes`
- `purchase_requests` 1—1 `purchase_orders` (généré seulement si validation complète)

---

## 2. Rôles et permissions

### 2.1 Rôles (`role_code`)

| Code | Nom | Portée | Description |
|---|---|---|---|
| `super_admin` | Super Administrateur | globale (toutes entités) | Gère utilisateurs, rôles, référentiels, configuration du workflow |
| `demandeur` | Demandeur | implicite pour tout utilisateur actif | Peut créer/soumettre une demande pour sa propre entité |
| `service_achat` | Service Achat | par entité | Analyse, génère la demande de devis, sélectionne le devis retenu, renseigne les prix, valide l'étape achat |
| `controle_gestion` | Contrôle de Gestion | par entité | Valide/refuse après le service achat |
| `finances` | Finances | par entité | Valide/refuse après le contrôle de gestion |
| `dga` | DGA | par entité (ou globale si un seul DGA groupe) | Valide en dernier ; déclenche la génération du bon de commande |

Un utilisateur peut cumuler plusieurs rôles sur plusieurs entités (ex. `service_achat` sur Soguipal ET PBIC). `super_admin` n'a pas besoin d'entité (accès total).

### 2.2 Matrice de permissions

| Action | demandeur | service_achat | controle_gestion | finances | dga | super_admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Créer une demande (son entité) | ✔ | ✔ | – | – | – | ✔ |
| Voir ses propres demandes | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Voir toutes les demandes de l'entité | – | ✔ | ✔ | ✔ | ✔ | ✔ |
| Modifier une demande en brouillon (auteur) | ✔ | – | – | – | – | ✔ |
| Analyser / passer en devis | – | ✔ | – | – | – | ✔ |
| Générer & envoyer la demande de devis | – | ✔ | – | – | – | ✔ |
| Saisir un devis reçu, sélectionner le devis | – | ✔ | – | – | – | ✔ |
| Renseigner les prix finaux et valider l'étape achat | – | ✔ | – | – | – | ✔ |
| Valider/refuser étape Contrôle de Gestion | – | – | ✔ | – | – | ✔ |
| Valider/refuser étape Finances | – | – | – | ✔ | – | ✔ |
| Valider étape DGA (déclenche le BC) | – | – | – | – | ✔ | ✔ |
| Gérer référentiels (produits, fournisseurs, sites...) | – | – | – | – | – | ✔ |
| Gérer utilisateurs et rôles | – | – | – | – | – | ✔ |
| Configurer le workflow | – | – | – | – | – | ✔ |
| Consulter l'audit trail d'une demande | ✔ (la sienne) | ✔ | ✔ | ✔ | ✔ | ✔ |

Toute vérification de permission est **scopée par entité** : un `controle_gestion` de Soguipal ne peut agir que sur les demandes dont `purchase_requests.entity_id = son entité`, sauf `super_admin`.

Le refus à n'importe quelle étape (`controle_gestion`, `finances`, `dga`) **exige un commentaire** (champ obligatoire, validé côté serveur, pas seulement côté front).

### 2.3 Accès par module (organisation de l'application par module)

Couche **indépendante** des rôles ci-dessus (`user_entity_roles`), qui gèrent *l'action* dans le
circuit Achat. L'accès par module gère *la visibilité de l'application elle-même* : quels
onglets/écrans un utilisateur voit et peut utiliser, tous modules confondus (RH, Achats, Stock,
chaque référentiel pris séparément). Un utilisateur peut très bien détenir le rôle `service_achat`
sans avoir le module `achats` accordé — dans ce cas il ne voit tout simplement pas le module.

```
user_module_access
  id, user_id (FK), module_key, created_at
```

Catalogue des `module_key` (`backend/src/config/modules.js`) :

| Clé | Module |
|---|---|
| `achats` | Demandes d'achat (tout le circuit : demandes, devis, bons de commande, workflow) |
| `rh` | RH (Employés) |
| `kpi` | KPI (Achats + RH) — agrégats en lecture seule, voir §3.4 ; indépendant de `achats`/`rh` : donne les statistiques consolidées sans donner accès aux fiches individuelles |
| `stock` | **Stock** (label du module, §3.6) — couvre deux sections : Stock du Jour (saisie/historique quotidien par BU, §3.5) et Mouvement Stock (§3.9). Voir §2.4 pour la restriction fine d'écriture par BU, commune aux deux sections |
| `prix` | Historique des prix — voir §3.8 ; contrairement aux référentiels ci-dessous, la **lecture** est aussi gated par ce module (donnée jugée sensible), pas seulement l'écriture |
| `ref_entities`, `ref_sites`, `ref_warehouses`, `ref_machines`, `ref_products`, `ref_product_categories`, `ref_business_units`, `ref_suppliers` | Un par onglet du référentiel — accès fin, pas tout-ou-rien |

Règles :
- **super_admin a toujours accès à tout**, sans octroi explicite (`hasModule()` bypass, comme pour les rôles).
- Pour tout autre utilisateur, l'accès est **refusé par défaut** — il faut l'accorder explicitement (Admin → Utilisateurs → "Accès aux modules").
- Avoir le module d'un référentiel (ex. `ref_products`) donne aussi le **droit d'écriture** dessus (créer/éditer/supprimer), pas seulement la lecture — un gestionnaire de stock avec `ref_products` peut gérer le catalogue produits, pas juste le consulter.
- **Ce qui reste volontairement en lecture ouverte à tout utilisateur authentifié**, même sans le module du référentiel correspondant : les listes `GET` d'entités/sites/produits/fournisseurs, parce qu'elles servent de données de référence ailleurs dans l'app (ex. choisir un site sur la fiche employé, ou un produit sur une ligne de demande d'achat) indépendamment du module. Seule l'**écriture** sur ces référentiels est gated par module ; la lecture de `/api/employees` et de tout le domaine `/api/purchase-requests`, elle, est entièrement gated (y compris en lecture), car ce sont des données métier sensibles propres à leur module.
- Contrôle appliqué **à la fois** côté backend (`requireModule()`, source de vérité) et côté frontend (navigation masquée + garde de route `RequireModule`, juste pour l'UX).

### 2.4 Accès par Business Unit (restriction fine, module `stock` uniquement)

Troisième couche de permission, **indépendante** des deux précédentes (rôles workflow, modules) :
gère non pas *quel module* un utilisateur voit, mais *sur quelle(s) Business Unit(s) il peut
écrire* à l'intérieur du module Stock du Jour.

```
user_business_unit_access
  id, user_id (FK), business_unit_id (FK), created_at, UNIQUE(user_id, business_unit_id)
```

Règles :
- **super_admin bypass**, comme les deux autres couches.
- Un utilisateur avec le module `stock` mais **aucune** ligne dans `user_business_unit_access` a un
  accès **lecture seule sur toutes les BU** (voir toute l'historique, ne peut rien saisir) — c'est
  le cas par défaut pour Direction/Finance qui veulent juste consulter.
- Un utilisateur avec **au moins une** ligne devient restreint à ces BU précises : il ne peut écrire
  que sur les produits de ces BU (`canWriteBusinessUnit`), et la liste/l'historique qu'il voit sont
  filtrés à ces mêmes BU (`visibleBusinessUnitIds` retourne `null` = pas de restriction, ou un
  tableau = restriction stricte).
- Un utilisateur peut avoir accès à **plusieurs** BU (ex. un gestionnaire couvrant Yaourt + Mayo).
- Table dédiée plutôt que réutiliser `user_module_access`, pour garder chaque couche de permission
  simple à raisonner indépendamment (même pattern que le choix module vs rôle).
- Gérée via **Admin → Utilisateurs → "Accès Business Units (Stock du Jour)"** (octroi/révocation),
  `POST/DELETE /api/users/:id/business-units`.

### 2.5 Fraîcheur des droits (rôles, modules, BU)

`requireAuth` (`backend/src/middleware/auth.js`) ne fait pas confiance au contenu du JWT pour les
droits : le token ne porte que l'**identité** (`{ id }`), et `roles`/`modules`/`businessUnits` sont
**relus en base à chaque requête** (`usersService.loadUserWithRoles`). Conséquence : un octroi ou
un retrait d'accès par un super_admin (rôle, module, ou BU) **prend effet immédiatement** sur les
requêtes suivantes de l'utilisateur concerné, sans qu'il ait besoin de se déconnecter/reconnecter.
Avant ce choix, ces informations étaient embarquées dans le JWT à la connexion et ne se
rafraîchissaient qu'au prochain login — un octroi de BU pouvait donc sembler "ne pas marcher" pour
un utilisateur déjà connecté.

Limite connue, acceptée pour cette v1 : côté **frontend**, l'objet `user` du contexte React
(`AuthContext`) n'est chargé qu'au montage de l'app (`GET /auth/me`) — la barre de navigation
(liens de module visibles) ne se met donc à jour qu'après un **rechargement de page** (F5), pas
en temps réel. Les vérifications qui comptent réellement pour la sécurité (écriture, lecture de
données sensibles) sont, elles, toujours revérifiées côté serveur à chaque appel API et donc
toujours à jour — la barre de navigation est purement un confort d'affichage.

### 2.6 Niveau d'accès fin du module Prix

Cinquième couche de permission (même famille que §2.4, mais **un seul niveau par utilisateur**,
pas un ensemble comme les BU) : à l'intérieur du module `prix`, quel niveau d'action un
utilisateur peut effectuer.

```
user_prix_access
  user_id (PK, FK -> users), niveau ('consultation'|'ajout'|'edition'), updated_at
```

Hiérarchie stricte, chaque niveau inclut les précédents : `consultation` (lecture seule) <
`ajout` (peut en plus enregistrer un nouveau changement de prix) < `edition` (peut en plus
corriger ou supprimer une ligne d'historique existante — §3.8).

Règles :
- **super_admin bypass**, toujours au niveau `edition`, sans octroi explicite.
- Un utilisateur avec le module `prix` mais **aucune** ligne dans `user_prix_access` est au
  niveau `consultation` par défaut — le plus restrictif, cohérent avec le principe "refusé par
  défaut" du reste de l'application (§2.3).
- Contrairement à `user_business_unit_access` (une ligne par BU accordée, un utilisateur peut en
  avoir plusieurs), ici il y a **au plus une ligne par utilisateur** (`user_id` en clé primaire) :
  changer de niveau fait un upsert, pas un ajout d'une ligne supplémentaire.
- Gérée via **Admin → Utilisateurs → "Niveau d'accès Prix"** (simple sélecteur, pas de
  bouton octroi/révocation séparé puisqu'il n'y a qu'une valeur active à la fois),
  `PUT /api/users/:id/prix-niveau`.
- Vérifié côté serveur par `requirePrixLevel(minLevel)` (`middleware/permissions.js`) sur chaque
  route d'écriture de `prices.routes.js` — jamais seulement côté frontend.

---

## 3. Workflow de validation — Demande d'achat

Chargé en base au premier démarrage comme `workflow_template` (`module_code = 'demande_achat'`) avec ces `workflow_steps`, dans cet ordre :

| Ordre | Code étape | Rôle requis | Commentaire obligatoire si refus | Comportement si refus |
|---|---|---|---|---|
| 1 | `soumission` | `demandeur` | — | — (pas une validation, juste la création) |
| 2 | `analyse_achat` | `service_achat` | non (pas un refus, une transformation) | — |
| 3 | `devis` | `service_achat` | non | — |
| 4 | `validation_achat` | `service_achat` | non | — |
| 5 | `controle_gestion` | `controle_gestion` | **oui** | retour à l'étape `validation_achat` |
| 6 | `finances` | `finances` | **oui** | retour à l'étape `validation_achat` |
| 7 | `dga` | `dga` | **oui** | retour à l'étape `validation_achat` |
| 8 | `generation_bc` | (système) | — | génération auto du bon de commande |

### 3.1 Détail du cycle de vie d'une demande

1. **Création (`brouillon` → `soumise`)** — le demandeur saisit objet, justification, lignes (produit ou libre), site. Il soumet.
2. **Analyse achat (`en_analyse_achat`)** — le service achat prend connaissance, peut demander une précision au demandeur (commentaire libre, pas un rejet formel du workflow).
3. **Demande de devis (`devis_en_cours`)** — le service achat sélectionne 2 à 3 fournisseurs (issus du référentiel, filtrés par entité), l'outil génère un PDF "demande de devis" et l'envoie par email à chaque fournisseur (`quote_requests` + `quote_request_suppliers`). Chaque envoi est tracé (destinataire, date, statut).
4. **Réception des devis** — le service achat saisit manuellement les devis reçus (montant, devise, pièce jointe scannée) dans `quotes`, un par fournisseur sollicité.
5. **Sélection & validation achat (`devis_selectionne` → `en_validation`)** — le service achat marque un devis `selectionne = true`, ce qui répercute automatiquement `prix_unitaire_final` et `fournisseur_retenu_id` sur les lignes de la demande. Il valide l'étape : la demande passe à l'étape `controle_gestion`.
6. **Contrôle de Gestion** — valide ou refuse (commentaire obligatoire au refus). Si validé → passe à `finances`. Si refusé → retour à `validation_achat`, statut redevient `devis_selectionne`, notification au service achat avec le commentaire.
7. **Finances** — même logique, séquentiel après Contrôle de Gestion (jamais en parallèle).
8. **DGA** — valide ou refuse en dernier lieu.
9. **Génération automatique du bon de commande** — dès la validation DGA : création de `purchase_orders` (numéro généré, fournisseur retenu, montant total), génération du PDF, statut demande → `bon_commande_genere`. Le devis retenu est joint au dossier.

### 3.2 Configurabilité
Le moteur de workflow ne doit **jamais** coder en dur "service_achat puis controle_gestion puis finances puis dga". La logique métier lit `workflow_steps` triées par `ordre` pour un `module_code` donné, et détermine l'étape suivante et le rôle requis dynamiquement. Ceci permet, pour ce module ou un futur module (ex. BC commerciaux), de :
- réordonner les étapes,
- ajouter/retirer une étape,
- changer le rôle requis à une étape,
- changer le comportement en cas de refus (retour vs annulation), par étape.

Un `super_admin` édite ces étapes via une interface dédiée (`Admin → Workflow`,
`frontend/src/pages/Admin/WorkflowConfig.jsx`) : réordonnancement par glisser-déposer, édition de
nom/rôle requis/comportement si refus/étape de retour. Les 4 codes d'étape correspondant à des
actions fixes côté serveur (`soumission`, `analyse_achat`, `devis`, `validation_achat` — ancrages
techniques utilisés par le code, pas de simples étiquettes) sont protégés en écriture : renommer
l'étape reste possible, pas changer son `code`. Cette même page héberge aussi l'éditeur des
paramètres applicatifs (§3.3).

### 3.3 Paramètres applicatifs (`app_settings`)

Table clé/valeur générique (`key`, `value`), éditable par un `super_admin` sans redéploiement,
pour les seuils/règles qui ne méritent pas leur propre table dédiée :

```
app_settings
  key, value
```

| Clé | Défaut | Rôle |
|---|---|---|
| `min_suppliers_devis` | `2` | Nombre minimum de fournisseurs à sélectionner avant de pouvoir lancer une demande de devis (§3.1 étape `devis`). Mettre à `1` désactive de fait la contrainte — utile si un référentiel fournisseurs d'une entité n'est pas encore complet. |

Éditable via **Workflow → Paramètres** (page admin) ou directement `PUT /api/settings/:key`.

### 3.3bis Documents générés (PDF)

`backend/src/utils/pdf.js` génère les deux PDF du circuit (demande de devis, bon de commande) à
partir d'un même module partagé — logo, en-tête entreprise, couleurs et pied de page s'appliquent
donc identiquement aux deux dès qu'on les modifie à un seul endroit.

- **Format A4**, marges 50pt, logo (`backend/src/assets/logo-ccg.png`, copie de
  `frontend/src/assets/logo-web-darklogo.png`) + bloc identité entreprise en en-tête : nom, raison
  sociale, adresse, RCCM/NIF (constantes `COMPANY` en tête de fichier — téléphone/email/NIF
  encore vides, à compléter quand disponibles). Couleurs reprises de la charte de l'app
  (`--color-primary` #1d4ed8, `--color-navy` #0f1b33).
- **Tableau des lignes** avec en-tête bleu et lignes alternées ; colonnes Prix unitaire/Montant
  affichées **seulement sur le bon de commande** (`showPrices: true`) — volontairement absentes de
  la demande de devis puisqu'on y demande justement un prix au fournisseur, y afficher notre
  estimation interne desservirait la négociation.
- **Bloc signature** "Émis par" (demandeur de la demande d'achat) / "Approuvé par" (dernière
  approbation validée du circuit) sur le bon de commande — noms réels tirés de
  `purchase_requests.requester_*` et `approvals`, pas de signature manuscrite (hors périmètre,
  voir §6).
- **Pied de page** sur chaque page : mention légale (raison sociale + RCCM) et numérotation
  `Page X/Y`, calculée via `bufferPages` une fois le document entièrement composé.
- **Formatage des montants fait à la main**, pas via `toLocaleString('fr-FR')` : Node/ICU produit
  une espace fine insécable (U+202F) comme séparateur de milliers, un caractère absent de
  l'encodage WinAnsi des polices standard de pdfkit (Helvetica) — le rendu produisait des "/" à la
  place des espaces. `money()` construit la chaîne avec une espace normale à la place.

**Bug corrigé à cette occasion** : `selectQuote` (sélection du devis retenu) ne renseignait jamais
`purchase_request_lines.prix_unitaire_final` — seuls `fournisseur_retenu_id` et le montant global
de la demande (`montant_final`) étaient mis à jour. Comme les devis fournisseurs ne portent qu'un
montant global (table `quotes`, pas de détail ligne par ligne), `setLinesPrixUnitaireFinal`
répartit ce montant sur les lignes au prorata de `prix_unitaire_estime × quantité` (ou à parts
égales par quantité si aucune estimation n'existe), de sorte que la somme des montants de ligne
corresponde exactement au montant du devis retenu. Les deux bons de commande déjà générés en base
ont été corrigés rétroactivement (même calcul) pour que leur PDF affiche un prix cohérent.

### 3.4 Module KPI

Photo instantanée (pas de filtre de période dans cette v1), en lecture seule, sur trois domaines
(onglets Achats / RH / **Stock (résumé)**) :

- **Achats** : demandes par statut, par entité, montant des bons de commande générés (par
  devise), taux de demandes ayant subi au moins un refus (pas seulement le statut final
  `rejetee`, qui ne survient qu'en cas de `comportement_si_refus = 'annulation'` — voir §3.1),
  délai moyen entre création et génération du bon de commande, top fournisseurs par montant.
- **RH** : effectif actif par Business Unit / entité / statut / type de contrat, ancienneté moyenne.
- **Stock (résumé)** : stock global/par BU, produits suivis, rupture, sous-seuil (`GET /api/kpi/stock`)
  — volontairement une version *courte* : ce même onglet renvoie vers l'**Analyse détaillée**
  du module Stock du Jour (§3.6) pour la comparaison par BU, la courbe d'évolution, les top 10 et
  le détail produit par produit. Les deux ne dupliquent pas le calcul (l'onglet KPI appelle
  `GET /api/kpi/stock`, la page Stock appelle `GET /api/stock/dashboard` — deux endpoints
  distincts qui interrogent la même donnée), mais évitent de tout répéter au même endroit.

Accès via le module `kpi` — **volontairement indépendant** des modules `achats`/`rh`/`stock` : un
utilisateur Direction/Finance peut voir les agrégats consolidés sans avoir accès aux fiches
individuelles (ni à la liste des employés, ni à l'écran de validation d'une demande, ni à la
saisie de stock). Point de départ pour un futur vrai module de reporting multi-modules (avec
filtre de période et export), volontairement laissé simple pour cette v1.

### 3.5 Module Stock du Jour (module `stock`)

Saisie et suivi du stock quotidien de produits finis, par Business Unit (Lait, Tomate, Yaourt,
Mayo/Margarine), construit en 4 phases : (1) modèle de données + saisie + historique + accès par
BU — livré ; (2) intégration KPI — livré ; (3) graphiques Recharts (onglet "Graphiques" : évolution
par BU et par produit, filtres 7/30/90 jours ou période personnalisée) — livré ; (4) tableau de
bord (§3.6) — livré.

**Navigation à deux niveaux** : le lien principal du menu est **"Stock"** (module `stock`, label
inchangé en base) ; en dessous, un premier niveau d'onglets nomme la **section** — "Stock du Jour"
(Saisie du jour / Historique / Graphiques / Analyse détaillée, via `StockSubnav.jsx`) et
"Mouvement Stock" (§3.9), toutes deux listées par `StockSectionNav.jsx` — et pour "Stock du Jour"
un second niveau nomme ses pages.

### 3.6 Tableau de bord exécutif (onglet "Analyse détaillée")

Objectif explicite du commanditaire : que la Direction Générale puisse évaluer la situation de
stock **en moins de 30 secondes**, sans avoir à interroger qui que ce soit. Vue consolidée,
volontairement dense, avec code couleur systématique (vert = sain, orange = sous seuil, rouge =
rupture ou baisse).

Filtres partagés par tout le dashboard : période (7/30/90 jours ou personnalisée), Business Unit,
catégorie de produit, produit précis. **Le filtre "site" demandé initialement n'a pas été implémenté** :
les produits de ce référentiel ne sont rattachés qu'à une Business Unit, pas à un site précis
(`products` n'a pas de `site_id`) — un filtre par site donnerait donc un résultat vide ou trompeur
tant que cette relation n'existe pas dans le modèle. À réévaluer si le besoin se confirme.

Contenu, calculé côté backend par `GET /api/stock/dashboard` :
- **Stock global** et **par BU**, à la date de saisie la plus récente disponible (`asOf`,
  qui n'est pas forcément "aujourd'hui" si personne n'a encore saisi le jour même) — avec variation
  et flèche de tendance (▲/▼/→) par rapport à la saisie distincte précédente (`previousAsOf`), qui
  n'est pas forcément J-1 calendaire puisque les saisies ne sont pas garanties quotidiennes.
- **Alertes rupture (stock = 0) et sous-seuil**, comptées et listées, avec carte rouge/orange dès
  qu'il y en a au moins une.
- **Carte par BU** avec un indicateur de statut rouge/orange/vert (rouge si au moins un produit de
  la BU est en rupture, orange si au moins un est sous son seuil sans être en rupture, vert sinon).
- **Courbe d'évolution du stock global** sur la période choisie.
- **Top 10 des plus fortes baisses** et **top 10 des plus fortes hausses** sur la période
  (comparaison entre la première et la dernière saisie de chaque produit dans la période — pas
  forcément J vs J-1, dépend de quand chaque produit a été saisi).
- **Top 10 des stocks les plus élevés** à la date `asOf`.
- **Détail par Business Unit** : un tableau séparé par BU listant **tous** les produits actifs de
  la BU (pas seulement ceux ayant une saisie) avec leur dernière quantité connue à la date `dateTo`
  choisie — un produit jamais saisi apparaît avec "Jamais saisi", pour que la Direction voie aussi
  les trous de saisie, pas seulement les valeurs. Ligne rouge si rupture, orange si sous seuil.

Accès : gated par le module `stock` uniquement (comme le reste de l'onglet Stock du Jour), pas de
rôle "DG" dédié — cohérent avec le principe déjà appliqué aux autres pages en lecture seule du
module (Historique, Graphiques) : la restriction fine se fait par Business Unit visible (§2.4),
pas par un rôle applicatif supplémentaire.

```
stock_entries
  id, date_stock (DATE), product_id (FK -> products), quantite (NUMERIC), unite (texte),
  commentaire (texte, nullable), created_by (FK -> users), updated_by (FK -> users, nullable),
  created_at, updated_at
  UNIQUE(date_stock, product_id)
```

Décisions de conception :
- **La Business Unit n'est jamais stockée directement sur `stock_entries`** — elle est toujours
  dérivée de `products.business_unit_id` (source unique de vérité), pour éviter qu'une saisie de
  stock puisse un jour désynchroniser de la vraie BU de son produit.
- **Unicité `(date_stock, product_id)`, pas `(date_stock, product_id, business_unit_id)`** — même
  raison : la BU est déjà déterminée par le produit, l'ajouter à la contrainte serait redondant.
- Une nouvelle saisie sur un couple (date, produit) déjà existant fait un **upsert** (met à jour la
  ligne existante, incrémente `updated_by`/`updated_at`) plutôt que de créer un doublon — cohérent
  avec le besoin réel : "corriger la saisie du jour", pas cumuler plusieurs relevés par jour.
- Seuil d'alerte configurable **par produit** (`products.seuil_alerte_stock`, §1.1), pas un
  paramètre global dans `app_settings` — chaque produit a un volume d'écoulement différent. Se
  configure dans **Référentiels → Produits** (champ "Seuil d'alerte stock", éditable par quiconque
  a le module `ref_products`) — vide/non renseigné = pas d'alerte sous-seuil pour ce produit
  (seule la rupture à 0 reste détectée).
- Écriture restreinte par Business Unit via la couche §2.4 ; lecture soumise aux mêmes BU visibles
  pour un utilisateur restreint, ouverte à toutes pour un utilisateur non restreint (mais toujours
  gated par le module `stock` lui-même — pas d'accès du tout sans le module).

### 3.7 Référentiel produits "produit fini" (import PILCO)

Le référentiel produits des 4 Business Units de production (Lait, Tomate, Yaourt, Mayo/Margarine)
a été importé depuis 4 fichiers Excel PILCO fournis (un par BU, onglet "Produits"), 23 produits au
total, rattachés à l'entité Soguipal. Ce référentiel est volontairement enrichi au-delà du strict
nécessaire pour Stock du Jour (conditionnement, format, contenu par carton, kg équivalent, prix
suggéré — §1.1) car il est **destiné à être réutilisé par d'autres modules futurs** (ex. un futur
module de production ou de tarification), pas seulement par la saisie de stock.

À noter : le référentiel fourni est très inégal selon les BU — **BU Lait et BU Tomate n'ont
chacune qu'un seul produit** dans les fichiers source, contre 6 pour Mayo/Margarine et 15 pour
Yaourt. Ce n'est pas un défaut d'import (vérifié ligne à ligne), mais un vrai manque de complétude
du référentiel source côté métier pour ces deux BU — à signaler si la saisie de stock quotidien
doit couvrir plus de produits sur Lait/Tomate.

### 3.8 Module Historique des prix (module `prix`)

Suivi du prix de chaque produit (toutes BU confondues, référentiel §1.1), avec **historique
complet des changements** et un graphique d'évolution.

```
product_prices
  id, product_id (FK -> products), prix (NUMERIC), devise ('GNF'|'USD'|'EUR', défaut GNF),
  date_effet (DATE), commentaire (texte, nullable), created_by (FK -> users), created_at
```

Décisions de conception :
- **Table en pur ajout (append-only), jamais d'upsert** — contrairement à `stock_entries` (relevé
  du jour, corrigible), chaque ligne ici est un **événement daté** ("le prix a changé le X pour
  Y"). Un produit peut avoir plusieurs lignes à la même `date_effet` (ex. correction d'une erreur
  de saisie le jour même) : ce n'est pas une anomalie, aucune contrainte d'unicité ne l'empêche.
  Le prix "actuel" d'un produit est simplement sa ligne la plus récente (`date_effet` puis
  `created_at` en cas d'égalité).
- **La BU n'est jamais dupliquée sur `product_prices`** — dérivée de `products.business_unit_id`,
  même principe que pour le stock.
- **Accès gated par le module `prix` en LECTURE ET EN ÉCRITURE** — contrairement aux référentiels
  simples (§2.3) dont la lecture reste ouverte à tout utilisateur authentifié, le prix est une
  donnée jugée sensible : seul un utilisateur avec le module `prix` explicitement accordé peut y
  accéder, à un niveau qui dépend de `user_prix_access` (§2.6). Pas de restriction fine par
  Business Unit comme pour le stock (§2.4) dans cette v1 — le niveau d'accès s'applique à tous les
  produits, toutes BU confondues. À affiner plus tard si un besoin de cloisonnement par BU
  apparaît (même pattern que `user_business_unit_access` serait réutilisable).
- Page **Historique** : filtres période/BU/catégorie/produit + formulaire d'ajout d'un nouveau
  prix (BU → produit en cascade, comme la saisie de stock) — visible seulement au niveau
  "ajout" ou "edition" ; boutons Éditer/Supprimer sur chaque ligne visibles seulement au niveau
  "edition" (§2.6).
- Page **Graphique** : évolution d'un produit choisi, tracée en **marche d'escalier** (`stepAfter`)
  plutôt qu'en courbe lissée — le prix ne varie pas continûment, il change par paliers discrets à
  chaque `date_effet`, une interpolation lissée serait trompeuse.

### 3.9 Module Mouvement Stock (module `stock`, base posée — non finalisé)

Journal des mouvements individuels de stock (réceptions, sorties), section sœur de "Stock du Jour"
sous le même onglet principal **"Stock"** (§3.5) et gardée par le **même module** `stock` — pas de
module séparé, ni de droit d'accès par Business Unit distinct : un utilisateur qui peut saisir le
Stock du Jour d'une BU peut aussi y enregistrer des mouvements (§2.4).

```
stock_movements
  id, product_id (FK -> products), type_mouvement ('entree'|'sortie'),
  quantite (NUMERIC, > 0), date_mouvement (DATE), motif (texte, nullable),
  reference_document (texte, nullable), created_by (FK -> users), created_at
```

Décisions de conception :
- **Journal en pur ajout (append-only), comme `product_prices` (§3.8), pas un relevé comme
  `stock_entries` (§3.6)** — chaque mouvement est un événement daté distinct ; plusieurs mouvements
  pour le même produit le même jour (ex. une entrée et une sortie) coexistent normalement, aucune
  contrainte d'unicité ne les fusionne.
- **La BU n'est jamais dupliquée sur `stock_movements`** — dérivée de `products.business_unit_id`,
  même principe que pour `stock_entries` et `product_prices`.
- `type_mouvement` limité à `entree`/`sortie` en base (`CHECK`) — pas encore de type "ajustement"
  ou "transfert entre BU", à ajouter si le besoin se confirme.
- Portée volontairement minimale pour cette première version : une seule page (filtres + liste +
  formulaire d'ajout, `MovementsPage.jsx`), pas de modification/suppression d'un mouvement déjà
  enregistré (cohérent avec la logique de journal — une correction s'enregistre comme un nouveau
  mouvement, elle ne réécrit pas l'historique), pas encore de rapprochement automatique avec les
  quantités de `stock_entries`. À enrichir selon les besoins réels une fois cette base validée par
  l'utilisateur.

---

## 4. Endpoints API

Toutes les routes sous `/api`, authentifiées par JWT (`Authorization: Bearer <token>`) sauf `/api/auth/login`.

### 4.1 Authentification & utilisateurs
```
POST   /api/auth/login                          { email, password } -> { token, user }
GET    /api/auth/me                              -> profil + rôles par entité

GET    /api/users                                (super_admin)
POST   /api/users                                (super_admin)
PUT    /api/users/:id                             (super_admin)
POST   /api/users/:id/roles                       { entity_id, role_code } (super_admin)
DELETE /api/users/:id/roles/:roleId               (super_admin)

GET    /api/users/module-catalog                  catalogue des modules disponibles (super_admin)
POST   /api/users/:id/modules                     { module_key } (super_admin)
DELETE /api/users/:id/modules/:accessId           (super_admin)

POST   /api/users/:id/business-units              { business_unit_id } (super_admin, §2.4)
DELETE /api/users/:id/business-units/:accessId    (super_admin, §2.4)

PUT    /api/users/:id/prix-niveau                 { niveau } (super_admin, §2.6)
```

### 4.2 Référentiels
```
GET/POST/PUT/DELETE   /api/entities
GET/POST/PUT/DELETE   /api/sites
GET/POST/PUT/DELETE   /api/warehouses
GET/POST/PUT/DELETE   /api/machines
GET/POST/PUT/DELETE   /api/products               ?entity_id= filtre
GET/POST/PUT/DELETE   /api/suppliers               ?entity_id= filtre
```
Écriture gated par module (`ref_entities`/`ref_sites`/`ref_warehouses`/`ref_machines`/
`ref_products`/`ref_suppliers`, voir §2.3) — pas une restriction super_admin spécifique, un
utilisateur non-admin avec le module accordé peut écrire, comme sur tout autre référentiel.

### 4.2bis Employés (module dédié, pas un simple référentiel générique)
```
GET    /api/employees      ?q=&entity_id=&business_unit_id=&statut=&departement=  liste + recherche + filtres
GET    /api/employees/:id
POST   /api/employees
PUT    /api/employees/:id
DELETE /api/employees/:id
```
Toutes les routes ci-dessus, **lecture comme écriture**, sont gated par le module `rh` (voir §2.3
— exception explicite : contrairement aux référentiels simples, les fiches employés sont une
donnée métier sensible, la lecture n'est **pas** ouverte à tout utilisateur authentifié).

### 4.3 Demandes d'achat
```
POST   /api/purchase-requests                     créer (brouillon)
GET    /api/purchase-requests                     liste, filtres: ?entity_id=&status=&mine=true
GET    /api/purchase-requests/:id                  détail complet (lignes, devis, approvals, historique)
PUT    /api/purchase-requests/:id                  éditer (auteur, tant que brouillon)
POST   /api/purchase-requests/:id/submit           brouillon -> soumise
POST   /api/purchase-requests/:id/lines            ajouter une ligne
PUT    /api/purchase-requests/:id/lines/:lineId
DELETE /api/purchase-requests/:id/lines/:lineId

POST   /api/purchase-requests/:id/quote-requests           créer demande de devis + liste fournisseurs sollicités
POST   /api/purchase-requests/:id/quote-requests/:qrId/send   envoie l'email à chaque fournisseur sollicité
POST   /api/purchase-requests/:id/quotes                    enregistrer un devis reçu (+ pièce jointe)
POST   /api/purchase-requests/:id/quotes/:quoteId/select     sélectionner le devis retenu -> répercute les prix

POST   /api/purchase-requests/:id/validate-step    { comment? }         valide l'étape courante (rôle requis vérifié serveur)
POST   /api/purchase-requests/:id/reject-step       { comment }          refuse l'étape courante (comment obligatoire)

GET    /api/purchase-requests/:id/history           audit trail de la demande
POST   /api/purchase-requests/:id/attachments        upload pièce jointe
GET    /api/attachments/:id                          téléchargement (contrôle d'accès par entité)
```

### 4.4 Bons de commande
```
GET    /api/purchase-orders/:id
GET    /api/purchase-orders/:id/pdf
```

### 4.5 Workflow (admin)
```
GET    /api/workflows/:moduleCode
PUT    /api/workflows/:moduleCode                   (super_admin) réordonner/éditer les étapes
```

### 4.5bis Paramètres applicatifs
```
GET    /api/settings                                tous les paramètres (lecture ouverte à tout utilisateur authentifié)
PUT    /api/settings/:key                           { value } (super_admin)
```

### 4.6 Notifications
```
GET    /api/notifications                           ?unread=true
POST   /api/notifications/:id/read
```

### 4.7 Tableau de bord
```
GET    /api/dashboard        page d'accueil de l'application, contenu adapté au rôle :
                              - tout utilisateur : ses propres demandes par statut + total des demandes
                                en attente de son action (par rôle/entité détenus)
                              - super_admin uniquement (bloc `admin`) : compteurs des référentiels
                                (employés, produits, fournisseurs, sites, entrepôts, machines, utilisateurs),
                                demandes par statut (toutes entités), par entité, montant des bons de
                                commande générés (sommé par devise, jamais mélangé)
```

### 4.8 KPI (module `kpi`, indépendant de `achats`/`rh`)
```
GET    /api/kpi/achats       demandes par statut/entité, montants par devise, taux de refus,
                              délai moyen jusqu'au bon de commande, top fournisseurs
GET    /api/kpi/rh           effectif actif par BU/entité/statut/contrat, ancienneté moyenne
GET    /api/kpi/stock        stock par BU (dernière saisie connue par produit), stock global,
                              nombre de produits suivis, produits en rupture (qty=0), produits
                              sous leur seuil d'alerte (§3.6)
```

### 4.9 Stock du Jour (module `stock`)
```
GET    /api/stock/business-units      BU visibles pour l'utilisateur (toutes si non restreint,
                                       sinon seulement celles accordées via §2.4)
GET    /api/stock/day                 ?date=&business_unit_id= -> grille de saisie du jour :
                                       tous les produits actifs de la BU + leur éventuelle saisie
                                       existante pour cette date, + canWrite (accès en écriture ?)
GET    /api/stock/entries             ?date=&date_from=&date_to=&business_unit_id=&product_id=
                                       -> historique filtrable, restreint aux BU visibles
GET    /api/stock/entries/:id
POST   /api/stock/entries             { date, productId, quantite, unite, commentaire } -> upsert
                                       (date_stock, product_id) ; 403 si pas d'accès écriture sur
                                       la BU du produit
DELETE /api/stock/entries/:id
GET    /api/stock/series/by-bu        ?date_from=&date_to= -> évolution quotidienne du stock total
                                       par BU (somme des saisies réellement faites, un jour sans
                                       saisie n'est pas comblé — voir §3.5)
GET    /api/stock/series/by-product   ?product_id=&date_from=&date_to= -> évolution quotidienne
                                       d'un produit précis
GET    /api/stock/dashboard           ?date_from=&date_to=&business_unit_id=&category_id=&product_id=
                                       -> tableau de bord exécutif (§3.6) : stock global/par BU
                                       avec variation vs saisie précédente, alertes rupture/seuil,
                                       top 10 baisses/hausses/stocks élevés, courbe d'évolution,
                                       détail produit par produit pour chaque BU
```

### 4.9bis Mouvement Stock (module `stock`, base posée — §3.9)
```
GET    /api/stock-movements           ?date_from=&date_to=&business_unit_id=&product_id=
                                       &type_mouvement= -> journal filtrable, mêmes BU visibles
                                       que Stock du Jour (§2.4)
POST   /api/stock-movements           { productId, typeMouvement, quantite, dateMouvement,
                                       motif, referenceDocument } -> 201, ajoute une ligne
                                       (jamais d'upsert, §3.9) ; 403 si pas d'accès écriture sur
                                       la BU du produit
DELETE /api/stock-movements/:id
```

### 4.10 Historique des prix (module `prix`, niveaux §2.6)
```
GET    /api/prices/current    ?business_unit_id=&category_id= -> dernier prix connu par produit
                                (niveau consultation suffit)
GET    /api/prices/history     ?date_from=&date_to=&business_unit_id=&category_id=&product_id=
                                -> historique complet filtrable (§3.8) (niveau consultation suffit)
GET    /api/prices/series      ?product_id=&date_from=&date_to= -> évolution du prix d'un produit
                                (niveau consultation suffit)
POST   /api/prices             { productId, prix, devise, dateEffet, commentaire } -> ajoute un
                                nouveau changement de prix (jamais d'upsert, voir §3.8) — niveau
                                "ajout" ou "edition" requis
PUT    /api/prices/:id         niveau "edition" requis — corrige une ligne d'historique existante
DELETE /api/prices/:id         niveau "edition" requis — supprime une ligne d'historique existante
```

---

## 5. Proposition de structure de projet

Cohérente avec le projet GSBC existant (Express + `pg` + JWT + table de permissions serveur), étendue pour un moteur de workflow générique et le multi-entité.

```
erp-ccg/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── db.js                        # pool pg
│   │   ├── config/
│   │   │   └── env.js
│   │   ├── middleware/
│   │   │   ├── auth.js                  # requireAuth (JWT)
│   │   │   ├── permissions.js           # PERMS + hasPerm + scopeEntity (comme GSBC)
│   │   │   └── errorHandler.js
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── referentials/
│   │   │   │   ├── entities.routes.js
│   │   │   │   ├── sites.routes.js
│   │   │   │   ├── warehouses.routes.js
│   │   │   │   ├── machines.routes.js
│   │   │   │   ├── products.routes.js
│   │   │   │   └── suppliers.routes.js
│   │   │   ├── employees/                  # module dédié (pas un référentiel générique) : recherche,
│   │   │   │   ├── employees.routes.js      # filtres, ancienneté calculée
│   │   │   │   └── employees.service.js
│   │   │   ├── purchase-requests/
│   │   │   │   ├── purchase-requests.routes.js
│   │   │   │   ├── purchase-requests.service.js   # logique métier + moteur de workflow
│   │   │   │   └── purchase-requests.repository.js
│   │   │   ├── purchase-orders/
│   │   │   ├── workflow/
│   │   │   │   ├── workflow.engine.js    # générique, réutilisable par futurs modules
│   │   │   │   └── workflow.routes.js
│   │   │   ├── attachments/
│   │   │   ├── notifications/
│   │   │   └── audit/
│   │   │       └── audit.service.js      # logAction(table, id, action, user, details)
│   │   └── utils/
│   │       ├── mailer.js                 # envoi email demande de devis
│   │       ├── pdf.js                    # génération PDF demande de devis / bon de commande
│   │       └── numbering.js              # génération numéros DA / BC
│   ├── migrations/                       # fichiers SQL séquentiels (001_init.sql, 002_...)
│   ├── seed.js
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── main.jsx
    │   ├── api/
    │   │   └── client.js                 # axios + intercepteur JWT
    │   ├── auth/
    │   │   └── AuthContext.jsx
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── PurchaseRequests/
    │   │   │   ├── ListPage.jsx
    │   │   │   ├── DetailPage.jsx        # timeline workflow + actions selon rôle
    │   │   │   └── CreatePage.jsx
    │   │   ├── Employees/                # module dédié : liste (recherche/filtres) + fiche complète
    │   │   │   ├── ListPage.jsx
    │   │   │   └── FormPage.jsx          # création ET édition
    │   │   ├── Referentials/
    │   │   │   └── ... (une page par référentiel)
    │   │   └── Admin/
    │   │       ├── Users.jsx
    │   │       └── WorkflowConfig.jsx
    │   ├── components/
    │   │   ├── WorkflowTimeline.jsx      # visualise les étapes franchies/en attente
    │   │   └── PermissionGate.jsx        # cache un bouton selon rôle+entité (miroir des permissions serveur)
    │   └── routes/
    │       └── router.jsx
    └── package.json
```

**Choix front :** React + Vite (SPA), plus adapté qu'un simple HTML statique (comme GSBC) dès lors que plusieurs rôles, plusieurs écrans et un workflow multi-étapes doivent cohabiter. Le contrôle de permission reste **côté serveur** (le front ne fait que masquer des actions, jamais les autoriser).

---

## 6. Hors périmètre pour cette v1 (explicite)

- Mouvement Stock **finalisé** — la base est posée (§3.9 : modèle de données, accès par BU, page minimale), mais le module n'est pas complet (types de mouvement à affiner, rapprochement avec Stock du Jour, etc. — à définir selon les besoins réels).
- Génération de bons de commande pour les commerciaux et son workflow propre (module suivant, réutilisera le moteur `workflow_steps`).
- Portail fournisseur (dépôt de devis en ligne par le fournisseur) — v1 = email uniquement, le fournisseur reste hors de l'outil.
- SSO / Azure AD — v1 = JWT email/mot de passe local ; l'architecture (table `users` séparée d'`employees`) n'empêche pas d'ajouter un SSO plus tard.
- Conversion automatique de devises / taux de change temps réel — v1 stocke juste devise + montant par demande, pas de consolidation multi-devise automatique.
- Import/export en masse (Excel/CSV) des référentiels.
- Validations en parallèle (Contrôle de Gestion et Finances restent strictement séquentiels).
- Application mobile native.
- Signature électronique légale des documents (la "validation" est applicative, pas une signature qualifiée au sens juridique).
- Rapports/BI avancés (v1 = listes filtrables, pas de tableaux de bord analytiques).

---

## 7. Vérification de bout en bout (preuve de fonctionnement)

Scénario à exécuter (via un script `backend/test/e2e.purchase-request.test.js` avec `supertest`, ou manuellement via Postman/curl) qui doit passer en entier pour considérer le module livrable :

### 7.1 Préparation (seed)
1. Créer les 3 entités (CCG, Soguipal, PBIC).
2. Créer 6 utilisateurs de test, chacun avec un rôle sur Soguipal :
   `demandeur.sog@test`, `achat.sog@test` (service_achat), `cg.sog@test` (controle_gestion),
   `finances.sog@test`, `dga.sog@test`, `admin@test` (super_admin).
3. Créer 2 fournisseurs rattachés à Soguipal, 1 produit ("Sac d'emballage 25kg").
4. Charger le `workflow_template` "demande_achat" avec ses 8 étapes (§3).

### 7.2 Scénario nominal (doit aboutir à un bon de commande)
1. **Login** `demandeur.sog@test` → token OK.
2. **POST /purchase-requests** — créer une demande Soguipal, 1 ligne (produit, quantité 500).
3. **POST /purchase-requests/:id/submit** — statut passe à `soumise`. Vérifier qu'une notification est créée pour `achat.sog@test`.
4. **Login** `achat.sog@test`.
5. **POST /purchase-requests/:id/quote-requests** avec les 2 fournisseurs → statut `devis_en_cours`.
6. **POST .../send** → vérifier que 2 emails sont "envoyés" (en environnement de test : mock du mailer, vérifier l'appel avec le bon destinataire/pièce jointe PDF).
7. **POST .../quotes** ×2 — saisir un devis pour chaque fournisseur (montants différents).
8. **POST .../quotes/:id/select** sur le moins-disant → vérifier que `purchase_request_lines.prix_unitaire_final` et `fournisseur_retenu_id` sont mis à jour.
9. **POST .../validate-step** (étape `validation_achat`) → statut passe en attente `controle_gestion`. Vérifier notification à `cg.sog@test`.
10. **Login** `cg.sog@test` → **POST .../validate-step** → passe en attente `finances`. Vérifier que `demandeur.sog@test` ne peut PAS valider cette étape (403).
11. **Login** `finances.sog@test` → **POST .../validate-step** → passe en attente `dga`.
12. **Login** `dga.sog@test` → **POST .../validate-step** → statut final `bon_commande_genere`.
13. **GET /purchase-orders/:id** → vérifier numéro généré, fournisseur = celui sélectionné à l'étape 8, montant = somme des lignes au prix final.
14. **GET /purchase-requests/:id/history** → vérifier la présence, dans l'ordre, de : création, soumission, demande de devis envoyée, devis sélectionné, validation achat, validation CG, validation finances, validation DGA, génération BC — chacune avec l'utilisateur et l'horodatage corrects.

### 7.3 Scénario de rejet (doit revenir en arrière, pas s'annuler)
1. Reprendre les étapes 1 à 9 ci-dessus sur une nouvelle demande.
2. **Login** `cg.sog@test` → **POST .../reject-step** **sans commentaire** → doit échouer en 400 ("commentaire obligatoire").
3. **POST .../reject-step** avec commentaire "Prix trop élevé par rapport au marché" → statut revient à `devis_selectionne` (étape `validation_achat`), le workflow n'est **pas** annulé.
4. Vérifier que `achat.sog@test` reçoit une notification contenant le commentaire de refus.
5. `achat.sog@test` sélectionne un autre devis (ou renégocie), revalide → le workflow reprend normalement à `controle_gestion`.

### 7.4 Contrôles transverses à vérifier pendant le scénario
- Isolation multi-entité : un utilisateur avec un rôle uniquement sur PBIC ne voit **aucune** des demandes Soguipal ci-dessus dans `GET /purchase-requests`, et reçoit 403 sur toute action.
- Pièce jointe : le devis scanné uploadé à l'étape 7 est bien récupérable via `GET /attachments/:id` avec le bon `mimetype`.
- Le PDF de la demande de devis (étape 6) et celui du bon de commande (étape 13) sont générés et non vides.

Une fois ce scénario automatisé et vert, le module Demande d'achat est considéré fonctionnellement complet pour la v1.

### 7.5 Autres suites e2e (droits d'accès, fraîcheur des permissions)

En complément de `e2e.purchase-request.test.js` (§7.1-7.4), quatre autres suites `node --test`
couvrent des zones à risque identifiées après coup — notamment la **fraîcheur des droits** (§ tous
les droits sont relus en base à chaque requête via `requireAuth`, jamais mis en cache dans le JWT,
pour qu'un changement de permission par un admin s'applique immédiatement sans que l'utilisateur
concerné ait besoin de se reconnecter) :

- `e2e.stock.test.js` — module Stock du Jour : accès bloqué sans le module, écriture refusée sans
  octroi de Business Unit, octroi en cours de session débloque l'écriture sans reconnexion,
  UPSERT vérifié (`stock_entries`, relevé journalier — §2 distinction journal/relevé).
- `e2e.prices.test.js` — module Prix : les 3 paliers de `user_prix_access` (`consultation` <
  `ajout` < `edition`, §2.6), et confirmation que `product_prices` est bien un **journal
  append-only** (pas d'UPSERT, chaque saisie même-jour/même-produit crée une nouvelle ligne).
- `e2e.user-admin.test.js` — administration des utilisateurs : accès bloqué pour un non-admin,
  fraîcheur d'un octroi de module en cours de session, désactivation/réactivation d'un compte
  (§ blocage/rétablissement de connexion), et un token émis avant désactivation est bien rejeté
  dès la requête suivante (pas seulement au prochain login).
- `e2e.stock-movements.test.js` — module Mouvement Stock (§3.9) : mêmes règles d'accès par
  Business Unit que Stock du Jour (même module `stock`), plusieurs mouvements le même jour pour
  le même produit coexistent (journal, pas un relevé — contrairement à `stock_entries`),
  quantité négative/nulle et type de mouvement invalide refusés.

Le script `npm test` (`backend/package.json`) lance toutes les suites avec
`--test-concurrency=1` — nécessaire car chaque suite réinitialise la base entière
(`DROP SCHEMA CASCADE` dans `resetDatabase()`) avant de se seeder ; en parallèle, deux suites se
marcheraient dessus.

---

## 8. Déploiement Azure & CI/CD

Premier déploiement réel (modules Demande d'achat + Référentiels), effectué avec l'utilisateur pas
à pas via le portail Azure. **Architecture cible** : Azure App Service + Azure Database for
PostgreSQL, deux environnements (dev/prod) via des **slots de déploiement** sur un seul App
Service (plutôt que deux App Services séparés) — moins cher, bascule instantanée possible, au prix
d'un même plan tarifaire partagé entre dev et prod. **Réalité actuelle (§8.1bis)** : un seul
environnement le temps de finaliser, les slots sont différés.

Ressources Azure réellement créées : groupe de ressources `rg-ccg-flow` (région France Central),
serveur `ccg-flow-server.postgres.database.azure.com` (Burstable B1ms, ~$18/mois), App Service
`ccg-flow-app` — nom d'hôte réel (hostname sécurisé unique, suffixe généré par Azure) :
`ccg-flow-app-fhawaqgehyh5dugu.francecentral-01.azurewebsites.net`.

### 8.1 Architecture cible (slots dev/prod)

- **Un seul App Service** (Node.js, Linux) sert à la fois l'API (`/api/*`) et le build React — pas
  de second service/domaine/CORS à gérer (§ décision prise avec l'utilisateur). Le serveur Express
  (`backend/src/server.js`) sert les fichiers statiques du frontend dès qu'il en trouve un build à
  l'un de ces deux emplacements :
  - `backend/public` — structure de déploiement : le CI copie `frontend/dist` ici avant de
    packager, pour que le dossier `backend/` déployé soit **autonome** (c'est tout ce qui est
    envoyé à Azure — pas besoin du dossier `frontend/` sur le serveur).
  - `frontend/dist` — repli pour tester un build de production en local sans cette copie.
- **Deux slots** sur le même App Service : `dev` (persistant, sert d'environnement de test) et
  `production` (le slot par défaut). Chaque slot a sa **propre base de données** (§8.3) — ce ne
  sont pas des slots utilisés pour un swap bleu/vert à chaque déploiement, mais deux environnements
  durables, chacun alimenté directement par sa propre branche Git (§8.2).
- **Une seule Azure Database for PostgreSQL Flexible Server**, avec deux bases distinctes
  (`erp_ccg_dev`, `erp_ccg_prod`) plutôt que deux serveurs séparés — pour maîtriser le coût. Les
  migrations s'appliquent automatiquement au démarrage (`runMigrations()` dans `db.js`, déjà en
  place), donc rien à faire côté CI pour ça : chaque redémarrage après déploiement les rejoue.

### 8.1bis Réalité actuelle : environnement unique

Les slots de déploiement nécessitent un palier **Standard S1** (~$70/mois) — non supporté par
Basic, où l'App Service a été créé pour rester économique (~$13/mois) le temps de finaliser. Choix
fait avec l'utilisateur : **un seul environnement** pour l'instant, pointé sur `erp_ccg_dev` (la
bascule vers `erp_ccg_prod` se fera juste avant la mise en production réelle — un simple
changement de l'App Setting `DATABASE_URL`, §8.3).

Conséquence sur les workflows GitHub Actions :
- `.github/workflows/deploy-prod.yml` déploie **sans `slot-name`** — directement sur le site
  principal de l'App Service (pas de slot).
- `.github/workflows/deploy-dev.yml` est **en pause** (déclencheur réduit à `workflow_dispatch`
  uniquement, pas de push automatique sur `develop`) — à réactiver une fois le plan tarifaire
  passé en Standard et le slot `dev` créé (commentaires explicites dans les deux fichiers).

**Piège rencontré et corrigé** : le champ `environment:` sur un job GitHub Actions change le `sub`
du token OIDC envoyé à Azure (`repo:...:environment:X` au lieu de `repo:...:ref:refs/heads/main`),
qui ne correspond plus à un identifiant fédéré de type "Branch" (§8.4 étape 5) — a provoqué un
échec `AADSTS70021` au premier déploiement réel. Retiré des deux workflows ; à ne réintroduire que
si un identifiant fédéré de type "Environment" est aussi créé côté Azure AD.

### 8.2 Branches et workflows GitHub Actions

| Branche | Cible (architecture cible, §8.1) | Cible (réalité actuelle, §8.1bis) | Workflow |
|---|---|---|---|
| `develop` | slot `dev` | *(en pause)* | `.github/workflows/deploy-dev.yml` |
| `main` | slot `production` | site principal (pas de slot) | `.github/workflows/deploy-prod.yml` |

- `.github/workflows/ci.yml` : sur toute push/PR vers `main`/`develop` — lance la suite de tests
  backend (`npm test`, contre un Postgres éphémère fourni par GitHub Actions) et vérifie que le
  build frontend passe. Ne déploie rien — c'est la porte de qualité avant tout déploiement.
- Chaque workflow de déploiement : build frontend → copie dans `backend/public` → `npm ci
  --omit=dev` dans `backend/` → authentification Azure par **OIDC** (`azure/login`, pas de secret
  longue durée stocké dans GitHub) → déploiement du dossier `backend/` (`azure/webapps-deploy`).
- Déclenchable aussi manuellement (`workflow_dispatch`) sans attendre un push.

### 8.3 Secrets et variables GitHub à configurer

Dans **Settings → Secrets and variables → Actions** du repo :

| Nom | Type | Valeur |
|---|---|---|
| `AZURE_CLIENT_ID` | Secret | Application (client) ID de l'App Registration Azure AD |
| `AZURE_TENANT_ID` | Secret | Tenant ID Azure AD |
| `AZURE_SUBSCRIPTION_ID` | Secret | ID de l'abonnement Azure |
| `AZURE_WEBAPP_NAME` | **Variable** (pas secret) | Nom de l'App Service (`ccg-flow-app`) |

Ces identifiants ne donnent que le droit de déployer (rôle *Website Contributor* scopé à l'App
Service, pas à tout l'abonnement), pas d'accès aux données — `DATABASE_URL`, `JWT_SECRET`,
`SMTP_*` sont configurés séparément, **directement dans Azure** (App Settings, jamais dans
GitHub) :

- Dans le portail Azure : App Service → Environment variables.
- **`DATABASE_URL` doit inclure `?sslmode=require`** — Azure Database for PostgreSQL exige TLS,
  contrairement au Postgres Docker local. `backend/src/db.js` active `ssl: { rejectUnauthorized:
  false }` automatiquement dès que ce paramètre est détecté dans la chaîne de connexion (sans
  effet en local, la chaîne locale ne le contient pas).
- Une fois les slots créés (§8.1bis), **cocher "Deployment slot setting"** pour `DATABASE_URL` (et
  idéalement les autres secrets aussi) — sans ça, un swap manuel de slots ferait pointer le slot de
  prod vers la base de dev (ou l'inverse).
- Ne **jamais** définir `PORT` dans les App Settings Azure — Azure l'injecte lui-même.

Premier compte utilisateur sur une base neuve : `backend/scripts/create-admin.js` — crée un vrai
compte `super_admin` (prompts interactifs, mot de passe visible à l'écran en le tapant), à ne
jamais confondre avec `npm run seed` qui crée des comptes de démo à mot de passe connu
(`Test1234!`) réservés au développement local, jamais à un environnement destiné à devenir
production.

### 8.4 Étapes réalisées / restantes (portail Azure)

1. ✅ Groupe de ressources `rg-ccg-flow`.
2. ✅ Azure Database for PostgreSQL Flexible Server (`ccg-flow-server`, Burstable B1ms) + 2 bases
   (`erp_ccg_dev`, `erp_ccg_prod`).
3. ✅ App Service Plan Basic (`plan-ccg-flow`) + Web App Linux (`ccg-flow-app`).
4. ✅ App Settings (`DATABASE_URL` avec `sslmode=require`, `JWT_SECRET`) — `SMTP_*` pas encore
   configuré (§ SMTP à paramétrer, voir demande utilisateur correspondante).
5. ✅ App Registration Azure AD (`ccg-flow-github-actions`) + identifiant fédéré (federated
   credential) de type Branch pour `main`, avec ID d'organisation/repo GitHub immuables (pas les
   noms — voir "Repository ID"/"Organization ID" dans le formulaire Azure).
6. ✅ Rôle *Website Contributor* de cette App Registration limité à l'App Service.
7. ✅ Premier déploiement réel réussi sur `main` (après correction du piège `environment:`, §8.1bis).
8. ⬜ Créer le vrai premier compte super_admin via `create-admin.js` sur `erp_ccg_dev`.
9. ⬜ Palier Standard S1 + slot `dev` + réactivation de `deploy-dev.yml` (quand prêt à séparer
   dev/prod pour de bon, §8.1bis).
10. ⬜ Bascule finale vers `erp_ccg_prod` avant mise en production réelle.
