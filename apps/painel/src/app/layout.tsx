// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/providers/AuthProvider";

export const metadata: Metadata = {
  title: "Consultare Hub",
  description: "Sistema de Gestão",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased bg-gray-50 text-slate-900">
        {/* Envolvemos o app todo com o AuthProvider */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}