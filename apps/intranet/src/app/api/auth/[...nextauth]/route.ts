import NextAuth, { type NextAuthOptions, type Session, type User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { JWT } from 'next-auth/jwt';
import { compare } from 'bcryptjs';
import {
  INTRANET_SIGN_IN_PATH,
  SHARED_SESSION_MAX_AGE_SECONDS,
  buildSharedNextAuthCookies,
  normalizeAuthUrl,
} from '@consultare/core/auth';
import { getDbConnection } from '@consultare/core/db';
import { getDefaultMatrixByRole } from '@consultare/core/permissions';
import { loadUserPermissionMatrix } from '@consultare/core/permissions-server';

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
  debug: process.env.NODE_ENV === 'development',
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: INTRANET_SIGN_IN_PATH,
  },
  session: {
    strategy: 'jwt',
    maxAge: SHARED_SESSION_MAX_AGE_SECONDS,
  },
  cookies: buildSharedNextAuthCookies(),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Dados de login incompletos');
        }

        try {
          const db = getDbConnection();
          const rows = await db.query(
            'SELECT * FROM users WHERE email = ? LIMIT 1',
            [credentials.email]
          );
          const user = rows[0] as Record<string, unknown> | undefined;
          if (!user) {
            console.log('LOGIN INTRANET FALHOU: Usuario nao encontrado:', credentials.email);
            return null;
          }

          const storedHash = String(user.password || user.password_hash || '');
          if (!storedHash) {
            console.log('LOGIN INTRANET FALHOU: Usuario sem senha definida:', credentials.email);
            return null;
          }

          const valid = await compare(credentials.password, storedHash);
          if (!valid) {
            console.log('LOGIN INTRANET FALHOU: Senha incorreta para:', credentials.email);
            return null;
          }

          const role = String(user.role || 'OPERADOR');
          let permissions = getDefaultMatrixByRole(role);
          try {
            permissions = await loadUserPermissionMatrix(db, String(user.id), role);
          } catch (error) {
            console.error('Erro ao carregar permissoes no login da intranet:', error);
          }

          try {
            await db.execute('UPDATE users SET last_access = ? WHERE id = ?', [new Date().toISOString(), user.id]);
          } catch (error) {
            console.error('Erro update last_access intranet', error);
          }

          return {
            id: String(user.id),
            name: String(user.name || user.email || ''),
            email: String(user.email || ''),
            role,
            department: String(user.department || ''),
            permissions,
          };
        } catch (error) {
          console.error('ERRO CRITICO NO LOGIN INTRANET:', error);
          throw new Error('AUTH_CONFIG_ERROR');
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: User }) {
      const nextToken = token as ConsultareToken;
      const nextUser = user as ConsultareUser | undefined;

      if (nextUser) {
        nextToken.id = nextUser.id;
        nextToken.role = nextUser.role;
        nextToken.department = nextUser.department;
        nextToken.permissions = nextUser.permissions;
      }

      if (nextToken?.id) {
        try {
          const db = getDbConnection();
          nextToken.permissions = await loadUserPermissionMatrix(db, String(nextToken.id), String(nextToken.role || 'OPERADOR'));
        } catch (error) {
          console.error('Erro ao recarregar permissoes no JWT da intranet:', error);
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
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
