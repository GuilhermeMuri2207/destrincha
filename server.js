import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { CATEGORIAS, MODEL, extrairFatura, mensagemErro } from './ia.js';
import {
  salvarFatura,
  listarFaturas,
  obterFatura,
  corrigirLancamento,
  excluirFatura,
  resumoMensal,
  lancamentosDoPeriodo,
} from './db.js';

const PORT = process.env.PORT || 3000;
const app = express();

const upload = multer({
  storage: multer.memoryStorage(), // o PDF fica só na memória, nada é salvo em disco
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
});

app.use(express.json());
app.use(express.static('public'));

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

app.get('/api/categorias', (_req, res) => res.json(CATEGORIAS));

// Envia um PDF: a IA extrai os lançamentos e a fatura é salva no banco
app.post('/api/fatura', upload.single('fatura'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erro: 'Envie um arquivo PDF.' });
  }
  try {
    const dados = await extrairFatura(req.file.buffer);
    if (dados.lancamentos.length === 0) {
      return res.status(422).json({ erro: 'Nenhum lançamento encontrado nesse PDF.' });
    }
    const fatura = salvarFatura({ ...dados, arquivo: req.file.originalname });
    res.status(201).json(fatura);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: mensagemErro(e) });
  }
});

app.get('/api/faturas', (_req, res) => res.json(listarFaturas()));

app.get('/api/faturas/:id', (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ erro: 'ID inválido.' });
  const fatura = obterFatura(Number(req.params.id));
  if (!fatura) return res.status(404).json({ erro: 'Fatura não encontrada.' });
  res.json(fatura);
});

app.delete('/api/faturas/:id', (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ erro: 'ID inválido.' });
  if (!excluirFatura(Number(req.params.id))) {
    return res.status(404).json({ erro: 'Fatura não encontrada.' });
  }
  res.status(204).end();
});

// Corrige nome e/ou categoria de um lançamento e aplica a todos do mesmo estabelecimento
app.patch('/api/lancamentos/:id', (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ erro: 'ID inválido.' });
  const { categoria, nome } = req.body ?? {};
  if (categoria === undefined && nome === undefined) {
    return res.status(400).json({ erro: 'Envie nome e/ou categoria.' });
  }
  if (categoria !== undefined && !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ erro: 'Categoria inválida.' });
  }
  const nomeLimpo = nome === undefined ? null : String(nome).trim().slice(0, 80);
  if (nome !== undefined && !nomeLimpo) {
    return res.status(400).json({ erro: 'O nome não pode ficar vazio.' });
  }
  const resultado = corrigirLancamento(Number(req.params.id), {
    nome: nomeLimpo,
    categoria: categoria ?? null,
  });
  if (!resultado) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  res.json(resultado);
});

// ---------- Resumos ----------

// Totais por mês e categoria; o front monta as visões mensal e anual
app.get('/api/resumo', (_req, res) => res.json(resumoMensal()));

// Lançamentos de um período (?periodo=2026 ou 2026-10) e, opcionalmente, de uma categoria
app.get('/api/lancamentos', (req, res) => {
  const { periodo, categoria } = req.query;
  if (!/^\d{4}(-\d{2})?$/.test(String(periodo || ''))) {
    return res.status(400).json({ erro: 'Período inválido. Use AAAA ou AAAA-MM.' });
  }
  if (categoria && !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ erro: 'Categoria inválida.' });
  }
  res.json(lancamentosDoPeriodo(periodo, categoria || null));
});

app.listen(PORT, () => {
  console.log(`Rodando em http://localhost:${PORT} (modelo: ${MODEL})`);
});
