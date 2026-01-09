import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient } from "@prisma/client";
import { compare } from "bcryptjs";

// Instancia o Prisma (evita múltiplas conexões em dev)
const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const handler = NextAuth({
  // Ativa logs detalhados no terminal para vermos o erro real
  debug: true,
  
  // Garante que o secret seja lido
  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
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
          // 1. Busca o usuário
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          if (!user) {
            console.log("LOGIN FALHOU: Usuário não encontrado:", credentials.email);
            return null; // Retornar null no NextAuth v4 gera erro de credenciais
          }

          // 2. Verifica senha
          // Nota: O seed original criou a senha como HASH. 
          // Se você editou o banco manualmente, pode dar erro aqui.
          const isPasswordValid = await compare(credentials.password, user.password);

          if (!isPasswordValid) {
            console.log("LOGIN FALHOU: Senha incorreta para:", credentials.email);
            return null;
          }

          // 3. Sucesso
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          };

        } catch (error) {
          console.error("ERRO NO AUTHORIZE:", error);
          throw new Error("Erro interno no servidor ao tentar logar.");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };