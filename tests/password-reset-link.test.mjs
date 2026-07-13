import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readResetCode, urlWithoutResetCode } from '../app/src/features/auth/resetLink.ts';
import { redactProviderError } from '../server/src/services/emailSender.ts';
import {
  RESET_QUERY_PARAM,
  passwordResetMailBody,
} from '../server/src/services/passwordResetService.ts';

// slice 183. The reset token is 64 hex characters; asking a person to copy that out of an email
// by hand is a UX failure bad enough that they abandon the account. So the mail leads with a
// link and the app reads the token out of the URL. Shortening the token instead would have been
// a security regression — `resetPassword` looks a token up by the token ALONE, with no email to
// scope it, so a 6-digit code could be guessed into whichever account had a reset pending.

const TOKEN = 'a'.repeat(64);
const BASE = 'https://homefix.example';

describe('passwordResetMailBody', () => {
  it('leads with a link the user can just click', () => {
    const body = passwordResetMailBody(TOKEN, BASE);
    assert.match(body, new RegExp(`https://homefix\\.example/\\?reset=${TOKEN}`));
  });

  it('still prints the code, so a stripped link does not strand anyone', () => {
    const body = passwordResetMailBody(TOKEN, BASE);
    // Mail clients strip links; people read mail on a device that is not the one with the app.
    assert.match(body, /enter this code: a{64}/);
  });

  it('degrades to the code-only mail when no app URL is configured', () => {
    const body = passwordResetMailBody(TOKEN, undefined);
    assert.match(body, /Use this code to reset your password: a{64}/);
    assert.doesNotMatch(body, /https?:\/\//);
  });

  it('says the code is single-use and expires', () => {
    assert.match(passwordResetMailBody(TOKEN, BASE), /expires in 1 hour and can only be used once/);
  });

  it('round-trips: the app reads back exactly the token the mail carried', () => {
    const body = passwordResetMailBody(TOKEN, BASE);
    const link = /https:\/\/\S+/.exec(body)?.[0] ?? '';
    assert.equal(readResetCode(new URL(link).search), TOKEN);
  });
});

describe('readResetCode', () => {
  it('reads the token from a query string', () => {
    assert.equal(readResetCode(`?${RESET_QUERY_PARAM}=${TOKEN}`), TOKEN);
  });

  it('ignores an absent or empty code rather than entering a reset with no token', () => {
    assert.equal(readResetCode(''), undefined);
    assert.equal(readResetCode('?payment=success'), undefined);
    assert.equal(readResetCode(`?${RESET_QUERY_PARAM}=`), undefined);
    assert.equal(readResetCode(`?${RESET_QUERY_PARAM}=%20%20`), undefined);
  });

  it('survives other parameters alongside it', () => {
    assert.equal(readResetCode(`?payment=success&${RESET_QUERY_PARAM}=${TOKEN}&x=1`), TOKEN);
  });
});

describe('urlWithoutResetCode', () => {
  // The token is a live credential: left in the address bar it goes into history, session
  // restore, and whatever gets pasted when someone shares "the page I'm on".
  it('drops the token', () => {
    const stripped = urlWithoutResetCode(`${BASE}/?${RESET_QUERY_PARAM}=${TOKEN}`);
    assert.doesNotMatch(stripped, /a{64}/);
    assert.doesNotMatch(stripped, new RegExp(RESET_QUERY_PARAM));
  });

  it('keeps the other parameters', () => {
    const stripped = urlWithoutResetCode(`${BASE}/x?a=1&${RESET_QUERY_PARAM}=${TOKEN}&b=2`);
    assert.equal(stripped, '/x?a=1&b=2');
  });
});

// SEC-0009: the token now also appears inside a URL. The redaction must still catch it — a
// provider echoing our mail back would otherwise put a working reset link in the log.
describe('SEC-0009: a token inside a link is still redacted from provider errors', () => {
  it('strips the token even when it is embedded in the URL', () => {
    const body = passwordResetMailBody(TOKEN, BASE);
    const message = { channel: 'email', userId: 'u-1', to: 'user@example.com', subject: 's', body };

    const echoed = `422: could not send {"text":"${body}"}`;
    const safe = redactProviderError(echoed, message);

    assert.doesNotMatch(safe, /a{32,}/);
    assert.doesNotMatch(safe, /user@example\.com/);
    assert.match(safe, /422/);
  });
});
