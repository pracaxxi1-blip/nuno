import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('lojistas'); // 'lojistas' ou 'pedidos'

  // --- ESTADOS DA ABA LOJISTAS E CATEGORIAS ---
  const [lojistas, setLojistas] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedCityFilter, setSelectedCityFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Modais de Lojista e Categoria
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [novaCidade, setNovaCidade] = useState('');
  const [isNewCityCreate, setIsNewCityCreate] = useState(false);
  const [novoTelefone, setNovoTelefone] = useState('');
  const [novasCategoriasIds, setNovasCategoriasIds] = useState([]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLojistaId, setEditingLojistaId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editCidade, setEditCidade] = useState('');
  const [isNewCityEdit, setIsNewCityEdit] = useState(false);
  const [editTelefone, setEditTelefone] = useState('');

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatNome, setEditingCatNome] = useState('');

  // --- ESTADOS DA ABA COTAÇÕES E PROPOSTAS ---
  const [orders, setOrders] = useState([]);
  const [bidsByOrder, setBidsByOrder] = useState({});
  const [clients, setClients] = useState([]);
  const [stores, setStores] = useState([]);
  const [profilesMap, setProfilesMap] = useState(new Map());
  const [orderItemsMap, setOrderItemsMap] = useState({});
  const [bidItemsMap, setBidItemsMap] = useState({});

  // Filtros de Cotações
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modais de Imagem e Detalhes
  const [showDetails, setShowDetails] = useState({});
  const [activeImage, setActiveImage] = useState(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    setLoading(true);

    // 1. Perfis e Lojistas
    const { data: profilesData } = await supabase.from('profiles').select('*');
    const pMap = new Map((profilesData || []).map(p => [String(p.id), p]));
    setProfilesMap(pMap);

    const lojistasList = (profilesData || []).filter(p => p.tipo === 'lojista');
    setClients(profilesData || []);

    // 2. Categorias
    const { data: catsData } = await supabase.from('categories').select('*');
    const uniqueCategoriesMap = new Map();
    (catsData || []).forEach(cat => {
      const nomeChave = cat.nome?.trim().toLowerCase();
      if (nomeChave && !uniqueCategoriesMap.has(nomeChave)) {
        uniqueCategoriesMap.set(nomeChave, cat);
      }
    });

    // 3. Cidades
    const { data: citiesData } = await supabase.from('cities').select('*');
    const uniqueCitiesMap = new Map();
    (citiesData || []).forEach(c => {
      if (c.nome && !uniqueCitiesMap.has(c.nome.trim().toLowerCase())) {
        uniqueCitiesMap.set(c.nome.trim().toLowerCase(), c);
      }
    });
    const citiesMap = new Map((citiesData || []).map(c => [String(c.id), c.nome]));

    // 4. Vínculos Lojista-Categorias
    const { data: vinculosData } = await supabase.from('lojista_categorias').select('*');

    const formattedLojistas = lojistasList.map(lojista => {
      const catIds = (vinculosData || [])
        .filter(v => v.lojista_id === lojista.id)
        .map(v => v.categoria_id);

      return {
        ...lojista,
        categoriasSelecionadas: catIds,
        ativo: lojista.ativo ?? true
      };
    });

    setLojistas(formattedLojistas);
    setCategories(Array.from(uniqueCategoriesMap.values()));
    setCities(Array.from(uniqueCitiesMap.values()));

    // 5. Cotações e Itens
    const { data: ordersData } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    const { data: orderItemsData } = await supabase.from('order_items').select('*');
    
    const oItemsMap = {};
    (orderItemsData || []).forEach(item => {
      if (!oItemsMap[item.order_id]) oItemsMap[item.order_id] = [];
      oItemsMap[item.order_id].push(item);
    });
    setOrderItemsMap(oItemsMap);

    // 6. Busca de Propostas (Bids) por IDs dos Pedidos
    let bidsData = [];
    if (ordersData && ordersData.length > 0) {
      const orderIds = ordersData.map(o => o.id);
      
      const { data: bData } = await supabase.from('bids').select('*').in('order_id', orderIds);
      if (bData) bidsData = bData;

      // Fallback por pedido_id
      const { data: fallbackBids } = await supabase.from('bids').select('*').in('pedido_id', orderIds);
      if (fallbackBids && fallbackBids.length > 0) {
        fallbackBids.forEach(fb => {
          if (!bidsData.some(b => b.id === fb.id)) {
            bidsData.push(fb);
          }
        });
      }
    }

    // Busca itens de todas as propostas encontradas
    if (bidsData.length > 0) {
      const bidIds = bidsData.map(b => b.id);
      const { data: bidItemsData } = await supabase.from('bid_items').select('*').in('bid_id', bidIds);

      const bItemsMap = {};
      (bidItemsData || []).forEach(item => {
        if (!bItemsMap[item.bid_id]) bItemsMap[item.bid_id] = [];
        bItemsMap[item.bid_id].push(item);
      });
      setBidItemsMap(bItemsMap);
    }

    // Mapeamento Agrupado de Propostas por Pedido
    const groupedBids = {};
    bidsData.forEach(bid => {
      const key1 = bid.order_id ? String(bid.order_id) : null;
      const key2 = bid.pedido_id ? String(bid.pedido_id) : null;

      if (key1) {
        if (!groupedBids[key1]) groupedBids[key1] = [];
        if (!groupedBids[key1].some(b => b.id === bid.id)) groupedBids[key1].push(bid);
      }
      if (key2) {
        if (!groupedBids[key2]) groupedBids[key2] = [];
        if (!groupedBids[key2].some(b => b.id === bid.id)) groupedBids[key2].push(bid);
      }
    });
    setBidsByOrder(groupedBids);

    const lojistaIdsInBids = Array.from(new Set(bidsData.map(b => b.lojista_id).filter(Boolean)));
    setStores((profilesData || []).filter(p => lojistaIdsInBids.includes(p.id)));

    if (ordersData) {
      const formattedOrders = ordersData.map(o => ({
        ...o,
        cidade_nome_exibicao: citiesMap.get(String(o.cidade_id)) || o.cidade_id || 'Não informada',
        cliente: pMap.get(String(o.cliente_id))
      }));
      setOrders(formattedOrders);
    }

    setLoading(false);
  }

  // Helper de Cidades
  const saveCityIfNew = async (cityName) => {
    if (!cityName) return;
    const exists = cities.some(c => c.nome.toLowerCase() === cityName.trim().toLowerCase());
    if (!exists) {
      await supabase.from('cities').insert([{ nome: cityName.trim() }]);
    }
  };

  // Funções da Aba de Lojistas
  const handleToggleAtivo = async (lojistaId, statusAtual) => {
    const novoStatus = !statusAtual;
    const { error } = await supabase.from('profiles').update({ ativo: novoStatus }).eq('id', lojistaId);
    if (error) alert('Erro ao atualizar status: ' + error.message);
    else setLojistas(lojistas.map(l => l.id === lojistaId ? { ...l, ativo: novoStatus } : l));
  };

  const handleCategoryChange = async (lojistaId, catId) => {
    const lojista = lojistas.find(l => l.id === lojistaId);
    let novasCategorias = [...lojista.categoriasSelecionadas];

    if (novasCategorias.includes(catId)) {
      novasCategorias = novasCategorias.filter(id => id !== catId);
      await supabase.from('lojista_categorias').delete().eq('lojista_id', lojistaId).eq('categoria_id', catId);
    } else {
      novasCategorias.push(catId);
      await supabase.from('lojista_categorias').insert([{ lojista_id: lojistaId, categoria_id: catId }]);
    }

    setLojistas(lojistas.map(l => l.id === lojistaId ? { ...l, categoriasSelecionadas: novasCategorias } : l));
  };

  const handleCreateLojista = async (e) => {
    e.preventDefault();
    try {
      const supabaseUrl = supabase.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = supabase.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;

      const tempClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
      const { data: authData, error: authError } = await tempClient.auth.signUp({ email: novoEmail, password: novaSenha });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (novaCidade) await saveCityIfNew(novaCidade);

      await supabase.from('profiles').insert([{ id: userId, tipo: 'lojista', nome: novoNome, cidade: novaCidade, telefone: novoTelefone, ativo: true }]);

      if (novasCategoriasIds.length > 0) {
        const vinculos = novasCategoriasIds.map(catId => ({ lojista_id: userId, categoria_id: catId }));
        await supabase.from('lojista_categorias').insert(vinculos);
      }

      alert('Lojista cadastrado com sucesso!');
      setIsModalOpen(false);
      setNovoNome(''); setNovoEmail(''); setNovaSenha(''); setNovaCidade(''); setNovoTelefone(''); setNovasCategoriasIds([]);
      fetchAllData();
    } catch (err) {
      alert('Erro ao cadastrar lojista: ' + err.message);
    }
  };

  const handleSaveEditLojista = async (e) => {
    e.preventDefault();
    try {
      if (editCidade) await saveCityIfNew(editCidade);
      await supabase.from('profiles').update({ nome: editNome, cidade: editCidade, telefone: editTelefone }).eq('id', editingLojistaId);
      alert('Dados atualizados com sucesso!');
      setIsEditModalOpen(false);
      fetchAllData();
    } catch (err) {
      alert('Erro ao atualizar dados: ' + err.message);
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!novaCategoriaNome.trim()) return;
    try {
      await supabase.from('categories').insert([{ nome: novaCategoriaNome.trim() }]);
      alert('Categoria cadastrada com sucesso!');
      setNovaCategoriaNome('');
      fetchAllData();
    } catch (err) {
      alert('Erro ao cadastrar categoria: ' + err.message);
    }
  };

  const handleSaveEditCategory = async (catId) => {
    if (!editingCatNome.trim()) return;
    try {
      await supabase.from('categories').update({ nome: editingCatNome.trim() }).eq('id', catId);
      alert('Categoria atualizada com sucesso!');
      setEditingCatId(null);
      setEditingCatNome('');
      fetchAllData();
    } catch (err) {
      alert('Erro ao atualizar categoria: ' + err.message);
    }
  };

  // Filtro de Pedidos
  const filteredOrders = orders.filter(order => {
    if (selectedCity && String(order.cidade_id) !== String(selectedCity) && order.cidade_nome_exibicao !== selectedCity) return false;
    if (selectedClient && String(order.cliente_id) !== String(selectedClient)) return false;
    if (selectedStore) {
      const orderBids = bidsByOrder[String(order.id)] || [];
      if (!orderBids.some(b => String(b.lojista_id) === String(selectedStore))) return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchDesc = order.descricao?.toLowerCase().includes(term);
      const matchCodigo = order.codigo_pedido?.toLowerCase().includes(term);
      const matchCliente = order.cliente?.nome?.toLowerCase().includes(term);
      if (!matchDesc && !matchCodigo && !matchCliente) return false;
    }
    return true;
  });

  const toggleDetails = (id) => setShowDetails(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Painel do Administrador</h2>
            <p className="text-sm text-slate-500">Gerenciamento Geral da Plataforma</p>
          </div>
          <button onClick={handleLogout} className="bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-300 transition">
            Sair
          </button>
        </div>

        {/* Seleção de Abas */}
        <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
          <button
            onClick={() => setActiveTab('lojistas')}
            className={`flex-1 py-3 text-sm font-bold rounded-xl transition ${activeTab === 'lojistas' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Gestão de Lojistas & Categorias
          </button>
          <button
            onClick={() => setActiveTab('pedidos')}
            className={`flex-1 py-3 text-sm font-bold rounded-xl transition ${activeTab === 'pedidos' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Monitoramento de Pedidos & Propostas
          </button>
        </div>

        {/* ABA 1: GESTÃO DE LOJISTAS */}
        {activeTab === 'lojistas' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-3">
                <label className="text-sm font-bold text-slate-700">Filtrar por Cidade:</label>
                <select
                  value={selectedCityFilter}
                  onChange={(e) => setSelectedCityFilter(e.target.value)}
                  className="p-2 rounded-xl border border-slate-300 text-slate-800 bg-slate-50 text-sm font-medium"
                >
                  <option value="">Todas as Cidades ({lojistas.length})</option>
                  {cities.map((city) => (
                    <option key={city.id || city.nome} value={city.nome}>{city.nome}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsCategoryModalOpen(true)} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-semibold">Gerenciar Categorias</button>
                <button onClick={() => setIsModalOpen(true)} className="bg-teal-600 text-white px-4 py-2 rounded-xl text-xs font-semibold">+ Cadastrar Lojista</button>
              </div>
            </div>

            {loading ? <p className="text-center py-8 text-slate-500">Carregando...</p> : (
              <div className="space-y-4">
                {lojistas.filter(l => !selectedCityFilter || l.cidade?.toLowerCase() === selectedCityFilter.toLowerCase()).map((lojista) => (
                  <div key={lojista.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                      <h3 className="font-bold text-lg text-slate-800">{lojista.nome || 'Lojista'}</h3>
                      <p className="text-xs text-slate-500">Cidade: {lojista.cidade || 'Não informada'} | Tel: {lojista.telefone || 'Não informado'}</p>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full inline-block mt-2 ${lojista.ativo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {lojista.ativo ? 'Ativo (Liberado)' : 'Inadimplente (Bloqueado)'}
                      </span>
                    </div>

                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-500 mb-2">Categorias Atendidas:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {categories.map((cat) => (
                          <label key={cat.id} className="flex items-center space-x-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={lojista.categoriasSelecionadas.includes(cat.id)}
                              onChange={() => handleCategoryChange(lojista.id, cat.id)}
                              className="w-4 h-4 text-teal-600 rounded"
                            />
                            <span>{cat.nome}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button onClick={() => {
                        setEditingLojistaId(lojista.id);
                        setEditNome(lojista.nome || '');
                        setEditCidade(lojista.cidade || '');
                        setEditTelefone(lojista.telefone || '');
                        setIsEditModalOpen(true);
                      }} className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                        Editar Dados
                      </button>
                      <button onClick={() => handleToggleAtivo(lojista.id, lojista.ativo)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${lojista.ativo ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-600 text-white'}`}>
                        {lojista.ativo ? 'Bloquear Acesso' : 'Liberar Acesso'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA 2: MONITORAMENTO DE PEDIDOS */}
        {activeTab === 'pedidos' && (
          <div className="space-y-6">
            {/* Filtros */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cidade</label>
                <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-300 text-slate-900 bg-slate-50 text-sm">
                  <option value="">Todas as Cidades</option>
                  {cities.map((c) => <option key={c.id || c.nome} value={c.id || c.nome}>{c.nome}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cliente</label>
                <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-300 text-slate-900 bg-slate-50 text-sm">
                  <option value="">Todos os Clientes</option>
                  {clients.map((cli) => <option key={cli.id} value={cli.id}>{cli.nome || cli.email}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Lojista / Loja</label>
                <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-300 text-slate-900 bg-slate-50 text-sm">
                  <option value="">Todos os Lojistas</option>
                  {stores.map((st) => <option key={st.id} value={st.id}>{st.nome || st.email}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Buscar por Código / Nome</label>
                <input type="text" placeholder="Ex: #855-1..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-300 text-slate-900 bg-slate-50 text-sm" />
              </div>
            </div>

            {/* Lista de Cotações */}
            <div className="bg-white shadow-xl rounded-2xl border border-slate-200 p-6 space-y-4">
              <h3 className="text-xl font-bold text-slate-800">Cotações Encontradas ({filteredOrders.length})</h3>

              {filteredOrders.map((order) => {
                const orderBids = bidsByOrder[String(order.id)] || [];
                const orderItems = orderItemsMap[order.id] || [];

                return (
                  <div key={order.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-3 border-b border-slate-200">
                      <div>
                        <span className="text-xs font-bold text-teal-800 bg-teal-100 border border-teal-200 px-2.5 py-1 rounded-lg">
                          Pedido #{order.codigo_pedido || order.id}
                        </span>
                        <h4 className="text-lg font-bold text-slate-800 mt-2">{order.descricao}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Cliente: {order.cliente?.nome || 'Não informado'} | Tel: {order.cliente?.telefone || 'Não informado'} | Cidade: {order.cidade_nome_exibicao}</p>
                      </div>
                      <button onClick={() => toggleDetails(order.id)} className="text-xs font-bold text-teal-700 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-200">
                        {showDetails[order.id] ? 'Ocultar Detalhes' : `Ver Detalhes (${orderBids.length} Propostas)`}
                      </button>
                    </div>

                    {showDetails[order.id] && (
                      <div className="space-y-4 pt-2">
                        {/* Itens do Cliente */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                          <p className="text-xs font-bold text-slate-500 uppercase">Itens da Cotação:</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {orderItems.map((item) => (
                              <div key={item.id} className="flex justify-between items-center p-2 rounded bg-slate-50 border text-xs">
                                <span><b>{item.descricao}</b> (Qtd: {item.quantidade})</span>
                                {item.imagem_url && <img src={item.imagem_url} alt="Cliente" onClick={() => setActiveImage(item.imagem_url)} className="w-8 h-8 object-cover rounded border cursor-pointer hover:opacity-80" />}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Propostas */}
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-slate-500 uppercase">Propostas Enviadas:</p>
                          {orderBids.length === 0 ? <p className="text-xs text-slate-500 italic">Nenhuma proposta enviada ainda.</p> : orderBids.map((bid) => {
                            const lojista = profilesMap.get(String(bid.lojista_id));
                            const bItems = bidItemsMap[bid.id] || [];
                            const total = (parseFloat(bid.preco || 0)) + (parseFloat(bid.frete || 0));

                            return (
                              <div key={bid.id} className={`p-4 rounded-xl border ${bid.status === 'Aceito' ? 'border-green-300 bg-green-50/50' : 'border-slate-200 bg-white'} space-y-2`}>
                                <div className="flex justify-between items-center">
                                  <div>
                                    <p className="font-bold text-slate-800 text-sm">Loja: {lojista?.nome || `Lojista #${bid.lojista_id}`}</p>
                                    <p className="text-xs text-slate-500">Contato: {lojista?.telefone || 'Não informado'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-base font-extrabold text-slate-900">Total: R$ {total.toFixed(2)}</p>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${bid.status === 'Aceito' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>{bid.status}</span>
                                  </div>
                                </div>

                                {bItems.length > 0 && (
                                  <div className="pt-2 border-t border-slate-100 space-y-1">
                                    {bItems.map((bItem) => {
                                      const origItem = orderItems.find(i => i.id === bItem.order_item_id);
                                      return (
                                        <div key={bItem.id} className="text-[11px] flex justify-between items-center bg-slate-50 p-2 rounded">
                                          <span><b>{origItem?.descricao || 'Item'}:</b> {bItem.atendido ? `R$ ${parseFloat(bItem.preco_unitario || 0).toFixed(2)}` : 'Indisponível'}</span>
                                          {bItem.imagem_url && <img src={bItem.imagem_url} alt="Lojista" onClick={() => setActiveImage(bItem.imagem_url)} className="w-6 h-6 object-cover rounded border cursor-pointer hover:opacity-80" />}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal Ampliação de Imagem */}
        {activeImage && (
          <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setActiveImage(null)}>
            <div className="relative max-w-3xl max-h-[90vh] bg-white rounded-2xl overflow-hidden p-2" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => setActiveImage(null)} className="absolute top-3 right-3 bg-slate-800 text-white w-8 h-8 rounded-full font-bold">✕</button>
              <img src={activeImage} alt="Ampliada" className="max-w-full max-h-[80vh] object-contain rounded-xl" />
            </div>
          </div>
        )}

        {/* Modal de Cadastro de Lojista */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <form onSubmit={handleCreateLojista} className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-slate-800">Cadastrar Novo Lojista</h3>
              <input type="text" placeholder="Nome da Loja" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} className="w-full p-2.5 rounded-lg border text-sm" required />
              <input type="email" placeholder="E-mail" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} className="w-full p-2.5 rounded-lg border text-sm" required />
              <input type="password" placeholder="Senha Inicial" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} className="w-full p-2.5 rounded-lg border text-sm" required />
              <input type="text" placeholder="Cidade" value={novaCidade} onChange={(e) => setNovaCidade(e.target.value)} className="w-full p-2.5 rounded-lg border text-sm" required />
              <input type="text" placeholder="Telefone / WhatsApp" value={novoTelefone} onChange={(e) => setNovoTelefone(e.target.value)} className="w-full p-2.5 rounded-lg border text-sm" />

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">Categorias Atendidas</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border">
                  {categories.map((cat) => (
                    <label key={cat.id} className="flex items-center space-x-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={novasCategoriasIds.includes(cat.id)}
                        onChange={() => {
                          if (novasCategoriasIds.includes(cat.id)) setNovasCategoriasIds(novasCategoriasIds.filter(id => id !== cat.id));
                          else setNovasCategoriasIds([...novasCategoriasIds, cat.id]);
                        }}
                        className="w-4 h-4 text-teal-600 rounded"
                      />
                      <span>{cat.nome}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex space-x-3 pt-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="w-1/2 bg-slate-200 text-slate-700 p-2 rounded-xl font-semibold text-sm">Cancelar</button>
                <button type="submit" className="w-1/2 bg-teal-600 text-white p-2 rounded-xl font-semibold text-sm">Salvar</button>
              </div>
            </form>
          </div>
        )}

        {/* Modal de Edição de Lojista */}
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <form onSubmit={handleSaveEditLojista} className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
              <h3 className="text-xl font-bold text-slate-800">Editar Dados do Lojista</h3>
              <input type="text" value={editNome} onChange={(e) => setEditNome(e.target.value)} className="w-full p-2.5 rounded-lg border text-sm" required />
              <input type="text" value={editCidade} onChange={(e) => setEditCidade(e.target.value)} className="w-full p-2.5 rounded-lg border text-sm" required />
              <input type="text" value={editTelefone} onChange={(e) => setEditTelefone(e.target.value)} className="w-full p-2.5 rounded-lg border text-sm" />

              <div className="flex space-x-3 pt-3">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="w-1/2 bg-slate-200 text-slate-700 p-2 rounded-xl font-semibold text-sm">Cancelar</button>
                <button type="submit" className="w-1/2 bg-teal-600 text-white p-2 rounded-xl font-semibold text-sm">Atualizar</button>
              </div>
            </form>
          </div>
        )}

        {/* Modal de Gestão de Categorias */}
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center pb-2 border-b">
                <h3 className="text-xl font-bold text-slate-800">Gerenciar Categorias</h3>
                <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 font-bold">✕</button>
              </div>

              <form onSubmit={handleCreateCategory} className="flex gap-2">
                <input type="text" placeholder="Nova categoria..." value={novaCategoriaNome} onChange={(e) => setNovaCategoriaNome(e.target.value)} className="flex-1 p-2 rounded-lg border text-sm" required />
                <button type="submit" className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Adicionar</button>
              </form>

              <div className="divide-y max-h-60 overflow-y-auto">
                {categories.map((cat) => (
                  <div key={cat.id} className="py-2 flex justify-between items-center text-sm">
                    {editingCatId === cat.id ? (
                      <div className="flex gap-2 flex-1">
                        <input type="text" value={editingCatNome} onChange={(e) => setEditingCatNome(e.target.value)} className="flex-1 p-1 rounded border text-sm" />
                        <button type="button" onClick={() => handleSaveEditCategory(cat.id)} className="bg-green-600 text-white px-2 py-1 rounded text-xs">Salvar</button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-slate-800">{cat.nome}</span>
                        <button type="button" onClick={() => { setEditingCatId(cat.id); setEditingCatNome(cat.nome); }} className="text-xs text-teal-600 font-bold">Editar</button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t flex justify-end">
                <button type="button" onClick={() => setIsCategoryModalOpen(false)} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold">Fechar</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}