import "./globals.css";

export const metadata = {
  title: "InBox Corporation — WhatsApp Business Platform",
  description: "InBox Corporation helps businesses manage WhatsApp conversations, contacts and campaigns.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png"
  },
  openGraph: {
    title: "InBox Corporation — WhatsApp Business Platform",
    description: "Manage WhatsApp conversations, contacts and campaigns with InBox Corporation.",
    images: ["/logo.png"]
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
