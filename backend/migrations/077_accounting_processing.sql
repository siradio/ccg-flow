-- Module Comptabilité — fondation générique du TRAITEMENT comptable des documents métier.
--
-- Cette table ne duplique PAS les documents métier (BDC, factures…) : elle porte uniquement l'état
-- du traitement comptable associé à un document source, identifié de façon générique par
-- (source_module, source_document_type, source_document_id). Ainsi le même moteur pourra plus tard
-- accueillir d'autres documents (BDC commerciaux, factures fournisseurs/clients, dépenses…) sans
-- refonte. Le document reste la propriété de son module métier (Achat, Commerce…).
--
-- Concurrence : la prise en charge est atomique via la contrainte UNIQUE (source_*) + un INSERT
-- « ON CONFLICT DO NOTHING » (voir accounting.repository.takeOver) — un seul agent peut gagner.
CREATE TABLE IF NOT EXISTS accounting_processing (
  id                        SERIAL PRIMARY KEY,
  company_id                INTEGER REFERENCES entities(id),      -- société / entité (multi-société)
  source_module             TEXT NOT NULL,                        -- ex. 'PURCHASE', 'SALES'
  source_document_type      TEXT NOT NULL,                        -- ex. 'PURCHASE_ORDER'
  source_document_id        INTEGER NOT NULL,                     -- id du document dans son module
  source_document_reference TEXT,                                 -- ex. numéro du BDC (lisible)
  processing_type           TEXT NOT NULL,                        -- ex. 'PURCHASE_ORDER_ACCOUNTING'
  status                    TEXT NOT NULL DEFAULT 'NOT_PROCESSED'
                              CHECK (status IN ('NOT_PROCESSED', 'IN_PROGRESS', 'PROCESSED')),
  assigned_to               INTEGER REFERENCES users(id),         -- agent ayant pris en charge
  processing_started_at     TIMESTAMPTZ,
  processed_by              INTEGER REFERENCES users(id),         -- agent ayant finalisé
  processed_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_module, source_document_type, source_document_id)
);
CREATE INDEX IF NOT EXISTS idx_acc_proc_status     ON accounting_processing(status);
CREATE INDEX IF NOT EXISTS idx_acc_proc_assigned   ON accounting_processing(assigned_to);
CREATE INDEX IF NOT EXISTS idx_acc_proc_company    ON accounting_processing(company_id);
CREATE INDEX IF NOT EXISTS idx_acc_proc_type       ON accounting_processing(processing_type);
