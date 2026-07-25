"""Extrait le référentiel produits finis depuis les fichiers PILCO par BU.
Usage : python extract_pilco_products.py <dossier ref> produits_bu_import.json
Ne touche pas à la base — produit juste un JSON intermédiaire, lu ensuite par
scripts/import-pilco-products.js.
"""
import json
import sys
import re
from pathlib import Path

import openpyxl

FILE_TO_BU = {
    'PILCO_BU_LAIT_ccg_V1.xlsx': 'bu_lait',
    'PILCO_BU_MAYO_ccg_V1.xlsx': 'bu_mayo_margarine',
    'PILCO_BU_TOMATE_ccg_V1.xlsx': 'bu_tomate',
    'PILCO_BU_YAOURT_ccg_V1 (1).xlsx': 'bu_yaourt',
}


def clean_str(v):
    if v is None:
        return None
    s = str(v).strip()
    s = re.sub(r'\s+', ' ', s)
    return s if s else None


def clean_num(v):
    if v is None or v == '':
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def extract_file(path, bu_code):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb['Produits']
    rows = []
    for row in ws.iter_rows(min_row=4, values_only=True):
        code, designation, categorie, format_taille, unite, contenu, kg_equiv, prix = (list(row) + [None] * 8)[:8]
        designation = clean_str(designation)
        if not designation:
            continue
        rows.append({
            'code': clean_str(code),
            'designation': designation,
            'conditionnement': clean_str(categorie),
            'format_taille': clean_num(format_taille),
            'unite': clean_str(unite),
            'contenu_par_carton': clean_num(contenu),
            'kg_equivalent_carton': clean_num(kg_equiv),
            'prix_suggere_gnf': clean_num(prix),
            'business_unit_code': bu_code,
        })
    wb.close()
    return rows


def main():
    src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
        r'C:\Users\SiradioDIALLO\OneDrive - barkeyconsulting\Code\Claude\ref'
    )
    out = sys.argv[2] if len(sys.argv) > 2 else 'produits_bu_import.json'

    all_rows = []
    for filename, bu_code in FILE_TO_BU.items():
        path = src_dir / filename
        if not path.exists():
            print(f'  ! fichier introuvable, ignoré : {path}')
            continue
        rows = extract_file(path, bu_code)
        print(f'{filename} -> {len(rows)} produit(s) ({bu_code})')
        all_rows.extend(rows)

    codes = [r['code'] for r in all_rows if r['code']]
    dupes = {c for c in codes if codes.count(c) > 1}
    if dupes:
        print(f'  ! codes en double détectés (à vérifier manuellement) : {sorted(dupes)}')

    with open(out, 'w', encoding='utf-8') as f:
        json.dump(all_rows, f, ensure_ascii=False, indent=2)
    print(f'\n{len(all_rows)} produits extraits -> {out}')


if __name__ == '__main__':
    main()
