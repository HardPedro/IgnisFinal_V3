import { db } from './server/firebase.js';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, writeBatch } from 'firebase/firestore';

async function seedData() {
  const email = 'harddisk1911@gmail.com';
  console.log(`Buscando conta para ${email}...`);

  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', email));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    console.error(`Conta ${email} não encontrada! Faça login primeiro para criar a conta.`);
    process.exit(1);
  }

  const userData = snapshot.docs[0].data();
  const tenantId = userData.tenantId;
  
  if (!tenantId) {
    console.error(`Usuário encontrado, mas sem tenantId.`);
    process.exit(1);
  }

  console.log(`Tenant ID encontrado: ${tenantId}. Inserindo dados sintéticos...`);

  const batch = writeBatch(db);

  // 1. Customers
  const customersRef = collection(db, `tenants/${tenantId}/customers`);
  const c1Ref = doc(customersRef);
  batch.set(c1Ref, {
    name: 'João Silva',
    phone: '11999999999',
    email: 'joao.silva@email.com',
    document: '12345678900',
    createdAt: serverTimestamp()
  });

  const c2Ref = doc(customersRef);
  batch.set(c2Ref, {
    name: 'Maria Oliveira',
    phone: '11988888888',
    email: 'maria.oliveira@email.com',
    document: '09876543211',
    createdAt: serverTimestamp()
  });

  // 2. Vehicles
  const vehiclesRef = collection(db, `tenants/${tenantId}/vehicles`);
  const v1Ref = doc(vehiclesRef);
  batch.set(v1Ref, {
    customerId: c1Ref.id,
    make: 'Honda',
    model: 'Civic',
    year: '2019',
    plate: 'ABC-1234',
    createdAt: serverTimestamp()
  });

  const v2Ref = doc(vehiclesRef);
  batch.set(v2Ref, {
    customerId: c2Ref.id,
    make: 'Toyota',
    model: 'Corolla',
    year: '2021',
    plate: 'XYZ-9876',
    createdAt: serverTimestamp()
  });

  // 3. Services
  const servicesRef = collection(db, `tenants/${tenantId}/services`);
  const s1Ref = doc(servicesRef);
  batch.set(s1Ref, {
    name: 'Troca de Óleo e Filtro',
    description: 'Serviço completo de troca de óleo do motor e filtro de óleo.',
    price: 150.00,
    estimatedTime: 60,
    createdAt: serverTimestamp()
  });

  const s2Ref = doc(servicesRef);
  batch.set(s2Ref, {
    name: 'Alinhamento e Balanceamento',
    description: 'Alinhamento 3D e balanceamento das 4 rodas.',
    price: 120.00,
    estimatedTime: 90,
    createdAt: serverTimestamp()
  });

  const s3Ref = doc(servicesRef);
  batch.set(s3Ref, {
    name: 'Revisão de Freios',
    description: 'Verificação e troca de pastilhas e discos se necessário.',
    price: 200.00,
    estimatedTime: 120,
    createdAt: serverTimestamp()
  });

  // 4. Parts
  const partsRef = collection(db, `tenants/${tenantId}/parts`);
  const p1Ref = doc(partsRef);
  batch.set(p1Ref, {
    name: 'Óleo Sintético 5W30',
    description: 'Óleo sintético de alta performance',
    price: 45.00,
    stock: 50,
    minStock: 10,
    createdAt: serverTimestamp()
  });

  const p2Ref = doc(partsRef);
  batch.set(p2Ref, {
    name: 'Filtro de Óleo',
    description: 'Filtro de óleo padrão',
    price: 35.00,
    stock: 30,
    minStock: 5,
    createdAt: serverTimestamp()
  });

  const p3Ref = doc(partsRef);
  batch.set(p3Ref, {
    name: 'Pastilha de Freio Dianteira',
    description: 'Jogo de pastilhas de freio dianteiras (cerâmica)',
    price: 180.00,
    stock: 15,
    minStock: 4,
    createdAt: serverTimestamp()
  });

  // 5. Quotes (Orçamentos)
  const quotesRef = collection(db, `tenants/${tenantId}/quotes`);
  const q1Ref = doc(quotesRef);
  batch.set(q1Ref, {
    customerId: c1Ref.id,
    vehicleId: v1Ref.id,
    items: [
      { type: 'service', refId: s1Ref.id, name: 'Troca de Óleo e Filtro', qty: 1, unitPrice: 150.00 },
      { type: 'part', refId: p1Ref.id, name: 'Óleo Sintético 5W30', qty: 4, unitPrice: 45.00 },
      { type: 'part', refId: p2Ref.id, name: 'Filtro de Óleo', qty: 1, unitPrice: 35.00 }
    ],
    totalAmount: 365.00,
    status: 'aprovado',
    createdAt: serverTimestamp()
  });

  const q2Ref = doc(quotesRef);
  batch.set(q2Ref, {
    customerId: c2Ref.id,
    vehicleId: v2Ref.id,
    items: [
      { type: 'service', refId: s2Ref.id, name: 'Alinhamento e Balanceamento', qty: 1, unitPrice: 120.00 },
      { type: 'service', refId: s3Ref.id, name: 'Revisão de Freios', qty: 1, unitPrice: 200.00 },
      { type: 'part', refId: p3Ref.id, name: 'Pastilha de Freio Dianteira', qty: 1, unitPrice: 180.00 }
    ],
    totalAmount: 500.00,
    status: 'pendente',
    createdAt: serverTimestamp()
  });

  // 6. Service Orders (Ordens de Serviço)
  const ordersRef = collection(db, `tenants/${tenantId}/serviceOrders`);
  const o1Ref = doc(ordersRef);
  batch.set(o1Ref, {
    quoteId: q1Ref.id,
    customerId: c1Ref.id,
    vehicleId: v1Ref.id,
    items: [
      { type: 'service', refId: s1Ref.id, name: 'Troca de Óleo e Filtro', qty: 1, unitPrice: 150.00 },
      { type: 'part', refId: p1Ref.id, name: 'Óleo Sintético 5W30', qty: 4, unitPrice: 45.00 },
      { type: 'part', refId: p2Ref.id, name: 'Filtro de Óleo', qty: 1, unitPrice: 35.00 }
    ],
    totalAmount: 365.00,
    status: 'em_andamento',
    mechanic: 'Carlos Mecânico',
    startDate: serverTimestamp(),
    createdAt: serverTimestamp()
  });

  await batch.commit();
  console.log('Dados sintéticos inseridos com sucesso!');
  process.exit(0);
}

seedData().catch(console.error);
