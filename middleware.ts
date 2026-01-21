import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- 1. ROTA DE FUGA (PÚBLICA) ---
  // Se o usuário estiver tentando acessar a página de Login (raiz /) ou a página de cadastro,
  // liberamos o acesso imediatamente sem verificar token para evitar Loop Infinito.
  if (pathname === '/' || pathname === '/login' || pathname === '/register') {
    return NextResponse.next();
  }

  // --- 2. VERIFICAÇÃO DE TOKEN ---
  const token = await getToken({ 
    req, 
    secret: process.env.NEXTAUTH_SECRET 
  });

  // Se não estiver logado e tentar acessar uma rota protegida
  if (!token) {
    const url = new URL('/', req.url);
    url.searchParams.set('error', 'unauthorized');
    return NextResponse.redirect(url);
  }

  const role = token.role;

  // --- 3. REGRAS DE ACESSO POR CARGO ---

  // REGRA A: Página de Usuários -> Apenas ADMIN
  if (pathname.startsWith('/usuarios')) {
    if (role !== 'ADMIN') {
       // Redireciona para o Dashboard em vez da raiz para não deslogar visualmente
       return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  // REGRA B: Página de Metas -> Apenas ADMIN e GESTOR
  if (pathname.startsWith('/metas')) {
    if (role === 'OPERADOR') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  // Se passou por tudo, permite o acesso
  return NextResponse.next();
}

export const config = {
  // O Matcher abaixo protege TODAS as rotas da aplicação, exceto arquivos estáticos e APIs.
  // Isso é mais seguro do que listar apenas '/usuarios' e '/metas'.
  // Se você quiser proteger apenas rotas específicas, mude de volta, 
  // mas certifique-se de que a rota '/' está tratada no passo 1 acima.
  matcher: [
    /*
     * Corresponde a todos os caminhos de solicitação, exceto:
     * 1. /api/ (rotas de API)
     * 2. /_next/ (arquivos estáticos)
     * 3. /_static (arquivos estáticos, se houver)
     * 4. /favicon.ico, /sitemap.xml (arquivos públicos)
     * 5. Imagens estáticas
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};