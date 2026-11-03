import "./globals.css";

export const metadata = {
  title: "Wavo — WhatsApp Business Platform",
  description: "Manage WhatsApp conversations, contacts and campaigns."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
