# Destrincha

**Sua fatura, destrinchada.** Envie a fatura do cartão de crédito em PDF e a IA organiza todos os lançamentos: traduz códigos estranhos para nomes que você reconhece, separa por categoria e confere se a soma bate com o total da fatura.

Projeto de estudo e portfólio.

## Funcionalidades

- **Leitura da fatura com IA**: envia o PDF e recebe banco, vencimento, total e todos os lançamentos.
- **Nomes legíveis**: `IFD*IFOOD CLUB` vira **iFood**, `PAYPAL *SPOTIFY` vira **Spotify**. A descrição original continua visível para conferência.
- **Categorias automáticas**: Mercado, Transporte, Assinaturas, Saúde e outras, com gráfico de gastos por categoria.
- **Correções que o app aprende**: renomeie um lançamento ou troque a categoria e a mudança vale para todos os lançamentos do mesmo estabelecimento, inclusive nas próximas faturas.
- **Histórico**: as faturas ficam salvas num banco SQLite local.
- **Conferência**: compara a soma dos lançamentos com o total impresso na fatura.

## Stack

- **Backend**: Node.js, Express, SQLite (módulo nativo `node:sqlite`)
- **IA**: Google Gemini (`@google/genai`)
- **Frontend**: HTML, CSS e JavaScript puro, com tema claro e escuro automático

## Como rodar

1. Instale o **Node.js 22.13 ou superior** (confira com `node -v`).
2. Crie uma chave gratuita em https://aistudio.google.com/apikey (não pede cartão).
3. Na pasta do projeto:
   ```bash
   npm install
   cp .env.example .env      # no Windows: copy .env.example .env
   ```
4. Coloque a chave no `.env` em `GEMINI_API_KEY`.
5. Rode `npm start` e abra http://localhost:3000.

## Estrutura

```
server.js        rotas da API (Express)
ia.js            prompt e extração da fatura com o Gemini
db.js            banco SQLite: faturas, lançamentos e regras aprendidas
public/          interface web
data/            arquivo do banco (criado automaticamente, fora do Git)
```

## API

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/fatura` | Envia o PDF (campo `fatura`), extrai e salva |
| `GET` | `/api/faturas` | Lista as faturas salvas com totais |
| `GET` | `/api/faturas/:id` | Detalhes de uma fatura com os lançamentos |
| `DELETE` | `/api/faturas/:id` | Exclui uma fatura |
| `PATCH` | `/api/lancamentos/:id` | Corrige `nome` e/ou `categoria` e cria uma regra para o estabelecimento |
| `GET` | `/api/categorias` | Lista as categorias disponíveis |

## Como o app "aprende"

Cada lançamento recebe uma **chave** gerada a partir da descrição original, ignorando números, acentos e símbolos (`UBER *TRIP 8812` e `Uber Trip 1234` viram `uber trip`). Quando você corrige o nome ou a categoria, o app salva uma regra para essa chave e aplica a todos os lançamentos iguais. Nas próximas faturas, as regras têm prioridade sobre a sugestão da IA.

## Observações

- **Faturas com senha**: abra o PDF no navegador, digite a senha e use Ctrl+P → "Salvar como PDF" para gerar uma cópia sem senha.
- **Plano gratuito do Gemini**: tem limite diário de requisições, mais que suficiente para uso pessoal.
- **Privacidade**: no plano gratuito, o Google pode usar o conteúdo enviado para melhorar os modelos. Para demonstrações, use uma fatura fictícia.

## Próximos passos

- Histórico mês a mês com gasto por categoria ao longo do tempo
- Detecção de assinaturas recorrentes
- Login, deploy público e versão mobile
