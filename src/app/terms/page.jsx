import Link from "next/link";

const sections = [
  {
    title: "1. About these terms",
    paragraphs: [
      "These Terms of Service govern access to and use of the InBox Corporation website and Wavo business messaging platform (the Service). By creating an account, accessing a workspace, or using the Service, you agree to these terms.",
      "The Service is intended for businesses and their authorized team members. If you use it on behalf of an organization, you confirm that you are authorized to accept these terms for that organization."
    ]
  },
  {
    title: "2. Accounts and workspace security",
    paragraphs: [
      "You must provide accurate registration information, keep your sign-in credentials confidential, and promptly notify us if you suspect unauthorized access. You are responsible for activity performed through your account and for managing team-member access and permissions.",
      "We may request reasonable information to verify an account, investigate misuse, or protect the Service and its users."
    ]
  },
  {
    title: "3. Customer contacts, consent and messaging",
    paragraphs: [
      "You are responsible for the contacts and content you upload, the instructions you give the Service, and the messages sent from your connected business accounts.",
      "Before importing a contact or sending a message, you must have all notices, permissions, opt-ins, legal bases and other rights required by applicable law and the policies of the relevant messaging platform. You must honor opt-outs and promptly stop messages when a person withdraws consent.",
      "You must use approved message templates where required, respect applicable messaging windows and rate limits, identify your business accurately, and avoid unsolicited, deceptive, unlawful, abusive or otherwise prohibited communications."
    ]
  },
  {
    title: "4. WhatsApp and other third-party services",
    paragraphs: [
      "WhatsApp functionality depends on services operated by Meta and other third parties. Your use of those services is also subject to their terms, business policies, technical requirements and approval processes.",
      "We do not control Meta's decisions, API availability, account reviews, template approvals, message delivery, pricing, limits or enforcement actions. A connection shown as active in Wavo does not guarantee that Meta will accept or deliver a particular message."
    ]
  },
  {
    title: "5. Plans, usage and payments",
    paragraphs: [
      "Available plans, features, usage limits and any applicable fees are those displayed in the Service or separately agreed with you in writing. Some plan changes or activations may be handled manually by InBox Corporation.",
      "We will present applicable charges and payment instructions before asking you to pay. You are responsible for applicable taxes, provider charges and third-party fees unless we expressly agree otherwise.",
      "We may change plans, limits or prices prospectively by giving notice through the Service or account communications. A change does not retroactively alter a fee already paid for an active billing period unless required by law."
    ]
  },
  {
    title: "6. Acceptable use",
    paragraphs: [
      "You must not use the Service to violate law or third-party rights, send spam, harass or defraud people, distribute malware, bypass platform restrictions, interfere with security, or attempt to access another workspace or account without authorization.",
      "You must not reverse engineer, resell, overload, disrupt or misuse the Service, or use it in a way that could harm its availability, integrity or reputation."
    ]
  },
  {
    title: "7. Your content and our intellectual property",
    paragraphs: [
      "You retain responsibility for and, as between you and InBox Corporation, the rights in the contact data, messages, templates and other content you submit. You grant us a limited, non-exclusive permission to host, process, transmit and display that content only as reasonably necessary to provide, secure and support the Service.",
      "The Service, its software, design, documentation, names and branding are owned by InBox Corporation or its licensors and are protected by applicable intellectual-property laws. These terms do not transfer ownership of the Service to you."
    ]
  },
  {
    title: "8. Availability, changes and support",
    paragraphs: [
      "We aim to operate the Service reliably but do not promise uninterrupted, error-free or universally available access. Maintenance, network failures, third-party outages, security events or changes to external APIs may affect availability or functionality.",
      "We may add, change, suspend or discontinue features when reasonably necessary. We will use reasonable efforts to provide notice of material changes where practicable."
    ]
  },
  {
    title: "9. Suspension and termination",
    paragraphs: [
      "You may stop using the Service at any time. We may suspend or restrict access where we reasonably believe there is a security risk, unlawful activity, a breach of these terms, non-payment of an agreed fee, or a risk to other users or third-party platforms.",
      "Where practicable, we will provide notice and an opportunity to address the issue. Suspension or termination does not remove your responsibility for obligations that arose before it took effect."
    ]
  },
  {
    title: "10. Privacy and data",
    paragraphs: [
      "Our handling of personal information is described in our Privacy Policy. You must ensure that your use of the Service and the information you submit is consistent with that policy and applicable data-protection requirements.",
      "You are responsible for maintaining your own copies of information that you need. Any data export, retention or deletion request will be handled under the Privacy Policy and applicable law."
    ]
  },
  {
    title: "11. Disclaimers",
    paragraphs: [
      "To the extent permitted by law, the Service is provided on an as-available basis. We do not warrant that it will meet every business requirement, that third-party platforms will remain available, or that every message, webhook or integration will complete successfully.",
      "You remain responsible for reviewing campaign recipients, message content, consent records, account connections and business outcomes before authorizing activity."
    ]
  },
  {
    title: "12. Limitation of liability",
    paragraphs: [
      "To the extent permitted by applicable law, InBox Corporation will not be liable for indirect, incidental, special, consequential or punitive losses, loss of profits, revenue, goodwill, data or business opportunity, or actions and decisions made by third-party platforms.",
      "Nothing in these terms excludes or limits liability that cannot lawfully be excluded or limited. Any liability that cannot be excluded will be limited to the extent permitted by applicable law."
    ]
  },
  {
    title: "13. Changes and contact",
    paragraphs: [
      "We may update these terms as the Service changes. We will update the date below when a revised version is published. Continued use after the effective date of an update means you accept the revised terms, to the extent permitted by law.",
      "For questions about these terms, use the support contact supplied with your account or in official InBox Corporation service communications."
    ]
  }
];

export const metadata = {
  title: "Terms of Service | InBox Corporation",
  description: "Terms governing use of the Wavo business messaging platform by InBox Corporation.",
  alternates: { canonical: "/terms" }
};

export default function TermsPage() {
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
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">InBox Corporation · Wavo</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">Terms of Service</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-blue-100">Please read these terms before using our business messaging platform.</p>
          <p className="mt-5 text-sm text-blue-200">Effective date: November 7, 2026</p>
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
          <p className="leading-7 text-slate-600">These terms apply to InBox Corporation and the Wavo platform, including workspace, contact-management, inbox, campaign, API and webhook features.</p>
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
          <p className="mt-10 rounded-xl bg-amber-50 p-5 text-xs leading-6 text-amber-900">These general product terms should be reviewed by qualified legal counsel and completed with the company’s applicable legal details, support contact, governing-law provisions and final commercial terms before formal public use.</p>
        </article>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} InBox Corporation. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/privacy-policy" className="font-medium text-blue-700 hover:text-blue-900">Privacy Policy</Link>
            <Link href="/" className="font-medium text-blue-700 hover:text-blue-900">Home</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
