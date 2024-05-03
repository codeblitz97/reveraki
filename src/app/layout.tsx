import type { Metadata } from 'next';
import { Exo } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import TopProgressBar from '../components/ProgressBar';
import NavComp from '@/components/Nav';

const exo = Exo({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Reveraki',
  description: 'An ad-free anime streaming website',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning={true}>
      <body className={exo.className}>
        <Providers>
          <NavComp />
          <main>{children}</main>
          <TopProgressBar />
        </Providers>
      </body>
    </html>
  );
}