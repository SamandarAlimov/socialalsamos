# Alsamos registration contact-data contract

Alsamos registration requires all of the following: full name, username, a real contact email address, a phone number, and a password.

The real email address is required account/contact data. It is **not** used as the public Alsamos login identifier and registration must not depend on an email-confirmation link. The hosted Supabase Auth credential remains an internal `username@alsamos.com` address created and confirmed server-side.

The phone number is also required. It is normalized to E.164 before persistence and is retained as identity data so contact-based user discovery/suggestions can match normalized phone contacts on the server without exposing the full identity table to clients.

Public login remains username or phone. Password recovery by synthetic `@alsamos.com` mailbox is intentionally disabled until a dedicated recovery flow exists.
