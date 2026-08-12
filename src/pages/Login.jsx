import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    
    // 1. Faz o login
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      alert('Erro no login: ' + authError.message);
      return;
    }

    // 2. Busca o perfil do usuário (incluindo o campo 'ativo')
    const { data: profile } = await supabase
      .from('profiles')
      .select('tipo, ativo')
      .eq('id', authData.user.id)
      .single();

    // 3. Se o perfil não existir, cria um automaticamente como 'cliente'
    if (!profile) {
      await supabase.from('profiles').insert([
        { 
          id: authData.user.id, 
          tipo: 'cliente', 
          nome: email.split('@')[0],
          ativo: true 
        }
      ]);
      navigate('/my-requests');
      return;
    }

    // 4. Verifica se o acesso está suspenso por pendência de pagamento
    if (profile.ativo === false) {
      alert('Seu acesso está suspenso por pendência de pagamento. Entre em contato com o suporte.');
      await supabase.auth.signOut();
      return;
    }

    // 5. Normaliza e redireciona (Com suporte ao Admin)
    const tipoUsuario = String(profile.tipo).toLowerCase().trim();

    if (tipoUsuario === 'admin') {
      navigate('/admin-dashboard');
    } else if (tipoUsuario === 'lojista') {
      navigate('/lojista-dashboard');
    } else {
      navigate('/my-requests');
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100">
      <form onSubmit={handleLogin} className="p-8 bg-white shadow-xl rounded-2xl w-80 border border-slate-200">
        <h2 className="text-xl font-bold mb-6 text-slate-800 text-center">Acesse sua conta</h2>
        <input 
          type="email" placeholder="E-mail" value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          className="w-full mb-3 p-2 rounded-lg border border-slate-300" required
        />
        <input 
          type="password" placeholder="Senha" value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          className="w-full mb-6 p-2 rounded-lg border border-slate-300" required
        />
        <button className="w-full bg-teal-600 text-white p-2 rounded-lg font-semibold hover:bg-teal-700">
          Entrar
        </button>
      </form>
    </div>
  );
}