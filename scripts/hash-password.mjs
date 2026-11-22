// Gera o hash da senha do admin para a variável ADMIN_PASSWORD_HASH.
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
  password = await askHidden('Senha do admin: ');
}

if (!password || password.length < 6) {
  console.error('A senha precisa ter pelo menos 6 caracteres.');
  process.exit(1);
}

const hash = hashPassword(password);

console.log('\nADMIN_PASSWORD_HASH=');
console.log(hash);
console.log('\nCole o valor acima nas variáveis de ambiente da Vercel (e no .env.local).');
