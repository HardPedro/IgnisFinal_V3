import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Customers } from './pages/Customers';
import { Vehicles } from './pages/Vehicles';
import { Catalog } from './pages/Catalog';
import { Quotes } from './pages/Quotes';
import { WorkOrders } from './pages/WorkOrders';
import { Schedule } from './pages/Schedule';
import { Settings } from './pages/Settings';
import Financial from './pages/Financial';
import { WhatsApp } from './pages/WhatsApp';
import { IntelligentAssistant } from './pages/IntelligentAssistant';
import { LandingPage } from './pages/LandingPage';
import { Admin } from './pages/Admin';
import { ApprovePreQuote } from './pages/ApprovePreQuote';
import { ApproveQuote } from './pages/ApproveQuote';
import { ApproveRequest } from './pages/ApproveRequest';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const ProtectedRoute = ({ children, requiredPermission, requiredPlan }: { children: React.ReactNode, requiredPermission?: string, requiredPlan?: string }) => {
  const { userData, tenantData } = useAuth();
  const isGestor = userData?.role === 'Gestor' || userData?.role === 'SuperAdmin';
  const mecanicoPermissions = tenantData?.mecanicoPermissions || {};

  if (requiredPlan && tenantData?.plan !== requiredPlan && userData?.role !== 'SuperAdmin') {
    return <Navigate to="/home" replace />;
  }

  if (requiredPermission) {
    if (requiredPermission === 'SuperAdmin') {
      if (userData?.role !== 'SuperAdmin') return <Navigate to="/home" replace />;
    } else if (!isGestor && !mecanicoPermissions[requiredPermission]) {
      return <Navigate to="/home" replace />;
    }
  }

  return <>{children}</>;
};

function AppRoutes() {
  const { currentUser, userData, isAuthReady, logout } = useAuth();
  const [requestSent, setRequestSent] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const handleRequestAccess = async () => {
    if (!userData?.email) return;
    setIsRequesting(true);
    try {
      await addDoc(collection(db, 'access_requests'), {
        email: userData.email,
        name: userData.name || currentUser?.displayName || 'Usuário',
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setRequestSent(true);
    } catch (error) {
      console.error('Error requesting access:', error);
      alert('Erro ao solicitar acesso. Tente novamente.');
    } finally {
      setIsRequesting(false);
    }
  };

  if (!isAuthReady) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  if (userData?.unauthorized) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-2xl shadow-sm text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Acesso Restrito</h2>
          <p className="text-gray-600 mb-6">
            Sua conta ({userData.email}) ainda não foi vinculada a nenhuma oficina. 
            Por favor, peça ao administrador da sua oficina para convidar você ou solicite acesso.
          </p>
          
          {requestSent ? (
            <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl border border-green-100">
              <p className="font-medium">Solicitação enviada com sucesso!</p>
              <p className="text-sm mt-1">Aguarde a aprovação do administrador.</p>
            </div>
          ) : (
            <button
              onClick={handleRequestAccess}
              disabled={isRequesting}
              className="w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-colors mb-4 disabled:opacity-70"
            >
              {isRequesting ? 'Enviando...' : 'Solicitar Acesso'}
            </button>
          )}

          <button
            onClick={logout}
            className="w-full py-3 px-4 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-xl transition-colors"
          >
            Sair e tentar com outra conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={currentUser ? <Navigate to="/home" /> : <LandingPage />} />
      <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/home" />} />
      <Route path="/approve-pre-quote/:tenantId/:preQuoteId" element={<ApprovePreQuote />} />
      <Route path="/approve-quote/:tenantId/:quoteId" element={<ApproveQuote />} />
      <Route path="/approve-request/:tenantId/:requestId" element={<ApproveRequest />} />
      
      {currentUser ? (
        <Route element={<Layout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/dashboard" element={<ProtectedRoute requiredPermission="canViewFinancial"><Dashboard /></ProtectedRoute>} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/financial" element={<ProtectedRoute requiredPermission="canViewFinancial"><Financial /></ProtectedRoute>} />
          <Route path="/whatsapp" element={<ProtectedRoute requiredPlan="central"><WhatsApp /></ProtectedRoute>} />
          <Route path="/intelligent-assistant" element={<ProtectedRoute requiredPlan="central"><IntelligentAssistant /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute requiredPermission="canEditSettings"><Settings /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute requiredPermission="SuperAdmin"><Admin /></ProtectedRoute>} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" />} />
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
