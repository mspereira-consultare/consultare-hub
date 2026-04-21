import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Portal do Colaborador | Consultare',
  description: 'Envio de informações e documentos para colaboradores Consultare',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
          {children}
        </div>
      </body>
    </html>
  );
}
