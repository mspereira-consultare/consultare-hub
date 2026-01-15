import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Esta função precisa ser exportada exatamente com o nome "middleware"
export async function middleware(req: NextRequest) {
  
  // 1. Verifica o Token (Sessão)
  // O 'secret' é obrigatório aqui para decodificar o JWT
  const token = await getToken({ 
    req, 
    secret: process.env.NEXTAUTH_SECRET 
  });

  const { pathname } = req.nextUrl;

  // 2. Se não estiver logado, manda para o Login (ou Home)
  if (!token) {
    // Redireciona para a home com um erro na URL
    const url = new URL('/', req.url);
    url.searchParams.set('error', 'unauthorized');
    return NextResponse.redirect(url);
  }

  const role = token.role;

  // --- REGRAS DE ACESSO ---

  // REGRA A: Página de Usuários -> Apenas ADMIN
  if (pathname.startsWith('/usuarios')) {
    if (role !== 'ADMIN') {
       return NextResponse.redirect(new URL('/', req.url));
    }
  }

  // REGRA B: Página de Metas -> Apenas ADMIN e GESTOR
  if (pathname.startsWith('/metas')) {
    // Se for Operador, bloqueia
    if (role === 'OPERADOR') {
        return NextResponse.redirect(new URL('/', req.url));
    }
  }

  // Se passou por tudo, permite o acesso
  return NextResponse.next();
}

// Configuração: Define em quais rotas o middleware deve rodar
export const config = {
  matcher: [
    // Aplica o middleware apenas nestas rotas (e sub-rotas)
    '/usuarios/:path*',
    '/metas/:path*',
  ],
};