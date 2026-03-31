import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { CheckCircle, XCircle, Loader2, FileText } from 'lucide-react';

export function ApproveQuote() {
  const { tenantId, quoteId } = useParams();
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchQuote = async () => {
      if (!tenantId || !quoteId) return;
      try {
        const docRef = doc(db, `tenants/${tenantId}/quotes`, quoteId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setQuote({ id: docSnap.id, ...docSnap.data() });
        } else {
          setError('Orçamento não encontrado.');
        }
      } catch (err) {
        console.error(err);
        setError('Erro ao carregar orçamento.');
      } finally {
        setLoading(false);
      }
    };
    fetchQuote();
  }, [tenantId, quoteId]);

  const handleAction = async (status: 'aceito' | 'recusado') => {
    if (!tenantId || !quoteId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/quote/${tenantId}/${quoteId}/action`, {
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
      setQuote((prev: any) => ({ ...prev, status }));
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

  if (success || (quote?.status === 'aceito' || quote?.status === 'recusado')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          {quote?.status === 'aceito' ? (
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          ) : (
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          )}
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Orçamento {quote?.status === 'aceito' ? 'Aprovado' : 'Recusado'}
          </h2>
          <p className="text-gray-600">
            {quote?.status === 'aceito' 
              ? 'Obrigado! Seu orçamento foi aprovado. Nossa equipe iniciará o serviço em breve.'
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
          <h2 className="text-2xl font-bold text-gray-900">Aprovação de Orçamento Oficial</h2>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-xl mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2 border-t border-gray-200 pt-4">Itens do Orçamento:</h3>
          <ul className="space-y-2 mb-4">
            {quote.items?.map((item: any, index: number) => (
              <li key={index} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.qty}x {item.name}</span>
                <span className="font-medium text-gray-900">R$ {(item.qty * (item.unitPrice || 0)).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          
          <div className="flex justify-between items-center border-t border-gray-200 pt-4">
            <span className="font-bold text-gray-900">Total:</span>
            <span className="text-xl font-bold text-yellow-600">R$ {(quote.totalAmount || 0).toFixed(2)}</span>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-6 text-center">
          Por favor, confira os valores acima e confirme se deseja aprovar o orçamento oficial para iniciarmos o serviço.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleAction('recusado')}
            className="flex items-center justify-center px-4 py-3 border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 rounded-xl font-medium transition-colors"
          >
            <XCircle className="h-5 w-5 mr-2" />
            Recusar
          </button>
          <button
            onClick={() => handleAction('aceito')}
            className="flex items-center justify-center px-4 py-3 border border-transparent text-white bg-green-600 hover:bg-green-700 rounded-xl font-medium transition-colors"
          >
            <CheckCircle className="h-5 w-5 mr-2" />
            Aprovar
          </button>
        </div>
      </div>
    </div>
  );
}
