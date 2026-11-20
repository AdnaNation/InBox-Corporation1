import "./globals.css";
import "sweetalert2/dist/sweetalert2.min.css";

export const metadata = {
  title: "Wavo — WhatsApp conversations, campaigns and customer care",
  description: "Wavo by InBox Corporation brings WhatsApp customer conversations, contacts, campaigns and team workflows into one workspace.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png"
  },
  openGraph: {
    title: "Wavo by InBox Corporation",
    description: "One workspace for WhatsApp customer conversations, contacts and campaigns.",
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
