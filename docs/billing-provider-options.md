# Wavo billing provider options for a Bangladesh-based business

**Research date:** 7 November 2026

Wavo's current billing flow is manual: customers request a plan and a platform administrator activates it. Keep that safe fallback until a payment provider account is approved, credentials are available, and payment notifications have been tested end to end.

## Short recommendation

- **International SaaS subscriptions:** investigate Paddle first. Its current supplier restrictions do not list Bangladesh, it supports recurring SaaS subscriptions, and it acts as merchant of record. This is subject to Paddle's seller onboarding and payout approval; it is not a guarantee of acceptance.
- **Bangladesh-local BDT collections:** investigate direct bKash Tokenized Checkout if bKash approves Wavo for merchant onboarding and agreement-based payments. The customer still confirms later payments with a PIN, so do not describe this as unattended automatic debit without written confirmation from bKash.
- **One-time local checkout:** SSLCOMMERZ is a practical candidate for one-off payments and manual renewals. Its public developer documentation describes hosted checkout, IPN notifications, and transaction validation; it does not document a public recurring-subscription API.
- **Do not build a Stripe integration for a Bangladesh-registered merchant entity.** Bangladesh is not currently on Stripe's supported merchant-country list. An overseas Stripe account requires a genuine eligible entity and local banking/tax details; do not use a borrowed or nominee account.

## Provider comparison

| Provider | Bangladesh seller eligibility | Recurring billing | Best fit / caveat |
|---|---|---|---|
| Paddle | Bangladesh is not on Paddle's published unsupported supplier list; final eligibility is determined during onboarding | Yes, subscriptions are a supported SaaS billing model | Best first investigation for international software customers. Merchant-of-record service handles checkout and sales tax, but payout is not in BDT and fees are material. |
| bKash Tokenized Checkout | Requires bKash merchant integration/onboarding and credentials | Agreement-based repeat payments are available; subsequent payment still requires the customer PIN | Strong local-wallet option, but confirm whether Wavo's merchant category can be approved and what renewal schedule/consent rules apply. |
| SSLCOMMERZ | Local merchant onboarding and store credentials required | No public recurring API identified in its developer documentation | Good one-time checkout and manual renewal collection; verify every transaction server-side using IPN/validation. |
| Stripe | Bangladesh is not listed as a supported merchant country | Stripe Billing supports subscriptions in eligible countries | Not suitable for a Bangladesh-registered merchant without a genuinely eligible foreign entity. |

## Paddle: international SaaS

Paddle's supplier-country help page says it works with software businesses globally except for a published unsupported-country list; Bangladesh is not listed there. Its developer docs list Bangladesh as a supported sales country. Paddle also documents recurring subscription support and merchant-of-record tax handling.

Before implementing:
1. Apply for a Paddle seller account using the actual business/legal identity.
2. Confirm onboarding acceptance for Wavo's WhatsApp SaaS use case.
3. Confirm the available payout route for the business's Bangladesh bank account or Payoneer account.
4. Confirm the payout currency, conversion costs, reserve/hold policy, refund and chargeback terms.
5. Confirm the live account and webhook signing secret are issued.

Published pay-as-you-go pricing is **5% + $0.50 per checkout transaction** at the time of research. Paddle's payout help page describes monthly payouts, a minimum payout threshold of $100, and bank transfer or Payoneer options. Its listed payout currencies do not include BDT, so allow for conversion and bank fees.

Official sources:
- [Paddle supported supplier countries](https://www.paddle.com/help/start/account-verification/which-countries-are-supported-by-paddle)
- [Paddle supported sales countries](https://developer.paddle.com/concepts/sell/supported-countries-locales/)
- [Paddle subscription billing](https://www.paddle.com/help/start/intro-to-paddle/does-paddle-support-subscription-based-sales-models)
- [Paddle pricing](https://www.paddle.com/pricing)
- [Paddle payout schedule and methods](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid)
- [Paddle payout currencies](https://www.paddle.com/help/manage/get-paid/can-i-be-paid-in-my-local-currency)

## bKash: local agreement-based payments

bKash's official Tokenized Checkout terms explain that the customer links a bKash account with a merchant-held customer reference. On later payments, the wallet number and OTP are not re-entered, but the customer still confirms with their PIN. The official sandbox demonstrates creating an agreement, paying using an agreement, checking agreement status, and cancelling an agreement.

This is useful for a lower-friction renewal flow, but it should not be advertised as silent automatic monthly debit. Ask bKash in writing:
- Whether Wavo's business and SaaS category can use Tokenized Checkout / agreement-based payment.
- Whether the agreement can be charged on a merchant-defined monthly schedule, or whether each renewal requires the customer to initiate/confirm.
- What customer consent, cancellation, refund, webhook, and dispute requirements apply.
- Whether live API credentials and recurring-payment product access can be granted to Wavo.

Official sources:
- [bKash Tokenized Checkout terms](https://www.bkash.com/en/page/tokenized_checkout)
- [bKash official sandbox demo](https://merchantdemo.sandbox.bka.sh/tokenized-checkout/version/v2)
- [bKash developer portal](https://developer.bka.sh/docs)

## SSLCOMMERZ: one-time checkout

The public SSLCOMMERZ developer flow is:
1. Create a checkout session on the merchant server.
2. Redirect the customer to the hosted payment page.
3. Receive the IPN notification.
4. Validate the transaction, amount, currency, and status with the validation API before activating a plan.
5. Make the success/failure/cancel browser redirects informational only; never activate a plan solely because the browser returned to a success URL.

The public docs show one-time transaction sessions, IPN, and transaction validation. They do not describe a recurring subscription or stored-card mandate API. Ask SSLCOMMERZ sales/support if a private recurring facility exists for Wavo before treating it as a subscription processor.

Official sources:
- [SSLCOMMERZ developer documentation](https://developer.sslcommerz.com/doc/v4/)
- [SSLCOMMERZ gateway overview](https://sslcommerz.com/payment-gateway/)

## Stripe availability

Stripe's current global availability page does not list Bangladesh as a supported merchant country. Stripe's cross-country onboarding guidance also requires a real legal entity, tax ID, physical location, phone, ID, and bank account in the country where the account is opened. Do not create an account using another person's or an unrelated company's details.

Official sources:
- [Stripe global availability](https://stripe.com/global)
- [Stripe requirements for opening an account in another country](https://support.stripe.com/questions/requirements-to-open-a-stripe-account-in-another-country)

## Wavo implementation plan once a provider is approved

Keep provider-specific code behind a server-side payment adapter. Do not let a browser callback or a customer-editable amount activate a plan.

1. Create an immutable billing order with workspace, plan, billing period, currency, expected amount, and unique internal reference.
2. Create the provider checkout/subscription server-side; store provider customer, checkout, and subscription identifiers.
3. Verify webhook signatures and re-query payment status with the provider where supported.
4. Process each provider event idempotently; enforce workspace, order reference, amount, currency, and successful status.
5. Only then update the workspace subscription and record an audit event.
6. Handle renewals, failed payments, grace periods, cancellations, refunds, disputes, and provider-side subscription changes.
7. Keep an admin override with an audit trail for manual bank transfer and support cases.

**Current decision:** do not replace manual plan activation yet. First obtain provider approval and live/sandbox credentials. Paddle is the strongest first application for global SaaS subscriptions; bKash is the local-market follow-up if agreement-based renewal is approved.
