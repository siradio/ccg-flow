// CSS de la carte de visite (85 × 55 mm). Classes préfixées `cg-` pour ne pas entrer en collision
// avec les styles globaux de l'app (ex. `.card`). Cette même chaîne est injectée dans la page (aperçu)
// ET dans la fenêtre d'impression dédiée, pour un rendu identique à l'écran et en PDF/A4.
export const CARTE_CSS = `
.cg-cardshell{ border-radius:14px; filter:drop-shadow(0 16px 34px rgba(16,44,76,.22)) }
.cg-card{
  --navy:#0F2C4C; --gold:#F4B41A; --gold2:#FFC94A; --ink:#1C2A3A; --line:#E3E9F0;
  width:85mm; height:55mm; border-radius:4mm; overflow:hidden; position:relative;
  background:radial-gradient(120% 90% at 88% -10%, #1C4A72 0%, #143A5C 45%, #0E2C48 100%);
  color:#EAF1F8; display:flex; box-sizing:border-box }
.cg-card *{ box-sizing:border-box }
.cg-card .cg-accent{ position:absolute; left:0; top:0; bottom:0; width:2.2mm;
  background:linear-gradient(180deg,var(--gold),#E08A00) }
.cg-card .cg-halo{ position:absolute; right:-18%; bottom:-28%; width:60%; height:70%;
  background:radial-gradient(circle, rgba(244,180,26,.22), transparent 62%) }

.cg-left{ flex:1; padding:4.6mm 2mm 4mm 5mm; display:flex; flex-direction:column; min-width:0; position:relative; z-index:2 }
.cg-head{ display:flex; align-items:center; gap:2mm }
.cg-head .cg-chip{ background:#fff; border-radius:1.6mm; padding:1mm 1.3mm; display:flex }
.cg-head .cg-chip img{ height:6mm; display:block }
.cg-head .cg-org{ font-size:2.9mm; font-weight:800; letter-spacing:.2px; line-height:1 }
.cg-slogan{ margin:1.2mm 0 auto; font-size:2.2mm; font-weight:700; color:var(--gold);
  letter-spacing:.15px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:none }

.cg-id{ margin:2mm 0 1.5mm }
.cg-name{ font-size:4.6mm; font-weight:800; color:#fff; line-height:1.05; letter-spacing:.1px }
.cg-title{ font-size:2.6mm; font-weight:700; color:var(--gold2); letter-spacing:.3px; margin-top:.8mm; min-height:2.6mm }
.cg-rule{ height:.35mm; background:rgba(255,255,255,.18); margin:1.6mm 0 1.8mm; width:88%; flex:none }

.cg-rows{ display:flex; flex-direction:column; gap:1mm }
.cg-row{ display:flex; align-items:center; gap:1.8mm; font-size:2.35mm; color:#D7E3EE; line-height:1.15 }
.cg-row svg{ width:2.6mm; height:2.6mm; flex:none; fill:var(--gold) }
.cg-row span{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.cg-row.cg-row-adr{ font-size:2.1mm }

.cg-right{ width:27mm; flex:none; padding:3.4mm 3.4mm 3mm 2mm; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:1.6mm; position:relative; z-index:2 }
.cg-photo{ width:13mm; height:13mm; border-radius:50%; object-fit:cover; border:.6mm solid var(--gold);
  box-shadow:0 1mm 2mm rgba(0,0,0,.3); display:none }
.cg-photo.cg-on{ display:block }
.cg-qrtile{ background:#fff; border-radius:2.4mm; padding:1.5mm; line-height:0;
  box-shadow:0 0 0 .45mm var(--gold), 0 1mm 2.5mm rgba(0,0,0,.28) }
.cg-qrtile canvas, .cg-qrtile img{ width:18mm; height:18mm; display:block }
.cg-qrcap{ font-size:1.9mm; font-weight:700; color:#AEC2D4; text-align:center; letter-spacing:.2px; line-height:1.2 }
.cg-qrcap b{ display:block; margin-top:.5mm; font-size:2.05mm; font-weight:800; color:var(--gold2); letter-spacing:.1px; line-height:1.15 }

/* Variante claire : mêmes blocs, seules les couleurs changent. */
.cg-card.cg-clair{ background:radial-gradient(120% 90% at 88% -10%, #FFFFFF 0%, #F5F8FC 45%, #E9EFF6 100%); color:var(--ink) }
.cg-card.cg-clair .cg-halo{ background:radial-gradient(circle, rgba(244,180,26,.20), transparent 62%) }
.cg-card.cg-clair .cg-head .cg-chip{ box-shadow:0 0 0 .18mm var(--line) }
.cg-card.cg-clair .cg-head .cg-org{ color:var(--navy) }
.cg-card.cg-clair .cg-slogan{ color:#9C6B07 }
.cg-card.cg-clair .cg-name{ color:var(--navy) }
.cg-card.cg-clair .cg-title{ color:#9C6B07 }
.cg-card.cg-clair .cg-rule{ background:rgba(15,44,76,.16) }
.cg-card.cg-clair .cg-row{ color:#3C4D60 }
.cg-card.cg-clair .cg-row svg{ fill:#C8860D }
.cg-card.cg-clair .cg-qrtile{ box-shadow:0 0 0 .45mm var(--gold), 0 .6mm 1.6mm rgba(16,44,76,.18) }
.cg-card.cg-clair .cg-qrcap{ color:#7A8798 }
.cg-card.cg-clair .cg-qrcap b{ color:#9C6B07 }
`;

// Règles ajoutées uniquement dans la fenêtre d'impression (A4, carte centrée à sa taille réelle).
export const CARTE_PRINT_CSS = `
@page{ size:A4; margin:0 }
html,body{ margin:0; background:#fff }
.cg-print-wrap{ position:fixed; top:16mm; left:50%; transform:translateX(-50%) }
.cg-cardshell{ filter:none }
.cg-card{ box-shadow:none }
`;
