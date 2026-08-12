import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function MyBids() {
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBids() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Consulta filtrando pela coluna 'cliente_id' presente na tabela orders
        const { data, error } = await supabase
          .from('bids')
          .select(`
            id, preco, observacao, status, created_at,
            orders!inner(descricao, cliente_id)
          `)
          .eq('orders.cliente_id', user.id);

        if (!error && data) {
          setBids(data);
        }
      }
      setLoading(false);
    }
    fetchBids();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Orçamentos Recebidos</h2>

        {loading ? <p>Carregando...</p> : bids.length === 0 ? (
          <p className="text-slate-500">Nenhum orçamento recebido ainda.</p>
        ) : (
          <div className="space-y-4">
            {bids.map((bid) => (
              <div key={bid.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg text-slate-800">{bid.orders.descricao}</h3>
                    <p className="text-teal-600 font-bold text-xl mt-2">R$ {parseFloat(bid.preco).toFixed(2)}</p>
                    <p className="text-slate-600 mt-2 text-sm italic">"{bid.observacao}"</p>
                  </div>
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">
                    {bid.status}
                  </span>
                </div>
                <button className="mt-4 w-full bg-slate-800 text-white py-2 rounded-lg hover:bg-slate-900 transition font-semibold">
                  Aceitar Proposta
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}