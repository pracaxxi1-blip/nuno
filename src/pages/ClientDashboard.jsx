import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

export default function ClientDashboard() {
  const [orders, setOrders] = useState([]);
  const [bidsByOrder, setBidsByOrder] = useState({});
  const [bidItemsMap, setBidItemsMap] = useState({});
  const [orderItemsMap, setOrderItemsMap] = useState({});
  const [loading, setLoading] = useState(true);

  const [showDetails, setShowDetails] = useState({});
  const [activeImage, setActiveImage] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Estados do Perfil / Modal
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cidade, setCidade] = useState('');
  const [cities, setCities] = useState([]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchClientData();
  }, []);

  async function fetchClientData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      setUserEmail(user.email || '');

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileData) {
        setNome(profileData.nome || '');
        setTelefone(profileData.telefone || '');
        setCidade(profileData.cidade || '');
      }

      const { data: citiesData } = await supabase.from('cities').select('*');
      if (citiesData) {
        const uniqueCitiesMap = new Map();
        citiesData.forEach(c => {
          if (c.nome && !uniqueCitiesMap.has(c.nome.trim().toLowerCase())) {
            uniqueCitiesMap.set(c.nome.trim().toLowerCase(), c);
          }
        });
        setCities(Array.from(uniqueCitiesMap.values()));
      }

      const { data: ordersData } = await supabase
        .from('orders')
        .select('*')
        .eq('cliente_id', user.id)
        .order('created_at', { ascending: false });

      if (ordersData && ordersData.length > 0) {
        setOrders(ordersData);
        const orderIds = ordersData.map(o => o.id);

        const { data: itemsData } = await supabase.from('order_items').select('*').in('order_id', orderIds);
        const oItemsMap = {};
        (itemsData || []).forEach(item => {
          if (!oItemsMap[item.order_id]) oItemsMap[item.order_id] = [];
          oItemsMap[item.order_id].push(item);
        });
        setOrderItemsMap(oItemsMap);

        let { data: bidsData } = await supabase.from('bids').select('*').in('order_id', orderIds);

        if (bidsData && bidsData.length > 0) {
          const bidIds = bidsData.map(b => b.id);
          const { data: bItemsData } = await supabase.from('bid_items').select('*').in('bid_id', bidIds);

          const bItemsGroup = {};
          (bItemsData || []).forEach(bi => {
            if (!bItemsGroup[bi.bid_id]) bItemsGroup[bi.bid_id] = [];
            bItemsGroup[bi.bid_id].push(bi);
          });
          setBidItemsMap(bItemsGroup);

          const grouped = {};
          bidsData.forEach(b => {
            const orderKey = String(b.order_id || b.pedido_id);
            if (!grouped[orderKey]) grouped[orderKey] = [];
            grouped[orderKey].push(b);
          });

          Object.keys(grouped).forEach(orderKey => {
            grouped[orderKey].sort((a, b) => {
              if (a.is_completo !== b.is_completo) {
                return a.is_completo ? -1 : 1;
              }
              const totalA = (parseFloat(a.preco || 0)) + (parseFloat(a.frete || 0));
              const totalB = (parseFloat(b.preco || 0)) + (parseFloat(b.frete || 0));
              return totalA - totalB;
            });
          });

          setBidsByOrder(grouped);
        }
      }
    }
    setLoading(false);
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ nome, telefone, cidade })
        .eq('id', user.id);

      if (error) throw error;

      alert('Dados atualizados com sucesso!');
      setIsProfileModalOpen(false);
    } catch (err) {
      alert('Erro ao atualizar perfil: ' + err.message);
    }
  };

  const handleAcceptBid = async (bidId) => {
    const confirm = window.confirm("Ao confirmar, o lojista receberá seu nome e WhatsApp para concluir o atendimento. Deseja prosseguir?");
    if (!confirm) return;

    const { error } = await supabase.from('bids').update({ status: 'Aceito' }).eq('id', bidId);
    if (!error) {
      alert('Proposta confirmada com sucesso!');
      fetchClientData();
    }
  };

  const toggleDetails = (bidId) => {
    setShowDetails(prev => ({ ...prev, [bidId]: !prev[bidId] }));
  };

  const getRemainingTime = (expiraEm) => {
    if (!expiraEm) return { texto: 'Sem prazo', expirado: false };
    const diff = new Date(expiraEm).getTime() - now;
    if (diff <= 0) return { texto: 'Prazo para propostas encerrado', expirado: true };

    const horas = Math.floor(diff / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((diff % (1000 * 60)) / 1000);

    if (horas > 0) return { texto: `Recebendo propostas por mais ${horas}h ${minutos}m`, expirado: false };
    return { texto: `Recebendo propostas por mais ${minutos}m ${segundos}s`, expirado: false };
  };

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Painel do Cliente</h2>
            <p className="text-sm text-slate-500">Minhas Cotações e Orçamentos Recebidos</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-900 transition shadow-sm"
            >
              Meus Dados
            </button>
            <Link 
              to="/create-request" 
              className="bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-teal-700 transition shadow-sm"
            >
              + Nova Cotação
            </Link>
            <button
              onClick={handleLogout}
              className="bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-300 transition"
            >
              Sair
            </button>
          </div>
        </div>

        {/* Lista de Pedidos */}
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-slate-800">Minhas Cotações e Histórico</h3>

          {loading ? (
            <p className="text-slate-500 text-center py-4 bg-white rounded-2xl">Carregando...</p>
          ) : orders.length === 0 ? (
            <p className="text-slate-500 text-center py-8 bg-white rounded-2xl border border-slate-200">Você ainda não possui nenhuma cotação cadastrada.</p>
          ) : orders.map((order) => {
            const orderBids = bidsByOrder[String(order.id)] || [];
            const items = orderItemsMap[order.id] || [];
            const tempo = getRemainingTime(order.expira_em);

            return (
              <div key={order.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
                <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg">
                        Pedido #{order.codigo_pedido || order.id}
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tempo.expirado ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>
                        ⏱️ {tempo.texto}
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-slate-800 mt-2">{order.descricao}</h4>
                  </div>
                  <span className="text-xs font-medium bg-slate-100 text-slate-700 px-3 py-1 rounded-full">{order.status || 'Ativo'}</span>
                </div>

                {/* Propostas Recebidas */}
                <div className="space-y-3">
                  {orderBids.length === 0 ? (
                    <p className="text-sm text-slate-500 italic py-2">
                      {tempo.expirado ? 'Nenhuma proposta foi enviada durante o prazo.' : 'Aguardando propostas dos lojistas...'}
                    </p>
                  ) : (
                    orderBids.map((bid, index) => {
                      const total = (parseFloat(bid.preco || 0)) + (parseFloat(bid.frete || 0));
                      const bItems = bidItemsMap[bid.id] || [];

                      return (
                        <div key={bid.id} className={`p-4 rounded-xl border ${bid.is_completo ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50/40'} space-y-3`}>
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-600">Opção #{index + 1}</span>
                                {bid.is_completo ? (
                                  <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded">Atendimento 100%</span>
                                ) : (
                                  <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">Atendimento Parcial</span>
                                )}
                              </div>
                              <p className="text-xl font-bold text-slate-900 mt-1">Total: R$ {total.toFixed(2)} <span className="text-xs text-slate-500 font-normal">(Frete R$ {parseFloat(bid.frete || 0).toFixed(2)})</span></p>
                            </div>

                            <div className="flex items-center gap-2">
                              <button onClick={() => toggleDetails(bid.id)} className="text-xs font-bold text-slate-600 hover:underline">
                                {showDetails[bid.id] ? 'Ocultar Itens' : 'Ver Detalhes / Fotos'}
                              </button>
                              {bid.status === 'Aceito' ? (
                                <span className="text-xs font-bold bg-green-100 text-green-700 px-3 py-1.5 rounded-full">Proposta Confirmada</span>
                              ) : (
                                <button onClick={() => handleAcceptBid(bid.id)} className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700">
                                  Confirmar Proposta
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Detalhes dos Itens */}
                          {showDetails[bid.id] && (
                            <div className="pt-3 border-t border-slate-200 space-y-2">
                              {items.map((oItem) => {
                                const bItem = bItems.find(bi => bi.order_item_id === oItem.id);
                                return (
                                  <div key={oItem.id} className="text-xs text-slate-700 flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-100">
                                    <div>
                                      <p className="font-bold">{oItem.descricao} (Qtd: {oItem.quantidade})</p>
                                      <p className={bItem?.atendido ? 'text-green-600' : 'text-red-500 font-bold'}>
                                        {bItem?.atendido ? `R$ ${parseFloat(bItem.preco_unitario || 0).toFixed(2)} /unid` : 'Não possui em estoque'}
                                      </p>
                                    </div>
                                    <div className="flex gap-2">
                                      {oItem.imagem_url && (
                                        <div className="text-center">
                                          <p className="text-[10px] text-slate-400">Cliente</p>
                                          <img 
                                            src={oItem.imagem_url} 
                                            alt="Cliente" 
                                            onClick={() => setActiveImage(oItem.imagem_url)}
                                            className="w-9 h-9 object-cover rounded border border-slate-200 cursor-pointer hover:opacity-80 transition" 
                                          />
                                        </div>
                                      )}
                                      {bItem?.imagem_url && (
                                        <div className="text-center">
                                          <p className="text-[10px] text-teal-600 font-bold">Lojista</p>
                                          <img 
                                            src={bItem.imagem_url} 
                                            alt="Lojista" 
                                            onClick={() => setActiveImage(bItem.imagem_url)}
                                            className="w-9 h-9 object-cover rounded border border-teal-500 cursor-pointer hover:opacity-80 transition" 
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal de Ampliação de Foto */}
        {activeImage && (
          <div 
            className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setActiveImage(null)}
          >
            <div 
              className="relative max-w-3xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2 flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setActiveImage(null)}
                className="absolute top-3 right-3 bg-slate-800 text-white w-9 h-9 rounded-full flex items-center justify-center font-bold hover:bg-slate-900 transition shadow-md z-10"
              >
                ✕
              </button>
              <img 
                src={activeImage} 
                alt="Visualização ampliada" 
                className="max-w-full max-h-[80vh] object-contain rounded-xl"
              />
            </div>
          </div>
        )}

        {/* Modal de Edição dos Dados do Cliente */}
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200 space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-800">Meus Dados</h3>
                <button type="button" onClick={() => setIsProfileModalOpen(false)} className="text-slate-400 font-bold text-lg">✕</button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">E-mail (Não editável)</label>
                <input 
                  type="email" 
                  value={userEmail} 
                  disabled 
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Nome Completo</label>
                <input 
                  type="text" 
                  value={nome} 
                  onChange={(e) => setNome(e.target.value)} 
                  placeholder="Seu nome"
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Telefone / WhatsApp</label>
                <input 
                  type="text" 
                  value={telefone} 
                  onChange={(e) => setTelefone(e.target.value)} 
                  placeholder="(22) 99999-9999"
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Cidade</label>
                <select
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white text-sm focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Selecione sua cidade...</option>
                  {cities.map((c) => (
                    <option key={c.id || c.nome} value={c.nome}>{c.nome}</option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-3 pt-4 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsProfileModalOpen(false)}
                  className="w-1/2 bg-slate-200 text-slate-700 p-2.5 rounded-xl font-semibold hover:bg-slate-300 transition text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="w-1/2 bg-teal-600 text-white p-2.5 rounded-xl font-semibold hover:bg-teal-700 transition shadow-sm text-sm"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}