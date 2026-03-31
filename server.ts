import express from 'express';
import { createServer as createViteServer } from 'vite';
import { db } from './server/firebase.js';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, orderBy, getDoc } from 'firebase/firestore';
import path from 'path';
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
    required: ["description", "items"],
  },
};

const handoffToHumanFunctionDeclaration: FunctionDeclaration = {
  name: "handoffToHuman",
  parameters: {
    type: Type.OBJECT,
    description: "Transfere o atendimento para um humano e desativa o bot para esta conversa. Use isso quando o cliente pedir explicitamente para falar com um atendente humano ou quando você não conseguir ajudar.",
    properties: {
      reason: {
        type: Type.STRING,
        description: "Motivo da transferência (ex: 'Cliente solicitou falar com humano')",
      }
    },
    required: ["reason"],
  },
};

async function createOrUpdateQuoteRequest(tenantId: string, convId: string, customerPhone: string, customerName: string, args: any, baseUrl: string, aiSettings: any) {
  let customerId = null;
  const customersRef = collection(db, `tenants/${tenantId}/customers`);
  const qCustomer = query(customersRef, where('phone', '==', customerPhone));
  const customerSnapshot = await getDocs(qCustomer);
  
  if (!customerSnapshot.empty) {
    customerId = customerSnapshot.docs[0].id;
  } else {
    const newCustomerRef = await addDoc(customersRef, {
      name: customerName || 'Cliente WhatsApp',
      phone: customerPhone,
      createdAt: serverTimestamp()
    });
    customerId = newCustomerRef.id;
  }

  // Find or create vehicle if make/model provided
  let vehicleId = null;
  if (args.vehicle_make && args.vehicle_model) {
    const vehiclesRef = collection(db, `tenants/${tenantId}/vehicles`);
    const qVehicle = query(vehiclesRef, where('customerId', '==', customerId), where('make', '==', args.vehicle_make), where('model', '==', args.vehicle_model));
    const vehicleSnapshot = await getDocs(qVehicle);
    
    if (!vehicleSnapshot.empty) {
      vehicleId = vehicleSnapshot.docs[0].id;
    } else {
      const newVehicleRef = await addDoc(vehiclesRef, {
        customerId,
        make: args.vehicle_make,
        model: args.vehicle_model,
        year: '',
        plate: '',
        createdAt: serverTimestamp()
      });
      vehicleId = newVehicleRef.id;
    }
  }

  const convRef = doc(db, 'whatsapp_conversations', convId);
  const convSnap = await getDoc(convRef);
  const convData = convSnap.data();

  let quoteReqId = convData?.activeQuoteRequestId;
  let shouldCreateNew = true;

    if (quoteReqId) {
    const qrRef = doc(db, `tenants/${tenantId}/quote_requests`, quoteReqId);
    const qrSnap = await getDoc(qrRef);
    if (qrSnap.exists() && qrSnap.data().status === 'aguardando_cliente') {
      const updateData: any = {
        description: args.description || 'Solicitação de orçamento',
      };
      if (args.items && args.items.length > 0) {
        updateData.items = args.items;
      }
      if (vehicleId) {
        updateData.vehicleId = vehicleId;
      } else if (qrSnap.data().vehicleId) {
        updateData.vehicleId = qrSnap.data().vehicleId;
      }
      await updateDoc(qrRef, updateData);
      shouldCreateNew = false;
    }
  }

  if (shouldCreateNew) {
    const quoteRequestsRef = collection(db, `tenants/${tenantId}/quote_requests`);
    const newQuoteReqData: any = {
      customerId,
      description: args.description || 'Solicitação de orçamento',
      status: 'aguardando_cliente', // Enviado para aprovação do escopo pelo cliente
      createdAt: serverTimestamp()
    };
    if (args.items && args.items.length > 0) {
      newQuoteReqData.items = args.items;
    }
    if (vehicleId) {
      newQuoteReqData.vehicleId = vehicleId;
    }
    const newQuoteReq = await addDoc(quoteRequestsRef, newQuoteReqData);
    quoteReqId = newQuoteReq.id;
    await updateDoc(convRef, { activeQuoteRequestId: quoteReqId });
  }

  const approvalLink = `${baseUrl}/approve-request/${tenantId}/${quoteReqId}`;
  if (aiSettings?.msgQuoteRequest) {
    return aiSettings.msgQuoteRequest
      .replace(/{nome_cliente}/g, customerName)
      .replace(/{link}/g, approvalLink);
  }
  return `Certo! Registrei a sua solicitação: "${args.description || 'Orçamento'}".\n\nPor favor, confirme se o escopo está correto clicando no link abaixo antes de enviarmos para a oficina:\n${approvalLink}`;
}

async function processBotReply(tenantId: string, convId: string, waNumberData: any, customerPhone: string, customerName: string, baseUrl: string) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY not configured.');
      return;
    }
    const ai = new GoogleGenAI({ apiKey });

    // Fetch catalog and AI settings
    const servicesRef = collection(db, `tenants/${tenantId}/services`);
    const partsRef = collection(db, `tenants/${tenantId}/parts`);
    const aiSettingsRef = doc(db, `tenants/${tenantId}/settings`, 'ai_assistant');
    
    const [servicesSnap, partsSnap, aiSettingsSnap] = await Promise.all([
      getDocs(servicesRef),
      getDocs(partsRef),
      getDoc(aiSettingsRef)
    ]);
    
    const catalog = {
      services: servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)),
      parts: partsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any))
    };
    
    const aiSettings = aiSettingsSnap.exists() ? aiSettingsSnap.data() : null;
    const customBehavior = aiSettings?.behavior ? `\nComportamento Customizado:\n${aiSettings.behavior}\n` : '';

    // Fetch recent messages
    const messagesRef = collection(db, `whatsapp_conversations/${convId}/messages`);
    const qMessages = query(messagesRef, orderBy('timestamp', 'asc'));
    const msgsSnap = await getDocs(qMessages);
    const messages = msgsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

    let prompt = `Você é um assistente virtual de uma oficina mecânica. 
Responda de forma educada, prestativa e proativa. 
Seu objetivo é entender o que o cliente busca, tirar dúvidas e, se possível, perguntar se ele deseja um orçamento. Se ele confirmar que deseja, gere o orçamento.

Informações da Oficina (CATÁLOGO RESTRITO):
- Serviços Disponíveis: ${catalog.services.length > 0 ? catalog.services.map(s => `ID: ${s.id}, Nome: ${s.name}`).join('; ') : 'Nenhum serviço cadastrado no momento.'}
- Peças em Estoque: ${catalog.parts.length > 0 ? catalog.parts.map(p => `ID: ${p.id}, Nome: ${p.name}`).join('; ') : 'Nenhuma peça cadastrada no momento.'}
${customBehavior}
Diretrizes CRÍTICAS:
1. É ESTRITAMENTE PROIBIDO mencionar, estimar ou fornecer qualquer valor monetário ou preço.
2. Você apenas coleta o escopo do problema. A precificação será feita pelos mecânicos posteriormente.
3. Se o cliente perguntar o preço, informe que a equipe técnica avaliará a solicitação e enviará os valores em breve.
4. Use a ferramenta generateQuoteRequest APENAS quando tiver a descrição do problema e os dados do veículo (se possível).
5. OBRIGATÓRIO: Ao gerar a solicitação, você DEVE incluir a lista de serviços e peças solicitados pelo cliente na propriedade 'items', usando os IDs e nomes exatos do catálogo acima. Se o cliente pedir algo que não está no catálogo, passe um array vazio [] em 'items' e coloque a informação apenas na descrição.
6. PROIBIDO: NUNCA escreva o JSON da solicitação no texto da sua resposta. O JSON deve ser enviado APENAS via chamada de função (tool call).
7. Seja amigável e conciso.

Histórico da conversa:\n`;

    const recentMsgs = messages.slice(-10);
    recentMsgs.forEach(msg => {
      prompt += `${msg.direction === 'inbound' ? 'Cliente' : 'Oficina'}: ${msg.content}\n`;
    });
    prompt += "\nOficina:";

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ functionDeclarations: [generateQuoteRequestFunctionDeclaration, handoffToHumanFunctionDeclaration] }],
        systemInstruction: "Você é o assistente virtual da oficina. Colete o problema e os dados do veículo. NUNCA forneça preços. Gere a solicitação usando a chamada de função (tool call) generateQuoteRequest. É ESTRITAMENTE PROIBIDO escrever o JSON da solicitação no texto da sua resposta para o cliente. É ESTRITAMENTE PROIBIDO gerar ou enviar links (URLs) no texto da sua resposta. Os links são gerados automaticamente pelo sistema após a chamada da função. Se o cliente pedir para falar com um humano, ou se estiver negociando/rejeitando um orçamento ou pré-orçamento existente, use handoffToHuman."
      }
    });

    let replyText = "";
    const functionCalls = response.functionCalls;
    
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      if (call.name === 'generateQuoteRequest') {
        const args = call.args as any || {};
        try {
          replyText = await createOrUpdateQuoteRequest(tenantId, convId, customerPhone, customerName, args, baseUrl, aiSettings);
        } catch (err) {
          console.error('Error generating quote request:', err);
          replyText = "Desculpe, ocorreu um erro ao gerar a sua solicitação. Por favor, tente novamente mais tarde.";
        }
      } else if (call.name === 'handoffToHuman') {
        try {
          // Disable bot for this conversation
          await updateDoc(doc(db, 'whatsapp_conversations', convId), {
            bot_active: false
          });
          replyText = "Certo, vou transferir você para um de nossos atendentes. Em breve alguém entrará em contato!";
        } catch (err) {
          console.error('Error handing off to human:', err);
          replyText = "Desculpe, ocorreu um erro ao transferir o atendimento.";
        }
      } else {
        console.error('Unknown function call:', call.name);
        replyText = "Desculpe, não consegui processar essa solicitação no momento.";
      }
    } else {
      try {
        replyText = response.text || "Desculpe, não entendi.";
      } catch (e) {
        replyText = "Desculpe, não entendi.";
      }
    }

    if (replyText) {
      const zapiUrl = `https://api.z-api.io/instances/${waNumberData.instanceId}/token/${waNumberData.token}/send-text`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (waNumberData.clientToken) {
        headers['Client-Token'] = waNumberData.clientToken;
      }

      const res = await fetch(zapiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: customerPhone,
          message: replyText
        })
      });

      if (res.ok) {
        const data = await res.json();
        const messagesRef = collection(db, `whatsapp_conversations/${convId}/messages`);
        await addDoc(messagesRef, {
          tenantId,
          wa_message_id: data.messageId,
          direction: 'outbound',
          type: 'text',
          content: replyText,
          status: 'sent',
          timestamp: serverTimestamp()
        });
        await updateDoc(doc(db, 'whatsapp_conversations', convId), {
          last_message_at: serverTimestamp()
        });
      } else {
        console.error('Failed to send bot reply via Z-API:', await res.text());
      }
    }

  } catch (error) {
    console.error('Error in processBotReply:', error);
    
    // Attempt to send a fallback message
    try {
      const zapiUrl = `https://api.z-api.io/instances/${waNumberData.instanceId}/token/${waNumberData.token}/send-text`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (waNumberData.clientToken) {
        headers['Client-Token'] = waNumberData.clientToken;
      }

      const fallbackText = `Desculpe, estou enfrentando instabilidades no momento. Erro: ${error instanceof Error ? error.message : String(error)}`;
      
      const res = await fetch(zapiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: customerPhone,
          message: fallbackText
        })
      });

      if (res.ok) {
        const data = await res.json();
        const messagesRef = collection(db, `whatsapp_conversations/${convId}/messages`);
        await addDoc(messagesRef, {
          tenantId,
          wa_message_id: data.messageId,
          direction: 'outbound',
          type: 'text',
          content: fallbackText,
          status: 'sent',
          timestamp: serverTimestamp()
        });
      }
    } catch (fallbackErr) {
      console.error('Failed to send fallback message:', fallbackErr);
    }
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Z-API Webhook for incoming messages
  app.post('/webhooks/zapi', async (req, res) => {
    try {
      const data = req.body;
      console.log('Z-API Webhook received event type:', data.type || 'unknown');
      
      // Z-API payload structure
      const instanceId = data.instanceId;
      
      if (!instanceId) {
        console.log('Webhook error: Missing instanceId');
        return res.status(400).send('Missing instanceId');
      }

      // 1. Ignore status updates (delivery, read receipts) if they come to this webhook
      if (data.status && !data.messageId && !data.id) {
        console.log('Ignoring status update event');
        return res.status(200).send('OK');
      }

      // 2. Ignore events that are not messages (like connection status, presence, etc)
      if (!data.phone || (!data.messageId && !data.id)) {
        console.log('Ignoring non-message event from Z-API');
        return res.status(200).send('OK'); // Always return 200 so Z-API doesn't retry
      }

      // 3. Ignore group messages (usually we only want 1-on-1 customer service)
      if (data.isGroup || data.phone.includes('-')) {
        console.log('Ignoring group message');
        return res.status(200).send('OK');
      }

      const phone = data.phone;
      const messageId = data.messageId || data.id;
      const fromMe = data.fromMe || false;
      const type = data.type?.toLowerCase() || 'other';
      
      // Extract text robustly based on message type
      let text = '';
      if (data.text && data.text.message) {
        text = data.text.message;
      } else if (typeof data.message === 'string') {
        text = data.message;
      } else if (type === 'audio') {
        text = '🎵 Áudio recebido';
      } else if (type === 'image') {
        text = '📷 Imagem recebida';
      } else if (type === 'document') {
        text = '📄 Documento recebido';
      } else if (type === 'video') {
        text = '🎥 Vídeo recebido';
      } else if (type === 'sticker') {
        text = '🎫 Figurinha recebida';
      } else if (type === 'location') {
        text = '📍 Localização recebida';
      } else if (type === 'contacts') {
        text = '👤 Contato recebido';
      } else {
        text = `[Mensagem do tipo: ${type}]`;
      }
      
      // Find the whatsapp_number by instanceId
      const numbersRef = collection(db, 'whatsapp_numbers');
      const qNumber = query(numbersRef, where('instanceId', '==', instanceId));
      const numberSnap = await getDocs(qNumber);
      
      if (numberSnap.empty) {
        console.log(`Webhook error: Instance ${instanceId} not found in database`);
        return res.status(404).send('Instance not found');
      }
      
      const waNumber = numberSnap.docs[0];
      const tenantId = waNumber.data().tenantId;
      
      // Find or create conversation
      const convsRef = collection(db, 'whatsapp_conversations');
      const qConv = query(convsRef, 
        where('whatsapp_number_id', '==', waNumber.id),
        where('customer_phone', '==', phone)
      );
      const convSnap = await getDocs(qConv);
      
      let convId;
      let botActive = true;
      let customerName = data.senderName || data.chatName || phone;

      if (convSnap.empty) {
        const newConv = await addDoc(convsRef, {
          tenantId,
          whatsapp_number_id: waNumber.id,
          customer_phone: phone,
          customer_name: customerName,
          last_message_at: serverTimestamp(),
          bot_active: true,
          status: 'open'
        });
        convId = newConv.id;
        console.log(`Created new conversation: ${convId} for phone: ${phone}`);
      } else {
        convId = convSnap.docs[0].id;
        botActive = convSnap.docs[0].data().bot_active !== false;
        await updateDoc(doc(db, 'whatsapp_conversations', convId), {
          last_message_at: serverTimestamp(),
          customer_name: customerName
        });
        console.log(`Updated conversation: ${convId} for phone: ${phone}`);
      }
      
      // Check if message already exists to prevent duplicates (Z-API sometimes retries)
      const messagesRef = collection(db, `whatsapp_conversations/${convId}/messages`);
      const qMsg = query(messagesRef, where('wa_message_id', '==', messageId));
      const msgSnap = await getDocs(qMsg);
      
      if (!msgSnap.empty) {
        console.log(`Message ${messageId} already exists, ignoring duplicate.`);
        return res.status(200).send('OK');
      }

      // Save message
      await addDoc(messagesRef, {
        tenantId,
        wa_message_id: messageId,
        direction: fromMe ? 'outbound' : 'inbound',
        type: type === 'text' ? 'text' : 'other',
        content: text,
        status: fromMe ? 'sent' : 'received',
        timestamp: serverTimestamp()
      });
      console.log(`Message saved successfully to conv ${convId}`);

      res.status(200).send('OK');

      // Check global AI settings
      const aiSettingsRef = doc(db, `tenants/${tenantId}/settings`, 'ai_assistant');
      const aiSettingsSnap = await getDoc(aiSettingsRef);
      const aiSettings = aiSettingsSnap.exists() ? aiSettingsSnap.data() : null;
      
      const globalBotActive = aiSettings?.isBotActive !== false;

      // Trigger bot reply in background if active and message is inbound
      if (!fromMe && botActive && globalBotActive) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        processBotReply(tenantId, convId, waNumber.data(), phone, customerName, baseUrl);
      }
    } catch (error) {
      console.error('Z-API Webhook Error:', error);
      // Always return 200 to Z-API even on our internal errors so it doesn't keep retrying and blocking the queue
      res.status(200).send('Internal Server Error Handled');
    }
  });

  // API to send WhatsApp message via Z-API
  app.post('/api/whatsapp/messages', async (req, res) => {
    try {
      let { to, type, text, mediaUrl, mediaType, fileName, instanceId, token, clientToken: bodyClientToken, tenantId, phone, message } = req.body;
      
      // Handle alternative payload format (from Quotes/WorkOrders)
      if (phone && !to) to = phone;
      if (message && !text) text = message;

      let clientToken = bodyClientToken || '';

      // If instanceId or token is missing, try to look it up by tenantId
      if ((!instanceId || !token) && tenantId) {
        const numbersRef = collection(db, 'whatsapp_numbers');
        const qNumber = query(numbersRef, where('tenantId', '==', tenantId));
        const numberSnap = await getDocs(qNumber);
        
        if (!numberSnap.empty) {
          const numberData = numberSnap.docs[0].data();
          instanceId = numberData.instanceId;
          token = numberData.token;
          if (!clientToken) clientToken = numberData.clientToken || '';
        }
      }

      if (!to || !instanceId || !token) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // If not provided in body or tenant lookup, try to fetch from database as fallback
      if (!clientToken) {
        const numbersRef = collection(db, 'whatsapp_numbers');
        const qNumber = query(numbersRef, where('instanceId', '==', instanceId));
        const numberSnap = await getDocs(qNumber);
        
        if (!numberSnap.empty && numberSnap.docs[0].data().clientToken) {
          clientToken = numberSnap.docs[0].data().clientToken;
        }
      }

      let endpoint = 'send-text';
      let requestBody: any = { phone: to };

      if (mediaUrl) {
        if (mediaType === 'image') {
          endpoint = 'send-image';
          requestBody.image = mediaUrl;
          if (text) requestBody.caption = text;
        } else if (mediaType === 'video') {
          endpoint = 'send-video';
          requestBody.video = mediaUrl;
          if (text) requestBody.caption = text;
        } else if (mediaType === 'audio') {
          endpoint = 'send-audio';
          requestBody.audio = mediaUrl;
        } else if (mediaType === 'document') {
          endpoint = 'send-document';
          requestBody.document = mediaUrl;
          requestBody.fileName = fileName || 'documento';
          if (text) requestBody.caption = text;
        }
      } else {
        requestBody.message = text;
      }

      const zapiUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/${endpoint}`;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      if (clientToken) {
        headers['Client-Token'] = clientToken;
      }

      const response = await fetch(zapiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Z-API Send Error:', errorData);
        return res.status(response.status).json({ error: 'Failed to send message via Z-API', details: errorData });
      }

      const data = await response.json();
      res.json({ success: true, messageId: data.messageId });
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // API to manually generate quote via bot
  app.post('/api/whatsapp/manual-quote', async (req, res) => {
    try {
      const { tenantId, convId, customerPhone, customerName, waNumberData } = req.body;
      
      if (!tenantId || !convId || !customerPhone || !waNumberData) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // We can just call processBotReply but we might want to force it to generate a quote.
      // To keep it simple, we will just call processBotReply and let the AI decide, 
      // or we can write a specific prompt for manual quote generation.
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });
      }
      const ai = new GoogleGenAI({ apiKey });

      const servicesRef = collection(db, `tenants/${tenantId}/services`);
      const partsRef = collection(db, `tenants/${tenantId}/parts`);
      const aiSettingsRef = doc(db, `tenants/${tenantId}/settings`, 'ai_assistant');
      
      const [servicesSnap, partsSnap, aiSettingsSnap] = await Promise.all([
        getDocs(servicesRef),
        getDocs(partsRef),
        getDoc(aiSettingsRef)
      ]);
      
      const catalog = {
        services: servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)),
        parts: partsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any))
      };
      
      const aiSettings = aiSettingsSnap.exists() ? aiSettingsSnap.data() : null;
      const customBehavior = aiSettings?.behavior ? `\nComportamento Customizado:\n${aiSettings.behavior}\n` : '';

      const messagesRef = collection(db, `whatsapp_conversations/${convId}/messages`);
      const qMessages = query(messagesRef, orderBy('timestamp', 'asc'));
      const msgsSnap = await getDocs(qMessages);
      const messages = msgsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      let prompt = `Analise a conversa abaixo e extraia a descrição do problema relatado pelo cliente, bem como a marca e modelo do veículo.
      
Seu objetivo é gerar uma SOLICITAÇÃO DE ORÇAMENTO (Quote Request).
NUNCA forneça preços, estimativas de valor ou prazos.
Se o cliente perguntar o preço, diga educadamente que a equipe técnica irá avaliar a solicitação e enviará os valores em breve.
Pergunte ao cliente qual o problema do veículo e qual o modelo/marca.
Quando tiver essas informações e o cliente concordar em solicitar um orçamento, use a ferramenta generateQuoteRequest.

Informações da Oficina (CATÁLOGO RESTRITO):
- Serviços Disponíveis: ${catalog.services.length > 0 ? catalog.services.map(s => `ID: ${s.id}, Nome: ${s.name}`).join('; ') : 'Nenhum serviço cadastrado no momento.'}
- Peças em Estoque: ${catalog.parts.length > 0 ? catalog.parts.map(p => `ID: ${p.id}, Nome: ${p.name}`).join('; ') : 'Nenhuma peça cadastrada no momento.'}

Diretriz CRÍTICA: OBRIGATÓRIO: Ao gerar a solicitação, você DEVE incluir a lista de serviços e peças solicitados pelo cliente na propriedade 'items', usando os IDs e nomes exatos do catálogo acima. Se o cliente pedir algo que não está no catálogo, passe um array vazio [] em 'items' e coloque a informação apenas na descrição.
PROIBIDO: NUNCA escreva o JSON da solicitação no texto da sua resposta. O JSON deve ser enviado APENAS via chamada de função (tool call).

${customBehavior}

Conversa:\n`;
      const recentMsgs = messages.slice(-20);
      recentMsgs.forEach(msg => {
        prompt += `${msg.direction === 'inbound' ? 'Cliente' : 'Oficina'}: ${msg.content}\n`;
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          tools: [{ functionDeclarations: [generateQuoteRequestFunctionDeclaration, handoffToHumanFunctionDeclaration] }],
          systemInstruction: "Você é um assistente de oficina. Seu objetivo é coletar o problema do veículo e gerar uma solicitação de orçamento usando a ferramenta generateQuoteRequest. NUNCA forneça preços. É ESTRITAMENTE PROIBIDO escrever o JSON da solicitação no texto da sua resposta para o cliente. É ESTRITAMENTE PROIBIDO gerar ou enviar links (URLs) no texto da sua resposta. Os links são gerados automaticamente pelo sistema após a chamada da função. Se o cliente pedir para falar com um humano, ou se estiver negociando/rejeitando um orçamento ou pré-orçamento existente, use handoffToHuman."
        }
      });

      let replyText = "";
      const functionCalls = response.functionCalls;
      
      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        if (call.name === 'generateQuoteRequest') {
          const args = call.args as any;
          try {
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            replyText = await createOrUpdateQuoteRequest(tenantId, convId, customerPhone, customerName, args, baseUrl, aiSettings);
          } catch (err) {
            console.error('Error generating quote request:', err);
            replyText = "Desculpe, ocorreu um erro ao gerar a sua solicitação. Por favor, tente novamente mais tarde.";
          }
        } else if (call.name === 'handoffToHuman') {
          try {
            await updateDoc(doc(db, 'whatsapp_conversations', convId), {
              bot_active: false
            });
            replyText = "Certo, vou transferir você para um de nossos atendentes. Em breve alguém entrará em contato!";
          } catch (err) {
            console.error('Error handing off to human:', err);
            replyText = "Desculpe, ocorreu um erro ao transferir o atendimento.";
          }
        }
      } else {
        try {
          replyText = response.text || "Não entendi, pode repetir?";
        } catch (e) {
          replyText = "Não entendi, pode repetir?";
        }
      }

      if (replyText) {
        const zapiUrl = `https://api.z-api.io/instances/${waNumberData.instanceId}/token/${waNumberData.token}/send-text`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (waNumberData.clientToken) {
          headers['Client-Token'] = waNumberData.clientToken;
        }

        const resZapi = await fetch(zapiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: customerPhone,
            message: replyText
          })
        });

        if (resZapi.ok) {
          const data = await resZapi.json();
          const messagesRef = collection(db, `whatsapp_conversations/${convId}/messages`);
          await addDoc(messagesRef, {
            tenantId,
            wa_message_id: data.messageId,
            direction: 'outbound',
            type: 'text',
            content: replyText,
            status: 'sent',
            timestamp: serverTimestamp()
          });
          await updateDoc(doc(db, 'whatsapp_conversations', convId), {
            last_message_at: serverTimestamp()
          });
        }
      }

      res.json({ success: true, replyText });
    } catch (error) {
      console.error('Error in manual quote:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // API to handle quote request action
  app.post('/api/quote-request/:tenantId/:requestId/action', async (req, res) => {
    try {
      const { tenantId, requestId } = req.params;
      const { status } = req.body; // 'pendente' or 'cancelado_pelo_cliente'
      
      const qrRef = doc(db, `tenants/${tenantId}/quote_requests`, requestId);
      const qrSnap = await getDoc(qrRef);
      if (!qrSnap.exists()) {
        return res.status(404).json({ error: 'Not found' });
      }
      
      await updateDoc(qrRef, { status });

      // Find the conversation to send a message back
      const convsRef = collection(db, 'whatsapp_conversations');
      const qConv = query(convsRef, where('activeQuoteRequestId', '==', requestId));
      const convSnap = await getDocs(qConv);
      
      if (!convSnap.empty) {
        const convDoc = convSnap.docs[0];
        const convData = convDoc.data();
        const convId = convDoc.id;
        
        // Find the whatsapp number data
        const waNumberRef = doc(db, 'whatsapp_numbers', convData.whatsapp_number_id);
        const waNumberSnap = await getDoc(waNumberRef);
        
        if (waNumberSnap.exists()) {
          const waNumberData = waNumberSnap.data();
          let replyText = '';
          
          if (status === 'pendente') {
            replyText = "Ótimo! Sua solicitação foi confirmada e enviada para nossa equipe técnica. Em breve retornaremos com o pré-orçamento.";
          } else if (status === 'cancelado_pelo_cliente') {
            replyText = "Entendi. A solicitação foi cancelada. O que você gostaria de alterar ou adicionar?";
          }
          
          if (replyText) {
            const zapiUrl = `https://api.z-api.io/instances/${waNumberData.instanceId}/token/${waNumberData.token}/send-text`;
            const headers: Record<string, string> = {
              'Content-Type': 'application/json'
            };
            if (waNumberData.clientToken) {
              headers['Client-Token'] = waNumberData.clientToken;
            }

            const resZapi = await fetch(zapiUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                phone: convData.customer_phone,
                message: replyText
              })
            });

            if (resZapi.ok) {
              const data = await resZapi.json();
              const messagesRef = collection(db, `whatsapp_conversations/${convId}/messages`);
              await addDoc(messagesRef, {
                tenantId,
                wa_message_id: data.messageId,
                direction: 'outbound',
                type: 'text',
                content: replyText,
                status: 'sent',
                timestamp: serverTimestamp()
              });
              await updateDoc(doc(db, 'whatsapp_conversations', convId), {
                last_message_at: serverTimestamp()
              });
            }
          }
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error handling quote request action:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // API to handle pre-quote action
  app.post('/api/pre-quote/:tenantId/:preQuoteId/action', async (req, res) => {
    try {
      const { tenantId, preQuoteId } = req.params;
      const { status, appointmentDate, appointmentTime } = req.body; // 'aprovado' or 'reprovado'
      
      const pqRef = doc(db, `tenants/${tenantId}/pre_quotes`, preQuoteId);
      const pqSnap = await getDoc(pqRef);
      if (!pqSnap.exists()) {
        return res.status(404).json({ error: 'Not found' });
      }
      
      const preQuote = pqSnap.data();
      await updateDoc(pqRef, { status });

      if (status === 'aprovado') {
        // Create a Quote (Orçamento Oficial) in rascunho status for physical diagnosis
        const quotesRef = collection(db, `tenants/${tenantId}/quotes`);
        await addDoc(quotesRef, {
          preQuoteId: preQuoteId,
          customerId: preQuote.customerId,
          vehicleId: preQuote.vehicleId,
          items: preQuote.items || [],
          totalAmount: preQuote.totalAmount || 0,
          status: 'rascunho', // Needs diagnosis and final approval
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Create appointment if date and time are provided
        if (appointmentDate && appointmentTime) {
          const appsRef = collection(db, `tenants/${tenantId}/appointments`);
          await addDoc(appsRef, {
            title: `Avaliação Presencial - Pré-orçamento Aprovado`,
            date: appointmentDate,
            time: appointmentTime,
            customerId: preQuote.customerId || '',
            vehicleId: preQuote.vehicleId || '',
            preQuoteId: preQuoteId,
            status: 'scheduled',
            notes: `Agendado automaticamente após aprovação do pré-orçamento.\nDescrição: ${preQuote.description || ''}`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }

      // Find the conversation to send a message back
      const convsRef = collection(db, 'whatsapp_conversations');
      const qConv = query(convsRef, where('activePreQuoteId', '==', preQuoteId));
      const convSnap = await getDocs(qConv);
      
      if (!convSnap.empty) {
        const convDoc = convSnap.docs[0];
        const convData = convDoc.data();
        const convId = convDoc.id;
        
        // Find the whatsapp number data
        const waNumberRef = doc(db, 'whatsapp_numbers', convData.whatsapp_number_id);
        const waNumberSnap = await getDoc(waNumberRef);
        
        if (waNumberSnap.exists()) {
          const waNumberData = waNumberSnap.data();
          let replyText = '';
          
          if (status === 'aprovado') {
            replyText = "Obrigado! Seu pré-orçamento foi aprovado e homologado oficialmente. Nossa equipe entrará em contato para iniciar o serviço.";
          } else if (status === 'reprovado') {
            replyText = "Entendido. O pré-orçamento foi reprovado. O que você gostaria de ajustar nos valores ou no escopo?";
          }
          
          if (replyText) {
            const zapiUrl = `https://api.z-api.io/instances/${waNumberData.instanceId}/token/${waNumberData.token}/send-text`;
            const headers: Record<string, string> = {
              'Content-Type': 'application/json'
            };
            if (waNumberData.clientToken) {
              headers['Client-Token'] = waNumberData.clientToken;
            }

            const resZapi = await fetch(zapiUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                phone: convData.customer_phone,
                message: replyText
              })
            });

            if (resZapi.ok) {
              const data = await resZapi.json();
              const messagesRef = collection(db, `whatsapp_conversations/${convId}/messages`);
              await addDoc(messagesRef, {
                tenantId,
                wa_message_id: data.messageId,
                direction: 'outbound',
                type: 'text',
                content: replyText,
                status: 'sent',
                timestamp: serverTimestamp()
              });
              await updateDoc(doc(db, 'whatsapp_conversations', convId), {
                last_message_at: serverTimestamp()
              });
            }
          }
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error handling pre-quote action:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // API to handle quote action
  app.post('/api/quote/:tenantId/:quoteId/action', async (req, res) => {
    try {
      const { tenantId, quoteId } = req.params;
      const { status } = req.body; // 'aceito' or 'recusado'
      
      const qRef = doc(db, `tenants/${tenantId}/quotes`, quoteId);
      const qSnap = await getDoc(qRef);
      if (!qSnap.exists()) {
        return res.status(404).json({ error: 'Not found' });
      }
      
      const quote = qSnap.data();
      await updateDoc(qRef, { status });

      // Find the conversation to send a message back
      const customerRef = doc(db, `tenants/${tenantId}/customers`, quote.customerId);
      const customerSnap = await getDoc(customerRef);
      if (customerSnap.exists()) {
        const customerPhone = customerSnap.data().phone;
        if (customerPhone) {
          const phone = customerPhone.replace(/\D/g, '');
          const convsRef = collection(db, 'whatsapp_conversations');
          const qConv = query(convsRef, where('customer_phone', '==', phone));
          const convSnap = await getDocs(qConv);
          
          if (!convSnap.empty) {
            const convDoc = convSnap.docs[0];
            const convData = convDoc.data();
            const convId = convDoc.id;
            
            const waNumberRef = doc(db, 'whatsapp_numbers', convData.whatsapp_number_id);
            const waNumberSnap = await getDoc(waNumberRef);
            
            if (waNumberSnap.exists()) {
              const waNumberData = waNumberSnap.data();
              let replyText = '';
              
              if (status === 'aceito') {
                replyText = "Obrigado! Seu orçamento foi aceito. Nossa equipe já gerou a ordem de serviço e entrará em contato para os próximos passos.";
              } else if (status === 'recusado') {
                replyText = "Entendido. O orçamento foi recusado. Se mudar de ideia ou quiser ajustar algo, estamos à disposição.";
              }
              
              if (replyText) {
                const zapiUrl = `https://api.z-api.io/instances/${waNumberData.instanceId}/token/${waNumberData.token}/send-text`;
                const headers: Record<string, string> = {
                  'Content-Type': 'application/json'
                };
                if (waNumberData.clientToken) {
                  headers['Client-Token'] = waNumberData.clientToken;
                }

                const resZapi = await fetch(zapiUrl, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    phone: convData.customer_phone,
                    message: replyText
                  })
                });

                if (resZapi.ok) {
                  const data = await resZapi.json();
                  const messagesRef = collection(db, `whatsapp_conversations/${convId}/messages`);
                  await addDoc(messagesRef, {
                    tenantId,
                    wa_message_id: data.messageId,
                    direction: 'outbound',
                    type: 'text',
                    content: replyText,
                    status: 'sent',
                    timestamp: serverTimestamp()
                  });
                  await updateDoc(doc(db, 'whatsapp_conversations', convId), {
                    last_message_at: serverTimestamp()
                  });
                }
              }
            }
          }
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error handling quote action:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.get('/api/test-ai', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).send('GEMINI_API_KEY not configured.');
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

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          tools: [{ functionDeclarations: [generateQuoteRequestFunctionDeclaration, handoffToHumanFunctionDeclaration] }],
          systemInstruction: "Você é o assistente virtual da oficina. Colete o problema e os dados do veículo. NUNCA forneça preços. Gere a solicitação usando a chamada de função (tool call) generateQuoteRequest. É ESTRITAMENTE PROIBIDO escrever o JSON da solicitação no texto da sua resposta para o cliente. É ESTRITAMENTE PROIBIDO gerar ou enviar links (URLs) no texto da sua resposta. Os links são gerados automaticamente pelo sistema após a chamada da função. Se o cliente pedir para falar com um humano, ou se estiver negociando/rejeitando um orçamento ou pré-orçamento existente, use handoffToHuman."
        }
      });
      
      let text = "";
      try {
        text = response.text;
      } catch (e) {
        // ignore
      }
      
      res.json({
        text: text,
        functionCalls: response.functionCalls
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
