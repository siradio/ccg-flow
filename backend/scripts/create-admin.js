#!/usr/bin/env node
// Crée un vrai compte super_admin — à utiliser pour le premier compte d'un environnement neuf
// (dev en cours de finalisation, ou prod plus tard), jamais pour des comptes de démo (voir
// seed.js pour ceux-ci, réservés au développement local).
//
// Usage : node scripts/create-admin.js  (depuis backend/, avec DATABASE_URL déjà positionné
// sur la base cible dans l'environnement du terminal).
//
// Le mot de passe saisi reste VISIBLE à l'écran (pas de saisie masquée) — assure-toi que
// personne ne regarde ton écran / que tu ne partages pas ton écran au moment de la saisie.
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { one, run, pool } = require('../src/db');

// Une seule interface readline pour tout le script, réutilisée à chaque question — en créer une
// par question casse la lecture avec une entrée pipée (rl.close() laisse stdin dans un état qui
// empêche une nouvelle interface de recevoir la suite).
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

async function main() {
  console.log("Création d'un compte super_admin réel.\n");
  const nom = await ask('Nom : ');
  const prenom = await ask('Prénom : ');
  const email = await ask('Email : ');
  const password = await ask('Mot de passe (visible à l\'écran) : ');
  const confirm = await ask('Confirmer le mot de passe : ');
  rl.close();

  if (!nom || !prenom || !email) {
    console.error('❌ Nom, prénom et email sont obligatoires.');
    process.exitCode = 1;
    return pool.end();
  }
  if (password !== confirm) {
    console.error('❌ Les mots de passe ne correspondent pas.');
    process.exitCode = 1;
    return pool.end();
  }
  if (password.length < 8) {
    console.error('❌ Mot de passe trop court (8 caractères minimum).');
    process.exitCode = 1;
    return pool.end();
  }

  const existing = await one('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) {
    console.error(`❌ Un utilisateur avec l'email ${email} existe déjà.`);
    process.exitCode = 1;
    return pool.end();
  }

  const hash = bcrypt.hashSync(password, 10);
  const user = await one(
    'INSERT INTO users (nom, prenom, email, password_hash, actif) VALUES ($1,$2,$3,$4,true) RETURNING id',
    [nom, prenom, email, hash]
  );
  await run('INSERT INTO user_entity_roles (user_id, entity_id, role_code) VALUES ($1, NULL, $2)', [user.id, 'super_admin']);

  console.log(`\n✅ Compte super_admin créé : ${email} (id ${user.id})`);
  await pool.end();
}

main().catch(err => {
  console.error('❌ Erreur :', err.message);
  process.exitCode = 1;
  return pool.end();
});
