import "./globals.css";

export const metadata = {
  title: "InBox Corporation — WhatsApp Business Platform",
  description: "InBox Corporation helps businesses manage WhatsApp conversations, contacts and campaigns."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
