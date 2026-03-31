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
          },
          required: ["refId", "type", "name", "qty"]
        }
      }
    },
    required: ["description", "items"],
  },
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "O cliente quer trocar o óleo do Gol.",
      config: {
        tools: [{ functionDeclarations: [generateQuoteRequestFunctionDeclaration] }],
      }
    });
    console.log("Success:", response.text);
  } catch (e) {
    console.error("Error:", e);
  }
}

run();
