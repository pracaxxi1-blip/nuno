import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.svg';

export default function ClientDashboard() {
  const [orders, setOrders] = useState([]);
  const [bidsByOrder, setBidsByOrder] = useState({});
  const [bidItemsMap, setBidItemsMap] = useState({});
  const [orderItemsMap, setOrderItemsMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Filtros e Busca
  const [statusFilter, setStatusFilter] = useState('todas');
  const [searchTerm, setSearchTerm] = useState('');

  // Modais e Detalhes
  const [showDetails, setShowDetails] = useState({});
  const [activeImage, setActiveImage] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Dados do Perfil
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
    try {
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

          const { data: itemsData } = await supabase
            .from('order_items')
            .select('*')
            .in('order_id', orderIds);

          const oItemsMap = {};
          (itemsData || []).forEach(item => {
            if (!oItemsMap[item.order_id]) oItemsMap[item.order_id] = [];
            oItemsMap[item.order_id].push(item);
          });
          setOrderItemsMap(oItemsMap);

          const { data: bidsData } = await supabase
            .from('bids')
            .select('*')
            .in('order_id', orderIds);

          if (bidsData && bidsData.length > 0) {
            const bidIds = bidsData.map(b => b.id);
            const { data: bItemsData } = await supabase
              .from('bid_items')
              .select('*')
              .in('bid_id', bidIds);

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
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
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
    const confirm = window.confirm('Deseja realmente confirmar esta proposta? Ao confirmar, o lojista receberá seus dados para finalizar a entrega.');
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

  const filteredOrders = orders.filter(order => {
    const orderBids = bidsByOrder[String(order.id)] || [];
    const tempo = getRemainingTime(order.expira_em);
    const hasAcceptedBid = orderBids.some(b => b.status === 'Aceito');

    if (statusFilter === 'confirmadas' && !hasAcceptedBid) return false;
    if (statusFilter === 'em_aberto' && (hasAcceptedBid || tempo.expirado)) return false;
    if (statusFilter === 'encerradas' && !tempo.expirado && !hasAcceptedBid) return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchCodigo = order.codigo_pedido?.toLowerCase().includes(term);
      const matchDesc = order.descricao?.toLowerCase().includes(term);
      const items = orderItemsMap[order.id] || [];
      const matchItem = items.some(i => i.descricao?.toLowerCase().includes(term));

      if (!matchCodigo && !matchDesc && !matchItem) return false;
    }

    return true;
  });

  return (
    <div className="bg-[#f8f9fa] text-slate-700 min-h-screen flex flex-col justify-between font-sans">
      
      {/* Cabeçalho Principal (Header) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          
          {/* Logo Apenas Imagem (Sem texto) */}
          <Link to="/" className="flex items-center hover:opacity-90 transition">
            <img src={logo} alt="Logo" className="h-10 w-auto object-contain" />
          </Link>

          {/* Menu / Perfil */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {userEmail || 'cliente@nunoselo.com'}
            </div>

            {/* Botão Meus Dados no Cabeçalho */}
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
            >
              Meus Dados
            </button>

            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6 flex-1">

        {/* Card de Boas-vindas com Botão de Nova Cotação Maior */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Painel do Cliente</h1>
            <p className="text-sm text-slate-500 mt-0.5">Gerencie suas cotações e orçamentos recebidos</p>
          </div>
          
          <Link
            to="/create-request"
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-6 py-3.5 rounded-2xl text-sm sm:text-base font-extrabold transition shadow-md hover:shadow-indigo-200 flex items-center justify-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Nova Cotação
          </Link>
        </div>

        {/* Filtros e Busca */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 overflow-x-auto">
            <button
              onClick={() => setStatusFilter('todas')}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === 'todas' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-50'}`}
            >
              Todas ({orders.length})
            </button>
            <button
              onClick={() => setStatusFilter('em_aberto')}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === 'em_aberto' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-50'}`}
            >
              Em Aberto
            </button>
            <button
              onClick={() => setStatusFilter('confirmadas')}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === 'confirmadas' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-50'}`}
            >
              Confirmadas
            </button>
            <button
              onClick={() => setStatusFilter('encerradas')}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === 'encerradas' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-50'}`}
            >
              Encerradas
            </button>
          </div>

          <div className="relative min-w-[240px]">
            <input
              type="text"
              placeholder="Buscar por pedido ou item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
          </div>
        </div>

        {/* Lista de Cotações */}
        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-500 text-sm border border-slate-200">
            Carregando cotações...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-500 text-sm border border-slate-200">
            Nenhuma cotação encontrada para este filtro.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const orderBids = bidsByOrder[String(order.id)] || [];
              const items = orderItemsMap[order.id] || [];
              const tempo = getRemainingTime(order.expira_em);

              return (
                <div key={order.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
                  
                  {/* Cabeçalho do Pedido */}
                  <div className="flex flex-wrap justify-between items-start gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                          Pedido #{order.codigo_pedido || order.id}
                        </span>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                          tempo.expirado ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'
                        }`}>
                          ⏱️ {tempo.texto}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-slate-800 mt-2">{order.descricao}</h2>
                    </div>
                    <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
                      {order.status || 'Aguardando Moderação'}
                    </span>
                  </div>

                  {/* Lista de Propostas */}
                  <div className="space-y-3">
                    {orderBids.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-2">
                        {tempo.expirado ? 'Nenhuma proposta foi enviada durante o prazo.' : 'Aguardando propostas dos lojistas...'}
                      </p>
                    ) : (
                      orderBids.map((bid, index) => {
                        const total = (parseFloat(bid.preco || 0)) + (parseFloat(bid.frete || 0));
                        const bItems = bidItemsMap[bid.id] || [];
                        const isAccepted = bid.status === 'Aceito';

                        return (
                          <div
                            key={bid.id}
                            className={`p-4 rounded-xl border ${
                              isAccepted 
                                ? 'border-emerald-200 bg-emerald-50/40' 
                                : bid.is_completo 
                                  ? 'border-slate-200 bg-slate-50/70' 
                                  : 'border-amber-200 bg-amber-50/40'
                            } space-y-3`}
                          >
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-600">Opção #{index + 1}</span>
                                  {bid.is_completo ? (
                                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                                      Atendimento 100%
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                                      Atendimento Parcial
                                    </span>
                                  )}
                                </div>
                                <p className="text-xl font-bold text-slate-900 mt-1">
                                  Total: R$ {total.toFixed(2)}{' '}
                                  <span className="text-xs text-slate-500 font-normal">
                                    (Frete R$ {parseFloat(bid.frete || 0).toFixed(2)})
                                  </span>
                                </p>
                              </div>

                              <div className="flex items-center gap-2.5">
                                <button
                                  onClick={() => toggleDetails(bid.id)}
                                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                                >
                                  {showDetails[bid.id] ? 'Ocultar Itens' : 'Ver Detalhes / Fotos'}
                                </button>
                                
                                {isAccepted ? (
                                  <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full flex items-center gap-1">
                                    ✓ Proposta Confirmada
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleAcceptBid(bid.id)}
                                    className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm"
                                  >
                                    Confirmar Proposta
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Detalhes Expansíveis dos Itens */}
                            {showDetails[bid.id] && (
                              <div className="pt-3 border-t border-slate-200 space-y-2">
                                {items.map((oItem) => {
                                  const bItem = bItems.find(bi => bi.order_item_id === oItem.id);
                                  return (
                                    <div
                                      key={oItem.id}
                                      className="text-xs text-slate-700 flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs"
                                    >
                                      <div>
                                        <p className="font-bold text-slate-800">{oItem.descricao} (Qtd: {oItem.quantidade})</p>
                                        <p className={`font-semibold mt-0.5 ${bItem?.atendido ? 'text-emerald-600' : 'text-rose-600 font-bold'}`}>
                                          {bItem?.atendido ? `R$ ${parseFloat(bItem.preco_unitario || 0).toFixed(2)} / unid` : 'Item indisponível'}
                                        </p>
                                      </div>

                                      <div className="flex gap-2">
                                        {oItem.imagem_url && (
                                          <div className="text-center">
                                            <p className="text-[10px] text-slate-400 font-medium mb-1">Cliente</p>
                                            <img
                                              src={oItem.imagem_url}
                                              alt="Cliente"
                                              onClick={() => setActiveImage(oItem.imagem_url)}
                                              className="w-9 h-9 object-cover rounded-lg border border-indigo-100 cursor-pointer hover:opacity-80 transition"
                                            />
                                          </div>
                                        )}
                                        {bItem?.imagem_url && (
                                          <div className="text-center">
                                            <p className="text-[10px] text-indigo-600 font-bold mb-1">Lojista</p>
                                            <img
                                              src={bItem.imagem_url}
                                              alt="Lojista"
                                              onClick={() => setActiveImage(bItem.imagem_url)}
                                              className="w-9 h-9 object-cover rounded-lg border border-indigo-200 cursor-pointer hover:opacity-80 transition"
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
        )}

      </main>

      {/* Rodapé Institucional */}
      <footer className="mt-12 bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="flex flex-wrap justify-center items-center gap-2 mb-1.5 text-slate-600 font-medium">
          <a href="#" className="hover:underline">Central de Ajuda</a>
          <span>•</span>
          <a href="#" className="hover:underline">Termos de Uso</a>
          <span>•</span>
          <a href="#" className="hover:underline">Privacidade</a>
        </div>
        <div>nunoselo.com — 2026 © Todos os direitos reservados</div>
      </footer>

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
                className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500"
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
                className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Cidade</label>
              <select
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
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
                className="w-1/2 bg-indigo-600 text-white p-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition shadow-sm text-sm"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
