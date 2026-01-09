import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function proxy(request: NextRequest) {
  // Pega o token seguro (o "crachá" do NextAuth)
  // O 'secret' deve ser o mesmo do .env
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });

  // Define se a rota atual é pública (Login)
  const isLoginPage = request.nextUrl.pathname === '/login';

  // CASO 1: Usuário NÃO logado tentando acessar área privada
  if (!token && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // CASO 2: Usuário JÁ logado tentando acessar o login (redireciona pro dashboard)
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

// Protege todas as rotas, exceto arquivos estáticos e API
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|logo-color.png).*)'],
};