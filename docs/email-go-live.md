# Email Go-Live Runbook

Until this is done, **`POST /auth/forgot-password` sends nothing.** With `EMAIL_*` unset the
email channel falls back to the inert sender, and since SEC-0009 it does not log the token
either (rightly — that was an account-takeover hole). So a user who forgets their password
today has **no way back into their account at all**. This is the top blocker on
`docs/go-live-checklist.md`, and it is pure configuration: no code change is needed.

_Verified against Resend's API on 2026-07-13. Provider APIs move; if these steps don't match
what you see, fix this doc rather than working around it._

## What the config switches on

Two separate things, and they are independent — this trips people up:

| Setting                                          | Switches on                                                |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `EMAIL_API_URL` + `EMAIL_API_KEY` + `EMAIL_FROM` | **Password-reset mail.** Nothing else is required.         |
| `NOTIFY_CHANNELS=email` (in addition)            | Email for ordinary notifications (job accepted, quote, …). |

`passwordResetService` resolves its sender directly from `EMAIL_*` and does **not** consult
`NOTIFY_CHANNELS`. So setting the three `EMAIL_*` values alone fixes the blocker; adding
`email` to `NOTIFY_CHANNELS` is a separate, optional decision about notification noise.

All three `EMAIL_*` values must be present. Set two of three and the channel silently stays
inert — there is no half-configured mode.

## Why no adapter is needed

`createHttpEmailSender` POSTs a deliberately lowest-common-denominator payload:

```
POST <EMAIL_API_URL>
Authorization: Bearer <EMAIL_API_KEY>
Content-Type: application/json

{ "from": "<EMAIL_FROM>", "to": "…", "subject": "…", "text": "…" }
```

That is **exactly** Resend's send API, so Resend needs no adapter of its own. Any provider
accepting the same shape (bearer key, `{from,to,subject,text}`) works too; anything else needs
a sender in `server/src/services/` alongside `emailSender.ts`.

## Procedure (Resend)

### 1. Get a key

1. Create a Resend account → **API Keys** → create one. It starts `re_…`.
2. **Verify a sending domain** (Domains → add your domain → add the DNS records). Until a
   domain is verified you can only send **from** `onboarding@resend.dev`, and only **to** the
   address you signed up with. That is enough to prove the loop works; it is not enough to
   ship.

### 2. Set the variables and redeploy

```
EMAIL_API_URL=https://api.resend.com/emails
EMAIL_API_KEY=re_...
EMAIL_FROM=HomeFix <noreply@your-verified-domain>
APP_PUBLIC_BASE_URL=https://<your-host>
```

`APP_PUBLIC_BASE_URL` is what turns the mail into a **clickable link** (`/?reset=<token>`)
instead of a 64-character code the user has to copy by hand. Leave it unset and the flow still
works — it is just tedious enough that people give up and lose the account. Set it.

`EMAIL_FROM` accepts a bare address (`noreply@homefix.app`) or the display-name form
(`HomeFix <noreply@homefix.app>`). Before testing, use Resend's shared sender:

```
EMAIL_FROM=onboarding@resend.dev
```

Never commit the key. It lives in the platform's variables only.

### 3. Prove the loop

Not "the variables are set" — **the mail arrived and the password changed**:

1. Use the app's **Forgot password** link with your own address.
2. The mail arrives. **Click the link in it.** The app opens on the new-password step with the
   code already applied — you should never have to type it.
3. Set a new password.
4. **Log in with the new password.** Old sessions are gone — `resetPassword` bumps
   `token_version`, so every existing session for that user is revoked. That is intended.

Tick the checklist item only after step 4.

## Why the code is 64 characters, and why it is not a 6-digit number

The obvious "improvement" is a friendly 6-digit code. It would be a **security regression**,
and the reason is worth writing down so nobody re-proposes it.

`resetPassword` looks a token up **by the token alone** (`findByTokenHash`) — there is no email
alongside it to scope the lookup. So an attacker does not have to target anyone: they guess
codes, and a hit resets **whichever account happened to have that reset pending**. With a
6-digit code there are only a million possibilities, and every additional user with a pending
reset _improves_ the attacker's odds. A short code is only safe when it is bound to one account
and killed after a handful of wrong guesses — and this flow does neither.

So the entropy stays, and the burden is removed the other way: the mail leads with a **link**,
and the app takes the code out of the URL for you. Full entropy, zero typing. That is the same
trade every mature product landed on.

Two consequences, both handled:

- The URL is now a secret. The app **strips it from the address bar** the moment it reads it
  (`replaceState`, so Back cannot restore it), and the server sends **`Referrer-Policy:
no-referrer`** — otherwise the Google Maps SDK on the page would receive the whole URL,
  token included, as a `Referer`.
- The code is **still printed** under the link. Mail clients strip links, and people read mail
  on a device that is not the one running the app. A reset flow with no fallback strands people.

### 4. Optional: email for ordinary notifications

Add `email` to `NOTIFY_CHANNELS`. Consider what that means for volume before you do —
every notification the app already records becomes a mail.

## When it doesn't work

The endpoint returns **204 regardless** — it must not reveal whether an account exists — so
the response tells you nothing. **The log is the only signal**, and since slice 182 it carries
one:

```json
{
  "level": "error",
  "msg": "Password-reset email failed to send",
  "channel": "email",
  "userId": "…",
  "reason": "Email provider responded 403: The … domain is not verified."
}
```

Search the logs for `Password-reset email failed to send`. The `reason` carries the
provider's own explanation. Common ones:

- **403 / "domain is not verified"** — the most common day-one failure. Either finish DNS
  verification, or set `EMAIL_FROM=onboarding@resend.dev` while testing.
- **403 / "You can only send testing emails to your own address"** — Resend's unverified-domain
  restriction. Send to the address you registered with, or verify the domain.
- **401** — bad or revoked key.
- **422** — malformed `from`. Check `EMAIL_FROM`.

**Nothing in the log at all?** Then the sender was never called: `EMAIL_*` did not reach the
server (all three are required), so the inert sender ran and there was nothing to fail.

Note the `reason` is **redacted** (`redactProviderError`): the recipient address and the mail
body are stripped before it is logged, because the body _is_ the plaintext reset token and
some providers echo your request back inside their error. You get the provider's explanation
and none of the secret. See SEC-0009.

## Guardrails

- Never commit an `EMAIL_API_KEY`; platform variables only.
- **`NOTIFY_LOG_BODY` must stay unset.** It logs the recipient and the full mail body — i.e.
  the reset token. `env.ts` refuses to boot in production with it on (SEC-0009).
- Failure is best-effort by design: a provider outage logs an error and still returns 204. It
  never fails the request, and it never reveals whether the address has an account.
