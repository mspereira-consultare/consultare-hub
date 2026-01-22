import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getDbConnection } from "@/lib/db"; 
import { compare } from "bcryptjs";

export const authOptions: NextAuthOptions = {
  // Debug apenas em desenvolvimento
  debug: process.env.NODE_ENV === 'development',
  
  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: "/login",
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
          };

        } catch (error) {
          console.error("ERRO CRÍTICO NO LOGIN:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.department = user.department;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.department = token.department;
      }
      return session;
    }
  }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };