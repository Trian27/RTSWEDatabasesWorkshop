/**
 * Shared test helpers: build a fresh in-memory workshop database from the SQL files on disk,
 * using the same PGlite version the workshop page loads in the browser.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const SQL_DIR = new URL('../sql/', import.meta.url);

/**
 * Read one file from sql/.
 * @param {string} name file name, e.g. "schema.sql"
 * @returns {Promise<string>}
 */
export function readSqlFile(name) {
  return readFile(fileURLToPath(new URL(name, SQL_DIR)), 'utf8');
}

/**
 * Create an in-memory PGlite database loaded with schema.sql and seed.sql.
 * @returns {Promise<PGlite>}
 */
export async function createWorkshopDb() {
  const db = new PGlite();
  await db.exec(await readSqlFile('schema.sql'));
  await db.exec(await readSqlFile('seed.sql'));
  return db;
}

/**
 * Run a query that returns one row with one column and return that value as a Number.
 * @param {PGlite} db
 * @param {string} sql
 * @returns {Promise<number>}
 */
export async function scalar(db, sql) {
  const result = await db.query(sql, [], { rowMode: 'array' });
  return Number(result.rows[0][0]);
}
