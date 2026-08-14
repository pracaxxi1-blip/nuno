import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { uploadImageToStorage } from '../utils/uploadImage';

export default function CreateRequest() {
  const [tipo, setTipo] = useState('unico');
  const [prazoOpcao, setPrazoOpcao] = useState('padrao');
  const [categories, setCategories] = useState([]);
  const [allCategoriesRaw, setAllCategoriesRaw] = useState([]);
  const [cities, setCities] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [cityId, setCityId] = useState('');
  const [bairro, setBairro] = useState('');
  const [eligibleStoresCount, setEligibleStoresCount] = useState(null);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  const [items, setItems] = useState([
    { descricao: '', quantidade: 1, imagem_url: '' }
  ]);

  useEffect(() => {
    async function loadData() {
      const { data: catData } = await supabase.from('categories').select('*');
      const { data: cityData } = await supabase.from('cities').select('*');

      if (catData) {
        setAllCategoriesRaw(catData);
        const uniqueCats = catData.filter((item, index, self) =>
          index === self.findIndex((t) => t.nome?.trim().toLowerCase() === item.nome?.trim().toLowerCase())
        );
        setCategories(uniqueCats);
      }

      if (cityData) {
        const uniqueCities = cityData.filter((item, index, self) =>
          index === self.findIndex((t) => t.nome?.trim().toLowerCase() === item.nome?.trim().toLowerCase())
        );
        setCities(uniqueCities);
      }
    }
    loadData();
  }, []);

  // Contagem de lojas elegíveis
  useEffect(() => {
    async function countEligibleStores() {
      if (!categoryId || !cityId) {
        setEligibleStoresCount(null);
        return;
      }

      try {
        // 1. Identifica o nome da categoria selecionada e todos os IDs com o mesmo nome
        const selectedCat = categories.find(c => String(c.id) === String(categoryId));
        const catName = selectedCat ? selectedCat.nome?.trim().toLowerCase() : '';

        const matchingCatIds = allCategoriesRaw
          .filter(c => c.nome?.trim().toLowerCase() === catName)
          .map(c => c.id);

        if (matchingCatIds.length === 0) matchingCatIds.push(categoryId);

        // 2. Identifica o nome da cidade selecionada
        const cityObj = cities.find(c => String(c.id) === String(cityId) || c.nome === cityId);
        const cityName = (cityObj ? cityObj.nome : cityId).trim();

        // 3. Busca lojistas vinculados a qualquer ID dessa categoria
        const { data: lojistaCats, error: lcErr } = await supabase
          .from('lojista_categorias')
          .select('lojista_id')
          .in('categoria_id', matchingCatIds);

        if (lcErr) {
          console.error('Erro ao buscar lojista_categorias:', lcErr);
          setEligibleStoresCount(0);
          return;
        }

        const lojistaIds = Array.from(new Set((lojistaCats || []).map(lc => lc.lojista_id).filter(Boolean)));

        if (lojistaIds.length > 0) {
          // 4. Busca perfis de lojistas ativos nessa cidade
          const { data: profiles, error: profErr } = await supabase
            .from('profiles')
            .select('id, cidade, ativo, tipo')
            .in('id', lojistaIds);

          if (profErr) {
            console.error('Erro ao buscar perfis:', profErr);
            setEligibleStoresCount(0);
            return;
          }

          const eligible = (profiles || []).filter(p => {
            const isLojista = p.tipo === 'lojista' || !p.tipo;
            const isAtivo = p.ativo !== false;
            const sameCity = p.cidade && p.cidade.trim().toLowerCase().includes(cityName.toLowerCase());
            return isLojista && isAtivo && sameCity;
          });

          setEligibleStoresCount(eligible.length);
        } else {
          setEligibleStoresCount(0);
        }
      } catch (err) {
        console.error('Erro ao calcular lojas:', err);
        setEligibleStoresCount(0);
      }
    }

    countEligibleStores();
  }, [categoryId, cityId, categories, cities, allCategoriesRaw]);

  const handleImageUpload = async (index, file) => {
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadImageToStorage(file, 'cliente');
      const updated = [...items];
      updated[index].imagem_url = url;
      setItems(updated);
    } catch (err) {
      alert('Erro ao enviar imagem: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const addItemRow = () => {
    setItems([...items, { descricao: '', quantidade: 1, imagem_url: '' }]);
  };

  const removeItemRow = (index) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (uploading) {
      alert('Aguarde o upload das imagens terminar.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Sessão expirada. Faça login novamente.');
      return;
    }

    let { data: profile } = await supabase
      .from('profiles')
      .select('numero_cliente')
      .eq('id', user.id)
      .single();

    let numCliente = profile?.numero_cliente || Math.floor(100 + Math.random() * 900);

    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('cliente_id', user.id);

    const codigoPedido = `${numCliente}-${(count || 0) + 1}`;
    const descricaoResumo = tipo === 'unico' ? items[0].descricao : `Lista com ${items.length} itens`;

    let horasAdd = 6;
    if (prazoOpcao === 'urgente') horasAdd = 1;
    if (prazoOpcao === 'sem_pressa') horasAdd = 24;

    const expiraEm = new Date(Date.now() + horasAdd * 60 * 60 * 1000).toISOString();

    const { data: newOrder, error: orderErr } = await supabase
      .from('orders')
      .insert([{
        cliente_id: user.id,
        categoria_id: categoryId,
        cidade_id: cityId,
        bairro: bairro,
        descricao: descricaoResumo,
        status: 'Aguardando Moderação',
        codigo_pedido: codigoPedido,
        tipo: tipo,
        prazo_opcao: prazoOpcao,
        expira_em: expiraEm
      }])
      .select()
      .single();

    if (orderErr) {
      alert('Erro ao criar cotação: ' + orderErr.message);
      return;
    }

    const itemsToInsert = items.map(item => ({
      order_id: newOrder.id,
      descricao: item.descricao,
      quantidade: parseInt(item.quantidade) || 1,
      imagem_url: item.imagem_url
    }));

    const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);

    if (itemsErr) {
      alert('Erro ao salvar itens da cotação: ' + itemsErr.message);
      return;
    }

    alert(`Pedido #${codigoPedido} criado com sucesso!`);
    navigate('/client-dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 flex justify-center items-center">
      <form onSubmit={handleSubmit} className="p-8 bg-white shadow-xl rounded-2xl w-full max-w-2xl border border-slate-200 space-y-5 my-8">
        <h2 className="text-2xl font-bold text-slate-800 text-center">Criar Nova Cotação</h2>

        {/* Tipo de Pedido */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => { setTipo('unico'); setItems([{ descricao: '', quantidade: 1, imagem_url: '' }]); }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${tipo === 'unico' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
          >
            Item Único
          </button>
          <button
            type="button"
            onClick={() => setTipo('lista')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${tipo === 'lista' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
          >
            Lista de Compras
          </button>
        </div>

        {/* Categoria e Cidade */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
              required
            >
              <option value="">Selecione...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cidade</label>
            <select
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
              required
            >
              <option value="">Selecione...</option>
              {cities.map((city) => (
                <option key={city.id || city.nome} value={city.id || city.nome}>{city.nome}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Contador de Lojas Elegíveis */}
        {eligibleStoresCount !== null && (
          <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
            eligibleStoresCount > 0 
              ? 'bg-teal-50 border-teal-200 text-teal-800' 
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <span>🏪</span>
            <span>
              {eligibleStoresCount > 0 
                ? `Existem ${eligibleStoresCount} loja(s) ativa(s) nesta cidade para receber sua solicitação.`
                : 'Nenhuma loja cadastrada nesta categoria/cidade no momento. Sua solicitação ficará salva para quando houver lojistas.'}
            </span>
          </div>
        )}

        {/* Bairro para Entrega */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Bairro para Entrega</label>
          <input
            type="text"
            placeholder="Ex: Pelinca, Centro..."
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            className="w-full p-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
            required
          />
        </div>

        {/* Prazo de Resposta */}
        <div>
          <label className="block text-sm font-bold text-slate-800 mb-2">Prazo para Resposta dos Lojistas</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPrazoOpcao('urgente')}
              className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                prazoOpcao === 'urgente' 
                  ? 'border-red-500 bg-red-50 text-red-700 font-bold shadow-sm' 
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-base">🔴 Urgente</span>
              <span className="text-xs font-normal">Até 1 hora</span>
            </button>

            <button
              type="button"
              onClick={() => setPrazoOpcao('padrao')}
              className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                prazoOpcao === 'padrao' 
                  ? 'border-teal-600 bg-teal-50 text-teal-800 font-bold shadow-sm' 
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-base">🟡 Padrão</span>
              <span className="text-xs font-normal">Até 6 horas</span>
            </button>

            <button
              type="button"
              onClick={() => setPrazoOpcao('sem_pressa')}
              className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                prazoOpcao === 'sem_pressa' 
                  ? 'border-green-600 bg-green-50 text-green-800 font-bold shadow-sm' 
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-base">🟢 Sem pressa</span>
              <span className="text-xs font-normal">Até 24 horas</span>
            </button>
          </div>
        </div>

        {/* Cadastro dos Itens */}
        <div className="space-y-4 pt-2 border-t border-slate-100">
          <label className="block text-sm font-bold text-slate-800">
            {tipo === 'unico' ? 'Detalhes do Produto' : 'Itens da Lista'}
          </label>

          {items.map((item, index) => (
            <div key={index} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 relative">
              <div className="flex gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Descrição do item..."
                    value={item.descricao}
                    onChange={(e) => handleItemChange(index, 'descricao', e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm"
                    required
                  />
                </div>
                <div className="w-24">
                  <input
                    type="number"
                    min="1"
                    placeholder="Qtd"
                    value={item.quantidade}
                    onChange={(e) => handleItemChange(index, 'quantidade', e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm"
                    required
                  />
                </div>
                {tipo === 'lista' && items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItemRow(index)}
                    className="text-red-500 font-bold px-2 hover:text-red-700"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(index, e.target.files[0])}
                  className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300"
                />
                {item.imagem_url && (
                  <img src={item.imagem_url} alt="Preview" className="w-10 h-10 object-cover rounded-lg border border-slate-300" />
                )}
              </div>
            </div>
          ))}

          {tipo === 'lista' && (
            <button
              type="button"
              onClick={addItemRow}
              className="w-full py-2 bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm hover:bg-slate-300 transition"
            >
              + Adicionar Outro Item
            </button>
          )}
        </div>

        <button 
          type="submit" 
          disabled={uploading}
          className={`w-full p-3 rounded-xl font-semibold text-white transition shadow-sm ${uploading ? 'bg-slate-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'}`}
        >
          {uploading ? 'Enviando imagens...' : 'Enviar Cotação'}
        </button>
      </form>
    </div>
  );
}
