import React, { useState, useEffect } from 'react';
import { FileText, Plus, CheckCircle, XCircle, X, Trash2, Calendar, Car, User, Printer, Edit, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { printDocument } from '../utils/printUtils';

export function Quotes() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [preQuotes, setPreQuotes] = useState<any[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'quotes' | 'preQuotes' | 'quoteRequests'>('quotes');
  const [isLoading, setIsLoading] = useState(true);
  const [officeSettings, setOfficeSettings] = useState<any>({});
  const [aiSettings, setAiSettings] = useState<any>({});
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [catalog, setCatalog] = useState({ services: [] as any[], parts: [] as any[] });
  
  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activePreQuoteId, setActivePreQuoteId] = useState<string | null>(null);
  
  // Item form state
  const [itemType, setItemType] = useState<'service' | 'part'>('service');
  const [selectedRefId, setSelectedRefId] = useState('');
  const [itemQty, setItemQty] = useState(1);

  const { userData, currentUser } = useAuth();

  useEffect(() => {
    if (!userData?.tenantId) return;

    const tenantId = userData.tenantId;
    const quotesRef = collection(db, `tenants/${tenantId}/quotes`);
    const preQuotesRef = collection(db, `tenants/${tenantId}/pre_quotes`);
    const quoteRequestsRef = collection(db, `tenants/${tenantId}/quote_requests`);
    
    setIsLoading(true);

    const unsubscribeQuotes = onSnapshot(
      quotesRef,
      async (snapshot) => {
        try {
          const quotesData = await Promise.all(snapshot.docs.map(async (quoteDoc) => {
            const data = quoteDoc.data();
            let customerName = 'Desconhecido';
            let customerPhone = '';
            let make = '';
            let model = '';
            let vehiclePlate = '';
            
            if (data.customerId) {
              const customerDocRef = doc(db, `tenants/${tenantId}/customers`, data.customerId);
              const customerSnap = await getDoc(customerDocRef);
              if (customerSnap.exists()) {
                customerName = customerSnap.data().name;
                customerPhone = customerSnap.data().phone || '';
              }
            }

            if (data.vehicleId) {
              const vehicleDocRef = doc(db, `tenants/${tenantId}/vehicles`, data.vehicleId);
              const vehicleSnap = await getDoc(vehicleDocRef);
              if (vehicleSnap.exists()) {
                const vData = vehicleSnap.data();
                make = vData.make;
                model = vData.model;
                vehiclePlate = vData.plate;
              }
            }

            return { 
              id: quoteDoc.id, 
              ...data,
              customerName,
              customerPhone,
              make,
              model,
              vehiclePlate
            };
          }));
          
          // Sort by creation date descending
          quotesData.sort((a: any, b: any) => {
            const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
          });
          
          setQuotes(quotesData);
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/quotes`, currentUser);
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/quotes`, currentUser);
        setIsLoading(false);
      }
    );

    const unsubscribePreQuotes = onSnapshot(
      preQuotesRef,
      async (snapshot) => {
        try {
          const preQuotesData = await Promise.all(snapshot.docs.map(async (docSnap) => {
            const data = docSnap.data();
            let customerName = 'Desconhecido';
            let make = '';
            let model = '';
            let vehiclePlate = '';
            
            if (data.customerId) {
              const customerDocRef = doc(db, `tenants/${tenantId}/customers`, data.customerId);
              const customerSnap = await getDoc(customerDocRef);
              if (customerSnap.exists()) customerName = customerSnap.data().name;
            }

            if (data.vehicleId) {
              const vehicleDocRef = doc(db, `tenants/${tenantId}/vehicles`, data.vehicleId);
              const vehicleSnap = await getDoc(vehicleDocRef);
              if (vehicleSnap.exists()) {
                const vData = vehicleSnap.data();
                make = vData.make;
                model = vData.model;
                vehiclePlate = vData.plate;
              }
            }

            return { 
              id: docSnap.id, 
              ...data,
              customerName,
              make,
              model,
              vehiclePlate
            };
          }));
          
          preQuotesData.sort((a: any, b: any) => {
            const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
          });
          
          setPreQuotes(preQuotesData);
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/pre_quotes`, currentUser);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/pre_quotes`, currentUser);
      }
    );

    const unsubscribeQuoteRequests = onSnapshot(
      quoteRequestsRef,
      async (snapshot) => {
        try {
          const requestsData = await Promise.all(snapshot.docs.map(async (docSnap) => {
            const data = docSnap.data();
            let customerName = 'Desconhecido';
            let make = '';
            let model = '';
            let vehiclePlate = '';
            
            if (data.customerId) {
              const customerDocRef = doc(db, `tenants/${tenantId}/customers`, data.customerId);
              const customerSnap = await getDoc(customerDocRef);
              if (customerSnap.exists()) customerName = customerSnap.data().name;
            }

            if (data.vehicleId) {
              const vehicleDocRef = doc(db, `tenants/${tenantId}/vehicles`, data.vehicleId);
              const vehicleSnap = await getDoc(vehicleDocRef);
              if (vehicleSnap.exists()) {
                const vData = vehicleSnap.data();
                make = vData.make;
                model = vData.model;
                vehiclePlate = vData.plate;
              }
            }

            return { 
              id: docSnap.id, 
              ...data,
              customerName,
              make,
              model,
              vehiclePlate
            };
          }));
          
          requestsData.sort((a: any, b: any) => {
            const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
          });
          
          setQuoteRequests(requestsData.filter((req: any) => req.status !== 'aguardando_cliente'));
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/quote_requests`, currentUser);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/quote_requests`, currentUser);
      }
    );

    fetchOfficeSettings();
    return () => {
      unsubscribeQuotes();
      unsubscribePreQuotes();
      unsubscribeQuoteRequests();
    };
  }, [userData, currentUser]);

  const fetchOfficeSettings = async () => {
    if (!userData?.tenantId) return;
    try {
      const tenantId = userData.tenantId;
      const settingsRef = doc(db, `tenants/${tenantId}/settings/general`);
      const snap = await getDoc(settingsRef);
      if (snap.exists()) {
        setOfficeSettings(snap.data());
      }

      const aiSettingsRef = doc(db, `tenants/${tenantId}/settings`, 'ai_assistant');
      const aiSnap = await getDoc(aiSettingsRef);
      if (aiSnap.exists()) {
        setAiSettings(aiSnap.data());
      }
    } catch (error) {
      console.error('Failed to fetch office settings', error);
    }
  };

  const fetchFormData = async () => {
    if (!userData?.tenantId) return;
    const tenantId = userData.tenantId;

    try {
      // Fetch customers
      const customersRef = collection(db, `tenants/${tenantId}/customers`);
      onSnapshot(customersRef, (snap) => {
        setCustomers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      // Fetch vehicles
      const vehiclesRef = collection(db, `tenants/${tenantId}/vehicles`);
      onSnapshot(vehiclesRef, (snap) => {
        setVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      // Fetch catalog
      const servicesRef = collection(db, `tenants/${tenantId}/services`);
      const partsRef = collection(db, `tenants/${tenantId}/parts`);
      
      onSnapshot(servicesRef, (snap) => {
        setCatalog(prev => ({ ...prev, services: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
      });
      onSnapshot(partsRef, (snap) => {
        setCatalog(prev => ({ ...prev, parts: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
      });

    } catch (err) {
      console.error('Failed to fetch form data', err);
    }
  };

  const handleOpenModal = () => {
    setEditingId(null);
    setActivePreQuoteId(null);
    setSelectedCustomerId('');
    setSelectedVehicleId('');
    setItems([]);
    fetchFormData();
    setIsModalOpen(true);
  };

  const handleEdit = (quote: any) => {
    setEditingId(quote.id);
    setActivePreQuoteId(null);
    setSelectedCustomerId(quote.customerId);
    setSelectedVehicleId(quote.vehicleId);
    setItems(quote.items || []);
    fetchFormData();
    setIsModalOpen(true);
  };

  const handleCreateQuoteFromPreQuote = async (preQuote: any) => {
    setEditingId(null);
    setActivePreQuoteId(preQuote.id);
    setSelectedCustomerId(preQuote.customerId);
    setSelectedVehicleId(preQuote.vehicleId);
    
    // Ensure catalog is loaded before setting items
    let currentCatalog = catalog;
    if (catalog.services.length === 0 && catalog.parts.length === 0 && userData?.tenantId) {
      const servicesRef = collection(db, `tenants/${userData.tenantId}/services`);
      const partsRef = collection(db, `tenants/${userData.tenantId}/parts`);
      const [servicesSnap, partsSnap] = await Promise.all([
        getDocs(servicesRef),
        getDocs(partsRef)
      ]);
      currentCatalog = {
        services: servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        parts: partsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      };
      setCatalog(currentCatalog);
    }

    const populatedItems = (preQuote.items || []).map((item: any) => {
      if (item.unitPrice === undefined || item.unitPrice === null) {
        if (item.type === 'service') {
          const service = currentCatalog.services.find((s: any) => s.id === item.refId);
          if (service) return { ...item, unitPrice: service.defaultPrice || 0 };
        } else if (item.type === 'part') {
          const part = currentCatalog.parts.find((p: any) => p.id === item.refId);
          if (part) return { ...item, unitPrice: part.price || 0 };
        }
      }
      return item;
    });

    setItems(populatedItems);
    fetchFormData();
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!userData?.tenantId) return;
    if (window.confirm('Tem certeza que deseja excluir este orçamento?')) {
      try {
        await deleteDoc(doc(db, `tenants/${userData.tenantId}/quotes`, id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `tenants/${userData.tenantId}/quotes/${id}`, currentUser);
      }
    }
  };

  const handleStatusChange = async (quote: any, status: string) => {
    if (!userData?.tenantId) return;
    
    if (status === 'aceito') {
      const askClient = window.confirm('Você quer solicitar confirmação do cliente? (é altamente recomendado para gerar a OS)');
      if (askClient) {
        await sendApprovalMessage(userData.tenantId, quote.id, quote, false);
        alert('Link de aprovação enviado ao cliente!');
        return; // Do not accept manually, wait for client
      } else {
        const force = window.confirm('Tem certeza que deseja aprovar manualmente sem a confirmação do cliente?');
        if (!force) return;
      }
    }

    try {
      const res = await fetch(`/api/quote/${userData.tenantId}/${quote.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });
      
      if (!res.ok) {
        throw new Error('Failed to update status');
      }

      if (status === 'aceito') {
        alert('Orçamento aprovado manualmente!');
      }
    } catch (err) {
      console.error('Error updating quote status:', err);
      alert('Erro ao atualizar status do orçamento.');
    }
  };

  const sendWhatsAppMessage = async (phone: string, message: string) => {
    if (!userData?.tenantId) return;
    try {
      const response = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: userData.tenantId,
          phone: phone,
          message: message
        })
      });
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      alert('Mensagem enviada com sucesso via WhatsApp!');
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      alert('Erro ao enviar mensagem via WhatsApp. Verifique as configurações da Z-API.');
    }
  };

  const handleSendWhatsApp = async (quote: any) => {
    if (!quote.customerPhone) {
      alert('Cliente não possui telefone cadastrado.');
      return;
    }

    const services = quote.items?.filter((i: any) => i.type === 'service').map((i: any) => `- ${i.name} (R$ ${(i.unitPrice || 0).toFixed(2)})`).join('\n') || 'Nenhum serviço';
    const parts = quote.items?.filter((i: any) => i.type === 'part').map((i: any) => `- ${i.name} (R$ ${(i.unitPrice || 0).toFixed(2)})`).join('\n') || 'Nenhuma peça';
    
    // For Quotes, we should send a link to ApproveQuote
    const approvalLink = `${window.location.origin}/approve-quote/${userData.tenantId}/${quote.id}`;
    
    let message = `Olá ${quote.customerName}!\n\nAqui está o seu orçamento oficial para o veículo ${quote.make} ${quote.model}:\n\n*Serviços:*\n${services}\n\n*Peças:*\n${parts}\n\n*Total estimado:* R$ ${(quote.totalAmount || 0).toFixed(2)}\n\nPor favor, confira os valores e confirme a aprovação clicando no link abaixo para darmos andamento ao serviço:\n${approvalLink}`;

    if (aiSettings?.msgQuote) {
      message = aiSettings.msgQuote
        .replace(/{nome_cliente}/g, quote.customerName)
        .replace(/{link}/g, approvalLink);
    } else if (aiSettings?.template) {
      message = aiSettings.template
        .replace(/{nome_cliente}/g, quote.customerName)
        .replace(/{veiculo}/g, `${quote.make} ${quote.model}`)
        .replace(/{servicos}/g, services)
        .replace(/{pecas}/g, parts)
        .replace(/{total}/g, `R$ ${(quote.totalAmount || 0).toFixed(2)}`);
      
      message += `\n\nPor favor, confira os valores e confirme a aprovação clicando no link abaixo para darmos andamento ao serviço:\n${approvalLink}`;
    }
    
    const phone = quote.customerPhone.replace(/\D/g, '');
    await sendWhatsAppMessage(phone, message);
    
    // Update status to 'enviado'
    try {
      const quoteRef = doc(db, `tenants/${userData.tenantId}/quotes`, quote.id);
      await updateDoc(quoteRef, { status: 'enviado' });
    } catch (err) {
      console.error('Error updating quote status:', err);
    }
  };

  const handleAddItem = () => {
    if (!selectedRefId) return;
    
    let unitPrice = 0;
    let name = '';
    
    if (itemType === 'service') {
      const service = catalog.services.find((s: any) => s.id === selectedRefId) as any;
      if (service) {
        unitPrice = service.defaultPrice || 0;
        name = service.name;
      }
    } else {
      const part = catalog.parts.find((p: any) => p.id === selectedRefId) as any;
      if (part) {
        unitPrice = part.price || 0;
        name = part.name;
      }
    }
    
    setItems([...items, { type: itemType, refId: selectedRefId, name, qty: itemQty, unitPrice }]);
    setSelectedRefId('');
    setItemQty(1);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const sendApprovalMessage = async (tenantId: string, id: string, quoteData: any, isPreQuote = false) => {
    try {
      const customerId = quoteData.customerId || selectedCustomerId;
      const vehicleId = quoteData.vehicleId || selectedVehicleId;
      
      if (!customerId) {
        console.error("No customer ID found for approval message");
        return;
      }

      const customerDocRef = doc(db, `tenants/${tenantId}/customers`, customerId);
      const customerSnap = await getDoc(customerDocRef);
      if (customerSnap.exists()) {
        const customerPhone = customerSnap.data().phone;
        const customerName = customerSnap.data().name;
        if (customerPhone) {
          const approvalLink = `${window.location.origin}/${isPreQuote ? 'approve-pre-quote' : 'approve-quote'}/${tenantId}/${id}`;
          
          let message = `Olá!\n\nAqui está o seu ${isPreQuote ? 'pré-orçamento' : 'orçamento'} detalhado.\n\nPor favor, confira os valores e confirme a aprovação clicando no link abaixo:\n${approvalLink}`;

          if (isPreQuote && aiSettings?.msgPreQuote) {
            message = aiSettings.msgPreQuote
              .replace(/{nome_cliente}/g, customerName)
              .replace(/{link}/g, approvalLink);
          } else if (!isPreQuote && aiSettings?.msgQuote) {
            message = aiSettings.msgQuote
              .replace(/{nome_cliente}/g, customerName)
              .replace(/{link}/g, approvalLink);
          } else if (aiSettings?.template) {
            const services = quoteData.items?.filter((i: any) => i.type === 'service').map((i: any) => `- ${i.name} (R$ ${(i.unitPrice || 0).toFixed(2)})`).join('\n') || 'Nenhum serviço';
            const parts = quoteData.items?.filter((i: any) => i.type === 'part').map((i: any) => `- ${i.name} (R$ ${(i.unitPrice || 0).toFixed(2)})`).join('\n') || 'Nenhuma peça';
            
            let vehicleName = 'Veículo';
            if (vehicleId) {
              const vehicleDocRef = doc(db, `tenants/${tenantId}/vehicles`, vehicleId);
              const vehicleSnap = await getDoc(vehicleDocRef);
              if (vehicleSnap.exists()) {
                vehicleName = `${vehicleSnap.data().make} ${vehicleSnap.data().model}`;
              }
            }

            message = aiSettings.template
              .replace(/{nome_cliente}/g, customerName)
              .replace(/{veiculo}/g, vehicleName)
              .replace(/{servicos}/g, services)
              .replace(/{pecas}/g, parts)
              .replace(/{total}/g, `R$ ${(quoteData.totalAmount || 0).toFixed(2)}`);
            
            message += `\n\nPor favor, confira os valores e confirme a aprovação clicando no link abaixo:\n${approvalLink}`;
          }

          const phone = customerPhone.replace(/\D/g, '');
          await sendWhatsAppMessage(phone, message);
        }
      }
    } catch (err) {
      console.error("Error sending approval message", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !selectedVehicleId || items.length === 0) {
      alert('Preencha todos os campos e adicione pelo menos um item.');
      return;
    }
    if (!userData?.tenantId) return;

    try {
      const tenantId = userData.tenantId;
      const totalAmount = items.reduce((acc, item) => acc + (item.qty * (item.unitPrice || 0)), 0);
      
      const quoteData = {
        customerId: selectedCustomerId,
        vehicleId: selectedVehicleId,
        items: items.map(i => ({ type: i.type, refId: i.refId, qty: i.qty, unitPrice: i.unitPrice, name: i.name })),
        totalAmount,
        status: 'pendente',
        updatedAt: serverTimestamp()
      };

      if (editingId) {
        const quoteRef = doc(db, `tenants/${tenantId}/quotes`, editingId);
        await updateDoc(quoteRef, quoteData);
        
        if (window.confirm('Você quer solicitar confirmação do cliente? (é altamente recomendado)')) {
          await sendApprovalMessage(tenantId, editingId, quoteData);
        }
      } else if (activePreQuoteId) {
        // Update the pre-quote with items and change status to 'enviado'
        const preQuoteRef = doc(db, `tenants/${tenantId}/pre_quotes`, activePreQuoteId);
        await updateDoc(preQuoteRef, {
          items: quoteData.items,
          totalAmount: quoteData.totalAmount,
          status: 'enviado',
          updatedAt: serverTimestamp()
        });
        
        if (window.confirm('Você quer solicitar confirmação do cliente? (é altamente recomendado)')) {
          await sendApprovalMessage(tenantId, activePreQuoteId, quoteData, true);
        }
        setActiveTab('preQuotes');
      } else {
        const quotesRef = collection(db, `tenants/${tenantId}/quotes`);
        const newQuote = await addDoc(quotesRef, {
          ...quoteData,
          createdAt: serverTimestamp()
        });
        
        if (window.confirm('Você quer solicitar confirmação do cliente? (é altamente recomendado)')) {
          await sendApprovalMessage(tenantId, newQuote.id, quoteData);
        }
      }

      setIsModalOpen(false);
      setEditingId(null);
      setActivePreQuoteId(null);
      setSelectedCustomerId('');
      setSelectedVehicleId('');
      setItems([]);
    } catch (err) {
      handleFirestoreError(err, editingId ? OperationType.UPDATE : OperationType.CREATE, `tenants/${userData.tenantId}/quotes`, currentUser);
    }
  };

  const filteredVehicles = vehicles.filter(v => v.customerId === selectedCustomerId);
  const totalAmount = items.reduce((acc, item) => acc + (item.qty * (item.unitPrice || 0)), 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <FileText className="mr-3 h-8 w-8 text-yellow-500" />
          Orçamentos
        </h1>
        <button
          onClick={handleOpenModal}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-sm text-gray-900 bg-yellow-500 hover:bg-yellow-400 transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Orçamento
        </button>
      </div>

      <div className="flex space-x-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('quotes')}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'quotes'
              ? 'border-yellow-500 text-yellow-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Orçamentos
        </button>
        <button
          onClick={() => setActiveTab('preQuotes')}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'preQuotes'
              ? 'border-yellow-500 text-yellow-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Pré-Orçamentos (Aprovados pelo Cliente)
        </button>
        <button
          onClick={() => setActiveTab('quoteRequests')}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'quoteRequests'
              ? 'border-yellow-500 text-yellow-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Solicitações de Orçamento (IA)
        </button>
      </div>

      <div className="bg-white shadow-sm overflow-hidden sm:rounded-2xl border border-gray-100">
        <ul className="divide-y divide-gray-100">
          {isLoading ? (
            <li className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto"></div>
            </li>
          ) : activeTab === 'quotes' ? (
            quotes.length === 0 ? (
              <li className="p-8 text-center text-gray-500">Nenhum orçamento encontrado.</li>
            ) : (
              quotes.map((quote) => (
                <li key={quote.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${
                          quote.status === 'aceito' ? 'bg-green-100 text-green-800' :
                          quote.status === 'recusado' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {quote.status.toUpperCase()}
                        </span>
                        <span className="text-sm text-gray-500 flex items-center">
                          <Calendar className="mr-1 h-4 w-4" />
                          {quote.createdAt?.toDate ? new Date(quote.createdAt.toDate()).toLocaleDateString('pt-BR') : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-6">
                        <div className="flex items-center text-sm font-medium text-gray-900">
                          <User className="mr-2 h-4 w-4 text-gray-400" />
                          {quote.customerName}
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Car className="mr-2 h-4 w-4 text-gray-400" />
                          {quote.make} {quote.model} <span className="ml-1 font-mono bg-gray-100 px-1 rounded">{quote.vehiclePlate}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end space-y-3">
                      <div className="flex items-center space-x-3">
                        <button 
                          onClick={() => handleEdit(quote)}
                          className="flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-medium transition-colors"
                          title="Editar Orçamento"
                        >
                          <Edit className="h-4 w-4 mr-1.5" />
                          Editar
                        </button>
                        <button 
                          onClick={() => handleDelete(quote.id)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="Excluir Orçamento"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                        <button 
                          onClick={() => printDocument(quote, officeSettings, 'ORÇAMENTO')}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                          title="Imprimir Orçamento"
                        >
                          <Printer className="h-5 w-5" />
                        </button>
                        <button 
                          onClick={() => handleSendWhatsApp(quote)}
                          className="p-2 text-green-500 hover:text-green-600 hover:bg-green-50 rounded-xl transition-colors"
                          title="Enviar via WhatsApp"
                        >
                          <MessageCircle className="h-5 w-5" />
                        </button>
                        <div className="text-lg font-bold text-gray-900 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                          R$ {(quote.totalAmount || 0).toFixed(2)}
                        </div>
                      </div>
                      
                      {quote.status !== 'aceito' && quote.status !== 'recusado' && (
                        <div className="flex space-x-2">
                          <button 
                            onClick={async () => {
                              if (window.confirm('Deseja enviar o link de aprovação para o cliente no WhatsApp?')) {
                                await sendApprovalMessage(userData?.tenantId, quote.id, quote, false);
                                alert('Link enviado com sucesso!');
                              }
                            }}
                            className="flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-medium transition-colors" 
                            title="Solicitar Aprovação"
                          >
                            <FileText className="h-4 w-4 mr-1.5" />
                            Solicitar Aprovação
                          </button>
                          <button 
                            onClick={() => handleStatusChange(quote, 'aceito')}
                            className="flex items-center px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-sm font-medium transition-colors" 
                            title="Aprovação Manual"
                          >
                            <CheckCircle className="h-4 w-4 mr-1.5" />
                            Aprovação Manual
                          </button>
                          <button 
                            onClick={() => handleStatusChange(quote, 'recusado')}
                            className="flex items-center px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors" 
                            title="Recusar"
                          >
                            <XCircle className="h-4 w-4 mr-1.5" />
                            Recusar
                          </button>
                        </div>
                      )}
                      {quote.status === 'aceito' && !quote.osGenerated && (
                        <button 
                          onClick={async () => {
                            if (window.confirm('Deseja gerar uma Ordem de Serviço (OS) a partir deste orçamento?')) {
                              try {
                                const ordersRef = collection(db, `tenants/${userData?.tenantId}/workOrders`);
                                await addDoc(ordersRef, {
                                  quoteId: quote.id,
                                  customerId: quote.customerId,
                                  vehicleId: quote.vehicleId,
                                  items: quote.items || [],
                                  totalAmount: quote.totalAmount || 0,
                                  status: 'aberta',
                                  mechanic: '',
                                  createdAt: serverTimestamp(),
                                  updatedAt: serverTimestamp()
                                });
                                
                                const quoteRef = doc(db, `tenants/${userData?.tenantId}/quotes`, quote.id);
                                await updateDoc(quoteRef, { osGenerated: true });
                                
                                alert('Ordem de Serviço gerada com sucesso!');
                              } catch (err) {
                                handleFirestoreError(err, OperationType.CREATE, `tenants/${userData?.tenantId}/workOrders`, currentUser);
                              }
                            }
                          }}
                          className="flex items-center px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-sm font-bold transition-colors shadow-sm"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Gerar OS
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))
            )
          ) : activeTab === 'preQuotes' ? (
            preQuotes.length === 0 ? (
              <li className="p-8 text-center text-gray-500">Nenhum pré-orçamento encontrado.</li>
            ) : (
              preQuotes.map((preQuote) => (
                <li key={preQuote.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${
                          preQuote.status === 'aprovado' ? 'bg-green-100 text-green-800' :
                          preQuote.status === 'enviado' ? 'bg-blue-100 text-blue-800' :
                          preQuote.status === 'reprovado' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {preQuote.status.toUpperCase()}
                        </span>
                        <span className="text-sm text-gray-500 flex items-center">
                          <Calendar className="mr-1 h-4 w-4" />
                          {preQuote.createdAt?.toDate ? new Date(preQuote.createdAt.toDate()).toLocaleDateString('pt-BR') : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-6 mb-2">
                        <div className="flex items-center text-sm font-medium text-gray-900">
                          <User className="mr-2 h-4 w-4 text-gray-400" />
                          {preQuote.customerName}
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Car className="mr-2 h-4 w-4 text-gray-400" />
                          {preQuote.make} {preQuote.model} <span className="ml-1 font-mono bg-gray-100 px-1 rounded">{preQuote.vehiclePlate}</span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-700 bg-gray-100 p-3 rounded-lg">
                        <strong>Descrição do Problema:</strong> {preQuote.description}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end space-y-3 ml-4">
                      {preQuote.status === 'rascunho' && (
                        <button 
                          onClick={() => handleCreateQuoteFromPreQuote(preQuote)}
                          className="flex items-center px-4 py-2 bg-yellow-500 text-gray-900 hover:bg-yellow-400 rounded-xl text-sm font-bold transition-colors shadow-sm"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Adicionar Valores
                        </button>
                      )}
                      {preQuote.status === 'reprovado' && (
                        <button 
                          onClick={() => handleCreateQuoteFromPreQuote(preQuote)}
                          className="flex items-center px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-sm font-bold transition-colors shadow-sm"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Editar e Reenviar
                        </button>
                      )}
                      {preQuote.status === 'enviado' && (
                        <button 
                          onClick={async () => {
                            if (window.confirm('Deseja aprovar manualmente este pré-orçamento e gerar o orçamento final?')) {
                              try {
                                const preQuoteRef = doc(db, `tenants/${userData?.tenantId}/pre_quotes`, preQuote.id);
                                await updateDoc(preQuoteRef, { status: 'aprovado' });
                                
                                // Create a Quote (Orçamento Oficial)
                                const quotesRef = collection(db, `tenants/${userData?.tenantId}/quotes`);
                                await addDoc(quotesRef, {
                                  preQuoteId: preQuote.id,
                                  customerId: preQuote.customerId,
                                  vehicleId: preQuote.vehicleId,
                                  items: preQuote.items || [],
                                  totalAmount: preQuote.totalAmount || 0,
                                  status: 'rascunho', // Needs diagnosis and final approval
                                  createdAt: serverTimestamp(),
                                  updatedAt: serverTimestamp()
                                });

                                // Audit Log
                                await addDoc(collection(db, `tenants/${userData?.tenantId}/audit_logs`), {
                                  userId: currentUser?.uid,
                                  action: 'Bypass: Aprovação Manual de Pré-Orçamento',
                                  entityType: 'pre_quotes',
                                  entityId: preQuote.id,
                                  reason: 'Aprovação manual pelo painel',
                                  createdAt: serverTimestamp()
                                });
                              } catch (err) {
                                console.error('Error approving pre-quote manually', err);
                              }
                            }
                          }}
                          className="flex items-center px-4 py-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl text-sm font-bold transition-colors shadow-sm"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Aprovação Manual
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))
            )
          ) : (
            quoteRequests.length === 0 ? (
              <li className="p-8 text-center text-gray-500">Nenhuma solicitação de orçamento encontrada.</li>
            ) : (
              quoteRequests.map((request) => (
                <li key={request.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${
                          request.status === 'aprovado' ? 'bg-green-100 text-green-800' :
                          request.status === 'rejeitado' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {request.status.toUpperCase()}
                        </span>
                        <span className="text-sm text-gray-500 flex items-center">
                          <Calendar className="mr-1 h-4 w-4" />
                          {request.createdAt?.toDate ? new Date(request.createdAt.toDate()).toLocaleDateString('pt-BR') : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-6 mb-2">
                        <div className="flex items-center text-sm font-medium text-gray-900">
                          <User className="mr-2 h-4 w-4 text-gray-400" />
                          {request.customerName}
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Car className="mr-2 h-4 w-4 text-gray-400" />
                          {request.make} {request.model} <span className="ml-1 font-mono bg-gray-100 px-1 rounded">{request.vehiclePlate}</span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-700 bg-gray-100 p-3 rounded-lg">
                        <strong>Descrição do Problema:</strong> {request.description}
                        {request.items && request.items.length > 0 && (
                          <div className="mt-2">
                            <strong>Itens Identificados:</strong>
                            <ul className="list-disc list-inside mt-1">
                              {request.items.map((item: any, idx: number) => (
                                <li key={idx}>{item.name} (Qtd: {item.qty})</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end space-y-3 ml-4">
                      {request.status === 'pendente' && (
                        <div className="flex space-x-2">
                          <button 
                            onClick={async () => {
                              try {
                                const requestRef = doc(db, `tenants/${userData?.tenantId}/quote_requests`, request.id);
                                await updateDoc(requestRef, { status: 'aprovado' });
                                
                                // Create a pre-quote
                                const preQuoteData: any = {
                                  customerId: request.customerId,
                                  vehicleId: request.vehicleId,
                                  description: request.description,
                                  status: 'rascunho',
                                  createdAt: serverTimestamp(),
                                };
                                if (request.items && request.items.length > 0) {
                                  preQuoteData.items = request.items;
                                }
                                await addDoc(collection(db, `tenants/${userData?.tenantId}/pre_quotes`), preQuoteData);
                                
                                // Audit Log
                                await addDoc(collection(db, `tenants/${userData?.tenantId}/audit_logs`), {
                                  userId: currentUser?.uid,
                                  action: 'Bypass: Aprovação Manual de Solicitação',
                                  entityType: 'quote_requests',
                                  entityId: request.id,
                                  reason: 'Aprovação manual pelo painel',
                                  createdAt: serverTimestamp()
                                });
                              } catch (err) {
                                console.error('Error approving request', err);
                              }
                            }}
                            className="flex items-center px-4 py-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl text-sm font-medium transition-colors"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Aprovar
                          </button>
                          <button 
                            onClick={async () => {
                              try {
                                const requestRef = doc(db, `tenants/${userData?.tenantId}/quote_requests`, request.id);
                                await updateDoc(requestRef, { status: 'rejeitado' });
                                
                                // Audit Log
                                await addDoc(collection(db, `tenants/${userData?.tenantId}/audit_logs`), {
                                  userId: currentUser?.uid,
                                  action: 'Bypass: Reprovação Manual de Solicitação',
                                  entityType: 'quote_requests',
                                  entityId: request.id,
                                  reason: 'Reprovação manual pelo painel',
                                  createdAt: serverTimestamp()
                                });
                              } catch (err) {
                                console.error('Error rejecting request', err);
                              }
                            }}
                            className="flex items-center px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-sm font-medium transition-colors"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Rejeitar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))
            )
          )}
        </ul>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50" onClick={() => setIsModalOpen(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl text-left overflow-hidden shadow-xl w-full max-w-3xl border border-gray-100 max-h-[90vh] flex flex-col"
            >
              <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">Novo Orçamento</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500 bg-gray-50 hover:bg-gray-100 p-2 rounded-full transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                        <select 
                          required 
                          value={selectedCustomerId} 
                          onChange={e => {
                            setSelectedCustomerId(e.target.value);
                            setSelectedVehicleId('');
                          }} 
                          className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors"
                        >
                          <option value="">Selecione um cliente</option>
                          {customers.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Veículo</label>
                        <select 
                          required 
                          value={selectedVehicleId} 
                          onChange={e => setSelectedVehicleId(e.target.value)} 
                          className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                          disabled={!selectedCustomerId}
                        >
                          <option value="">Selecione um veículo</option>
                          {filteredVehicles.map(v => (
                            <option key={v.id} value={v.id}>{v.make} {v.model} ({v.plate})</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="border-t border-gray-100 pt-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">Adicionar Itens</h4>
                      <div className="flex space-x-4 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <div className="w-1/4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                          <select 
                            value={itemType} 
                            onChange={e => {
                              setItemType(e.target.value as any);
                              setSelectedRefId('');
                            }} 
                            className="block w-full border border-gray-300 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors"
                          >
                            <option value="service">Serviço</option>
                            <option value="part">Peça</option>
                          </select>
                        </div>
                        <div className="w-1/2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                          <select 
                            value={selectedRefId} 
                            onChange={e => setSelectedRefId(e.target.value)} 
                            className="block w-full border border-gray-300 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors"
                          >
                            <option value="">Selecione um item</option>
                            {itemType === 'service' 
                              ? catalog.services.map((s: any) => <option key={s.id} value={s.id}>{s.name} - R$ {(s.defaultPrice || 0).toFixed(2)}</option>)
                              : catalog.parts.map((p: any) => <option key={p.id} value={p.id}>{p.name} - R$ {(p.price || 0).toFixed(2)}</option>)
                            }
                          </select>
                        </div>
                        <div className="w-1/4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Qtd</label>
                          <div className="flex">
                            <input 
                              type="number" 
                              min="1" 
                              value={itemQty} 
                              onChange={e => setItemQty(parseInt(e.target.value) || 1)} 
                              className="block w-full border border-gray-300 rounded-l-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                            />
                            <button 
                              type="button" 
                              onClick={handleAddItem}
                              disabled={!selectedRefId}
                              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-r-xl shadow-sm text-white bg-gray-800 hover:bg-gray-900 disabled:opacity-50 transition-colors"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>

                      {items.length > 0 && (
                        <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Item</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Qtd</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Preço Un.</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Subtotal</th>
                                <th className="px-4 py-3"></th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${item.type === 'service' ? 'bg-yellow-50 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                                      {item.type === 'service' ? 'Serviço' : 'Peça'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">{item.qty}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                                    <div className="flex items-center justify-end">
                                      <span className="mr-1">R$</span>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={item.unitPrice || ''}
                                        onChange={(e) => {
                                          const newItems = [...items];
                                          newItems[idx].unitPrice = parseFloat(e.target.value) || 0;
                                          setItems(newItems);
                                        }}
                                        className="w-24 text-right border-gray-300 rounded-md shadow-sm focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                                        placeholder="0.00"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right font-bold">R$ {(item.qty * (item.unitPrice || 0)).toFixed(2)}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                    <button type="button" onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors">
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t border-gray-200">
                              <tr>
                                <td colSpan={4} className="px-4 py-4 text-right text-sm font-medium text-gray-500 uppercase">Total do Orçamento:</td>
                                <td className="px-4 py-4 text-right text-lg font-bold text-yellow-600">R$ {(totalAmount || 0).toFixed(2)}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-8 pt-4 border-t border-gray-100 flex flex-row-reverse gap-3">
                      <button type="submit" className="inline-flex justify-center rounded-xl border border-transparent shadow-sm px-6 py-3 bg-yellow-500 text-sm font-bold text-gray-900 hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors">
                        Salvar Orçamento
                      </button>
                      <button type="button" onClick={() => setIsModalOpen(false)} className="inline-flex justify-center rounded-xl border border-gray-300 shadow-sm px-6 py-3 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors">
                        Cancelar
                      </button>
                    </div>
                  </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
