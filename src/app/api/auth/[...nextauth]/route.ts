import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getDbConnection } from "@/lib/db"; // Usa sua conexão SQLite existente
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  // Ativa logs para debug em desenvolvimento
  debug: process.env.NODE_ENV === 'development',
  
  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: "/login", // Certifique-se que esta rota existe
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 dias
  },
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
          // 1. Conecta ao banco SQLite (mesmo usado na criação de usuários)
          const db = getDbConnection();
          
          // 2. Busca o usuário pelo email
          // Nota: O tipo 'any' é usado aqui pois better-sqlite3 retorna objetos genéricos
          const user = db.prepare('SELECT * FROM users WHERE email = ?').get(credentials.email) as any;

          if (!user) {
            console.log("LOGIN: Usuário não encontrado:", credentials.email);
            return null;
          }

          // 3. Verifica a senha (Hash vs Texto Plano)
          const isPasswordValid = await bcrypt.compare(credentials.password, user.password_hash);

          if (!isPasswordValid) {
            console.log("LOGIN: Senha incorreta para:", credentials.email);
            return null;
          }

          // 4. Verifica se está ativo
          if (user.status === 'INATIVO') {
            throw new Error("Usuário desativado.");
          }

          // 5. Atualiza último acesso (opcional, mas recomendado)
          try {
            const now = new Date().toLocaleString('pt-BR');
            db.prepare('UPDATE users SET last_access = ? WHERE id = ?').run(now, user.id);
          } catch (e) {
            console.error("Erro ao atualizar last_access", e);
          }

          // 6. Retorna objeto do usuário para o NextAuth
          return {
            id: user.id.toString(), // NextAuth prefere IDs como string
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
          };

        } catch (error) {
          console.error("ERRO NO LOGIN:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    // Passa dados do usuário para o Token JWT
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.department = user.department;
      }
      return token;
    },
    // Passa dados do Token para a Sessão (disponível no front via useSession)
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.department = token.department;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };