import fs from 'fs';

const hello = fs.readdirSync(process.cwd());
console.log(hello);
