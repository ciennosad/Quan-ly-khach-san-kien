import 'dotenv/config';
import fs from 'fs';
import { pool } from './KetNoiCSDL.js';
const sql = fs.readFileSync(new URL('./CauTrucCSDL.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Schema initialized.');
await pool.end();
