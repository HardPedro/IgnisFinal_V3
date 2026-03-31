import React, { useState, useEffect, useRef } from 'react';
import { Bot, Save, MessageSquare, Send, Sparkles, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { GoogleGenAI } from '@google/genai';

export function IntelligentAssistant() {
  const { userData } = useAuth();
  const [behavior, setBehavior] = useState('');
  const [templateInput, setTemplateInput] = useState('');
  const [msgQuoteRequest, setMsgQuoteRequest] = useState('Sua solicitação foi registrada, por favor confirme no link abaixo: {link}');
  const [msgPreQuote, setMsgPreQuote] = useState('Olá {nome_cliente}! Seu pré-orçamento está pronto. Acesse o link para aprovar ou recusar: {link}');
  const [msgQuote, setMsgQuote] = useState('Olá {nome_cliente}! Seu orçamento final está pronto. Acesse o link para aprovar ou recusar: {link}');
  const [isBotActive, setIsBotActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'model', text: string}[]>([
    { role: 'model', text: 'Olá! Sou seu assistente para criação de templates. Me diga como você quer que os orçamentos sejam apresentados aos seus clientes. Por exemplo: "Quero um template formal com saudação, lista de serviços, peças e o total no final."' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!userData?.tenantId) return;
      try {
        const docRef = doc(db, `tenants/${userData.tenantId}/settings`, 'ai_assistant');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBehavior(data.behavior || '');
          setTemplateInput(data.template || '');
          if (data.msgQuoteRequest) setMsgQuoteRequest(data.msgQuoteRequest);
          if (data.msgPreQuote) setMsgPreQuote(data.msgPreQuote);
          if (data.msgQuote) setMsgQuote(data.msgQuote);
          setIsBotActive(data.isBotActive !== false);
        }
      } catch (error) {
        console.error('Error fetching AI settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [userData]);

  const handleSaveSettings = async () => {
    if (!userData?.tenantId) return;
    setIsSaving(true);
    try {
      const docRef = doc(db, `tenants/${userData.tenantId}/settings`, 'ai_assistant');
      await setDoc(docRef, {
        behavior,
        template: templateInput,
        msgQuoteRequest,
        msgPreQuote,
        msgQuote,
        isBotActive,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Error saving AI settings:', error);
      alert('Erro ao salvar as configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsChatting(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('API Key do Gemini não configurada.');
      }
      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = `Você é um especialista em criar templates de orçamento para oficinas mecânicas. 
O usuário vai pedir um estilo de template. Você deve gerar o template usando as seguintes variáveis disponíveis:
{nome_cliente}, {veiculo}, {servicos}, {pecas}, {total}.
Sempre retorne o template sugerido dentro de um bloco de código markdown ( \`\`\` ) para que o sistema possa extraí-lo facilmente.
Seja prestativo e dê dicas de como melhorar a comunicação com o cliente.`;

      const contents = chatMessages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));
      contents.push({ role: 'user', parts: [{ text: userMessage }] });

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contents as any,
        config: {
          systemInstruction
        }
      });

      let responseText = 'Desculpe, não consegui gerar uma resposta.';
      try {
        responseText = response.text || responseText;
      } catch (e) {
        // ignore
      }
      setChatMessages(prev => [...prev, { role: 'model', text: responseText }]);
      
      // Try to extract template from code block
      const templateMatch = responseText.match(/```(?:text|html)?\n([\s\S]*?)```/);
      if (templateMatch && templateMatch[1]) {
        setTemplateInput(templateMatch[1].trim());
      }

    } catch (error) {
      console.error("Error generating template:", error);
      setChatMessages(prev => [...prev, { role: 'model', text: 'Ocorreu um erro ao processar sua solicitação. Tente novamente.' }]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleApplyTemplate = (text: string) => {
    const templateMatch = text.match(/```(?:text|html)?\n([\s\S]*?)```/);
    if (templateMatch && templateMatch[1]) {
      setTemplateInput(templateMatch[1].trim());
    } else {
      // If no code block, just append the whole text (fallback)
      setTemplateInput(text);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Carregando configurações...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Assistente Inteligente</h1>
        <p className="text-gray-500 mt-1">Configure o comportamento da IA e crie templates de orçamento.</p>
      </div>

      <div className="space-y-8">
        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-yellow-50 rounded-xl">
                <Bot className="h-6 w-6 text-yellow-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Configurações da IA</h2>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-700">Status Global do Bot:</span>
              <button
                onClick={() => setIsBotActive(!isBotActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 ${
                  isBotActive ? 'bg-yellow-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isBotActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Configuração de Comportamento */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Comportamento do Bot</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Defina como a IA deve se comportar ao atender seus clientes. Especifique o tom de voz, 
                  informações importantes que ela deve sempre pedir, e como ela deve apresentar os orçamentos.
                </p>
                <textarea
                  rows={6}
                  value={behavior}
                  onChange={(e) => setBehavior(e.target.value)}
                  placeholder="Ex: Seja sempre muito educado e prestativo. Chame o cliente pelo nome. Sempre pergunte o modelo e ano do veículo antes de dar qualquer estimativa de preço..."
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                />
              </div>
            </div>

            {/* Template de Orçamento */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Template de Orçamento</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Crie um padrão visual para os orçamentos gerados pela IA. Isso garante consistência 
                  e evita que a IA formate os dados de maneira incorreta.
                </p>
                
                {/* AI Chat Interface */}
                <div className="mb-4 border border-indigo-100 rounded-2xl overflow-hidden bg-indigo-50/30 flex flex-col h-[400px]">
                  <div className="p-3 bg-indigo-100/50 border-b border-indigo-100 flex items-center">
                    <Sparkles className="w-5 h-5 text-indigo-600 mr-2" />
                    <span className="font-medium text-indigo-900 text-sm">Gerador de Template com IA</span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {chatMessages.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                          msg.role === 'user' 
                            ? 'bg-indigo-600 text-white rounded-br-none' 
                            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
                        }`}>
                          <div className="whitespace-pre-wrap">{msg.text}</div>
                          {msg.role === 'model' && msg.text.includes('```') && (
                            <button 
                              onClick={() => handleApplyTemplate(msg.text)}
                              className="mt-2 flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-md transition-colors"
                            >
                              <Check className="w-3 h-3 mr-1" /> Aplicar este template
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {isChatting && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-none p-4 shadow-sm flex space-x-2">
                          <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  
                  <div className="p-3 bg-white border-t border-gray-200 flex items-center">
                    <input 
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Descreva como quer o template..."
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={isChatting || !chatInput.trim()}
                      className="ml-2 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <textarea
                  rows={6}
                  value={templateInput}
                  onChange={(e) => setTemplateInput(e.target.value)}
                  placeholder="Ex: Olá {nome_cliente}! Segue o orçamento para o veículo {veiculo}: \n\nServiços:\n{servicos}\n\nPeças:\n{pecas}\n\nTotal: {total}"
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                />
              </div>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-gray-100">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Mensagens de Confirmação</h3>
            <p className="text-sm text-gray-500 mb-6">
              Configure as mensagens pré-prontas que serão enviadas aos clientes junto com os links de aprovação. Use as variáveis {'{nome_cliente}'} e {'{link}'}.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Solicitação de Orçamento</label>
                <textarea
                  rows={4}
                  value={msgQuoteRequest}
                  onChange={(e) => setMsgQuoteRequest(e.target.value)}
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pré-Orçamento</label>
                <textarea
                  rows={4}
                  value={msgPreQuote}
                  onChange={(e) => setMsgPreQuote(e.target.value)}
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orçamento Final</label>
                <textarea
                  rows={4}
                  value={msgQuote}
                  onChange={(e) => setMsgQuote(e.target.value)}
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="inline-flex items-center px-6 py-3 border border-transparent shadow-sm text-base font-medium rounded-xl text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 transition-colors"
            >
              <Save className="mr-2 h-5 w-5" />
              {isSaving ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
