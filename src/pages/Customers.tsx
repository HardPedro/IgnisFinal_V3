import React, { useState, useEffect } from 'react';
import { Users, Plus, X, Clock, AlertCircle, Edit, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export function Customers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [recalls, setRecalls] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const [activeTab, setActiveTab] = useState<'list' | 'recalls'>('list');
  const { userData, currentUser } = useAuth();

  useEffect(() => {
    if (!userData?.tenantId) return;

    const tenantId = userData.tenantId;
    const customersRef = collection(db, `tenants/${tenantId}/customers`);
    const workOrdersRef = collection(db, `tenants/${tenantId}/work_orders`);
    const servicesRef = collection(db, `tenants/${tenantId}/services`);
    
    setIsLoading(true);
    let customersData: any[] = [];
    let workOrdersData: any[] = [];
    let servicesData: any[] = [];

    const calculateRecalls = () => {
      if (!customersData.length || !workOrdersData.length || !servicesData.length) {
        setRecalls([]);
        return;
      }

      const newRecalls: any[] = [];
      const today = new Date();

      workOrdersData.forEach(wo => {
        if (wo.status !== 'completed') return;

        const customer = customersData.find(c => c.id === wo.customerId);
        if (!customer) return;

        wo.items?.forEach((item: any) => {
          if (item.type !== 'service') return;
          
          const service = servicesData.find(s => s.id === item.id);
          if (service && service.recall_period_days && service.recall_period_days > 0) {
            const lastServiceDate = wo.completedAt?.toDate() || wo.createdAt?.toDate() || new Date();
            const nextServiceDate = new Date(lastServiceDate);
            nextServiceDate.setDate(nextServiceDate.getDate() + service.recall_period_days);

            // If next service date is within 30 days or overdue
            const daysUntil = Math.ceil((nextServiceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysUntil <= 30) {
              newRecalls.push({
                customer_name: customer.name,
                customer_phone: customer.phone,
                service_name: service.name,
                vehicle_plate: wo.vehiclePlate || 'N/A',
                last_service_date: lastServiceDate.toISOString(),
                next_service_date: nextServiceDate.toISOString(),
                days_until: daysUntil
              });
            }
          }
        });
      });

      // Sort by next service date (closest/most overdue first)
      newRecalls.sort((a, b) => new Date(a.next_service_date).getTime() - new Date(b.next_service_date).getTime());
      setRecalls(newRecalls);
    };

    const unsubCustomers = onSnapshot(
      customersRef,
      (snapshot) => {
        customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCustomers(customersData);
        calculateRecalls();
        setIsLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/customers`, currentUser);
        setIsLoading(false);
      }
    );

    const unsubWorkOrders = onSnapshot(
      workOrdersRef,
      (snapshot) => {
        workOrdersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        calculateRecalls();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/work_orders`, currentUser)
    );

    const unsubServices = onSnapshot(
      servicesRef,
      (snapshot) => {
        servicesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        calculateRecalls();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/services`, currentUser)
    );

    return () => {
      unsubCustomers();
      unsubWorkOrders();
      unsubServices();
    };
  }, [userData, currentUser]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.tenantId) return;

    try {
      const tenantId = userData.tenantId;
      
      if (editingId) {
        const customerRef = doc(db, `tenants/${tenantId}/customers`, editingId);
        await updateDoc(customerRef, {
          ...newCustomer,
          updatedAt: serverTimestamp()
        });
      } else {
        const customersRef = collection(db, `tenants/${tenantId}/customers`);
        await addDoc(customersRef, {
          ...newCustomer,
          createdAt: serverTimestamp()
        });
      }
      
      setNewCustomer({ name: '', phone: '' });
      setEditingId(null);
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, editingId ? OperationType.UPDATE : OperationType.CREATE, `tenants/${userData.tenantId}/customers`, currentUser);
    }
  };

  const handleEdit = (customer: any) => {
    setEditingId(customer.id);
    setNewCustomer({ name: customer.name, phone: customer.phone });
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    if (!userData?.tenantId) return;
    if (window.confirm('Tem certeza que deseja excluir este cliente?')) {
      try {
        await deleteDoc(doc(db, `tenants/${userData.tenantId}/customers`, id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `tenants/${userData.tenantId}/customers/${id}`, currentUser);
      }
    }
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setNewCustomer({ name: '', phone: '' });
    setIsAdding(!isAdding);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
            <Users className="mr-3 h-8 w-8 text-yellow-500" />
            Clientes
          </h1>
          <div className="flex space-x-2 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Lista
            </button>
            <button
              onClick={() => setActiveTab('recalls')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${activeTab === 'recalls' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Recalls
              {recalls.length > 0 && (
                <span className="ml-2 bg-purple-100 text-purple-700 py-0.5 px-2 rounded-full text-xs">
                  {recalls.length}
                </span>
              )}
            </button>
          </div>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-sm text-gray-900 bg-yellow-500 hover:bg-yellow-400 transition-all duration-200"
        >
          {isAdding ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {isAdding ? 'Cancelar' : 'Novo Cliente'}
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Adicionar Cliente</h2>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                    <input
                      type="text"
                      required
                      value={newCustomer.name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                      className="block w-full rounded-xl border-gray-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 sm:text-sm px-4 py-3 border transition-colors"
                      placeholder="Nome completo"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                    <input
                      type="text"
                      required
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      className="block w-full rounded-xl border-gray-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 sm:text-sm px-4 py-3 border transition-colors"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 border border-transparent shadow-sm text-sm font-bold rounded-xl text-gray-900 bg-yellow-500 hover:bg-yellow-400 transition-colors"
                  >
                    Salvar Cliente
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {activeTab === 'list' ? (
        <div className="bg-white shadow-sm overflow-hidden sm:rounded-2xl border border-gray-100">
          <ul className="divide-y divide-gray-100">
            {isLoading ? (
              <li className="p-8 text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto"></div>
              </li>
            ) : customers.length === 0 ? (
              <li className="p-8 text-center text-gray-500">Nenhum cliente encontrado.</li>
            ) : (
              customers.map((customer) => (
                <li key={customer.id} className="px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center">
                    <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700 font-bold mr-4">
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{customer.name}</p>
                      <p className="text-sm text-gray-500">{customer.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-sm text-gray-400">
                      Cadastrado em {customer.createdAt?.toDate ? new Date(customer.createdAt.toDate()).toLocaleDateString('pt-BR') : 'N/A'}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(customer)}
                        className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                        title="Editar Cliente"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(customer.id)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                        title="Excluir Cliente"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : (
        <div className="bg-white shadow-sm overflow-hidden sm:rounded-2xl border border-gray-100">
          <div className="px-6 py-5 border-b border-gray-100 bg-white flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-2 bg-purple-50 rounded-lg mr-3">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="text-lg leading-6 font-semibold text-gray-900">Recalls Pendentes</h3>
                <p className="text-sm text-gray-500">Clientes que precisam retornar para serviços recorrentes</p>
              </div>
            </div>
          </div>
          <ul className="divide-y divide-gray-100">
            {isLoading ? (
              <li className="p-8 text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
              </li>
            ) : recalls.length === 0 ? (
              <li className="p-8 text-center text-gray-500">Nenhum recall pendente no momento.</li>
            ) : (
              recalls.map((recall, idx) => {
                const isOverdue = new Date(recall.next_service_date) < new Date();
                return (
                  <li key={idx} className="px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold mr-4 ${isOverdue ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'}`}>
                        {isOverdue ? <AlertCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{recall.customer_name} <span className="text-gray-500 font-normal">- {recall.customer_phone}</span></p>
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="font-medium text-gray-900">{recall.service_name}</span> no veículo <span className="font-mono bg-gray-100 px-1 rounded">{recall.vehicle_plate}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold px-3 py-1 rounded-lg inline-block ${isOverdue ? 'bg-red-50 text-red-700' : 'bg-purple-50 text-purple-700'}`}>
                        {isOverdue ? 'Atrasado' : 'Vence em'} {new Date(recall.next_service_date).toLocaleDateString('pt-BR')}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Última OS: {new Date(recall.last_service_date).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
