-- Assistant « CCG Flow » — ajoute une nouveauté annonçant les générateurs de l'onglet Outils
-- (carte de visite & signature e-mail), accessibles à tout utilisateur connecté sans octroi.
-- Migration additive & idempotente : insérée une seule fois (garde sur le titre), même si la table
-- assistant_news contient déjà des annonces (contrairement au seed de 121 qui n'amorce que si vide).
INSERT INTO assistant_news (titre, contenu, type, module_key, lien, epingle)
SELECT 'Nouveaux outils : carte de visite & signature e-mail',
       'Générez votre carte de visite et votre signature e-mail aux couleurs du groupe CCG, directement dans l''application. Ouvrez le menu « Outils », remplissez vos informations et récupérez le résultat prêt à l''emploi. Accessible à tous, sans habilitation particulière.',
       'nouveau', 'outils', '/outils/carte-visite', false
WHERE NOT EXISTS (
  SELECT 1 FROM assistant_news
  WHERE titre = 'Nouveaux outils : carte de visite & signature e-mail'
);
