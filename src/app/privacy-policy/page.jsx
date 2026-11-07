import Link from "next/link";

const sections = [
  {
    title: "1. Information we collect",
    paragraphs: [
      "Account and workspace details, such as your name, email address, workspace name and account settings.",
      "Contact information you add or import, such as contact names and phone numbers.",
      "WhatsApp Business information made available when you connect an account, including business account and phone-number identifiers, profile details, message content and delivery events needed to provide the service.",
      "Usage and technical information, such as feature activity, browser/device details, IP address and diagnostic logs."
    ]
  },
  {
    title: "2. How we use information",
    paragraphs: [
      "We use information to create and secure accounts, operate workspaces, manage contacts, send messages you instruct us to send, display conversations and delivery statuses, provide support, prevent abuse and improve the platform."
    ]
  },
  {
    title: "3. WhatsApp and third-party services",
    paragraphs: [
      "When you connect WhatsApp, InBox uses Meta's WhatsApp Business Platform and the permissions you grant to provide the requested features. Information exchanged with Meta is also subject to Meta's terms and privacy policy.",
      "Do not upload contact details or send messages unless you have the rights, permissions and consent required by applicable law and WhatsApp policies."
    ]
  },
  {
    title: "4. Sharing",
    paragraphs: [
      "We do not sell personal information. We may process or disclose information to service providers that host, secure and operate InBox, to Meta when you use WhatsApp integration, when you direct us to do so, or when disclosure is required to comply with law or protect rights and safety."
    ]
  },
  {
    title: "5. Security and retention",
    paragraphs: [
      "We use technical and organizational safeguards intended to protect information, including access controls and encryption for selected credentials. No internet service can guarantee absolute security.",
      "We retain information for as long as needed to provide the service, meet legitimate operational needs, resolve disputes and comply with legal obligations. Retention periods may vary by data type and account status."
    ]
  },
  {
    title: "6. Your choices and rights",
    paragraphs: [
      "Depending on your location, you may have rights to access, correct, export or request deletion of personal information, and to object to or restrict certain processing. Workspace administrators may control information within their workspace.",
      "You can disconnect a WhatsApp account in the product. Disconnecting InBox does not itself revoke permissions in Meta or delete data held by Meta; manage those separately with Meta."
    ]
  },
  {
    title: "7. Children",
    paragraphs: [
      "InBox is a business service and is not intended for children. Do not use the service to knowingly collect personal information from children."
    ]
  },
  {
    title: "8. Changes to this policy",
    paragraphs: [
      "We may update this policy as the service changes. We will revise the date below when we publish an update."
    ]
  }
];

export const metadata = {
  title: "Privacy Policy | InBox Corporation",
  description: "Learn how InBox Corporation collects, uses, stores and protects information when you use our WhatsApp business platform.",
  alternates: { canonical: "/privacy-policy" }
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3" aria-label="InBox Corporation home">
            <img src="/logo.png" alt="InBox Corporation" className="h-11 w-11 rounded-xl object-cover" />
            <span className="text-lg font-bold tracking-tight text-slate-950">InBox <span className="text-emerald-600">Corporation</span></span>
          </Link>
          <Link href="/login" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Sign in</Link>
        </div>
      </header>

      <section className="bg-gradient-to-br from-blue-950 via-blue-800 to-blue-600">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">InBox Corporation</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">Privacy Policy</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-blue-100">This policy explains what information we handle and how we use it to provide our business messaging platform.</p>
          <p className="mt-5 text-sm text-blue-200">Last updated: November 3, 2026</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-12 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5">
          <p className="font-semibold text-slate-900">On this page</p>
          <nav className="mt-3 space-y-2 text-sm text-slate-600">
            {sections.map((section, index) => <a key={section.title} href={`#section-${index + 1}`} className="block hover:text-blue-700">{section.title}</a>)}
          </nav>
        </aside>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <p className="leading-7 text-slate-600">This Privacy Policy applies to InBox Corporation and the InBox platform. It describes our handling of information when you visit our website or use our services.</p>
          <div className="mt-8 space-y-9">
            {sections.map((section, index) => (
              <section id={`section-${index + 1}`} key={section.title} className="scroll-mt-8">
                <h2 className="text-xl font-bold text-slate-950">{section.title}</h2>
                <div className="mt-3 space-y-3">
                  {section.paragraphs.map(paragraph => <p key={paragraph} className="leading-7 text-slate-600">{paragraph}</p>)}
                </div>
              </section>
            ))}
          </div>
          <section className="mt-10 rounded-xl bg-blue-50 p-5">
            <h2 className="font-bold text-slate-950">Privacy questions or data requests?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">Please contact InBox Corporation using the support contact provided with your account or service communications. Include your account email and describe the request. We may need to verify your identity before acting on a request.</p>
          </section>
          <p className="mt-8 text-xs text-slate-400">This policy is provided as a general description of the service. It should be reviewed for the laws and actual data practices applicable to your business before formal publication.</p>
        </article>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} InBox Corporation. All rights reserved.</span>
          <div className="flex gap-4"><Link href="/terms" className="font-medium text-blue-700 hover:text-blue-900">Terms of Service</Link><Link href="/" className="font-medium text-blue-700 hover:text-blue-900">Back to home</Link></div>
        </div>
      </footer>
    </main>
  );
}
