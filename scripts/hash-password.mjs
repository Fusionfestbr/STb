// Gera o hash de uma senha (ADMIN_PASSWORD_HASH ou GUEST_PASSWORD_HASH).
// Uso: node scripts/hash-password.mjs "sua-senha"
// ou:  node scripts/hash-password.mjs   (pergunta a senha sem exibir)

import readline from 'node:readline';
import { hashPassword } from '../server/auth.js';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function (text) {
      if (rl.stdoutMuted) {
        rl.output.write('*');
      } else {
        originalWrite.call(rl, text);
      }
    };

    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });

    rl.stdoutMuted = true;
  });
}

const argPassword = process.argv[2];

let password = argPassword;
if (!password) {
  password = await askHidden('Senha: ');
}

if (!password || password.length < 5) {
  console.error('A senha precisa ter pelo menos 5 caracteres.');
  process.exit(1);
}

if (password.length < 8) {
  console.warn('Aviso: senha curta (menos de 8 caracteres). Use apenas se souber o risco.');
}

const hash = hashPassword(password);

console.log('\nCole o hash na variável correspondente:');
console.log('  ADMIN_PASSWORD_HASH (admin) · GUEST_PASSWORD_HASH (convidado) · GENERIC_PASSWORD_HASH (genérica)');
console.log('\n' + hash + '\n');
console.log('Depois adicione/atualize a variável na Vercel e faça um novo deploy.');
