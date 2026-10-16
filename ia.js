// Extração da fatura com o Gemini
import { GoogleGenAI } from '@google/genai';

export const MODEL = process.env.MODEL || 'gemini-3.8-flash';

export const CATEGORIAS = [
  'Mercado',
  'Restaurante/Delivery',
  'Transporte',
  'Assinaturas',
  'Saúde',
  'Compras',
  'Lazer',
  'Contas/Serviços',
  'Educação',
  'Outros',
];

const PROMPT = `Você vai receber a fatura de um cartão de crédito brasileiro em PDF.
Extraia os dados e responda APENAS com um JSON válido, sem texto antes ou depois, neste formato:

{
  "banco": "nome do banco/cartão ou null",
  "vencimento": "AAAA-MM-DD ou null",
  "total_fatura": número ou null,
  "lancamentos": [
    {
      "data": "AAAA-MM-DD (se o ano não aparecer, deduza pelo vencimento)",
      "descricao": "texto do lançamento exatamente como aparece na fatura",
      "nome": "nome fácil de entender do estabelecimento",
      "valor": número (positivo para compras, negativo para estornos/créditos),
      "categoria": uma de ${JSON.stringify(CATEGORIAS)},
      "parcela": "3/10" ou null
    }
  ]
}

Regras:
- Valores em número com ponto decimal (ex.: 1234.56), sem "R$".
- NÃO inclua o pagamento da fatura anterior nem saldo anterior.
- Inclua anuidade, IOF, juros e tarifas como lançamentos (categoria "Contas/Serviços").
- Se houver mais de um cartão (titular e adicional), junte tudo na mesma lista.
- Escolha a categoria pelo nome do estabelecimento; na dúvida use "Outros".
- Em "nome", traduza códigos de maquininha e abreviações para o nome que uma pessoa reconheceria.
  Exemplos: "IFD*IFOOD CLUB" → "iFood"; "UBER *TRIP HELP.UBER" → "Uber"; "PAYPAL *SPOTIFY" → "Spotify";
  "MP*MERCADOLIVRE" → "Mercado Livre"; "PAG*JOSEDASILVA" → "José da Silva"; "DROGASIL 1234" → "Drogasil".
  Não invente: se não reconhecer, apenas deixe a descrição legível (sem códigos, asteriscos e números soltos).`;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/** Envia o PDF para a IA e devolve os dados da fatura já normalizados. */
export async function extrairFatura(pdfBuffer) {
  const resposta = await ai.interactions.create({
    model: MODEL,
    input: [
      { type: 'text', text: PROMPT },
      {
        type: 'document',
        data: pdfBuffer.toString('base64'),
        mime_type: 'application/pdf',
      },
    ],
  });

  const dados = extrairJson(resposta.output_text || '');
  return {
    banco: dados.banco ?? null,
    vencimento: dados.vencimento ?? null,
    total_fatura: dados.total_fatura == null ? null : Number(dados.total_fatura),
    lancamentos: normalizar(dados.lancamentos),
  };
}

// A IA às vezes envolve o JSON em ```json ... ```; pegamos do primeiro { ao último }
function extrairJson(texto) {
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio === -1 || fim === -1) {
    throw new Error('A IA não devolveu um JSON.');
  }
  return JSON.parse(texto.slice(inicio, fim + 1));
}

// Garante tipos certos mesmo se a IA errar algo
function normalizar(lancamentos = []) {
  return lancamentos
    .map((l) => ({
      data: l.data ?? null,
      descricao: String(l.descricao ?? '').trim(),
      nome: String(l.nome ?? '').trim() || null,
      valor: Number(String(l.valor).replace(',', '.')) || 0,
      categoria: CATEGORIAS.includes(l.categoria) ? l.categoria : 'Outros',
      parcela: l.parcela || null,
    }))
    .filter((l) => l.descricao && l.valor !== 0);
}

export function mensagemErro(e) {
  const msg = String(e?.message || '');
  if (msg.includes('API_KEY') || msg.includes('API key') || e?.status === 401 || e?.status === 403) {
    return 'Chave da API inválida. Confira o GEMINI_API_KEY no arquivo .env.';
  }
  if (e?.status === 429) {
    return 'Limite gratuito atingido por agora. Espere um pouco e tente de novo.';
  }
  if (e?.status === 400) {
    return 'Não consegui ler esse PDF. Se ele tiver senha, remova a senha antes de enviar.';
  }
  if (e instanceof SyntaxError || msg.includes('JSON')) {
    return 'A IA respondeu num formato inesperado. Tente enviar de novo.';
  }
  return 'Erro ao processar a fatura.';
}
