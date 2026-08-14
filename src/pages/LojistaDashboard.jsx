import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import { uploadImageToStorage } from '../utils/uploadImage';
import logo from '../assets/logo.svg';

export default function LojistaDashboard() {
  const [orders, setOrders] = useState([]);
  const [acceptedBids, setAcceptedBids] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [bidItemsData, setBidItemsData] = useState([]);
  const [frete, setFrete] = useState('');
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(true);

  // Filtros e Busca
  const [statusFilter, setStatusFilter] = useState('todas'); // 'todas', 'urgentes', 'confirmadas'
  const [searchTerm, setSearchTerm] = useState('');

  // Modais e Imagens
  const [activeImage, setActiveImage] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [uploadingImageIndex, setUploadingImageIndex] = useState(null);

  const [now, setNow] = useState(Date.now());
  const [newOrderAlert, setNewOrderAlert] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      console.error('Erro áudio:', e);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchLojistaData();

    const channel = supabase
      .channel('realtime-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
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
    setLoading(true);
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
    setLoading(false);
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

  const handleLojistaImage = async (index, file) => {
    if (!file) return;
    try {
      setUploadingImageIndex(index);
      const url = await uploadImageToStorage(file, 'lojista');
      handleBidItemChange(index, 'imagem_url', url);
    } catch (err) {
      alert('Erro no envio da foto: ' + err.message);
    } finally {
      setUploadingImageIndex(null);
    }
  };

  const handleSendBid = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;

    if (uploadingImageIndex !== null) {
      alert('Aguarde o upload da foto ser concluído.');
      return;
    }

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

  // Filtragem
  const filteredOrders = orders.filter(order => {
    if (statusFilter === 'urgentes' && order.prazo_opcao !== 'urgente') return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchCodigo = order.codigo_pedido?.toLowerCase().includes(term);
      const matchDesc = order.descricao?.toLowerCase().includes(term);
      const matchBairro = order.bairro?.toLowerCase().includes(term);
      const matchCidade = order.cidade_nome_exibicao?.toLowerCase().includes(term);
      if (!matchCodigo && !matchDesc && !matchBairro && !matchCidade) return false;
    }

    return true;
  });

  return (
    <div className="bg-[#f8f9fa] text-slate-700 min-h-screen flex flex-col justify-between font-sans">
      
      {/* Cabeçalho Principal */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          
          {/* Logo */}
          <Link to="/" className="flex items-center hover:opacity-90 transition">
            <img src={logo} alt="Logo" className="h-10 w-auto object-contain" />
          </Link>

          {/* Menu / Perfil */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {profile?.nome || userEmail || 'Lojista'}
            </div>

            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-sm"
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

        {/* Alerta Visual de Novo Pedido em Tempo Real */}
        {newOrderAlert && (
          <div className="bg-amber-500 text-white p-4 rounded-2xl shadow-lg font-bold text-center animate-bounce flex items-center justify-center gap-2 text-sm">
            <span>🔔</span> Nova cotação recebida agora! A lista foi atualizada automaticamente.
          </div>
        )}

        {/* Card de Boas-Vindas */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Painel do Lojista</h1>
            <p className="text-sm text-slate-500 mt-0.5">Acompanhe e envie orçamentos para cotações da sua região</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-xl">
              {orders.length} cotações ativas
            </span>
            <span className="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl">
              {acceptedBids.length} vendas fechadas
            </span>
          </div>
        </div>

        {/* Seção de Vendas Confirmadas */}
        {acceptedBids.length > 0 && (
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎉</span>
              <h2 className="text-lg font-bold text-emerald-900">Vendas Confirmadas ({acceptedBids.length})</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {acceptedBids.map((bid) => (
                <div key={bid.id} className="bg-white p-4 rounded-xl border border-emerald-200/80 shadow-xs flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                        Pedido #{bid.pedido?.codigo_pedido || bid.pedido?.id}
                      </span>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        Confirmado
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-800 mt-2 text-sm">{bid.pedido?.descricao}</h3>
                    <p className="text-xs text-slate-600 mt-1"><b>Cliente:</b> {bid.pedido?.cliente?.nome || 'Cliente'}</p>
                    <p className="text-xs text-slate-600"><b>WhatsApp:</b> {bid.pedido?.cliente?.telefone || 'Não informado'}</p>
                  </div>

                  {bid.pedido?.cliente?.telefone && (
                    <a
                      href={`https://wa.me/55${bid.pedido?.cliente?.telefone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-2 px-3 rounded-xl text-xs font-bold transition text-center flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <span>💬</span> Chamar no WhatsApp
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
              onClick={() => setStatusFilter('urgentes')}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === 'urgentes' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-50'}`}
            >
              🔴 Urgentes (1h)
            </button>
          </div>

          <div className="relative min-w-[240px]">
            <input
              type="text"
              placeholder="Buscar por pedido, item ou bairro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
          </div>
        </div>

        {/* Lista de Cotações Disponíveis */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-2xl p-8 text-center text-slate-500 text-sm border border-slate-200">
              Carregando cotações disponíveis...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-slate-500 text-sm border border-slate-200">
              Nenhuma cotação disponível no momento para suas categorias e filtros.
            </div>
          ) : (
            filteredOrders.map((order) => {
              const tempo = getRemainingTime(order.expira_em);

              return (
                <div key={order.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                          Pedido #{order.codigo_pedido || order.id}
                        </span>

                        {order.prazo_opcao === 'urgente' && (
                          <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md animate-pulse">
                            🔴 URGENTE (1h)
                          </span>
                        )}

                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                          tempo.expirado ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'
                        }`}>
                          ⏱️ {tempo.texto}
                        </span>
                      </div>

                      <h2 className="text-lg font-bold text-slate-800 mt-2">{order.descricao}</h2>
                      <p className="text-xs text-slate-500">
                        <b>Categoria:</b> {order.categoria_nome_exibicao} | <b>Cidade:</b> {order.cidade_nome_exibicao} {order.bairro && `(${order.bairro})`}
                      </p>
                    </div>

                    <div>
                      {tempo.expirado ? (
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-4 py-2.5 rounded-xl cursor-not-allowed inline-block">
                          Prazo Encerrado
                        </span>
                      ) : (
                        <button
                          onClick={() => openBidModal(order)}
                          className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center gap-1.5"
                        >
                          Preencher Orçamento
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

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

      {/* Modal de Preenchimento de Proposta */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSendBid} className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Preencher Orçamento — Pedido #{selectedOrder.codigo_pedido || selectedOrder.id}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedOrder.descricao}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Itens do Pedido */}
            <div className="space-y-3">
              {orderItems.map((oItem, idx) => (
                <div key={oItem.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{oItem.descricao} (Qtd: {oItem.quantidade})</p>
                      {oItem.imagem_url && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 font-semibold">Foto do Cliente:</span>
                          <img
                            src={oItem.imagem_url}
                            alt="Cliente"
                            onClick={() => setActiveImage(oItem.imagem_url)}
                            className="w-10 h-10 object-cover rounded-lg border border-indigo-100 cursor-pointer hover:opacity-80 transition"
                          />
                        </div>
                      )}
                    </div>

                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bidItemsData[idx]?.atendido}
                        onChange={(e) => handleBidItemChange(idx, 'atendido', e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                      Tenho em estoque
                    </label>
                  </div>

                  {bidItemsData[idx]?.atendido && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Preço Unitário (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={bidItemsData[idx]?.preco_unitario}
                          onChange={(e) => handleBidItemChange(idx, 'preco_unitario', e.target.value)}
                          placeholder="0,00"
                          className="w-full p-2 bg-white rounded-xl border border-slate-300 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Sua Foto do Produto (Opcional)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleLojistaImage(idx, e.target.files[0])}
                            className="text-xs text-slate-500 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300"
                          />
                          {uploadingImageIndex === idx && <span className="text-xs text-indigo-600">Enviando...</span>}
                          {bidItemsData[idx]?.imagem_url && (
                            <img
                              src={bidItemsData[idx].imagem_url}
                              alt="Sua foto"
                              onClick={() => setActiveImage(bidItemsData[idx].imagem_url)}
                              className="w-8 h-8 object-cover rounded-lg border border-indigo-200 cursor-pointer hover:opacity-80 transition"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Frete e Observações */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Valor do Frete (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={frete}
                  onChange={(e) => setFrete(e.target.value)}
                  placeholder="0,00 (deixe 0 se for grátis)"
                  className="w-full p-2.5 bg-white rounded-xl border border-slate-300 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Observações</label>
                <input
                  type="text"
                  placeholder="Ex: Marcas, garantia, prazo de entrega..."
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="w-full p-2.5 bg-white rounded-xl border border-slate-300 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
                />
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex gap-2.5 pt-3">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="w-1/2 py-2.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-300 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-1/2 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition shadow-sm shadow-indigo-200"
              >
                Confirmar e Enviar Orçamento
              </button>
            </div>
          </form>
        </div>
      )}

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
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">E-mail de Acesso</p>
                <p className="font-medium text-slate-800">{userEmail || 'Não informado'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cidade</p>
                <p className="font-medium text-slate-800">{profile?.cidade || 'Não informada'}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white p-2.5 rounded-xl font-semibold transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
