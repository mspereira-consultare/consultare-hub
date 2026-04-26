import NextAuth, { type NextAuthOptions, type Session, type User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getDbConnection } from "@/lib/db"; 
import { compare } from "bcryptjs";
import { getUserPermissions } from "@/lib/permissions_server";
import type { JWT } from "next-auth/jwt";
import {
  PANEL_SIGN_IN_PATH,
  SHARED_SESSION_MAX_AGE_SECONDS,
  buildSharedNextAuthCookies,
  normalizeAuthUrl,
} from "@consultare/core/auth";

const normalizedAuthUrl = normalizeAuthUrl(process.env.NEXTAUTH_URL || process.env.AUTH_URL);
if (normalizedAuthUrl) {
  process.env.NEXTAUTH_URL = normalizedAuthUrl;
}

type ConsultareAuthFields = {
  id?: string;
  role?: string;
  department?: string;
  permissions?: unknown;
};

type ConsultareToken = JWT & ConsultareAuthFields;
type ConsultareUser = User & ConsultareAuthFields;
type ConsultareSessionUser = NonNullable<Session['user']> & ConsultareAuthFields;

export const authOptions: NextAuthOptions = {
  // Debug apenas em desenvolvimento
  debug: process.env.NODE_ENV === 'development',
  
  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: PANEL_SIGN_IN_PATH,
  },
  session: {
    strategy: "jwt",
    maxAge: SHARED_SESSION_MAX_AGE_SECONDS,
  },
  cookies: buildSharedNextAuthCookies(),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Dados de login incompletos");
        }

        try {
          const db = getDbConnection();
          
          // CORREÇÃO: Usar .query() em vez de .prepare().get()
          // O método query sempre retorna um array (Promise<any[]>)
          const rows = await db.query(
            "SELECT * FROM users WHERE email = ?", 
            [credentials.email]
          );

          const user = rows[0]; // Pega o primeiro resultado

          if (!user) {
            console.log("LOGIN FALHOU: Usuário não encontrado:", credentials.email);
            return null;
          }
          if (String(user.status || '').toUpperCase() !== 'ATIVO') {
            console.log("LOGIN FALHOU: Usuário inativo:", credentials.email);
            return null;
          }

          // Verifica senha (bcrypt)
          // Tenta acessar user.password ou user.password_hash dependendo de como foi salvo
          const storedHash = user.password || user.password_hash;
          
          if (!storedHash) {
             console.log("LOGIN FALHOU: Usuário sem senha definida.");
             return null;
          }

          const isPasswordValid = await compare(credentials.password, storedHash);

          if (!isPasswordValid) {
            console.log("LOGIN FALHOU: Senha incorreta para:", credentials.email);
            return null;
          }

          const permissions = await getUserPermissions(String(user.id), String(user.role || 'OPERADOR'));

          // Atualiza último acesso (Fire and forget)
          try {
             // Formato ISO para compatibilidade universal
             const now = new Date().toISOString();
             // CORREÇÃO: Usar .execute() em vez de .prepare().run()
             await db.execute(
                 "UPDATE users SET last_access = ? WHERE id = ?", 
                 [now, user.id]
             );
          } catch (e) {
             console.error("Erro update last_access", e);
          }

          // Retorna objeto do usuário para a sessão
          return {
            id: String(user.id), // Garante string para o NextAuth
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            permissions,
          };

        } catch (error) {
          console.error("ERRO CRÍTICO NO LOGIN:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: User }) {
      const nextToken = token as ConsultareToken;
      const nextUser = user as ConsultareUser | undefined;

      if (user) {
        nextToken.id = nextUser?.id;
        nextToken.role = nextUser?.role;
        nextToken.department = nextUser?.department;
        nextToken.permissions = nextUser?.permissions;
      }

      if (nextToken?.id) {
        try {
          const permissions = await getUserPermissions(
            String(nextToken.id),
            String(nextToken.role || 'OPERADOR')
          );
          nextToken.permissions = permissions;
        } catch (error) {
          console.error('Erro ao recarregar permissoes no JWT:', error);
        }
      }

      return nextToken;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      const nextToken = token as ConsultareToken;
      if (session.user) {
        const sessionUser = session.user as ConsultareSessionUser;
        sessionUser.id = nextToken.id;
        sessionUser.role = nextToken.role;
        sessionUser.department = nextToken.department;
        sessionUser.permissions = nextToken.permissions;
      }
      return session;
    }
  }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
