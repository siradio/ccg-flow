#!/usr/bin/env node
// Réinitialise le mot de passe d'un compte existant (utile si le compte a été créé avec un mot
// de passe mal transcrit, ou en cas d'oubli). Modifie uniquement password_hash, ne touche à rien
// d'autre (rôles, actif, etc.).
//
// Usage : node scripts/reset-password.js  (depuis backend/, avec DATABASE_URL positionné sur la
// base cible dans l'environnement du terminal).
//
// Le mot de passe saisi reste VISIBLE à l'écran (pas de saisie masquée).
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { one, run, pool } = require('../src/db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

async function main() {
  console.log('Réinitialisation du mot de passe d\'un compte existant.\n');
  const email = await ask('Email du compte : ');
  const password = await ask('Nouveau mot de passe (visible à l\'écran) : ');
  const confirm = await ask('Confirmer le nouveau mot de passe : ');
  rl.close();

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

  const user = await one('SELECT id FROM users WHERE email = $1', [email]);
  if (!user) {
    console.error(`❌ Aucun utilisateur avec l'email ${email}.`);
    process.exitCode = 1;
    return pool.end();
  }

  const hash = bcrypt.hashSync(password, 10);
  await run('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);

  console.log(`\n✅ Mot de passe réinitialisé pour ${email} (id ${user.id}).`);
  await pool.end();
}

main().catch(err => {
  console.error('❌ Erreur :', err.message);
  process.exitCode = 1;
  return pool.end();
});
