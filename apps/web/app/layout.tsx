import type { ReactNode } from 'react';

export const metadata = {
  title: 'Agent HQ',
  description: 'Agent Operations Platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
