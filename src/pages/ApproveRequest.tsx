import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CheckCircle, XCircle, Loader2, FileText, Car } from 'lucide-react';

export function ApproveRequest() {
  const { tenantId, requestId } = useParams();
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchRequest = async () => {
      if (!tenantId || !requestId) return;
      try {
        const docRef = doc(db, `tenants/${tenantId}/quote_requests`, requestId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          let vehicleStr = 'Veículo não especificado';
          if (data.vehicleId) {
            const vRef = doc(db, `tenants/${tenantId}/vehicles`, data.vehicleId);
            const vSnap = await getDoc(vRef);
            if (vSnap.exists()) {
              vehicleStr = `${vSnap.data().make} ${vSnap.data().model}`;
            }
          }
          setRequest({ id: docSnap.id, ...data, vehicleStr });
        } else {
          setError('Solicitação não encontrada.');
        }
      } catch (err) {
        console.error(err);
        setError('Erro ao carregar solicitação.');
      } finally {
        setLoading(false);
      }
    };
    fetchRequest();
  }, [tenantId, requestId]);

  const handleAction = async (status: 'pendente' | 'cancelado_pelo_cliente') => {
    if (!tenantId || !requestId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/quote-request/${tenantId}/${requestId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });
      
      if (!res.ok) {
        throw new Error('Failed to update status');
      }
      
      setSuccess(true);
      setRequest((prev: any) => ({ ...prev, status }));
    } catch (err) {
      console.error(err);
      setError('Erro ao atualizar status.');
    } finally {
      setLoading(false);
    }
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

  if (success || request?.status !== 'aguardando_cliente') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          {request?.status === 'pendente' ? (
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          ) : (
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          )}
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {request?.status === 'pendente' ? 'Solicitação Confirmada!' : 'Solicitação Cancelada'}
          </h2>
          <p className="text-gray-600">
            {request?.status === 'pendente'
              ? 'Sua solicitação foi enviada para a oficina. Em breve um consultor entrará em contato.'
              : 'A solicitação foi cancelada e não será enviada para a oficina.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
        <div className="text-center mb-8">
          <div className="bg-yellow-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="h-8 w-8 text-yellow-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Confirmar Solicitação</h1>
          <p className="text-gray-500 mt-2">Por favor, verifique se os dados abaixo estão corretos antes de enviarmos para a oficina.</p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <div className="flex items-center text-sm font-medium text-gray-500 mb-1">
              <Car className="h-4 w-4 mr-2" />
              Veículo
            </div>
            <p className="text-gray-900 font-medium">{request.vehicleStr}</p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <div className="flex items-center text-sm font-medium text-gray-500 mb-1">
              <FileText className="h-4 w-4 mr-2" />
              Problema Relatado
            </div>
            <p className="text-gray-900">{request.description}</p>
          </div>

          {request.items && request.items.length > 0 && (
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="flex items-center text-sm font-medium text-gray-500 mb-2">
                <FileText className="h-4 w-4 mr-2" />
                Itens Identificados
              </div>
              <ul className="space-y-2">
                {request.items.map((item: any, idx: number) => (
                  <li key={idx} className="flex justify-between items-center text-sm">
                    <span className="text-gray-900">{item.name}</span>
                    <span className="text-gray-500 font-medium">Qtd: {item.qty}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleAction('pendente')}
            className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-bold rounded-xl text-gray-900 bg-yellow-500 hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors shadow-sm"
          >
            <CheckCircle className="h-5 w-5 mr-2" />
            Sim, os dados estão corretos
          </button>
          <button
            onClick={() => handleAction('cancelado_pelo_cliente')}
            className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-sm font-bold rounded-xl text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors"
          >
            <XCircle className="h-5 w-5 mr-2" />
            Não, cancelar solicitação
          </button>
        </div>
      </div>
    </div>
  );
}
