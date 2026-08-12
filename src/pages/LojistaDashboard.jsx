import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function LojistaDashboard() {
  const [orders, setOrders] = useState([]);
  const [acceptedBids, setAcceptedBids] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [bidItemsData, setBidItemsData] = useState([]);
  const [frete, setFrete] = useState('');
  const [observacao, setObservacao] = useState('');

  const [activeImage, setActiveImage] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [userEmail, setUserEmail] = useState('');

  const [now, setNow] = useState(Date.now());
  const [newOrderAlert, setNewOrderAlert] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  // Gerador de Som para Alerta de Novo Pedido (Web Audio API)
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // Nota A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      console.error('Erro áudio:', e);
    }
  };

  // Atualiza relógio a cada segundo para o cronômetro
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Escuta novas cotações via Supabase Realtime
  useEffect(() => {
    fetchLojistaData();

    const channel = supabase
      .channel('realtime-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        playBeep();
        setNewOrderAlert(true);
        fetchLojistaData();
        setTimeout(() => setNewOrderAlert(false), 5000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchLojistaData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserEmail(user.email || '');

      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (profileData) setProfile(profileData);

      const { data: allowedCategories } = await supabase.from('lojista_categorias').select('categoria_id').eq('lojista_id', user.id);
      const categoryIds = allowedCategories?.map(c => c.categoria_id) || [];

      if (categoryIds.length > 0) {
        const { data: catsData } = await supabase.from('categories').select('*');
        const { data: citiesData } = await supabase.from('cities').select('*');

        const catsMap = new Map((catsData || []).map(c => [String(c.id), c.nome]));
        const citiesMap = new Map((citiesData || []).map(c => [String(c.id), c.nome]));

        const { data: ordersData } = await supabase
          .from('orders')
          .select('*')
          .in('categoria_id', categoryIds)
          .order('created_at', { ascending: false });

        if (ordersData) {
          const formatted = ordersData.map(o => ({
            ...o,
            categoria_nome_exibicao: catsMap.get(String(o.categoria_id)) || 'Geral',
            cidade_nome_exibicao: citiesMap.get(String(o.cidade_id)) || 'Não informada'
          }));
          setOrders(formatted);
        }
      }

      // Vendas Confirmadas
      const { data: bidsAceitos } = await supabase.from('bids').select('*').eq('lojista_id', user.id).eq('status', 'Aceito');

      if (bidsAceitos && bidsAceitos.length > 0) {
        const rawOrderIds = bidsAceitos.map(b => b.order_id || b.pedido_id).filter(Boolean);
        const numericOrderIds = rawOrderIds.map(id => Number(id)).filter(id => !isNaN(id));

        let ordersAceitos = [];
        if (numericOrderIds.length > 0) {
          const { data: oData } = await supabase.from('orders').select('*').in('id', numericOrderIds);
          if (oData) ordersAceitos = oData;
        }

        const clientIds = ordersAceitos.map(o => o.cliente_id).filter(Boolean);
        let clientProfiles = [];
        if (clientIds.length > 0) {
          const { data: pData } = await supabase.from('profiles').select('id, nome, telefone').in('id', clientIds);
          if (pData) clientProfiles = pData;
        }

        const clientMap = new Map(clientProfiles.map(p => [String(p.id), p]));
        const orderMap = new Map(ordersAceitos.map(o => [String(o.id), { ...o, cliente: clientMap.get(String(o.cliente_id)) }]));

        const formattedBids = bidsAceitos.map(b => ({
          ...b,
          pedido: orderMap.get(String(b.order_id || b.pedido_id))
        }));

        setAcceptedBids(formattedBids);
      }
    } catch (err) {
      console.error('Erro:', err);
    }
  }

  const openBidModal = async (order) => {
    setSelectedOrder(order);
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
    
    setOrderItems(items || []);
    setBidItemsData((items || []).map(item => ({
      order_item_id: item.id,
      preco_unitario: '',
      atendido: true,
      imagem_url: ''
    })));
  };

  const handleBidItemChange = (index, field, value) => {
    const updated = [...bidItemsData];
    updated[index][field] = value;
    setBidItemsData(updated);
  };

  const handleLojistaImage = (index, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      handleBidItemChange(index, 'imagem_url', reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSendBid = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      let totalProdutos = 0;
      let atendeuTodos = true;

      bidItemsData.forEach((bItem, idx) => {
        if (bItem.atendido) {
          const qtd = orderItems[idx]?.quantidade || 1;
          totalProdutos += (parseFloat(bItem.preco_unitario || 0) * qtd);
        } else {
          atendeuTodos = false;
        }
      });

      const { data: newBid, error: bidErr } = await supabase
        .from('bids')
        .insert([{
          order_id: selectedOrder.id,
          pedido_id: selectedOrder.id,
          lojista_id: user?.id,
          preco: totalProdutos,
          valor: totalProdutos,
          frete: parseFloat(frete || 0),
          observacao: observacao,
          status: 'Enviado',
          is_completo: atendeuTodos
        }])
        .select()
        .single();

      if (bidErr) throw bidErr;

      const itemsToInsert = bidItemsData.map(bItem => ({
        bid_id: newBid.id,
        order_item_id: bItem.order_item_id,
        preco_unitario: parseFloat(bItem.preco_unitario || 0),
        atendido: bItem.atendido,
        imagem_url: bItem.imagem_url
      }));

      await supabase.from('bid_items').insert(itemsToInsert);

      alert('Orçamento enviado com sucesso!');
      setSelectedOrder(null);
      setFrete('');
      setObservacao('');
      fetchLojistaData();
    } catch (err) {
      alert('Erro ao enviar orçamento: ' + err.message);
    }
  };

  // Helper de Formatação do Cronômetro
  const getRemainingTime = (expiraEm) => {
    if (!expiraEm) return { texto: 'Sem prazo', expirado: false };
    const diff = new Date(expiraEm).getTime() - now;
    if (diff <= 0) return { texto: 'Prazo Expirado', expirado: true };

    const horas = Math.floor(diff / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((diff % (1000 * 60)) / 1000);

    if (horas > 0) {
      return { texto: `${horas}h ${minutos}m restantes`, expirado: false };
    }
    return { texto: `${minutos}m ${segundos}s restantes`, expirado: false };
  };

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Alerta Visual de Novo Pedido */}
        {newOrderAlert && (
          <div className="bg-amber-500 text-white p-4 rounded-2xl shadow-lg font-bold text-center animate-bounce flex items-center justify-center gap-2">
            <span>🔔</span> Nova cotação recebida agora mesmo! Verifique a lista.
          </div>
        )}

        {/* Cabeçalho */}
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Painel do Lojista</h2>
            <p className="text-sm text-slate-500">Cotações das Suas Categorias</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setIsProfileModalOpen(true)} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-semibold">Meus Dados</button>
            <button onClick={handleLogout} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold">Sair</button>
          </div>
        </div>

        {/* Vendas Confirmadas */}
        {acceptedBids.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 space-y-3">
            <h3 className="text-xl font-bold text-green-800">🎉 Vendas Confirmadas</h3>
            {acceptedBids.map((bid) => (
              <div key={bid.id} className="bg-white p-4 rounded-xl border border-green-200 flex justify-between items-center">
                <div>
                  <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded">Pedido #{bid.pedido?.codigo_pedido || bid.pedido?.id}</span>
                  <p className="font-bold text-slate-800 mt-1">{bid.pedido?.descricao}</p>
                  <p className="text-sm text-slate-600">Cliente: {bid.pedido?.cliente?.nome || 'Cliente'}</p>
                  <p className="text-sm text-teal-700 font-bold">WhatsApp: {bid.pedido?.cliente?.telefone}</p>
                </div>
                {bid.pedido?.cliente?.telefone && (
                  <a href={`https://wa.me/55${bid.pedido?.cliente?.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">Chamar no WhatsApp</a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Cotações Disponíveis */}
        <div className="bg-white shadow-xl rounded-2xl border border-slate-200 p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-4">Cotações Disponíveis</h3>
          <ul className="divide-y divide-slate-100">
            {orders.map((order) => {
              const tempo = getRemainingTime(order.expira_em);

              return (
                <li key={order.id} className="py-4 flex justify-between items-center gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded">
                        Pedido #{order.codigo_pedido || order.id}
                      </span>
                      {order.prazo_opcao === 'urgente' && (
                        <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded animate-pulse">
                          🔴 URGENTE (1h)
                        </span>
                      )}
                    </div>
                    
                    <p className="font-semibold text-slate-800 text-lg mt-1">{order.descricao}</p>
                    <p className="text-sm text-slate-600">Cidade: {order.cidade_nome_exibicao} | Bairro: {order.bairro}</p>
                    
                    <div className="pt-1">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tempo.expirado ? 'bg-slate-200 text-slate-500' : 'bg-amber-100 text-amber-800'}`}>
                        ⏱️ {tempo.texto}
                      </span>
                    </div>
                  </div>

                  {tempo.expirado ? (
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-4 py-2 rounded-lg cursor-not-allowed">
                      Prazo Encerrado
                    </span>
                  ) : (
                    <button 
                      onClick={() => openBidModal(order)} 
                      className="bg-teal-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-teal-700 transition"
                    >
                      Preencher Orçamento
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Modal Envio Proposta */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <form onSubmit={handleSendBid} className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
              <h3 className="text-xl font-bold text-slate-800">Preencher Proposta para Pedido #{selectedOrder.codigo_pedido || selectedOrder.id}</h3>

              <div className="space-y-4">
                {orderItems.map((oItem, idx) => (
                  <div key={oItem.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-slate-800">{oItem.descricao} (Qtd: {oItem.quantidade})</p>
                        {oItem.imagem_url && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-slate-500 font-semibold">Foto do Cliente:</span>
                            <img 
                              src={oItem.imagem_url} 
                              alt="Cliente" 
                              onClick={() => setActiveImage(oItem.imagem_url)}
                              className="w-12 h-12 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition" 
                            />
                          </div>
                        )}
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bidItemsData[idx]?.atendido}
                          onChange={(e) => handleBidItemChange(idx, 'atendido', e.target.checked)}
                          className="w-4 h-4 text-teal-600 rounded"
                        />
                        Tenho em estoque
                      </label>
                    </div>

                    {bidItemsData[idx]?.atendido && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600">Preço Unitário (R$)</label>
                          <input
                            type="number" step="0.01" required
                            value={bidItemsData[idx]?.preco_unitario}
                            onChange={(e) => handleBidItemChange(idx, 'preco_unitario', e.target.value)}
                            className="w-full p-2 rounded-lg border border-slate-300 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600">Sua Foto do Produto (Opcional)</label>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="file" accept="image/*"
                              onChange={(e) => handleLojistaImage(idx, e.target.files[0])}
                              className="text-xs text-slate-500 file:py-1 file:px-2 file:rounded-md file:border-0 file:bg-slate-200"
                            />
                            {bidItemsData[idx]?.imagem_url && (
                              <img 
                                src={bidItemsData[idx].imagem_url} 
                                alt="Sua foto" 
                                onClick={() => setActiveImage(bidItemsData[idx].imagem_url)}
                                className="w-9 h-9 object-cover rounded-lg border border-teal-500 cursor-pointer hover:opacity-80 transition" 
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Frete Total (R$)</label>
                  <input type="number" step="0.01" value={frete} onChange={(e) => setFrete(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-300" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Observações</label>
                  <input type="text" placeholder="Validade, marcas..." value={observacao} onChange={(e) => setObservacao(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-300" />
                </div>
              </div>

              <div className="flex space-x-3 pt-3">
                <button type="button" onClick={() => setSelectedOrder(null)} className="w-1/2 bg-slate-200 text-slate-700 p-2.5 rounded-xl font-semibold">Cancelar</button>
                <button type="submit" className="w-1/2 bg-teal-600 text-white p-2.5 rounded-xl font-semibold">Confirmar Envio</button>
              </div>
            </form>
          </div>
        )}

        {/* Modal Ampliação de Imagem */}
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

        {/* Modal de Dados do Lojista */}
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200 space-y-5">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-800">Meus Dados</h3>
                <button onClick={() => setIsProfileModalOpen(false)} className="text-slate-400 font-bold text-lg">✕</button>
              </div>

              <div className="space-y-4 text-sm text-slate-700">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nome da Loja</p>
                  <p className="font-bold text-slate-800 text-base">{profile?.nome || 'Não informado'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">E-mail</p>
                  <p className="font-medium text-slate-800">{userEmail || 'Não informado'}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="w-full bg-slate-800 text-white p-2.5 rounded-xl font-semibold hover:bg-slate-900 transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}