import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Bot, Send, User, Search, Plus, Phone, CheckCircle, X, Paperclip, File, Image as ImageIcon, Video, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import { db, storage } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';

export function WhatsApp() {
  const { userData } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const [isBotActive, setIsBotActive] = useState(false);
  const [catalog, setCatalog] = useState<{ services: any[], parts: any[] }>({ services: [], parts: [] });
  const lastMessageTimesRef = useRef<Record<string, string>>({});
  
  // Update ref when state changes
  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);
  
  // New conversation modal
  const [isNewConvModalOpen, setIsNewConvModalOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [whatsappNumbers, setWhatsappNumbers] = useState<any[]>([]);
  const [selectedNumberId, setSelectedNumberId] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userData?.tenantId) return;

    // Fetch catalog
    fetchCatalog();

    // Listen to WhatsApp numbers
    const numbersRef = collection(db, 'whatsapp_numbers');
    const qNumbers = query(numbersRef, where('tenantId', '==', userData.tenantId));
    const unsubNumbers = onSnapshot(qNumbers, (snapshot) => {
      const numbers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setWhatsappNumbers(numbers);
      if (numbers.length > 0 && !selectedNumberId) {
        setSelectedNumberId(numbers[0].id);
      }
    });

    // Listen to conversations
    const convsRef = collection(db, 'whatsapp_conversations');
    const qConvs = query(convsRef, where('tenantId', '==', userData.tenantId), orderBy('last_message_at', 'desc'));
    const unsubConvs = onSnapshot(qConvs, (snapshot) => {
      const convs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setConversations(convs);
      setIsLoading(false);
    });

    return () => {
      unsubNumbers();
      unsubConvs();
    };
  }, [userData?.tenantId]);

  useEffect(() => {
    if (!selectedConv) return;

    const messagesRef = collection(db, `whatsapp_conversations/${selectedConv.id}/messages`);
    const qMessages = query(messagesRef, orderBy('timestamp', 'asc'));
    const unsubMessages = onSnapshot(qMessages, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setMessages(msgs);
    });

    return () => unsubMessages();
  }, [selectedConv]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const fetchCatalog = async () => {
    if (!userData?.tenantId) return;
    try {
      const servicesRef = collection(db, `tenants/${userData.tenantId}/services`);
      const partsRef = collection(db, `tenants/${userData.tenantId}/parts`);
      
      const [servicesSnap, partsSnap] = await Promise.all([
        getDocs(servicesRef),
        getDocs(partsRef)
      ]);
      
      setCatalog({
        services: servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        parts: partsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      });
    } catch (err) {
      console.error('Failed to fetch catalog', err);
    }
  };

  const lastProcessedMsgIdRef = useRef<string | null>(null);

  const handleSelectConversation = (conv: any) => {
    setSelectedConv(conv);
    setIsBotActive(conv.bot_active);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!newMessage.trim() && !selectedMedia) || !selectedConv || isSendingRef.current) return;

    const content = newMessage;
    const mediaToSend = selectedMedia;
    
    setNewMessage('');
    setSelectedMedia(null);
    setIsMediaModalOpen(false);
    isSendingRef.current = true;
    setIsSending(true);

    const waNumber = whatsappNumbers.find(n => n.id === selectedConv.whatsapp_number_id);
    if (!waNumber) {
      alert('Número de WhatsApp não encontrado.');
      isSendingRef.current = false;
      setIsSending(false);
      return;
    }

    try {
      let mediaUrl = '';
      let mediaType = '';
      let fileName = '';

      if (mediaToSend && userData?.tenantId) {
        const fileExt = mediaToSend.name.split('.').pop();
        fileName = mediaToSend.name;
        const storageRef = ref(storage, `tenants/${userData.tenantId}/whatsapp_media/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`);
        
        await uploadBytes(storageRef, mediaToSend);
        mediaUrl = await getDownloadURL(storageRef);

        if (mediaToSend.type.startsWith('image/')) mediaType = 'image';
        else if (mediaToSend.type.startsWith('video/')) mediaType = 'video';
        else if (mediaToSend.type.startsWith('audio/')) mediaType = 'audio';
        else mediaType = 'document';
      }

      // Send via Z-API
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: selectedConv.customer_phone,
          type: mediaUrl ? mediaType : 'text',
          text: content,
          mediaUrl,
          mediaType,
          fileName,
          instanceId: waNumber.instanceId,
          token: waNumber.token,
          clientToken: waNumber.clientToken
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        // Save to Firestore
        const messagesRef = collection(db, `whatsapp_conversations/${selectedConv.id}/messages`);
        await addDoc(messagesRef, {
          tenantId: userData?.tenantId,
          wa_message_id: data.messageId,
          direction: 'outbound',
          type: mediaUrl ? mediaType : 'text',
          content: content,
          mediaUrl: mediaUrl || null,
          fileName: fileName || null,
          status: 'sent',
          timestamp: serverTimestamp()
        });
        
        // Update conversation
        await updateDoc(doc(db, 'whatsapp_conversations', selectedConv.id), {
          last_message_at: serverTimestamp()
        });
        
        isSendingRef.current = false;
        setIsSending(false);
      } else {
        const errorData = await res.json();
        console.error('Failed to send message:', errorData);
        isSendingRef.current = false;
        setIsSending(false);
        
        // Use setTimeout to allow React to re-render and unblock the UI before the alert blocks the thread
        setTimeout(() => {
          alert(`Falha ao enviar mensagem. Detalhes: ${errorData.details || errorData.error}`);
        }, 10);
      }
    } catch (err) {
      console.error('Error sending message', err);
      isSendingRef.current = false;
      setIsSending(false);
      
      setTimeout(() => {
        alert('Erro de conexão ao enviar mensagem.');
      }, 10);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedMedia(e.target.files[0]);
      setIsMediaModalOpen(true);
    }
    // Reset input so the same file can be selected again if cancelled
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleToggleBot = async () => {
    if (!selectedConv) return;
    
    const newStatus = !isBotActive;
    setIsBotActive(newStatus);
    
    try {
      await updateDoc(doc(db, 'whatsapp_conversations', selectedConv.id), {
        bot_active: newStatus
      });
      
      // Update local state
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, bot_active: newStatus } : c));
      setSelectedConv(prev => ({ ...prev, bot_active: newStatus }));
      
    } catch (err) {
      console.error('Failed to toggle bot', err);
      setIsBotActive(!newStatus); // Revert on error
    }
  };

  const handleManualAutoQuote = async () => {
    if (!selectedConv || isSendingRef.current) return;
    isSendingRef.current = true;
    setIsSending(true);
    
    try {
      const waNumber = whatsappNumbers.find(n => n.id === selectedConv.whatsapp_number_id);
      if (!waNumber) {
        throw new Error('Número de WhatsApp não encontrado.');
      }

      const res = await fetch('/api/whatsapp/manual-quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: userData?.tenantId,
          convId: selectedConv.id,
          customerPhone: selectedConv.customer_phone,
          customerName: selectedConv.customer_name,
          waNumberData: waNumber
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Erro ao gerar orçamento');
      }
      
      isSendingRef.current = false;
      setIsSending(false);
    } catch (error: any) {
      console.error('Manual quote failed:', error);
      isSendingRef.current = false;
      setIsSending(false);
      setTimeout(() => {
        alert(`Erro ao gerar pré-orçamento: ${error?.message || error}`);
      }, 10);
    }
  };

  const handleStartConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone || !selectedNumberId) return;

    try {
      const cleanPhone = newPhone.replace(/\D/g, '');
      
      // Check if conversation already exists
      const existingConv = conversations.find(c => c.customer_phone === cleanPhone && c.whatsapp_number_id === selectedNumberId);
      
      if (existingConv) {
        setIsNewConvModalOpen(false);
        setNewPhone('');
        setNewName('');
        handleSelectConversation(existingConv);
        return;
      }

      // Create new conversation in Firestore
      const convRef = await addDoc(collection(db, 'whatsapp_conversations'), {
        tenantId: userData?.tenantId,
        whatsapp_number_id: selectedNumberId,
        customer_phone: cleanPhone,
        customer_name: newName || cleanPhone,
        status: 'open',
        bot_active: true,
        created_at: serverTimestamp(),
        last_message_at: serverTimestamp()
      });
      
      setIsNewConvModalOpen(false);
      setNewPhone('');
      setNewName('');
      
      // Select the new conversation
      handleSelectConversation({
        id: convRef.id,
        whatsapp_number_id: selectedNumberId,
        customer_phone: cleanPhone,
        customer_name: newName || cleanPhone,
        status: 'open',
        bot_active: true
      });
      
    } catch (err) {
      console.error('Failed to start conversation', err);
      alert('Erro ao iniciar conversa.');
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    
    let date: Date;
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      // Firestore Timestamp
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      // Firestore Timestamp raw object
      date = new Date(timestamp.seconds * 1000);
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      // String or Number
      date = new Date(timestamp);
    } else {
      // Unresolved serverTimestamp or unknown object
      date = new Date();
    }
    
    if (isNaN(date.getTime())) return '';
    
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-1">Central de Atendimento Inteligente</p>
        </div>
        <button 
          onClick={() => setIsNewConvModalOpen(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl shadow-sm text-gray-900 bg-yellow-500 hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          Nova Conversa
        </button>
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex">
        {/* Sidebar - Conversations List */}
        <div className="w-1/3 border-r border-gray-200 flex flex-col bg-gray-50">
          <div className="p-4 border-b border-gray-200 bg-white">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar conversas..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-xl leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {isLoading && conversations.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">Carregando...</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">Nenhuma conversa encontrada.</div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {conversations.map((conv) => (
                  <li 
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    className={`p-4 hover:bg-gray-100 cursor-pointer transition-colors ${selectedConv?.id === conv.id ? 'bg-yellow-50/50' : ''}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <User className="h-5 w-5 text-gray-500" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {conv.customer_name || conv.customer_phone}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatTime(conv.last_message_at)}
                          </p>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-sm text-gray-500 truncate">
                            {conv.customer_phone}
                          </p>
                          {conv.bot_active === 1 && (
                            <Bot className="h-3 w-3 text-yellow-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#efeae2]">
          {selectedConv ? (
            <>
              {/* Chat Header */}
              <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center">
                  <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                    <User className="h-5 w-5 text-gray-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-gray-900">{selectedConv.customer_name || selectedConv.customer_phone}</h2>
                    <p className="text-xs text-gray-500">{selectedConv.customer_phone}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleManualAutoQuote}
                    disabled={isSending}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-lg shadow-sm bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Gerar Pré-Orçamento
                  </button>
                  <button
                    onClick={handleToggleBot}
                    className={`inline-flex items-center px-3 py-1.5 border text-sm font-medium rounded-lg shadow-sm transition-colors ${
                      isBotActive 
                        ? 'bg-yellow-100 border-yellow-200 text-yellow-800 hover:bg-yellow-200' 
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Bot className={`mr-2 h-4 w-4 ${isBotActive ? 'text-yellow-600' : 'text-gray-400'}`} />
                    {isBotActive ? 'Bot Ativo' : 'Ativar Bot'}
                  </button>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 p-6 overflow-y-auto" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', opacity: 0.9 }}>
                <div className="space-y-4">
                  {messages.map((msg, idx) => {
                    const isOutbound = msg.direction === 'outbound';
                    return (
                      <div key={msg.id || idx} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        <div 
                          className={`max-w-[75%] rounded-lg px-4 py-2 shadow-sm relative ${
                            isOutbound ? 'bg-[#d9fdd3] text-gray-900 rounded-tr-none' : 'bg-white text-gray-900 rounded-tl-none'
                          }`}
                        >
                          {msg.type === 'image' && msg.mediaUrl && (
                            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="block mb-2">
                              <img src={msg.mediaUrl} alt="Imagem" className="max-w-full rounded-lg max-h-64 object-cover" />
                            </a>
                          )}
                          {msg.type === 'video' && msg.mediaUrl && (
                            <video src={msg.mediaUrl} controls className="max-w-full rounded-lg max-h-64 mb-2" />
                          )}
                          {msg.type === 'audio' && msg.mediaUrl && (
                            <audio src={msg.mediaUrl} controls className="max-w-full mb-2" />
                          )}
                          {msg.type === 'document' && msg.mediaUrl && (
                            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 p-3 bg-black/5 rounded-lg mb-2 hover:bg-black/10 transition-colors">
                              <File className="h-6 w-6 text-gray-600" />
                              <span className="text-sm font-medium text-gray-800 break-all">{msg.fileName || 'Documento'}</span>
                            </a>
                          )}
                          {msg.content && <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>}
                          <div className="flex items-center justify-end mt-1 space-x-1">
                            <span className="text-[10px] text-gray-500">
                              {formatTime(msg.timestamp)}
                            </span>
                            {isOutbound && (
                              msg.status === 'failed' ? (
                                <X className="h-3 w-3 text-red-500" title="Falha ao enviar" />
                              ) : (
                                <CheckCircle className={`h-3 w-3 ${msg.status === 'read' ? 'text-blue-500' : 'text-gray-400'}`} />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input Area */}
              <div className="p-4 bg-[#f0f2f5] border-t border-gray-200">
                <form onSubmit={handleSendMessage} className="flex space-x-3 items-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full transition-colors"
                    title="Anexar arquivo"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                  />
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={isBotActive ? "O Bot está respondendo (digite para assumir)..." : "Digite uma mensagem..."}
                    className="flex-1 block w-full rounded-full border-gray-300 shadow-sm py-3 px-5 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                    disabled={isSending}
                  />
                  <button
                    type="submit"
                    disabled={(!newMessage.trim() && !selectedMedia) || isSending}
                    className="inline-flex items-center justify-center h-12 w-12 rounded-full border border-transparent shadow-sm text-white bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-[#f0f2f5]">
              <div className="h-24 w-24 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                <MessageSquare className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-medium text-gray-900">Oficina Pro Web</h3>
              <p className="mt-2 text-sm">Selecione uma conversa para começar a enviar mensagens.</p>
            </div>
          )}
        </div>
      </div>

      {/* New Conversation Modal */}
      <AnimatePresence>
        {isNewConvModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setIsNewConvModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl text-left overflow-hidden shadow-xl w-full max-w-lg"
            >
              <form onSubmit={handleStartConversation}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                      <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                        Nova Conversa WhatsApp
                      </h3>
                      
                      {whatsappNumbers.length === 0 ? (
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                          <div className="flex">
                            <div className="ml-3">
                              <p className="text-sm text-yellow-700">
                                Você precisa configurar um número de WhatsApp nas Configurações primeiro.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Seu Número (Phone ID)</label>
                            <select
                              value={selectedNumberId}
                              onChange={(e) => setSelectedNumberId(e.target.value)}
                              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm rounded-xl"
                            >
                              {whatsappNumbers.map(num => (
                                <option key={num.id} value={num.id}>{num.phone_number}</option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-500">Este é o ID do número fornecido pela Meta.</p>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Telefone do Cliente (com DDD)</label>
                            <input
                              type="text"
                              value={newPhone}
                              onChange={(e) => setNewPhone(e.target.value)}
                              placeholder="Ex: 5511999999999"
                              className="mt-1 block w-full border border-gray-300 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                              required
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Nome do Cliente (Opcional)</label>
                            <input
                              type="text"
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              placeholder="Ex: João Silva"
                              className="mt-1 block w-full border border-gray-300 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={whatsappNumbers.length === 0 || !newPhone}
                    className="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 bg-yellow-500 text-base font-medium text-white hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    Iniciar Conversa
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNewConvModalOpen(false)}
                    className="mt-3 w-full inline-flex justify-center rounded-xl border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Media Preview Modal */}
      <AnimatePresence>
        {isMediaModalOpen && selectedMedia && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-75 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <h3 className="text-lg font-medium text-gray-900">Enviar Mídia</h3>
                <button
                  onClick={() => {
                    setIsMediaModalOpen(false);
                    setSelectedMedia(null);
                  }}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="p-6 flex flex-col items-center">
                {selectedMedia.type.startsWith('image/') ? (
                  <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4 flex items-center justify-center">
                    <img src={URL.createObjectURL(selectedMedia)} alt="Preview" className="max-h-full max-w-full object-contain" />
                  </div>
                ) : selectedMedia.type.startsWith('video/') ? (
                  <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4 flex items-center justify-center">
                    <video src={URL.createObjectURL(selectedMedia)} controls className="max-h-full max-w-full" />
                  </div>
                ) : selectedMedia.type.startsWith('audio/') ? (
                  <div className="w-full bg-gray-100 rounded-lg p-6 mb-4 flex flex-col items-center justify-center">
                    <Music className="h-12 w-12 text-gray-400 mb-4" />
                    <audio src={URL.createObjectURL(selectedMedia)} controls className="w-full" />
                  </div>
                ) : (
                  <div className="w-full bg-gray-100 rounded-lg p-8 mb-4 flex flex-col items-center justify-center">
                    <File className="h-16 w-16 text-gray-400 mb-4" />
                    <p className="text-sm font-medium text-gray-900 text-center break-all">{selectedMedia.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{(selectedMedia.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                )}

                <div className="w-full">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Adicionar uma legenda..."
                    className="block w-full border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setIsMediaModalOpen(false);
                    setSelectedMedia(null);
                  }}
                  className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isSending}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-xl text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
                >
                  {isSending ? 'Enviando...' : 'Enviar'}
                  <Send className="ml-2 h-4 w-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
