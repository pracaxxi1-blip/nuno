import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate, Link } from 'react-router-dom';
import logo from '../assets/logo.svg'; // Se for .png, altere para '../assets/logo.png'

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tipo, ativo')
        .eq('id', data.user.id)
        .single();

      if (profile?.ativo === false) {
        await supabase.auth.signOut();
        throw new Error('Sua conta está temporariamente desativada.');
      }

      if (profile?.tipo === 'admin') {
        navigate('/admin');
      } else if (profile?.tipo === 'lojista') {
        navigate('/lojista-dashboard');
      } else {
        navigate('/client-dashboard');
      }
    } catch (err) {
      setErrorMsg(err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotMsg('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotMsg('E-mail de redefinição enviado com sucesso!');
    } catch (err) {
      setForgotMsg('Erro ao enviar e-mail: ' + err.message);
    }
  };

  return (
    <div className="bg-[#f8f9fa] text-slate-700 min-h-screen flex flex-col justify-between items-center py-8 px-4 font-sans">
      
      {/* Container Central */}
      <div className="w-full max-w-[440px] flex flex-col items-center my-auto">

        {/* Card de Login */}
        <div className="w-full bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-slate-200/80 p-8 sm:p-10 flex flex-col items-center">
          
          {/* Logo 315x195px */}
          <Link to="/" className="mb-4 flex items-center justify-center hover:opacity-90 transition">
            <img 
              src={logo} 
              alt="Logo" 
              className="w-[315px] h-[195px] object-contain"
            />
          </Link>

          {/* Título */}
          <h2 className="text-lg font-bold text-slate-800 mb-6 text-center">Acesse sua conta</h2>

          {errorMsg && (
            <div className="w-full mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl text-center">
              {errorMsg}
            </div>
          )}

          <form className="w-full flex flex-col" onSubmit={handleLogin}>
            {/* Campo E-mail */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="email">
                E-mail
              </label>
              <input 
                type="email" 
                id="email"
                placeholder="Insira seu e-mail de acesso" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
              />
            </div>

            {/* Campo Senha */}
            <div className="mb-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="password">
                Senha
              </label>
              <div className="relative">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  id="password"
                  placeholder="Insira sua senha" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition pr-10"
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Esqueci minha senha */}
            <button 
              type="button" 
              onClick={() => setIsForgotModalOpen(true)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline self-start mb-6 mt-1"
            >
              Esqueci minha senha
            </button>

            {/* Botão Entrar */}
            <button 
              type="submit" 
              disabled={loading}
              className={`w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold rounded-xl transition duration-150 shadow-sm shadow-indigo-200 ${
                loading ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>

      {/* Rodapé */}
      <footer className="mt-8 text-center text-[11px] text-slate-500 leading-relaxed">
        <div className="flex flex-wrap justify-center items-center gap-1.5 mb-1 text-slate-600">
          <a href="#" className="hover:underline">Fale conosco</a>
          <span>|</span>
          <a href="#" className="hover:underline">Termos de uso</a>
          <span>|</span>
          <a href="#" className="hover:underline">Segurança e privacidade</a>
        </div>
        <div>
          <a href="#" className="font-medium text-slate-700 hover:underline">www.selodacidade.com.br</a>
          {" "}— 2026 – © Todos os direitos reservados
        </div>
      </footer>

      {/* Modal Esqueci Minha Senha */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleForgotPassword} className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Recuperar Senha</h3>
              <button type="button" onClick={() => { setIsForgotModalOpen(false); setForgotMsg(''); }} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>
            
            <p className="text-xs text-slate-600">
              Digite seu e-mail para receber o link de redefinição de senha.
            </p>

            {forgotMsg && (
              <p className="text-xs font-semibold text-indigo-600 bg-indigo-50 p-2 rounded-lg">{forgotMsg}</p>
            )}

            <input 
              type="email" 
              placeholder="seu@email.com" 
              value={forgotEmail} 
              onChange={(e) => setForgotEmail(e.target.value)} 
              className="w-full p-2.5 rounded-xl border border-slate-300 text-sm text-slate-800" 
              required 
            />

            <div className="flex gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => { setIsForgotModalOpen(false); setForgotMsg(''); }}
                className="w-1/2 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-300"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="w-1/2 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700"
              >
                Enviar Link
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
