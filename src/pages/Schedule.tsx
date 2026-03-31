import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Calendar as CalendarIcon, Clock, Plus, X, Edit, Trash2, User, Car, CheckCircle, XCircle } from 'lucide-react';
import { format, parseISO, isSameDay, startOfWeek, addDays, addWeeks, subWeeks, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function Schedule() {
  const { userData } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [formData, setFormData] = useState({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '08:00',
    customerId: '',
    vehicleId: '',
    status: 'scheduled',
    notes: ''
  });

  useEffect(() => {
    if (!userData?.tenantId) return;

    const fetchCustomersAndVehicles = async () => {
      const customersRef = collection(db, `tenants/${userData.tenantId}/customers`);
      const vehiclesRef = collection(db, `tenants/${userData.tenantId}/vehicles`);
      
      const [customersSnap, vehiclesSnap] = await Promise.all([
        getDocs(customersRef),
        getDocs(vehiclesRef)
      ]);
      
      setCustomers(customersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setVehicles(vehiclesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    fetchCustomersAndVehicles();

    const appointmentsRef = collection(db, `tenants/${userData.tenantId}/appointments`);
    const q = query(appointmentsRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort by date and time
      apps.sort((a: any, b: any) => {
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateA.getTime() - dateB.getTime();
      });
      setAppointments(apps);
    });

    return () => unsubscribe();
  }, [userData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.tenantId) return;

    try {
      const appointmentsRef = collection(db, `tenants/${userData.tenantId}/appointments`);
      
      if (editingId) {
        await updateDoc(doc(appointmentsRef, editingId), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(appointmentsRef, {
          ...formData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving appointment:', error);
      alert('Erro ao salvar compromisso.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!userData?.tenantId) return;
    if (window.confirm('Tem certeza que deseja excluir este compromisso?')) {
      try {
        await deleteDoc(doc(db, `tenants/${userData.tenantId}/appointments`, id));
      } catch (error) {
        console.error('Error deleting appointment:', error);
        alert('Erro ao excluir compromisso.');
      }
    }
  };

  const handleEdit = (appointment: any) => {
    setFormData({
      title: appointment.title || '',
      date: appointment.date || format(new Date(), 'yyyy-MM-dd'),
      time: appointment.time || '08:00',
      customerId: appointment.customerId || '',
      vehicleId: appointment.vehicleId || '',
      status: appointment.status || 'scheduled',
      notes: appointment.notes || ''
    });
    setEditingId(appointment.id);
    setIsModalOpen(true);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (!userData?.tenantId) return;
    try {
      await updateDoc(doc(db, `tenants/${userData.tenantId}/appointments`, id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Erro ao atualizar status.');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      time: '08:00',
      customerId: '',
      vehicleId: '',
      status: 'scheduled',
      notes: ''
    });
    setEditingId(null);
  };

  // Generate days for the current week view
  const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }); // Start on Monday
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));

  const getAppointmentsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return appointments.filter(app => app.date === dateStr);
  };

  const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const today = () => setCurrentDate(new Date());

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Agenda</h1>
          <p className="text-gray-500 mt-1">Gerencie seus compromissos e agendamentos.</p>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="bg-yellow-500 text-gray-900 px-4 py-2 rounded-xl font-bold hover:bg-yellow-400 transition-colors flex items-center shadow-sm"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Compromisso
        </button>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center space-x-4">
            <button onClick={prevWeek} className="p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200 hover:shadow-sm">
              &lt;
            </button>
            <h2 className="text-lg font-bold text-gray-900 capitalize w-48 text-center">
              {format(startDate, 'MMMM yyyy', { locale: ptBR })}
            </h2>
            <button onClick={nextWeek} className="p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200 hover:shadow-sm">
              &gt;
            </button>
          </div>
          <button onClick={today} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
            Hoje
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-100">
          {weekDays.map((day, i) => (
            <div key={i} className={`p-4 text-center border-r border-gray-100 last:border-r-0 ${isSameDay(day, new Date()) ? 'bg-yellow-50/30' : ''}`}>
              <div className="text-xs font-medium text-gray-500 uppercase mb-1">{format(day, 'EEE', { locale: ptBR })}</div>
              <div className={`text-lg font-bold ${isSameDay(day, new Date()) ? 'text-yellow-600' : 'text-gray-900'}`}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 min-h-[500px]">
          {weekDays.map((day, i) => {
            const dayApps = getAppointmentsForDate(day);
            return (
              <div key={i} className={`p-2 border-r border-gray-100 last:border-r-0 ${isSameDay(day, new Date()) ? 'bg-yellow-50/10' : ''}`}>
                <div className="space-y-2">
                  {dayApps.map(app => (
                    <div 
                      key={app.id} 
                      className={`p-3 rounded-xl border text-sm transition-all hover:shadow-md cursor-pointer group ${
                        app.status === 'completed' ? 'bg-green-50 border-green-100' :
                        app.status === 'cancelled' ? 'bg-red-50 border-red-100' :
                        'bg-white border-gray-200 shadow-sm'
                      }`}
                      onClick={() => handleEdit(app)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-bold ${
                          app.status === 'completed' ? 'text-green-700' :
                          app.status === 'cancelled' ? 'text-red-700' :
                          'text-gray-900'
                        }`}>{app.time}</span>
                        <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {app.status === 'scheduled' && (
                            <button onClick={(e) => { e.stopPropagation(); handleStatusChange(app.id, 'completed'); }} className="text-green-600 hover:text-green-800" title="Marcar como concluído">
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                          {app.status === 'scheduled' && (
                            <button onClick={(e) => { e.stopPropagation(); handleStatusChange(app.id, 'cancelled'); }} className="text-red-600 hover:text-red-800" title="Cancelar">
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className={`font-medium line-clamp-2 ${
                        app.status === 'completed' ? 'text-green-800 line-through opacity-70' :
                        app.status === 'cancelled' ? 'text-red-800 line-through opacity-70' :
                        'text-gray-800'
                      }`}>
                        {app.title}
                      </div>
                      {app.customerId && (
                        <div className="mt-2 text-xs text-gray-500 flex items-center truncate">
                          <User className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="truncate">{customers.find(c => c.id === app.customerId)?.name || 'Cliente'}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">
                {editingId ? 'Editar Compromisso' : 'Novo Compromisso'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                  placeholder="Ex: Avaliação Presencial"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Horário</label>
                  <input
                    type="time"
                    required
                    value={formData.time}
                    onChange={e => setFormData({...formData, time: e.target.value})}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente (Opcional)</label>
                <select
                  value={formData.customerId}
                  onChange={e => setFormData({...formData, customerId: e.target.value})}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                >
                  <option value="">Selecione um cliente...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {formData.customerId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Veículo (Opcional)</label>
                  <select
                    value={formData.vehicleId}
                    onChange={e => setFormData({...formData, vehicleId: e.target.value})}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                  >
                    <option value="">Selecione um veículo...</option>
                    {vehicles.filter(v => v.customerId === formData.customerId).map(v => (
                      <option key={v.id} value={v.id}>{v.make} {v.model} ({v.plate})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData({...formData, status: e.target.value})}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                >
                  <option value="scheduled">Agendado</option>
                  <option value="completed">Concluído</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                  placeholder="Detalhes adicionais..."
                />
              </div>

              <div className="pt-4 flex justify-between space-x-3">
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(editingId)}
                    className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-medium transition-colors"
                  >
                    Excluir
                  </button>
                ) : <div></div>}
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-yellow-500 text-gray-900 rounded-xl font-bold hover:bg-yellow-400 transition-colors"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
