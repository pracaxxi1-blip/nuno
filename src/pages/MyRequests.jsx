import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

export default function MyRequests() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    async function loadOrders() {
      let fetched = [];
      try {
        const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (data) fetched = data;
      } catch (e) {
        console.log('Erro ao buscar do banco');
      }

      // Pega também do localStorage para garantir sincronia nos testes
      const local = JSON.parse(localStorage.getItem('my_orders') || '[]');
      
      // Une ambos removendo duplicatas básicas
      const combined = [...fetched];
      local.forEach(l => {
        if (!combined.some(c => c.descricao === l.descricao)) {
          combined.push(l);
        }
      });

      setOrders(combined);
    }
    loadOrders();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-800">Minhas Cotações</h2>
          <Link to="/create-request" className="bg-teal-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-teal-700 transition">
            Nova Cotação
          </Link>
        </div>

        <div className="bg-white shadow-xl rounded-2xl border border-slate-200 overflow-hidden">
          {orders.length === 0 ? (
            <p className="p-6 text-slate-500 text-center">Nenhuma cotação encontrada.</p>
          ) : (
            <ul>
              {orders.map((order, idx) => (
                <li key={order.id || idx} className="p-6 border-b border-slate-100 last:border-none flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-slate-800">{order.descricao}</p>
                    {/* Exibe a categoria e a cidade salvas */}
                    <p className="text-sm text-slate-600 mt-1">
                      {order.categoria_nome || 'Categoria Geral'} | {order.cidade_nome || 'Cidade não informada'}
                    </p>
                    <span className="text-xs text-slate-400">Criado em: {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'Hoje'}</span>
                  </div>
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                    {order.status || 'Aguardando Moderação'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}