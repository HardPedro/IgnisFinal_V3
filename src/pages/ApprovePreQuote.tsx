import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { CheckCircle, XCircle, Loader2, FileText, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { format, addDays, isWeekend, parseISO, isBefore, startOfDay } from 'date-fns';

export function ApprovePreQuote() {
  const { tenantId, preQuoteId } = useParams();
  const [preQuote, setPreQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const [isApproving, setIsApproving] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [appointments, setAppointments] = useState<any[]>([]);

  useEffect(() => {
    const fetchPreQuote = async () => {
      if (!tenantId || !preQuoteId) return;
      try {
        const docRef = doc(db, `tenants/${tenantId}/pre_quotes`, preQuoteId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setPreQuote({ id: docSnap.id, ...docSnap.data() });
        } else {
          setError('Pré-orçamento não encontrado.');
        }
      } catch (err) {
        console.error(err);
        setError('Erro ao carregar pré-orçamento.');
      } finally {
        setLoading(false);
      }
    };
    fetchPreQuote();
  }, [tenantId, preQuoteId]);

  useEffect(() => {
    const fetchAppointments = async () => {
      if (!tenantId || !isApproving) return;
      try {
        const appsRef = collection(db, `tenants/${tenantId}/appointments`);
        // Fetch future appointments to check availability
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const q = query(appsRef, where('date', '>=', todayStr));
        const snap = await getDocs(q);
        setAppointments(snap.docs.map(d => d.data()));
      } catch (err) {
        console.error('Error fetching appointments:', err);
      }
    };
    fetchAppointments();
  }, [tenantId, isApproving]);

  const handleAction = async (status: 'aprovado' | 'reprovado') => {
    if (!tenantId || !preQuoteId) return;
    
    if (status === 'aprovado' && (!selectedDate || !selectedTime)) {
      alert('Por favor, selecione uma data e horário para agendar a visita.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/pre-quote/${tenantId}/${preQuoteId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          status,
          appointmentDate: status === 'aprovado' ? selectedDate : undefined,
          appointmentTime: status === 'aprovado' ? selectedTime : undefined
        })
      });
      
      if (!res.ok) {
        throw new Error('Failed to update status');
      }

      setSuccess(true);
      setPreQuote((prev: any) => ({ ...prev, status }));
    } catch (err) {
      console.error(err);
      setError('Erro ao atualizar status.');
    } finally {
      setLoading(false);
    }
  };

  // Generate available dates (next 14 days, excluding weekends)
  const availableDates = Array.from({ length: 14 }).map((_, i) => {
    const d = addDays(new Date(), i + 1); // Start from tomorrow
    return d;
  }).filter(d => !isWeekend(d));

  // Generate available times (08:00 to 17:00)
  const allTimes = Array.from({ length: 10 }).map((_, i) => {
    const hour = i + 8;
    return `${hour.toString().padStart(2, '0')}:00`;
  });

  const getAvailableTimesForDate = (dateStr: string) => {
    const bookedTimes = appointments
      .filter(app => app.date === dateStr && app.status !== 'cancelled')
      .map(app => app.time);
    
    return allTimes.filter(time => !bookedTimes.includes(time));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Ops!</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (success || (preQuote?.status === 'aprovado' || preQuote?.status === 'reprovado')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          {preQuote?.status === 'aprovado' ? (
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          ) : (
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          )}
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Pré-orçamento {preQuote?.status === 'aprovado' ? 'Aprovado' : 'Reprovado'}
          </h2>
          <p className="text-gray-600">
            {preQuote?.status === 'aprovado' 
              ? 'Obrigado! Seu pré-orçamento foi aprovado e sua visita foi agendada. Te esperamos no horário marcado!'
              : 'Entendido. Nossa equipe entrará em contato para renegociar os valores e escopo.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-center mb-6">
          <FileText className="h-8 w-8 text-yellow-500 mr-3" />
          <h2 className="text-2xl font-bold text-gray-900">Aprovação de Valores</h2>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-xl mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Descrição do Problema/Serviço:</h3>
          <p className="text-gray-900 whitespace-pre-wrap mb-4">{preQuote.description}</p>
          
          <h3 className="text-sm font-medium text-gray-500 mb-2 border-t border-gray-200 pt-4">Itens do Orçamento:</h3>
          <ul className="space-y-2 mb-4">
            {preQuote.items?.map((item: any, index: number) => (
              <li key={index} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.qty}x {item.name}</span>
                <span className="font-medium text-gray-900">R$ {(item.qty * (item.unitPrice || 0)).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          
          <div className="flex justify-between items-center border-t border-gray-200 pt-4">
            <span className="font-bold text-gray-900">Total Estimado:</span>
            <span className="text-xl font-bold text-yellow-600">R$ {(preQuote.totalAmount || 0).toFixed(2)}</span>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-6 text-center">
          Por favor, confira os valores acima e confirme se deseja aprovar o orçamento.
        </p>

        {!isApproving ? (
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleAction('reprovado')}
              className="flex items-center justify-center px-4 py-3 border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 rounded-xl font-medium transition-colors"
            >
              <XCircle className="h-5 w-5 mr-2" />
              Reprovar
            </button>
            <button
              onClick={() => setIsApproving(true)}
              className="flex items-center justify-center px-4 py-3 border border-transparent text-white bg-green-600 hover:bg-green-700 rounded-xl font-medium transition-colors"
            >
              <CheckCircle className="h-5 w-5 mr-2" />
              Aprovar
            </button>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="font-bold text-gray-900 text-center mb-4">Agende sua visita</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <CalendarIcon className="h-4 w-4 mr-1" /> Data
              </label>
              <select
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedTime(''); // Reset time when date changes
                }}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
              >
                <option value="">Selecione uma data...</option>
                {availableDates.map((date, i) => (
                  <option key={i} value={format(date, 'yyyy-MM-dd')}>
                    {format(date, 'dd/MM/yyyy')}
                  </option>
                ))}
              </select>
            </div>

            {selectedDate && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                  <Clock className="h-4 w-4 mr-1" /> Horário
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {getAvailableTimesForDate(selectedDate).map((time) => (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        selectedTime === time
                          ? 'bg-yellow-500 text-gray-900 border-yellow-500'
                          : 'bg-white border border-gray-200 text-gray-700 hover:border-yellow-500'
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                  {getAvailableTimesForDate(selectedDate).length === 0 && (
                    <div className="col-span-3 text-center text-sm text-gray-500 py-2">
                      Nenhum horário disponível nesta data.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mt-6">
              <button
                onClick={() => setIsApproving(false)}
                className="px-4 py-3 border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 rounded-xl font-medium transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={() => handleAction('aprovado')}
                disabled={!selectedDate || !selectedTime}
                className="px-4 py-3 border border-transparent text-white bg-green-600 hover:bg-green-700 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirmar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
