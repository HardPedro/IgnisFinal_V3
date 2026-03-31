import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';

const generateQuoteRequestFunctionDeclaration: FunctionDeclaration = {
  name: "generateQuoteRequest",
  parameters: {
    type: Type.OBJECT,
    description: "Gera uma solicitação de orçamento (sem preços) baseada no problema relatado pelo cliente, utilizando os serviços e peças do catálogo da oficina.",
    properties: {
      description: {
        type: Type.STRING,
        description: "Descrição detalhada do problema ou serviço solicitado pelo cliente.",
      },
      vehicle_make: {
        type: Type.STRING,
        description: "Marca do veículo do cliente (ex: 'Volkswagen', 'Fiat')",
      },
      vehicle_model: {
        type: Type.STRING,
        description: "Modelo do veículo do cliente (ex: 'Gol', 'Uno')",
      },
      items: {
        type: Type.ARRAY,
        description: "Lista de serviços e peças do catálogo que correspondem à solicitação do cliente. Você deve extrair os IDs e nomes exatos do catálogo fornecido.",
        items: {
          type: Type.OBJECT,
          properties: {
            refId: {
              type: Type.STRING,
              description: "O ID do serviço ou peça do catálogo."
            },
            type: {
              type: Type.STRING,
              description: "O tipo do item, deve ser 'service' ou 'part'."
            },
            name: {
              type: Type.STRING,
              description: "O nome do serviço ou peça."
            },
            qty: {
              type: Type.NUMBER,
              description: "A quantidade solicitada (geralmente 1 para serviços)."
            }
          }
        }
      }
    },
    required: ["description"],
  },
};

const handoffToHumanFunctionDeclaration: FunctionDeclaration = {
  name: "handoffToHuman",
  parameters: {
    type: Type.OBJECT,
    description: "Transfere o atendimento para um humano.",
    properties: {
      reason: {
        type: Type.STRING,
        description: "O motivo da transferência."
      }
    },
    required: ["reason"]
  }
};

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured.');
    return;
  }
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Você é um assistente virtual de uma oficina mecânica. 
Responda de forma educada, prestativa e proativa. 
Seu objetivo é entender o que o cliente busca, tirar dúvidas e, se possível, perguntar se ele deseja um orçamento. Se ele confirmar que deseja, gere o orçamento.

Informações da Oficina (CATÁLOGO RESTRITO):
- Serviços Disponíveis: ID: 1, Nome: Troca de Óleo; ID: 2, Nome: Alinhamento
- Peças em Estoque: ID: 3, Nome: Filtro de Óleo; ID: 4, Nome: Pastilha de Freio

Diretrizes CRÍTICAS:
1. É ESTRITAMENTE PROIBIDO mencionar, estimar ou fornecer qualquer valor monetário ou preço.
2. Você apenas coleta o escopo do problema. A precificação será feita pelos mecânicos posteriormente.
3. Se o cliente perguntar o preço, informe que a equipe técnica avaliará a solicitação e enviará os valores em breve.
4. Use a ferramenta generateQuoteRequest APENAS quando tiver a descrição do problema e os dados do veículo (se possível).
5. OBRIGATÓRIO: Ao gerar a solicitação, você DEVE incluir a lista de serviços e peças solicitados pelo cliente na propriedade 'items', usando os IDs e nomes exatos do catálogo acima. Se o cliente pedir algo que não está no catálogo, passe um array vazio [] em 'items' e coloque a informação apenas na descrição.
6. PROIBIDO: NUNCA escreva o JSON da solicitação no texto da sua resposta. O JSON deve ser enviado APENAS via chamada de função (tool call).
7. Seja amigável e conciso.

Histórico da conversa:
Cliente: Olá, preciso trocar o óleo do meu carro.
Oficina: Olá! Tudo bem? Qual é a marca e modelo do seu veículo?
Cliente: É um Gol.
Oficina: Perfeito! Deseja que eu gere uma solicitação de orçamento para a troca de óleo do seu Gol?
Cliente: Sim, por favor.

Oficina:`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ functionDeclarations: [generateQuoteRequestFunctionDeclaration, handoffToHumanFunctionDeclaration] }],
        systemInstruction: "Você é o assistente virtual da oficina. Colete o problema e os dados do veículo. NUNCA forneça preços. Gere a solicitação usando a chamada de função (tool call) generateQuoteRequest. É ESTRITAMENTE PROIBIDO escrever o JSON da solicitação no texto da sua resposta para o cliente. Se o cliente pedir para falar com um humano, ou se estiver negociando/rejeitando um orçamento ou pré-orçamento existente, use handoffToHuman."
      }
    });
    console.log('Success:', response.text);
    if (response.functionCalls) {
      console.log('Function calls:', JSON.stringify(response.functionCalls, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
