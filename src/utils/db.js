export function getDb(env) {
  if (!env?.DB) {
    throw new Error("D1 binding DB is missing");
  }

  return env.DB;
}

export async function dbRun(env, sql, bindings = []) {
  return getDb(env).prepare(sql).bind(...bindings).run();
}

export async function dbFirst(env, sql, bindings = []) {
  return getDb(env).prepare(sql).bind(...bindings).first();
}

export async function dbAll(env, sql, bindings = []) {
  const result = await getDb(env).prepare(sql).bind(...bindings).all();
  return result.results ?? [];
}

export async function dbBatch(env, statements) {
  const prepared = statements.map(({ sql, bindings = [] }) => {
    return getDb(env).prepare(sql).bind(...bindings);
  });

  return getDb(env).batch(prepared);
}

export function nowIso() {
  return new Date().toISOString();
}
