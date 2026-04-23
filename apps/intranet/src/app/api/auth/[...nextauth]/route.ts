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

const normalizedAuthUrl = normalizeAuthUrl(process.env.NEXTAUTH_URL || process.env.AUTH_URL);
if (normalizedAuthUrl) {
  process.env.NEXTAUTH_URL = normalizedAuthUrl;
}

type ConsultareAuthFields = {
  id?: string;
  role?: string;
  department?: string;
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

        const db = getDbConnection();
        const rows = await db.query(
          'SELECT id, name, email, role, department, password, password_hash, status FROM users WHERE email = ? LIMIT 1',
          [credentials.email]
        );
        const user = rows[0] as Record<string, unknown> | undefined;
        if (!user) return null;

        const status = String(user.status || 'ATIVO').toUpperCase();
        if (status && status !== 'ATIVO') return null;

        const storedHash = String(user.password || user.password_hash || '');
        if (!storedHash) return null;

        const valid = await compare(credentials.password, storedHash);
        if (!valid) return null;

        return {
          id: String(user.id),
          name: String(user.name || user.email || ''),
          email: String(user.email || ''),
          role: String(user.role || 'OPERADOR'),
          department: String(user.department || ''),
        };
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
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
