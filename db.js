// Banco SQLite usando o módulo nativo do Node (node:sqlite), sem dependências extras.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';

mkdirSync('data', { recursive: true });
const db = new DatabaseSync('data/destrincha.db');

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS faturas (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    arquivo      TEXT,
    banco        TEXT,
    vencimento   TEXT,
    total_fatura REAL,
    criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lancamentos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    fatura_id INTEGER NOT NULL REFERENCES faturas(id) ON DELETE CASCADE,
    data      TEXT,
    descricao TEXT NOT NULL,
    nome      TEXT NOT NULL,
    chave     TEXT NOT NULL,
    valor     REAL NOT NULL,
    categoria TEXT NOT NULL,
    parcela   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_lanc_fatura ON lancamentos(fatura_id);
  CREATE INDEX IF NOT EXISTS idx_lanc_chave  ON lancamentos(chave);

  -- Quando você corrige o nome ou a categoria, o app "aprende": a regra vale
  -- para todos os lançamentos do mesmo estabelecimento, inclusive os das próximas faturas.
  CREATE TABLE IF NOT EXISTS regras (
    chave     TEXT PRIMARY KEY,
    nome      TEXT,
    categoria TEXT
  );
`);

/**
 * Gera uma chave estável para o estabelecimento, ignorando números, acentos e parcelas.
 * Ex.: "UBER *TRIP 8812" e "Uber Trip 1234" viram "uber trip".
 */
export function chaveDe(descricao) {
  return String(descricao)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function transacao(fn) {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const sql = {
  inserirFatura: db.prepare(
    'INSERT INTO faturas (arquivo, banco, vencimento, total_fatura) VALUES (?, ?, ?, ?)'
  ),
  inserirLanc: db.prepare(
    `INSERT INTO lancamentos (fatura_id, data, descricao, nome, chave, valor, categoria, parcela)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  regra: db.prepare('SELECT nome, categoria FROM regras WHERE chave = ?'),
  listar: db.prepare(`
    SELECT f.id, f.arquivo, f.banco, f.vencimento, f.total_fatura, f.criado_em,
           COUNT(l.id) AS qtd, COALESCE(SUM(l.valor), 0) AS somado
      FROM faturas f
      LEFT JOIN lancamentos l ON l.fatura_id = f.id
     GROUP BY f.id
     ORDER BY f.vencimento DESC, f.id DESC
  `),
  fatura: db.prepare('SELECT * FROM faturas WHERE id = ?'),
  lancamentosDa: db.prepare(
    'SELECT id, data, descricao, nome, valor, categoria, parcela FROM lancamentos WHERE fatura_id = ? ORDER BY data, id'
  ),
  lanc: db.prepare('SELECT id, chave FROM lancamentos WHERE id = ?'),
  // Campos null não sobrescrevem o que já foi aprendido
  salvarRegra: db.prepare(
    `INSERT INTO regras (chave, nome, categoria) VALUES (?, ?, ?)
     ON CONFLICT(chave) DO UPDATE SET
       nome      = COALESCE(excluded.nome, regras.nome),
       categoria = COALESCE(excluded.categoria, regras.categoria)`
  ),
  aplicarRegra: db.prepare(
    `UPDATE lancamentos
        SET nome = COALESCE(?, nome), categoria = COALESCE(?, categoria)
      WHERE chave = ?`
  ),
  excluir: db.prepare('DELETE FROM faturas WHERE id = ?'),
};

/** Salva a fatura extraída pela IA, aplicando as regras de categoria já aprendidas. */
export function salvarFatura({ arquivo, banco, vencimento, total_fatura, lancamentos }) {
  const id = transacao(() => {
    const { lastInsertRowid } = sql.inserirFatura.run(
      arquivo ?? null,
      banco ?? null,
      vencimento ?? null,
      total_fatura ?? null
    );
    for (const l of lancamentos) {
      const chave = chaveDe(l.descricao);
      const regra = sql.regra.get(chave);
      const nome = regra?.nome ?? l.nome ?? l.descricao;
      const categoria = regra?.categoria ?? l.categoria;
      sql.inserirLanc.run(
        lastInsertRowid,
        l.data ?? null,
        l.descricao,
        nome,
        chave,
        l.valor,
        categoria,
        l.parcela ?? null
      );
    }
    return Number(lastInsertRowid);
  });
  return obterFatura(id);
}

export function listarFaturas() {
  return sql.listar.all();
}

export function obterFatura(id) {
  const fatura = sql.fatura.get(id);
  if (!fatura) return null;
  return { ...fatura, lancamentos: sql.lancamentosDa.all(id) };
}

/**
 * Corrige o nome e/ou a categoria de um lançamento e aplica a todos
 * os lançamentos do mesmo estabelecimento. Passe null no que não mudar.
 */
export function corrigirLancamento(lancamentoId, { nome = null, categoria = null }) {
  const lanc = sql.lanc.get(lancamentoId);
  if (!lanc) return null;
  return transacao(() => {
    sql.salvarRegra.run(lanc.chave, nome, categoria);
    const { changes } = sql.aplicarRegra.run(nome, categoria, lanc.chave);
    return { alterados: Number(changes) };
  });
}

export function excluirFatura(id) {
  return Number(sql.excluir.run(id).changes) > 0;
}
