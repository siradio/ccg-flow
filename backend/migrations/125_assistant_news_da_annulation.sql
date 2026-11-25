-- Assistant « CCG Flow » — ajoute une nouveauté (type « amélioration ») annonçant l'annulation d'une
-- demande d'achat (brouillon : annulation directe ; en circuit : demande d'annulation soumise au
-- validateur courant). Migration additive & idempotente : insérée une seule fois (garde sur le titre),
-- même si la table assistant_news contient déjà des annonces.
INSERT INTO assistant_news (titre, contenu, type, module_key, lien, epingle)
SELECT 'Demandes d''achat : annuler une demande',
       'Vous pouvez désormais annuler une demande d''achat. En brouillon, l''auteur l''annule directement. Une fois dans le circuit, l''auteur dépose une demande d''annulation avec un motif : le validateur qui a la demande à son niveau est notifié et peut l''accepter ou la refuser. L''auteur peut retirer sa demande tant qu''elle est en attente.',
       'amelioration', 'achats', '/purchase-requests', false
WHERE NOT EXISTS (
  SELECT 1 FROM assistant_news
  WHERE titre = 'Demandes d''achat : annuler une demande'
);
