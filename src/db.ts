import { randomUUID } from 'crypto';

export type Role = 'GESTOR' | 'MECANICO';

export interface User {
  id: string;
  name: string;
  role: Role;
  permissions: {
    canBypass: boolean;
    canSendPreQuoteWithoutReview: boolean;
  };
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
}

export type QuoteRequestStatus = 'AWAITING_CUSTOMER' | 'APPROVED_BY_CUSTOMER' | 'REJECTED_BY_CUSTOMER' | 'CONVERTED';

export interface QuoteRequest {
  id: string;
  customerId: string;
  problemDescription: string;
  status: QuoteRequestStatus;
  createdAt: string;
}

export type PreQuoteStatus = 'DRAFT' | 'AWAITING_INTERNAL_APPROVAL' | 'AWAITING_CUSTOMER' | 'APPROVED_BY_CUSTOMER' | 'REJECTED_BY_CUSTOMER' | 'CONVERTED';

export interface PreQuoteItem {
  id: string;
  description: string;
  price: number;
  type: 'PART' | 'SERVICE';
}

export interface PreQuote {
  id: string;
  quoteRequestId?: string; // Optional if created from active flow
  customerId: string;
  items: PreQuoteItem[];
  total: number;
  status: PreQuoteStatus;
  createdAt: string;
}

export interface Quote {
  id: string;
  preQuoteId: string;
  customerId: string;
  total: number;
  createdAt: string;
  status: 'APPROVED' | 'CONVERTED';
}

export type OSStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface OS {
  id: string;
  quoteId: string;
  customerId: string;
  status: OSStatus;
  createdAt: string;
  completedAt?: string;
}

export interface Recall {
  id: string;
  osId: string;
  customerId: string;
  triggerDate: string;
  services: string[];
  status: 'PENDING' | 'SENT';
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityId: string;
  entityType: string;
  timestamp: string;
  reason?: string;
}

// In-memory Database
class Database {
  users: User[] = [
    { id: 'u1', name: 'Admin Gestor', role: 'GESTOR', permissions: { canBypass: true, canSendPreQuoteWithoutReview: true } },
    { id: 'u2', name: 'João Mecânico', role: 'MECANICO', permissions: { canBypass: false, canSendPreQuoteWithoutReview: false } }
  ];
  customers: Customer[] = [];
  quoteRequests: QuoteRequest[] = [];
  preQuotes: PreQuote[] = [];
  quotes: Quote[] = [];
  oss: OS[] = [];
  recalls: Recall[] = [];
  auditLogs: AuditLog[] = [];

  // Helper methods
  addCustomer(c: Omit<Customer, 'id'>) {
    const newC = { ...c, id: randomUUID() };
    this.customers.push(newC);
    return newC;
  }

  addQuoteRequest(qr: Omit<QuoteRequest, 'id' | 'createdAt'>) {
    const newQr = { ...qr, id: randomUUID(), createdAt: new Date().toISOString() };
    this.quoteRequests.push(newQr);
    return newQr;
  }

  addPreQuote(pq: Omit<PreQuote, 'id' | 'createdAt'>) {
    const newPq = { ...pq, id: randomUUID(), createdAt: new Date().toISOString() };
    this.preQuotes.push(newPq);
    return newPq;
  }

  addQuote(q: Omit<Quote, 'id' | 'createdAt'>) {
    const newQ = { ...q, id: randomUUID(), createdAt: new Date().toISOString() };
    this.quotes.push(newQ);
    return newQ;
  }

  addOS(os: Omit<OS, 'id' | 'createdAt'>) {
    const newOS = { ...os, id: randomUUID(), createdAt: new Date().toISOString() };
    this.oss.push(newOS);
    return newOS;
  }

  addRecall(r: Omit<Recall, 'id'>) {
    const newR = { ...r, id: randomUUID() };
    this.recalls.push(newR);
    return newR;
  }

  logAudit(log: Omit<AuditLog, 'id' | 'timestamp'>) {
    this.auditLogs.push({ ...log, id: randomUUID(), timestamp: new Date().toISOString() });
  }
}

export const db = new Database();
