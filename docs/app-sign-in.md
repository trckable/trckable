---
title: "Signing in from the app"
description: "A six-digit code by email, a sign-in of its own for each phone, and how to remove one."
---

The trckable app signs in the way a code-by-email service does: type your
email, get a six-digit code, type it in. No password to remember on the phone.

## How it works

1. The app asks the server for a code for your email (`POST /api/v1/login/code`).
   The answer is the same whether or not the address belongs to anyone, so it
   says nothing about who has an account.
2. The server emails the code. It works for 10 minutes, five wrong tries end
   it, and asking again replaces it.
3. The app sends the code back (`POST /api/v1/login/code/verify`) with the name
   and platform of the phone. The server answers a long token that only this
   phone holds. The app sends it as `Authorization: Bearer <token>`.

If you have two-step sign-in on, the code alone is not enough: the server asks
for the six digits from your authenticator app too (`second_code`), and the
emailed code stays good until you have given it.

## Servers without email

Codes need the same mail setup as alert and report emails (`TRCKABLE_SMTP_URL`
or `TRCKABLE_RESEND_KEY`). The server's setup answer (`GET /api/v1/setup`) says
`email_codes: true` when it can send them. On a server that cannot, the app asks
for your password instead (`POST /api/v1/login`, with the same `device` field,
answers a token the same way).

## Devices

Each phone has its own sign-in. Under Account, in Sign-in and security, you see
every phone signed in (its name, platform and when it was last used) and can
remove one. It is signed out at once. The same is available as
`GET /api/v1/me/devices` and `DELETE /api/v1/me/devices/{id}`.

A phone's token acts as you, with your role, until it is removed. Removing a
person, or setting a new password for them, signs out their phones too. API keys
are not devices and cannot list or remove them.
